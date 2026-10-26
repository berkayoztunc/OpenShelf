import { z } from "zod";
import { META_EVENT_MAP, type TrackEvent } from "@openshelf/shared";
import type {
  AdapterDeps, AdapterFactory, HealthResult, IntegrationCredentials, IntegrationManifest,
  ServerEventContext, ServerEventSink,
} from "@openshelf/integration-sdk";
import { hashEmail, hashExternalId, hashPhone } from "./hash";
import { DEFAULT_API_VERSION, assertAllowed, eventsUrl, pixelUrl } from "./endpoints";

export const metaConfigSchema = z.object({
  config: z.object({
    pixelId: z.string().regex(/^\d{5,20}$/, "Pixel/Dataset ID must be numeric"),
    apiVersion: z.string().regex(/^v\d+\.\d+$/).default(DEFAULT_API_VERSION),
    testEventCode: z.string().max(64).optional().or(z.literal("")),
  }),
  secrets: z.object({ accessToken: z.string().min(20) }),
});
export type MetaConfig = z.infer<typeof metaConfigSchema>;

export const manifest: IntegrationManifest = {
  id: "meta",
  name: "Meta Pixel & Conversions API",
  description: "Server-side conversion events (CAPI) with browser Pixel deduplication and catalog feed.",
  docsUrl: "https://developers.facebook.com/docs/marketing-api/conversions-api",
  publicFields: [
    { key: "pixelId", label: "Pixel / Dataset ID", required: true, type: "text", placeholder: "1234567890" },
    { key: "apiVersion", label: "Graph API version", type: "text", placeholder: DEFAULT_API_VERSION },
    { key: "testEventCode", label: "Test event code", type: "text", help: "Leave empty in production. Events with a code show only in Events Manager > Test events." },
  ],
  secretFields: [
    { key: "accessToken", label: "Conversions API access token", secret: true, required: true, type: "password" },
  ],
  schema: metaConfigSchema,
};

export interface MetaUserData {
  em?: string[]; ph?: string[]; external_id?: string[];
  client_ip_address?: string; client_user_agent?: string; fbc?: string; fbp?: string;
}

export async function buildUserData(ctx: ServerEventContext): Promise<MetaUserData> {
  const u: MetaUserData = {};
  if (ctx.email) u.em = [await hashEmail(ctx.email)];
  if (ctx.phone) { const p = await hashPhone(ctx.phone); u.ph = [p]; }
  if (ctx.externalId) u.external_id = [await hashExternalId(ctx.externalId)];
  if (ctx.ip) u.client_ip_address = ctx.ip;
  if (ctx.userAgent) u.client_user_agent = ctx.userAgent;
  if (ctx.fbc) u.fbc = ctx.fbc;
  if (ctx.fbp) u.fbp = ctx.fbp;
  return u;
}

export async function buildCapiEvent(event: TrackEvent, ctx: ServerEventContext, nowMs: number) {
  const name = META_EVENT_MAP[event.name];
  if (!name) return null;
  const custom: Record<string, unknown> = {};
  if (event.currency) custom.currency = event.currency.toUpperCase();
  if (event.value !== undefined) custom.value = event.value;
  if (event.items?.length) {
    custom.content_type = "product";
    custom.content_ids = event.items.map((i) => i.id); // variant ids == feed ids
    custom.contents = event.items.map((i) => ({ id: i.id, quantity: i.quantity, item_price: i.price }));
    custom.num_items = event.items.reduce((n, i) => n + i.quantity, 0);
  }
  if (event.transaction_id) custom.order_id = event.transaction_id;
  if (event.search_term) custom.search_string = event.search_term;
  return {
    event_name: name,
    event_time: Math.floor(nowMs / 1000),
    event_id: event.event_id, // same id as browser Pixel => dedup
    action_source: "website",
    event_source_url: event.page_url ?? ctx.sourceUrl,
    user_data: await buildUserData(ctx),
    custom_data: custom,
  };
}

export class MetaCapiSink implements ServerEventSink {
  readonly id = "meta" as const;
  private cfg: MetaConfig["config"];
  private token: string;
  constructor(creds: IntegrationCredentials, private deps: AdapterDeps) {
    const parsed = metaConfigSchema.parse({ config: creds.config, secrets: creds.secrets });
    this.cfg = parsed.config;
    this.token = parsed.secrets.accessToken;
  }
  async validateConfig(): Promise<void> { /* parsed in constructor */ }

  async healthCheck(): Promise<HealthResult> {
    const url = pixelUrl(this.cfg.apiVersion, this.cfg.pixelId);
    try {
      assertAllowed(url);
      const res = await this.deps.fetch(url, { headers: { authorization: `Bearer ${this.token}` } });
      if (res.ok) return { ok: true, detail: "pixel reachable" };
      return { ok: false, detail: await errorDetail(res) };
    } catch (e) {
      return { ok: false, detail: e instanceof Error ? e.message : "network error" };
    }
  }

  async send(event: TrackEvent, ctx: ServerEventContext): Promise<{ ok: boolean; detail?: string }> {
    const data = await buildCapiEvent(event, ctx, this.deps.now().getTime());
    if (!data) return { ok: true, detail: "unmapped_event" };
    const url = eventsUrl(this.cfg.apiVersion, this.cfg.pixelId);
    assertAllowed(url);
    const body: Record<string, unknown> = { data: [data] };
    if (this.cfg.testEventCode) body.test_event_code = this.cfg.testEventCode;
    const res = await this.deps.fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${this.token}` },
      body: JSON.stringify(body),
    });
    if (res.ok) return { ok: true };
    const detail = await errorDetail(res);
    // 4xx other than 429 are permanent (bad token/pixel/payload): do not hammer retries.
    const permanent = res.status >= 400 && res.status < 500 && res.status !== 429;
    return { ok: false, detail: permanent ? `permanent:${detail}` : detail };
  }
}

async function errorDetail(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as { error?: { message?: string; code?: number } };
    return `HTTP ${res.status}${j.error?.message ? `: ${j.error.message}` : ""}`.slice(0, 300);
  } catch { return `HTTP ${res.status}`; }
}

export const factory: AdapterFactory<MetaCapiSink> = {
  manifest,
  create: (creds, deps) => new MetaCapiSink(creds, deps),
};

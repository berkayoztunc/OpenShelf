import { z } from "zod";
import type { TrackEvent } from "@openshelf/shared";
import type {
  AdapterDeps, AdapterFactory, HealthResult, IntegrationCredentials, IntegrationManifest,
  ServerEventContext, ServerEventSink,
} from "@openshelf/integration-sdk";
import { assertAllowed, collectUrl, debugUrl } from "./endpoints";

export const ga4ConfigSchema = z.object({
  config: z.object({ measurementId: z.string().regex(/^G-[A-Z0-9]{4,20}$/, "Expected G-XXXXXXXXXX") }),
  secrets: z.object({ apiSecret: z.string().min(8) }),
});

export const manifest: IntegrationManifest = {
  id: "ga4",
  name: "Google Analytics 4 (Measurement Protocol)",
  description: "Server-side purchase events via GA4 Measurement Protocol.",
  docsUrl: "https://developers.google.com/analytics/devguides/collection/protocol/ga4",
  publicFields: [{ key: "measurementId", label: "Measurement ID", required: true, type: "text", placeholder: "G-XXXXXXXXXX" }],
  secretFields: [{ key: "apiSecret", label: "Measurement Protocol API secret", secret: true, required: true, type: "password" }],
  schema: ga4ConfigSchema,
};

export function buildGa4Payload(event: TrackEvent, clientId: string, nowMs: number) {
  const params: Record<string, unknown> = { event_id: event.event_id, engagement_time_msec: 1 };
  if (event.currency) params.currency = event.currency.toUpperCase();
  if (event.value !== undefined) params.value = event.value;
  if (event.transaction_id) params.transaction_id = event.transaction_id;
  if (event.search_term) params.search_term = event.search_term;
  if (event.page_url) params.page_location = event.page_url;
  if (event.items?.length) {
    params.items = event.items.map((i) => ({
      item_id: i.id, item_name: i.name, price: i.price, quantity: i.quantity,
      ...(i.category ? { item_category: i.category } : {}), ...(i.variant ? { item_variant: i.variant } : {}),
    }));
  }
  return { client_id: clientId, timestamp_micros: nowMs * 1000, events: [{ name: event.name, params }] };
}

export class Ga4MpSink implements ServerEventSink {
  readonly id = "ga4" as const;
  private measurementId: string;
  private apiSecret: string;
  constructor(creds: IntegrationCredentials, private deps: AdapterDeps) {
    const p = ga4ConfigSchema.parse({ config: creds.config, secrets: creds.secrets });
    this.measurementId = p.config.measurementId;
    this.apiSecret = p.secrets.apiSecret;
  }
  async validateConfig(): Promise<void> { /* parsed in constructor */ }

  async healthCheck(): Promise<HealthResult> {
    const url = debugUrl(this.measurementId, this.apiSecret);
    try {
      assertAllowed(url);
      const body = buildGa4Payload(
        { event_id: "00000000-0000-4000-8000-000000000000", name: "page_view" }, "healthcheck.0", this.deps.now().getTime(),
      );
      const res = await this.deps.fetch(url, { method: "POST", body: JSON.stringify(body) });
      if (!res.ok) return { ok: false, detail: `HTTP ${res.status}` };
      const j = (await res.json()) as { validationMessages?: { description?: string; validationCode?: string }[] };
      const msgs = j.validationMessages ?? [];
      if (msgs.length === 0) return { ok: true, detail: "payload validated" };
      return { ok: false, detail: msgs.map((m) => m.validationCode ?? m.description ?? "invalid").join(", ").slice(0, 300) };
      // NOTE: the debug endpoint does NOT validate the api_secret itself; a wrong secret is only detectable by missing data in GA.
    } catch (e) {
      return { ok: false, detail: e instanceof Error ? e.message : "network error" };
    }
  }

  async send(event: TrackEvent, ctx: ServerEventContext): Promise<{ ok: boolean; detail?: string }> {
    if (!ctx.gaClientId) return { ok: false, detail: "permanent:missing_client_id" };
    const url = collectUrl(this.measurementId, this.apiSecret);
    assertAllowed(url);
    const res = await this.deps.fetch(url, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify(buildGa4Payload(event, ctx.gaClientId, this.deps.now().getTime())),
    });
    if (res.ok) return { ok: true };
    const permanent = res.status >= 400 && res.status < 500 && res.status !== 429;
    return { ok: false, detail: `${permanent ? "permanent:" : ""}HTTP ${res.status}` };
  }
}

export const factory: AdapterFactory<Ga4MpSink> = { manifest, create: (c, d) => new Ga4MpSink(c, d) };

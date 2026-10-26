import { z } from "zod";
import type { OrderStatus } from "@openshelf/shared";
import type {
  AdapterDeps, AdapterFactory, HealthResult, IntegrationCredentials, IntegrationManifest,
  MarketplaceOrder, MarketplaceProvider, MarketplaceStockUpdate,
} from "@openshelf/integration-sdk";
import type { TrendyolCallBody, TrendyolCallResult, TrendyolEnv, TrendyolOperation } from "@openshelf/shared";
import {
  MAX_INVENTORY_BATCH, MAX_ORDER_WINDOW_MS, MAX_QUANTITY, ORDER_PAGE_SIZE, alternativeDeliveryPath, assertAllowed,
  batchResultPath, hostFor, inventoryUpdatePath, shipmentPackagesPath, shipmentPackagesStreamPath,
} from "./endpoints";
import { mapTrendyolStatus } from "./status";
import { basicAuth, runCall, userAgentFor } from "./console";

export const trendyolConfigSchema = z.object({
  config: z.object({
    supplierId: z.string().regex(/^\d{3,12}$/, "Numeric Supplier/Seller ID"),
    /** docs/3-prod-stage-environments-1: stage = stageapigw.trendyol.com, needs IP whitelisting + different credentials. */
    environment: z.enum(["production", "stage"]).default("production"),
  }),
  secrets: z.object({
    apiKey: z.string().min(4), apiSecret: z.string().min(4),
    webhookUsername: z.string().optional(), webhookPassword: z.string().optional(),
  }),
});
export type TrendyolCreds = z.infer<typeof trendyolConfigSchema>;

export const manifest: IntegrationManifest = {
  id: "trendyol",
  name: "Trendyol Marketplace",
  description: "Stock/price push, order import and shipment updates for your Trendyol seller account (Trendyol Express not assumed).",
  docsUrl: "https://developers.trendyol.com/",
  publicFields: [
    { key: "supplierId", label: "Supplier (Seller) ID", required: true, type: "text" },
    {
      key: "environment", label: "Environment", type: "select",
      options: [{ value: "production", label: "Production" }, { value: "stage", label: "Stage (test)" }],
      help: "Default production. Stage needs Trendyol-side IP whitelisting (503 = not whitelisted) and uses DIFFERENT API credentials than production.",
    },
  ],
  secretFields: [
    { key: "apiKey", label: "API key", secret: true, required: true, type: "password" },
    { key: "apiSecret", label: "API secret", secret: true, required: true, type: "password" },
    { key: "webhookUsername", label: "Webhook username (Basic auth)", secret: true, type: "password", help: "Configured when registering the Trendyol webhook." },
    { key: "webhookPassword", label: "Webhook password", secret: true, type: "password" },
  ],
  schema: trendyolConfigSchema,
};

export type TrendyolDeps = AdapterDeps & { sleep?: (ms: number) => Promise<void> };

export class TrendyolError extends Error {
  constructor(public status: number, message: string) { super(message); }
  get retryable() { return this.status === 429 || this.status >= 500; }
}

function b64(s: string) { return btoa(s); }
/** Max retries for 429 (docs: 50 req / 10 s per endpoint -> `too.many.requests`). */
const MAX_429_RETRIES = 3;
const retryAfterMs = (h: string | null, attempt: number) => {
  const n = Number(h);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 30) * 1000 : Math.min(10_000, 1000 * 2 ** attempt);
};
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export function mapPackage(p: any): MarketplaceOrder {
  const addr = p.shipmentAddress ?? {};
  const minor = (n: unknown) => Math.round(Number(n ?? 0) * 100);
  const id = p.shipmentPackageId ?? p.id; // docs: `id` equals the package id; orderNumber is the parent order
  return {
    externalId: String(id),
    status: mapTrendyolStatus(String(p.status ?? p.shipmentPackageStatus ?? "")) as OrderStatus,
    placedAt: new Date(Number(p.orderDate ?? p.lastModifiedDate ?? Date.now())).toISOString(),
    total: minor(p.packageTotalPrice ?? p.totalPrice ?? p.packageGrossAmount ?? p.grossAmount), // minor units
    currency: p.currencyCode ?? "TRY",
    customer: {
      name: addr.fullName ?? ([addr.firstName, addr.lastName].filter(Boolean).join(" ") || [p.customerFirstName, p.customerLastName].filter(Boolean).join(" ")),
      email: p.customerEmail || undefined, phone: addr.phone || undefined,
      address: [addr.address1, addr.address2, addr.district].filter(Boolean).join(" "), city: addr.city ?? "",
    },
    lines: (p.lines ?? []).map((l: any) => ({
      sku: String(l.merchantSku ?? l.stockCode ?? l.barcode ?? ""), barcode: l.barcode ? String(l.barcode) : undefined,
      quantity: Number(l.quantity ?? 1), unitPrice: minor(l.lineUnitPrice ?? l.price ?? l.amount),
    })),
  };
}

export class TrendyolProvider implements MarketplaceProvider {
  readonly id = "trendyol" as const;
  private sid: string; private auth: string; private ua: string; private env: TrendyolEnv;
  private sleep: (ms: number) => Promise<void>;
  private creds: TrendyolCreds;
  constructor(c: IntegrationCredentials, private deps: TrendyolDeps) {
    this.creds = trendyolConfigSchema.parse({ config: c.config, secrets: c.secrets });
    this.sid = this.creds.config.supplierId;
    this.env = this.creds.config.environment;
    this.auth = basicAuth(this.creds.secrets.apiKey, this.creds.secrets.apiSecret);
    this.ua = userAgentFor(this.sid); // docs/authorization: "<sellerId> - SelfIntegration"; missing User-Agent => 403
    this.sleep = deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }
  async validateConfig(): Promise<void> {}

  private async call(method: string, path: string, body?: unknown): Promise<any> {
    const url = hostFor(this.env) + path;
    assertAllowed(url);
    for (let attempt = 0; ; attempt++) {
      const res = await this.deps.fetch(url, {
        method,
        headers: { authorization: this.auth, "user-agent": this.ua, "content-type": "application/json", accept: "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (res.status === 429 && attempt < MAX_429_RETRIES) { await this.sleep(retryAfterMs(res.headers.get("retry-after"), attempt)); continue; }
      if (!res.ok) throw new TrendyolError(res.status, `Trendyol HTTP ${res.status}`);
      const text = await res.text();
      return text ? JSON.parse(text) : {};
    }
  }

  /** API console: runs one catalog operation against this account's host. Credentials never appear in the result. */
  consoleCall(op: TrendyolOperation, call: Pick<TrendyolCallBody, "path" | "query" | "body">): Promise<TrendyolCallResult> {
    return runCall({ fetch: this.deps.fetch }, { sellerId: this.sid, apiKey: this.creds.secrets.apiKey, apiSecret: this.creds.secrets.apiSecret }, this.env, op, call);
  }

  async healthCheck(): Promise<HealthResult> {
    try {
      const end = this.deps.now().getTime();
      await this.call("GET", `${shipmentPackagesStreamPath(this.sid)}?lastModifiedStartDate=${end - 3600_000}&lastModifiedEndDate=${end}&size=1`);
      return { ok: true };
    } catch (e) { return { ok: false, detail: e instanceof Error ? e.message : "error" }; }
  }

  async pushStockAndPrice(updates: MarketplaceStockUpdate[]) {
    const errors: string[] = []; let lastBatch: string | undefined;
    const valid = updates.filter((u) => {
      if (!u.barcode) { errors.push(`${u.sku}: missing barcode`); return false; }
      return true;
    });
    for (let i = 0; i < valid.length; i += MAX_INVENTORY_BATCH) {
      const chunk = valid.slice(i, i + MAX_INVENTORY_BATCH);
      const items = chunk.map((u) => ({
        barcode: u.barcode!, quantity: Math.max(0, Math.min(MAX_QUANTITY, Math.floor(u.quantity))),
        ...(u.price !== undefined ? { salePrice: u.price, listPrice: u.price } : {}),
      }));
      const r = await this.call("POST", inventoryUpdatePath(this.sid), { items });
      const batchId = r.batchRequestId as string | undefined;
      if (!batchId) { errors.push("no batchRequestId"); continue; }
      lastBatch = batchId;
      errors.push(...(await this.pollBatch(batchId)));
    }
    return { ok: errors.length === 0, batchId: lastBatch, ...(errors.length ? { errors } : {}) };
  }

  private async pollBatch(batchId: string): Promise<string[]> {
    for (let attempt = 1; attempt <= 5; attempt++) {
      const r = await this.call("GET", batchResultPath(this.sid, batchId));
      const items: any[] = r.items ?? [];
      const done = String(r.status ?? "").toUpperCase() === "COMPLETED" || (items.length > 0 && items.every((x) => x.status !== "IN_PROGRESS" && x.status !== "PENDING"));
      if (done) {
        return items.filter((x) => String(x.status).toUpperCase() === "FAILED")
          .map((x) => `${x.requestItem?.barcode ?? "?"}: ${(x.failureReasons ?? []).join("; ") || "failed"}`);
      }
      await this.sleep(500 * attempt);
    }
    return []; // still processing; batchId returned to caller for later inspection
  }

  /**
   * Reconciliation uses the cursor stream endpoint (getShipmentPackagesStream): the cursor is Trendyol's opaque nextCursor and is
   * only valid together with the same filters, so the window is derived from `since` (capped at 2 weeks back from now).
   * Order is lastModifiedDate DESC; the caller upserts idempotently so order does not matter.
   */
  async fetchOrders(since: Date, cursor?: string) {
    const end = this.deps.now().getTime();
    const start = Math.max(since.getTime(), end - MAX_ORDER_WINDOW_MS);
    const q = new URLSearchParams({ lastModifiedStartDate: String(start), lastModifiedEndDate: String(end), size: String(ORDER_PAGE_SIZE) });
    if (cursor) q.set("nextCursor", cursor);
    const r = await this.call("GET", `${shipmentPackagesStreamPath(this.sid)}?${q}`);
    // "Awaiting" packages are inventory-only (docs): never import them as orders.
    const content: any[] = (r.content ?? []).filter((p: any) => String(p.status ?? p.shipmentPackageStatus) !== "Awaiting");
    return { orders: content.map(mapPackage) as MarketplaceOrder[], ...(r.hasMore && r.nextCursor ? { nextCursor: String(r.nextCursor) } : {}) };
  }

  /**
   * processAlternativeDelivery: PUT { isPhoneNumber, trackingInfo, params }; Trendyol then sets the package to "Shipped".
   * trackingInfo must be a cargo tracking LINK (or a phone number), so a bare tracking number is rejected here.
   * Trendyol Express / contracted carriers need no call (the package moves automatically).
   */
  async updateShipment(externalId: string, t: { carrier: string; trackingNumber: string }) {
    const info = t.trackingNumber.trim();
    const isPhone = /^\+?[0-9 ]{10,15}$/.test(info);
    if (!isPhone && !/^https?:\/\//i.test(info)) return { ok: false };
    await this.call("PUT", alternativeDeliveryPath(this.sid, externalId), { isPhoneNumber: isPhone, trackingInfo: info, params: {} });
    return { ok: true };
  }

  /** Webhooks authenticate with the Basic (username/password) or API-key credentials chosen at registration (docs/webhook-create; API_KEY type would arrive as `x-api-key`, not supported here: register with BASIC_AUTHENTICATION). */
  async verifyWebhook(request: Request, rawBody: string): Promise<MarketplaceOrder | null> {
    const { webhookUsername: u, webhookPassword: p } = this.creds.secrets;
    if (!u || !p) throw new Error("trendyol webhook credentials not configured");
    const got = request.headers.get("authorization") ?? "";
    if (!safeEqual(got, `Basic ${b64(`${u}:${p}`)}`)) throw new Error("trendyol webhook: invalid credentials");
    let body: any;
    try { body = JSON.parse(rawBody); } catch { throw new Error("trendyol webhook: invalid JSON"); }
    if (!body || (body.shipmentPackageId === undefined && body.id === undefined)) return null;
    return mapPackage(body);
  }
}

export const factory: AdapterFactory<TrendyolProvider> = { manifest, create: (c, d) => new TrendyolProvider(c, d as TrendyolDeps) };

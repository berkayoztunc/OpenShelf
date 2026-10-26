import { z } from "zod";
import type {
  AdapterDeps, AdapterFactory, HealthResult, IntegrationCredentials, IntegrationManifest, ShipmentInput, ShipmentResult,
  ShippingProvider, ShippingQuote, TrackingStatus,
} from "@openshelf/integration-sdk";
import { ALLOWED_HOSTS, BASE_URL, paths } from "./endpoints";

export { jobHandlers, createShipmentHandler, drizzleShipmentRepo } from "./jobs";
export type { JobHandler, ShipmentRepo } from "./jobs";

export const configSchema = z.object({
  config: z.object({
    test: z.boolean().default(true), // Geliver test mode: free test shipments
    senderAddressId: z.string().min(1),
    returnAddressId: z.string().optional(),
    storeUrl: z.string().url().default("https://openshelf.local"),
    defaultDimensionsCm: z.object({ length: z.number().positive(), width: z.number().positive(), height: z.number().positive() }).default({ length: 10, width: 10, height: 10 }),
  }),
  secrets: z.object({ apiToken: z.string().min(8) }),
});
type Parsed = z.infer<typeof configSchema>;

export const manifest: IntegrationManifest = {
  id: "geliver", name: "Geliver", description: "Çoklu kargo firması: teklif, etiket, takip, iptal.", docsUrl: "https://docs.geliver.io",
  publicFields: [
    { key: "test", label: "Test modu (ücretsiz test gönderileri)", type: "boolean" },
    { key: "senderAddressId", label: "Gönderici adres ID (Geliver)", type: "text", required: true },
    { key: "returnAddressId", label: "İade adres ID", type: "text" },
    { key: "storeUrl", label: "Mağaza URL", type: "url" },
  ],
  secretFields: [{ key: "apiToken", label: "API Token", secret: true, required: true, type: "password" }],
  schema: configSchema,
};

export class GeliverError extends Error {
  constructor(message: string, public code?: string) { super(message); this.name = "GeliverError"; }
}

const toMinor = (v: unknown) => Math.round(Number(v) * 100);
const cur = (c: string) => (c === "TL" ? "TRY" : c);

export class GeliverAdapter implements ShippingProvider {
  readonly id = "geliver" as const;
  constructor(private p: Parsed, private deps: AdapterDeps) {
    if (!ALLOWED_HOSTS.includes(new URL(BASE_URL).hostname)) throw new GeliverError("host not allowlisted");
  }
  async validateConfig() { configSchema.parse({ config: this.p.config, secrets: this.p.secrets }); }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async call(method: string, path: string, body?: unknown): Promise<any> {
    const res = await this.deps.fetch(BASE_URL + path, {
      method,
      headers: { Authorization: `Bearer ${this.p.secrets.apiToken}`, Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    let j: any;
    try { j = await res.json(); } catch { throw new GeliverError(`geliver HTTP ${res.status}: non-JSON`); }
    if (!res.ok || j?.result === false) throw new GeliverError(`geliver error: ${j?.additionalMessage ?? j?.message ?? res.status}`, j?.code);
    return j;
  }

  async healthCheck(): Promise<HealthResult> {
    try { await this.call("GET", paths.address(this.p.config.senderAddressId)); return { ok: true }; }
    catch (e) { return { ok: false, detail: (e as Error).message }; }
  }

  private dims(input: ShipmentInput) {
    const weight = Math.max(0.1, input.parcels.reduce((s, x) => s + x.weightKg, 0));
    const desi = input.parcels.reduce((s, x) => s + (x.desi ?? 0), 0);
    const d = this.p.config.defaultDimensionsCm;
    if (desi > 0) { const e = Math.max(1, Math.round(Math.cbrt(desi * 3000))); return { length: e, width: e, height: e, weight }; } // desi = LxWxH/3000
    return { ...d, weight };
  }

  async quote(input: ShipmentInput): Promise<ShippingQuote[]> {
    const d = this.dims(input);
    const q = new URLSearchParams({ paramType: "parcel", length: String(d.length), width: String(d.width), height: String(d.height), weight: String(d.weight) });
    const j = await this.call("GET", `${paths.priceList}?${q}`);
    const out: ShippingQuote[] = [];
    for (const row of j.priceList ?? []) for (const o of row.offers ?? []) {
      out.push({ carrier: o.providerCode, serviceId: o.providerServiceCode, price: toMinor(o.totalAmount ?? o.amount), currency: cur(o.currency) });
    }
    return out;
  }

  async createShipment(input: ShipmentInput, serviceId: string): Promise<ShipmentResult> {
    const d = this.dims(input), r = input.recipient;
    const cod = (input.codAmount ?? 0) > 0;
    const j = await this.call("POST", paths.transactions, {
      providerServiceCode: serviceId,
      shipment: {
        test: this.p.config.test,
        senderAddressID: this.p.config.senderAddressId,
        ...(this.p.config.returnAddressId ? { returnAddressID: this.p.config.returnAddressId } : {}),
        recipientAddress: {
          name: r.name, ...(r.email ? { email: r.email } : {}), phone: r.phone, address1: r.address, countryCode: "TR",
          ...(/^\d+$/.test(r.city) ? { cityCode: r.city } : { cityName: r.city }),
          ...(r.district ? { districtName: r.district } : {}), ...(r.zip ? { zip: r.zip } : {}),
        },
        length: String(d.length), width: String(d.width), height: String(d.height), distanceUnit: "cm", weight: String(d.weight), massUnit: "kg",
        items: [{ title: `Order ${input.orderId}`, quantity: 1 }],
        productPaymentOnDelivery: cod,
        order: { sourceCode: "API", sourceIdentifier: this.p.config.storeUrl, orderNumber: input.orderId, totalAmount: cod ? (input.codAmount as number) / 100 : 0, totalAmountCurrency: "TL" },
      },
    });
    const s = j.data?.shipment;
    if (!s?.id) throw new GeliverError("geliver: shipment missing in transaction response");
    return { providerShipmentId: s.id, trackingNumber: s.trackingNumber || undefined, labelUrl: s.labelURL, carrier: s.providerCode };
  }

  async track(providerShipmentId: string): Promise<TrackingStatus> {
    const j = await this.call("GET", paths.shipment(providerShipmentId));
    const s = j.data ?? {};
    const code: string | undefined = s.trackingStatus?.trackingStatusCode;
    const map: Record<string, TrackingStatus["status"]> = { PRE_TRANSIT: "created", TRANSIT: "in_transit", DELIVERED: "delivered", RETURNED: "returned", CANCELED: "cancelled" };
    let status: TrackingStatus["status"] = (code && map[code]) || "unknown";
    if (s.statusCode === "CANCELED") status = "cancelled";
    const events = s.trackingStatus ? [{ at: s.trackingStatus.statusDate, detail: s.trackingStatus.statusDetails || s.trackingStatus.trackingSubStatusCode || "" }] : [];
    return { status, events };
  }

  async cancel(providerShipmentId: string): Promise<{ ok: boolean }> {
    try { await this.call("DELETE", paths.shipment(providerShipmentId)); return { ok: true }; } catch { return { ok: false }; }
  }
}

export const factory: AdapterFactory<GeliverAdapter> = {
  manifest,
  create(creds: IntegrationCredentials, deps: AdapterDeps) {
    return new GeliverAdapter(configSchema.parse({ config: creds.config, secrets: creds.secrets }), deps);
  },
};

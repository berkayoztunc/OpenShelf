import { eq } from "drizzle-orm";
import { payments } from "@openshelf/db";
import type {
  AdapterDeps, CheckoutInput, CheckoutSession, EmailMessage, EmailProvider, IntegrationCredentials, IntegrationManifest, InvoiceInput, InvoiceResult,
  InvoicingProvider, MarketplaceOrder, MarketplaceProvider, MarketplaceStockUpdate, OpenShelfIntegration, PaymentEvent, PaymentProvider,
  RefundInput, RefundResult, ServerEventContext, ServerEventSink, ShipmentInput, ShipmentResult, ShippingProvider, ShippingQuote, SmsMessage, SmsProvider, TrackingStatus,
} from "@openshelf/integration-sdk";
import { type ProviderId, type TrackEvent } from "@openshelf/shared";
import { mockManifests } from "./manifests";
import { recordMock, type MockDb } from "./record";
import { MOCK_SIGNATURE_HEADER, mockPayToken, verifyMockEvent, type MockPaymentEvent } from "./sign";

/** AdapterDeps extended with what mock adapters need. `fetch` is always a stub that throws: mock adapters never do network I/O. */
export interface MockDeps extends AdapterDeps {
  db: MockDb; apiOrigin: string; encryptionKey: string | undefined;
  /** Fresh (uncached) read of system.mockMode; mock-signed events are rejected when this is false. */
  isMockMode: () => Promise<boolean>;
}
export interface MockFactory { manifest: IntegrationManifest; create(creds: IntegrationCredentials, deps: MockDeps): OpenShelfIntegration }

export const noNetworkFetch: AdapterDeps["fetch"] = () => { throw new Error("Network access is disabled in mock mode"); };

/** FNV-1a: deterministic short ids from an input string. */
const h32 = (s: string) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(16).padStart(8, "0"); };

class MockIyzico implements PaymentProvider {
  readonly id = "iyzico" as const;
  constructor(private d: MockDeps) {}
  async validateConfig() {}
  async healthCheck() { return { ok: true, detail: "mock mode: no external call made" }; }
  async createCheckout(input: CheckoutInput): Promise<CheckoutSession> {
    const token = await mockPayToken(this.d.encryptionKey, input.orderId);
    await recordMock(this.d.db, { channel: "payment", to: input.buyer.email, subject: `Mock checkout created for ${input.orderNumber}`, body: `${(input.amount / 100).toFixed(2)} ${input.currency}`, meta: { provider: "iyzico", orderId: input.orderId, token } });
    return { providerToken: token, redirectUrl: `${this.d.apiOrigin}/mock/pay/${token}` };
  }
  async verifyWebhook(request: Request, rawBody: string): Promise<PaymentEvent> {
    if (!(await this.d.isMockMode())) throw new Error("mock mode is off");
    const sig = request.headers.get(MOCK_SIGNATURE_HEADER);
    if (!sig) throw new Error("missing mock signature");
    let ev: MockPaymentEvent;
    try { ev = JSON.parse(rawBody) as MockPaymentEvent; } catch { throw new Error("invalid mock event JSON"); }
    if (typeof ev.eventId !== "string" || typeof ev.orderId !== "string" || typeof ev.amount !== "number" || typeof ev.currency !== "string" || typeof ev.providerTxId !== "string" || !["succeeded", "failed", "refunded", "pending"].includes(ev.status)) throw new Error("invalid mock event");
    const clean: MockPaymentEvent = { eventId: ev.eventId, providerTxId: ev.providerTxId, orderId: ev.orderId, status: ev.status, amount: ev.amount, currency: ev.currency };
    if (!(await verifyMockEvent(this.d.encryptionKey, clean, sig))) throw new Error("invalid mock signature");
    return { ...clean, raw: { mock: true } };
  }
  async retrieve(providerToken: string): Promise<PaymentEvent> {
    const [p] = await this.d.db.select().from(payments).where(eq(payments.providerToken, providerToken)).limit(1);
    return { eventId: `mock:${providerToken}:pending`, providerTxId: `mock_tx_${h32(providerToken)}`, orderId: p?.orderId ?? "", status: "pending", amount: p?.amount ?? 0, currency: p?.currency ?? "TRY", raw: { mock: true } };
  }
  async refund(input: RefundInput): Promise<RefundResult> {
    await recordMock(this.d.db, { channel: "payment", subject: "Mock refund", body: `${(input.amount / 100).toFixed(2)} ${input.currency}`, meta: { provider: "iyzico", providerTxId: input.providerTxId, reason: input.reason } });
    return { ok: true, refundId: `mock_refund_${h32(input.providerTxId + input.amount)}` };
  }
}

class MockGeliver implements ShippingProvider {
  readonly id = "geliver" as const;
  constructor(private d: MockDeps) {}
  async validateConfig() {}
  async healthCheck() { return { ok: true, detail: "mock mode: no external call made" }; }
  async quote(_i: ShipmentInput): Promise<ShippingQuote[]> {
    return [{ carrier: "MOCKCARGO", serviceId: "mock-standard", price: 4990, currency: "TRY", etaDays: 3 }, { carrier: "MOCKCARGO", serviceId: "mock-express", price: 8990, currency: "TRY", etaDays: 1 }];
  }
  async createShipment(input: ShipmentInput, serviceId: string): Promise<ShipmentResult> {
    const key = h32(input.orderId);
    const r: ShipmentResult = { providerShipmentId: `mock_shp_${key}`, trackingNumber: `MOCK${key.toUpperCase()}`, labelUrl: `${this.d.apiOrigin}/mock/doc/label-${key}.pdf`, carrier: "MOCKCARGO" };
    await recordMock(this.d.db, { channel: "shipment", to: input.recipient.name, subject: `Mock shipment label ${r.trackingNumber}`, body: `${input.recipient.address}, ${input.recipient.city}`, meta: { provider: "geliver", orderId: input.orderId, serviceId, ...r } });
    return r;
  }
  async track(_id: string): Promise<TrackingStatus> { return { status: "in_transit", events: [{ at: new Date(0).toISOString(), detail: "Mock: in transit" }] }; }
  async cancel(id: string) { await recordMock(this.d.db, { channel: "shipment", subject: "Mock shipment cancelled", meta: { providerShipmentId: id } }); return { ok: true }; }
}

class MockEfaturam implements InvoicingProvider {
  readonly id = "efaturam" as const;
  constructor(private d: MockDeps) {}
  async validateConfig() {}
  async healthCheck() { return { ok: true, detail: "mock mode: no external call made" }; }
  async resolveInvoiceType(i: InvoiceInput): Promise<"e_fatura" | "e_arsiv"> { return i.customer.isCompany && i.customer.taxId ? "e_fatura" : "e_arsiv"; }
  async issue(input: InvoiceInput, idempotencyKey: string): Promise<InvoiceResult> {
    const key = h32(idempotencyKey);
    const type = await this.resolveInvoiceType(input);
    const number = `MOCK${input.issuedAt.slice(0, 4)}${key.slice(0, 8).toUpperCase()}`;
    const r: InvoiceResult = { providerInvoiceId: `mock_inv_${key}`, number, type, pdfUrl: `${this.d.apiOrigin}/mock/doc/invoice-${key}.pdf` };
    const total = input.lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
    await recordMock(this.d.db, { channel: "invoice", to: input.customer.email ?? input.customer.name, subject: `Mock invoice ${number}`, body: `${input.orderNumber}: ${(total / 100).toFixed(2)} ${input.currency}`, meta: { provider: "efaturam", orderId: input.orderId, ...r } });
    return r;
  }
  async cancel(id: string) { await recordMock(this.d.db, { channel: "invoice", subject: "Mock invoice cancelled", meta: { providerInvoiceId: id } }); return { ok: true }; }
}

class MockTrendyol implements MarketplaceProvider {
  readonly id = "trendyol" as const;
  constructor(private d: MockDeps) {}
  async validateConfig() {}
  async healthCheck() { return { ok: true, detail: "mock mode: no external call made" }; }
  async pushStockAndPrice(updates: MarketplaceStockUpdate[]) {
    const batchId = `mock_batch_${h32(JSON.stringify(updates))}`;
    await recordMock(this.d.db, { channel: "event", to: "trendyol", subject: "trendyol.stock_push", body: `${updates.length} item(s)`, meta: { provider: "trendyol", batchId, updates: updates.slice(0, 50) } });
    return { ok: true, batchId };
  }
  async fetchOrders(_since: Date, cursor?: string): Promise<{ orders: MarketplaceOrder[]; nextCursor?: string }> {
    if (cursor) return { orders: [] };
    return { orders: [{ externalId: "MOCK-1001", status: "Created", placedAt: new Date(0).toISOString(), total: 25000, currency: "TRY",
      customer: { name: "Mock Müşteri", email: "mock-buyer@example.invalid", address: "Mock Mah. 1. Sok.", city: "İstanbul" }, lines: [{ sku: "MOCK-SKU", quantity: 1, unitPrice: 25000 }] }] };
  }
  async updateShipment(externalId: string, t: { carrier: string; trackingNumber: string }) {
    await recordMock(this.d.db, { channel: "shipment", to: "trendyol", subject: "trendyol.update_shipment", meta: { externalId, ...t } });
    return { ok: true };
  }
}

class MockSink implements ServerEventSink {
  constructor(readonly id: "meta" | "ga4", private d: MockDeps) {}
  async validateConfig() {}
  async healthCheck() { return { ok: true, detail: "mock mode: no external call made" }; }
  async send(event: TrackEvent, ctx: ServerEventContext) {
    await recordMock(this.d.db, { channel: "event", to: this.id, subject: `${this.id}:${event.name}`, body: JSON.stringify({ ...event }), meta: { provider: this.id, eventId: event.event_id, hasEmail: !!ctx.email, hasPhone: !!ctx.phone } });
    return { ok: true, detail: "mock: recorded, not sent" };
  }
}

class MockSms implements SmsProvider {
  constructor(readonly id: "netgsm" | "twilio", private d: MockDeps) {}
  async validateConfig() {}
  async healthCheck() { return { ok: true, detail: "mock mode: no external call made" }; }
  async send(msg: SmsMessage) {
    if (!(await this.d.isMockMode())) throw new Error("mock mode is off");
    const mid = await recordMock(this.d.db, { channel: "sms", to: msg.to, body: msg.text, meta: { provider: this.id, senderId: msg.senderId } });
    return { ok: true, providerMessageId: `mock_sms_${mid ?? h32(msg.to + msg.text)}` };
  }
}

class MockEmail implements EmailProvider {
  readonly id = "cf_email" as const;
  constructor(private d: MockDeps) {}
  async validateConfig() {}
  async healthCheck() { return { ok: true, detail: "mock mode: no external call made" }; }
  async send(msg: EmailMessage) {
    if (!(await this.d.isMockMode())) throw new Error("mock mode is off");
    const mid = await recordMock(this.d.db, { channel: "email", to: msg.to, subject: msg.subject, body: msg.text, meta: { provider: "cf_email", from: msg.from, fromName: msg.fromName, cc: msg.cc, replyTo: msg.replyTo, html: msg.html.slice(0, 10000) } });
    return { ok: true, providerMessageId: `mock_mail_${mid ?? h32(msg.to + msg.subject)}` };
  }
}

const f = (id: ProviderId, create: (d: MockDeps) => OpenShelfIntegration): MockFactory => ({ manifest: mockManifests[id], create: (_c, d) => create(d) });

/** Real manifest shape, zero network I/O, deterministic fake results. `creds` (real secrets) are deliberately ignored. */
export const mockFactories: Record<ProviderId, MockFactory> = {
  iyzico: f("iyzico", (d) => new MockIyzico(d)),
  geliver: f("geliver", (d) => new MockGeliver(d)),
  efaturam: f("efaturam", (d) => new MockEfaturam(d)),
  trendyol: f("trendyol", (d) => new MockTrendyol(d)),
  meta: f("meta", (d) => new MockSink("meta", d)),
  ga4: f("ga4", (d) => new MockSink("ga4", d)),
  netgsm: f("netgsm", (d) => new MockSms("netgsm", d)),
  twilio: f("twilio", (d) => new MockSms("twilio", d)),
  cf_email: f("cf_email", (d) => new MockEmail(d)),
};

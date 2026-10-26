import type { ProviderId, TrackEvent } from "@openshelf/shared";
import type { z } from "zod";

export interface HealthResult { ok: boolean; detail?: string }

/** Decrypted secrets + public config, handed to an adapter factory. Never log. */
export interface IntegrationCredentials<P = Record<string, unknown>, S = Record<string, string>> {
  config: P;
  secrets: S;
}

export interface OpenShelfIntegration {
  id: ProviderId;
  validateConfig(): Promise<void>;
  healthCheck(): Promise<HealthResult>;
}

/** Declarative field spec so admin UI renders the config form generically. */
export interface IntegrationFieldSpec {
  key: string; label: string; secret?: boolean; required?: boolean;
  type?: "text" | "password" | "select" | "boolean" | "url";
  options?: { value: string; label: string }[]; help?: string; placeholder?: string;
}
export interface IntegrationManifest {
  id: ProviderId; name: string; description: string; docsUrl?: string;
  publicFields: IntegrationFieldSpec[]; secretFields: IntegrationFieldSpec[];
  schema: z.ZodTypeAny; // validates { config, secrets }
}

/** Minimal fetch abstraction; adapters must only call allowlisted hosts. */
export type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;
export interface AdapterDeps { fetch: Fetcher; now: () => Date }

// ---------- Payment ----------
export interface CheckoutInput {
  orderId: string; orderNumber: string; amount: number; currency: string; // minor units
  buyer: { id: string; name: string; surname: string; email: string; phone?: string; ip: string; address: string; city: string; country: string; zip?: string; identityNumber?: string };
  items: { id: string; name: string; category: string; price: number; quantity: number }[];
  callbackUrl: string;
}
export interface CheckoutSession { providerToken: string; redirectUrl?: string; htmlContent?: string; expiresAt?: string }
export interface PaymentEvent {
  eventId: string; providerTxId: string; orderId: string;
  status: "succeeded" | "failed" | "refunded" | "pending"; amount: number; currency: string; raw?: unknown;
}
export interface RefundInput { providerTxId: string; amount: number; currency: string; reason?: string; ip: string }
export interface RefundResult { ok: boolean; refundId?: string; detail?: string }
export interface PaymentProvider extends OpenShelfIntegration {
  createCheckout(input: CheckoutInput): Promise<CheckoutSession>;
  /** Verify a callback/webhook from the RAW request; MUST verify signature and re-retrieve server-to-server. */
  verifyWebhook(request: Request, rawBody: string): Promise<PaymentEvent>;
  retrieve(providerToken: string): Promise<PaymentEvent>;
  refund?(input: RefundInput): Promise<RefundResult>;
}

// ---------- Shipping ----------
export interface ShipmentInput { orderId: string; recipient: { name: string; phone: string; email?: string; address: string; city: string; district?: string; zip?: string }; parcels: { weightKg: number; desi?: number }[]; codAmount?: number }
export interface ShippingQuote { carrier: string; serviceId: string; price: number; currency: string; etaDays?: number }
export interface ShipmentResult { providerShipmentId: string; trackingNumber?: string; labelUrl?: string; carrier?: string }
export interface TrackingStatus { status: "created" | "in_transit" | "delivered" | "returned" | "cancelled" | "unknown"; events: { at: string; detail: string }[] }
export interface ShippingProvider extends OpenShelfIntegration {
  quote(input: ShipmentInput): Promise<ShippingQuote[]>;
  createShipment(input: ShipmentInput, serviceId: string): Promise<ShipmentResult>;
  track(providerShipmentId: string): Promise<TrackingStatus>;
  cancel(providerShipmentId: string): Promise<{ ok: boolean }>;
}

// ---------- Invoicing ----------
export interface InvoiceInput { orderId: string; orderNumber: string; issuedAt: string; customer: { name: string; email?: string; taxId?: string; taxOffice?: string; address: string; city: string; isCompany: boolean }; lines: { name: string; quantity: number; unitPrice: number; taxRate: number }[]; currency: string }
export interface InvoiceResult { providerInvoiceId: string; number?: string; type: "e_fatura" | "e_arsiv"; pdfUrl?: string }
export interface InvoicingProvider extends OpenShelfIntegration {
  /** Must be idempotent per (orderId, type) — caller passes idempotencyKey. */
  issue(input: InvoiceInput, idempotencyKey: string): Promise<InvoiceResult>;
  cancel(providerInvoiceId: string): Promise<{ ok: boolean }>;
}

// ---------- Marketplace ----------
export interface MarketplaceStockUpdate { sku: string; barcode?: string; quantity: number; price?: number }
export interface MarketplaceOrder { externalId: string; status: string; placedAt: string; total: number; currency: string; customer: { name: string; email?: string; phone?: string; address: string; city: string }; lines: { sku: string; barcode?: string; quantity: number; unitPrice: number }[] }
export interface MarketplaceProvider extends OpenShelfIntegration {
  pushStockAndPrice(updates: MarketplaceStockUpdate[]): Promise<{ ok: boolean; batchId?: string; errors?: string[] }>;
  fetchOrders(since: Date, cursor?: string): Promise<{ orders: MarketplaceOrder[]; nextCursor?: string }>;
  updateShipment?(externalId: string, tracking: { carrier: string; trackingNumber: string }): Promise<{ ok: boolean }>;
  verifyWebhook?(request: Request, rawBody: string): Promise<MarketplaceOrder | null>;
}

// ---------- Analytics / Ads (server side) ----------
export interface ServerEventContext { ip?: string; userAgent?: string; fbc?: string; fbp?: string; gaClientId?: string; email?: string; phone?: string; externalId?: string; sourceUrl?: string }
export interface ServerEventSink extends OpenShelfIntegration {
  /** Caller guarantees consent was granted. Must dedup by event.event_id. */
  send(event: TrackEvent, ctx: ServerEventContext): Promise<{ ok: boolean; detail?: string }>;
}

/** Adapter registry shape used by the API worker. */
export interface AdapterFactory<T extends OpenShelfIntegration> {
  manifest: IntegrationManifest;
  create(creds: IntegrationCredentials, deps: AdapterDeps): T;
}

// ---------- Notifications ----------
export interface SmsMessage { to: string /* E.164 */; text: string; senderId?: string }
export interface SmsProvider extends OpenShelfIntegration {
  send(msg: SmsMessage): Promise<{ ok: boolean; providerMessageId?: string; detail?: string }>;
}
export interface EmailMessage { to: string; from: string; fromName?: string; subject: string; html: string; text: string; /** optional, admin-composed mail only */ cc?: string; replyTo?: string }
export interface EmailProvider extends OpenShelfIntegration {
  send(msg: EmailMessage): Promise<{ ok: boolean; providerMessageId?: string; detail?: string }>;
}

import { z } from "zod";
import type {
  AdapterDeps, AdapterFactory, CheckoutInput, CheckoutSession, HealthResult, IntegrationCredentials,
  IntegrationManifest, PaymentEvent, PaymentProvider, RefundInput, RefundResult,
} from "@openshelf/integration-sdk";
import { ALLOWED_HOSTS, HOSTS, PATHS } from "./endpoints";
import { iyzicoAuthHeader, safeEqual, webhookSignature, type WebhookPayload } from "./auth";

export { iyzicoAuthHeader, webhookSignature } from "./auth";

export const configSchema = z.object({
  config: z.object({
    environment: z.enum(["sandbox", "production"]).default("sandbox"),
    allowPaidPriceDiff: z.boolean().default(false), // allow installment commission (paidPrice > price)
  }),
  secrets: z.object({ apiKey: z.string().min(8), secretKey: z.string().min(8) }),
});
type Parsed = z.infer<typeof configSchema>;

export const manifest: IntegrationManifest = {
  id: "iyzico", name: "iyzico", description: "iyzico CheckoutForm (hosted payment page). Card data never touches this server.",
  docsUrl: "https://docs.iyzico.com",
  publicFields: [
    { key: "environment", label: "Ortam", type: "select", required: true, options: [{ value: "sandbox", label: "Sandbox" }, { value: "production", label: "Canlı" }] },
    { key: "allowPaidPriceDiff", label: "Taksit komisyonuna izin ver (paidPrice > price)", type: "boolean" },
  ],
  secretFields: [
    { key: "apiKey", label: "API Key", secret: true, required: true, type: "password" },
    { key: "secretKey", label: "Secret Key", secret: true, required: true, type: "password" },
  ],
  schema: configSchema,
};

export class IyzicoError extends Error {
  constructor(message: string, public code?: string) { super(message); this.name = "IyzicoError"; }
}
export class WebhookSignatureError extends IyzicoError { constructor(m = "invalid iyzico webhook signature") { super(m); this.name = "WebhookSignatureError"; } }
export class PaymentMismatchError extends IyzicoError { constructor(m: string) { super(m); this.name = "PaymentMismatchError"; } }

const CURRENCIES = ["TRY", "USD", "EUR", "GBP", "NOK", "CHF"];
const toMajor = (minor: number) => (minor / 100).toFixed(2);
const toMinor = (v: unknown) => Math.round(Number(v) * 100);

export interface ExpectedPayment { orderId: string; amount: number; currency: string }
/** Reject if a verified PaymentEvent does not match the order we created. */
export function assertPaymentMatches(ev: PaymentEvent, exp: ExpectedPayment): void {
  if (ev.orderId !== exp.orderId) throw new PaymentMismatchError("order mismatch");
  if (ev.amount !== exp.amount) throw new PaymentMismatchError(`amount mismatch: expected ${exp.amount}, got ${ev.amount}`);
  if (ev.currency !== exp.currency) throw new PaymentMismatchError("currency mismatch");
}

export class IyzicoAdapter implements PaymentProvider {
  readonly id = "iyzico" as const;
  private base: string;
  constructor(private p: Parsed, private deps: AdapterDeps) {
    this.base = HOSTS[p.config.environment];
    if (!ALLOWED_HOSTS.includes(new URL(this.base).hostname)) throw new IyzicoError("host not allowlisted");
  }

  async validateConfig(): Promise<void> { configSchema.parse({ config: this.p.config, secrets: this.p.secrets }); }

  async healthCheck(): Promise<HealthResult> {
    try {
      const r = await this.call(PATHS.binCheck, { locale: "tr", binNumber: "554960", conversationId: "healthcheck" });
      return r.status === "success" ? { ok: true } : { ok: false, detail: `${r.errorCode ?? ""} ${r.errorMessage ?? ""}`.trim() };
    } catch (e) { return { ok: false, detail: (e as Error).message }; }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async call(path: string, payload: unknown): Promise<any> {
    const body = JSON.stringify(payload);
    const rnd = `${this.deps.now().getTime()}${crypto.randomUUID().replace(/-/g, "").slice(0, 9)}`;
    const auth = await iyzicoAuthHeader(this.p.secrets.apiKey, this.p.secrets.secretKey, rnd, path, body);
    const res = await this.deps.fetch(this.base + path, {
      method: "POST",
      headers: { Authorization: auth, "x-iyzi-rnd": rnd, "Content-Type": "application/json", Accept: "application/json" },
      body,
    });
    let json: any;
    try { json = await res.json(); } catch { throw new IyzicoError(`iyzico HTTP ${res.status}: non-JSON response`); }
    return json;
  }

  async createCheckout(input: CheckoutInput): Promise<CheckoutSession> {
    if (!CURRENCIES.includes(input.currency)) throw new IyzicoError(`unsupported currency ${input.currency}`);
    if (!/^https:\/\//.test(input.callbackUrl)) throw new IyzicoError("callbackUrl must be https");
    if (!Number.isInteger(input.amount) || input.amount <= 0) throw new IyzicoError("invalid amount");
    const lines = input.items.map((i) => ({ item: i, total: i.price * i.quantity }));
    const sum = lines.reduce((s, l) => s + l.total, 0);
    if (sum !== input.amount) throw new PaymentMismatchError(`basket sum ${sum} != amount ${input.amount}`);
    const b = input.buyer;
    const addr = { address: b.address, contactName: `${b.name} ${b.surname}`, city: b.city, country: b.country, ...(b.zip ? { zipCode: b.zip } : {}) };
    const res = await this.call(PATHS.checkoutInitialize, {
      locale: "tr",
      conversationId: input.orderId,
      price: toMajor(input.amount),
      paidPrice: toMajor(input.amount),
      currency: input.currency,
      basketId: input.orderId,
      paymentGroup: "PRODUCT",
      callbackUrl: input.callbackUrl,
      buyer: {
        id: b.id, name: b.name, surname: b.surname, email: b.email,
        identityNumber: b.identityNumber ?? "11111111111", // iyzico requires a value; real TCKN optional for merchants
        gsmNumber: b.phone ?? "+905000000000", registrationAddress: b.address, city: b.city, country: b.country,
        ip: b.ip, ...(b.zip ? { zipCode: b.zip } : {}),
      },
      shippingAddress: addr, billingAddress: addr,
      basketItems: lines.map(({ item, total }) => ({
        id: item.id, name: item.quantity > 1 ? `${item.name} x${item.quantity}` : item.name,
        category1: item.category, itemType: "PHYSICAL", price: toMajor(total),
      })),
    });
    if (res.status !== "success" || !res.token) throw new IyzicoError(`iyzico initialize failed: ${res.errorMessage ?? "unknown"}`, res.errorCode);
    return { providerToken: res.token, redirectUrl: res.paymentPageUrl, htmlContent: res.checkoutFormContent };
  }

  async retrieve(providerToken: string, expected?: ExpectedPayment): Promise<PaymentEvent> {
    const r = await this.call(PATHS.checkoutRetrieve, { locale: "tr", conversationId: "retrieve", token: providerToken });
    if (r.status !== "success") {
      return { eventId: `iyz:${providerToken}:failed`, providerTxId: r.paymentId ?? providerToken, orderId: r.basketId ?? "", status: "failed", amount: 0, currency: r.currency ?? "TRY", raw: { errorCode: r.errorCode, errorMessage: r.errorMessage } };
    }
    if (r.basketId && r.conversationId && r.basketId !== r.conversationId) throw new PaymentMismatchError("basketId/conversationId mismatch");
    if (!r.basketId) throw new PaymentMismatchError("missing basketId");
    const price = toMinor(r.price), paid = toMinor(r.paidPrice);
    if (!this.p.config.allowPaidPriceDiff && paid !== price) throw new PaymentMismatchError(`paidPrice ${paid} != price ${price}`);
    if (this.p.config.allowPaidPriceDiff && paid < price) throw new PaymentMismatchError("paidPrice below price");
    let status: PaymentEvent["status"] = "pending";
    if (r.paymentStatus === "SUCCESS") status = r.fraudStatus === 1 ? "succeeded" : r.fraudStatus === 0 ? "pending" : "failed";
    else if (r.paymentStatus === "FAILURE") status = "failed";
    const ev: PaymentEvent = {
      eventId: `iyz:${providerToken}:${status}`, providerTxId: String(r.paymentId ?? providerToken), orderId: r.basketId,
      status, amount: price, currency: r.currency, raw: { paymentStatus: r.paymentStatus, fraudStatus: r.fraudStatus, paymentId: r.paymentId },
    };
    if (expected) assertPaymentMatches(ev, expected);
    return ev;
  }

  /**
   * Accepts either (a) a signed iyzico webhook (JSON + X-IYZ-SIGNATURE-V3) or (b) the browser callback POST
   * (form-encoded `token`, unsigned). Both paths end in a server-to-server retrieve; the result of retrieve is authoritative.
   */
  async verifyWebhook(request: Request, rawBody: string): Promise<PaymentEvent> {
    const ct = request.headers.get("content-type") ?? "";
    if (ct.includes("application/x-www-form-urlencoded")) {
      const token = new URLSearchParams(rawBody).get("token");
      if (!token) throw new IyzicoError("callback without token");
      return this.retrieve(token);
    }
    const sig = request.headers.get("x-iyz-signature-v3");
    if (!sig) throw new WebhookSignatureError("missing X-IYZ-SIGNATURE-V3");
    let p: WebhookPayload;
    try { p = JSON.parse(rawBody); } catch { throw new IyzicoError("invalid webhook JSON"); }
    const expected = await webhookSignature(this.p.secrets.secretKey, p);
    if (!safeEqual(expected, sig.toLowerCase())) throw new WebhookSignatureError();
    if (!p.token) throw new IyzicoError("unsupported webhook format (not checkout form)");
    const ev = await this.retrieve(p.token);
    if (p.paymentConversationId && p.paymentConversationId !== ev.orderId) throw new PaymentMismatchError("webhook conversationId mismatch");
    if (p.iyziPaymentId !== undefined && ev.status === "succeeded" && String(p.iyziPaymentId) !== ev.providerTxId) throw new PaymentMismatchError("webhook paymentId mismatch");
    return ev;
  }

  async refund(input: RefundInput): Promise<RefundResult> {
    const r = await this.call(PATHS.refundV2, {
      locale: "tr", conversationId: `refund-${input.providerTxId}-${input.amount}`, paymentId: input.providerTxId,
      price: toMajor(input.amount), currency: input.currency, ip: input.ip,
    });
    if (r.status === "success") return { ok: true, refundId: r.refundHostReference ?? r.paymentId };
    return { ok: false, detail: `${r.errorCode ?? ""} ${r.errorMessage ?? ""}`.trim() };
  }
}

export const factory: AdapterFactory<IyzicoAdapter> = {
  manifest,
  create(creds: IntegrationCredentials, deps: AdapterDeps) {
    return new IyzicoAdapter(configSchema.parse({ config: creds.config, secrets: creds.secrets }), deps);
  },
};

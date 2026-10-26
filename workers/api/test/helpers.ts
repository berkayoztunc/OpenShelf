import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { z } from "zod";
import type { AdapterFactory, PaymentProvider, ServerEventSink } from "@openshelf/integration-sdk";
import worker from "../src/index";
import { registerFactory } from "../src/integrations/registry";

export const OWNER = { email: "owner@example.com", password: "correct horse battery staple" };
let ipCounter = 10;
export const freshIp = () => `10.0.${Math.floor(ipCounter / 250)}.${(ipCounter++ % 250) + 1}`;

export interface CallOpts { method?: string; json?: unknown; form?: FormData; cookie?: string; csrf?: string; origin?: string | null; ip?: string; headers?: Record<string, string>; raw?: string }
export async function call(path: string, o: CallOpts = {}): Promise<Response> {
  const method = o.method ?? (o.json !== undefined || o.form || o.raw !== undefined ? "POST" : "GET");
  const headers = new Headers(o.headers);
  headers.set("CF-Connecting-IP", o.ip ?? "203.0.113.9");
  if (o.cookie) headers.set("Cookie", o.cookie);
  if (o.csrf) headers.set("X-CSRF-Token", o.csrf);
  const origin = o.origin === undefined ? (method === "GET" ? null : env.ADMIN_ORIGIN) : o.origin;
  if (origin) headers.set("Origin", origin);
  let body: BodyInit | undefined;
  if (o.json !== undefined) { headers.set("Content-Type", "application/json"); body = JSON.stringify(o.json); }
  else if (o.form) body = o.form;
  else if (o.raw !== undefined) body = o.raw;
  const ctx = createExecutionContext();
  const res = await worker.fetch(new Request(`http://api.test${path}`, { method, headers, body }), env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}
export const j = async <T = any>(r: Response) => (await r.json()) as T;

export interface Session { cookie: string; csrf: string; ip: string }
export async function loginAs(email: string, password: string, extra: Record<string, unknown> = {}, ip = freshIp()): Promise<Session> {
  const r = await call("/api/admin/auth/login", { json: { email, password, ...extra }, ip });
  if (r.status !== 200) throw new Error(`login failed ${r.status} ${await r.text()}`);
  const body = await j<{ csrfToken: string }>(r);
  const cookie = (r.headers.get("Set-Cookie") ?? "").split(";")[0]!;
  return { cookie, csrf: body.csrfToken, ip };
}
export async function ensureOwner(): Promise<Session> {
  const st = await j<{ needsSetup: boolean }>(await call("/api/admin/setup/status"));
  if (st.needsSetup) {
    const r = await call("/api/admin/setup", { json: { setupToken: env.SETUP_TOKEN, email: OWNER.email, name: "Owner", password: OWNER.password }, ip: freshIp() });
    if (r.status !== 201) throw new Error("setup failed " + (await r.text()));
  }
  return loginAs(OWNER.email, OWNER.password);
}
export const admin = (s: Session, path: string, method = "GET", json?: unknown) =>
  call(`/api/admin${path}`, { method, json, cookie: s.cookie, csrf: s.csrf, ip: s.ip });

// ---------- fakes ----------
const fakeSchema = z.object({ config: z.record(z.unknown()), secrets: z.object({ apiKey: z.string().min(1), secretKey: z.string().min(1) }) });
export const SIG = "valid-signature";
export const fakePaymentFactory: AdapterFactory<PaymentProvider> = {
  manifest: {
    id: "iyzico", name: "Fake Pay", description: "test", publicFields: [{ key: "sandbox", label: "Sandbox", type: "boolean" }],
    secretFields: [{ key: "apiKey", label: "API key", secret: true, required: true }, { key: "secretKey", label: "Secret key", secret: true, required: true }], schema: fakeSchema,
  },
  create: ({ secrets }) => ({
    id: "iyzico",
    async validateConfig() { if (!secrets.apiKey) throw new Error("missing"); },
    async healthCheck() { return { ok: secrets.apiKey !== "bad", detail: secrets.apiKey === "bad" ? `rejected key ${secrets.apiKey}` : "fake ok" }; },
    async createCheckout(input) { return { providerToken: `tok_${input.orderId}`, redirectUrl: `https://pay.test/${input.orderId}` }; },
    async verifyWebhook(req, raw) {
      if (req.headers.get("x-test-signature") !== SIG) throw new Error("bad signature");
      const b = JSON.parse(raw) as { eventId: string; orderId: string; status: "succeeded" | "failed"; amount: number; currency: string; providerTxId: string };
      return b;
    },
    async retrieve() { throw new Error("n/a"); },
    async refund() { return { ok: true, refundId: "r1" }; },
  }),
};
export const sentEvents: { name: string; id: string }[] = [];
export const fakeGa4Factory: AdapterFactory<ServerEventSink> = {
  manifest: { id: "ga4", name: "Fake GA4", description: "t", publicFields: [], secretFields: [{ key: "apiSecret", label: "s", secret: true }], schema: z.object({ config: z.record(z.unknown()), secrets: z.record(z.string()) }) },
  create: () => ({ id: "ga4", async validateConfig() {}, async healthCheck() { return { ok: true }; }, async send(e) { sentEvents.push({ name: e.name, id: e.event_id }); return { ok: true }; } }),
};
export function installFakes() { registerFactory("iyzico", fakePaymentFactory as never); registerFactory("ga4", fakeGa4Factory as never); }

export async function enablePayment(s: Session) {
  installFakes();
  const r = await admin(s, "/integrations/iyzico", "PUT", { enabled: true, config: { sandbox: true }, secrets: { apiKey: "key-123456", secretKey: "secret-abcdef" } });
  if (r.status !== 200) throw new Error("enable payment " + (await r.text()));
}
let seq = 0;
export async function createProduct(s: Session, o: { price?: number; stock?: number; status?: string } = {}) {
  const n = ++seq + Date.now() % 100000;
  const r = await admin(s, "/products", "POST", {
    slug: `prod-${n}`, nameTr: `Ürün ${n}`, status: o.status ?? "active",
    variants: [{ sku: `SKU-${n}`, prices: { website: o.price ?? 10000 }, stock: { total: o.stock ?? 10 } }],
  });
  if (r.status !== 201) throw new Error("create product " + (await r.text()));
  const p = await j<any>(r);
  return { product: p, variantId: p.variants[0].id as string, slug: p.slug as string };
}
export async function newCart(ip: string, variantId?: string, quantity = 1) {
  const { id } = await j<{ id: string }>(await call("/api/store/cart", { method: "POST", json: {}, ip, origin: "http://shop.test" }));
  if (variantId) await call(`/api/store/cart/${id}/items`, { method: "PUT", json: { variantId, quantity }, ip, origin: "http://shop.test" });
  return id;
}
export const ADDRESS = { name: "Ayşe Yılmaz", phone: "+905551112233", line1: "Atatürk Cad. No 1", city: "İstanbul", district: "Kadıköy", country: "TR" };
export const checkout = (cartId: string, ip = freshIp(), email = "buyer@example.com") =>
  call("/api/store/checkout", { json: { cartId, email, shippingAddress: ADDRESS, consent: { analytics: true, marketing: true }, acceptedTerms: true }, ip, origin: "http://shop.test" });
export const webhook = (body: unknown, sig = SIG) =>
  call("/webhooks/payment/iyzico", { raw: JSON.stringify(body), headers: { "x-test-signature": sig, "Content-Type": "application/json" }, ip: freshIp(), origin: null });

import { env } from "cloudflare:test";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "@openshelf/db";
import { mockFactories, signMockEvent } from "@openshelf/integration-mock";
import { clearSettingsCache } from "../src/lib/settings";
import { getAdapter, listIntegrations, loadSecrets } from "../src/lib/integrations";
import { registerJobHandlers, runOutbox } from "../src/outbox";
// Relative imports bypass the vitest alias that stubs the real adapter packages (we only want their job handlers).
import { jobHandlers as geliverJobs } from "../../../packages/integrations/geliver/src/jobs";
import { jobHandlers as efaturamJobs } from "../../../packages/integrations/efaturam/src/jobs";
import { jobHandlers as metaJobs } from "../../../packages/integrations/meta/src/index";
import { jobHandlers as trendyolJobs } from "../../../packages/integrations/trendyol/src/index";
import { jobHandlers as ga4Jobs } from "../../../packages/integrations/ga4/src/index";
import { admin, call, checkout, createProduct, ensureOwner, freshIp, j, loginAs, newCart, type Session } from "./helpers";

const API = "http://api.test";
const db = () => drizzle(env.DB, { schema });
const setMock = async (owner: Session, on: boolean) => {
  const r = await admin(owner, "/settings/system", "PUT", { mockMode: on });
  expect(r.status).toBe(200);
};
const messages = async (channel?: string) => (await env.DB.prepare(channel ? "SELECT * FROM mock_messages WHERE channel = ?1" : "SELECT * FROM mock_messages").bind(...(channel ? [channel] : [])).all<any>()).results;
const jobKinds = async (orderId: string) => (await env.DB.prepare("SELECT kind FROM outbox_jobs WHERE dedupe_key LIKE ?1 ORDER BY kind").bind(`%:${orderId}`).all<{ kind: string }>()).results.map((r) => r.kind);

let owner: Session;
/** Tests share one D1: earlier files leave an enabled fake provider and real paid orders, which (correctly) block enabling mock mode. */
const resetRealState = async () => {
  await env.DB.exec("UPDATE integration_configs SET enabled = 0 WHERE provider = 'iyzico'");
  await env.DB.exec("UPDATE orders SET status = 'delivered' WHERE status IN ('paid','fulfilling','shipped') AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.order_id = orders.id AND p.is_mock = 1)");
};
beforeAll(async () => {
  owner = await ensureOwner();
  await resetRealState();
  registerJobHandlers({ ...geliverJobs, ...efaturamJobs, ...metaJobs, ...ga4Jobs, ...trendyolJobs } as never);
});
afterAll(async () => { await setMock(owner, false).catch(() => {}); clearSettingsCache(); });

describe("mock mode", () => {
  it("full flow offline: checkout -> /mock/pay -> paid -> jobs record mock messages; replay is a no-op", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await setMock(owner, true);
    expect((await env.DB.prepare("SELECT 1 FROM audit_logs WHERE action = 'mock_mode.enabled'").first())).toBeTruthy();
    const cfg = await j<any>(await call("/api/store/config"));
    expect(cfg.mockMode).toBe(true);
    expect(cfg.system).toBeUndefined();

    // every integration lists as enabled, without secrets
    const ints = await j<any[]>(await admin(owner, "/integrations"));
    expect(ints.every((i) => i.enabled && i.mock === true)).toBe(true);
    expect(ints.find((i) => i.provider === "iyzico").secretFields.length).toBeGreaterThan(0);
    // integration saves are refused while mocking (they would require decrypting real secrets)
    expect((await admin(owner, "/integrations/iyzico", "PUT", { enabled: true, config: {}, secrets: {} })).status).toBe(409);

    const { variantId } = await createProduct(owner, { price: 15000 });
    const ip = freshIp();
    const co = await checkout(await newCart(ip, variantId, 2), ip);
    expect(co.status).toBe(201);
    const order = await j<{ orderNumber: string; trackingToken: string; payment: { redirectUrl: string } }>(co);
    expect(order.payment.redirectUrl).toMatch(new RegExp(`^${API}/mock/pay/`));
    const path = new URL(order.payment.redirectUrl).pathname;

    const pg = await call(path);
    expect(pg.status).toBe(200);
    const html = await pg.text();
    expect(html).toContain(order.orderNumber);
    expect(html).toContain("300.00 TRY");
    expect(html).not.toMatch(/<script|https?:\/\/(?!shop\.test)/);
    expect(pg.headers.get("Content-Security-Policy")).toContain("default-src 'none'");
    expect(await call(path + "x")).toMatchObject({ status: 404 });

    const complete = () => { const f = new FormData(); f.set("result", "success"); return call(`${path}/complete`, { form: f, origin: API, ip: freshIp() }); };
    const r1 = await complete();
    expect(r1.status).toBe(302);
    expect(r1.headers.get("Location")).toBe(`http://shop.test/order/${order.orderNumber}?t=${order.trackingToken}`);
    const view = await j<any>(await call(`/api/store/orders/${order.orderNumber}?t=${order.trackingToken}`));
    expect(["paid", "processing"]).toContain(view.status);

    const o = await env.DB.prepare("SELECT id FROM orders WHERE number = ?1").bind(order.orderNumber).first<{ id: string }>();
    const kinds = await jobKinds(o!.id);
    expect(kinds).toEqual(expect.arrayContaining(["invoice.issue", "marketing.purchase.ga4", "marketing.purchase.meta", "notify.admin_new_order", "notify.order_paid", "shipment.create"]));
    await runOutbox(env, { limit: 100 });
    for (const ch of ["invoice", "shipment", "event", "payment"]) expect((await messages(ch)).length, ch).toBeGreaterThan(0);
    const inv = (await messages("invoice"))[0];
    expect(JSON.parse(inv.meta).pdfUrl).toMatch(new RegExp(`^${API}/mock/doc/invoice-[0-9a-f]{8}\\.pdf$`));
    const pdf = await call(new URL(JSON.parse(inv.meta).pdfUrl).pathname);
    expect(pdf.headers.get("Content-Type")).toBe("application/pdf");
    expect((await pdf.text()).startsWith("%PDF-")).toBe(true);

    // replay: no second set of jobs / side effects
    const before = { jobs: await jobKinds(o!.id), inv: (await messages("invoice")).length, ev: (await messages("event")).length };
    expect((await complete()).status).toBe(302);
    await runOutbox(env, { limit: 100 });
    expect(await jobKinds(o!.id)).toEqual(before.jobs);
    expect((await messages("invoice")).length).toBe(before.inv);
    expect((await messages("event")).length).toBe(before.ev);

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("fail and cancel do not pay the order; amount tampering in a signed event is rejected by the normal checks", async () => {
    await setMock(owner, true);
    const { variantId } = await createProduct(owner, { price: 5000 });
    const ip = freshIp();
    const order = await j<any>(await checkout(await newCart(ip, variantId), ip));
    const path = new URL(order.payment.redirectUrl).pathname;
    const f = new FormData(); f.set("result", "cancel");
    const r = await call(`${path}/complete`, { form: f, origin: API, ip: freshIp() });
    expect(r.status).toBe(302);
    expect(r.headers.get("Location")).toContain("/checkout?payment=cancelled");
    expect((await j<any>(await call(`/api/store/orders/${order.orderNumber}?t=${order.trackingToken}`))).status).toBe("awaiting_payment");
    const bad = new FormData(); bad.set("result", "nope");
    expect((await call(`${path}/complete`, { form: bad, origin: API, ip: freshIp() })).status).toBe(400);
    expect((await call(`${path}/complete`, { form: f, origin: "http://evil.test", ip: freshIp() })).status).toBe(403);

    // signed event with a wrong amount goes through verify but is refused by handlePaymentEvent's amount check
    const row = await env.DB.prepare("SELECT o.id, p.currency FROM orders o JOIN payments p ON p.order_id = o.id WHERE o.number = ?1").bind(order.orderNumber).first<any>();
    const ev = { eventId: `mock:tamper:${row.id}`, providerTxId: "x", orderId: row.id, status: "succeeded" as const, amount: 1, currency: row.currency };
    const sig = await signMockEvent(env.APP_ENCRYPTION_KEY, ev);
    const w = await call("/webhooks/payment/iyzico", { raw: JSON.stringify(ev), headers: { "x-mock-signature": sig, "Content-Type": "application/json" }, ip: freshIp(), origin: null });
    expect(w.status).toBe(200);
    expect((await w.json() as any).result).toBe("amount_mismatch");
    expect((await j<any>(await call(`/api/store/orders/${order.orderNumber}?t=${order.trackingToken}`))).status).toBe("awaiting_payment");
    const forged = await call("/webhooks/payment/iyzico", { raw: JSON.stringify(ev), headers: { "x-mock-signature": "00".repeat(32), "Content-Type": "application/json" }, ip: freshIp(), origin: null });
    expect(forged.status).toBe(401);
  });

  it("real secrets are never read in mock mode", async () => {
    await env.DB.prepare("INSERT INTO integration_configs (provider, enabled, config_public, secrets_enc, secrets_iv, key_version) VALUES ('meta', 1, '{}', x'deadbeef', x'00112233445566778899aabb', 1) ON CONFLICT(provider) DO UPDATE SET enabled = 1, secrets_enc = x'deadbeef', secrets_iv = x'00112233445566778899aabb'").run();
    await setMock(owner, true);
    expect(await getAdapter(env, db(), "meta")).not.toBeNull(); // would throw on the undecryptable ciphertext if secrets were loaded
    const list = await listIntegrations(env, db());
    expect(list.find((i) => i.provider === "meta")).toMatchObject({ enabled: true, secretsSet: { accessToken: false } });
    await setMock(owner, false);
    const [row] = await db().select().from(schema.integrationConfigs).where(eq(schema.integrationConfigs.provider, "meta"));
    await expect(loadSecrets(env, row)).rejects.toThrow(); // proves the stored ciphertext really is undecryptable

    await env.DB.prepare("DELETE FROM integration_configs WHERE provider = 'meta'").run();
  });

  it("only an owner can toggle; inbox is admin-readable and owner-clearable", async () => {
    const email = `mockadm-${Date.now()}@example.com`; const pw = "admin password 12345";
    expect((await admin(owner, "/users", "POST", { email, name: "Adm", password: pw, role: "admin" })).status).toBe(201);
    const adm = await loginAs(email, pw);
    expect((await admin(adm, "/settings/system", "PUT", { mockMode: true })).status).toBe(403);
    expect((await j<any>(await admin(owner, "/settings"))).system.mockMode).toBe(false);
    expect((await admin(adm, "/mock/messages?channel=invoice")).status).toBe(200);
    const page = await j<any>(await admin(owner, "/mock/messages?channel=sms&page=1"));
    expect(Array.isArray(page.items)).toBe(true);
    expect((await admin(adm, "/mock/messages", "DELETE")).status).toBe(403);
    expect((await admin(owner, "/mock/messages", "DELETE")).status).toBe(200);
    expect((await j<any>(await admin(owner, "/mock/messages"))).total).toBe(0);
    await setMock(owner, true); await setMock(owner, false);
    expect((await env.DB.prepare("SELECT 1 FROM audit_logs WHERE action = 'mock_mode.disabled'").first())).toBeTruthy();
  });

  it("mock off: /mock/* is 404 and mock-signed events are rejected", async () => {
    await setMock(owner, true);
    const { variantId } = await createProduct(owner);
    const ip = freshIp();
    const order = await j<any>(await checkout(await newCart(ip, variantId), ip));
    const path = new URL(order.payment.redirectUrl).pathname;
    expect((await call(path)).status).toBe(200);
    await setMock(owner, false);
    expect((await call(path)).status).toBe(404);
    const f = new FormData(); f.set("result", "success");
    expect((await call(`${path}/complete`, { form: f, origin: API, ip: freshIp() })).status).toBe(404);
    expect((await call("/mock/doc/invoice-deadbeef.pdf")).status).toBe(404);
    expect((await j<any>(await call("/api/store/config"))).mockMode).toBe(false);

    const row = await env.DB.prepare("SELECT id, total, currency FROM orders WHERE number = ?1").bind(order.orderNumber).first<any>();
    const ev = { eventId: `mock:off:${row.id}`, providerTxId: "x", orderId: row.id, status: "succeeded" as const, amount: row.total, currency: row.currency };
    const sig = await signMockEvent(env.APP_ENCRYPTION_KEY, ev);
    const w = await call("/webhooks/payment/iyzico", { raw: JSON.stringify(ev), headers: { "x-mock-signature": sig, "Content-Type": "application/json" }, ip: freshIp(), origin: null });
    expect([401, 404]).toContain(w.status);
    expect((await j<any>(await call(`/api/store/orders/${order.orderNumber}?t=${order.trackingToken}`))).status).toBe("awaiting_payment");
    // even a directly-constructed mock adapter refuses when the fresh mock flag is off
    const a = mockFactories.iyzico.create({ config: {}, secrets: {} }, { fetch: () => { throw new Error("no"); }, now: () => new Date(), db: db(), apiOrigin: API, encryptionKey: env.APP_ENCRYPTION_KEY, isMockMode: async () => false }) as any;
    await expect(a.verifyWebhook(new Request(API, { headers: { "x-mock-signature": sig } }), JSON.stringify(ev))).rejects.toThrow(/mock mode is off/);
  });
});

import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "@openshelf/db";
import worker, { runScheduled } from "../src/index";
import { isIntegrationEnabled, isMockMode, listIntegrations } from "../src/lib/integrations";
import { clearSettingsCache } from "../src/lib/settings";
import { hit } from "../src/middleware/security";
import { recallOrigin, rememberOrigin, resetRememberedOrigin } from "../src/lib/origins";
import type { Env } from "../src/env";
import { admin, call, checkout, createProduct, enablePayment, ensureOwner, freshIp, j, loginAs, newCart, OWNER, type Session } from "./helpers";

const API = "http://api.test";
const db = () => drizzle(env.DB, { schema });
let owner: Session;
const setMock = (on: boolean) => admin(owner, "/settings/system", "PUT", { mockMode: on });
const raw = (on: boolean) => env.DB.prepare(`INSERT INTO store_settings ("group", value, updated_at) VALUES ('system', ?1, unixepoch()) ON CONFLICT("group") DO UPDATE SET value = ?1`).bind(JSON.stringify({ mockMode: on })).run();
const reset = async () => {
  await env.DB.exec("UPDATE integration_configs SET enabled = 0 WHERE provider = 'iyzico'");
  await env.DB.exec("UPDATE orders SET status = 'delivered' WHERE status IN ('paid','fulfilling','shipped') AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.order_id = orders.id AND p.is_mock = 1)");
};
const withEnv = async (patch: Partial<Env>, fn: () => Promise<void>) => {
  const e = env as unknown as Record<string, unknown>; const old: Record<string, unknown> = {};
  for (const k of Object.keys(patch)) { old[k] = e[k]; e[k] = (patch as Record<string, unknown>)[k]; }
  try { await fn(); } finally { for (const k of Object.keys(old)) e[k] = old[k]; }
};

beforeAll(async () => { owner = await ensureOwner(); await reset(); await raw(false); clearSettingsCache(); });
afterAll(async () => { await raw(false); clearSettingsCache(); });

async function paidMockOrder() {
  expect((await setMock(true)).status).toBe(200);
  const { variantId } = await createProduct(owner, { price: 20000 });
  const ip = freshIp();
  const order = await j<any>(await checkout(await newCart(ip, variantId), ip));
  const f = new FormData(); f.set("result", "success");
  const r = await call(`${new URL(order.payment.redirectUrl).pathname}/complete`, { form: f, origin: API, ip: freshIp() });
  expect(r.status).toBe(302);
  const o = await env.DB.prepare("SELECT id FROM orders WHERE number = ?1").bind(order.orderNumber).first<{ id: string }>();
  return o!.id;
}

describe("fresh mock flag (item 1)", () => {
  it("toggling off is visible immediately to every reader, even when written behind the cache", async () => {
    await raw(true);
    expect(await isMockMode(db())).toBe(true);
    expect(await isIntegrationEnabled(env, db(), "iyzico")).toBe(true);
    expect((await listIntegrations(env, db())).every((i) => i.mock)).toBe(true);
    await raw(false);
    expect(await isMockMode(db())).toBe(false);
    expect(await isIntegrationEnabled(env, db(), "iyzico")).toBe(false);
    expect((await listIntegrations(env, db())).some((i) => i.mock)).toBe(false);
    expect((await j<any>(await call("/api/store/config"))).mockMode).toBe(false);
  });
});

describe("mock vs real money (items 2, 3)", () => {
  it("refuses to enable when ALLOW_MOCK is not set (deployed default)", async () => {
    await withEnv({ ALLOW_MOCK: undefined, ENVIRONMENT: undefined }, async () => {
      const st = await j<any>(await admin(owner, "/mock/status"));
      expect(st.allowed).toBe(false);
      expect(st.reason).toMatch(/ALLOW_MOCK/);
      const r = await setMock(true);
      expect(r.status).toBe(403);
      expect((await j<any>(r)).error.code).toBe("mock_not_allowed");
    });
    expect((await j<any>(await admin(owner, "/mock/status"))).allowed).toBe(true);
  });

  it("refuses to enable while a real payment provider is enabled, or real paid orders exist", async () => {
    await enablePayment(owner);
    let r = await setMock(true);
    expect(r.status).toBe(409);
    expect((await j<any>(r)).error.code).toBe("real_payment_enabled");
    await env.DB.exec("UPDATE integration_configs SET enabled = 0 WHERE provider = 'iyzico'");

    await env.DB.prepare(`INSERT INTO orders (id, number, status, email, shipping_address, currency, subtotal, total, tracking_token) VALUES ('real-paid-1','OS-REAL1','paid','x@example.com','{}','TRY',100,100,'t')`).run();
    r = await setMock(true);
    expect(r.status).toBe(409);
    expect((await j<any>(r)).error.code).toBe("real_orders_in_flight");
    await env.DB.exec("UPDATE orders SET status = 'delivered' WHERE id = 'real-paid-1'");
    expect((await setMock(true)).status).toBe(200);
    expect((await setMock(false)).status).toBe(200);
  });

  it("mock payments are flagged; refunds cross mock/real are blocked; UI fields and dashboard exclude mock revenue", async () => {
    const before = await j<any>(await admin(owner, "/dashboard"));
    const orderId = await paidMockOrder();
    const pay = await env.DB.prepare("SELECT is_mock FROM payments WHERE order_id = ?1").bind(orderId).first<{ is_mock: number }>();
    expect(pay!.is_mock).toBe(1);

    const detail = await j<any>(await admin(owner, `/orders/${orderId}`));
    expect(detail.isMock).toBe(true);
    expect(detail.payments[0].isMock).toBe(true);
    const list = await j<any>(await admin(owner, "/orders?pageSize=100"));
    expect(list.items.find((o: any) => o.id === orderId).isMock).toBe(true);

    const after = await j<any>(await admin(owner, "/dashboard"));
    expect(after.salesWeek.total).toBe(before.salesWeek.total);
    expect(after.mockSalesWeek.total).toBeGreaterThanOrEqual(before.mockSalesWeek.total + 20000);

    // mock turned off: refunding a mock payment must be refused
    expect((await setMock(false)).status).toBe(200);
    const r = await admin(owner, `/orders/${orderId}/refund`, "POST", { amount: 100 });
    expect(r.status).toBe(409);
    expect((await j<any>(r)).error.code).toBe("mock_mismatch");
    // with mock on it is allowed
    expect((await setMock(true)).status).toBe(200);
    expect((await admin(owner, `/orders/${orderId}/refund`, "POST", { amount: 100 })).status).toBe(200);
    // and a real payment cannot be refunded in mock mode
    await env.DB.prepare("UPDATE payments SET is_mock = 0 WHERE order_id = ?1").bind(orderId).run();
    const r2 = await admin(owner, `/orders/${orderId}/refund`, "POST", { amount: 100 });
    expect(r2.status).toBe(409);
    await env.DB.prepare("UPDATE payments SET is_mock = 1 WHERE order_id = ?1").bind(orderId).run();
    await setMock(false);
  });

  it("/mock/pay/:token/complete needs a same-origin Origin header", async () => {
    expect((await setMock(true)).status).toBe(200);
    const { variantId } = await createProduct(owner, { price: 5000 });
    const ip = freshIp();
    const order = await j<any>(await checkout(await newCart(ip, variantId), ip));
    const path = new URL(order.payment.redirectUrl).pathname;
    const f = () => { const x = new FormData(); x.set("result", "success"); return x; };
    expect((await call(`${path}/complete`, { form: f(), origin: null, ip: freshIp() })).status).toBe(403);
    expect((await call(`${path}/complete`, { form: f(), origin: "https://evil.example", ip: freshIp() })).status).toBe(403);
    expect((await call(`${path}/complete`, { form: f(), origin: API, ip: freshIp() })).status).toBe(302);
    await setMock(false);
  });

  it("caps checkouts per IP while mock mode is on", async () => {
    expect((await setMock(true)).status).toBe(200);
    const ip = freshIp();
    for (let i = 0; i < 20; i++) await hit(env.DB, `checkout-mock:${ip}`, 600);
    const { variantId } = await createProduct(owner);
    const r = await checkout(await newCart(ip, variantId), ip);
    expect(r.status).toBe(429);
    await setMock(false);
  });
});

describe("mock_messages retention (item 5)", () => {
  it("cron prunes rows older than 7 days and caps the table at 2000", async () => {
    const now = Math.floor(Date.now() / 1000);
    await env.DB.exec("DELETE FROM mock_messages");
    await env.DB.prepare("INSERT INTO mock_messages (channel, body, created_at) VALUES ('sms','old',?1)").bind(now - 8 * 86400).run();
    const stmts = [];
    for (let i = 0; i < 2100; i++) stmts.push(env.DB.prepare("INSERT INTO mock_messages (channel, body, created_at) VALUES ('sms','new',?1)").bind(now));
    for (let i = 0; i < stmts.length; i += 500) await env.DB.batch(stmts.slice(i, i + 500));
    const hourStart = new Date(Math.floor(Date.now() / 3_600_000) * 3_600_000);
    await runScheduled(env, hourStart);
    const rows = await env.DB.prepare("SELECT COUNT(*) AS n, SUM(body = 'old') AS old FROM mock_messages").first<{ n: number; old: number }>();
    expect(rows!.old ?? 0).toBe(0);
    expect(rows!.n).toBeLessThanOrEqual(2001);
    expect(rows!.n).toBeGreaterThan(1900);
  });
});

describe("origins (item 6 + remembered-origin poisoning)", () => {
  const unset = { ADMIN_ORIGIN: "", STOREFRONT_ORIGIN: "", API_ORIGIN: "" };
  const fetchAs = async (e: Partial<Env>, url: string, init: RequestInit) => {
    const ctx = createExecutionContext();
    const res = await worker.fetch(new Request(url, init), { ...env, ...e } as Env, ctx);
    await waitOnExecutionContext(ctx);
    return res;
  };
  const clearOrigin = async () => { resetRememberedOrigin(); await env.DB.exec(`DELETE FROM store_settings WHERE "group" = '_runtime_origin'`); };

  it("pinned origins never accept the request host (admin + CORS)", async () => {
    const pinned = { ADMIN_ORIGIN: "https://admin.pin", STOREFRONT_ORIGIN: "https://shop.pin", API_ORIGIN: "https://api.pin" };
    const r = await fetchAs(pinned, "https://evil.example/api/admin/auth/logout", { method: "POST", headers: { Origin: "https://evil.example" }, body: "{}" });
    expect(r.status).toBe(403);
    const c = await fetchAs(pinned, "https://evil.example/api/store/config", { headers: { Origin: "https://evil.example" } });
    expect(c.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("dashboard flags derived origins on workers.dev only", async () => {
    const s = await loginAs(OWNER.email, OWNER.password);
    const get = (e: Partial<Env>, host: string) => fetchAs(e, `https://${host}/api/admin/dashboard`, { headers: { Cookie: s.cookie, "CF-Connecting-IP": s.ip } }).then((r) => r.json() as Promise<any>);
    expect((await get(unset, "shop.acme.workers.dev")).originNotice).toBe("derived_origins_workers_dev");
    expect((await get(unset, "shop.example.org")).originNotice).toBeNull();
    expect((await get({ ADMIN_ORIGIN: "https://a.workers.dev", STOREFRONT_ORIGIN: "https://a.workers.dev", API_ORIGIN: "https://a.workers.dev" }, "a.workers.dev")).originNotice).toBeNull();
  });

  it("remembered admin origin cannot be poisoned: unauthenticated, staff, or non-admin-origin requests never record it", async () => {
    await clearOrigin();
    // 1. anonymous request with a forged Host
    await fetchAs(unset, "https://evil.example/api/admin/auth/me", {});
    await fetchAs(unset, "https://evil.example/api/store/config", {});
    expect(await recallOrigin(env.DB)).toBe("");
    // 2. rememberOrigin with a mismatching admin origin is a no-op
    await rememberOrigin(env.DB, "https://evil.example/x", "https://admin.pin");
    expect(await recallOrigin(env.DB)).toBe("");
    // 3. authenticated owner but request origin is not the pinned ADMIN_ORIGIN
    const s = await loginAs(OWNER.email, OWNER.password);
    await fetchAs({ ADMIN_ORIGIN: "https://admin.pin", STOREFRONT_ORIGIN: "https://shop.pin", API_ORIGIN: "https://api.pin" }, "https://evil.example/api/admin/auth/me", { headers: { Cookie: s.cookie } });
    expect(await recallOrigin(env.DB)).toBe("");
    // 4. staff accounts never record
    const staffEmail = "staff-origin@example.com"; const pw = "another long staff passphrase 1";
    const created = await admin(owner, "/admins", "POST", { email: staffEmail, name: "Staff", password: pw, role: "staff" });
    if (created.status === 201 || created.status === 200) {
      const st = await loginAs(staffEmail, pw).catch(() => null);
      if (st) { await fetchAs(unset, "https://staff.example.org/api/admin/auth/me", { headers: { Cookie: st.cookie } }); expect(await recallOrigin(env.DB)).toBe(""); }
    }
    // 5. owner on the real admin origin does record
    await fetchAs(unset, "https://shop.example.org/api/admin/auth/me", { headers: { Cookie: s.cookie } });
    expect(await recallOrigin(env.DB)).toBe("https://shop.example.org");
    await clearOrigin();
  });
});

import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { ADDRESS, admin, call, checkout, createProduct, enablePayment, ensureOwner, freshIp, installFakes, j, newCart, sentEvents, webhook } from "./helpers";
import { canTransition, assertTransition, InvalidTransitionError, reserveStock, InsufficientStockError } from "@openshelf/core";
import { ORDER_STATUSES, ORDER_TRANSITIONS } from "@openshelf/shared";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "@openshelf/db";
import { registerJobHandler, runOutbox, backoffSeconds } from "../src/outbox";
import { runScheduled } from "../src/index";

const db = () => drizzle(env.DB, { schema });
const stock = (variantId: string) => env.DB.prepare("SELECT total, reserved FROM inventory WHERE variant_id = ?1").bind(variantId).first<{ total: number; reserved: number }>();
const orderOf = (number: string) => env.DB.prepare("SELECT * FROM orders WHERE number = ?1").bind(number).first<any>();

async function placeOrder(price = 10000, stockQty = 10, qty = 1) {
  const s = await ensureOwner(); await enablePayment(s);
  const { variantId } = await createProduct(s, { price, stock: stockQty });
  const cart = await newCart(freshIp(), variantId, qty);
  const r = await checkout(cart);
  expect(r.status).toBe(201);
  const body = await j<any>(r);
  const order = await orderOf(body.orderNumber);
  return { s, variantId, body, order };
}
const paidEvent = (order: any, eventId = crypto.randomUUID()) => ({ eventId, orderId: order.id, status: "succeeded", amount: order.total, currency: order.currency, providerTxId: `tx_${eventId}` });

describe("checkout", () => {
  it("recomputes price server-side from DB (price change after add-to-cart is honoured; client cannot set prices)", async () => {
    const s = await ensureOwner(); await enablePayment(s);
    const { variantId, product } = await createProduct(s, { price: 10000, stock: 5 });
    const cart = await newCart(freshIp(), variantId, 2);
    const put = await admin(s, `/products/${product.id}`, "PUT", { ...product, variants: [{ id: variantId, sku: product.variants[0].sku, prices: { website: 12500 }, active: true, position: 0 }], images: [] });
    expect(put.status).toBe(200);
    const res = await call("/api/store/checkout", { json: { cartId: cart, email: "b@example.com", shippingAddress: ADDRESS, consent: { analytics: false, marketing: false }, acceptedTerms: true, total: 1, items: [{ variantId, price: 1 }] }, ip: freshIp(), origin: "http://shop.test" });
    expect(res.status).toBe(201);
    const body = await j<any>(res);
    expect(body.payment.redirectUrl).toContain("https://pay.test/");
    expect(body.trackingToken.length).toBeGreaterThan(20);
    const order = await orderOf(body.orderNumber);
    expect(order.subtotal).toBe(25000);
    expect(order.total).toBe(25000);
    expect(order.status).toBe("awaiting_payment");
    expect(JSON.parse(order.consent)).toMatchObject({ analytics: false, marketing: false });
    const pay = await env.DB.prepare("SELECT * FROM payments WHERE order_id = ?1").bind(order.id).first<any>();
    expect(pay.amount).toBe(25000); expect(pay.status).toBe("pending");
    expect((await stock(variantId))!.reserved).toBe(2);
  });

  it("requires acceptedTerms and a non-empty cart", async () => {
    const s = await ensureOwner(); await enablePayment(s);
    const cart = await newCart(freshIp());
    expect((await checkout(cart)).status).toBe(400);
    const r = await call("/api/store/checkout", { json: { cartId: cart, email: "a@b.co", shippingAddress: ADDRESS, consent: {}, acceptedTerms: false }, ip: freshIp(), origin: "http://shop.test" });
    expect(r.status).toBe(400);
  });

  it("public order view needs the tracking token", async () => {
    const { body } = await placeOrder();
    expect((await call(`/api/store/orders/${body.orderNumber}?t=${body.trackingToken}`)).status).toBe(200);
    expect((await call(`/api/store/orders/${body.orderNumber}?t=wrong`)).status).toBe(404);
    expect((await call(`/api/store/orders/${body.orderNumber}`)).status).toBe(404);
  });
});

describe("inventory: oversell protection", () => {
  it("parallel checkouts never reserve more than available", async () => {
    const s = await ensureOwner(); await enablePayment(s);
    const { variantId } = await createProduct(s, { stock: 3 });
    const carts = await Promise.all(Array.from({ length: 6 }, () => newCart(freshIp(), variantId, 1)));
    const results = await Promise.all(carts.map((c) => checkout(c)));
    const codes = results.map((r) => r.status);
    expect(codes.filter((x) => x === 201).length).toBe(3);
    expect(codes.filter((x) => x === 409).length).toBe(3);
    const st = (await stock(variantId))!;
    expect(st.reserved).toBe(3); expect(st.total).toBe(3);
  });

  it("core reserveStock is all-or-nothing and compensates partial success", async () => {
    const s = await ensureOwner();
    const a = await createProduct(s, { stock: 5 }); const b = await createProduct(s, { stock: 1 });
    await expect(reserveStock(db() as never, [{ variantId: a.variantId, quantity: 2 }, { variantId: b.variantId, quantity: 2 }], { ttlSeconds: 60 })).rejects.toBeInstanceOf(InsufficientStockError);
    expect((await stock(a.variantId))!.reserved).toBe(0);
    expect((await stock(b.variantId))!.reserved).toBe(0);
    await reserveStock(db() as never, [{ variantId: a.variantId, quantity: 5 }], { ttlSeconds: 60 });
    await expect(reserveStock(db() as never, [{ variantId: a.variantId, quantity: 1 }], { ttlSeconds: 60 })).rejects.toBeInstanceOf(InsufficientStockError);
  });

  it("safety stock is respected and reservations expire via cron", async () => {
    const s = await ensureOwner(); await enablePayment(s);
    const { variantId } = await createProduct(s, { stock: 2 });
    await env.DB.prepare("UPDATE inventory SET safety_stock = 1 WHERE variant_id = ?1").bind(variantId).run();
    const c1 = await newCart(freshIp(), variantId, 2);
    expect((await checkout(c1)).status).toBe(409);
    const c2 = await newCart(freshIp(), variantId, 1);
    const ok = await j<any>(await checkout(c2));
    const order = await orderOf(ok.orderNumber);
    await env.DB.prepare("UPDATE inventory_reservations SET expires_at = unixepoch() - 5 WHERE order_id = ?1").bind(order.id).run();
    await runScheduled(env);
    expect((await stock(variantId))!.reserved).toBe(0);
    expect((await orderOf(ok.orderNumber)).status).toBe("cancelled");
  });

  it("admin adjustments are ledgered and cannot go below reserved", async () => {
    const s = await ensureOwner();
    const { variantId } = await createProduct(s, { stock: 2 });
    expect((await admin(s, `/inventory/${variantId}/adjust`, "POST", { delta: 5, reason: "restock" })).status).toBe(200);
    expect((await stock(variantId))!.total).toBe(7);
    expect((await admin(s, `/inventory/${variantId}/adjust`, "POST", { delta: -50, reason: "oops" })).status).toBe(409);
  });
});

describe("payment webhook", () => {
  it("bad signature -> 401, valid -> order paid + stock sold + jobs; replay is a no-op", async () => {
    const { s, variantId, order } = await placeOrder(10000, 10, 2);
    installFakes();
    await admin(s, "/integrations/ga4", "PUT", { enabled: true, config: {}, secrets: {} });
    const ev = paidEvent(order);
    expect((await webhook(ev, "forged")).status).toBe(401);
    expect((await orderOf(order.number)).status).toBe("awaiting_payment");

    const ok = await webhook(ev);
    expect(ok.status).toBe(200);
    expect((await j<any>(ok)).result).toBe("processed");
    const paid = await orderOf(order.number);
    expect(paid.status).toBe("paid");
    expect(await stock(variantId)).toEqual({ total: 8, reserved: 0 });
    const mv = await env.DB.prepare("SELECT delta, reason FROM inventory_movements WHERE variant_id = ?1 AND reason = 'sale'").bind(variantId).all<any>();
    expect(mv.results).toEqual([{ delta: -2, reason: "sale" }]);
    const res = await env.DB.prepare("SELECT status FROM inventory_reservations WHERE order_id = ?1").bind(order.id).all<any>();
    expect(res.results.every((r) => r.status === "converted")).toBe(true);
    const pay = await env.DB.prepare("SELECT status FROM payments WHERE order_id = ?1").bind(order.id).first<any>();
    expect(pay.status).toBe("succeeded");
    const jobs = await env.DB.prepare("SELECT kind FROM outbox_jobs WHERE dedupe_key LIKE ?1").bind(`%${order.id}`).all<any>();
    expect(jobs.results.map((x) => x.kind)).toContain("marketing.purchase.ga4");

    expect((await j<any>(await webhook(ev))).result).toBe("duplicate");
    await webhook(paidEvent(order)); // new event id, same payment: state guards keep it a no-op
    expect(await stock(variantId)).toEqual({ total: 8, reserved: 0 });
    const sales = await env.DB.prepare("SELECT COUNT(*) AS n FROM inventory_movements WHERE variant_id = ?1 AND reason = 'sale'").bind(variantId).first<any>();
    expect(sales.n).toBe(1);
    const jobCount = await env.DB.prepare("SELECT COUNT(*) AS n FROM outbox_jobs WHERE dedupe_key = ?1").bind(`marketing.purchase.ga4:${order.id}`).first<any>();
    expect(jobCount.n).toBe(1);

    const view = await j<any>(await call(`/api/store/orders/${order.number}?t=${paid.tracking_token}`));
    expect(view.status).toBe("paid"); expect(view.purchaseEventId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("amount mismatch does not mark the order paid", async () => {
    const { order } = await placeOrder();
    const r = await j<any>(await webhook({ ...paidEvent(order), amount: 1 }));
    expect(r.result).toBe("amount_mismatch");
    expect((await orderOf(order.number)).status).toBe("awaiting_payment");
  });

  it("callback route verifies and 302s to storefront order page; bad signature redirects to failure", async () => {
    const { order } = await placeOrder();
    const res = await call("/api/store/payment/callback/iyzico", { raw: JSON.stringify(paidEvent(order)), headers: { "x-test-signature": "valid-signature" }, ip: freshIp(), origin: null });
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe(`http://shop.test/order/${order.number}?t=${order.tracking_token}`);
    const bad = await call("/api/store/payment/callback/iyzico", { raw: JSON.stringify(paidEvent(order)), headers: { "x-test-signature": "x" }, ip: freshIp(), origin: null });
    expect(bad.status).toBe(302); expect(bad.headers.get("Location")).toContain("payment=failed");
  });
});

describe("order state machine", () => {
  it("transition table: only allowed edges", () => {
    for (const a of ORDER_STATUSES) for (const b of ORDER_STATUSES) expect(canTransition(a, b)).toBe(ORDER_TRANSITIONS[a].includes(b));
    expect(() => assertTransition("delivered", "paid")).toThrow(InvalidTransitionError);
    expect(() => assertTransition("paid", "fulfilling")).not.toThrow();
  });

  it("admin endpoint enforces it, releases/restocks on cancel", async () => {
    const { s, variantId, order } = await placeOrder(5000, 4, 1);
    expect((await admin(s, `/orders/${order.id}/status`, "POST", { status: "shipped" })).status).toBe(409);
    expect((await admin(s, `/orders/${order.id}/status`, "POST", { status: "paid" })).status).toBe(400);
    expect((await stock(variantId))!.reserved).toBe(1);
    expect((await admin(s, `/orders/${order.id}/status`, "POST", { status: "cancelled" })).status).toBe(200);
    expect(await stock(variantId)).toEqual({ total: 4, reserved: 0 });
    expect((await admin(s, `/orders/${order.id}/status`, "POST", { status: "awaiting_payment" })).status).toBe(409);

    const p2 = await placeOrder(5000, 4, 2);
    await webhook(paidEvent(p2.order));
    expect(await stock(p2.variantId)).toEqual({ total: 2, reserved: 0 });
    expect((await admin(p2.s, `/orders/${p2.order.id}/status`, "POST", { status: "fulfilling" })).status).toBe(200);
    expect((await admin(p2.s, `/orders/${p2.order.id}/status`, "POST", { status: "cancelled" })).status).toBe(200);
    expect(await stock(p2.variantId)).toEqual({ total: 4, reserved: 0 });
    const detail = await j<any>(await admin(p2.s, `/orders/${p2.order.id}`));
    expect(detail.items.length).toBe(1); expect(detail.payments.length).toBe(1); expect(detail.trackingToken).toBeUndefined();
    expect(detail.events.some((e: any) => e.type === "order.status")).toBe(true);
  });
});

describe("outbox", () => {
  it("claims atomically, retries with backoff, dead-letters after max attempts", async () => {
    let calls = 0; let okRuns = 0;
    registerJobHandler("test.flaky", async () => { calls++; throw new Error("boom"); });
    registerJobHandler("test.ok", async () => { okRuns++; });
    const now = new Date();
    const mk = async (kind: string, max = 3) => { const id = crypto.randomUUID(); await env.DB.prepare("INSERT INTO outbox_jobs (id, kind, payload, status, attempts, max_attempts, next_run_at) VALUES (?1, ?2, '{}', 'pending', 0, ?3, ?4)").bind(id, kind, max, Math.floor(now.getTime() / 1000) - 1).run(); return id; };
    const ok = await mk("test.ok"); const bad = await mk("test.flaky", 2);
    await Promise.all([runOutbox(env, { now, limit: 50 }), runOutbox(env, { now, limit: 50 })]);
    expect(okRuns).toBe(1);
    const st = async (id: string) => env.DB.prepare("SELECT status, attempts, next_run_at, last_error FROM outbox_jobs WHERE id = ?1").bind(id).first<any>();
    expect((await st(ok)).status).toBe("done");
    const a1 = await st(bad);
    expect(a1.status).toBe("pending"); expect(a1.attempts).toBe(1); expect(a1.last_error).toBe("boom");
    expect(a1.next_run_at).toBeGreaterThan(Math.floor(now.getTime() / 1000));
    expect(backoffSeconds(1)).toBeLessThan(backoffSeconds(3));
    await runOutbox(env, { now: new Date(now.getTime() + 3600_000), limit: 500 });
    expect((await st(bad)).status).toBe("dead");
    expect(calls).toBe(2);
    const s = await ensureOwner();
    const dead = await j<any>(await admin(s, "/outbox?status=dead"));
    expect(dead.items.some((x: any) => x.id === bad)).toBe(true);
    expect((await admin(s, `/outbox/${bad}/retry`, "POST")).status).toBe(200);
    expect((await st(bad)).status).toBe("pending");
  });
});

describe("storefront misc", () => {
  it("track endpoint: validates, refuses server-only events, honours consent, dedups", async () => {
    const s = await ensureOwner(); installFakes(); await admin(s, "/integrations/ga4", "PUT", { enabled: true, config: {}, secrets: {} });
    const ev = { event_id: crypto.randomUUID(), name: "view_item", items: [{ id: "v1", name: "x", price: 1, quantity: 1 }] };
    const vid = `vis-${crypto.randomUUID()}`;
    const post = (b: any) => call("/api/store/track", { json: { attribution: { visitorId: vid }, ...b }, ip: freshIp(), origin: "http://shop.test" });
    const setConsent = (analytics: boolean) => call("/api/store/consent", { json: { visitorId: vid, analytics, marketing: false }, ip: freshIp(), origin: "http://shop.test" });
    expect((await post({ event: { ...ev, name: "purchase" } })).status).toBe(400);
    expect((await post({ event: { name: "view_item" } })).status).toBe(400);
    expect((await call("/api/store/track", { json: { event: ev }, ip: freshIp(), origin: "http://shop.test" })).status).toBe(400); // visitorId required
    const before = sentEvents.length;
    // client-claimed consent is advisory only: no stored consent row => nothing forwarded
    expect((await post({ event: ev, consent: { analytics: true, marketing: true } })).status).toBe(204);
    expect(sentEvents.length).toBe(before);
    await setConsent(true);
    const ev2 = { ...ev, event_id: crypto.randomUUID() };
    expect((await post({ event: ev2, consent: { analytics: false, marketing: false } })).status).toBe(204);
    expect(sentEvents.length).toBe(before + 1);
    await post({ event: ev2 });
    expect(sentEvents.length).toBe(before + 1);
    await setConsent(false); // revocation (latest row wins)
    await post({ event: { ...ev, event_id: crypto.randomUUID() } });
    expect(sentEvents.length).toBe(before + 1);
  });

  it("search is rate limited (429)", async () => {
    const ip = freshIp(); let last = 0;
    for (let i = 0; i < 62; i++) last = (await call("/api/store/search?q=abc", { ip })).status;
    expect(last).toBe(429);
  });

  it("feeds use variant id; sitemap and robots work", async () => {
    const s = await ensureOwner();
    const { variantId, slug } = await createProduct(s, { stock: 3 });
    const xml = await (await call("/feeds/meta.xml")).text();
    expect(xml).toContain(`<g:id>${variantId}</g:id>`); expect(xml).toContain("in stock");
    expect(await (await call("/feeds/meta.csv")).text()).toContain(variantId);
    expect(await (await call("/sitemap.xml")).text()).toContain(`/product/${slug}`);
    expect(await (await call("/robots.txt")).text()).toContain("Sitemap:");
  });

  it("dashboard, export (no secrets), CSV import and KVKK anonymize", async () => {
    const { s, order } = await placeOrder();
    const d = await j<any>(await admin(s, "/dashboard"));
    expect(d.ordersByStatus.awaiting_payment).toBeGreaterThan(0); expect(d.salesToday).toHaveProperty("total");
    const cfg = await (await admin(s, "/export/config.json")).text();
    expect(cfg).not.toMatch(/secret-abcdef|key-123456|secrets_enc/);
    const csv = await (await admin(s, "/export/products.csv")).text();
    expect(csv.split("\r\n")[0]).toContain("slug,name_tr");
    const f = new FormData(); f.set("file", new File(["slug,name_tr,sku,price,stock,status\nimp-1,Imported,IMP-1,19.90,7,active\n"], "p.csv", { type: "text/csv" }));
    const imp = await j<any>(await call("/api/admin/import/products", { form: f, cookie: s.cookie, csrf: s.csrf, ip: s.ip }));
    expect(imp.created === 1 || imp.updated === 1).toBe(true);
    const f2 = new FormData(); f2.set("file", new File(["slug,name_tr,sku,price,stock,status\nimp-1,Imported 2,IMP-1,29.90,9,active\n"], "p.csv", { type: "text/csv" }));
    expect((await j<any>(await call("/api/admin/import/products", { form: f2, cookie: s.cookie, csrf: s.csrf, ip: s.ip }))).updated).toBe(1);
    const pv = await j<any>(await call("/api/store/products/imp-1"));
    expect(pv.variants[0].price).toBe(2990); expect(pv.variants[0].available).toBe(9);
    expect((await admin(s, `/customers/${order.customer_id}/anonymize`, "POST")).status).toBe(200);
    const o = await env.DB.prepare("SELECT email, shipping_address FROM orders WHERE id = ?1").bind(order.id).first<any>();
    expect(o.email).toContain("anonymized.invalid"); expect(o.shipping_address).not.toContain("Ayşe");
  });
});

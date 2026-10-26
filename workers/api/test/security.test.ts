import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { admin, call, checkout, createProduct, enablePayment, ensureOwner, freshIp, j, loginAs, newCart, webhook } from "./helpers";
import { totpCode } from "../src/lib/crypto";
import { runScheduled } from "../src/index";

const stock = (variantId: string) => env.DB.prepare("SELECT total, reserved FROM inventory WHERE variant_id = ?1").bind(variantId).first<{ total: number; reserved: number }>();
const orderOf = (number: string) => env.DB.prepare("SELECT * FROM orders WHERE number = ?1").bind(number).first<any>();
const couponUsed = (code: string) => env.DB.prepare("SELECT used FROM coupons WHERE code = ?1").bind(code).first<{ used: number }>().then((r) => r!.used);

describe("checkout: stock-hold DoS", () => {
  it("re-checkout of the same cart releases the previous unpaid order; a paid cart is consumed", async () => {
    const s = await ensureOwner(); await enablePayment(s);
    const { variantId } = await createProduct(s, { stock: 5 });
    const ip = freshIp();
    const cart = await newCart(ip, variantId, 2);
    const first = await j<any>(await checkout(cart, ip));
    expect((await stock(variantId))!.reserved).toBe(2);
    const second = await checkout(cart, ip);
    expect(second.status).toBe(201);
    const secondBody = await j<any>(second);
    expect((await orderOf(first.orderNumber)).status).toBe("cancelled");
    expect((await orderOf(secondBody.orderNumber)).status).toBe("awaiting_payment");
    expect((await stock(variantId))!.reserved).toBe(2); // not 4: previous hold was released
    const row = await env.DB.prepare("SELECT checked_out_order_id FROM carts WHERE id = ?1").bind(cart).first<any>();
    expect(row.checked_out_order_id).toBe((await orderOf(secondBody.orderNumber)).id);
    // pay for it -> cart is consumed
    const order = await orderOf(secondBody.orderNumber);
    await webhook({ eventId: crypto.randomUUID(), orderId: order.id, status: "succeeded", amount: order.total, currency: order.currency, providerTxId: "tx_consumed" });
    expect((await orderOf(secondBody.orderNumber)).status).toBe("paid");
    const third = await checkout(cart, ip);
    expect(third.status).toBe(409);
    expect((await j<any>(third)).error.code).toBe("cart_already_checked_out");
    expect((await stock(variantId))!.reserved).toBe(0 + 0); // paid stock is committed, nothing re-held
  });

  it("parallel checkouts on one cart create only one live order", async () => {
    const s = await ensureOwner(); await enablePayment(s);
    const { variantId } = await createProduct(s, { stock: 9 });
    const ip = freshIp();
    const cart = await newCart(ip, variantId, 1);
    const rs = await Promise.all([1, 2, 3].map(() => checkout(cart, ip)));
    const ok = rs.filter((r) => r.status === 201).length;
    expect(ok).toBeGreaterThanOrEqual(1);
    const live = await env.DB.prepare("SELECT count(*) AS n FROM orders WHERE client_ip = ?1 AND status = 'awaiting_payment'").bind(ip).first<any>();
    expect(live.n).toBe(1);
    expect((await stock(variantId))!.reserved).toBe(1);
  });

  it("caps unpaid orders per email+IP (3) across different carts", async () => {
    const s = await ensureOwner(); await enablePayment(s);
    const { variantId } = await createProduct(s, { stock: 20 });
    const ip = freshIp(); const email = `hold-${Date.now()}@example.com`;
    const codes: number[] = [];
    for (let i = 0; i < 4; i++) codes.push((await checkout(await newCart(ip, variantId, 1), ip, email)).status);
    expect(codes).toEqual([201, 201, 201, 429]);
    expect((await stock(variantId))!.reserved).toBe(3);
    // a different email from the same IP is not blocked by the pair cap
    expect((await checkout(await newCart(ip, variantId, 1), ip, `other-${Date.now()}@example.com`)).status).toBe(201);
  });

  it("requires a Turnstile token when TURNSTILE_SECRET is set", async () => {
    const s = await ensureOwner(); await enablePayment(s);
    const { variantId } = await createProduct(s, { stock: 3 });
    const ip = freshIp();
    const cart = await newCart(ip, variantId, 1);
    (env as any).TURNSTILE_SECRET = "test-secret";
    try {
      const r = await checkout(cart, ip);
      expect(r.status).toBe(403);
      expect((await j<any>(r)).error.code).toBe("turnstile_failed");
      expect((await stock(variantId))!.reserved).toBe(0);
    } finally { delete (env as any).TURNSTILE_SECRET; }
  });
});

describe("coupons", () => {
  const mk = async (s: any, code: string, extra: Record<string, unknown> = {}) => {
    const r = await admin(s, "/coupons", "POST", { code, type: "fixed", value: 100, minSubtotal: 0, active: true, ...extra });
    expect(r.status).toBe(201);
  };
  const withCoupon = async (variantId: string, code: string, ip: string) => {
    const cart = await newCart(ip, variantId, 1);
    const r = await call(`/api/store/cart/${cart}/coupon`, { json: { code }, ip, origin: "http://shop.test" });
    expect(r.status).toBe(200);
    return cart;
  };

  it("one use per email by default; maxUsesPerCustomer raises the limit", async () => {
    const s = await ensureOwner(); await enablePayment(s);
    const { variantId } = await createProduct(s, { stock: 20 });
    const code = `ONCE${Date.now() % 100000}`; const email = `c-${Date.now()}@example.com`;
    await mk(s, code);
    const ip = freshIp();
    expect((await checkout(await withCoupon(variantId, code, ip), ip, email)).status).toBe(201);
    const again = await checkout(await withCoupon(variantId, code, ip), ip, email);
    expect(again.status).toBe(409);
    expect((await j<any>(again)).error.code).toBe("coupon_already_used");
    expect(await couponUsed(code)).toBe(1);
    // other email may still use it
    expect((await checkout(await withCoupon(variantId, code, ip), ip, `z-${email}`)).status).toBe(201);

    const code2 = `TWICE${Date.now() % 100000}`;
    await mk(s, code2, { maxUsesPerCustomer: 2 });
    for (const want of [201, 201, 409]) { const ip2 = freshIp(); expect((await checkout(await withCoupon(variantId, code2, ip2), ip2, email)).status).toBe(want); }
    expect(await couponUsed(code2)).toBe(2);
  });

  it("releases used count when the order is cancelled unpaid or the reservation expires", async () => {
    const s = await ensureOwner(); await enablePayment(s);
    const { variantId } = await createProduct(s, { stock: 20 });
    const code = `REL${Date.now() % 100000}`;
    await mk(s, code, { maxUses: 5 });
    const ip = freshIp();
    const a = await j<any>(await checkout(await withCoupon(variantId, code, ip), ip, `a-${Date.now()}@example.com`));
    const b = await j<any>(await checkout(await withCoupon(variantId, code, ip), ip, `b-${Date.now()}@example.com`));
    expect(await couponUsed(code)).toBe(2);
    const oa = await orderOf(a.orderNumber);
    expect((await admin(s, `/orders/${oa.id}/status`, "POST", { status: "cancelled" })).status).toBe(200);
    expect(await couponUsed(code)).toBe(1);
    const ob = await orderOf(b.orderNumber);
    await env.DB.prepare("UPDATE inventory_reservations SET expires_at = unixepoch() - 5 WHERE order_id = ?1").bind(ob.id).run();
    await runScheduled(env);
    expect((await orderOf(b.orderNumber)).status).toBe("cancelled");
    expect(await couponUsed(code)).toBe(0);
  });
});

describe("refund TOCTOU", () => {
  async function paidOrder() {
    const s = await ensureOwner(); await enablePayment(s);
    const { variantId } = await createProduct(s, { price: 10000, stock: 5 });
    const ip = freshIp();
    const body = await j<any>(await checkout(await newCart(ip, variantId, 1), ip, `r-${Date.now()}@example.com`));
    const order = await orderOf(body.orderNumber);
    await webhook({ eventId: crypto.randomUUID(), orderId: order.id, status: "succeeded", amount: order.total, currency: order.currency, providerTxId: `tx_${order.id}` });
    return { s, order };
  }
  it("concurrent refunds can never exceed the paid amount", async () => {
    const { s, order } = await paidOrder();
    const results = await Promise.all([1, 2, 3, 4].map(() => admin(s, `/orders/${order.id}/refund`, "POST", { amount: Math.floor(order.total * 0.6) })));
    expect(results.filter((r) => r.status === 200).length).toBe(1);
    expect(results.filter((r) => r.status === 400).length).toBe(3);
    const sum = await env.DB.prepare("SELECT COALESCE(SUM(amount),0) AS s FROM refunds WHERE order_id = ?1 AND status <> 'failed'").bind(order.id).first<any>();
    expect(sum.s).toBeLessThanOrEqual(order.total);
  });
  it("failed refunds do not count against the cap", async () => {
    const { s, order } = await paidOrder();
    const pay = await env.DB.prepare("SELECT id FROM payments WHERE order_id = ?1").bind(order.id).first<any>();
    await env.DB.prepare("INSERT INTO refunds (id, payment_id, order_id, amount, status, created_at) VALUES ('rf-failed', ?1, ?2, ?3, 'failed', unixepoch())").bind(pay.id, order.id, order.total).run();
    const r = await admin(s, `/orders/${order.id}/refund`, "POST", { amount: order.total });
    expect(r.status).toBe(200);
    expect((await j<any>(r)).full).toBe(true);
  });
});

describe("MFA hardening", () => {
  async function mfaUser(role = "admin") {
    const email = `mfa2-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`; const pw = "mfa password 123456";
    const owner = await ensureOwner();
    await admin(owner, "/users", "POST", { email, name: "Mfa", password: pw, role });
    return { email, pw };
  }
  it("rejects a replayed TOTP code and stores last_totp_step", async () => {
    const { email, pw } = await mfaUser();
    const s = await loginAs(email, pw);
    const setup = await j<any>(await admin(s, "/auth/mfa/setup", "POST"));
    expect((await admin(s, "/auth/mfa/enable", "POST", { code: await totpCode(setup.secret, Date.now()) })).status).toBe(204);
    const code = await totpCode(setup.secret, Date.now(), 1);
    expect((await call("/api/admin/auth/login", { json: { email, password: pw, totp: code }, ip: freshIp() })).status).toBe(200);
    const replay = await call("/api/admin/auth/login", { json: { email, password: pw, totp: code }, ip: freshIp() });
    expect(replay.status).toBe(401);
    const older = await call("/api/admin/auth/login", { json: { email, password: pw, totp: await totpCode(setup.secret, Date.now(), 0) }, ip: freshIp() });
    expect(older.status).toBe(401); // older step than last accepted
    const row = await env.DB.prepare("SELECT last_totp_step FROM admins WHERE email = ?1").bind(email).first<any>();
    expect(row.last_totp_step).toBe(Math.floor(Date.now() / 1000 / 30) + 1);
  });
  it("session mfa_verified reflects the real login state; owner/admin without TOTP get mfaEnrollmentRequired", async () => {
    const { email, pw } = await mfaUser("admin");
    const s = await loginAs(email, pw);
    const me = await j<any>(await call("/api/admin/auth/me", { cookie: s.cookie }));
    expect(me.admin.mfaEnrollmentRequired).toBe(true);
    const sess = await env.DB.prepare("SELECT mfa_verified FROM admin_sessions s JOIN admins a ON a.id = s.admin_id WHERE a.email = ?1").bind(email).all<any>();
    expect(sess.results.every((r) => r.mfa_verified === 1)).toBe(true);
    const staff = await mfaUser("staff");
    const ss = await loginAs(staff.email, staff.pw);
    expect((await j<any>(await call("/api/admin/auth/me", { cookie: ss.cookie }))).admin.mfaEnrollmentRequired).toBe(false);
    // enabling TOTP clears the flag
    const setup = await j<any>(await admin(s, "/auth/mfa/setup", "POST"));
    await admin(s, "/auth/mfa/enable", "POST", { code: await totpCode(setup.secret, Date.now()) });
    expect((await j<any>(await call("/api/admin/auth/me", { cookie: s.cookie }))).admin.mfaEnrollmentRequired).toBe(false);
  });
});

describe("audit logging", () => {
  const actions = async (action: string) => (await env.DB.prepare("SELECT meta FROM audit_logs WHERE action = ?1").bind(action).all<any>()).results;
  it("settings, integrations, media and outbox retry are audited without secret values", async () => {
    const s = await ensureOwner(); await enablePayment(s);
    expect((await admin(s, "/settings/general", "PUT", (await j<any>(await admin(s, "/settings"))).general)).status).toBe(200);
    expect((await admin(s, "/integrations/iyzico", "PUT", { enabled: true, config: { sandbox: true }, secrets: { apiKey: "audit-secret-key-1", secretKey: "audit-secret-key-2" } })).status).toBe(200);
    expect((await admin(s, "/integrations/iyzico/test", "POST")).status).toBe(200);
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137]);
    const f = new FormData(); f.set("file", new File([png], "x.png", { type: "image/png" })); f.set("kind", "logo");
    expect((await call("/api/admin/media", { form: f, cookie: s.cookie, csrf: s.csrf, ip: s.ip })).status).toBe(201);
    await env.DB.prepare("INSERT INTO outbox_jobs (id, kind, payload, status) VALUES ('audit-job', 'noop', '{}', 'failed')").run();
    expect((await admin(s, "/outbox/audit-job/retry", "POST")).status).toBe(200);
    for (const a of ["settings.update", "integration.update", "integration.test", "media.upload", "outbox.retry"]) expect((await actions(a)).length, a).toBeGreaterThan(0);
    const all = JSON.stringify((await env.DB.prepare("SELECT meta FROM audit_logs").all<any>()).results);
    expect(all).not.toMatch(/audit-secret-key/);
  });
});

import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { AdapterFactory, ServerEventSink } from "@openshelf/integration-sdk";
import { registerFactory } from "../src/integrations/registry";
import { ADDRESS, SIG, admin, call, ensureOwner, enablePayment, freshIp, installFakes, j } from "./helpers";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137]);
const SHOP = "http://shop.test";

const fakeMeta: AdapterFactory<ServerEventSink> = {
  manifest: { id: "meta", name: "Fake Meta", description: "t", publicFields: [], secretFields: [{ key: "accessToken", label: "t", secret: true }], schema: z.object({ config: z.record(z.unknown()), secrets: z.record(z.string()) }) },
  create: () => ({ id: "meta", async validateConfig() {}, async healthCheck() { return { ok: true }; }, async send() { return { ok: true }; } }),
};

describe("end-to-end: admin setup -> storefront purchase -> outbox", () => {
  it("runs the whole flow with API shapes the UIs rely on", async () => {
    // setup -> login -> me/csrf
    const st = await j<{ needsSetup: boolean }>(await call("/api/admin/setup/status"));
    expect(typeof st.needsSetup).toBe("boolean");
    const s = await ensureOwner();
    const me = await j<any>(await call("/api/admin/auth/me", { cookie: s.cookie, ip: s.ip }));
    expect(me.admin.role).toBe("owner");
    expect(me.csrfToken).toBe(s.csrf);

    // upload a PNG logo, save branding, storefront config exposes logoUrl
    const form = new FormData();
    form.set("file", new File([PNG as BlobPart], "logo.png", { type: "image/png" }));
    form.set("kind", "logo");
    const up = await call("/api/admin/media", { form, cookie: s.cookie, csrf: s.csrf, ip: s.ip });
    expect(up.status).toBe(201);
    const media = await j<{ id: string; url: string; mime: string; size: number }>(up);
    expect(media).toMatchObject({ url: `/media/${media.id}`, mime: "image/png", size: PNG.length });
    const all = await j<any>(await admin(s, "/settings"));
    expect(Object.keys(all).sort()).toEqual(["branding", "checkout", "general", "legal", "notifications", "seo", "system", "tracking"]);
    const put = await admin(s, "/settings/branding", "PUT", { ...all.branding, logoMediaId: media.id, primaryColor: "#112233" });
    expect(put.status).toBe(200);
    const cfg = await j<any>(await call("/api/store/config"));
    expect(cfg.branding.logoUrl).toBe(`/media/${media.id}`);
    expect(cfg.branding.primaryColor).toBe("#112233");
    expect(cfg.locales.available).toContain("tr");
    expect((await call(cfg.branding.logoUrl)).headers.get("Content-Type")).toBe("image/png");

    // integrations: fake payment + both server-side sinks
    await enablePayment(s);
    installFakes(); registerFactory("meta", fakeMeta as never);
    for (const p of ["meta", "ga4"]) {
      expect((await admin(s, `/integrations/${p}`, "PUT", { enabled: true, config: {}, secrets: {} })).status).toBe(200);
    }
    const ints = await j<any[]>(await admin(s, "/integrations"));
    expect(Array.isArray(ints)).toBe(true);
    expect(ints.find((i) => i.provider === "iyzico")).toMatchObject({ enabled: true, secretsSet: { apiKey: true } });

    // product with variant + stock (admin shape), visible on storefront
    const slug = `e2e-${Date.now()}`;
    const created = await admin(s, "/products", "POST", {
      slug, nameTr: "E2E Ürün", status: "active", variants: [{ sku: `E2E-${slug}`, title: "Default", prices: { website: 12345 }, stock: { total: 5 } }],
    });
    expect(created.status).toBe(201);
    const product = await j<any>(created);
    const variantId = product.variants[0].id as string;
    expect(product.variants[0].stock).toMatchObject({ total: 5, reserved: 0 });
    const pub = await j<any>(await call(`/api/store/products/${slug}`));
    expect(pub).toMatchObject({ name: "E2E Ürün", priceFrom: 12345 });
    expect(pub.variants[0]).toMatchObject({ id: variantId, price: 12345, available: 5 });

    // cart -> checkout
    const ip = freshIp();
    const { id: cartId } = await j<{ id: string }>(await call("/api/store/cart", { method: "POST", json: {}, ip, origin: SHOP }));
    const cart = await j<any>(await call(`/api/store/cart/${cartId}/items`, { method: "PUT", json: { variantId, quantity: 2 }, ip, origin: SHOP }));
    expect(cart.lines[0]).toMatchObject({ variantId, quantity: 2, name: "E2E Ürün", unitPrice: 12345 });
    const co = await call("/api/store/checkout", {
      json: { cartId, email: "e2e@example.com", shippingAddress: ADDRESS, consent: { analytics: true, marketing: true }, acceptedTerms: true }, ip, origin: SHOP,
    });
    expect(co.status).toBe(201);
    const order = await j<{ orderNumber: string; trackingToken: string; payment: { redirectUrl?: string } }>(co);
    expect(order.payment.redirectUrl).toMatch(/^https:\/\/pay\.test\//);
    const row = await env.DB.prepare("SELECT id, total, currency FROM orders WHERE number = ?1").bind(order.orderNumber).first<{ id: string; total: number; currency: string }>();
    const view = (t = order.trackingToken) => call(`/api/store/orders/${order.orderNumber}?t=${t}`);
    expect((await j<any>(await view())).status).toBe("awaiting_payment");

    // payment callback (browser redirect) -> paid; replay it, plus the server webhook with the same event
    const ev = { eventId: `evt-${slug}`, orderId: row!.id, status: "succeeded", amount: row!.total, currency: row!.currency, providerTxId: `tx-${slug}` };
    const cb = () => call("/api/store/payment/callback/iyzico", { raw: JSON.stringify(ev), headers: { "x-test-signature": SIG, "Content-Type": "application/json" }, ip: freshIp(), origin: null });
    const r1 = await cb();
    expect(r1.status).toBe(302);
    expect(r1.headers.get("Location")).toBe(`${SHOP}/order/${encodeURIComponent(order.orderNumber)}?t=${encodeURIComponent(order.trackingToken)}`);
    expect((await cb()).status).toBe(302);
    expect((await cb()).status).toBe(302);
    const paid = await j<any>(await view());
    expect(paid).toMatchObject({ number: order.orderNumber, status: "paid", total: row!.total });
    expect(paid.purchaseEventId).toMatch(/^[0-9a-f-]{36}$/);
    expect(paid.items[0]).toMatchObject({ variantId, quantity: 2, unitPrice: 12345 });
    expect((await view("wrong")).status).toBe(404);

    const jobs = await env.DB.prepare("SELECT kind, COUNT(*) AS n FROM outbox_jobs WHERE kind LIKE 'marketing.purchase.%' AND payload LIKE ?1 GROUP BY kind").bind(`%${row!.id}%`).all<{ kind: string; n: number }>();
    expect(Object.fromEntries(jobs.results.map((x) => [x.kind, x.n]))).toEqual({ "marketing.purchase.meta": 1, "marketing.purchase.ga4": 1 });
    const inv = await env.DB.prepare("SELECT total, reserved FROM inventory WHERE variant_id = ?1").bind(variantId).first<any>();
    expect(inv).toEqual({ total: 3, reserved: 0 });
  });
});

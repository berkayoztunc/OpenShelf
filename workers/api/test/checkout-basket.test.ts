import { env } from "cloudflare:test";
import { afterAll, describe, expect, it } from "vitest";
import { buildPaymentBasket } from "../src/lib/basket";
import { clearSettingsCache } from "../src/lib/settings";
import { admin, checkout, createProduct, enablePayment, ensureOwner, fakePay, freshIp, j, newCart } from "./helpers";

const sum = (b: { price: number; quantity: number }[]) => b.reduce((t, i) => t + i.price * i.quantity, 0);
const L = (variantId: string, lineTotal: number, quantity = 1) => ({ variantId, name: variantId.toUpperCase(), quantity, lineTotal });

describe("buildPaymentBasket", () => {
  it("adds shipping as its own line so the basket equals the amount charged", () => {
    const b = buildPaymentBasket([L("a", 19900)], 34900, 15000);
    expect(b).toEqual([{ id: "a", name: "A", category: "General", price: 19900, quantity: 1 }, { id: "shipping", name: "Kargo", category: "Shipping", price: 15000, quantity: 1 }]);
    expect(sum(b)).toBe(34900);
  });
  it("no shipping, no discount: lines unchanged; quantity folded into the name", () => {
    expect(buildPaymentBasket([L("a", 30000, 3), L("b", 5000)], 35000, 0)).toEqual([
      { id: "a", name: "A x3", category: "General", price: 30000, quantity: 1 }, { id: "b", name: "B", category: "General", price: 5000, quantity: 1 }]);
  });
  it("spreads a discount over the product lines without losing a kuruş", () => {
    const b = buildPaymentBasket([L("a", 3333), L("b", 3333), L("c", 3334)], 9001 + 2500, 2500); // 999 off
    expect(sum(b)).toBe(11501); expect(b.every((i) => i.price > 0 && Number.isInteger(i.price))).toBe(true);
    expect(b.at(-1)).toMatchObject({ id: "shipping", price: 2500 });
  });
  it("drops zero lines and still charges the full amount (100% coupon, shipping only)", () => {
    const b = buildPaymentBasket([L("a", 10000)], 1500, 1500);
    expect(b).toEqual([{ id: "shipping", name: "Kargo", category: "Shipping", price: 1500, quantity: 1 }]);
  });
  it("tax-exclusive totals (total above the line sum) are scaled up, never short", () => {
    const b = buildPaymentBasket([L("a", 10000), L("b", 1)], 12001, 0);
    expect(sum(b)).toBe(12001);
  });
});

describe("checkout with a shipping fee / failing provider", () => {
  const setShipping = async (fee: number) => { const s = await ensureOwner(); expect((await admin(s, "/settings/checkout", "PATCH", { flatShippingFee: fee, freeShippingThreshold: null })).status).toBe(200); clearSettingsCache(); return s; };
  afterAll(async () => { fakePay.fail = null; await setShipping(0); });

  it("sends a basket that adds up to the order total when shipping is charged", async () => {
    const s = await setShipping(15000); await enablePayment(s);
    const { variantId } = await createProduct(s, { price: 19900 });
    const r = await checkout(await newCart(freshIp(), variantId));
    expect(r.status).toBe(201);
    expect(fakePay.lastInput!.amount).toBe(34900);
    expect(sum(fakePay.lastInput!.items)).toBe(34900);
    expect(fakePay.lastInput!.items.map((i) => i.id)).toEqual([variantId, "shipping"]);
  });

  it("provider failure: 502, reason logged, no order left behind, stock released, retry works on the same cart", async () => {
    const s = await setShipping(0); await enablePayment(s);
    const { variantId } = await createProduct(s, { price: 5000, stock: 3 });
    const cart = await newCart(freshIp(), variantId, 2);
    const email = `fail-${Date.now()}@example.com`;
    const count = async () => (await env.DB.prepare("SELECT COUNT(*) AS n FROM orders WHERE email = ?1").bind(email).first<{ n: number }>())!.n;
    fakePay.fail = "provider is down";
    for (let i = 0; i < 3; i++) {
      const r = await checkout(cart, freshIp(), email);
      expect(r.status).toBe(502); expect((await j<any>(r)).error.code).toBe("payment_provider_error");
    }
    expect(await count()).toBe(0);
    expect((await env.DB.prepare("SELECT reserved FROM inventory WHERE variant_id = ?1").bind(variantId).first<{ reserved: number }>())!.reserved).toBe(0);
    const ev = await env.DB.prepare("SELECT message FROM integration_events WHERE provider = 'iyzico' AND level = 'error' ORDER BY id DESC LIMIT 1").first<{ message: string }>();
    expect(ev!.message).toBe("createCheckout failed: provider is down");
    fakePay.fail = null;
    expect((await checkout(cart, freshIp(), email)).status).toBe(201);
    expect(await count()).toBe(1);
  });
});

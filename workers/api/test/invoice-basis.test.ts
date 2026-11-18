import { env } from "cloudflare:test";
import { afterAll, describe, expect, it } from "vitest";
import { buildAmounts } from "@openshelf/integration-efaturam";
import { orderInvoiceLines, orderPricesIncludeTax } from "@openshelf/shared";
import { clearSettingsCache } from "../src/lib/settings";
import { admin, checkout, createProduct, enablePayment, ensureOwner, freshIp, j, newCart } from "./helpers";

const orderOf = (n: string) => env.DB.prepare("SELECT * FROM orders WHERE number = ?1").bind(n).first<any>();
const setGeneral = async (s: any, patch: Record<string, unknown>) => { expect((await admin(s, "/settings/general", "PATCH", patch)).status).toBe(200); clearSettingsCache(); };
const setCheckout = async (s: any, patch: Record<string, unknown>) => { expect((await admin(s, "/settings/checkout", "PATCH", patch)).status).toBe(200); clearSettingsCache(); };
afterAll(async () => {
  const s = await ensureOwner();
  await admin(s, "/settings/general", "PATCH", { pricesIncludeTax: true }); await admin(s, "/settings/checkout", "PATCH", { flatShippingFee: 0, freeShippingThreshold: null });
  clearSettingsCache();
  const W = "(SELECT id FROM orders WHERE email LIKE 'basis-%')";
  await env.DB.exec(`DELETE FROM order_items WHERE order_id IN ${W}; DELETE FROM payments WHERE order_id IN ${W}; DELETE FROM inventory_reservations WHERE order_id IN ${W}; DELETE FROM outbox_jobs; DELETE FROM orders WHERE email LIKE 'basis-%';`);
});

async function place(s: any, price: number, qty = 1) {
  const { variantId } = await createProduct(s, { price, stock: 20 });
  const r = await checkout(await newCart(freshIp(), variantId, qty), freshIp(), `basis-${crypto.randomUUID()}@example.com`);
  expect(r.status).toBe(201);
  return orderOf((await j<any>(r)).orderNumber);
}
const gross = (lines: { quantity: number; unitPrice: number }[]) => lines.reduce((t, l) => t + l.quantity * l.unitPrice, 0);

describe("order lines for the invoice: KDV-inclusive or exclusive, always summing to what was paid", () => {
  const items = [{ name: "A", quantity: 2, unitPrice: 3333, taxRate: 20 }, { name: "B", quantity: 1, unitPrice: 1999, taxRate: 10 }];
  it("inclusive order: prices as they are, shipping and discount as their own lines", () => {
    const o = { subtotal: 8665, discountTotal: 665, shippingTotal: 1500, total: 9500 };
    expect(orderPricesIncludeTax(o)).toBe(true);
    const lines = orderInvoiceLines(o, items);
    expect(lines).toEqual([{ name: "A", quantity: 2, unitPrice: 3333, taxRate: 20 }, { name: "B", quantity: 1, unitPrice: 1999, taxRate: 10 }, { name: "Kargo", quantity: 1, unitPrice: 1500, taxRate: 20 }, { name: "İndirim", quantity: 1, unitPrice: -665, taxRate: 20 }]);
    expect(gross(lines)).toBe(o.total);
  });
  it("exclusive order: KDV is added to each line and the sum is forced to the amount charged", () => {
    // 2 x 33.33 @20% + 19.99 @10% = 66.66 + 19.99 = 86.65 net; KDV 13.33 + 2.00; shipping 15.00 is charged as a final amount
    const o = { subtotal: 8665, discountTotal: 0, shippingTotal: 1500, total: 8665 + 1500 + 1333 + 200 };
    expect(orderPricesIncludeTax(o)).toBe(false);
    const lines = orderInvoiceLines(o, items);
    expect(gross(lines)).toBe(o.total);
    // 79.992 -> 79.99 does not split evenly over 2 pieces: one line, so no kuruş is lost
    const a = lines.find((l) => l.name.startsWith("A"))!;
    expect(a).toMatchObject({ name: "A (2 x)", quantity: 1, unitPrice: Math.round(3333 * 2 * 1.2) });
    expect(lines.find((l) => l.name === "Kargo")!.unitPrice).toBe(1500);
  });
  it("whatever the basis, discount, quantity or rounding: the provider's invoice total equals the order total", () => {
    for (const incl of [true, false]) for (const discount of [0, 1, 333, 999]) for (const q of [1, 3, 7]) for (const ship of [0, 1499]) {
      const sub = 1999 * q + 4999; const after = sub - discount;
      const itemTax = Math.round((1999 * q + 4999) * 0.2 * (after / sub)); // exclusive KDV, roughly like the store computes it
      const o = { subtotal: sub, discountTotal: discount, shippingTotal: ship, total: after + ship + (incl ? 0 : itemTax) };
      const lines = orderInvoiceLines(o, [{ name: "X", quantity: q, unitPrice: 1999, taxRate: 20 }, { name: "Y", quantity: 1, unitPrice: 4999, taxRate: 20 }]);
      expect(buildAmounts(lines).invoiceTotal.payableAmount, `${incl} d${discount} q${q} s${ship}`).toBe(o.total);
    }
  });
});

describe("checkout KDV and the invoice preview (real orders)", () => {
  it("inclusive store: order KDV includes the shipping's KDV, and the invoice preview equals what was paid", async () => {
    const s = await ensureOwner(); await enablePayment(s);
    await setGeneral(s, { pricesIncludeTax: true, defaultTaxRate: 20 }); await setCheckout(s, { flatShippingFee: 15000, freeShippingThreshold: null });
    const o = await place(s, 19900);
    expect(o.total).toBe(34900);                                   // 199.00 + 150.00 shipping, nothing added on top
    expect(o.tax_total).toBe(Math.round(19900 * 20 / 120) + Math.round(15000 * 20 / 120)); // 33.17 + 25.00
    const p = await j<any>(await admin(s, `/orders/${o.id}/invoice/preview`));
    expect(p).toMatchObject({ pricesIncludeTax: true, total: 34900, matchesOrder: true, tax: o.tax_total });
    expect(p.lines.map((l: any) => l.name)).toEqual(expect.arrayContaining(["Kargo"]));
    expect(p.byRate).toEqual([{ rate: 20, net: 34900 - o.tax_total, tax: o.tax_total }]);
  });
  it("exclusive store: KDV is added at checkout, and the invoice still totals exactly what the customer paid", async () => {
    const s = await ensureOwner(); await enablePayment(s);
    await setGeneral(s, { pricesIncludeTax: false, defaultTaxRate: 20 }); await setCheckout(s, { flatShippingFee: 5000, freeShippingThreshold: null });
    const o = await place(s, 10000, 3);
    expect(o.subtotal).toBe(30000); expect(o.total).toBe(30000 + 5000 + 6000);                // items + shipping + 20% KDV on the items
    const p = await j<any>(await admin(s, `/orders/${o.id}/invoice/preview`));
    expect(p).toMatchObject({ pricesIncludeTax: false, total: 41000, matchesOrder: true });
    expect(p.net + p.tax).toBe(41000);
    // settings can change later: the invoice follows the order, not today's setting
    await setGeneral(s, { pricesIncludeTax: true });
    expect(await j<any>(await admin(s, `/orders/${o.id}/invoice/preview`))).toMatchObject({ pricesIncludeTax: false, total: 41000, matchesOrder: true });
  });
  it("preview: 404 for unknown orders, 409 for marketplace orders", async () => {
    const s = await ensureOwner();
    expect((await admin(s, "/orders/nope/invoice/preview")).status).toBe(404);
    const o = await place(s, 5000);
    await env.DB.prepare("UPDATE orders SET source = 'trendyol' WHERE id = ?1").bind(o.id).run();
    expect((await admin(s, `/orders/${o.id}/invoice/preview`)).status).toBe(409);
  });
});

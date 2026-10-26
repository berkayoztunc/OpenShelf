import { describe, expect, it } from "vitest";
import { computeTotals } from "./totals";

const line = (unitPrice: number, quantity: number, variantId = "v") => ({ variantId, title: "x", unitPrice, quantity });
const checkout = { flatShippingFee: 4990, freeShippingThreshold: 50000 };

describe("computeTotals", () => {
  it("sums lines in minor units and adds flat shipping", () => {
    const t = computeTotals({ items: [line(19990, 2, "a"), line(1010, 1, "b")] }, checkout);
    expect(t).toEqual({ itemCount: 3, subtotal: 40990, discount: 0, shipping: 4990, total: 45980 });
  });
  it("free shipping at/over the threshold (after discount)", () => {
    expect(computeTotals({ items: [line(50000, 1)] }, checkout).shipping).toBe(0);
    expect(computeTotals({ items: [line(50000, 1)], discount: 100 }, checkout).shipping).toBe(4990);
  });
  it("prefers server totals and clamps discount to subtotal", () => {
    expect(computeTotals({ items: [line(100, 1)], subtotal: 100, shipping: 0, total: 77 }, checkout).total).toBe(77);
    expect(computeTotals({ items: [line(100, 1)], discount: 999 }, { flatShippingFee: 0, freeShippingThreshold: null })).toMatchObject({ discount: 100, total: 0 });
  });
  it("empty cart is all zero", () => {
    expect(computeTotals(null, checkout)).toEqual({ itemCount: 0, subtotal: 0, discount: 0, shipping: 0, total: 0 });
  });
});

import type { Cart, StoreConfig } from "../api/types";

export interface Totals { itemCount: number; subtotal: number; discount: number; shipping: number; total: number }

/**
 * Display totals. Server values win when present (server is the source of truth at checkout);
 * otherwise derived from lines + checkout settings (flat fee, free-shipping threshold). All minor units.
 */
export function computeTotals(cart: Pick<Cart, "items" | "subtotal" | "discount" | "shipping" | "total"> | null, checkout?: Pick<StoreConfig["checkout"], "flatShippingFee" | "freeShippingThreshold">): Totals {
  const items = cart?.items ?? [];
  const itemCount = items.reduce((n, i) => n + i.quantity, 0);
  const subtotal = cart?.subtotal ?? items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
  const discount = Math.min(cart?.discount ?? 0, subtotal);
  const after = subtotal - discount;
  let shipping = cart?.shipping;
  if (shipping === undefined) {
    const free = checkout?.freeShippingThreshold != null && after >= checkout.freeShippingThreshold;
    shipping = items.length === 0 || free ? 0 : checkout?.flatShippingFee ?? 0;
  }
  const total = cart?.total ?? after + shipping;
  return { itemCount, subtotal, discount, shipping, total };
}

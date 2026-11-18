/**
 * Payment basket lines whose sum is EXACTLY the amount charged. Providers (iyzico) reject a basket that does not add up to the
 * price, and the order total is not just the product lines: shipping is added and coupons are subtracted.
 *  - product lines are scaled so that together they equal `total - shipping` (discount spread proportionally, remainder on the
 *    largest line), each sent as quantity 1 so no per-unit fraction can appear
 *  - shipping becomes its own line
 *  - lines that end up at 0 are dropped (providers require a positive price per line)
 * All amounts are minor units.
 */
export interface BasketLine { id: string; name: string; category: string; price: number; quantity: number }
export function buildPaymentBasket(
  lines: { variantId: string; name: string; quantity: number; lineTotal: number }[], total: number, shipping: number, shippingName = "Kargo",
): BasketLine[] {
  const ship = Math.max(0, Math.min(shipping, total));
  const goods = total - ship;
  const base = lines.reduce((s, l) => s + l.lineTotal, 0);
  const out: BasketLine[] = [];
  if (goods > 0 && base > 0) {
    const parts = lines.map((l) => Math.floor((l.lineTotal * goods) / base));
    let rest = goods - parts.reduce((s, p) => s + p, 0);
    const order = lines.map((_, i) => i).sort((a, b) => lines[b]!.lineTotal - lines[a]!.lineTotal);
    for (let i = 0; rest > 0; i = (i + 1) % order.length, rest--) parts[order[i]!]!++;
    lines.forEach((l, i) => {
      if (parts[i]! > 0) out.push({ id: l.variantId, name: l.quantity > 1 ? `${l.name} x${l.quantity}` : l.name, category: "General", price: parts[i]!, quantity: 1 });
    });
  }
  // no goods amount left (e.g. 100% coupon): the whole charge is shipping
  if (ship > 0 || !out.length) out.push({ id: "shipping", name: shippingName, category: "Shipping", price: out.length ? ship : total, quantity: 1 });
  return out;
}

import type { OrderView } from "../api/types";
import { track } from "./track";

const PAID_STATES = new Set(["paid", "fulfilling", "shipped", "delivered"]);
const guardKey = (n: string) => `os_purchase_${n}`;

const seen = (n: string) => { try { return sessionStorage.getItem(guardKey(n)) === "1"; } catch { return memGuard.has(n); } };
const memGuard = new Set<string>();
const mark = (n: string) => { memGuard.add(n); try { sessionStorage.setItem(guardKey(n), "1"); } catch { /* ignore */ } };

/**
 * Browser-side `purchase`. Only from the order page, only for a verified-paid order, only once per order,
 * with the server-issued `purchaseEventId` so it dedups against server CAPI / Measurement Protocol.
 * Never call this from checkout.
 */
export function trackPurchase(order: OrderView): boolean {
  if (!PAID_STATES.has(order.status) || !order.purchaseEventId) return false;
  if (seen(order.orderNumber) || memGuard.has(order.orderNumber)) return false;
  const id = track("purchase", {
    currency: order.currency,
    value: order.total / 100,
    transaction_id: order.orderNumber,
    items: order.items.map((i) => ({
      id: i.variantId, name: i.title, price: i.unitPrice / 100, quantity: i.quantity,
      ...(i.category && { category: i.category }), ...(i.variantTitle && { variant: i.variantTitle }),
    })),
  }, { eventId: order.purchaseEventId });
  if (!id) return false; // no consent or no channel: leave unguarded so it can fire if consent is granted later
  mark(order.orderNumber);
  return true;
}

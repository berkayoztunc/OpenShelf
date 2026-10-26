import type { OrderStatus } from "@openshelf/shared";

/**
 * Shipment package status vocabulary, from docs/get-order-packages-getshipmentpackages (status filter):
 * Created, Picking, Invoiced, Shipped, Cancelled, Delivered, UnDelivered, Returned, AtCollectionPoint, UnSupplied,
 * Awaiting, Verified (+ UnPacked for split orders, Repack seen in practice).
 * "Awaiting" packages are only for inventory purposes (docs: take no other action); they must not become paid orders.
 */
export const TRENDYOL_PACKAGE_STATUSES = [
  "Awaiting", "Created", "Picking", "Invoiced", "Shipped", "AtCollectionPoint", "Delivered", "UnDelivered", "Cancelled", "UnSupplied",
  "Returned", "UnPacked", "Verified",
] as const;
const MAP: Record<string, OrderStatus> = {
  Created: "paid", Verified: "paid", Picking: "fulfilling", Invoiced: "fulfilling", Repack: "fulfilling",
  Shipped: "shipped", AtCollectionPoint: "shipped", UnDelivered: "shipped",
  Delivered: "delivered", Cancelled: "cancelled", UnSupplied: "cancelled", UnPacked: "cancelled", Returned: "refunded",
};
/** Statuses that must not be imported as new orders (docs: Awaiting is inventory-only). */
export const isImportableStatus = (s: string) => s !== "Awaiting";
export function mapTrendyolStatus(s: string): OrderStatus {
  return MAP[s] ?? "paid";
}

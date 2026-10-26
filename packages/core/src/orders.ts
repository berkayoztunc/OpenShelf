import { ORDER_TRANSITIONS, type OrderStatus } from "@openshelf/shared";
import { and, eq, sql } from "drizzle-orm";
import { orders, orderItems } from "@openshelf/db";
import { raw, runBatch, nowSec, type Db } from "./types";
import { eventForTransition, notifyEnqueueStmt } from "./notify";

export class InvalidTransitionError extends Error {
  constructor(public from: string, public to: string) { super(`Invalid order transition ${from} -> ${to}`); }
}
export const canTransition = (from: OrderStatus, to: OrderStatus) => ORDER_TRANSITIONS[from]?.includes(to) ?? false;
export function assertTransition(from: OrderStatus, to: OrderStatus) {
  if (!canTransition(from, to)) throw new InvalidTransitionError(from, to);
}

export const orderIs = (orderId: string, statuses: string[]) =>
  sql`EXISTS (SELECT 1 FROM orders WHERE id = ${orderId} AND status IN (${sql.join(statuses.map((s) => sql`${s}`), sql`, `)}))`;

/**
 * Atomic, state-machine-checked transition with stock side effects:
 *  - cancel before payment  -> release active reservations (+ coupon use)
 *  - cancel after payment (not shipped) -> restock
 * Concurrency-safe: every side effect is guarded on the order still being in `from`.
 */
export async function transitionOrder(db: Db, orderId: string, to: OrderStatus, now = new Date()): Promise<{ from: OrderStatus }> {
  const [o] = await db.select({ status: orders.status, couponCode: orders.couponCode }).from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!o) throw new Error("order_not_found");
  const from = o.status as OrderStatus;
  assertTransition(from, to);
  const guard = orderIs(orderId, [from]);
  const t = nowSec(now);
  const stmts: unknown[] = [];

  if (to === "cancelled" && (from === "pending" || from === "awaiting_payment")) {
    const rs = await db.all<{ id: string; variant_id: string; quantity: number }>(
      sql`SELECT id, variant_id, quantity FROM inventory_reservations WHERE order_id = ${orderId} AND status = 'active'`);
    for (const r of rs) {
      stmts.push(raw(db, sql`UPDATE inventory SET reserved = MAX(reserved - ${r.quantity}, 0), updated_at = ${t}
        WHERE variant_id = ${r.variant_id} AND ${guard} AND EXISTS (SELECT 1 FROM inventory_reservations WHERE id = ${r.id} AND status = 'active')`));
      stmts.push(raw(db, sql`UPDATE inventory_reservations SET status = 'released' WHERE id = ${r.id} AND status = 'active' AND ${guard}`));
    }
    if (o.couponCode) stmts.push(raw(db, sql`UPDATE coupons SET used = MAX(used - 1, 0) WHERE code = ${o.couponCode} AND ${guard}`));
  } else if (to === "cancelled" && (from === "paid" || from === "fulfilling")) {
    const items = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
    for (const it of items) {
      if (!it.variantId) continue;
      stmts.push(raw(db, sql`UPDATE inventory SET total = total + ${it.quantity}, updated_at = ${t} WHERE variant_id = ${it.variantId} AND ${guard}`));
      stmts.push(raw(db, sql`INSERT INTO inventory_movements (variant_id, delta, reason, ref_type, ref_id, created_at)
        SELECT ${it.variantId}, ${it.quantity}, 'return', 'order', ${orderId}, ${t} WHERE ${guard}`));
    }
  }
  stmts.push(db.update(orders).set({ status: to, updatedAt: now }).where(and(eq(orders.id, orderId), eq(orders.status, from))).returning({ id: orders.id }));
  const updateIdx = stmts.length - 1;
  const ev = eventForTransition(from, to);
  if (ev) stmts.push(notifyEnqueueStmt(db, ev, orderId, to, now)); // customer notification (idempotent dedupe key, same atomic batch)
  const res = await runBatch(db, stmts);
  const last = res[updateIdx] as { id: string }[];
  if (!last || last.length === 0) throw new InvalidTransitionError(from, to); // lost a race
  return { from };
}

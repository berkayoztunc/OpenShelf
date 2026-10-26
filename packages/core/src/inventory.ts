import { and, eq, inArray, sql } from "drizzle-orm";
import { inventory, inventoryReservations } from "@openshelf/db";
import { raw, runBatch, nowSec, type Db } from "./types";

export class InsufficientStockError extends Error {
  constructor(public variantIds: string[]) { super(`Insufficient stock for ${variantIds.join(", ")}`); }
}
export interface ReserveLine { variantId: string; quantity: number }

/**
 * Atomic oversell-safe reservation.
 * One batch of guarded UPDATEs (`WHERE total-reserved-safety_stock >= qty`), rows-changed checked via RETURNING.
 * If any line fails, successful lines are compensated and InsufficientStockError is thrown.
 */
export async function reserveStock(db: Db, lines: ReserveLine[], opts: { orderId?: string; cartId?: string; ttlSeconds: number; now?: Date }): Promise<string[]> {
  const now = opts.now ?? new Date();
  const merged = new Map<string, number>();
  for (const l of lines) merged.set(l.variantId, (merged.get(l.variantId) ?? 0) + l.quantity);
  const entries = [...merged.entries()].filter(([, q]) => q > 0);
  if (entries.length === 0) return [];
  const stmts = entries.map(([variantId, q]) =>
    db.update(inventory).set({ reserved: sql`${inventory.reserved} + ${q}`, updatedAt: now })
      .where(and(eq(inventory.variantId, variantId), sql`${inventory.total} - ${inventory.reserved} - ${inventory.safetyStock} >= ${q}`))
      .returning({ v: inventory.variantId }));
  const res = (await runBatch(db, stmts)) as { v: string }[][];
  const failed: string[] = [];
  const ok: [string, number][] = [];
  entries.forEach(([v, q], i) => ((res[i]?.length ?? 0) === 1 ? ok.push([v, q]) : failed.push(v)));
  if (failed.length) {
    await runBatch(db, ok.map(([v, q]) => raw(db, sql`UPDATE inventory SET reserved = MAX(reserved - ${q}, 0) WHERE variant_id = ${v}`)));
    throw new InsufficientStockError(failed);
  }
  const expiresAt = new Date(now.getTime() + opts.ttlSeconds * 1000);
  const ids: string[] = [];
  const rows = entries.map(([variantId, quantity]) => {
    const id = crypto.randomUUID(); ids.push(id);
    return { id, variantId, quantity, cartId: opts.cartId ?? null, orderId: opts.orderId ?? null, status: "active", expiresAt };
  });
  await db.insert(inventoryReservations).values(rows);
  return ids;
}

/** Link reservations to an order (checkout step after the order row exists). */
export async function attachReservations(db: Db, ids: string[], orderId: string) {
  for (const id of ids) await db.update(inventoryReservations).set({ orderId }).where(eq(inventoryReservations.id, id));
}

/** Release one reservation (compensation path) atomically. */
export async function releaseReservationIds(db: Db, ids: string[], status: "released" | "expired" = "released") {
  if (!ids.length) return;
  const rs = await db.select().from(inventoryReservations).where(and(eq(inventoryReservations.status, "active"), inArray(inventoryReservations.id, ids)));
  const stmts: unknown[] = [];
  for (const r of rs) {
    stmts.push(raw(db, sql`UPDATE inventory SET reserved = MAX(reserved - ${r.quantity}, 0) WHERE variant_id = ${r.variantId}
      AND EXISTS (SELECT 1 FROM inventory_reservations WHERE id = ${r.id} AND status = 'active')`));
    stmts.push(raw(db, sql`UPDATE inventory_reservations SET status = ${status} WHERE id = ${r.id} AND status = 'active'`));
  }
  await runBatch(db, stmts);
}

/** Cron: expire stale active reservations, cancelling their unpaid orders. Returns number expired. */
export async function expireReservations(db: Db, now = new Date(), limit = 100): Promise<{ expired: number; orderIds: string[] }> {
  const t = nowSec(now);
  const rs = await db.all<{ id: string; variant_id: string; quantity: number; order_id: string | null }>(
    sql`SELECT id, variant_id, quantity, order_id FROM inventory_reservations WHERE status = 'active' AND expires_at <= ${t} LIMIT ${limit}`);
  const stmts: unknown[] = [];
  const orderIds = new Set<string>();
  for (const r of rs) {
    stmts.push(raw(db, sql`UPDATE inventory SET reserved = MAX(reserved - ${r.quantity}, 0), updated_at = ${t} WHERE variant_id = ${r.variant_id}
      AND EXISTS (SELECT 1 FROM inventory_reservations WHERE id = ${r.id} AND status = 'active')`));
    stmts.push(raw(db, sql`UPDATE inventory_reservations SET status = 'expired' WHERE id = ${r.id} AND status = 'active'`));
    if (r.order_id) orderIds.add(r.order_id);
  }
  // Cancel unpaid orders whose reservations expired (coupon use returned).
  for (const oid of orderIds) {
    stmts.push(raw(db, sql`UPDATE coupons SET used = MAX(used - 1, 0) WHERE code = (SELECT coupon_code FROM orders WHERE id = ${oid} AND status IN ('pending','awaiting_payment'))`));
    stmts.push(raw(db, sql`UPDATE orders SET status = 'cancelled', updated_at = ${t} WHERE id = ${oid} AND status IN ('pending','awaiting_payment')`));
  }
  await runBatch(db, stmts);
  return { expired: rs.length, orderIds: [...orderIds] };
}

/** Ledgered manual adjustment; refuses to take total below reserved. */
export async function adjustInventory(db: Db, variantId: string, delta: number, reason: string, now = new Date()): Promise<{ total: number; reserved: number }> {
  const t = nowSec(now);
  const res = (await runBatch(db, [
    raw(db, sql`INSERT INTO inventory (variant_id, total, reserved, safety_stock, updated_at) SELECT ${variantId}, 0, 0, 0, ${t}
      WHERE NOT EXISTS (SELECT 1 FROM inventory WHERE variant_id = ${variantId}) AND EXISTS (SELECT 1 FROM product_variants WHERE id = ${variantId})`),
    db.update(inventory).set({ total: sql`${inventory.total} + ${delta}`, updatedAt: now })
      .where(and(eq(inventory.variantId, variantId), sql`${inventory.total} + ${delta} >= ${inventory.reserved}`))
      .returning({ total: inventory.total, reserved: inventory.reserved }),
  ])) as unknown[];
  const rows = res[1] as { total: number; reserved: number }[];
  if (!rows?.length) throw new InsufficientStockError([variantId]);
  await db.run(sql`INSERT INTO inventory_movements (variant_id, delta, reason, ref_type, ref_id, created_at) VALUES (${variantId}, ${delta}, 'adjustment', 'admin', ${reason.slice(0, 200)}, ${t})`);
  return rows[0]!;
}

import { and, eq, inArray, sql } from "drizzle-orm";
import { orders, payments } from "@openshelf/db";
import { orderIs } from "./orders";
import { raw, runBatch, nowSec, type Db } from "./types";

export interface JobSpec { kind: string; payload: unknown; dedupeKey: string; delaySeconds?: number }

export const enqueueJobStmt = (db: Db, j: JobSpec, now: Date, onlyIfOrderPaid?: string) => {
  const t = nowSec(now) + (j.delaySeconds ?? 0);
  const guard = onlyIfOrderPaid ? sql`WHERE ${orderIs(onlyIfOrderPaid, ["paid"])}` : sql``;
  return raw(db, sql`INSERT OR IGNORE INTO outbox_jobs (id, kind, payload, dedupe_key, status, attempts, max_attempts, next_run_at, created_at, updated_at)
    SELECT ${crypto.randomUUID()}, ${j.kind}, ${JSON.stringify(j.payload)}, ${j.dedupeKey}, 'pending', 0, 8, ${t}, ${nowSec(now)}, ${nowSec(now)} ${guard}`);
};
export async function enqueueJob(db: Db, j: JobSpec, now = new Date()) { await runBatch(db, [enqueueJobStmt(db, j, now)]); }

/**
 * "Server-side purchase flow" step (1)+(2): one atomic batch.
 *  payment->succeeded, order->paid, reservations->converted (stock sold), movements, outbox jobs.
 * Every statement is guarded by order state / reservation state, so replays are no-ops.
 * Returns applied=false if the order was not awaiting payment (already paid, cancelled, ...).
 */
export async function confirmPurchase(db: Db, args: { orderId: string; paymentId: string; providerTxId: string | null; jobs: JobSpec[]; now?: Date }): Promise<{ applied: boolean }> {
  const now = args.now ?? new Date();
  const t = nowSec(now);
  const awaiting = orderIs(args.orderId, ["awaiting_payment", "pending"]);
  const rs = await db.all<{ id: string; variant_id: string; quantity: number }>(
    sql`SELECT id, variant_id, quantity FROM inventory_reservations WHERE order_id = ${args.orderId} AND status = 'active'`);
  const stmts: unknown[] = [];
  for (const r of rs) {
    const live = sql`${awaiting} AND EXISTS (SELECT 1 FROM inventory_reservations WHERE id = ${r.id} AND status = 'active')`;
    stmts.push(raw(db, sql`UPDATE inventory SET total = total - ${r.quantity}, reserved = MAX(reserved - ${r.quantity}, 0), updated_at = ${t}
      WHERE variant_id = ${r.variant_id} AND ${live}`));
    stmts.push(raw(db, sql`INSERT INTO inventory_movements (variant_id, delta, reason, ref_type, ref_id, created_at)
      SELECT ${r.variant_id}, ${-r.quantity}, 'sale', 'order', ${args.orderId}, ${t} WHERE ${live}`));
    stmts.push(raw(db, sql`UPDATE inventory_reservations SET status = 'converted' WHERE id = ${r.id} AND status = 'active' AND ${awaiting}`));
  }
  stmts.push(raw(db, sql`UPDATE payments SET status = 'succeeded', provider_tx_id = COALESCE(${args.providerTxId}, provider_tx_id), updated_at = ${t}
    WHERE id = ${args.paymentId} AND status != 'succeeded' AND ${awaiting}`));
  stmts.push(db.update(orders).set({ status: "paid", updatedAt: now })
    .where(and(eq(orders.id, args.orderId), inArray(orders.status, ["awaiting_payment", "pending"]))).returning({ id: orders.id }));
  const orderStmtIndex = stmts.length - 1;
  for (const j of args.jobs) stmts.push(enqueueJobStmt(db, j, now, args.orderId));
  const res = await runBatch(db, stmts);
  const applied = ((res[orderStmtIndex] as { id: string }[] | undefined)?.length ?? 0) === 1;
  return { applied };
}

export async function markPaymentStatus(db: Db, paymentId: string, status: "failed" | "refunded" | "pending") {
  await db.update(payments).set({ status, updatedAt: new Date() }).where(eq(payments.id, paymentId));
}

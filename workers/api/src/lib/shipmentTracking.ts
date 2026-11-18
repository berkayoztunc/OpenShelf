/**
 * Geliver shipment tracking → order status.
 *
 * Website orders shipped through Geliver move by themselves: once the carrier picks the parcel up the order becomes "shipped", once it is
 * handed over it becomes "delivered". `transitionOrder` enqueues the customer e-mail/SMS for both, so no extra notification code lives here.
 *
 * Two triggers feed the same `shipment.track` job:
 *  - an hourly cron sweep over open shipments (works without any Geliver-side setup);
 *  - Geliver's TRACK_UPDATED webhook (`POST /webhooks/geliver/:token`). Geliver does not sign webhooks, so the payload is only used as a
 *    hint for *which* shipment to re-check; the status itself is always read back from the Geliver API.
 */
import { and, asc, eq, gt, inArray, notInArray } from "drizzle-orm";
import { orders, shipmentEvents, shipments } from "@openshelf/db";
import { canTransition, InvalidTransitionError, transitionOrder } from "@openshelf/core";
import type { ShippingProvider, TrackingStatus } from "@openshelf/integration-sdk";
import type { OrderStatus } from "@openshelf/shared";
import type { Db } from "../env";
import type { JobHandler } from "../outbox";
import { logIntegrationEvent } from "./integrations";

export const TRACK_JOB = "shipment.track";
/** Shipment states we stop polling at. */
const FINAL = ["delivered", "returned", "cancelled"];
/** Order states a Geliver tracking update may still move forward. */
const MOVABLE: OrderStatus[] = ["paid", "fulfilling", "shipped"];
const PATH: OrderStatus[] = ["paid", "fulfilling", "shipped", "delivered"];
const SWEEP_LIMIT = 25;
const MAX_AGE_DAYS = 45;

/** Order status a carrier state should lead to (null = leave the order alone). */
export function targetFor(status: TrackingStatus["status"]): OrderStatus | null {
  if (status === "in_transit") return "shipped";
  if (status === "delivered") return "delivered";
  return null;
}

/** Steps from `from` to `to` along paid → fulfilling → shipped → delivered; empty when `to` is not ahead of `from`. */
export function stepsTo(from: OrderStatus, to: OrderStatus): OrderStatus[] {
  const a = PATH.indexOf(from), b = PATH.indexOf(to);
  if (a < 0 || b <= a) return [];
  return PATH.slice(a + 1, b + 1);
}

/** Webhook payloads differ by event version; take the first plausible shipment id. */
export function shipmentIdFromWebhook(body: unknown): string | null {
  const b = (body ?? {}) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const c = [b.data?.shipment?.id, b.data?.shipmentID, b.data?.shipmentId, b.data?.id, b.shipment?.id, b.shipmentID, b.shipmentId, b.id];
  const id = c.find((x) => typeof x === "string" && /^[\w-]{1,100}$/.test(x));
  return (id as string | undefined) ?? null;
}

interface Row { id: string; orderId: string; providerShipmentId: string | null; status: string; trackingNumber: string | null; trackingUrl: string | null; orderStatus: string; orderNumber: string }

/** Applies one tracking reading: shipment row + event, then walks the order forward. Returns what changed (for logs/tests). */
export async function applyTracking(db: Db, row: Row, st: TrackingStatus, now = new Date()): Promise<{ shipment: boolean; order: OrderStatus[] }> {
  const patch: Partial<typeof shipments.$inferInsert> = {};
  if (st.status !== "unknown" && st.status !== row.status) patch.status = st.status;
  if (st.trackingNumber && !row.trackingNumber) patch.trackingNumber = st.trackingNumber;
  if (st.trackingUrl && st.trackingUrl !== row.trackingUrl) patch.trackingUrl = st.trackingUrl;
  const changed = Object.keys(patch).length > 0;
  if (changed) {
    await db.update(shipments).set(patch).where(eq(shipments.id, row.id));
    if (patch.status) await db.insert(shipmentEvents).values({ shipmentId: row.id, status: patch.status, detail: (st.events.at(-1)?.detail || "geliver tracking").slice(0, 500) });
  }
  if (patch.status === "returned" || patch.status === "cancelled") {
    await logIntegrationEvent(db, "geliver", "warn", `Shipment ${patch.status} for order ${row.orderNumber} — check the order manually`, { orderId: row.orderId, shipmentId: row.id }).catch(() => {});
  }
  const moved: OrderStatus[] = [];
  const target = targetFor(st.status);
  if (target) {
    for (const next of stepsTo(row.orderStatus as OrderStatus, target)) {
      const cur = (moved.at(-1) ?? row.orderStatus) as OrderStatus;
      if (!canTransition(cur, next)) break;
      try { await transitionOrder(db, row.orderId, next, now); moved.push(next); }
      catch (e) { if (e instanceof InvalidTransitionError) break; throw e; } // someone moved it meanwhile: leave it
    }
  }
  return { shipment: changed, order: moved };
}

async function openShipments(db: Db, now: Date, providerShipmentId?: string): Promise<Row[]> {
  const since = new Date(now.getTime() - MAX_AGE_DAYS * 86400_000);
  return db.select({
    id: shipments.id, orderId: shipments.orderId, providerShipmentId: shipments.providerShipmentId, status: shipments.status,
    trackingNumber: shipments.trackingNumber, trackingUrl: shipments.trackingUrl, orderStatus: orders.status, orderNumber: orders.number,
  }).from(shipments).innerJoin(orders, eq(orders.id, shipments.orderId))
    .where(and(
      eq(shipments.provider, "geliver"), notInArray(shipments.status, FINAL), eq(orders.source, "website"),
      inArray(orders.status, MOVABLE), gt(shipments.createdAt, since),
      ...(providerShipmentId ? [eq(shipments.providerShipmentId, providerShipmentId)] : []),
    ))
    .orderBy(asc(shipments.createdAt)).limit(SWEEP_LIMIT);
}

/** payload: { providerShipmentId?: string } — one shipment (webhook) or a sweep of open ones (cron). */
export const trackShipmentsHandler: JobHandler = async (job, ctx) => {
  const adapter = await ctx.getAdapter<ShippingProvider>("geliver");
  if (!adapter) return; // integration switched off since the job was queued
  const only = (job.payload as { providerShipmentId?: string } | null)?.providerShipmentId;
  const rows = await openShipments(ctx.db, ctx.now, only);
  let failed = 0;
  for (const r of rows) {
    if (!r.providerShipmentId) continue;
    let st: TrackingStatus;
    try { st = await adapter.track(r.providerShipmentId); }
    catch (e) { failed++; await ctx.log("warn", `geliver track failed for order ${r.orderNumber}: ${e instanceof Error ? e.message : String(e)}`.slice(0, 500)); continue; }
    const res = await applyTracking(ctx.db, r, st, ctx.now);
    if (res.order.length) { await logIntegrationEvent(ctx.db, "geliver", "info", `Order ${r.orderNumber} → ${res.order.at(-1)} (carrier: ${st.status})`, { orderId: r.orderId }).catch(() => {}); }
  }
  // A sweep where every call failed is a real outage: fail the job so it is retried/visible.
  if (rows.length > 0 && failed === rows.length) throw new Error(`geliver tracking failed for all ${failed} shipment(s)`);
};

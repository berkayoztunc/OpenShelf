import { and, desc, eq, ne, sql } from "drizzle-orm";
import type { PaymentEvent, PaymentProvider } from "@openshelf/integration-sdk";
import { coupons, integrationConfigs, orderItems, orders, paymentEvents, payments, webhookReceipts } from "@openshelf/db";
import { confirmPurchase, InsufficientStockError, reserveStock, type JobSpec } from "@openshelf/core";
import type { ProviderId } from "@openshelf/shared";
import type { Db, Env } from "../env";
import { getAdapter, isIntegrationEnabled, isMockMode, logIntegrationEvent } from "./integrations";
import { PAYMENT_PROVIDER_IDS } from "../integrations/registry";
import { purchaseEventId } from "./eventId";
export { purchaseEventId };

export async function activePaymentProvider(env: Env, db: Db): Promise<{ id: ProviderId; adapter: PaymentProvider; config: Record<string, unknown> } | null> {
  for (const id of PAYMENT_PROVIDER_IDS) {
    const a = await getAdapter<PaymentProvider>(env, db, id);
    if (a) return { id, adapter: a.adapter, config: a.config };
  }
  return null;
}

export type PaymentResult = "processed" | "duplicate" | "ignored" | "amount_mismatch" | "late_payment";

/** Generic over PaymentProvider: dedupe -> amount check -> atomic purchase transaction + outbox jobs. */
export async function handlePaymentEvent(env: Env, db: Db, providerId: ProviderId, ev: PaymentEvent): Promise<{ result: PaymentResult; orderId?: string }> {
  const inserted = await db.insert(webhookReceipts).values({ provider: providerId, eventId: ev.eventId }).onConflictDoNothing().returning({ id: webhookReceipts.id });
  if (!inserted.length) return { result: "duplicate" };
  const receiptId = inserted[0]!.id;
  const finish = (status: string) => db.update(webhookReceipts).set({ status }).where(eq(webhookReceipts.id, receiptId));
  try {
    const [pay] = await db.select().from(payments).where(and(eq(payments.orderId, ev.orderId), eq(payments.provider, providerId))).orderBy(desc(payments.createdAt)).limit(1);
    if (!pay) { await finish("ignored_unknown_order"); return { result: "ignored" }; }
    await db.insert(paymentEvents).values({ paymentId: pay.id, type: ev.status, payload: { eventId: ev.eventId, providerTxId: ev.providerTxId, amount: ev.amount, currency: ev.currency } });
    if (ev.status === "succeeded") {
      if (ev.amount !== pay.amount || ev.currency.toUpperCase() !== pay.currency.toUpperCase()) {
        await logIntegrationEvent(db, providerId, "error", `Amount/currency mismatch for order ${pay.orderId}: expected ${pay.amount} ${pay.currency}, got ${ev.amount} ${ev.currency}`);
        await finish("amount_mismatch");
        return { result: "amount_mismatch", orderId: pay.orderId };
      }
      const on = (p: ProviderId) => isIntegrationEnabled(env, db, p); // mockMode => all on, no secrets needed
      const jobs: JobSpec[] = [];
      for (const sink of ["meta", "ga4"] as const) if (await on(sink)) jobs.push({ kind: `marketing.purchase.${sink}`, payload: { orderId: pay.orderId }, dedupeKey: `marketing.purchase.${sink}:${pay.orderId}` });
      // Invoices are NOT cut automatically (e-Faturam connection is IP-restricted); staff issue them with the "Issue invoice" button
      // (POST /orders/:id/invoice, which enqueues the same `invoice.issue` job).
      if (await on("geliver")) {
        const mock = await isMockMode(db);
        const g = mock ? undefined : (await db.select({ c: integrationConfigs.configPublic }).from(integrationConfigs).where(eq(integrationConfigs.provider, "geliver")))[0];
        if (mock || (g?.c as Record<string, unknown> | undefined)?.autoShipment === true) jobs.push({ kind: "shipment.create", payload: { orderId: pay.orderId }, dedupeKey: `shipment.create:${pay.orderId}` });
      }
      if (await on("trendyol")) {
        const its = await db.select({ v: orderItems.variantId }).from(orderItems).where(eq(orderItems.orderId, pay.orderId));
        jobs.push({ kind: "trendyol.stock_push", payload: { variantIds: its.map((i) => i.v).filter(Boolean) }, dedupeKey: `trendyol.stock_push:order:${pay.orderId}` });
      }
      // Transactional notifications (handler decides channels/templates; idempotent per order+event).
      for (const ev of ["order_paid", "admin_new_order"] as const) jobs.push({ kind: `notify.${ev}`, payload: { orderId: pay.orderId }, dedupeKey: `notify.${ev}:${pay.orderId}` });
      const { applied } = await confirmPurchase(db, { orderId: pay.orderId, paymentId: pay.id, providerTxId: ev.providerTxId, jobs });
      if (!applied) {
        const [o] = await db.select({ status: orders.status }).from(orders).where(eq(orders.id, pay.orderId));
        if (o?.status === "cancelled") {
          await logIntegrationEvent(db, providerId, "error", `Payment succeeded for CANCELLED order ${pay.orderId} (reservation expired) — manual refund required`, { providerTxId: ev.providerTxId });
          await finish("late_payment");
          return { result: "late_payment", orderId: pay.orderId };
        }
      }
      await finish("processed");
      return { result: "processed", orderId: pay.orderId };
    }
    if (ev.status === "failed") {
      await db.update(payments).set({ status: "failed", updatedAt: new Date() }).where(and(eq(payments.id, pay.id), eq(payments.status, "pending")));
    } else if (ev.status === "refunded") {
      await db.update(payments).set({ status: "refunded", updatedAt: new Date() }).where(eq(payments.id, pay.id));
    }
    await finish("processed");
    return { result: "processed", orderId: pay.orderId };
  } catch (e) {
    await db.delete(webhookReceipts).where(eq(webhookReceipts.id, receiptId)); // allow provider retry
    throw e;
  }
}


export type RecheckResult = "paid" | "already_paid" | "not_paid" | "pending" | "no_payment" | "out_of_stock" | "amount_mismatch";

/**
 * Admin "re-check payment": asks the payment provider (server to server) what really happened to this order's payment and, if the
 * money was taken, completes the order exactly like the callback would have. Safe to press any number of times.
 *  - a paid order is left alone
 *  - an unpaid result changes nothing
 *  - a CANCELLED order whose payment did succeed (callback lost, reservation expired) is revived: stock is reserved again and the
 *    normal purchase flow runs. If the stock is gone the order stays cancelled and a refund is needed ("out_of_stock").
 * Throws when the provider cannot be asked (not configured, network, provider error).
 */
export async function recheckPayment(env: Env, db: Db, orderId: string): Promise<{ result: RecheckResult; providerStatus?: string; orderStatus: string }> {
  const [o] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!o) throw new Error("order_not_found");
  const [pay] = await db.select().from(payments).where(eq(payments.orderId, orderId)).orderBy(desc(payments.createdAt)).limit(1);
  if (!pay?.providerToken) return { result: "no_payment", orderStatus: o.status };
  if (pay.status === "succeeded" && !["awaiting_payment", "pending", "cancelled"].includes(o.status)) return { result: "already_paid", providerStatus: "succeeded", orderStatus: o.status };
  const providerId = pay.provider as ProviderId;
  const a = await getAdapter<PaymentProvider>(env, db, providerId);
  if (!a) throw new Error("payment_provider_unavailable");
  const ev = await a.adapter.retrieve(pay.providerToken);
  if (ev.status !== "succeeded") return { result: ev.status === "pending" ? "pending" : "not_paid", providerStatus: ev.status, orderStatus: o.status };
  if (ev.orderId !== orderId) throw new Error("provider returned a payment for a different order");
  if (ev.amount !== pay.amount || ev.currency.toUpperCase() !== pay.currency.toUpperCase()) {
    await logIntegrationEvent(db, providerId, "error", `Re-check: amount/currency mismatch for order ${o.number}: expected ${pay.amount} ${pay.currency}, got ${ev.amount} ${ev.currency}`);
    return { result: "amount_mismatch", providerStatus: ev.status, orderStatus: o.status };
  }

  if (o.status === "cancelled") {
    const items = await db.select({ variantId: orderItems.variantId, quantity: orderItems.quantity }).from(orderItems).where(eq(orderItems.orderId, orderId));
    try {
      await reserveStock(db, items.filter((i): i is { variantId: string; quantity: number } => !!i.variantId), { orderId, ttlSeconds: 600 });
    } catch (e) {
      if (!(e instanceof InsufficientStockError)) throw e;
      await logIntegrationEvent(db, providerId, "error", `Re-check: payment succeeded for CANCELLED order ${o.number} but stock is gone: manual refund required`, { providerTxId: ev.providerTxId });
      return { result: "out_of_stock", providerStatus: ev.status, orderStatus: o.status };
    }
    await db.update(orders).set({ status: "awaiting_payment", updatedAt: new Date() }).where(and(eq(orders.id, orderId), eq(orders.status, "cancelled")));
    if (o.couponCode) await db.update(coupons).set({ used: sql`${coupons.used} + 1` }).where(eq(coupons.code, o.couponCode)); // the cancel gave the use back
  }
  // an earlier, rejected attempt (late payment, mismatch) may have left a receipt that would make this look like a duplicate
  await db.delete(webhookReceipts).where(and(eq(webhookReceipts.provider, providerId), eq(webhookReceipts.eventId, ev.eventId), ne(webhookReceipts.status, "processed")));
  const r = await handlePaymentEvent(env, db, providerId, ev);
  const [after] = await db.select({ status: orders.status }).from(orders).where(eq(orders.id, orderId)).limit(1);
  const paid = !!after && !["awaiting_payment", "pending", "cancelled"].includes(after.status);
  return { result: paid ? (r.result === "duplicate" ? "already_paid" : "paid") : r.result === "amount_mismatch" ? "amount_mismatch" : "not_paid", providerStatus: ev.status, orderStatus: after?.status ?? o.status };
}

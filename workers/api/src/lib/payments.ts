import { and, desc, eq } from "drizzle-orm";
import type { PaymentEvent, PaymentProvider } from "@openshelf/integration-sdk";
import { integrationConfigs, orderItems, orders, paymentEvents, payments, webhookReceipts } from "@openshelf/db";
import { confirmPurchase, type JobSpec } from "@openshelf/core";
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
      if (await on("efaturam")) jobs.push({ kind: "invoice.issue", payload: { orderId: pay.orderId }, dedupeKey: `invoice.issue:${pay.orderId}` });
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

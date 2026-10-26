/**
 * marketing.purchase job logic. NOTE: identical copy lives in the ga4 package (parametrised by opts).
 * Contract: job.payload = { orderId }. Replay-safe via marketing_events unique (event_id,name,destination).
 */
import { and, eq } from "drizzle-orm";
import { marketingEvents, orderItems, orders } from "@openshelf/db";
import type { TrackEvent } from "@openshelf/shared";
import type { ServerEventContext, ServerEventSink } from "@openshelf/integration-sdk";
import { purchaseEventId } from "./eventId";

export type JobHandler = (
  job: { id: string; kind: string; payload: any; attempts: number },
  ctx: {
    db: any; env: any; getAdapter: (id: string) => Promise<any>;
    log: (level: string, msg: string, meta?: any) => Promise<void>;
  },
) => Promise<void>;

export interface PurchaseHandlerOpts {
  adapterId: "meta" | "ga4";
  destination: "meta_capi" | "ga4_mp";
  consentKey: "marketing" | "analytics";
}

function asObj(v: unknown): Record<string, any> {
  if (!v) return {};
  if (typeof v === "string") { try { return JSON.parse(v) ?? {}; } catch { return {}; } }
  return typeof v === "object" ? (v as Record<string, any>) : {};
}

export function buildPurchaseEvent(order: any, items: any[]): TrackEvent {
  const attribution = asObj(order.attribution);
  return {
    event_id: purchaseEventId(order.id),
    name: "purchase",
    currency: order.currency,
    value: order.total / 100,
    transaction_id: order.number,
    items: items.map((i) => ({
      id: i.variantId ?? i.sku, name: i.name, price: i.unitPrice / 100, quantity: i.quantity,
    })),
    ...(typeof attribution.sourceUrl === "string" && /^https?:\/\//.test(attribution.sourceUrl)
      ? { page_url: attribution.sourceUrl } : {}),
  };
}

export function buildPurchaseContext(order: any): ServerEventContext {
  const attr = asObj(order.attribution);
  const ship = asObj(order.shippingAddress);
  return {
    ip: order.clientIp ?? undefined, userAgent: order.userAgent ?? undefined,
    fbc: attr.fbc, fbp: attr.fbp, gaClientId: attr.gaClientId,
    email: order.email, phone: ship.phone, externalId: order.customerId ?? order.id,
    sourceUrl: attr.sourceUrl,
  };
}

export function makePurchaseHandler(opts: PurchaseHandlerOpts): JobHandler {
  return async (job, ctx) => {
    const orderId = job.payload?.orderId as string | undefined;
    if (!orderId) { await ctx.log("error", `${job.kind}: missing orderId`); return; }
    const order = (await ctx.db.select().from(orders).where(eq(orders.id, orderId)).limit(1))[0];
    if (!order) { await ctx.log("warn", `${job.kind}: order not found`, { orderId }); return; }

    const eventId = purchaseEventId(order.id);
    const key = and(
      eq(marketingEvents.eventId, eventId), eq(marketingEvents.name, "purchase"),
      eq(marketingEvents.destination, opts.destination),
    );
    const prior = (await ctx.db.select().from(marketingEvents).where(key).limit(1))[0];
    if (prior && (prior.status === "sent" || prior.status === "skipped_no_consent")) return; // replay no-op

    const consent = asObj(order.consent);
    if (consent[opts.consentKey] !== true) {
      await ctx.db.insert(marketingEvents).values({
        eventId, name: "purchase", destination: opts.destination, orderId: order.id, status: "skipped_no_consent",
      }).onConflictDoUpdate({
        target: [marketingEvents.eventId, marketingEvents.name, marketingEvents.destination],
        set: { status: "skipped_no_consent", detail: null },
      });
      return;
    }

    let adapter: ServerEventSink | null = null;
    try { adapter = await ctx.getAdapter(opts.adapterId); } catch { adapter = null; }
    if (!adapter) { await ctx.log("info", `${job.kind}: ${opts.adapterId} not enabled, skipping`); return; }

    const items = await ctx.db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
    const event = buildPurchaseEvent(order, items);
    let result: { ok: boolean; detail?: string };
    try {
      result = await adapter.send(event, buildPurchaseContext(order));
    } catch (e) {
      result = { ok: false, detail: e instanceof Error ? e.message : "send failed" };
    }

    const status = result.ok ? "sent" : "failed";
    const detail = result.detail ? result.detail.slice(0, 300) : null;
    await ctx.db.insert(marketingEvents).values({
      eventId, name: "purchase", destination: opts.destination, orderId: order.id, status, detail,
    }).onConflictDoUpdate({
      target: [marketingEvents.eventId, marketingEvents.name, marketingEvents.destination],
      set: { status, detail },
    });
    if (!result.ok) {
      if (result.detail?.startsWith("permanent:")) {
        await ctx.log("error", `${job.kind}: permanent failure`, { orderId, detail });
        return; // retrying cannot help; visible in marketing_events + integration events
      }
      throw new Error(`${job.kind} failed: ${detail ?? "unknown"}`);
    }
  };
}

export const handlePurchaseMeta: JobHandler = makePurchaseHandler({
  adapterId: "meta", destination: "meta_capi", consentKey: "marketing",
});

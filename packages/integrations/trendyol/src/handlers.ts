import { and, eq, inArray, sql } from "drizzle-orm";
import {
  channelListings, channelPrices, inventory, inventoryMovements, orderItems, orders, productMappings,
  productVariants, syncCursors,
} from "@openshelf/db";
import type { MarketplaceOrder, MarketplaceProvider, MarketplaceStockUpdate } from "@openshelf/integration-sdk";
import { MAX_INVENTORY_BATCH } from "./endpoints";
import { computeStockDrift } from "./drift";

export type JobHandler = (
  job: { id: string; kind: string; payload: any; attempts: number },
  ctx: {
    db: any; env: any; getAdapter: (id: string) => Promise<any>;
    log: (level: string, msg: string, meta?: any) => Promise<void>;
  },
) => Promise<void>;

const CHANNEL = "trendyol";
export const ORDERS_CURSOR_KEY = "trendyol:orders:since";
const OVERLAP_MS = 5 * 60_000;
const DEFAULT_LOOKBACK_MS = 3 * 24 * 3600_000;

async function getProvider(ctx: Parameters<JobHandler>[1]): Promise<MarketplaceProvider | null> {
  try { return (await ctx.getAdapter("trendyol")) ?? null; } catch { return null; }
}

/** Builds push rows (and drift view) for variants. variantIds undefined = all enabled trendyol listings. */
async function loadStockRows(db: any, variantIds?: string[]) {
  const listings: any[] = await db.select().from(channelListings).where(
    variantIds ? and(eq(channelListings.channel, CHANNEL), eq(channelListings.enabled, true), inArray(channelListings.variantId, variantIds))
      : and(eq(channelListings.channel, CHANNEL), eq(channelListings.enabled, true)));
  const ids = listings.map((l) => l.variantId as string);
  if (!ids.length) return [];
  const [inv, prices, variants, maps] = (await Promise.all([
    db.select().from(inventory).where(inArray(inventory.variantId, ids)),
    db.select().from(channelPrices).where(and(eq(channelPrices.channel, CHANNEL), inArray(channelPrices.variantId, ids))),
    db.select().from(productVariants).where(inArray(productVariants.id, ids)),
    db.select().from(productMappings).where(and(eq(productMappings.provider, CHANNEL), inArray(productMappings.variantId, ids))),
  ])) as [any[], any[], any[], any[]];
  const by = <T extends Record<string, any>>(rows: T[], k: string) => new Map(rows.map((r) => [r[k], r]));
  const iM = by(inv, "variantId"), pM = by(prices, "variantId"), vM = by(variants, "id"), mM = by(maps, "variantId");
  return listings.map((l) => {
    const i: any = iM.get(l.variantId), v: any = vM.get(l.variantId), m: any = mM.get(l.variantId), pr: any = pM.get(l.variantId);
    const available = Math.max(0, (i?.total ?? 0) - (i?.reserved ?? 0) - (i?.safetyStock ?? 0));
    return {
      variantId: l.variantId as string, sku: (m?.externalSku ?? v?.sku) as string | undefined,
      barcode: (m?.externalBarcode ?? v?.barcode ?? undefined) as string | undefined,
      available, price: pr ? (pr.price as number) / 100 : undefined, lastSyncedStock: (l.lastSyncedStock ?? null) as number | null,
    };
  });
}

/** payload: { variantIds?: string[], stockOnly?: boolean } ; duplicates collapse, stockOnly skips unchanged stock. */
export const stockPush: JobHandler = async (job, ctx) => {
  const provider = await getProvider(ctx);
  if (!provider) { await ctx.log("info", "trendyol.stock_push: trendyol not enabled"); return; }
  const requested: string[] | undefined = Array.isArray(job.payload?.variantIds)
    ? [...new Set<string>(job.payload.variantIds)] : undefined;
  if (requested && requested.length === 0) return;
  let rows = await loadStockRows(ctx.db, requested);
  if (job.payload?.stockOnly) rows = rows.filter((r) => r.lastSyncedStock !== r.available);
  if (!rows.length) return;

  const now = new Date();
  const noBarcode = rows.filter((r) => !r.barcode);
  for (const r of noBarcode) {
    await ctx.db.update(channelListings).set({ lastError: "missing barcode" })
      .where(and(eq(channelListings.variantId, r.variantId), eq(channelListings.channel, CHANNEL)));
  }
  const pushable = rows.filter((r) => r.barcode);
  let failed: string | undefined;
  for (let i = 0; i < pushable.length; i += MAX_INVENTORY_BATCH) {
    const chunk = pushable.slice(i, i + MAX_INVENTORY_BATCH);
    const updates: MarketplaceStockUpdate[] = chunk.map((r) => ({ sku: r.sku ?? r.variantId, barcode: r.barcode, quantity: r.available, price: r.price }));
    const res = await provider.pushStockAndPrice(updates); // throws on transport errors => outbox retry
    const bad = new Set((res.errors ?? []).map((e) => e.split(":")[0]));
    for (const r of chunk) {
      const itemFailed = bad.has(r.barcode!);
      await ctx.db.update(channelListings).set(itemFailed
        ? { lastError: (res.errors ?? []).find((e) => e.startsWith(`${r.barcode}:`))?.slice(0, 300) ?? "failed" }
        : { lastSyncedStock: r.available, lastSyncedAt: now, lastError: null })
        .where(and(eq(channelListings.variantId, r.variantId), eq(channelListings.channel, CHANNEL)));
    }
    if (!res.ok && res.errors?.length) failed = res.errors[0];
  }
  if (failed) await ctx.log("warn", "trendyol.stock_push: some items rejected", { sample: failed });
};

/** Admin/report helper: compares central available vs last synced stock. */
export async function stockDriftReport(db: any, tolerance = 0) {
  const rows = await loadStockRows(db);
  return computeStockDrift(rows.map((r) => ({ variantId: r.variantId, sku: r.sku, centralAvailable: r.available, remoteQuantity: r.lastSyncedStock })), tolerance);
}

export interface ImportResult { imported: number; duplicate: number; unmappedLines: number }

export async function importTrendyolOrder(db: any, o: MarketplaceOrder, newId: () => string = () => crypto.randomUUID()): Promise<"imported" | "duplicate" | { unmapped: number }> {
  const existing = (await db.select().from(orders).where(and(eq(orders.source, CHANNEL), eq(orders.externalOrderId, o.externalId))).limit(1))[0];
  if (existing) {
    if (existing.status !== o.status) await db.update(orders).set({ status: o.status, updatedAt: new Date() }).where(eq(orders.id, existing.id));
    return "duplicate";
  }
  if (o.status === "cancelled") return "duplicate"; // never seen + already cancelled: nothing to reserve or import
  const id = newId();
  // Resolve variants first (reads), then write everything in ONE atomic db.batch: order + items + stock decrements + movements.
  // The unique (source, external_order_id) index makes the order insert fail on a concurrent/replayed import, which rolls the
  // whole batch back, so stock can neither be skipped (crash mid-import) nor decremented twice.
  let unmapped = 0;
  const lines: { idx: number; l: MarketplaceOrder["lines"][number]; variantId: string | null }[] = [];
  for (const [idx, l] of o.lines.entries()) {
    const variant = (await db.select().from(productVariants).where(
      l.barcode ? sql`${productVariants.sku} = ${l.sku} OR ${productVariants.barcode} = ${l.barcode}` : eq(productVariants.sku, l.sku)).limit(1))[0];
    if (!variant) unmapped++;
    lines.push({ idx, l, variantId: variant?.id ?? null });
  }
  const now = new Date();
  const stmts: unknown[] = [
    db.insert(orders).values({
      id, number: `TY-${o.externalId}`, source: CHANNEL, externalOrderId: o.externalId, status: o.status,
      email: o.customer.email ?? `trendyol-${o.externalId}@marketplace.invalid`,
      shippingAddress: { name: o.customer.name, phone: o.customer.phone, line1: o.customer.address, city: o.customer.city, country: "TR" },
      currency: o.currency, subtotal: o.total, total: o.total, trackingToken: newId(), notes: "Imported from Trendyol",
    }),
  ];
  for (const { idx, l, variantId } of lines) {
    stmts.push(db.insert(orderItems).values({ id: `${id}:${idx}`, orderId: id, variantId, sku: l.sku, name: l.sku, quantity: l.quantity, unitPrice: l.unitPrice }));
    if (!variantId) continue;
    stmts.push(db.update(inventory).set({ total: sql`${inventory.total} - ${l.quantity}`, updatedAt: now }).where(eq(inventory.variantId, variantId)));
    stmts.push(db.insert(inventoryMovements).values({ variantId, delta: -l.quantity, reason: "trendyol_sale", refType: "order", refId: id }));
  }
  try { await db.batch(stmts as [any, ...any[]]); }
  catch (e) {
    const dup = (await db.select({ id: orders.id }).from(orders).where(and(eq(orders.source, CHANNEL), eq(orders.externalOrderId, o.externalId))).limit(1))[0];
    if (dup) return "duplicate"; // lost a race: other worker imported it (batch rolled back, nothing decremented)
    throw e;
  }
  return unmapped ? { unmapped } : "imported";
}

/** payload: { sinceMs?: number } optional override. Cursor in sync_cursors; safe to re-run. */
export const reconcileOrders: JobHandler = async (job, ctx) => {
  const provider = await getProvider(ctx);
  if (!provider) { await ctx.log("info", "trendyol.reconcile_orders: trendyol not enabled"); return; }
  const startedAt = Date.now();
  const cur = (await ctx.db.select().from(syncCursors).where(eq(syncCursors.key, ORDERS_CURSOR_KEY)).limit(1))[0];
  const since = new Date(typeof job.payload?.sinceMs === "number" ? job.payload.sinceMs : cur ? Number(cur.value) : startedAt - DEFAULT_LOOKBACK_MS);
  const touched = new Set<string>();
  const res: ImportResult = { imported: 0, duplicate: 0, unmappedLines: 0 };
  let page: string | undefined;
  do {
    const r = await provider.fetchOrders(since, page);
    for (const o of r.orders) {
      const out = await importTrendyolOrder(ctx.db, o);
      if (out === "duplicate") res.duplicate++;
      else { res.imported++; if (typeof out === "object") res.unmappedLines += out.unmapped; o.lines.forEach((l) => touched.add(l.sku)); }
    }
    page = r.nextCursor;
  } while (page);
  const value = String(startedAt - OVERLAP_MS);
  await ctx.db.insert(syncCursors).values({ key: ORDERS_CURSOR_KEY, value }).onConflictDoUpdate({ target: syncCursors.key, set: { value, updatedAt: new Date() } });
  if (res.unmappedLines) await ctx.log("warn", "trendyol.reconcile_orders: lines without variant mapping", { count: res.unmappedLines });
  await ctx.log("info", "trendyol.reconcile_orders done", { ...res });
};

import { and, eq, inArray, sql } from "drizzle-orm";
import {
  categories, channelListings, channelPrices, channelProductSettings, inventory, inventoryMovements, orderItems, orders, outboxJobs, productImages, productMappings,
  productVariants, products, shipments, syncCursors,
} from "@openshelf/db";
import type { MarketplaceCategory, MarketplaceOrder, MarketplaceProduct, MarketplaceProductVariant, MarketplaceProvider, MarketplaceStockUpdate } from "@openshelf/integration-sdk";
import { SQLiteSyncDialect } from "drizzle-orm/sqlite-core";
import type { SQL } from "drizzle-orm";
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
const CHUNK = 90; // D1 allows 100 bound parameters per statement
const chunks = <T,>(a: T[], n: number) => { const o: T[][] = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; };
const uniq = <T,>(a: T[]) => [...new Set(a)];
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
  // price follows Trendyol for these products: never push our copy back
  const remotePriced = new Set<string>();
  const pids = uniq(variants.map((v) => v.productId as string));
  for (const c of chunks(pids, CHUNK)) {
    for (const r of await db.select().from(channelProductSettings).where(and(eq(channelProductSettings.channel, CHANNEL), inArray(channelProductSettings.productId, c)))) {
      if (r.priceSource === "remote") remotePriced.add(r.productId);
    }
  }
  return listings.map((l) => {
    const i: any = iM.get(l.variantId), v: any = vM.get(l.variantId), m: any = mM.get(l.variantId), pr: any = pM.get(l.variantId);
    const available = Math.max(0, (i?.total ?? 0) - (i?.reserved ?? 0) - (i?.safetyStock ?? 0));
    return {
      variantId: l.variantId as string, sku: (m?.externalSku ?? v?.sku) as string | undefined,
      barcode: (m?.externalBarcode ?? v?.barcode ?? undefined) as string | undefined,
      available, price: pr && !remotePriced.has(v?.productId) ? (pr.price as number) / 100 : undefined, lastSyncedStock: (l.lastSyncedStock ?? null) as number | null,
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

/**
 * Mirrors Trendyol's own cargo data as a `shipments` row (provider "trendyol"). Trendyol ships and invoices these orders itself, so
 * this row only exists to print a shipping slip and show tracking. Idempotent (deterministic id); cargo fields appear after pickup,
 * so it also runs for already-imported orders.
 */
export async function upsertTrendyolShipment(db: any, orderId: string, o: MarketplaceOrder): Promise<void> {
  const c = o.cargo;
  if (!c || !(c.provider || c.trackingNumber)) return;
  const status = o.status === "delivered" ? "delivered" : o.status === "shipped" ? "in_transit" : o.status === "cancelled" ? "cancelled" : "created";
  const values = {
    id: `ty-ship-${orderId}`, orderId, provider: CHANNEL, providerShipmentId: c.packageId ?? o.externalId, carrier: c.provider ?? null,
    trackingNumber: c.trackingNumber ?? null, trackingUrl: c.trackingLink ?? null, externalPackageId: c.packageId ?? o.externalId, status,
  };
  await db.insert(shipments).values(values).onConflictDoUpdate({
    target: shipments.id, set: { carrier: values.carrier, trackingNumber: values.trackingNumber, trackingUrl: values.trackingUrl, status },
  });
}

/** Raw SQL as a batch item. drizzle's D1 batch needs a prepared `stmt`, which `db.run(sql)` does not carry (same trick as core `raw`). */
function rawStmt(db: any, q: SQL) {
  const client = db.$client;
  if (!client?.prepare) return db.run(q); // non-D1 drivers (tests) batch SQLiteRaw fine
  const built = new SQLiteSyncDialect().sqlToQuery(q);
  const stmt = client.prepare(built.sql);
  return { _prepare: () => ({ stmt, getQuery: () => ({ sql: built.sql, params: built.params }), mapResult: (r: unknown) => r }) };
}

/**
 * A Trendyol order that we imported (and took stock for) was cancelled: put the stock back, once. Guarded by the movement log
 * (`trendyol_cancel` per order + variant) inside the batch, so a retry or a concurrent run cannot restock twice.
 */
async function restockCancelledOrder(db: any, orderId: string): Promise<number> {
  const moves: any[] = await db.select().from(inventoryMovements).where(and(eq(inventoryMovements.refType, "order"), eq(inventoryMovements.refId, orderId)));
  const done = new Set(moves.filter((m) => m.reason === "trendyol_cancel").map((m) => m.variantId as string));
  const back = new Map<string, number>();
  for (const m of moves) if (m.reason === "trendyol_sale" && !done.has(m.variantId)) back.set(m.variantId, (back.get(m.variantId) ?? 0) - (m.delta as number));
  const stmts: unknown[] = [];
  for (const [variantId, qty] of back) {
    if (qty <= 0) continue;
    const notYet = sql`NOT EXISTS (SELECT 1 FROM inventory_movements WHERE ref_type = 'order' AND ref_id = ${orderId} AND variant_id = ${variantId} AND reason = 'trendyol_cancel')`;
    stmts.push(db.update(inventory).set({ total: sql`${inventory.total} + ${qty}`, updatedAt: new Date() }).where(and(eq(inventory.variantId, variantId), notYet)));
    stmts.push(rawStmt(db, sql`INSERT INTO inventory_movements (variant_id, delta, reason, ref_type, ref_id) SELECT ${variantId}, ${qty}, 'trendyol_cancel', 'order', ${orderId} WHERE ${notYet}`));
  }
  if (stmts.length) await db.batch(stmts as [any, ...any[]]);
  return stmts.length / 2;
}

/**
 * `fx.stockChanged` is set when local stock moved (sale taken or cancelled order restocked), so the caller can push the new numbers.
 * Stock is only taken for variants whose Trendyol listing is not switched off: a "website only" product keeps its own stock.
 */
export async function importTrendyolOrder(db: any, o: MarketplaceOrder, newId: () => string = () => crypto.randomUUID(), fx?: { stockChanged?: boolean }): Promise<"imported" | "duplicate" | { unmapped: number }> {
  const existing = (await db.select().from(orders).where(and(eq(orders.source, CHANNEL), eq(orders.externalOrderId, o.externalId))).limit(1))[0];
  if (existing) {
    if (existing.status !== o.status) await db.update(orders).set({ status: o.status, updatedAt: new Date() }).where(eq(orders.id, existing.id));
    if (o.status === "cancelled" && (await restockCancelledOrder(db, existing.id)) > 0 && fx) fx.stockChanged = true;
    await upsertTrendyolShipment(db, existing.id, o);
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
  const lineVariants = uniq(lines.map((x) => x.variantId).filter((v): v is string => !!v));
  const off = new Set<string>(lineVariants.length ? (await db.select().from(channelListings)
    .where(and(eq(channelListings.channel, CHANNEL), eq(channelListings.enabled, false), inArray(channelListings.variantId, lineVariants)))).map((r: any) => r.variantId as string) : []);
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
    stmts.push(db.insert(orderItems).values({ id: `${id}:${idx}`, orderId: id, variantId, sku: l.sku, name: l.name ?? l.sku, quantity: l.quantity, unitPrice: l.unitPrice }));
    if (!variantId || off.has(variantId)) continue; // unmapped, or website-only (separate stock)
    if (fx) fx.stockChanged = true;
    stmts.push(db.update(inventory).set({ total: sql`${inventory.total} - ${l.quantity}`, updatedAt: now }).where(eq(inventory.variantId, variantId)));
    stmts.push(db.insert(inventoryMovements).values({ variantId, delta: -l.quantity, reason: "trendyol_sale", refType: "order", refId: id }));
  }
  try { await db.batch(stmts as [any, ...any[]]); }
  catch (e) {
    const dup = (await db.select({ id: orders.id }).from(orders).where(and(eq(orders.source, CHANNEL), eq(orders.externalOrderId, o.externalId))).limit(1))[0];
    if (dup) { if (fx) fx.stockChanged = false; return "duplicate"; } // lost a race: other worker imported it (batch rolled back, nothing decremented)
    throw e;
  }
  await upsertTrendyolShipment(db, id, o);
  return unmapped ? { unmapped } : "imported";
}

/** payload: { sinceMs?: number } optional override. Cursor in sync_cursors; safe to re-run. */
export const reconcileOrders: JobHandler = async (job, ctx) => {
  const provider = await getProvider(ctx);
  if (!provider) { await ctx.log("info", "trendyol.reconcile_orders: trendyol not enabled"); return; }
  const startedAt = Date.now();
  const cur = (await ctx.db.select().from(syncCursors).where(eq(syncCursors.key, ORDERS_CURSOR_KEY)).limit(1))[0];
  const since = new Date(typeof job.payload?.sinceMs === "number" ? job.payload.sinceMs : cur ? Number(cur.value) : startedAt - DEFAULT_LOOKBACK_MS);
  const fx = { stockChanged: false };
  const res: ImportResult = { imported: 0, duplicate: 0, unmappedLines: 0 };
  let page: string | undefined;
  do {
    const r = await provider.fetchOrders(since, page);
    for (const o of r.orders) {
      const one = { stockChanged: false };
      const out = await importTrendyolOrder(ctx.db, o, undefined, one);
      if (one.stockChanged) fx.stockChanged = true;
      if (out === "duplicate") res.duplicate++;
      else { res.imported++; if (typeof out === "object") res.unmappedLines += out.unmapped; }
    }
    page = r.nextCursor;
  } while (page);
  // Local stock is the truth: a Trendyol sale (or a cancelled one) changed it above, so push the new quantities back (only drifted rows).
  if (fx.stockChanged) {
    await ctx.db.insert(outboxJobs).values({
      id: crypto.randomUUID(), kind: "trendyol.stock_push", dedupeKey: `trendyol.stock_push:after-import:${Math.floor(startedAt / 60000)}`, payload: { stockOnly: true },
    }).onConflictDoNothing();
  }
  const value = String(startedAt - OVERLAP_MS);
  await ctx.db.insert(syncCursors).values({ key: ORDERS_CURSOR_KEY, value }).onConflictDoUpdate({ target: syncCursors.key, set: { value, updatedAt: new Date() } });
  if (res.unmappedLines) await ctx.log("warn", "trendyol.reconcile_orders: lines without variant mapping", { count: res.unmappedLines });
  await ctx.log("info", "trendyol.reconcile_orders done", { ...res });
};


// ---------------------------------------------------------------------------------------------------------------------
// Product import (Trendyol -> OpenShelf)
// ---------------------------------------------------------------------------------------------------------------------

export const PRODUCTS_STATUS_KEY = "trendyol:products:last";
const BATCH_SIZE = 100;

export interface ImportTotals {
  pages: number; contents: number; variants: number; linked: number; created: number; updated: number; skipped: number; stockChanged: number; categories: number;
}
export const emptyTotals = (): ImportTotals => ({ pages: 0, contents: 0, variants: 0, linked: 0, created: 0, updated: 0, skipped: 0, stockChanged: 0, categories: 0 });
export interface ImportStatus {
  runId: string; state: "queued" | "running" | "done" | "error"; dryRun: boolean; createMissing: boolean; sourceOfTruth: "local" | "trendyol";
  startedAt: string; finishedAt?: string; totals: ImportTotals; error?: string;
}

const TR: Record<string, string> = { ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u", Ç: "c", Ğ: "g", İ: "i", Ö: "o", Ş: "s", Ü: "u" };
export const slugify = (s: string) =>
  s.replace(/[çğıöşüÇĞİÖŞÜ]/g, (c) => TR[c] ?? c).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "product";


async function saveStatus(db: any, st: ImportStatus) {
  const value = JSON.stringify(st);
  await db.insert(syncCursors).values({ key: PRODUCTS_STATUS_KEY, value }).onConflictDoUpdate({ target: syncCursors.key, set: { value, updatedAt: new Date() } });
}
export async function loadImportStatus(db: any): Promise<ImportStatus | null> {
  const r = (await db.select().from(syncCursors).where(eq(syncCursors.key, PRODUCTS_STATUS_KEY)).limit(1))[0];
  if (!r) return null;
  try { return JSON.parse(r.value) as ImportStatus; } catch { return null; }
}

const optionsTitle = (o?: Record<string, string>) => (o && Object.keys(o).length ? Object.values(o).join(" / ") : null);

/**
 * Maps each remote product to a local category id (product externalId -> category id), creating what is missing:
 *  1. local category `ty-cat-<trendyolId>` (created by an earlier import) is reused,
 *  2. else a local category with the same name is reused (so your own categories are not duplicated),
 *  3. else the category and ALL its ancestors are created from Trendyol's category tree (fetched once, only when needed).
 * If the tree cannot be fetched, a flat category (no parent) is created from the product's category name instead.
 */
async function resolveCategories(
  db: any, remote: MarketplaceProduct[], stmts: unknown[], fetchTree: (() => Promise<MarketplaceCategory[]>) | undefined, t: { categories: number },
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const wanted = remote.filter((p) => p.categoryId || p.category);
  if (!wanted.length) return out;
  const existing: any[] = await db.select().from(categories);
  const ids = new Set<string>(existing.map((c) => c.id));
  const byName = new Map<string, string>(existing.map((c) => [String(c.nameTr).toLowerCase(), c.id as string]));
  const localId = (extId: string) => `ty-cat-${extId}`;
  const missing: MarketplaceProduct[] = [];
  for (const p of wanted) {
    if (p.categoryId && ids.has(localId(p.categoryId))) out.set(p.externalId, localId(p.categoryId));
    else if (p.category && byName.has(p.category.toLowerCase())) out.set(p.externalId, byName.get(p.category.toLowerCase())!);
    else missing.push(p);
  }
  if (!missing.length) return out;

  let tree = new Map<string, MarketplaceCategory>();
  if (fetchTree && missing.some((p) => p.categoryId)) {
    try { tree = new Map((await fetchTree()).map((c) => [c.externalId, c])); } catch { /* flat fallback below */ }
  }
  const add = (id: string, name: string, parent: string | null) => {
    if (ids.has(id)) return;
    ids.add(id); byName.set(name.toLowerCase(), id); t.categories++;
    stmts.push(db.insert(categories).values({ id, slug: `${slugify(name)}-${id.replace(/^ty-cat-/, "")}`.slice(0, 100), nameTr: name, parentId: parent }).onConflictDoNothing());
  };
  for (const p of missing) {
    const leaf = p.categoryId ? tree.get(p.categoryId) : undefined;
    if (p.categoryId && leaf) {
      const chain: MarketplaceCategory[] = [];
      for (let n: MarketplaceCategory | undefined = leaf, guard = 0; n && guard < 20; n = n.parentId ? tree.get(n.parentId) : undefined, guard++) chain.unshift(n);
      chain.forEach((n, i) => add(localId(n.externalId), n.name, i > 0 ? localId(chain[i - 1]!.externalId) : null)); // parents first
      out.set(p.externalId, localId(p.categoryId));
    } else if (p.category) {
      const id = p.categoryId ? localId(p.categoryId) : `ty-cat-n-${slugify(p.category)}`;
      add(id, p.category, null);
      out.set(p.externalId, byName.get(p.category.toLowerCase()) ?? id);
    }
  }
  return out;
}

/**
 * Applies ONE page of Trendyol products to the local catalog. Idempotent: ids of created rows are derived from Trendyol ids, so a
 * re-run (retry, overlapping schedules) updates instead of duplicating.
 *  - match order: existing trendyol mapping (barcode) -> local variant barcode -> local sku == stockCode/barcode
 *  - matched: mapping + listing are linked; with sourceOfTruth "trendyol" stock, prices, content and active flag are overwritten
 *  - unmatched: created as DRAFT products when createMissing, otherwise skipped
 */
export async function applyTrendyolProducts(
  db: any, remote: MarketplaceProduct[],
  opts: { sourceOfTruth: "local" | "trendyol"; createMissing: boolean; dryRun: boolean; now?: Date; fetchCategories?: () => Promise<MarketplaceCategory[]> },
): Promise<Omit<ImportTotals, "pages">> {
  const t: Omit<ImportTotals, "pages"> = { contents: remote.length, variants: 0, linked: 0, created: 0, updated: 0, skipped: 0, stockChanged: 0, categories: 0 };
  const truth = opts.sourceOfTruth === "trendyol";
  const now = opts.now ?? new Date();
  const all = remote.flatMap((p) => p.variants.map((v) => ({ p, v })));
  t.variants = all.length;
  if (!all.length) return t;

  const barcodes = uniq(all.map((x) => x.v.barcode));
  const skus = uniq(all.flatMap((x) => [x.v.stockCode, x.v.barcode].filter((s): s is string => !!s)));
  const [maps, byBarcode, bySku] = await Promise.all([
    Promise.all(chunks(barcodes, CHUNK).map((c) => db.select().from(productMappings).where(and(eq(productMappings.provider, CHANNEL), inArray(productMappings.externalBarcode, c))))),
    Promise.all(chunks(barcodes, CHUNK).map((c) => db.select().from(productVariants).where(inArray(productVariants.barcode, c)))),
    Promise.all(chunks(skus, CHUNK).map((c) => db.select().from(productVariants).where(inArray(productVariants.sku, c)))),
  ]) as [any[][], any[][], any[][]];
  const variantsById = new Map<string, any>();
  for (const v of [...byBarcode.flat(), ...bySku.flat()]) variantsById.set(v.id, v);
  const mapIds = maps.flat().filter((m: any) => !variantsById.has(m.variantId)).map((m: any) => m.variantId as string);
  for (const c of chunks(uniq(mapIds), CHUNK)) for (const v of await db.select().from(productVariants).where(inArray(productVariants.id, c))) variantsById.set(v.id, v);
  const mapByBarcode = new Map<string, any>(maps.flat().map((m: any) => [m.externalBarcode, m]));
  const vByBarcode = new Map<string, any>([...variantsById.values()].filter((v) => v.barcode).map((v) => [v.barcode, v]));
  const vBySku = new Map<string, any>([...variantsById.values()].map((v) => [v.sku, v]));

  const matchedIds = uniq([...variantsById.keys()]);
  const invRows: any[] = (await Promise.all(chunks(matchedIds, CHUNK).map((c) => db.select().from(inventory).where(inArray(inventory.variantId, c))))).flat();
  const invBy = new Map<string, any>(invRows.map((r) => [r.variantId, r]));
  const stmts: unknown[] = [];
  const catOf = opts.dryRun || !(opts.createMissing || truth) ? new Map<string, string>() : await resolveCategories(db, remote, stmts, opts.fetchCategories, t);
  const usedSkus = new Set<string>(); const contentDone = new Set<string>(); const newProducts = new Set<string>();

  const setStockAndPrice = (variantId: string, v: MarketplaceProductVariant, current: any | undefined) => {
    const total = current ? v.quantity + (current.reserved ?? 0) + (current.safetyStock ?? 0) : v.quantity;
    const delta = total - (current?.total ?? 0);
    if (!current) stmts.push(db.insert(inventory).values({ variantId, total, reserved: 0, safetyStock: 0 }).onConflictDoNothing());
    else if (delta !== 0) stmts.push(db.update(inventory).set({ total: sql`${inventory.total} + ${delta}`, updatedAt: now }).where(eq(inventory.variantId, variantId)));
    if (delta !== 0) { stmts.push(db.insert(inventoryMovements).values({ variantId, delta, reason: "trendyol_sync", refType: "product_import", refId: null })); t.stockChanged++; }
    for (const channel of ["trendyol", "website"] as const) {
      const v2 = { price: v.salePrice, compareAtPrice: v.listPrice > v.salePrice ? v.listPrice : null, currency: "TRY" };
      stmts.push(db.insert(channelPrices).values({ variantId, channel, ...v2 }).onConflictDoUpdate({ target: [channelPrices.variantId, channelPrices.channel], set: v2 }));
    }
  };
  const link = (variantId: string, sku: string, v: MarketplaceProductVariant, p: MarketplaceProduct) => {
    const m = { externalSku: sku, externalBarcode: v.barcode, externalId: p.externalId };
    stmts.push(db.insert(productMappings).values({ id: crypto.randomUUID(), variantId, provider: CHANNEL, ...m })
      .onConflictDoUpdate({ target: [productMappings.provider, productMappings.variantId], set: m }));
    stmts.push(db.insert(channelListings).values({ variantId, channel: CHANNEL, enabled: true, externalId: p.externalId, ...(truth ? { lastSyncedStock: v.quantity, lastSyncedAt: now } : {}) })
      .onConflictDoUpdate({ target: [channelListings.variantId, channelListings.channel], set: { externalId: p.externalId, lastError: null, ...(truth ? { lastSyncedStock: v.quantity, lastSyncedAt: now } : {}) } }));
  };
  const writeContent = (productId: string, p: MarketplaceProduct) => {
    const categoryId = catOf.get(p.externalId);
    stmts.push(db.update(products).set({ nameTr: p.title || "Untitled", descriptionTr: p.description ?? null, brand: p.brand ?? null, ...(categoryId ? { categoryId } : {}), updatedAt: now }).where(eq(products.id, productId)));
    stmts.push(db.delete(productImages).where(eq(productImages.productId, productId)));
    p.images.forEach((url, i) => stmts.push(db.insert(productImages).values({ id: `${productId}:${i}`, productId, url, alt: p.title.slice(0, 200), position: i })));
  };

  for (const { p, v } of all) {
    const local = mapByBarcode.has(v.barcode) ? variantsById.get(mapByBarcode.get(v.barcode).variantId)
      : vByBarcode.get(v.barcode) ?? (v.stockCode ? vBySku.get(v.stockCode) : undefined) ?? vBySku.get(v.barcode);
    if (local) {
      t.linked++;
      if (opts.dryRun) continue;
      link(local.id, local.sku, v, p);
      if (!local.barcode) stmts.push(db.update(productVariants).set({ barcode: v.barcode }).where(eq(productVariants.id, local.id)));
      if (truth) {
        t.updated++;
        setStockAndPrice(local.id, v, invBy.get(local.id));
        stmts.push(db.update(productVariants).set({ active: v.active }).where(eq(productVariants.id, local.id)));
        if (!contentDone.has(local.productId)) { contentDone.add(local.productId); writeContent(local.productId, p); }
      }
      continue;
    }
    // unmatched
    const sku = v.stockCode || v.barcode;
    if (!opts.createMissing || usedSkus.has(sku)) { t.skipped++; continue; }
    usedSkus.add(sku); t.created++;
    if (opts.dryRun) continue;
    const productId = `ty-${p.externalId}`;
    if (!newProducts.has(productId)) {
      newProducts.add(productId);
      const categoryId = catOf.get(p.externalId) ?? null;
      stmts.push(db.insert(products).values({ id: productId, slug: `${slugify(p.title)}-${p.externalId}`, categoryId, nameTr: p.title || "Untitled", descriptionTr: p.description ?? null, brand: p.brand ?? null, status: "draft" }).onConflictDoNothing());
      p.images.forEach((url, i) => stmts.push(db.insert(productImages).values({ id: `${productId}:${i}`, productId, url, alt: p.title.slice(0, 200), position: i }).onConflictDoNothing()));
    }
    const variantId = `tyv-${v.barcode}`;
    stmts.push(db.insert(productVariants).values({ id: variantId, productId, sku, barcode: v.barcode, title: optionsTitle(v.options), options: v.options ?? null, active: v.active }).onConflictDoNothing());
    setStockAndPrice(variantId, v, undefined);
    link(variantId, sku, v, p);
  }

  for (const c of chunks(stmts, BATCH_SIZE)) await db.batch(c as [any, ...any[]]);
  return t;
}

/**
 * payload: { runId?, cursor?, createMissing?, dryRun?, totals? }. Processes ONE page and re-enqueues itself with the next cursor so
 * a single job never exceeds Worker subrequest limits. Progress/result is stored in sync_cursors[trendyol:products:last].
 */
export const importProducts: JobHandler = async (job, ctx) => {
  const provider = await getProvider(ctx);
  if (!provider) { await ctx.log("info", "trendyol.import_products: trendyol not enabled"); return; }
  if (!provider.fetchProducts) throw new Error("trendyol adapter has no fetchProducts");
  const sourceOfTruth = "local" as const; // OpenShelf is always the truth: import only creates/links, never overwrites
  const runId: string = job.payload?.runId ?? job.id;
  const dryRun = !!job.payload?.dryRun;
  const createMissing = job.payload?.createMissing ?? false;
  const totals: ImportTotals = { ...emptyTotals(), ...(job.payload?.totals ?? {}) };
  const prev = await loadImportStatus(ctx.db);
  const base: ImportStatus = {
    runId, state: "running", dryRun, createMissing, sourceOfTruth,
    startedAt: prev?.runId === runId ? prev.startedAt : new Date().toISOString(), totals,
  };
  try {
    const page = await provider.fetchProducts(job.payload?.cursor);
    const r = await applyTrendyolProducts(ctx.db, page.products, { sourceOfTruth, createMissing, dryRun, fetchCategories: provider.fetchCategories?.bind(provider) });
    totals.pages++;
    for (const k of Object.keys(r) as (keyof typeof r)[]) totals[k] += r[k];
    if (page.nextCursor) {
      await saveStatus(ctx.db, base);
      await ctx.db.insert(outboxJobs).values({
        id: crypto.randomUUID(), kind: "trendyol.import_products", dedupeKey: `trendyol.import_products:${runId}:${page.nextCursor}`,
        payload: { runId, cursor: page.nextCursor, createMissing, dryRun, totals },
      }).onConflictDoNothing();
      return;
    }
    await saveStatus(ctx.db, { ...base, state: "done", finishedAt: new Date().toISOString() });
    await ctx.log("info", "trendyol.import_products done", { ...totals, dryRun, sourceOfTruth });
  } catch (e) {
    // transport errors: outbox retries the same page; the status shows the last error meanwhile
    await saveStatus(ctx.db, { ...base, state: job.attempts >= 8 ? "error" : "running", error: (e instanceof Error ? e.message : String(e)).slice(0, 300) }).catch(() => {});
    throw e;
  }
};


// ---------------------------------------------------------------------------------------------------------------------
// Follow Trendyol (per product): content and/or price are pulled from Trendyol for products that ask for it
// ---------------------------------------------------------------------------------------------------------------------

export interface PullTotals { pages: number; products: number; content: number; prices: number; stock: number }
export const emptyPullTotals = (): PullTotals => ({ pages: 0, products: 0, content: 0, prices: 0, stock: 0 });

/**
 * Applies ONE page of Trendyol products to the linked local products that follow Trendyol.
 *  - content (title, description, brand, photos) is overwritten where the product's content source is "remote"
 *  - prices (Trendyol + website) are overwritten where the price source is "remote"
 *  - `opts.stock` (manual, one-off): local stock is set so that the sellable quantity equals Trendyol's
 * Only products with at least one ENABLED listing are touched; `opts.productIds` narrows it further. Idempotent.
 */
export async function applyFollowedProducts(
  db: any, remote: MarketplaceProduct[], opts: { productIds?: string[]; stock?: boolean; now?: Date } = {},
): Promise<Omit<PullTotals, "pages">> {
  const t = { products: 0, content: 0, prices: 0, stock: 0 };
  const now = opts.now ?? new Date();
  const all = remote.flatMap((p) => p.variants.map((v) => ({ p, v })));
  if (!all.length) return t;
  const barcodes = uniq(all.map((x) => x.v.barcode));
  const maps: any[] = (await Promise.all(chunks(barcodes, CHUNK).map((c) => db.select().from(productMappings).where(and(eq(productMappings.provider, CHANNEL), inArray(productMappings.externalBarcode, c)))))).flat();
  if (!maps.length) return t;
  const vids = uniq(maps.map((m) => m.variantId as string));
  const load = async (table: any, col: any, extra?: any) => (await Promise.all(chunks(vids, CHUNK).map((c) => db.select().from(table).where(extra ? and(extra, inArray(col, c)) : inArray(col, c))))).flat() as any[];
  const [variants, listings, inv] = await Promise.all([
    load(productVariants, productVariants.id), load(channelListings, channelListings.variantId, eq(channelListings.channel, CHANNEL)), load(inventory, inventory.variantId),
  ]);
  const vBy = new Map(variants.map((v) => [v.id as string, v])); const invBy = new Map(inv.map((i) => [i.variantId as string, i]));
  const on = new Set(listings.filter((l) => l.enabled).map((l) => l.variantId as string));
  const only = opts.productIds ? new Set(opts.productIds) : null;
  const pids = uniq(variants.map((v) => v.productId as string)).filter((id) => !only || only.has(id));
  const settings = new Map<string, any>();
  for (const c of chunks(pids, CHUNK)) for (const r of await db.select().from(channelProductSettings).where(and(eq(channelProductSettings.channel, CHANNEL), inArray(channelProductSettings.productId, c)))) settings.set(r.productId, r);
  const mapBy = new Map(maps.map((m) => [m.externalBarcode as string, m]));

  const stmts: unknown[] = []; const touched = new Set<string>(); const contentDone = new Set<string>();
  for (const { p, v } of all) {
    const m = mapBy.get(v.barcode); const local = m ? vBy.get(m.variantId) : undefined;
    if (!local || !on.has(local.id) || (only && !only.has(local.productId))) continue;
    const st = settings.get(local.productId);
    const content = st?.contentSource === "remote", price = st?.priceSource === "remote";
    if (!content && !price && !opts.stock) continue;
    touched.add(local.productId);
    if (content && !contentDone.has(local.productId)) {
      contentDone.add(local.productId); t.content++;
      stmts.push(db.update(products).set({ nameTr: p.title || "Untitled", descriptionTr: p.description ?? null, brand: p.brand ?? null, updatedAt: now }).where(eq(products.id, local.productId)));
      if (p.images.length) { // never wipe photos when Trendyol returns none
        stmts.push(db.delete(productImages).where(eq(productImages.productId, local.productId)));
        p.images.forEach((url, i) => stmts.push(db.insert(productImages).values({ id: `${local.productId}:${i}`, productId: local.productId, url, alt: p.title.slice(0, 200), position: i })
          .onConflictDoUpdate({ target: productImages.id, set: { url, alt: p.title.slice(0, 200), position: i, mediaId: null } })));
      }
    }
    if (price && v.salePrice > 0) {
      t.prices++;
      const v2 = { price: v.salePrice, compareAtPrice: v.listPrice > v.salePrice ? v.listPrice : null, currency: "TRY" };
      for (const channel of ["trendyol", "website"] as const) {
        stmts.push(db.insert(channelPrices).values({ variantId: local.id, channel, ...v2 }).onConflictDoUpdate({ target: [channelPrices.variantId, channelPrices.channel], set: v2 }));
      }
    }
    if (opts.stock) {
      const cur = invBy.get(local.id);
      const total = v.quantity + (cur?.reserved ?? 0) + (cur?.safetyStock ?? 0);
      const delta = total - (cur?.total ?? 0);
      if (!cur) stmts.push(db.insert(inventory).values({ variantId: local.id, total, reserved: 0, safetyStock: 0 }).onConflictDoNothing());
      else if (delta !== 0) stmts.push(db.update(inventory).set({ total: sql`${inventory.total} + ${delta}`, updatedAt: now }).where(eq(inventory.variantId, local.id)));
      if (delta !== 0) { t.stock++; stmts.push(db.insert(inventoryMovements).values({ variantId: local.id, delta, reason: "trendyol_sync", refType: "product_pull", refId: null })); }
      stmts.push(db.update(channelListings).set({ lastSyncedStock: v.quantity, lastSyncedAt: now, lastError: null }).where(and(eq(channelListings.variantId, local.id), eq(channelListings.channel, CHANNEL))));
    }
  }
  for (const id of touched) {
    stmts.push(db.insert(channelProductSettings).values({ productId: id, channel: CHANNEL, lastPulledAt: now, lastPullError: null })
      .onConflictDoUpdate({ target: [channelProductSettings.productId, channelProductSettings.channel], set: { lastPulledAt: now, lastPullError: null } }));
  }
  t.products = touched.size;
  for (const c of chunks(stmts, BATCH_SIZE)) await db.batch(c as [any, ...any[]]);
  return t;
}

/** True when at least one product follows Trendyol for content or price (the scheduler only pulls then). */
export async function hasFollowedProducts(db: any): Promise<boolean> {
  const r = await db.select({ p: channelProductSettings.productId }).from(channelProductSettings)
    .where(and(eq(channelProductSettings.channel, CHANNEL), sql`(${channelProductSettings.contentSource} = 'remote' OR ${channelProductSettings.priceSource} = 'remote')`)).limit(1);
  return r.length > 0;
}

/**
 * payload: { runId?, cursor?, productIds?, stock?, totals? }. Like the import, ONE page per job, re-enqueued with the next cursor.
 * Scheduled runs pass no productIds (every followed product); "pull now" in the admin passes the picked products.
 */
export const pullProducts: JobHandler = async (job, ctx) => {
  const provider = await getProvider(ctx);
  if (!provider) { await ctx.log("info", "trendyol.pull_products: trendyol not enabled"); return; }
  if (!provider.fetchProducts) throw new Error("trendyol adapter has no fetchProducts");
  const runId: string = job.payload?.runId ?? job.id;
  const productIds: string[] | undefined = Array.isArray(job.payload?.productIds) ? job.payload.productIds.slice(0, 500) : undefined;
  const stock = !!job.payload?.stock && !!productIds?.length; // stock overwrite is never a scheduled/blanket operation
  const totals: PullTotals = { ...emptyPullTotals(), ...(job.payload?.totals ?? {}) };
  const page = await provider.fetchProducts(job.payload?.cursor);
  const r = await applyFollowedProducts(ctx.db, page.products, { productIds, stock });
  totals.pages++;
  for (const k of Object.keys(r) as (keyof typeof r)[]) totals[k] += r[k];
  if (page.nextCursor) {
    await ctx.db.insert(outboxJobs).values({
      id: crypto.randomUUID(), kind: "trendyol.pull_products", dedupeKey: `trendyol.pull_products:${runId}:${page.nextCursor}`,
      payload: { runId, cursor: page.nextCursor, ...(productIds ? { productIds } : {}), stock, totals },
    }).onConflictDoNothing();
    return;
  }
  await ctx.log("info", "trendyol.pull_products done", { ...totals, stock });
};

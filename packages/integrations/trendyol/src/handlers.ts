import { and, eq, inArray, sql } from "drizzle-orm";
import {
  categories, channelListings, channelPrices, inventory, inventoryMovements, orderItems, orders, outboxJobs, productImages, productMappings,
  productVariants, products, syncCursors,
} from "@openshelf/db";
import type { MarketplaceOrder, MarketplaceProduct, MarketplaceProductVariant, MarketplaceProvider, MarketplaceStockUpdate } from "@openshelf/integration-sdk";
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
  if (provider.sourceOfTruth === "trendyol") return; // Trendyol owns stock/price: never overwrite it from here
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


// ---------------------------------------------------------------------------------------------------------------------
// Product import (Trendyol -> OpenShelf)
// ---------------------------------------------------------------------------------------------------------------------

export const PRODUCTS_STATUS_KEY = "trendyol:products:last";
const CHUNK = 90; // D1 allows 100 bound parameters per statement
const BATCH_SIZE = 100;

export interface ImportTotals {
  pages: number; contents: number; variants: number; linked: number; created: number; updated: number; skipped: number; stockChanged: number;
}
export const emptyTotals = (): ImportTotals => ({ pages: 0, contents: 0, variants: 0, linked: 0, created: 0, updated: 0, skipped: 0, stockChanged: 0 });
export interface ImportStatus {
  runId: string; state: "queued" | "running" | "done" | "error"; dryRun: boolean; createMissing: boolean; sourceOfTruth: "local" | "trendyol";
  startedAt: string; finishedAt?: string; totals: ImportTotals; error?: string;
}

const TR: Record<string, string> = { ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u", Ç: "c", Ğ: "g", İ: "i", Ö: "o", Ş: "s", Ü: "u" };
export const slugify = (s: string) =>
  s.replace(/[çğıöşüÇĞİÖŞÜ]/g, (c) => TR[c] ?? c).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "product";

const chunks = <T,>(a: T[], n: number) => { const o: T[][] = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; };
const uniq = <T,>(a: T[]) => [...new Set(a)];

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
 * Applies ONE page of Trendyol products to the local catalog. Idempotent: ids of created rows are derived from Trendyol ids, so a
 * re-run (retry, overlapping schedules) updates instead of duplicating.
 *  - match order: existing trendyol mapping (barcode) -> local variant barcode -> local sku == stockCode/barcode
 *  - matched: mapping + listing are linked; with sourceOfTruth "trendyol" stock, prices, content and active flag are overwritten
 *  - unmatched: created as DRAFT products when createMissing, otherwise skipped
 */
export async function applyTrendyolProducts(
  db: any, remote: MarketplaceProduct[],
  opts: { sourceOfTruth: "local" | "trendyol"; createMissing: boolean; dryRun: boolean; now?: Date },
): Promise<Omit<ImportTotals, "pages">> {
  const t: Omit<ImportTotals, "pages"> = { contents: remote.length, variants: 0, linked: 0, created: 0, updated: 0, skipped: 0, stockChanged: 0 };
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
  const existingCats: any[] = opts.createMissing ? await db.select().from(categories) : [];
  const catBy = new Map<string, string>(existingCats.map((c) => [String(c.nameTr).toLowerCase(), c.id as string]));

  const stmts: unknown[] = [];
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
    stmts.push(db.update(products).set({ nameTr: p.title || "Untitled", descriptionTr: p.description ?? null, brand: p.brand ?? null, updatedAt: now }).where(eq(products.id, productId)));
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
      let categoryId: string | null = null;
      if (p.category) {
        const key = p.category.toLowerCase();
        categoryId = catBy.get(key) ?? null;
        if (!categoryId) {
          categoryId = `ty-cat-${slugify(p.category)}`; catBy.set(key, categoryId);
          stmts.push(db.insert(categories).values({ id: categoryId, slug: `${slugify(p.category)}-ty`, nameTr: p.category }).onConflictDoNothing());
        }
      }
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
  const sourceOfTruth = provider.sourceOfTruth ?? "local";
  const runId: string = job.payload?.runId ?? job.id;
  const dryRun = !!job.payload?.dryRun;
  const createMissing = job.payload?.createMissing ?? sourceOfTruth === "trendyol";
  const totals: ImportTotals = { ...emptyTotals(), ...(job.payload?.totals ?? {}) };
  const prev = await loadImportStatus(ctx.db);
  const base: ImportStatus = {
    runId, state: "running", dryRun, createMissing, sourceOfTruth,
    startedAt: prev?.runId === runId ? prev.startedAt : new Date().toISOString(), totals,
  };
  try {
    const page = await provider.fetchProducts(job.payload?.cursor);
    const r = await applyTrendyolProducts(ctx.db, page.products, { sourceOfTruth, createMissing, dryRun });
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

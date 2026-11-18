import { Hono } from "hono";
import { and, eq, inArray, sql } from "drizzle-orm";
import { channelListings, channelProductSettings, productMappings, productVariants, products, syncCursors } from "@openshelf/db";
import { enqueueJob } from "@openshelf/core";
import { z } from "zod";
import type { AppEnv } from "../env";
import { ApiError, body, likeEscape, notFound, paged, paging } from "../lib/http";
import { audit } from "../lib/audit";
import { requireRole } from "../middleware/auth";
import type { MarketplaceProvider } from "@openshelf/integration-sdk";
import { NOT_LISTED, PENDING_APPROVAL, verifyListings } from "@openshelf/integration-trendyol";
import { getAdapter, isIntegrationEnabled, logIntegrationEvent } from "../lib/integrations";

/**
 * Trendyol sync control: which products are kept in sync with Trendyol and which stay website-only, plus where each
 * product's content and price come from.
 *  - "synced" = the product has ENABLED channel_listings (stock is one shared pool, pushed to Trendyol after every change)
 *  - "website only" = no enabled listing: nothing is pushed and Trendyol sales do not take its stock
 *  - content/price source "remote" = the scheduled pull overwrites the local copy from Trendyol
 */
export const adminTrendyolSync = new Hono<AppEnv>();
adminTrendyolSync.use("/trendyol/sync", requireRole("admin"));
adminTrendyolSync.use("/trendyol/sync/*", requireRole("admin"));

const CH = "trendyol";
const CHUNK = 90; // D1: 100 bound parameters per statement
const chunks = <T,>(a: T[], n: number) => { const o: T[][] = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; };
const MODES = ["synced", "website_only", "errors", "not_listed"] as const;

const linkedSql = sql`(SELECT COUNT(*) FROM product_variants v JOIN product_mappings m ON m.variant_id = v.id AND m.provider = 'trendyol' WHERE v.product_id = p.id)`;
const enabledSql = sql`(SELECT COUNT(*) FROM product_variants v JOIN channel_listings l ON l.variant_id = v.id AND l.channel = 'trendyol' AND l.enabled = 1 WHERE v.product_id = p.id)`;
const errorsSql = sql`(SELECT COUNT(*) FROM product_variants v JOIN channel_listings l ON l.variant_id = v.id AND l.channel = 'trendyol' AND l.enabled = 1 AND l.last_error IS NOT NULL AND l.last_error NOT IN ('not_on_trendyol', 'pending_approval') WHERE v.product_id = p.id)`;
/** enabled listings whose product was never created on Trendyol / waits for Trendyol's approval */
const notListedSql = sql`(SELECT COUNT(*) FROM product_variants v JOIN channel_listings l ON l.variant_id = v.id AND l.channel = 'trendyol' AND l.enabled = 1 AND l.last_error = 'not_on_trendyol' WHERE v.product_id = p.id)`;
const pendingSql = sql`(SELECT COUNT(*) FROM product_variants v JOIN channel_listings l ON l.variant_id = v.id AND l.channel = 'trendyol' AND l.enabled = 1 AND l.last_error = 'pending_approval' WHERE v.product_id = p.id)`;

interface Row {
  id: string; name: string; status: string; variants: number; withBarcode: number; linked: number; enabled: number; errors: number; notListed: number; pending: number;
  available: number; lastSyncedAt: number | null; contentSource: string | null; priceSource: string | null; lastPulledAt: number | null; imageUrl: string | null;
}
const iso = (sec: number | null | undefined) => (sec ? new Date(sec * 1000).toISOString() : null);
const view = (r: Row) => ({
  productId: r.id, name: r.name, status: r.status, imageUrl: r.imageUrl,
  mode: r.enabled > 0 ? "synced" as const : "website_only" as const,
  variants: r.variants, withBarcode: r.withBarcode, linked: r.linked, enabled: r.enabled, errors: r.errors, notListed: r.notListed, pending: r.pending, available: r.available,
  contentSource: r.contentSource === "remote" ? "remote" as const : "local" as const, priceSource: r.priceSource === "remote" ? "remote" as const : "local" as const,
  lastSyncedAt: iso(r.lastSyncedAt), lastPulledAt: iso(r.lastPulledAt),
});
const select = sql`
  SELECT p.id, p.name_tr AS name, p.status,
    (SELECT COUNT(*) FROM product_variants v WHERE v.product_id = p.id) AS variants,
    (SELECT COUNT(*) FROM product_variants v WHERE v.product_id = p.id AND v.barcode IS NOT NULL AND v.barcode != '') AS withBarcode,
    ${linkedSql} AS linked, ${enabledSql} AS enabled, ${errorsSql} AS errors, ${notListedSql} AS notListed, ${pendingSql} AS pending,
    (SELECT COALESCE(SUM(MAX(0, i.total - i.reserved - i.safety_stock)), 0) FROM inventory i JOIN product_variants v ON v.id = i.variant_id WHERE v.product_id = p.id) AS available,
    (SELECT MAX(l.last_synced_at) FROM product_variants v JOIN channel_listings l ON l.variant_id = v.id AND l.channel = 'trendyol' WHERE v.product_id = p.id) AS lastSyncedAt,
    (SELECT COALESCE(im.url, '/media/' || im.media_id) FROM product_images im WHERE im.product_id = p.id ORDER BY im.position LIMIT 1) AS imageUrl,
    s.content_source AS contentSource, s.price_source AS priceSource, s.last_pulled_at AS lastPulledAt
  FROM products p LEFT JOIN channel_product_settings s ON s.product_id = p.id AND s.channel = 'trendyol'`;

adminTrendyolSync.get("/trendyol/sync", async (c) => {
  const db = c.get("db"); const p = paging(c, 25, 100);
  const search = (c.req.query("search") ?? "").trim().slice(0, 80); const mode = c.req.query("mode");
  if (mode && !(MODES as readonly string[]).includes(mode)) throw new ApiError(400, "validation_error", "Unknown mode filter");
  const conds = [sql`p.status != 'archived'`];
  if (search) {
    const like = `%${likeEscape(search)}%`;
    conds.push(sql`(p.name_tr LIKE ${like} ESCAPE '\\' OR EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id AND (v.sku LIKE ${like} ESCAPE '\\' OR v.barcode LIKE ${like} ESCAPE '\\')))`);
  }
  if (mode === "synced") conds.push(sql`${enabledSql} > 0`);
  if (mode === "website_only") conds.push(sql`${enabledSql} = 0`);
  if (mode === "errors") conds.push(sql`${errorsSql} > 0`);
  if (mode === "not_listed") conds.push(sql`${notListedSql} + ${pendingSql} > 0`);
  const where = sql.join(conds, sql` AND `);
  const rows = (await db.all(sql`${select} WHERE ${where} ORDER BY p.name_tr COLLATE NOCASE, p.id LIMIT ${p.pageSize} OFFSET ${p.offset}`)) as Row[];
  const [t] = (await db.all(sql`SELECT COUNT(*) AS n FROM products p WHERE ${where}`)) as { n: number }[];
  const [sum] = (await db.all(sql`
    SELECT COUNT(*) AS total, SUM(CASE WHEN ${enabledSql} > 0 THEN 1 ELSE 0 END) AS synced, SUM(CASE WHEN ${errorsSql} > 0 THEN 1 ELSE 0 END) AS errors, SUM(CASE WHEN ${notListedSql} + ${pendingSql} > 0 THEN 1 ELSE 0 END) AS notListed,
      SUM(CASE WHEN s.content_source = 'remote' OR s.price_source = 'remote' THEN 1 ELSE 0 END) AS following
    FROM products p LEFT JOIN channel_product_settings s ON s.product_id = p.id AND s.channel = 'trendyol' WHERE p.status != 'archived'`)) as { total: number; synced: number | null; errors: number | null; notListed: number | null; following: number | null }[];
  const total = sum?.total ?? 0; const synced = sum?.synced ?? 0;
  return c.json({
    ...paged(rows.map(view), t?.n ?? 0, p),
    summary: { total, synced, websiteOnly: total - synced, errors: sum?.errors ?? 0, notListed: sum?.notListed ?? 0, following: sum?.following ?? 0 },
    available: await isIntegrationEnabled(c.env, db, "trendyol"),
  });
});

adminTrendyolSync.get("/trendyol/sync/:productId", async (c) => {
  const db = c.get("db"); const id = c.req.param("productId");
  const [row] = (await db.all(sql`${select} WHERE p.id = ${id}`)) as Row[];
  if (!row) throw notFound("Product");
  const variants = (await db.all(sql`
    SELECT v.id AS variantId, v.sku, v.title, v.barcode, m.external_barcode AS mappedBarcode, l.enabled, l.last_synced_stock AS lastSyncedStock,
      l.last_synced_at AS lastSyncedAt, l.last_error AS lastError, COALESCE(MAX(0, i.total - i.reserved - i.safety_stock), 0) AS available
    FROM product_variants v
    LEFT JOIN product_mappings m ON m.variant_id = v.id AND m.provider = 'trendyol'
    LEFT JOIN channel_listings l ON l.variant_id = v.id AND l.channel = 'trendyol'
    LEFT JOIN inventory i ON i.variant_id = v.id
    WHERE v.product_id = ${id} ORDER BY v.position, v.sku`)) as { variantId: string; sku: string; title: string | null; barcode: string | null; mappedBarcode: string | null; enabled: number | null; lastSyncedStock: number | null; lastSyncedAt: number | null; lastError: string | null; available: number }[];
  return c.json({
    ...view(row), available: await isIntegrationEnabled(c.env, db, "trendyol"), stock: row.available,
    variantRows: variants.map((v) => ({
      variantId: v.variantId, sku: v.sku, title: v.title, barcode: v.mappedBarcode ?? v.barcode, linked: !!v.mappedBarcode, enabled: !!v.enabled,
      available: v.available, lastSyncedStock: v.lastSyncedStock, lastSyncedAt: iso(v.lastSyncedAt),
      // "listed" = on sale on Trendyol; the two other states are not errors, the product simply is not (yet) there
      state: !v.enabled ? "off" as const : v.lastError === NOT_LISTED ? "not_listed" as const : v.lastError === PENDING_APPROVAL ? "pending" as const : "listed" as const,
      lastError: v.lastError === NOT_LISTED || v.lastError === PENDING_APPROVAL ? null : v.lastError,
    })),
  });
});

/**
 * Checks on Trendyol whether the variants' barcodes exist there (sync only updates products that already exist on Trendyol).
 * Few variants: checked right away so the admin sees the result; many: queued. Never throws: a lookup problem is logged and
 * the periodic re-check picks the listings up later.
 */
async function checkListed(c: { env: AppEnv["Bindings"]; get: (k: "db") => AppEnv["Variables"]["db"] }, variantIds: string[]) {
  const db = c.get("db");
  if (!variantIds.length) return null;
  if (variantIds.length > 12) {
    await enqueueJob(db, { kind: "trendyol.verify_listings", payload: { variantIds: variantIds.slice(0, 90) }, dedupeKey: `trendyol.verify_listings:${crypto.randomUUID()}` }).catch(() => {});
    return null;
  }
  try {
    const a = await getAdapter<MarketplaceProvider>(c.env, db, "trendyol");
    if (!a) return null;
    return await verifyListings(db, a.adapter, variantIds);
  } catch (e) {
    await logIntegrationEvent(db, "trendyol", "warn", `Could not check products on Trendyol: ${e instanceof Error ? e.message : String(e)}`.slice(0, 500)).catch(() => {});
    return null;
  }
}

const Source = z.enum(["local", "remote"]);
const SyncBody = z.object({
  productIds: z.array(z.string().min(1).max(64)).min(1).max(100),
  /** true = keep in sync with Trendyol (links variants by their barcode when not linked yet); false = website only */
  enabled: z.boolean().optional(),
  contentSource: Source.optional(), priceSource: Source.optional(),
}).refine((b) => b.enabled !== undefined || b.contentSource !== undefined || b.priceSource !== undefined, { message: "Nothing to change" });

adminTrendyolSync.put("/trendyol/sync", async (c) => {
  const b = await body(c, SyncBody); const db = c.get("db");
  const ids = [...new Set(b.productIds)];
  const found = (await Promise.all(chunks(ids, CHUNK).map((ch) => db.select({ id: products.id }).from(products).where(inArray(products.id, ch))))).flat().map((r) => r.id);
  if (!found.length) throw notFound("Product");
  const out = { updated: found.length, linked: 0, skippedNoBarcode: 0, barcodeTaken: 0, notOnTrendyol: 0, pendingApproval: 0 };
  const stmts: unknown[] = []; const now = new Date();

  if (b.contentSource !== undefined || b.priceSource !== undefined) {
    const set = { ...(b.contentSource ? { contentSource: b.contentSource } : {}), ...(b.priceSource ? { priceSource: b.priceSource } : {}), updatedAt: now };
    for (const productId of found) {
      stmts.push(db.insert(channelProductSettings).values({ productId, channel: CH, ...set })
        .onConflictDoUpdate({ target: [channelProductSettings.productId, channelProductSettings.channel], set }));
    }
  }

  let pushIds: string[] = [];
  if (b.enabled !== undefined) {
    const variants = (await Promise.all(chunks(found, CHUNK).map((ch) => db.select({ id: productVariants.id, sku: productVariants.sku, barcode: productVariants.barcode }).from(productVariants).where(inArray(productVariants.productId, ch))))).flat();
    const vids = variants.map((v) => v.id);
    if (!b.enabled) {
      for (const ch of chunks(vids, CHUNK)) stmts.push(db.update(channelListings).set({ enabled: false }).where(and(eq(channelListings.channel, CH), inArray(channelListings.variantId, ch))));
    } else {
      const maps = (await Promise.all(chunks(vids, CHUNK).map((ch) => db.select().from(productMappings).where(and(eq(productMappings.provider, CH), inArray(productMappings.variantId, ch)))))).flat();
      const mapped = new Set(maps.map((m) => m.variantId));
      // not linked yet: the variant's own barcode is the Trendyol key (unless another variant already holds it)
      const fresh = variants.filter((v) => !mapped.has(v.id));
      const wanted = [...new Set(fresh.map((v) => v.barcode?.trim()).filter((x): x is string => !!x))];
      const taken = new Set((await Promise.all(chunks(wanted, CHUNK).map((ch) => db.select({ bc: productMappings.externalBarcode }).from(productMappings).where(and(eq(productMappings.provider, CH), inArray(productMappings.externalBarcode, ch)))))).flat().map((r) => r.bc));
      for (const v of variants) {
        if (!mapped.has(v.id)) {
          const bc = v.barcode?.trim();
          if (!bc) { out.skippedNoBarcode++; continue; }
          if (taken.has(bc)) { out.barcodeTaken++; continue; }
          taken.add(bc); out.linked++;
          stmts.push(db.insert(productMappings).values({ id: crypto.randomUUID(), variantId: v.id, provider: CH, externalSku: v.sku, externalBarcode: bc }).onConflictDoNothing());
        }
        pushIds.push(v.id);
        stmts.push(db.insert(channelListings).values({ variantId: v.id, channel: CH, enabled: true })
          .onConflictDoUpdate({ target: [channelListings.variantId, channelListings.channel], set: { enabled: true, lastError: null } }));
      }
    }
  }
  for (const ch of chunks(stmts, 50)) await db.batch(ch as [any, ...any[]]);

  // sync only works for products that exist on Trendyol: find out now, so the admin is told instead of seeing a false "in sync"
  const v = await checkListed(c, pushIds);
  if (v) { out.notOnTrendyol = v.notListed; out.pendingApproval = v.pending; }
  const stamp = crypto.randomUUID();
  if (pushIds.length) await enqueueJob(db, { kind: "trendyol.stock_push", payload: { variantIds: pushIds }, dedupeKey: `trendyol.stock_push:sync:${stamp}` }, now).catch(() => {});
  if (b.contentSource === "remote" || b.priceSource === "remote") {
    await enqueueJob(db, { kind: "trendyol.pull_products", payload: { productIds: found }, dedupeKey: `trendyol.pull_products:${stamp}:first` }, now).catch(() => {});
  }
  await audit(c, "trendyol.sync.update", "product", found.length === 1 ? found[0] : "bulk", { count: found.length, enabled: b.enabled, contentSource: b.contentSource, priceSource: b.priceSource, ...out });
  return c.json(out);
});

// ---------- remembered Trendyol choices per local category ----------
// The create-product wizard remembers, per LOCAL category, what was chosen last time (Trendyol category, brand, shared attributes,
// cargo...), so the next product of that category is filled without matching anything by hand. Stored in sync_cursors under
// `trendyol:defaults:<local category id>` (small JSON, wiped by the factory reset like the other sync state).
const DEFAULTS_PREFIX = "trendyol:defaults:"; // same prefix as lib/trendyolDraft
const AttrChoice = z.object({ ids: z.array(z.number().int()).max(50), custom: z.string().max(300) });
const RememberedBody = z.object({
  localCategoryId: z.string().min(1).max(64),
  trendyolCategoryId: z.number().int().positive(), categoryPath: z.string().max(400),
  brandId: z.number().int().positive().nullable(), brandName: z.string().max(200),
  attrs: z.record(z.string().regex(/^\d{1,10}$/), AttrChoice).refine((a) => Object.keys(a).length <= 60, "too many attributes"),
  cargo: z.string().max(60), vatRate: z.string().max(4), dimensionalWeight: z.string().max(10), deliveryDuration: z.string().max(4), origin: z.string().max(3),
});

adminTrendyolSync.get("/trendyol/defaults", async (c) => {
  const cat = (c.req.query("category") ?? "").slice(0, 64);
  if (!cat) throw new ApiError(400, "validation_error", "category is required");
  const [row] = await c.get("db").select().from(syncCursors).where(eq(syncCursors.key, `${DEFAULTS_PREFIX}${cat}`)).limit(1);
  let defaults: unknown = null;
  try { defaults = row ? JSON.parse(row.value) : null; } catch { defaults = null; }
  return c.json({ defaults });
});

adminTrendyolSync.put("/trendyol/defaults", async (c) => {
  const b = await body(c, RememberedBody); const db = c.get("db");
  const { localCategoryId, ...rest } = b;
  const value = JSON.stringify(rest);
  await db.insert(syncCursors).values({ key: `${DEFAULTS_PREFIX}${localCategoryId}`, value })
    .onConflictDoUpdate({ target: syncCursors.key, set: { value, updatedAt: new Date() } });
  return c.body(null, 204);
});

const IdsBody = z.object({ productIds: z.array(z.string().min(1).max(64)).min(1).max(100) });
async function requireTrendyol(c: { env: AppEnv["Bindings"]; get: (k: "db") => AppEnv["Variables"]["db"] }) {
  if (!(await isIntegrationEnabled(c.env, c.get("db"), "trendyol"))) throw new ApiError(409, "integration_unavailable", "Trendyol integration is not enabled");
}

/** Push stock (and locally managed prices) of the picked products to Trendyol now. Only enabled listings are sent. */
adminTrendyolSync.post("/trendyol/sync/push", async (c) => {
  const b = await body(c, IdsBody); const db = c.get("db");
  await requireTrendyol(c);
  const vids = (await Promise.all(chunks([...new Set(b.productIds)], CHUNK).map((ch) => db.select({ id: productVariants.id }).from(productVariants).where(inArray(productVariants.productId, ch))))).flat().map((v) => v.id);
  if (vids.length) await enqueueJob(db, { kind: "trendyol.stock_push", payload: { variantIds: vids }, dedupeKey: `trendyol.stock_push:manual:${crypto.randomUUID()}` });
  await audit(c, "trendyol.sync.push", "product", b.productIds.length === 1 ? b.productIds[0] : "bulk", { count: b.productIds.length });
  return c.json({ queued: true, variants: vids.length }, 202);
});

/** Pull from Trendyol now: content/price for products that follow Trendyol; with `stock: true` ALSO overwrites local stock (one-off). */
adminTrendyolSync.post("/trendyol/sync/pull", async (c) => {
  const b = await body(c, IdsBody.extend({ stock: z.boolean().optional() })); const db = c.get("db");
  await requireTrendyol(c);
  const productIds = [...new Set(b.productIds)];
  await enqueueJob(db, { kind: "trendyol.pull_products", payload: { productIds, stock: !!b.stock }, dedupeKey: `trendyol.pull_products:${crypto.randomUUID()}:first` });
  await audit(c, "trendyol.sync.pull", "product", productIds.length === 1 ? productIds[0] : "bulk", { count: productIds.length, stock: !!b.stock });
  return c.json({ queued: true }, 202);
});

/** Re-check on Trendyol whether these products exist there (after creating them, or to refresh "not on Trendyol"). */
adminTrendyolSync.post("/trendyol/sync/verify", async (c) => {
  const b = await body(c, IdsBody); const db = c.get("db");
  await requireTrendyol(c);
  const vids = (await Promise.all(chunks([...new Set(b.productIds)], CHUNK).map((ch) => db.select({ id: productVariants.id }).from(productVariants)
    .innerJoin(channelListings, and(eq(channelListings.variantId, productVariants.id), eq(channelListings.channel, CH))).where(inArray(productVariants.productId, ch))))).flat().map((v) => v.id);
  const r = await checkListed(c, vids);
  if (r?.approved) await enqueueJob(db, { kind: "trendyol.stock_push", payload: { variantIds: vids }, dedupeKey: `trendyol.stock_push:verified:${crypto.randomUUID()}` }).catch(() => {});
  return c.json({ queued: !r, ...(r ?? {}) }, r ? 200 : 202);
});

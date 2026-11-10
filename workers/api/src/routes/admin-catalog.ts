import { Hono } from "hono";
import { and, desc, eq, inArray, like, notInArray, or, sql } from "drizzle-orm";
import { categories, channelPrices, slugRedirects, coupons, inventory, orderItems, productImages, productMappings, productVariants, products } from "@openshelf/db";
import { adjustInventory, enqueueJob, InsufficientStockError } from "@openshelf/core";
import { CategoryInput, CouponInput, InventoryAdjustBody, ProductBulkBody, ProductInput, VariantPriceBody } from "@openshelf/shared";
import type { AppEnv, Db } from "../env";
import { ApiError, body, likeEscape, notFound, paged, paging } from "../lib/http";
import { audit } from "../lib/audit";
import { requireRole } from "../middleware/auth";
import { hydrateProducts } from "../lib/catalog";
import { getSettings } from "../lib/settings";

export const adminCatalog = new Hono<AppEnv>();

// ---------- categories ----------
adminCatalog.get("/categories", requireRole("staff"), async (c) => c.json({ items: await c.get("db").select().from(categories).orderBy(categories.position, categories.nameTr) }));
adminCatalog.post("/categories", requireRole("admin"), async (c) => {
  const b = await body(c, CategoryInput);
  const id = crypto.randomUUID();
  try { await c.get("db").insert(categories).values({ id, ...b, parentId: b.parentId ?? null }); } catch (e) { throw dupOr(e, "slug"); }
  await audit(c, "category.create", "category", id, { slug: b.slug });
  return c.json({ id, ...b }, 201);
});
adminCatalog.put("/categories/:id", requireRole("admin"), async (c) => {
  const id = c.req.param("id"); const b = await body(c, CategoryInput); const db = c.get("db");
  const [old] = await db.select({ slug: categories.slug }).from(categories).where(eq(categories.id, id)).limit(1);
  if (!old) throw notFound("Category");
  const upd = db.update(categories).set({ ...b, parentId: b.parentId ?? null }).where(eq(categories.id, id)).returning();
  let r;
  try {
    if (old.slug !== b.slug) r = (await db.batch([upd, ...slugRedirectStatements(db, `/category/${old.slug}`, `/category/${b.slug}`)]))[0];
    else r = await upd;
  } catch (e) { throw dupOr(e, "slug"); }
  if (!r.length) throw notFound("Category");
  await audit(c, "category.update", "category", id);
  return c.json(r[0]);
});
adminCatalog.delete("/categories/:id", requireRole("admin"), async (c) => {
  const id = c.req.param("id"); const db = c.get("db");
  await db.update(products).set({ categoryId: null }).where(eq(products.categoryId, id));
  await db.update(categories).set({ parentId: null }).where(eq(categories.parentId, id));
  const r = await db.delete(categories).where(eq(categories.id, id)).returning({ id: categories.id });
  if (!r.length) throw notFound("Category");
  await audit(c, "category.delete", "category", id);
  return c.body(null, 204);
});

// ---------- per-entity SEO (partial update of the search/social fields only) ----------
const ProductSeoPatch = ProductInput.pick({ seoTitle: true, seoDescription: true, seoOgMediaId: true, seoOgImageUrl: true, seoNoindex: true, seoCanonical: true }).partial();
const CategorySeoPatch = CategoryInput.pick({ seoTitle: true, seoDescription: true, seoOgImageUrl: true, seoNoindex: true }).partial();
const definedOnly = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

adminCatalog.patch("/products/:id/seo", requireRole("admin"), async (c) => {
  const id = c.req.param("id"); const b = definedOnly(await body(c, ProductSeoPatch));
  if (Object.keys(b).length === 0) throw new ApiError(400, "validation_error", "Send at least one SEO field");
  const r = await c.get("db").update(products).set({ ...b, updatedAt: new Date() }).where(eq(products.id, id)).returning({ id: products.id, slug: products.slug, seoTitle: products.seoTitle, seoDescription: products.seoDescription, seoOgMediaId: products.seoOgMediaId, seoOgImageUrl: products.seoOgImageUrl, seoNoindex: products.seoNoindex, seoCanonical: products.seoCanonical });
  if (!r.length) throw notFound("Product");
  await audit(c, "product.seo", "product", id, { keys: Object.keys(b) });
  return c.json(r[0]);
});
adminCatalog.patch("/categories/:id/seo", requireRole("admin"), async (c) => {
  const id = c.req.param("id"); const b = definedOnly(await body(c, CategorySeoPatch));
  if (Object.keys(b).length === 0) throw new ApiError(400, "validation_error", "Send at least one SEO field");
  const r = await c.get("db").update(categories).set(b).where(eq(categories.id, id)).returning({ id: categories.id, slug: categories.slug, seoTitle: categories.seoTitle, seoDescription: categories.seoDescription, seoOgImageUrl: categories.seoOgImageUrl, seoNoindex: categories.seoNoindex });
  if (!r.length) throw notFound("Category");
  await audit(c, "category.seo", "category", id, { keys: Object.keys(b) });
  return c.json(r[0]);
});

// ---------- products ----------
const LOW_STOCK = 5;
// SQL fragments over products (correlated sub-selects keep list filters/sorts in one query)
const MIN_PRICE = sql`(SELECT MIN(cp.price) FROM channel_prices cp JOIN product_variants v ON v.id = cp.variant_id WHERE v.product_id = ${products.id} AND v.active = 1 AND cp.channel = 'website')`;
const AVAILABLE = sql`COALESCE((SELECT SUM(i.total - i.reserved) FROM inventory i JOIN product_variants v ON v.id = i.variant_id WHERE v.product_id = ${products.id} AND v.active = 1), 0)`;
const SORTS = {
  newest: desc(products.createdAt), oldest: sql`${products.createdAt} ASC`, updated: desc(products.updatedAt),
  name: sql`${products.nameTr} COLLATE NOCASE ASC`, "name-desc": sql`${products.nameTr} COLLATE NOCASE DESC`,
  price: sql`${MIN_PRICE} ASC`, "price-desc": sql`${MIN_PRICE} DESC`, stock: sql`${AVAILABLE} ASC`, "stock-desc": sql`${AVAILABLE} DESC`,
} as const;

adminCatalog.get("/products", requireRole("staff"), async (c) => {
  const p = paging(c); const db = c.get("db");
  const q = c.req.query("q"); const status = c.req.query("status"); const category = c.req.query("category");
  const stock = c.req.query("stock"); const image = c.req.query("image"); const channel = c.req.query("channel"); const sort = c.req.query("sort") ?? "newest";
  if (stock && !["out", "low", "in"].includes(stock)) throw new ApiError(400, "validation_error", "Unknown stock filter");
  if (image && image !== "none") throw new ApiError(400, "validation_error", "Unknown image filter");
  if (channel && !["trendyol", "website_only"].includes(channel)) throw new ApiError(400, "validation_error", "Unknown channel filter");
  if (!(sort in SORTS)) throw new ApiError(400, "validation_error", "Unknown sort");
  const conds = [];
  const idList = c.req.query("ids")?.split(",").map((x) => x.trim()).filter(Boolean).slice(0, 100);
  if (idList?.length) conds.push(inArray(products.id, idList));
  if (q) { const l = `%${likeEscape(q)}%`; conds.push(or(sql`${products.nameTr} LIKE ${l} ESCAPE '\\'`, sql`${products.slug} LIKE ${l} ESCAPE '\\'`, sql`${products.brand} LIKE ${l} ESCAPE '\\'`, sql`${products.id} IN (SELECT product_id FROM product_variants WHERE sku LIKE ${l} ESCAPE '\\' OR barcode LIKE ${l} ESCAPE '\\')`)); }
  if (status) conds.push(eq(products.status, status));
  if (category === "none") conds.push(sql`${products.categoryId} IS NULL`); else if (category) conds.push(eq(products.categoryId, category));
  if (stock === "out") conds.push(sql`${AVAILABLE} <= 0`);
  if (stock === "low") conds.push(sql`${AVAILABLE} > 0 AND ${AVAILABLE} <= ${LOW_STOCK}`);
  if (stock === "in") conds.push(sql`${AVAILABLE} > ${LOW_STOCK}`);
  if (image === "none") conds.push(sql`NOT EXISTS (SELECT 1 FROM product_images im WHERE im.product_id = ${products.id})`);
  const onTy = sql`EXISTS (SELECT 1 FROM product_mappings m JOIN product_variants v ON v.id = m.variant_id WHERE v.product_id = ${products.id} AND m.provider = 'trendyol')`;
  if (channel === "trendyol") conds.push(onTy);
  if (channel === "website_only") conds.push(sql`NOT ${onTy}`);
  const where = conds.length ? and(...conds) : undefined;
  const rows = await db.select().from(products).where(where).orderBy(SORTS[sort as keyof typeof SORTS], desc(products.createdAt)).limit(p.pageSize).offset(p.offset);
  const [t] = await db.select({ n: sql<number>`count(*)` }).from(products).where(where);
  const ids = rows.map((r) => r.id);
  const hydrated = await hydrateProducts(db, rows);
  const catIds = [...new Set(rows.map((r) => r.categoryId).filter((x): x is string => !!x))];
  const cats = catIds.length ? await db.select({ id: categories.id, name: categories.nameTr }).from(categories).where(inArray(categories.id, catIds)) : [];
  const catName = new Map(cats.map((x) => [x.id, x.name]));
  const mapped = ids.length ? await db.select({ productId: productVariants.productId }).from(productMappings).innerJoin(productVariants, eq(productVariants.id, productMappings.variantId)).where(and(eq(productMappings.provider, "trendyol"), inArray(productVariants.productId, ids))) : [];
  const onTrendyol = new Set(mapped.map((m) => m.productId));
  return c.json(paged(hydrated.map((h) => ({ ...h, categoryName: h.categoryId ? catName.get(h.categoryId) ?? null : null, onTrendyol: onTrendyol.has(h.id) })), t?.n ?? 0, p));
});
adminCatalog.get("/products/:id", requireRole("staff"), async (c) => {
  const db = c.get("db");
  const rows = await db.select().from(products).where(eq(products.id, c.req.param("id"))).limit(1);
  if (!rows.length) throw notFound("Product");
  return c.json((await hydrateProducts(db, rows))[0]);
});
adminCatalog.post("/products", requireRole("admin"), async (c) => {
  const b = await body(c, ProductInput);
  const id = await writeProduct(c.get("db"), c.env.DB, null, b, (await getSettings(c.get("db"), "checkout")).safetyStock);
  await audit(c, "product.create", "product", id, { slug: b.slug });
  const rows = await c.get("db").select().from(products).where(eq(products.id, id));
  return c.json((await hydrateProducts(c.get("db"), rows))[0], 201);
});
adminCatalog.put("/products/:id", requireRole("admin"), async (c) => {
  const id = c.req.param("id"); const b = await body(c, ProductInput);
  const db = c.get("db");
  const [ex] = await db.select({ id: products.id }).from(products).where(eq(products.id, id)).limit(1);
  if (!ex) throw notFound("Product");
  await writeProduct(db, c.env.DB, id, b, (await getSettings(db, "checkout")).safetyStock);
  await audit(c, "product.update", "product", id, { slug: b.slug });
  const rows = await db.select().from(products).where(eq(products.id, id));
  return c.json((await hydrateProducts(db, rows))[0]);
});
adminCatalog.delete("/products/:id", requireRole("admin"), async (c) => {
  const id = c.req.param("id"); const db = c.get("db");
  const [ex] = await db.select({ id: products.id }).from(products).where(eq(products.id, id)).limit(1);
  if (!ex) throw notFound("Product");
  const vids = (await db.select({ id: productVariants.id }).from(productVariants).where(eq(productVariants.productId, id))).map((v) => v.id);
  const sold = vids.length ? await db.select({ id: orderItems.id }).from(orderItems).where(inArray(orderItems.variantId, vids)).limit(1) : [];
  if (sold.length) { // keep order history intact: archive instead of delete
    await db.update(products).set({ status: "archived", updatedAt: new Date() }).where(eq(products.id, id));
    await audit(c, "product.archive", "product", id);
    return c.json({ archived: true });
  }
  await db.delete(products).where(eq(products.id, id));
  await audit(c, "product.delete", "product", id);
  return c.body(null, 204);
});

/**
 * Statements (run in the same db.batch as the slug update) that record old -> new and keep the table loop/chain free:
 * a redirect whose source is the new path is dropped, existing redirects pointing at the old path are re-pointed at the new one.
 */
export function slugRedirectStatements(db: Db, oldPath: string, newPath: string) {
  return [
    db.delete(slugRedirects).where(eq(slugRedirects.oldPath, newPath)),
    db.update(slugRedirects).set({ newPath }).where(eq(slugRedirects.newPath, oldPath)),
    db.insert(slugRedirects).values({ oldPath, newPath }).onConflictDoUpdate({ target: slugRedirects.oldPath, set: { newPath } }),
  ] as const;
}

function dupOr(e: unknown, field: string) {
  if (e instanceof Error && /UNIQUE/i.test(e.message + String((e as { cause?: unknown }).cause ?? ""))) return new ApiError(409, "conflict", `${field} already exists`);
  return e;
}

/** Upsert product + variants + prices + images. Stock changes go through the ledger. */
export async function writeProduct(db: Db, d1: D1Database, id: string | null, b: ProductInput, defaultSafety: number): Promise<string> {
  const now = new Date();
  const pid = id ?? crypto.randomUUID();
  const fields = {
    slug: b.slug, categoryId: b.categoryId ?? null, nameTr: b.nameTr, nameEn: b.nameEn ?? null, descriptionTr: b.descriptionTr ?? null, descriptionEn: b.descriptionEn ?? null,
    brand: b.brand ?? null, status: b.status, seoTitle: b.seoTitle ?? null, seoDescription: b.seoDescription ?? null,
    seoOgMediaId: b.seoOgMediaId ?? null, seoOgImageUrl: b.seoOgImageUrl ?? null, seoNoindex: b.seoNoindex, seoCanonical: b.seoCanonical ?? null, taxRate: b.taxRate ?? null, updatedAt: now,
  };
  try {
    if (id) {
      const [old] = await db.select({ slug: products.slug }).from(products).where(eq(products.id, id)).limit(1);
      const upd = db.update(products).set(fields).where(eq(products.id, id));
      if (old && old.slug !== b.slug) await db.batch([upd, ...slugRedirectStatements(db, `/product/${old.slug}`, `/product/${b.slug}`)]);
      else await upd;
    } else await db.insert(products).values({ id: pid, ...fields });
  } catch (e) { throw dupOr(e, "slug"); }

  const existing = id ? await db.select().from(productVariants).where(eq(productVariants.productId, pid)) : [];
  const existingIds = new Set(existing.map((v) => v.id));
  const keep: string[] = [];
  for (const v of b.variants) {
    const vid = v.id && existingIds.has(v.id) ? v.id : crypto.randomUUID();
    if (v.id && !existingIds.has(v.id) && v.id.length > 0) { /* unknown id => treated as new variant with fresh id */ }
    const vf = { productId: pid, sku: v.sku, barcode: v.barcode ?? null, title: v.title ?? null, options: v.options ?? null, weightGrams: v.weightGrams ?? null, position: v.position, active: v.active };
    try {
      if (existingIds.has(vid)) await db.update(productVariants).set(vf).where(eq(productVariants.id, vid));
      else await db.insert(productVariants).values({ id: vid, ...vf });
    } catch (e) { throw dupOr(e, `sku ${v.sku}`); }
    keep.push(vid);
    // prices
    const up = async (channel: string, price: number | null | undefined, compare: number | null = null) => {
      if (price == null) { if (price === null) await db.delete(channelPrices).where(and(eq(channelPrices.variantId, vid), eq(channelPrices.channel, channel))); return; }
      await db.insert(channelPrices).values({ variantId: vid, channel, price, compareAtPrice: compare, currency: "TRY" })
        .onConflictDoUpdate({ target: [channelPrices.variantId, channelPrices.channel], set: { price, compareAtPrice: compare } });
    };
    await up("website", v.prices.website, v.compareAtPrice ?? null);
    await up("trendyol", v.prices.trendyol);
    // inventory row + ledgered stock set
    await db.insert(inventory).values({ variantId: vid, total: 0, reserved: 0, safetyStock: v.stock?.safetyStock ?? defaultSafety }).onConflictDoNothing();
    if (v.stock?.safetyStock !== undefined) await db.update(inventory).set({ safetyStock: v.stock.safetyStock }).where(eq(inventory.variantId, vid));
    if (v.stock) {
      const [cur] = await db.select({ total: inventory.total }).from(inventory).where(eq(inventory.variantId, vid));
      const delta = v.stock.total - (cur?.total ?? 0);
      if (delta !== 0) await adjustInventory(db, vid, delta, "product editor", now).catch((e) => { if (e instanceof InsufficientStockError) throw new ApiError(409, "stock_below_reserved", `Stock for ${v.sku} cannot go below reserved quantity`); throw e; });
    }
  }
  // variants removed from the payload are deactivated (never hard-deleted: order history references them)
  const removed = existing.filter((v) => !keep.includes(v.id)).map((v) => v.id);
  if (removed.length) await db.update(productVariants).set({ active: false }).where(inArray(productVariants.id, removed));
  // images replaced wholesale
  await db.delete(productImages).where(eq(productImages.productId, pid));
  if (b.images.length) await db.insert(productImages).values(b.images.map((im, i) => ({ id: crypto.randomUUID(), productId: pid, mediaId: im.mediaId ?? null, url: im.mediaId ? null : im.url ?? null, alt: im.alt ?? null, position: im.position ?? i })));
  // marketplace stock/price push (coalesced per minute)
  await enqueueJob(db, { kind: "trendyol.stock_push", payload: { variantIds: keep }, dedupeKey: `trendyol.stock_push:${pid}:${Math.floor(now.getTime() / 60000)}` }, now).catch(() => {});
  void d1; void notInArray; void like;
  return pid;
}

/** Inline price edit: website channel price (+ optional compare-at) of one variant. */
adminCatalog.patch("/variants/:variantId/price", requireRole("admin"), async (c) => {
  const variantId = c.req.param("variantId"); const b = await body(c, VariantPriceBody); const db = c.get("db");
  const [v] = await db.select({ id: productVariants.id, productId: productVariants.productId }).from(productVariants).where(eq(productVariants.id, variantId)).limit(1);
  if (!v) throw notFound("Variant");
  // compareAtPrice omitted = keep the existing strike-through price, unless the new price is no longer below it
  const [cur] = await db.select({ compare: channelPrices.compareAtPrice }).from(channelPrices).where(and(eq(channelPrices.variantId, variantId), eq(channelPrices.channel, "website"))).limit(1);
  const compare = b.compareAtPrice !== undefined ? b.compareAtPrice : cur?.compare != null && cur.compare > b.price ? cur.compare : null;
  await db.insert(channelPrices).values({ variantId, channel: "website", price: b.price, compareAtPrice: compare, currency: "TRY" })
    .onConflictDoUpdate({ target: [channelPrices.variantId, channelPrices.channel], set: { price: b.price, compareAtPrice: compare } });
  await db.update(products).set({ updatedAt: new Date() }).where(eq(products.id, v.productId));
  await audit(c, "variant.price", "variant", variantId, b);
  await enqueueJob(db, { kind: "trendyol.stock_push", payload: { variantIds: [variantId] }, dedupeKey: `trendyol.stock_push:${variantId}:${Math.floor(Date.now() / 60000)}` }).catch(() => {});
  return c.json({ variantId, price: b.price, compareAtPrice: compare });
});

/** Bulk change from the list page. Returns per-product counts; unknown ids are reported, not fatal. */
adminCatalog.post("/products/bulk", requireRole("admin"), async (c) => {
  const b = await body(c, ProductBulkBody); const db = c.get("db");
  const ids = [...new Set(b.ids)];
  const found = await db.select({ id: products.id }).from(products).where(inArray(products.id, ids));
  const okIds = found.map((r) => r.id); const missing = ids.filter((i) => !okIds.includes(i));
  const now = new Date();
  if (b.action === "category" && b.categoryId) {
    const [cat] = await db.select({ id: categories.id }).from(categories).where(eq(categories.id, b.categoryId)).limit(1);
    if (!cat) throw new ApiError(400, "validation_error", "Unknown category");
  }
  let variantIds: string[] = []; let priceChanged = 0;
  if (okIds.length) {
    if (b.action === "status") await db.update(products).set({ status: b.status, updatedAt: now }).where(inArray(products.id, okIds));
    else if (b.action === "category") await db.update(products).set({ categoryId: b.categoryId, updatedAt: now }).where(inArray(products.id, okIds));
    else {
      variantIds = (await db.select({ id: productVariants.id }).from(productVariants).where(and(inArray(productVariants.productId, okIds), eq(productVariants.active, true)))).map((v) => v.id);
      const factor = 1 + b.percent / 100;
      for (let i = 0; i < variantIds.length; i += 50) {
        const chunk = variantIds.slice(i, i + 50);
        const res = await db.update(channelPrices).set({
          price: sql`MAX(1, CAST(ROUND(${channelPrices.price} * ${factor}) AS INTEGER))`,
          compareAtPrice: sql`CASE WHEN ${channelPrices.compareAtPrice} IS NULL THEN NULL WHEN CAST(ROUND(${channelPrices.compareAtPrice} * ${factor}) AS INTEGER) > MAX(1, CAST(ROUND(${channelPrices.price} * ${factor}) AS INTEGER)) THEN CAST(ROUND(${channelPrices.compareAtPrice} * ${factor}) AS INTEGER) ELSE NULL END`,
        }).where(and(inArray(channelPrices.variantId, chunk), eq(channelPrices.channel, "website"))).returning({ v: channelPrices.variantId });
        priceChanged += res.length;
      }
      await db.update(products).set({ updatedAt: now }).where(inArray(products.id, okIds));
      if (variantIds.length) await enqueueJob(db, { kind: "trendyol.stock_push", payload: { variantIds }, dedupeKey: `trendyol.stock_push:bulk:${Math.floor(now.getTime() / 60000)}:${okIds.length}` }, now).catch(() => {});
    }
    await audit(c, `product.bulk_${b.action}`, "product", okIds[0]!, { ...b, ids: okIds });
  }
  return c.json({ updated: okIds.length, missing, ...(b.action === "price" ? { pricesChanged: priceChanged } : {}) });
});

// ---------- inventory ----------
adminCatalog.post("/inventory/:variantId/adjust", requireRole("staff"), async (c) => {
  const variantId = c.req.param("variantId"); const b = await body(c, InventoryAdjustBody);
  const db = c.get("db");
  const [v] = await db.select({ id: productVariants.id }).from(productVariants).where(eq(productVariants.id, variantId)).limit(1);
  if (!v) throw notFound("Variant");
  try {
    const r = await adjustInventory(db, variantId, b.delta, b.reason);
    await audit(c, "inventory.adjust", "variant", variantId, b);
    await enqueueJob(db, { kind: "trendyol.stock_push", payload: { variantIds: [variantId] }, dedupeKey: `trendyol.stock_push:${variantId}:${Math.floor(Date.now() / 60000)}` }).catch(() => {});
    return c.json({ variantId, total: r.total, reserved: r.reserved });
  } catch (e) {
    if (e instanceof InsufficientStockError) throw new ApiError(409, "stock_below_reserved", "Adjustment would take stock below reserved quantity");
    throw e;
  }
});

// ---------- coupons ----------
adminCatalog.get("/coupons", requireRole("staff"), async (c) => c.json({ items: await c.get("db").select().from(coupons).orderBy(coupons.code) }));
adminCatalog.post("/coupons", requireRole("admin"), async (c) => {
  const b = await body(c, CouponInput);
  const code = b.code.toUpperCase();
  try { await c.get("db").insert(coupons).values({ code, type: b.type, value: b.value, minSubtotal: b.minSubtotal, maxUses: b.maxUses ?? null, maxUsesPerCustomer: b.maxUsesPerCustomer ?? null, expiresAt: b.expiresAt ? new Date(b.expiresAt) : null, active: b.active }); }
  catch (e) { throw dupOr(e, "code"); }
  await audit(c, "coupon.create", "coupon", code);
  return c.json({ ...b, code, used: 0 }, 201);
});
adminCatalog.put("/coupons/:code", requireRole("admin"), async (c) => {
  const code = c.req.param("code").toUpperCase(); const b = await body(c, CouponInput);
  const r = await c.get("db").update(coupons).set({ type: b.type, value: b.value, minSubtotal: b.minSubtotal, maxUses: b.maxUses ?? null, maxUsesPerCustomer: b.maxUsesPerCustomer ?? null, expiresAt: b.expiresAt ? new Date(b.expiresAt) : null, active: b.active }).where(eq(coupons.code, code)).returning();
  if (!r.length) throw notFound("Coupon");
  await audit(c, "coupon.update", "coupon", code);
  return c.json(r[0]);
});
adminCatalog.delete("/coupons/:code", requireRole("admin"), async (c) => {
  const code = c.req.param("code").toUpperCase();
  const r = await c.get("db").delete(coupons).where(eq(coupons.code, code)).returning({ code: coupons.code });
  if (!r.length) throw notFound("Coupon");
  await audit(c, "coupon.delete", "coupon", code);
  return c.body(null, 204);
});

import { Hono } from "hono";
import { and, desc, eq, inArray, like, notInArray, or, sql } from "drizzle-orm";
import { categories, channelPrices, slugRedirects, coupons, inventory, orderItems, productImages, productVariants, products } from "@openshelf/db";
import { adjustInventory, enqueueJob, InsufficientStockError } from "@openshelf/core";
import { CategoryInput, CouponInput, InventoryAdjustBody, ProductInput } from "@openshelf/shared";
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

// ---------- products ----------
adminCatalog.get("/products", requireRole("staff"), async (c) => {
  const p = paging(c); const db = c.get("db");
  const q = c.req.query("q"); const status = c.req.query("status"); const category = c.req.query("category");
  const conds = [];
  if (q) { const l = `%${likeEscape(q)}%`; conds.push(or(sql`${products.nameTr} LIKE ${l} ESCAPE '\\'`, sql`${products.slug} LIKE ${l} ESCAPE '\\'`, sql`${products.id} IN (SELECT product_id FROM product_variants WHERE sku LIKE ${l} ESCAPE '\\')`)); }
  if (status) conds.push(eq(products.status, status));
  if (category) conds.push(eq(products.categoryId, category));
  const where = conds.length ? and(...conds) : undefined;
  const rows = await db.select().from(products).where(where).orderBy(desc(products.createdAt)).limit(p.pageSize).offset(p.offset);
  const [t] = await db.select({ n: sql<number>`count(*)` }).from(products).where(where);
  return c.json(paged(await hydrateProducts(db, rows), t?.n ?? 0, p));
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

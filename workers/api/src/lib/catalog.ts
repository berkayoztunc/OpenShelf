import { asc, eq, inArray } from "drizzle-orm";
import { channelPrices, inventory, productImages, productVariants, products } from "@openshelf/db";
import type { Db } from "../env";

export interface VariantView {
  id: string; sku: string; barcode: string | null; title: string | null; options: Record<string, string> | null; weightGrams: number | null; position: number; active: boolean;
  prices: { website: number | null; trendyol: number | null }; compareAtPrice: number | null;
  stock: { total: number; reserved: number; safetyStock: number };
}
export interface ImageView { id: string; mediaId: string | null; url: string; alt: string | null; position: number }

/** Batched hydration of variants/prices/stock/images for a set of product rows. */
export async function hydrateProducts(db: Db, rows: (typeof products.$inferSelect)[]) {
  const ids = rows.map((r) => r.id);
  if (!ids.length) return [];
  const vs = await db.select().from(productVariants).where(inArray(productVariants.productId, ids)).orderBy(asc(productVariants.position));
  const vids = vs.map((v) => v.id);
  const [prices, inv, imgs] = await Promise.all([
    vids.length ? db.select().from(channelPrices).where(inArray(channelPrices.variantId, vids)) : [],
    vids.length ? db.select().from(inventory).where(inArray(inventory.variantId, vids)) : [],
    db.select().from(productImages).where(inArray(productImages.productId, ids)).orderBy(asc(productImages.position)),
  ]);
  const priceBy = new Map<string, { website: number | null; trendyol: number | null; compare: number | null }>();
  for (const p of prices) {
    const e = priceBy.get(p.variantId) ?? { website: null, trendyol: null, compare: null };
    if (p.channel === "website") { e.website = p.price; e.compare = p.compareAtPrice ?? null; }
    if (p.channel === "trendyol") e.trendyol = p.price;
    priceBy.set(p.variantId, e);
  }
  const invBy = new Map(inv.map((i) => [i.variantId, i]));
  return rows.map((p) => ({
    ...p,
    variants: vs.filter((v) => v.productId === p.id).map((v): VariantView => ({
      id: v.id, sku: v.sku, barcode: v.barcode, title: v.title, options: (v.options as Record<string, string> | null) ?? null, weightGrams: v.weightGrams,
      position: v.position, active: v.active,
      prices: { website: priceBy.get(v.id)?.website ?? null, trendyol: priceBy.get(v.id)?.trendyol ?? null }, compareAtPrice: priceBy.get(v.id)?.compare ?? null,
      stock: { total: invBy.get(v.id)?.total ?? 0, reserved: invBy.get(v.id)?.reserved ?? 0, safetyStock: invBy.get(v.id)?.safetyStock ?? 0 },
    })),
    images: imgs.filter((i) => i.productId === p.id).map((i): ImageView => ({ id: i.id, mediaId: i.mediaId, url: i.mediaId ? `/media/${i.mediaId}` : i.url ?? "", alt: i.alt, position: i.position })),
  }));
}
export type ProductView = Awaited<ReturnType<typeof hydrateProducts>>[number];
export const availableOf = (s: { total: number; reserved: number; safetyStock: number }) => Math.max(0, s.total - s.reserved - s.safetyStock);
void eq;

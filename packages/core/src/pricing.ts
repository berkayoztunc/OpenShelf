import { and, eq, inArray, asc } from "drizzle-orm";
import { products, productVariants, channelPrices, inventory, coupons, productImages } from "@openshelf/db";
import type { CheckoutSettings_ } from "./settings-types";
import type { Db } from "./types";

export class CouponError extends Error { constructor(public code: string, message: string) { super(message); } }

export interface PricedLine {
  variantId: string; productId: string; slug: string; sku: string; name: string; variantTitle: string | null;
  quantity: number; unitPrice: number; compareAtPrice: number | null; lineTotal: number; taxRate: number; available: number; imageUrl: string | null;
}
export interface PricedCart {
  currency: string; lines: PricedLine[]; invalid: string[]; subtotal: number; discount: number; shipping: number; tax: number; total: number;
  couponCode: string | null; couponError: string | null;
}

export async function evaluateCoupon(db: Db, code: string, subtotal: number, now = new Date()): Promise<{ code: string; discount: number }> {
  const [c] = await db.select().from(coupons).where(eq(coupons.code, code.toUpperCase())).limit(1)
    .then(async (r) => (r.length ? r : await db.select().from(coupons).where(eq(coupons.code, code)).limit(1)));
  if (!c || !c.active) throw new CouponError("coupon_invalid", "Coupon is not valid");
  if (c.expiresAt && c.expiresAt.getTime() <= now.getTime()) throw new CouponError("coupon_expired", "Coupon has expired");
  if (c.maxUses != null && c.used >= c.maxUses) throw new CouponError("coupon_exhausted", "Coupon usage limit reached");
  if (subtotal < c.minSubtotal) throw new CouponError("coupon_min_subtotal", "Minimum cart total not reached");
  const raw = c.type === "percent" ? Math.floor((subtotal * c.value) / 100) : c.value;
  return { code: c.code, discount: Math.max(0, Math.min(raw, subtotal)) };
}

/** Server-authoritative pricing: reads prices/stock/tax from DB only. */
export async function priceItems(db: Db, items: { variantId: string; quantity: number }[], opts: {
  settings: CheckoutSettings_; currency: string; defaultTaxRate: number; pricesIncludeTax: boolean; couponCode?: string | null; locale?: "tr" | "en"; now?: Date;
}): Promise<PricedCart> {
  const ids = [...new Set(items.map((i) => i.variantId))];
  const empty: PricedCart = { currency: opts.currency, lines: [], invalid: [], subtotal: 0, discount: 0, shipping: 0, tax: 0, total: 0, couponCode: null, couponError: null };
  if (!ids.length) return empty;
  const rows = await db.select({
    v: productVariants, p: products, price: channelPrices.price, compare: channelPrices.compareAtPrice,
    total: inventory.total, reserved: inventory.reserved, safety: inventory.safetyStock,
  }).from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .leftJoin(channelPrices, and(eq(channelPrices.variantId, productVariants.id), eq(channelPrices.channel, "website")))
    .leftJoin(inventory, eq(inventory.variantId, productVariants.id))
    .where(inArray(productVariants.id, ids));
  const byId = new Map(rows.map((r) => [r.v.id, r]));
  const imgs = await db.select().from(productImages).where(inArray(productImages.productId, [...new Set(rows.map((r) => r.p.id))])).orderBy(asc(productImages.position));
  const firstImg = new Map<string, string>();
  for (const im of imgs) if (!firstImg.has(im.productId)) firstImg.set(im.productId, im.mediaId ? `/media/${im.mediaId}` : im.url ?? "");

  const merged = new Map<string, number>();
  for (const i of items) merged.set(i.variantId, (merged.get(i.variantId) ?? 0) + i.quantity);
  const lines: PricedLine[] = [];
  const invalid: string[] = [];
  let rawTax = 0;
  for (const [variantId, quantity] of merged) {
    const r = byId.get(variantId);
    if (!r || !r.v.active || r.p.status !== "active" || r.price == null || quantity <= 0) { invalid.push(variantId); continue; }
    const taxRate = r.p.taxRate ?? opts.defaultTaxRate;
    const lineTotal = r.price * quantity;
    rawTax += opts.pricesIncludeTax ? Math.round((lineTotal * taxRate) / (100 + taxRate)) : Math.round((lineTotal * taxRate) / 100);
    const name = opts.locale === "en" && r.p.nameEn ? r.p.nameEn : r.p.nameTr;
    lines.push({
      variantId, productId: r.p.id, slug: r.p.slug, sku: r.v.sku, name, variantTitle: r.v.title ?? null, quantity, unitPrice: r.price,
      compareAtPrice: r.compare ?? null, lineTotal, taxRate, imageUrl: firstImg.get(r.p.id) ?? null,
      available: Math.max(0, (r.total ?? 0) - (r.reserved ?? 0) - (r.safety ?? 0)),
    });
  }
  const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);
  let discount = 0; let couponCode: string | null = null; let couponError: string | null = null;
  if (opts.couponCode && subtotal > 0) {
    try { const c = await evaluateCoupon(db, opts.couponCode, subtotal, opts.now); discount = c.discount; couponCode = c.code; }
    catch (e) { if (e instanceof CouponError) couponError = e.code; else throw e; }
  }
  const after = subtotal - discount;
  const tax = subtotal > 0 ? Math.round(rawTax * (after / subtotal)) : 0;
  const { freeShippingThreshold, flatShippingFee } = opts.settings;
  const shipping = subtotal === 0 ? 0 : freeShippingThreshold != null && after >= freeShippingThreshold ? 0 : flatShippingFee;
  const total = after + shipping + (opts.pricesIncludeTax ? 0 : tax);
  return { currency: opts.currency, lines, invalid, subtotal, discount, shipping, tax, total, couponCode, couponError };
}

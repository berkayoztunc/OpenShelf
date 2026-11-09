import { Hono } from "hono";
import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { admins, categories, customers, integrationConfigs, orders, products } from "@openshelf/db";
import type { ProductInput } from "@openshelf/shared";
import type { AppEnv } from "../env";
import { ApiError, body, notFound } from "../lib/http";
import { verifyPassword } from "../lib/crypto";
import { audit } from "../lib/audit";
import { requireRole } from "../middleware/auth";
import { hydrateProducts } from "../lib/catalog";
import { parseCsv, toCsv } from "../lib/csv";
import { clearSettingsCache, getAllSettings, getSettings } from "../lib/settings";
import { writeProduct } from "./admin-catalog";
import { ProductInput as ProductInputSchema } from "@openshelf/shared";

export const adminData = new Hono<AppEnv>();
const PRODUCT_HEADERS = ["slug", "name_tr", "name_en", "status", "category_slug", "brand", "tax_rate", "sku", "barcode", "variant_title", "price", "compare_at_price", "trendyol_price", "stock", "safety_stock", "weight_grams"];
const minorToMajor = (n: number | null | undefined) => (n == null ? "" : (n / 100).toFixed(2));
const majorToMinor = (s: string | undefined) => (s && s.trim() !== "" ? Math.round(Number(s.replace(",", ".")) * 100) : null);

adminData.get("/export/:file", requireRole("admin"), async (c) => {
  const m = /^(products|orders|customers|config)\.(csv|json)$/.exec(c.req.param("file"));
  if (!m) throw notFound("Export");
  const [, entity, fmt] = m as unknown as [string, "products" | "orders" | "customers" | "config", "csv" | "json"];
  const db = c.get("db");
  let data: unknown; let csv: string | null = null;
  if (entity === "products") {
    const rows = await hydrateProducts(db, await db.select().from(products).orderBy(products.slug));
    const cats = new Map((await db.select().from(categories)).map((x) => [x.id, x.slug]));
    data = rows;
    csv = toCsv(PRODUCT_HEADERS, rows.flatMap((p) => p.variants.map((v) => [p.slug, p.nameTr, p.nameEn, p.status, p.categoryId ? cats.get(p.categoryId) : "", p.brand, p.taxRate, v.sku, v.barcode, v.title, minorToMajor(v.prices.website), minorToMajor(v.compareAtPrice), minorToMajor(v.prices.trendyol), v.stock.total, v.stock.safetyStock, v.weightGrams])));
  } else if (entity === "orders") {
    const rows = (await db.select().from(orders).orderBy(desc(orders.createdAt)).limit(10000)).map(({ trackingToken: _t, ...o }) => o);
    data = rows;
    csv = toCsv(["number", "source", "status", "email", "currency", "subtotal", "discount", "shipping", "tax", "total", "coupon", "created_at"], rows.map((o) => [o.number, o.source, o.status, o.email, o.currency, minorToMajor(o.subtotal), minorToMajor(o.discountTotal), minorToMajor(o.shippingTotal), minorToMajor(o.taxTotal), minorToMajor(o.total), o.couponCode, o.createdAt]));
  } else if (entity === "customers") {
    const rows = await db.select().from(customers).orderBy(desc(customers.createdAt)).limit(10000);
    data = rows;
    csv = toCsv(["id", "email", "name", "surname", "phone", "created_at"], rows.map((r) => [r.id, r.email, r.name, r.surname, r.phone, r.createdAt]));
  } else {
    // configuration backup — NEVER includes secrets or ciphertext
    const cfgs = await db.select().from(integrationConfigs);
    data = { version: 1, exportedAt: new Date().toISOString(), settings: await getAllSettings(db), integrations: cfgs.map((r) => ({ provider: r.provider, enabled: r.enabled, config: r.configPublic })) };
  }
  await audit(c, "export", entity, undefined, { format: fmt });
  if (fmt === "csv") {
    if (csv === null) throw new ApiError(400, "unsupported_format", "config export is JSON only");
    return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${entity}.csv"` } });
  }
  return new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="${entity}.json"` } });
});

adminData.post("/import/products", requireRole("admin"), async (c) => {
  const form = await c.req.parseBody();
  const file = form["file"];
  if (!(file instanceof File)) throw new ApiError(400, "validation_error", "CSV file is required");
  if (file.size > 2 * 1024 * 1024) throw new ApiError(413, "payload_too_large", "CSV exceeds 2MB");
  const rows = parseCsv(await file.text());
  const head = rows.shift()?.map((h) => h.trim().toLowerCase());
  if (!head || !head.includes("slug") || !head.includes("sku")) throw new ApiError(400, "validation_error", "CSV must include slug and sku columns");
  const col = (r: string[], k: string) => { const i = head.indexOf(k); return i >= 0 ? (r[i] ?? "").trim() : ""; };
  const db = c.get("db");
  const catBySlug = new Map((await db.select().from(categories)).map((x) => [x.slug, x.id]));
  const groups = new Map<string, string[][]>();
  for (const r of rows) { const s = col(r, "slug"); if (!s) continue; groups.set(s, [...(groups.get(s) ?? []), r]); }
  const safety = (await getSettings(db, "checkout")).safetyStock;
  const result = { created: 0, updated: 0, errors: [] as { slug: string; message: string }[] };
  for (const [slug, rs] of groups) {
    try {
      const first = rs[0]!;
      const [ex] = await db.select({ id: products.id }).from(products).where(eq(products.slug, slug)).limit(1);
      const existingVariants = ex ? (await hydrateProducts(db, await db.select().from(products).where(eq(products.id, ex.id))))[0]!.variants : [];
      const input = ProductInputSchema.parse({
        slug, nameTr: col(first, "name_tr") || slug, nameEn: col(first, "name_en") || null, status: col(first, "status") || "draft",
        categoryId: catBySlug.get(col(first, "category_slug")) ?? null, brand: col(first, "brand") || null, taxRate: col(first, "tax_rate") ? Number(col(first, "tax_rate")) : null,
        variants: rs.map((r, i) => {
          const sku = col(r, "sku");
          const price = majorToMinor(col(r, "price"));
          if (price == null || !Number.isFinite(price) || price < 0) throw new Error(`Invalid price for sku ${sku}`);
          const stock = col(r, "stock");
          return {
            id: existingVariants.find((v) => v.sku === sku)?.id, sku, barcode: col(r, "barcode") || null, title: col(r, "variant_title") || null, position: i, active: true,
            weightGrams: col(r, "weight_grams") ? Number(col(r, "weight_grams")) : null, compareAtPrice: majorToMinor(col(r, "compare_at_price")),
            prices: { website: price, trendyol: majorToMinor(col(r, "trendyol_price")) },
            ...(stock !== "" ? { stock: { total: Number(stock), ...(col(r, "safety_stock") ? { safetyStock: Number(col(r, "safety_stock")) } : {}) } } : {}),
          };
        }),
      }) as ProductInput;
      if (ex) { const imgs = (await hydrateProducts(db, await db.select().from(products).where(eq(products.id, ex.id))))[0]!.images; input.images = imgs.map((i) => ({ id: i.id, mediaId: i.mediaId, url: i.mediaId ? null : i.url, alt: i.alt, position: i.position })); }
      await writeProduct(db, c.env.DB, ex?.id ?? null, input, safety);
      ex ? result.updated++ : result.created++;
    } catch (e) {
      result.errors.push({ slug, message: e instanceof Error ? e.message.slice(0, 300) : "error" });
    }
  }
  await audit(c, "import.products", "product", undefined, { created: result.created, updated: result.updated, errors: result.errors.length });
  return c.json(result);
});

/**
 * Tables wiped by the factory reset. NOT wiped: admins + sessions (so the owner stays in), login/rate-limit state, setup tokens,
 * audit log (the reset itself is recorded there) and the single `stores` row.
 */
export const RESET_TABLES = [
  "store_settings", "integration_configs", "media", "customers", "addresses", "customer_consents", "categories", "products", "product_variants", "product_images",
  "inventory", "inventory_movements", "inventory_reservations", "channel_prices", "channel_listings", "product_mappings", "carts", "cart_items", "coupons",
  "orders", "order_items", "payments", "payment_events", "refunds", "shipments", "shipment_events", "invoices", "invoice_events", "integration_events", "outbox_jobs",
  "sync_cursors", "webhook_receipts", "marketing_events", "utm_attributions", "mock_messages", "notification_log", "slug_redirects", "manual_invoices",
  "outbound_emails", "outbound_sms", "campaigns", "campaign_recipients", "trendyol_calls", "mock_state",
] as const;

const ResetBody = z.object({ confirm: z.literal("SIFIRLA"), password: z.string().min(1).max(200) });

/** Owner-only factory reset of commercial data and configuration. Irreversible: needs the typed word AND the owner's password. */
adminData.post("/system/reset", requireRole("owner"), async (c) => {
  const b = await body(c, ResetBody); const db = c.get("db"); const a = c.get("admin")!;
  const [row] = await db.select().from(admins).where(eq(admins.id, a.id)).limit(1);
  if (!row || !(await verifyPassword(b.password, row.passwordHash))) throw new ApiError(400, "invalid_password", "Password is incorrect");
  const counts: Record<string, number> = {};
  for (const t of RESET_TABLES) counts[t] = ((await db.all(sql.raw(`SELECT COUNT(*) AS n FROM ${t}`))) as { n: number }[])[0]?.n ?? 0;
  // FKs exist between these tables: defer the check to commit so delete order does not matter (everything referenced is wiped together)
  await db.batch([db.run(sql`PRAGMA defer_foreign_keys = ON`), ...RESET_TABLES.map((t) => db.run(sql.raw(`DELETE FROM ${t}`)))] as unknown as [any, ...any[]]);
  clearSettingsCache();
  await audit(c, "system.reset", "system", "factory", { deleted: Object.fromEntries(Object.entries(counts).filter(([, n]) => n > 0)) });
  return c.json({ ok: true, deleted: counts });
});

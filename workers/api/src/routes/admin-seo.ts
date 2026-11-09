import { Hono } from "hono";
import { sql } from "drizzle-orm";
import type { AppEnv } from "../env";
import { ApiError, notFound } from "../lib/http";
import { requireRole } from "../middleware/auth";
import { getAllSettings } from "../lib/settings";
import { makeCx, metaOf, resolveCategory, resolveHome, resolveProduct } from "../lib/seo";

export const adminSeo = new Hono<AppEnv>();

/** Resolved head for the admin SERP / social preview: GET /api/admin/seo/preview?type=product|category|home&id= */
adminSeo.get("/seo/preview", requireRole("staff"), async (c) => {
  const type = c.req.query("type"); const id = c.req.query("id");
  const db = c.get("db"); const cx = await makeCx(db, c.env.STOREFRONT_ORIGIN);
  let h;
  if (type === "home") h = await resolveHome(db, cx);
  else if (type === "product" || type === "category") {
    if (!id) throw new ApiError(400, "bad_request", "id is required");
    h = type === "product" ? await resolveProduct(db, cx, { id }, { path: "/product", activeOnly: false }) : await resolveCategory(db, cx, { id }, 1, { activeOnly: false });
    if (h.kind === "notfound") throw notFound(type === "product" ? "Product" : "Category");
  } else throw new ApiError(400, "bad_request", "type must be product, category or home");
  const m = metaOf(cx, h);
  return c.json({ type, title: h.title, description: h.description, canonical: h.canonical, noindex: h.noindex, robots: m.robots, og: m.og, twitter: m.twitter, jsonLd: h.jsonLd });
});

/**
 * SEO health check: site-wide switches plus per-product / per-category gaps (missing SEO title/description, thin content, noindex,
 * missing image alt text, duplicate titles). GET /api/admin/seo/audit. Active products/categories only.
 */
adminSeo.get("/seo/audit", requireRole("staff"), async (c) => {
  const db = c.get("db"); const s = await getAllSettings(db);
  const site: { code: string; severity: "high" | "medium" | "low"; message: string }[] = [];
  const add = (code: string, severity: "high" | "medium" | "low", message: string) => site.push({ code, severity, message });
  if (!s.seo.robotsIndex) add("robots_noindex", "high", "robotsIndex is OFF: the whole store is hidden from search engines.");
  if (!s.general.storeName.trim() || s.general.storeName === "My Store") add("default_store_name", "high", "Store name is still the default.");
  if (!s.seo.homeTitle.trim()) add("no_home_title", "medium", "No home page title (derived from store name + tagline).");
  if (!s.seo.homeDescription.trim() && !s.general.description.trim()) add("no_home_description", "medium", "No home page description.");
  if (!s.general.tagline.trim()) add("no_tagline", "low", "No tagline.");
  if (!s.seo.defaultOgMediaId) add("no_default_og_image", "medium", "No default social share image (1200×630).");
  if (!s.branding.faviconMediaId) add("no_favicon", "low", "No favicon.");
  if (!s.branding.logoMediaId) add("no_logo", "low", "No logo.");
  if (!s.seo.jsonLd) add("jsonld_off", "medium", "Structured data (JSON-LD) is off: no rich results for products.");
  if (!s.seo.googleSiteVerification.trim()) add("no_google_verification", "low", "Google Search Console verification code not set.");
  type Row = { id: string; slug: string; name: string; seoTitle: string | null; seoDescription: string | null; description?: string | null; noindex: number; images?: number; noAlt?: number };
  const products = (await db.all(sql`SELECT p.id AS id, p.slug AS slug, p.name_tr AS name, p.seo_title AS seoTitle, p.seo_description AS seoDescription, p.description_tr AS description, p.seo_noindex AS noindex,
      (SELECT COUNT(*) FROM product_images i WHERE i.product_id = p.id) AS images, (SELECT COUNT(*) FROM product_images i WHERE i.product_id = p.id AND (i.alt IS NULL OR trim(i.alt) = '')) AS noAlt
    FROM products p WHERE p.status = 'active' ORDER BY p.name_tr LIMIT 2000`)) as Row[];
  const cats = (await db.all(sql`SELECT id, slug, name_tr AS name, seo_title AS seoTitle, seo_description AS seoDescription, description_tr AS description, seo_noindex AS noindex FROM categories WHERE active = 1 ORDER BY name_tr LIMIT 500`)) as Row[];
  const titleCount = new Map<string, number>();
  for (const p of products) if (p.seoTitle?.trim()) titleCount.set(p.seoTitle.trim().toLowerCase(), (titleCount.get(p.seoTitle.trim().toLowerCase()) ?? 0) + 1);
  const issuesOf = (r: Row, product: boolean) => {
    const out: string[] = [];
    if (!r.seoTitle?.trim()) out.push("no_seo_title");
    if (!r.seoDescription?.trim()) out.push(r.description?.trim() ? "no_seo_description" : "no_description");
    else if (r.seoDescription.trim().length < 70) out.push("seo_description_short");
    if (r.noindex) out.push("noindex");
    if (product) {
      if (!r.images) out.push("no_images"); else if (r.noAlt) out.push("images_missing_alt");
      if (r.seoTitle?.trim() && (titleCount.get(r.seoTitle.trim().toLowerCase()) ?? 0) > 1) out.push("duplicate_seo_title");
    }
    return out;
  };
  const shape = (rows: Row[], product: boolean) => rows.map((r) => ({ id: r.id, slug: r.slug, name: r.name, issues: issuesOf(r, product), ...(product ? { images: r.images, imagesMissingAlt: r.noAlt } : {}) })).filter((r) => r.issues.length);
  const pIssues = shape(products, true); const cIssues = shape(cats, false);
  const count = (list: { issues: string[] }[]) => list.reduce<Record<string, number>>((m, r) => { for (const i of r.issues) m[i] = (m[i] ?? 0) + 1; return m; }, {});
  return c.json({
    site, summary: { products: products.length, productsWithIssues: pIssues.length, categories: cats.length, categoriesWithIssues: cIssues.length, productIssueCounts: count(pIssues), categoryIssueCounts: count(cIssues) },
    products: pIssues.slice(0, 100), categories: cIssues.slice(0, 100), truncated: pIssues.length > 100 || cIssues.length > 100,
    hint: "Fix with update_product_seo / update_category_seo (per item) and update_seo_settings / update_store_profile (site-wide). Preview with seo_preview.",
  });
});

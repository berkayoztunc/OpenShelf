import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { categories, productImages, products } from "@openshelf/db";
import type { AppEnv } from "../env";
import { getAllSettings } from "../lib/settings";
import { hydrateProducts, availableOf } from "../lib/catalog";
import { toCsv } from "../lib/csv";

export const publicRoutes = new Hono<AppEnv>();
const esc = (s: unknown) => String(s ?? "").replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!);
const abs = (env: { API_ORIGIN: string }, u: string) => (/^https?:\/\//i.test(u) ? u : `${env.API_ORIGIN}${u}`);

async function feedItems(c: import("hono").Context<AppEnv>) {
  const db = c.get("db"); const s = await getAllSettings(db);
  const rows = await hydrateProducts(db, await db.select().from(products).where(eq(products.status, "active")));
  const sf = c.env.STOREFRONT_ORIGIN;
  const items = rows.flatMap((p) => p.variants.filter((v) => v.active && v.prices.website != null).map((v) => ({
    id: v.id, // variant id == Pixel content_id == GA4 item_id
    item_group_id: p.id, title: [p.nameTr, v.title].filter(Boolean).join(" - "), description: (p.descriptionTr ?? p.nameTr).slice(0, 5000),
    availability: availableOf(v.stock) > 0 ? "in stock" : "out of stock", condition: "new",
    price: `${(v.prices.website! / 100).toFixed(2)} ${s.general.currency}`, link: `${sf}/product/${p.slug}?variant=${v.id}`,
    image_link: p.images[0] ? abs(c.env, p.images[0].url) : "", brand: p.brand ?? s.general.storeName, gtin: v.barcode ?? "", mpn: v.sku,
  })));
  return { items, s };
}
publicRoutes.get("/feeds/meta.xml", async (c) => {
  const { items, s } = await feedItems(c);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<rss xmlns:g="http://base.google.com/ns/1.0" version="2.0"><channel><title>${esc(s.general.storeName)}</title><link>${esc(c.env.STOREFRONT_ORIGIN)}</link><description>${esc(s.general.description || s.general.storeName)}</description>\n` +
    items.map((i) => `<item>${Object.entries(i).filter(([, v]) => v !== "").map(([k, v]) => k === "title" || k === "description" || k === "link" ? `<${k}>${esc(v)}</${k}>` : `<g:${k}>${esc(v)}</g:${k}>`).join("")}</item>`).join("\n") + `\n</channel></rss>\n`;
  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=300" } });
});
publicRoutes.get("/feeds/meta.csv", async (c) => {
  const { items } = await feedItems(c);
  const h = ["id", "item_group_id", "title", "description", "availability", "condition", "price", "link", "image_link", "brand", "gtin", "mpn"];
  return new Response(toCsv(h, items.map((i) => h.map((k) => (i as Record<string, unknown>)[k]))), { headers: { "Content-Type": "text/csv; charset=utf-8", "Cache-Control": "public, max-age=300" } });
});
const SITEMAP_MAX = 5000;
const XML_HEAD = `<?xml version="1.0" encoding="UTF-8"?>\n`;
const xmlRes = (xml: string) => new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=600" } });

/** All indexable URL entries (home, lists, categories, products with images), in stable order. */
async function sitemapEntries(c: import("hono").Context<AppEnv>) {
  const db = c.get("db"); const sf = c.env.STOREFRONT_ORIGIN;
  const s = await getAllSettings(db);
  if (!s.seo.robotsIndex) return [];
  const cats = await db.select({ slug: categories.slug }).from(categories).where(and(eq(categories.active, true), eq(categories.seoNoindex, false))).orderBy(categories.slug);
  const ps = await db.select({ id: products.id, slug: products.slug, at: products.updatedAt, canonical: products.seoCanonical, mediaId: products.seoOgMediaId })
    .from(products).where(and(eq(products.status, "active"), eq(products.seoNoindex, false))).orderBy(products.slug);
  const imgs = await db.select({ productId: productImages.productId, mediaId: productImages.mediaId, url: productImages.url }).from(productImages)
    .innerJoin(products, eq(products.id, productImages.productId)).where(and(eq(products.status, "active"), eq(products.seoNoindex, false))).orderBy(productImages.position);
  const imgBy = new Map<string, string[]>();
  for (const i of imgs) {
    const u = i.mediaId ? `${sf}/media/${i.mediaId}` : i.url; if (!u) continue;
    const l = imgBy.get(i.productId) ?? []; if (l.length < 5) { l.push(/^https?:\/\//i.test(u) ? u : `${sf}${u}`); imgBy.set(i.productId, l); }
  }
  const entry = (loc: string, lastmod?: string, images: string[] = []) =>
    `<url><loc>${esc(loc)}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ""}${images.map((u) => `<image:image><image:loc>${esc(u)}</image:loc></image:image>`).join("")}</url>`;
  return [
    entry(`${sf}/`), entry(`${sf}/products`),
    ...cats.map((x) => entry(`${sf}/category/${x.slug}`)),
    // a product with a custom canonical is listed under that canonical (sitemaps must contain canonical URLs only)
    ...ps.map((x) => entry(x.canonical?.trim() || `${sf}/product/${x.slug}`, x.at.toISOString(), imgBy.get(x.id) ?? [])),
  ];
}
const URLSET = (entries: string[]) => `${XML_HEAD}<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${entries.join("\n")}\n</urlset>\n`;

publicRoutes.get("/sitemap.xml", async (c) => {
  const sf = c.env.STOREFRONT_ORIGIN; const entries = await sitemapEntries(c);
  if (entries.length <= SITEMAP_MAX) return xmlRes(URLSET(entries));
  const n = Math.ceil(entries.length / SITEMAP_MAX);
  const items = Array.from({ length: n }, (_, i) => `<sitemap><loc>${esc(sf)}/sitemap-${i + 1}.xml</loc></sitemap>`);
  return xmlRes(`${XML_HEAD}<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${items.join("\n")}\n</sitemapindex>\n`);
});
publicRoutes.get("/sitemap-:n{[0-9]+}.xml", async (c) => {
  const i = parseInt(c.req.param("n") ?? "0", 10); const entries = await sitemapEntries(c);
  const slice = entries.slice((i - 1) * SITEMAP_MAX, i * SITEMAP_MAX);
  if (i < 1 || !slice.length) return new Response("Not found", { status: 404 });
  return xmlRes(URLSET(slice));
});
publicRoutes.get("/robots.txt", async (c) => {
  const s = await getAllSettings(c.get("db"));
  const txt = s.seo.robotsIndex
    ? ["User-agent: *", "Allow: /", ...["/api/", "/admin/", "/mock/", "/cart", "/checkout", "/order/", ...s.seo.robotsDisallow].map((p) => `Disallow: ${p.replace(/[\r\n]/g, "")}`), "", `Sitemap: ${c.env.STOREFRONT_ORIGIN}/sitemap.xml`, ""].join("\n")
    : "User-agent: *\nDisallow: /\n";
  return new Response(txt, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=600" } });
});

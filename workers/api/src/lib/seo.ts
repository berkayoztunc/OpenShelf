import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { categories, products, slugRedirects } from "@openshelf/db";
import type { Db } from "../env";
import { getAllSettings, LEGAL_TITLES } from "./settings";
import { availableOf, hydrateProducts, type ProductView } from "./catalog";

export type AllSettings = Awaited<ReturnType<typeof getAllSettings>>;
export type Locale = "tr" | "en";
export interface SeoCx { origin: string; s: AllSettings; locale: Locale }
type CategoryRow = typeof categories.$inferSelect;

export const PAGE_SIZE = 24;

// ---------- small helpers ----------
export const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
/** JSON for a <script type="application/ld+json"> block: `<` etc. escaped so it can never close the tag. */
export const safeJson = (o: unknown) => JSON.stringify(o).replace(/[<>&\u2028\u2029]/g, (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"));
export function stripHtml(h?: string | null) {
  return (h ?? "").replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}
export function clip(t: string, n = 155) {
  if (t.length <= n) return t;
  const cut = t.slice(0, n - 1);
  return (/\s/.test(cut) ? cut.replace(/\s+\S*$/, "") : cut) + "…";
}
const abs = (cx: SeoCx, u?: string | null) => (!u ? null : /^https?:\/\//i.test(u) ? u : cx.origin + (u.startsWith("/") ? u : `/${u}`));
const money = (minor: number) => (minor / 100).toFixed(2);
const pick = (cx: SeoCx, tr: string | null | undefined, en: string | null | undefined) => (cx.locale === "en" && en ? en : tr ?? "");

export function applyTemplate(s: AllSettings, base: string) {
  const t = s.seo.titleTemplate;
  if (!t || !t.includes("%s")) return base;
  return t.replace(/%s/g, () => base).replace(/\{storeName\}/g, () => s.general.storeName);
}
const storeDescription = (s: AllSettings) => s.general.description || s.general.tagline || s.general.storeName;
export function defaultImage(cx: SeoCx) {
  const id = cx.s.seo.defaultOgMediaId ?? cx.s.branding.logoMediaId;
  return id ? `${cx.origin}/media/${id}` : null;
}
export async function makeCx(db: Db, origin: string, locale?: Locale): Promise<SeoCx> {
  const s = await getAllSettings(db);
  return { origin, s, locale: locale ?? s.general.defaultLocale };
}

// ---------- head model ----------
export interface HeadData {
  kind: "home" | "product" | "category" | "list" | "legal" | "private" | "notfound";
  status: number;
  title: string;
  description: string;
  canonical: string;
  noindex: boolean;
  ogType: "website" | "product";
  image: string | null;
  jsonLd: object[];
  body: string;
  redirect?: string;
}
const globalNoindex = (cx: SeoCx) => !cx.s.seo.robotsIndex;

// ---------- products ----------
export function productSeo(cx: SeoCx, p: ProductView) {
  const name = pick(cx, p.nameTr, p.nameEn);
  const description = p.seoDescription?.trim() || clip(stripHtml(pick(cx, p.descriptionTr, p.descriptionEn))) || clip(storeDescription(cx.s));
  const ogMedia = p.seoOgMediaId ? `/media/${p.seoOgMediaId}` : null;
  return {
    title: applyTemplate(cx.s, p.seoTitle?.trim() || name),
    description,
    image: abs(cx, p.seoOgImageUrl?.trim() || ogMedia || p.images[0]?.url) ?? defaultImage(cx),
    canonical: p.seoCanonical?.trim() || `${cx.origin}/product/${p.slug}`,
    noindex: p.seoNoindex || globalNoindex(cx),
  };
}
export function categorySeo(cx: SeoCx, cat: CategoryRow, firstProductImage?: string | null) {
  const name = pick(cx, cat.nameTr, cat.nameEn);
  const description = cat.seoDescription?.trim() || clip(stripHtml(pick(cx, cat.descriptionTr, cat.descriptionEn))) || clip(`${name} – ${storeDescription(cx.s)}`);
  return {
    title: applyTemplate(cx.s, cat.seoTitle?.trim() || name),
    description,
    image: abs(cx, cat.seoOgImageUrl?.trim() || firstProductImage) ?? defaultImage(cx),
    canonical: `${cx.origin}/category/${cat.slug}`,
    noindex: cat.seoNoindex || globalNoindex(cx),
  };
}
export const homeSeo = (cx: SeoCx) => {
  const g = cx.s.general; const se = cx.s.seo;
  return {
    title: se.homeTitle.trim() || (g.tagline ? `${g.storeName} – ${g.tagline}` : g.storeName),
    description: se.homeDescription.trim() || clip(storeDescription(cx.s)),
    image: defaultImage(cx),
    canonical: `${cx.origin}/`,
    noindex: globalNoindex(cx),
  };
};

const sellable = (p: ProductView) => p.variants.filter((v) => v.active && v.prices.website != null);
const inStock = (p: ProductView) => sellable(p).some((v) => availableOf(v.stock) > 0);
const GTIN = /^(\d{8}|\d{12,14})$/;

function productJsonLd(cx: SeoCx, p: ProductView, seo: ReturnType<typeof productSeo>) {
  const vs = sellable(p);
  const prices = vs.map((v) => v.prices.website!);
  const first = vs[0];
  const images = [...new Set(p.images.map((i) => abs(cx, i.url)).filter((x): x is string => !!x))];
  const availability = `https://schema.org/${inStock(p) ? "InStock" : "OutOfStock"}`;
  const cur = cx.s.general.currency;
  const lo = prices.length ? Math.min(...prices) : null; const hi = prices.length ? Math.max(...prices) : null;
  const offers = lo == null ? undefined : lo === hi || vs.length === 1
    ? { "@type": "Offer", price: money(lo), priceCurrency: cur, availability, url: seo.canonical, itemCondition: "https://schema.org/NewCondition" }
    : { "@type": "AggregateOffer", lowPrice: money(lo), highPrice: money(hi!), priceCurrency: cur, offerCount: vs.length, availability, url: seo.canonical, itemCondition: "https://schema.org/NewCondition" };
  const gtin = vs.map((v) => v.barcode?.trim() ?? "").find((b) => GTIN.test(b));
  return {
    "@context": "https://schema.org", "@type": "Product", name: pick(cx, p.nameTr, p.nameEn), description: seo.description,
    ...(images.length ? { image: images } : {}), ...(first ? { sku: first.sku, mpn: first.sku } : {}), ...(gtin ? { gtin } : {}),
    ...(p.brand ? { brand: { "@type": "Brand", name: p.brand } } : {}), ...(offers ? { offers } : {}), url: seo.canonical,
  };
}
const breadcrumb = (items: { name: string; url: string }[]) => ({
  "@context": "https://schema.org", "@type": "BreadcrumbList",
  itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: it.url })),
});

async function categoryChain(db: Db, cx: SeoCx, categoryId: string | null) {
  const chain: CategoryRow[] = [];
  let id = categoryId;
  for (let i = 0; id && i < 4; i++) {
    const [row] = await db.select().from(categories).where(eq(categories.id, id)).limit(1);
    if (!row) break;
    chain.unshift(row); id = row.parentId;
  }
  return chain.map((c) => ({ name: pick(cx, c.nameTr, c.nameEn), url: `${cx.origin}/category/${c.slug}`, row: c }));
}

function formatPrice(cx: SeoCx, minor: number) {
  try { return new Intl.NumberFormat(cx.locale === "tr" ? "tr-TR" : "en-US", { style: "currency", currency: cx.s.general.currency }).format(minor / 100); }
  catch { return `${money(minor)} ${cx.s.general.currency}`; }
}
const link = (href: string, text: string) => `<a href="${esc(href)}">${esc(text)}</a>`;

const redirectFor = async (db: Db, path: string) => (await db.select({ n: slugRedirects.newPath }).from(slugRedirects).where(eq(slugRedirects.oldPath, path)).limit(1))[0]?.n;

export const notFoundHead = (cx: SeoCx, path: string): HeadData => ({
  kind: "notfound", status: 404, title: applyTemplate(cx.s, cx.locale === "en" ? "Page not found" : "Sayfa bulunamadı"), description: "", canonical: cx.origin + path, noindex: true, ogType: "website", image: null, jsonLd: [],
  body: `<main data-ssr="notfound"><h1>${esc(cx.locale === "en" ? "Page not found" : "Sayfa bulunamadı")}</h1>${link("/", cx.s.general.storeName)}</main>`,
});

export interface ProductKey { slug?: string; id?: string }
/** Loads one product. `activeOnly` = public rendering; admin preview passes false so drafts can be previewed. */
export async function loadProduct(db: Db, key: ProductKey, activeOnly: boolean) {
  const conds = [key.id ? eq(products.id, key.id) : eq(products.slug, key.slug ?? "")];
  if (activeOnly) conds.push(eq(products.status, "active"));
  const rows = await db.select().from(products).where(and(...conds)).limit(1);
  return rows.length ? (await hydrateProducts(db, rows))[0]! : null;
}

export async function resolveProduct(db: Db, cx: SeoCx, key: ProductKey, opts: { path?: string; activeOnly?: boolean } = {}): Promise<HeadData> {
  const p = await loadProduct(db, key, opts.activeOnly ?? true);
  const path = opts.path ?? `/product/${key.slug}`;
  if (!p) {
    const to = key.slug ? await redirectFor(db, `/product/${key.slug}`) : undefined;
    if (to) return { ...notFoundHead(cx, path), status: 301, redirect: to };
    return notFoundHead(cx, path);
  }
  const seo = productSeo(cx, p);
  const name = pick(cx, p.nameTr, p.nameEn);
  const crumbs = await categoryChain(db, cx, p.categoryId);
  const trail = [{ name: cx.s.general.storeName, url: `${cx.origin}/` }, ...crumbs.map((c) => ({ name: c.name, url: c.url })), { name, url: seo.canonical }];
  const vs = sellable(p);
  const lo = vs.length ? Math.min(...vs.map((v) => v.prices.website!)) : null;
  const img = p.images[0];
  const body = `<main data-ssr="product"><nav>${trail.slice(0, -1).map((t) => link(new URL(t.url).pathname, t.name)).join(" / ")}</nav><h1>${esc(name)}</h1>` +
    (img ? `<img src="${esc(abs(cx, img.url))}" alt="${esc(img.alt || name)}" width="600">` : "") +
    (lo != null ? `<p>${esc(formatPrice(cx, lo))}${inStock(p) ? "" : ` (${esc(cx.locale === "en" ? "out of stock" : "stokta yok")})`}</p>` : "") +
    `<p>${esc(clip(stripHtml(pick(cx, p.descriptionTr, p.descriptionEn)), 600) || seo.description)}</p></main>`;
  return {
    kind: "product", status: 200, ...seo, ogType: "product", body,
    jsonLd: cx.s.seo.jsonLd ? [productJsonLd(cx, p, seo), breadcrumb(trail)] : [],
  };
}

// ---------- lists ----------
export interface ListOpts { category?: CategoryRow; page: number; q?: string }
async function listProducts(db: Db, o: ListOpts) {
  const conds = [eq(products.status, "active")];
  if (o.category) {
    const kids = await db.select({ id: categories.id }).from(categories).where(eq(categories.parentId, o.category.id));
    conds.push(inArray(products.categoryId, [o.category.id, ...kids.map((k) => k.id)]));
  }
  if (o.q) { const l = `%${o.q.replace(/[\\%_]/g, (m) => `\\${m}`).slice(0, 80)}%`; conds.push(sql`(${products.nameTr} LIKE ${l} ESCAPE '\\' OR ${products.nameEn} LIKE ${l} ESCAPE '\\' OR ${products.brand} LIKE ${l} ESCAPE '\\')`); }
  const where = and(...conds);
  const rows = await db.select().from(products).where(where).orderBy(desc(products.createdAt)).limit(PAGE_SIZE).offset((o.page - 1) * PAGE_SIZE);
  const [t] = await db.select({ n: sql<number>`count(*)` }).from(products).where(where);
  return { items: await hydrateProducts(db, rows), total: t?.n ?? 0 };
}

export async function resolveHome(db: Db, cx: SeoCx): Promise<HeadData> {
  const seo = homeSeo(cx); const g = cx.s.general; const b = cx.s.branding;
  const cats = await db.select().from(categories).where(eq(categories.active, true)).orderBy(asc(categories.position), asc(categories.nameTr)).limit(20);
  const { items } = await listProducts(db, { page: 1 });
  const sameAs = Object.values(b.social).filter((u): u is string => !!u && /^https?:\/\//i.test(u));
  const logo = b.logoMediaId ? `${cx.origin}/media/${b.logoMediaId}` : undefined;
  const contact = [g.contactPhone ? { "@type": "ContactPoint", telephone: g.contactPhone, contactType: "customer service" } : null, g.contactEmail ? { "@type": "ContactPoint", email: g.contactEmail, contactType: "customer service" } : null].filter(Boolean);
  const jsonLd = cx.s.seo.jsonLd ? [
    { "@context": "https://schema.org", "@type": "Organization", name: g.storeName, url: cx.origin + "/", ...(logo ? { logo } : {}), ...(sameAs.length ? { sameAs } : {}), ...(contact.length ? { contactPoint: contact } : {}) },
    { "@context": "https://schema.org", "@type": "WebSite", name: g.storeName, url: cx.origin + "/", potentialAction: { "@type": "SearchAction", target: { "@type": "EntryPoint", urlTemplate: `${cx.origin}/products?q={search_term_string}` }, "query-input": "required name=search_term_string" } },
  ] : [];
  const body = `<main data-ssr="home"><h1>${esc(g.storeName)}</h1><p>${esc(seo.description)}</p>` +
    (cats.length ? `<nav><ul>${cats.map((c) => `<li>${link(`/category/${c.slug}`, pick(cx, c.nameTr, c.nameEn))}</li>`).join("")}</ul></nav>` : "") +
    (items.length ? `<ul>${items.slice(0, 12).map((p) => `<li>${link(`/product/${p.slug}`, pick(cx, p.nameTr, p.nameEn))}</li>`).join("")}</ul>` : "") + `</main>`;
  return { kind: "home", status: 200, ...seo, ogType: "website", jsonLd, body };
}

export async function resolveCategory(db: Db, cx: SeoCx, key: { slug?: string; id?: string }, page = 1, opts: { activeOnly?: boolean } = {}): Promise<HeadData> {
  const [cat] = await db.select().from(categories).where(key.id ? eq(categories.id, key.id) : eq(categories.slug, key.slug ?? "")).limit(1);
  const path = `/category/${key.slug ?? ""}`;
  if (!cat || ((opts.activeOnly ?? true) && !cat.active)) {
    const to = key.slug ? await redirectFor(db, path) : undefined;
    if (to) return { ...notFoundHead(cx, path), status: 301, redirect: to };
    return notFoundHead(cx, path);
  }
  const { items, total } = await listProducts(db, { category: cat, page });
  const seo = categorySeo(cx, cat, items[0]?.images[0]?.url);
  const name = pick(cx, cat.nameTr, cat.nameEn);
  const canonical = page > 1 ? `${seo.canonical}?page=${page}` : seo.canonical;
  const crumbs = await categoryChain(db, cx, cat.id);
  const trail = [{ name: cx.s.general.storeName, url: `${cx.origin}/` }, ...crumbs.map((c) => ({ name: c.name, url: c.url }))];
  const body = `<main data-ssr="category"><h1>${esc(name)}</h1><p>${esc(seo.description)}</p><ul>${items.map((p) => `<li>${link(`/product/${p.slug}`, pick(cx, p.nameTr, p.nameEn))}</li>`).join("")}</ul></main>`;
  return {
    kind: "category", status: 200, ...seo, canonical, ogType: "website", body,
    jsonLd: cx.s.seo.jsonLd ? collectionLd(cx, name, seo.description, canonical, items, total, page, trail) : [],
  };
}

function collectionLd(cx: SeoCx, name: string, description: string, url: string, items: ProductView[], total: number, page: number, trail: { name: string; url: string }[]) {
  return [
    { "@context": "https://schema.org", "@type": "CollectionPage", name, description, url },
    { "@context": "https://schema.org", "@type": "ItemList", numberOfItems: total, itemListElement: items.map((p, i) => ({ "@type": "ListItem", position: (page - 1) * PAGE_SIZE + i + 1, url: `${cx.origin}/product/${p.slug}`, name: pick(cx, p.nameTr, p.nameEn) })) },
    breadcrumb(trail),
  ];
}

export async function resolveList(db: Db, cx: SeoCx, page = 1, q?: string): Promise<HeadData> {
  const { items, total } = await listProducts(db, { page, q });
  const name = cx.locale === "en" ? "All products" : "Tüm ürünler";
  const base = `${cx.origin}/products`;
  const canonical = page > 1 ? `${base}?page=${page}` : base;
  const description = clip(`${name} – ${storeDescription(cx.s)}`);
  const trail = [{ name: cx.s.general.storeName, url: `${cx.origin}/` }, { name, url: base }];
  return {
    kind: "list", status: 200, title: applyTemplate(cx.s, name), description, canonical, noindex: globalNoindex(cx) || !!q, ogType: "website", image: items[0]?.images[0]?.url ? abs(cx, items[0].images[0].url) : defaultImage(cx),
    body: `<main data-ssr="list"><h1>${esc(name)}</h1><ul>${items.map((p) => `<li>${link(`/product/${p.slug}`, pick(cx, p.nameTr, p.nameEn))}</li>`).join("")}</ul></main>`,
    jsonLd: cx.s.seo.jsonLd ? collectionLd(cx, name, description, canonical, items, total, page, trail) : [],
  };
}

export function resolveLegal(cx: SeoCx, key: string): HeadData {
  const text = (cx.s.legal as Record<string, string>)[key];
  const path = `/legal/${key}`;
  if (!LEGAL_TITLES[key] || !text?.trim()) return notFoundHead(cx, path);
  const title = LEGAL_TITLES[key]!;
  return { kind: "legal", status: 200, title: applyTemplate(cx.s, title), description: clip(stripHtml(text)), canonical: cx.origin + path, noindex: globalNoindex(cx), ogType: "website", image: defaultImage(cx), jsonLd: [], body: `<main data-ssr="legal"><h1>${esc(title)}</h1></main>` };
}

export const privateHead = (cx: SeoCx, path: string, title: string): HeadData => ({
  kind: "private", status: 200, title: applyTemplate(cx.s, title), description: "", canonical: cx.origin + path, noindex: true, ogType: "website", image: null, jsonLd: [], body: "",
});

// ---------- rendering ----------
export function metaOf(cx: SeoCx, h: HeadData) {
  const handle = cx.s.seo.twitterHandle.replace(/^@?/, "@");
  return {
    robots: h.noindex ? "noindex,nofollow" : "index,follow,max-image-preview:large",
    og: { title: h.title, description: h.description, type: h.ogType, url: h.canonical, image: h.image, siteName: cx.s.general.storeName, locale: cx.locale === "en" ? "en_US" : "tr_TR" },
    twitter: { card: h.image ? "summary_large_image" : "summary", title: h.title, description: h.description, image: h.image, site: cx.s.seo.twitterHandle ? handle : null },
  };
}

/** Tags that are owned by the page (the SPA's useHead removes `data-prerender` elements once mounted). */
export function renderHeadHtml(cx: SeoCx, h: HeadData): string {
  const m = metaOf(cx, h); const s = cx.s; const out: string[] = [];
  const P = ' data-prerender';
  const name = (n: string, v: string | null | undefined) => { if (v) out.push(`<meta${P} name="${esc(n)}" content="${esc(v)}">`); };
  const prop = (n: string, v: string | null | undefined) => { if (v) out.push(`<meta${P} property="${esc(n)}" content="${esc(v)}">`); };
  out.push(`<title${P}>${esc(h.title)}</title>`);
  name("description", h.description);
  name("robots", m.robots);
  out.push(`<link${P} rel="canonical" href="${esc(h.canonical)}">`);
  prop("og:title", m.og.title); prop("og:description", m.og.description); prop("og:type", m.og.type); prop("og:url", m.og.url);
  prop("og:image", m.og.image); prop("og:site_name", m.og.siteName); prop("og:locale", m.og.locale);
  name("twitter:card", m.twitter.card); name("twitter:title", m.twitter.title); name("twitter:description", m.twitter.description);
  name("twitter:image", m.twitter.image); name("twitter:site", m.twitter.site);
  // site-wide tags (kept after the SPA mounts)
  const g = (n: string, v: string) => { if (v.trim()) out.push(`<meta name="${n}" content="${esc(v.trim())}">`); };
  g("google-site-verification", s.seo.googleSiteVerification); g("msvalidate.01", s.seo.bingSiteVerification); g("facebook-domain-verification", s.seo.facebookDomainVerification);
  g("theme-color", s.branding.primaryColor);
  if (s.branding.faviconMediaId) out.push(`<link rel="icon" href="/media/${esc(s.branding.faviconMediaId)}">`);
  for (const ld of h.jsonLd) out.push(`<script${P} type="application/ld+json">${safeJson(ld)}</script>`);
  return out.join("\n");
}

export const seoSummary = (h: HeadData) => ({ title: h.title, description: h.description, image: h.image, canonical: h.canonical, noindex: h.noindex });

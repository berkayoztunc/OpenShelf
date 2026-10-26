#!/usr/bin/env node
/**
 * Build-time prerender (runs after `vite build`).
 *
 * Fetches config + catalog from the API and emits, next to dist/index.html:
 *   dist/index.html                       (home: title/description/OG/Organization JSON-LD)
 *   dist/product/<slug>/index.html        (per-product title, description, OG, canonical, Product JSON-LD, static content)
 *   dist/category/<slug>/index.html
 *   dist/prerender-manifest.json
 * Each page is the SPA shell plus head tags (marked data-prerender) and a static body snapshot inside #root.
 * On load React replaces #root and `useHead` removes [data-prerender] tags, then runtime hydration fetches live price/stock.
 * The snapshot can therefore be stale between builds: treat it as an SEO/first-paint hint, never as source of truth.
 *
 * Env: PRERENDER_API_ORIGIN (default http://localhost:8787), PRERENDER_SITE_ORIGIN (absolute URLs for canonical/OG),
 *      PRERENDER_STRICT=1 (fail the build if the API is unreachable; default: warn and ship the plain SPA).
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const API = (process.env.PRERENDER_API_ORIGIN ?? "http://localhost:8787").replace(/\/$/, "");
const SITE = (process.env.PRERENDER_SITE_ORIGIN ?? "").replace(/\/$/, "");
const STRICT = process.env.PRERENDER_STRICT === "1";

const esc = (s = "") => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const abs = (u) => (!u ? undefined : /^https?:\/\//.test(u) ? u : `${SITE}${u}`);
const money = (minor, cur) => { try { return new Intl.NumberFormat("tr-TR", { style: "currency", currency: cur }).format(minor / 100); } catch { return `${minor / 100} ${cur}`; } };
const jsonLdTag = (o) => `<script type="application/ld+json" data-prerender>${JSON.stringify(o).replace(/</g, "\\u003c")}</script>`;

async function get(path) {
  const r = await fetch(`${API}${path}`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(15_000) });
  if (!r.ok) throw new Error(`${path} -> ${r.status}`);
  return r.json();
}

function head({ title, description, image, url, type = "website", jsonLd }) {
  const t = [
    `<title data-prerender>${esc(title)}</title>`,
    description && `<meta data-prerender name="description" content="${esc(description)}">`,
    `<meta data-prerender property="og:title" content="${esc(title)}">`,
    description && `<meta data-prerender property="og:description" content="${esc(description)}">`,
    `<meta data-prerender property="og:type" content="${type}">`,
    url && `<meta data-prerender property="og:url" content="${esc(url)}">`,
    image && `<meta data-prerender property="og:image" content="${esc(image)}">`,
    `<meta data-prerender name="twitter:card" content="${image ? "summary_large_image" : "summary"}">`,
    url && `<link data-prerender rel="canonical" href="${esc(url)}">`,
    jsonLd && jsonLdTag(jsonLd),
  ];
  return t.filter(Boolean).join("\n    ");
}

function render(shell, { headHtml, bodyHtml }) {
  return shell
    .replace(/<title>[\s\S]*?<\/title>/, "") // replaced by the prerendered <title>
    .replace("<!-- prerender:head -->", headHtml)
    .replace("<!-- prerender:body -->", `<div data-prerender>${bodyHtml}</div>`);
}

async function write(rel, html, manifest) {
  const file = join(dist, rel);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, html);
  manifest.push("/" + rel.replace(/index\.html$/, ""));
}

async function main() {
  const shell = await readFile(join(dist, "index.html"), "utf8");
  let config, categories, products;
  try {
    config = await get("/api/store/config");
    const cats = await get("/api/store/categories");
    categories = Array.isArray(cats) ? cats : cats.items ?? [];
    products = [];
    for (let page = 1; ; page++) {
      const r = await get(`/api/store/products?page=${page}&pageSize=100`);
      products.push(...r.items);
      if (products.length >= r.total || !r.items.length) break;
    }
  } catch (e) {
    const msg = `[prerender] API unreachable at ${API} (${e.message}).`;
    if (STRICT) { console.error(msg); process.exit(1); }
    console.warn(`${msg} Shipping the plain SPA shell (no per-product meta).`);
    return;
  }

  const name = config.general.storeName;
  const tpl = config.seo?.titleTemplate ?? "%s | {storeName}";
  const title = (p) => tpl.replace("%s", p).replace("{storeName}", name);
  const cur = config.general.currency;
  const manifest = [];
  const ogDefault = abs(config.seo?.defaultOgUrl ?? config.branding?.bannerUrls?.[0]);

  // Home
  await write("index.html", render(shell, {
    headHtml: head({
      title: config.general.tagline ? `${name} – ${config.general.tagline}` : name, description: config.general.description, image: ogDefault, url: SITE ? `${SITE}/` : undefined,
      jsonLd: { "@context": "https://schema.org", "@type": "Organization", name, url: SITE || undefined, logo: abs(config.branding?.logoUrl) },
    }),
    bodyHtml: `<h1>${esc(name)}</h1><p>${esc(config.general.description)}</p><ul>${products.slice(0, 24).map((p) => `<li><a href="/product/${esc(p.slug)}">${esc(p.title)}</a></li>`).join("")}</ul>`,
  }), manifest);

  // Categories
  for (const c of categories) {
    const list = products.filter((p) => p.category?.slug === c.slug);
    await write(`category/${c.slug}/index.html`, render(shell, {
      headHtml: head({ title: title(c.name), description: config.general.description, image: ogDefault, url: SITE ? `${SITE}/category/${c.slug}` : undefined }),
      bodyHtml: `<h1>${esc(c.name)}</h1><ul>${list.map((p) => `<li><a href="/product/${esc(p.slug)}">${esc(p.title)}</a></li>`).join("")}</ul>`,
    }), manifest);
  }

  // Products (detail fetch for description + variants; 6 in flight)
  const queue = [...products];
  await Promise.all(Array.from({ length: 6 }, async () => {
    for (let p; (p = queue.shift()); ) {
      let d;
      try { d = await get(`/api/store/products/${encodeURIComponent(p.slug)}`); } catch (e) { console.warn(`[prerender] skip ${p.slug}: ${e.message}`); continue; }
      const url = SITE ? `${SITE}/product/${d.slug}` : undefined;
      const prices = d.variants.map((v) => v.price / 100);
      const inStock = d.variants.some((v) => v.available > 0);
      const avail = `https://schema.org/${inStock ? "InStock" : "OutOfStock"}`;
      const offers = new Set(prices).size > 1
        ? { "@type": "AggregateOffer", priceCurrency: cur, lowPrice: Math.min(...prices), highPrice: Math.max(...prices), offerCount: prices.length, availability: avail }
        : { "@type": "Offer", priceCurrency: cur, price: prices[0] ?? 0, availability: avail, url };
      const desc = (d.description ?? "").replace(/\s+/g, " ").slice(0, 160);
      const low = Math.min(...d.variants.map((v) => v.price));
      await write(`product/${d.slug}/index.html`, render(shell, {
        headHtml: head({
          title: title(d.title), description: desc, image: abs(d.images?.[0]?.url) ?? ogDefault, url, type: "product",
          jsonLd: { "@context": "https://schema.org", "@type": "Product", name: d.title, description: d.description, image: (d.images ?? []).map((i) => abs(i.url)), sku: d.variants[0]?.sku ?? d.variants[0]?.id, brand: { "@type": "Brand", name }, offers },
        }),
        // Price/stock in the snapshot are build-time values; the SPA refetches them at runtime.
        bodyHtml: `<article><h1>${esc(d.title)}</h1>${d.images?.[0] ? `<img src="${esc(d.images[0].url)}" alt="${esc(d.images[0].alt || d.title)}" width="600">` : ""}<p>${esc(money(low, cur))}</p><p>${esc(d.description ?? "")}</p></article>`,
      }), manifest);
    }
  }));

  await writeFile(join(dist, "prerender-manifest.json"), JSON.stringify({ generatedAt: new Date().toISOString(), api: API, pages: manifest.sort() }, null, 2));
  console.log(`[prerender] wrote ${manifest.length} pages (${products.length} products, ${categories.length} categories).`);
}

main().catch((e) => { console.error(e); process.exit(STRICT ? 1 : 0); });

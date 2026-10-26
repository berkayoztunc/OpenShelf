import { Hono } from "hono";
import type { Context } from "hono";
import type { AppEnv } from "../env";
import { log } from "../lib/log";
import { makeCx, notFoundHead, privateHead, renderHeadHtml, resolveCategory, resolveHome, resolveLegal, resolveList, resolveProduct, type HeadData, type SeoCx } from "../lib/seo";

/**
 * Server-side <head> + crawler snapshot for the storefront SPA shell. The Worker runs first only for the storefront HTML routes
 * (see run_worker_first in wrangler.jsonc); static files (/assets/*, files with extensions) never reach it.
 * Fail-open: any error serves the untouched shell.
 */
export const storefrontRoutes = new Hono<AppEnv>();

const CACHE_OK = "public, max-age=60, s-maxage=300, stale-while-revalidate=600";
const RESERVED = /^\/(api|admin|webhooks|media|mock|feeds)(\/|$)/;
const pageOf = (c: Context<AppEnv>) => Math.min(1000, Math.max(1, parseInt(c.req.query("page") ?? "1", 10) || 1));

async function fetchShell(c: Context<AppEnv>) {
  const res = await c.env.ASSETS!.fetch(new Request(new URL("/", c.req.url).toString(), { headers: { Accept: "text/html" }, redirect: "manual" }));
  return res.ok ? res : null;
}
async function etagOf(text: string) {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-1", new TextEncoder().encode(text)));
  return `W/"${[...d.slice(0, 10)].map((b) => b.toString(16).padStart(2, "0")).join("")}"`;
}

function rewrite(shell: Response, cx: SeoCx, h: HeadData) {
  const headHtml = renderHeadHtml(cx, h);
  const drop = { element: (e: Element) => { e.remove(); } };
  const rw = new HTMLRewriter()
    .on("html", { element: (e) => { e.setAttribute("lang", cx.locale); } })
    .on("title", drop).on('meta[name="description"]', drop).on('meta[name="robots"]', drop).on('meta[name="theme-color"]', drop)
    .on('meta[property^="og:"]', drop).on('meta[name^="twitter:"]', drop).on('link[rel="canonical"]', drop).on('script[type="application/ld+json"]', drop)
    .on('meta[name="google-site-verification"]', drop).on('meta[name="msvalidate.01"]', drop).on('meta[name="facebook-domain-verification"]', drop)
    .on('link[rel="icon"]', cx.s.branding.faviconMediaId ? drop : {})
    .on("head", { element: (e) => { e.append(headHtml, { html: true }); } })
    .on("div#root", { element: (e) => { if (h.body) e.setInnerContent(h.body, { html: true }); } });
  return rw.transform(shell);
}

async function respond(c: Context<AppEnv>, resolver: (cx: SeoCx) => Promise<HeadData> | HeadData): Promise<Response> {
  if (!c.env.ASSETS) return c.json({ error: { code: "not_found", message: "Route not found" } }, 404);
  let cx: SeoCx | null = null; let h: HeadData | null = null;
  try {
    cx = await makeCx(c.get("db"), c.env.STOREFRONT_ORIGIN);
    h = await resolver(cx);
  } catch (e) { log("warn", "storefront seo failed (serving plain shell)", { path: c.req.path, error: e instanceof Error ? e.message : String(e) }); }
  if (h?.redirect) return c.redirect(h.redirect.startsWith("/") ? `${h.redirect}${new URL(c.req.url).search}` : h.redirect, 301);
  const shell = await fetchShell(c);
  if (!shell) return c.json({ error: { code: "not_found", message: "Storefront shell unavailable" } }, 404);
  if (!h || !cx) { // fail-open
    const plain = new Response(shell.body, shell);
    plain.headers.set("Cache-Control", "public, max-age=0, must-revalidate");
    return plain;
  }
  try {
    const text = await rewrite(shell, cx, h).text();
    const etag = await etagOf(text);
    const headers = new Headers(shell.headers);
    for (const k of ["content-length", "etag", "content-encoding", "last-modified"]) headers.delete(k);
    headers.set("Content-Type", "text/html; charset=utf-8");
    headers.set("ETag", etag);
    headers.set("Cache-Control", h.status === 200 ? CACHE_OK : "public, max-age=30");
    if (h.noindex) headers.set("X-Robots-Tag", "noindex, nofollow");
    if (h.status === 200 && c.req.header("If-None-Match") === etag) return new Response(null, { status: 304, headers });
    return new Response(text, { status: h.status, headers });
  } catch (e) {
    log("warn", "storefront rewrite failed (serving plain shell)", { path: c.req.path, error: e instanceof Error ? e.message : String(e) });
    const again = await fetchShell(c);
    return again ? new Response(again.body, again) : c.json({ error: { code: "not_found", message: "Storefront shell unavailable" } }, 404);
  }
}

const both = (p: string) => [p, `${p}/`];
storefrontRoutes.get("/", (c) => respond(c, (cx) => resolveHome(c.get("db"), cx)));
for (const p of both("/products")) storefrontRoutes.get(p, (c) => respond(c, (cx) => resolveList(c.get("db"), cx, pageOf(c), c.req.query("q")?.trim() || undefined)));
// legacy/feed style URL -> canonical product path
for (const p of both("/products/:slug")) storefrontRoutes.get(p, (c) => c.redirect(`/product/${encodeURIComponent((c.req.param("slug") ?? ""))}${new URL(c.req.url).search}`, 301));
for (const p of both("/product/:slug")) storefrontRoutes.get(p, (c) => respond(c, (cx) => resolveProduct(c.get("db"), cx, { slug: (c.req.param("slug") ?? "") })));
for (const p of both("/category/:slug")) storefrontRoutes.get(p, (c) => respond(c, (cx) => resolveCategory(c.get("db"), cx, { slug: (c.req.param("slug") ?? "") }, pageOf(c))));
for (const p of both("/legal/:key")) storefrontRoutes.get(p, (c) => respond(c, (cx) => resolveLegal(cx, (c.req.param("key") ?? ""))));
for (const p of both("/cart")) storefrontRoutes.get(p, (c) => respond(c, (cx) => privateHead(cx, "/cart", cx.locale === "en" ? "Cart" : "Sepet")));
for (const p of both("/checkout")) storefrontRoutes.get(p, (c) => respond(c, (cx) => privateHead(cx, "/checkout", cx.locale === "en" ? "Checkout" : "Ödeme")));
for (const p of both("/order/:number")) storefrontRoutes.get(p, (c) => respond(c, (cx) => privateHead(cx, "/order", cx.locale === "en" ? "Your order" : "Siparişiniz")));

/** Unknown HTML routes: a real 404 status with the noindex SPA shell (the SPA renders its own NotFound page). */
export function storefrontNotFound(c: Context<AppEnv>): Promise<Response> | null {
  const path = c.req.path;
  if ((c.req.method !== "GET" && c.req.method !== "HEAD") || !c.env.ASSETS || RESERVED.test(path) || /\.[A-Za-z0-9]+$/.test(path.split("/").pop() ?? "")) return null;
  if (path === "/sitemap.xml" || path === "/robots.txt") return null;
  return respond(c, (cx) => notFoundHead(cx, path));
}

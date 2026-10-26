import { Hono } from "hono";
import type { AppEnv } from "../env";

/**
 * Serves the admin SPA from static assets (single-Worker deployment). `/admin` and `/admin/*` run the Worker first so
 * that the storefront's SPA fallback (not_found_handling) can never leak the storefront shell under /admin.
 *  - /admin            -> 308 /admin/
 *  - existing file     -> served from ASSETS
 *  - missing file with an extension (.js, .css, ...) -> real 404
 *  - any other path    -> admin index.html (client-side routing)
 */
export const siteRoutes = new Hono<AppEnv>();

siteRoutes.all("/admin", (c) => c.redirect(new URL("/admin/", c.req.url).toString(), 308));
siteRoutes.all("/admin/*", async (c) => {
  const assets = c.env.ASSETS;
  if (!assets) return c.json({ error: { code: "not_found", message: "Static assets are not bound (API-only dev mode)" } }, 404);
  if (c.req.method !== "GET" && c.req.method !== "HEAD") return c.json({ error: { code: "method_not_allowed", message: "GET or HEAD only" } }, 405);
  const url = new URL(c.req.url);
  const last = url.pathname.split("/").pop() ?? "";
  const hasExt = /\.[A-Za-z0-9]+$/.test(last);
  if (hasExt) {
    const res = await assets.fetch(c.req.raw);
    const type = res.headers.get("Content-Type") ?? "";
    // With SPA fallback enabled, a missing file comes back as the storefront index.html: turn that into a real 404.
    if (res.status === 200 && type.startsWith("text/html") && !/\.html?$/i.test(last)) return new Response("Not found", { status: 404 });
    return res;
  }
  // SPA route: always the admin shell ("/admin/" resolves to admin/index.html).
  return assets.fetch(new Request(new URL("/admin/", url), { method: c.req.method, headers: c.req.raw.headers }));
});

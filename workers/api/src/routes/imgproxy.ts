import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { productImages } from "@openshelf/db";
import type { AppEnv } from "../env";
import { fetchImageBytes } from "../lib/imageFetch";
import { proxyableUrl } from "../lib/imageProxy";
import { sniffImage } from "../lib/media";
import { hit } from "../middleware/security";

const MAX_BYTES = 8 * 1024 * 1024;
const MISS_PER_MIN = 60;
const err = (status: number, code: string, message: string) => new Response(JSON.stringify({ error: { code, message } }), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

/** Public: GET /img/p/:imageId[?v=tag]. Serves a product image that lives on the marketplace CDN through this store's own domain (cached at the edge). */
export const imgProxy = new Hono<AppEnv>();
imgProxy.get("/p/:id", async (c) => {
  const [row] = await c.get("db").select({ mediaId: productImages.mediaId, url: productImages.url }).from(productImages).where(eq(productImages.id, c.req.param("id"))).limit(1);
  if (!row) return err(404, "not_found", "Image not found");
  if (row.mediaId) return c.redirect(`/media/${row.mediaId}`, 302);                // already ours
  if (!proxyableUrl(row.url)) return err(404, "not_found", "Image not found");      // not a host we proxy (never reveals why)
  const cache = (caches as unknown as { default: Cache }).default;
  const key = new Request(new URL(c.req.url).toString(), { method: "GET" });
  const cached = await cache.match(key);
  if (cached) return new Response(cached.body, cached); // re-wrap: cached responses have immutable headers and the security middleware adds some
  if ((await hit(c.env.DB, `imgproxy:${c.get("ip")}`, 60)).count > MISS_PER_MIN) return err(429, "rate_limited", "Too many requests");
  let bytes: Uint8Array<ArrayBuffer>;
  try { bytes = await fetchImageBytes(row.url!, MAX_BYTES); } catch { return err(502, "upstream_failed", "The image host did not return the image"); }
  const mime = sniffImage(bytes);                                                   // never trust the upstream content-type
  if (!mime) return err(502, "not_an_image", "The image host did not return a supported image");
  const res = new Response(bytes, { headers: {
    "Content-Type": mime, "Content-Length": String(bytes.length), "Cache-Control": "public, max-age=31536000, immutable",
    "X-Content-Type-Options": "nosniff", "Cross-Origin-Resource-Policy": "cross-origin", "Access-Control-Allow-Origin": "*", "Content-Disposition": "inline",
  } });
  c.executionCtx.waitUntil(cache.put(key, res.clone()));
  return res;
});

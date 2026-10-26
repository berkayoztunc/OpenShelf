import { Hono } from "hono";
import type { AppEnv } from "../env";
import { ApiError, notFound } from "../lib/http";
import { requireRole } from "../middleware/auth";
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

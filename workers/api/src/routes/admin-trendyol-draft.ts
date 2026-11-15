import { Hono } from "hono";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { productMappings, productVariants, products } from "@openshelf/db";
import { TrendyolDraftOverrides, remoteVariants, suggestMatches, type LocalVariant } from "@openshelf/shared";
import type { AppEnv } from "../env";
import { ApiError, body, notFound } from "../lib/http";
import { audit } from "../lib/audit";
import { requireRole } from "../middleware/auth";
import { isIntegrationEnabled, isMockModeFresh } from "../lib/integrations";
import { buildDraft, findOnTrendyol, makeRun, publicDraft, sendDraft } from "../lib/trendyolDraft";

/**
 * Create products on Trendyol from the store's own data, for the MCP tools (and anything else that cannot click through the wizard):
 *  - GET  /trendyol/find            brand / category / attribute lookups on Trendyol, compact
 *  - POST /trendyol/draft           what would be sent for a local product, what is still open and the suggestions for it (reads only)
 *  - POST /trendyol/create-product  sends a ready draft (production: a real write to the seller account)
 *  - GET  /trendyol/match-suggestions  which Trendyol listings belong to which unmapped local variant (reads only, nothing is linked)
 */
export const adminTrendyolDraft = new Hono<AppEnv>();
adminTrendyolDraft.use("/trendyol/find", requireRole("admin"));
adminTrendyolDraft.use("/trendyol/draft", requireRole("admin"));
adminTrendyolDraft.use("/trendyol/create-product", requireRole("admin"));
adminTrendyolDraft.use("/trendyol/match-suggestions", requireRole("admin"));

async function requireTrendyol(c: { env: AppEnv["Bindings"]; get: (k: "db") => AppEnv["Variables"]["db"] }) {
  const db = c.get("db");
  if (!(await isMockModeFresh(db)) && !(await isIntegrationEnabled(c.env, db, "trendyol"))) throw new ApiError(409, "integration_unavailable", "Trendyol integration is not enabled");
}

const FindQuery = z.object({
  kind: z.enum(["brand", "category", "attributes", "attributeValue"]), q: z.string().max(100).optional(),
  categoryId: z.coerce.number().int().positive().optional(), attributeId: z.coerce.number().int().positive().optional(),
});
adminTrendyolDraft.get("/trendyol/find", async (c) => {
  const q = FindQuery.parse(Object.fromEntries(new URL(c.req.url).searchParams));
  await requireTrendyol(c);
  const r = await findOnTrendyol(makeRun(c), q);
  if ("error" in r) throw new ApiError(400, "validation_error", String(r.error));
  return c.json(r);
});

const DraftBody = z.object({ productId: z.string().min(1).max(64), overrides: TrendyolDraftOverrides.optional() });
adminTrendyolDraft.post("/trendyol/draft", async (c) => {
  const b = await body(c, DraftBody);
  await requireTrendyol(c);
  const d = await buildDraft(c, makeRun(c), b.productId, b.overrides ?? {});
  if (!d) throw notFound("Product");
  return c.json(publicDraft(d));
});

adminTrendyolDraft.post("/trendyol/create-product", async (c) => {
  const b = await body(c, DraftBody);
  await requireTrendyol(c);
  const run = makeRun(c);
  const d = await buildDraft(c, run, b.productId, b.overrides ?? {});
  if (!d) throw notFound("Product");
  // Nothing is sent while something is open: the answer lists exactly what is missing (same shape as the draft)
  if (!d.ready) return c.json({ created: false, reason: "draft_not_ready", ...publicDraft(d) }, 409);
  const r = await sendDraft(c, run, d);
  await audit(c, "trendyol.create_product", "product", b.productId, { created: r.created, batchId: r.batchId, variants: d.variants.filter((v) => v.include).length, category: d.category.id });
  if (!r.created) throw new ApiError(502, "trendyol_rejected", `Trendyol did not accept the request: ${r.error ?? "unknown error"}`);
  return c.json({ ...r, draft: { brand: d.brand, category: d.category, fields: d.fields } }, 201);
});

const PAGE = 100; const MAX_APPROVED_PAGES = 10; const MAX_UNAPPROVED_PAGES = 3;
adminTrendyolDraft.get("/trendyol/match-suggestions", async (c) => {
  await requireTrendyol(c);
  const run = makeRun(c);
  const pull = async (op: string, maxPages: number) => {
    const out: unknown[] = []; let truncated = false;
    for (let page = 0; page < maxPages; page++) {
      const r = await run(op, { query: { page, size: PAGE } });
      if (!r.ok) throw new ApiError(502, "trendyol_unavailable", `Trendyol ${op} failed: ${r.error ?? `HTTP ${r.status}`}`);
      const content = Array.isArray(r.body?.content) ? (r.body.content as unknown[]) : [];
      out.push(...content);
      if (content.length < PAGE || page + 1 >= Number(r.body?.totalPages ?? 1)) return { items: out, truncated };
    }
    truncated = true;
    return { items: out, truncated };
  };
  const [approved, unapproved] = [await pull("filterApprovedProducts", MAX_APPROVED_PAGES), await pull("filterUnapprovedProducts", MAX_UNAPPROVED_PAGES)];
  const rows = await c.get("db").select({
    variantId: productVariants.id, sku: productVariants.sku, barcode: productVariants.barcode, title: productVariants.title, productName: products.nameTr, mapped: productMappings.externalBarcode,
  }).from(productVariants).innerJoin(products, eq(products.id, productVariants.productId))
    .leftJoin(productMappings, and(eq(productMappings.variantId, productVariants.id), eq(productMappings.provider, "trendyol"))).limit(5000);
  const local: LocalVariant[] = rows.map((r) => ({ variantId: r.variantId, sku: r.sku, barcode: r.barcode, label: r.title && r.title !== r.productName ? `${r.productName} - ${r.title}` : r.productName, mappedBarcode: r.mapped }));
  const remote = remoteVariants(approved.items, unapproved.items);
  return c.json({ ...suggestMatches(remote, local), counts: { remote: remote.length, local: local.length }, truncated: approved.truncated || unapproved.truncated });
});

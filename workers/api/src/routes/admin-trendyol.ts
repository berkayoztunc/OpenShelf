import { Hono } from "hono";
import { and, desc, eq, sql } from "drizzle-orm";
import { channelListings, integrationConfigs, integrationEvents, outboxJobs, syncCursors, productMappings, productVariants, products, trendyolCalls } from "@openshelf/db";
import {
  TrendyolCallBody, type MockHandler, type TrendyolCatalogResponse, type TrendyolEnv, type TrendyolOperation,
} from "@openshelf/shared";
import {
  ConsoleError, MAX_BODY_BYTES, MAX_RESPONSE_BYTES, TRENDYOL_MOCKS, TRENDYOL_OPERATIONS, loadImportStatus, opAvailableOn, runCall, stockDriftReport, ORDERS_CURSOR_KEY, htmlToText, looksLikeHtml,
} from "@openshelf/integration-trendyol";
import { z } from "zod";
import type { AppEnv } from "../env";
import { ApiError, body, notFound, paged, paging } from "../lib/http";
import { audit } from "../lib/audit";
import { requireRole } from "../middleware/auth";
import { hit } from "../middleware/security";
import { adapterDeps, isIntegrationEnabled, isMockModeFresh, loadSecrets } from "../lib/integrations";
import { scrub } from "../lib/log";
import { resetMockTrendyol, runMock } from "../lib/trendyolMock";

/** Groups whose responses contain customer data (names, addresses, phones, questions): the call log keeps only status + size for them. */
const PII_GROUPS = new Set(["orders", "split", "shipping", "labels", "claims", "questions", "invoices", "seller", "finance", "cargoInvoice", "express", "test"]);

export const adminTrendyol = new Hono<AppEnv>();
// Orders/claims contain customer PII and writes hit a real marketplace account: owner/admin only.
adminTrendyol.use("/trendyol/*", requireRole("admin"));

/** Test seam: replace the catalog/mocks without touching the real catalog files. */
let override: { ops: TrendyolOperation[]; mocks: Record<string, MockHandler> } | null = null;
export const __setTrendyolCatalog = (o: typeof override) => { override = o; };
const operations = () => override?.ops ?? TRENDYOL_OPERATIONS;
const mocks = () => override?.mocks ?? TRENDYOL_MOCKS;

const CALLS_PER_MIN = 120;
const OP_LIMIT = 50; const OP_WINDOW_SEC = 10; // mirrors Trendyol's 50 req / 10 s per endpoint
const MOCK_SELLER_ID = "123456";

interface State {
  mock: boolean; env: TrendyolEnv; sellerId?: string;
  mode: TrendyolCatalogResponse["mode"]; reason?: TrendyolCatalogResponse["reason"];
  row?: typeof integrationConfigs.$inferSelect;
}
async function resolveState(c: { env: AppEnv["Bindings"]; get: (k: "db") => AppEnv["Variables"]["db"] }): Promise<State> {
  const db = c.get("db");
  const mock = await isMockModeFresh(db);
  // Mock mode must never read secret columns: select the public config only.
  if (mock) {
    const [m] = await db.select({ configPublic: integrationConfigs.configPublic }).from(integrationConfigs).where(eq(integrationConfigs.provider, "trendyol")).limit(1);
    const cfg = (m?.configPublic as Record<string, unknown> | undefined) ?? {};
    return { mock: true, mode: "mock", env: cfg.environment === "stage" ? "stage" : "production", sellerId: typeof cfg.supplierId === "string" && cfg.supplierId ? cfg.supplierId : MOCK_SELLER_ID };
  }
  const [row] = await db.select().from(integrationConfigs).where(eq(integrationConfigs.provider, "trendyol")).limit(1);
  const cfg = (row?.configPublic as Record<string, unknown> | undefined) ?? {};
  const env: TrendyolEnv = cfg.environment === "stage" ? "stage" : "production";
  const sellerId = typeof cfg.supplierId === "string" && cfg.supplierId ? cfg.supplierId : undefined;
  if (!row || !row.secretsEnc || !sellerId) return { mock: false, mode: "disabled", reason: "not_configured", env, sellerId };
  if (!(await isIntegrationEnabled(c.env, db, "trendyol"))) return { mock: false, mode: "disabled", reason: "integration_disabled", env, sellerId };
  return { mock: false, mode: "live", env, sellerId, row };
}

adminTrendyol.get("/trendyol/catalog", async (c) => {
  const st = await resolveState(c);
  const res: TrendyolCatalogResponse = {
    mode: st.mode, ...(st.reason ? { reason: st.reason } : {}), env: st.env, ...(st.sellerId ? { sellerId: st.sellerId } : {}),
    operations: operations().filter((o) => opAvailableOn(o, st.env)),
    limits: { maxBodyBytes: MAX_BODY_BYTES, maxResponseBytes: MAX_RESPONSE_BYTES },
  };
  return c.json(res);
});

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n) : s);

adminTrendyol.post("/trendyol/call", async (c) => {
  const b = await body(c, TrendyolCallBody);
  const db = c.get("db"); const admin = c.get("admin")!;
  const op = operations().find((o) => o.id === b.operationId);
  if (!op) throw new ApiError(404, "unknown_operation", `Unknown operation: ${b.operationId}`);
  const st = await resolveState(c);
  if (st.mode === "disabled") throw new ApiError(409, "integration_unavailable", st.reason === "integration_disabled" ? "Trendyol integration is disabled" : "Trendyol integration is not configured");

  // Credentials differ per environment: a live call can only target the configured environment. Mock calls may pick either.
  const env: TrendyolEnv = st.mock ? (b.env ?? st.env) : st.env;
  if (!st.mock && b.env && b.env !== st.env) throw new ApiError(400, "invalid_params", "env must match the configured Trendyol environment", [{ field: "env", message: `configured: ${st.env}` }]);
  if (!opAvailableOn(op, env)) throw new ApiError(400, "invalid_params", `${op.id} is not available on ${env}`, [{ field: "env", message: `not available on ${env}` }]);
  if (!st.mock && op.risk !== "read" && b.confirm !== op.id) {
    throw new ApiError(409, "confirm_required", `This ${op.risk} call changes data on your real Trendyol account: send confirm="${op.id}"`, { confirm: op.id, risk: op.risk });
  }

  const minute = await hit(c.env.DB, `ty:admin:${admin.id}`, 60);
  if (minute.count > CALLS_PER_MIN) throw new ApiError(429, "rate_limited", "Too many Trendyol console calls, slow down", undefined, { "Retry-After": String(minute.resetIn) });
  if (!st.mock) {
    const perOp = await hit(c.env.DB, `ty:op:${op.id}`, OP_WINDOW_SEC);
    if (perOp.count > OP_LIMIT) throw new ApiError(429, "rate_limited", "Trendyol allows 50 requests per 10 s per endpoint; wait before retrying", undefined, { "Retry-After": String(perOp.resetIn) });
  }

  let secrets: string[] = [];
  let result;
  try {
    if (st.mock) {
      result = await runMock(c.env.DB, op, { sellerId: st.sellerId!, env, path: b.path, query: b.query, body: b.body }, mocks());
    } else {
      const s = await loadSecrets(c.env, st.row).catch(() => ({}) as Record<string, string>);
      if (!s.apiKey || !s.apiSecret) throw new ApiError(409, "integration_unavailable", "Trendyol credentials are not available");
      secrets = [s.apiKey, s.apiSecret, btoa(`${s.apiKey}:${s.apiSecret}`)];
      result = await runCall({ fetch: adapterDeps().fetch }, { sellerId: st.sellerId!, apiKey: s.apiKey, apiSecret: s.apiSecret }, env, op, { path: b.path, query: b.query, body: b.body });
    }
  } catch (e) {
    if (e instanceof ConsoleError) {
      throw new ApiError(e.code === "body_too_large" ? 413 : 400, e.code === "env_unavailable" ? "invalid_params" : e.code, scrub(e.message, secrets), e.details);
    }
    throw e;
  }
  if (result.error) result.error = { ...result.error, message: scrub(result.error.message, secrets) };

  const bodyBytes = b.body === undefined ? 0 : new TextEncoder().encode(typeof b.body === "string" ? b.body : JSON.stringify(b.body)).length;
  const respText = typeof result.response.body === "string" ? result.response.body : JSON.stringify(result.response.body ?? null);
  const [ins] = await db.insert(trendyolCalls).values({
    operationId: op.id, method: op.method, env, mock: st.mock, risk: op.risk, status: result.status, durationMs: result.durationMs, adminId: admin.id,
    requestSummary: { query: result.request.query, pathKeys: Object.keys(b.path), bodyBytes },
    responseSummary: PII_GROUPS.has(op.group)
      ? `HTTP ${result.status} · ${new TextEncoder().encode(respText).length} bytes${result.error ? ` · ${scrub(clip(result.error.message, 120), secrets)}` : ""}`
      : scrub(clip(respText, 200), secrets),
  }).returning({ id: trendyolCalls.id });
  await audit(c, "trendyol.call", "trendyol_call", ins ? String(ins.id) : undefined, { operationId: op.id, risk: op.risk, env, status: result.status, mock: st.mock });
  return c.json(result);
});

adminTrendyol.get("/trendyol/history", async (c) => {
  const p = paging(c, 20, 100);
  const opId = c.req.query("operationId");
  const where = opId ? eq(trendyolCalls.operationId, opId) : undefined;
  const rows = await c.get("db").select().from(trendyolCalls).where(where).orderBy(desc(trendyolCalls.id)).limit(p.pageSize).offset(p.offset);
  const [t] = await c.get("db").select({ n: sql<number>`count(*)` }).from(trendyolCalls).where(where);
  return c.json(paged(rows, t?.n ?? 0, p));
});

adminTrendyol.delete("/trendyol/history", requireRole("owner"), async (c) => {
  const [t] = await c.get("db").select({ n: sql<number>`count(*)` }).from(trendyolCalls);
  await c.get("db").delete(trendyolCalls);
  await audit(c, "trendyol.history.clear", "trendyol_call", undefined, { rows: t?.n ?? 0 });
  return c.body(null, 204);
});

adminTrendyol.post("/trendyol/mock/reset", requireRole("owner"), async (c) => {
  if (!(await isMockModeFresh(c.get("db")))) throw new ApiError(409, "mock_mode_required", "Mock state can only be reset while Mock Mode is on");
  const deleted = await resetMockTrendyol(c.env.DB);
  await audit(c, "trendyol.mock.reset", "mock_state", undefined, { deleted });
  return c.json({ ok: true, deleted });
});

// ---------- variant <-> barcode mappings ----------
const MappingBody = z.object({
  variantId: z.string().min(1).max(64),
  barcode: z.string().regex(/^[A-Za-z0-9._-]{1,40}$/, "barcode: letters, digits . _ - (max 40)"),
  externalId: z.string().max(64).optional(),
  listingEnabled: z.boolean().optional(),
});

adminTrendyol.get("/trendyol/mappings", async (c) => {
  const rows = await c.get("db").select({
    variantId: productMappings.variantId, sku: productVariants.sku, productName: products.nameTr, variantTitle: productVariants.title,
    barcode: productMappings.externalBarcode, externalId: productMappings.externalId, listingEnabled: channelListings.enabled,
  }).from(productMappings)
    .innerJoin(productVariants, eq(productVariants.id, productMappings.variantId))
    .innerJoin(products, eq(products.id, productVariants.productId))
    .leftJoin(channelListings, and(eq(channelListings.variantId, productMappings.variantId), eq(channelListings.channel, "trendyol")))
    .where(eq(productMappings.provider, "trendyol")).orderBy(productVariants.sku).limit(1000);
  return c.json({ items: rows });
});

adminTrendyol.post("/trendyol/mappings", async (c) => {
  const b = await body(c, MappingBody); const db = c.get("db");
  const [v] = await db.select({ id: productVariants.id, sku: productVariants.sku }).from(productVariants).where(eq(productVariants.id, b.variantId)).limit(1);
  if (!v) throw notFound("Variant");
  const [taken] = await db.select({ v: productMappings.variantId }).from(productMappings)
    .where(and(eq(productMappings.provider, "trendyol"), eq(productMappings.externalBarcode, b.barcode))).limit(1);
  if (taken && taken.v !== b.variantId) throw new ApiError(409, "barcode_taken", "This barcode is already mapped to another variant");
  const enabled = b.listingEnabled ?? true;
  const values = { id: crypto.randomUUID(), variantId: b.variantId, provider: "trendyol", externalSku: v.sku, externalBarcode: b.barcode, externalId: b.externalId ?? null };
  await db.batch([
    db.insert(productMappings).values(values).onConflictDoUpdate({ target: [productMappings.provider, productMappings.variantId], set: { externalSku: v.sku, externalBarcode: b.barcode, externalId: b.externalId ?? null } }),
    db.insert(channelListings).values({ variantId: b.variantId, channel: "trendyol", enabled, externalId: b.externalId ?? null })
      .onConflictDoUpdate({ target: [channelListings.variantId, channelListings.channel], set: { enabled, externalId: b.externalId ?? null } }),
  ]);
  await audit(c, "trendyol.mapping.upsert", "variant", b.variantId, { barcode: b.barcode, listingEnabled: enabled });
  return c.json({ variantId: b.variantId, sku: v.sku, barcode: b.barcode, externalId: b.externalId ?? null, listingEnabled: enabled });
});

adminTrendyol.delete("/trendyol/mappings", async (c) => {
  const db = c.get("db");
  let variantId = c.req.query("variantId");
  if (!variantId) { const j = (await c.req.json().catch(() => ({}))) as { variantId?: unknown }; if (typeof j.variantId === "string") variantId = j.variantId; }
  if (!variantId) throw new ApiError(400, "validation_error", "variantId is required");
  const [m] = await db.select({ id: productMappings.id }).from(productMappings).where(and(eq(productMappings.provider, "trendyol"), eq(productMappings.variantId, variantId))).limit(1);
  if (!m) throw notFound("Mapping");
  await db.batch([
    db.delete(productMappings).where(and(eq(productMappings.provider, "trendyol"), eq(productMappings.variantId, variantId))),
    db.delete(channelListings).where(and(eq(channelListings.channel, "trendyol"), eq(channelListings.variantId, variantId))),
  ]);
  await audit(c, "trendyol.mapping.delete", "variant", variantId);
  return c.body(null, 204);
});

// ---------- product import (Trendyol -> OpenShelf) ----------
const ImportBody = z.object({
  /** create local DRAFT products for Trendyol variants that match nothing local (default false: only link matches) */
  createMissing: z.boolean().optional(),
  /** count what would happen without writing */
  dryRun: z.boolean().optional(),
});

adminTrendyol.post("/trendyol/import", async (c) => {
  const b = await body(c, ImportBody); const db = c.get("db");
  const st = await resolveState(c);
  if (st.mode === "disabled") throw new ApiError(409, "integration_unavailable", st.reason === "integration_disabled" ? "Trendyol integration is disabled" : "Trendyol integration is not configured");
  const running = await loadImportStatus(db);
  if (running && (running.state === "queued" || running.state === "running") && Date.now() - Date.parse(running.startedAt) < 30 * 60_000) {
    throw new ApiError(409, "import_running", "A Trendyol product import is already running");
  }
  const runId = crypto.randomUUID();
  const createMissing = b.createMissing ?? false; const dryRun = b.dryRun ?? false;
  await db.insert(outboxJobs).values({ id: crypto.randomUUID(), kind: "trendyol.import_products", dedupeKey: `trendyol.import_products:${runId}:first`, payload: { runId, createMissing, dryRun } });
  const initial = { runId, state: "queued", dryRun, createMissing, sourceOfTruth: "local", startedAt: new Date().toISOString(), totals: { pages: 0, contents: 0, variants: 0, linked: 0, created: 0, updated: 0, skipped: 0, stockChanged: 0 } };
  await db.run(sql`INSERT INTO sync_cursors (key, value) VALUES ('trendyol:products:last', ${JSON.stringify(initial)})
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = unixepoch()`);
  await audit(c, "trendyol.import.start", "trendyol_import", runId, { createMissing, dryRun });
  return c.json({ queued: true, runId }, 202);
});

adminTrendyol.get("/trendyol/import", async (c) => c.json({ status: await loadImportStatus(c.get("db")) }));

/** Sync health for the console overview: orders mirrored, cargo coverage, stock drift (local is the truth), last errors. */
adminTrendyol.get("/trendyol/health", async (c) => {
  const db = c.get("db");
  const one = async <T,>(q: ReturnType<typeof sql>) => ((await db.all(q)) as T[])[0];
  const wk = Math.floor(Date.now() / 1000) - 7 * 86400;
  const ord = await one<{ total: number; week: number; last: number | null; noCargo: number; unmapped: number }>(sql`
    SELECT COUNT(*) AS total,
      SUM(CASE WHEN o.created_at >= ${wk} THEN 1 ELSE 0 END) AS week, MAX(o.created_at) AS last,
      SUM(CASE WHEN o.status NOT IN ('cancelled','delivered') AND NOT EXISTS (SELECT 1 FROM shipments s WHERE s.order_id = o.id AND s.provider = 'trendyol') THEN 1 ELSE 0 END) AS noCargo,
      (SELECT COUNT(*) FROM order_items i JOIN orders o2 ON o2.id = i.order_id WHERE o2.source = 'trendyol' AND i.variant_id IS NULL) AS unmapped
    FROM orders o WHERE o.source = 'trendyol'`);
  const [cur] = await db.select().from(syncCursors).where(eq(syncCursors.key, ORDERS_CURSOR_KEY)).limit(1);
  const lst = await one<{ enabled: number; errors: number; lastPush: number | null }>(sql`
    SELECT COUNT(*) AS enabled, SUM(CASE WHEN last_error IS NOT NULL THEN 1 ELSE 0 END) AS errors, MAX(last_synced_at) AS lastPush
    FROM channel_listings WHERE channel = 'trendyol' AND enabled = 1`);
  const drift = await stockDriftReport(db).catch(() => []);
  const events = await db.select().from(integrationEvents).where(and(eq(integrationEvents.provider, "trendyol"), sql`${integrationEvents.level} IN ('warn','error')`)).orderBy(desc(integrationEvents.id)).limit(5);
  const sec = (v: number | null | undefined) => (v ? new Date(v * 1000).toISOString() : null);
  return c.json({
    orders: { total: ord?.total ?? 0, last7d: ord?.week ?? 0, lastAt: sec(ord?.last), withoutCargo: ord?.noCargo ?? 0, unmappedLines: ord?.unmapped ?? 0 },
    reconcile: { lastRunAt: cur?.updatedAt ? new Date(cur.updatedAt).toISOString() : null },
    stock: { listings: lst?.enabled ?? 0, errors: lst?.errors ?? 0, drift: drift.length, lastPushAt: sec(lst?.lastPush), truth: "local" },
    import: await loadImportStatus(db),
    errors: events.map((e) => ({ id: e.id, level: e.level, message: e.message, at: e.at ? new Date(e.at as unknown as number).toISOString() : null })),
  });
});

/** One-off: strips HTML markup from product descriptions already stored (older imports kept Trendyol's HTML). Idempotent. */
adminTrendyol.post("/trendyol/import/clean-descriptions", async (c) => {
  const db = c.get("db");
  const rows = await db.select({ id: products.id, d: products.descriptionTr }).from(products).where(sql`${products.descriptionTr} LIKE '%<%' OR ${products.descriptionTr} LIKE '%&%;%'`);
  const dirty = rows.filter((r) => looksLikeHtml(r.d));
  for (let i = 0; i < dirty.length; i += 100) {
    await db.batch(dirty.slice(i, i + 100).map((r) => db.update(products).set({ descriptionTr: htmlToText(r.d) || null }).where(eq(products.id, r.id))) as unknown as [any, ...any[]]);
  }
  await audit(c, "trendyol.clean_descriptions", "products", "bulk", { cleaned: dirty.length });
  return c.json({ cleaned: dirty.length });
});

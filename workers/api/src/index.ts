import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { ZodError } from "zod";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "@openshelf/db";
import { expireReservations, enqueueJob } from "@openshelf/core";
import type { AppEnv, Env } from "./env";
import { ApiError, zodDetails } from "./lib/http";
import { baseMiddleware, corsMiddleware } from "./middleware/security";
import { adminGuard } from "./middleware/auth";
import { adminAuth } from "./routes/admin-auth";
import { adminSettings } from "./routes/admin-settings";
import { mockAdmin, mockRoutes } from "./routes/mock";
import { adminMedia, mediaPublic } from "./routes/media";
import { adminHelp } from "./routes/admin-help";
import { imgProxy } from "./routes/imgproxy";
import { adminCatalog } from "./routes/admin-catalog";
import { adminOrders } from "./routes/admin-orders";
import { adminData } from "./routes/admin-data";
import { store } from "./routes/store";
import { paymentCallback, webhooks } from "./routes/webhooks";
import { publicRoutes } from "./routes/public";
import { siteRoutes } from "./routes/site";
import { storefrontNotFound, storefrontRoutes } from "./routes/storefront";
import { adminSeo } from "./routes/admin-seo";
import { runOutbox, registerJobHandlers } from "./outbox";
import { TRACK_JOB, trackShipmentsHandler } from "./lib/shipmentTracking";
import { enqueueQuestionScan, QUESTION_NOTIFY_JOB, QUESTION_SCAN_JOB, questionNotifyHandler, questionScanHandler } from "./lib/trendyolQuestions";
import { adminNotifications } from "./routes/notifications";
import { adminManualInvoices } from "./routes/manual-invoices";
import { adminManualShipments } from "./routes/manual-shipments";
import { adminEmails } from "./routes/admin-emails";
import { adminTrendyol } from "./routes/admin-trendyol";
import { adminTrendyolSync } from "./routes/admin-trendyol-sync";
import { adminTrendyolDraft } from "./routes/admin-trendyol-draft";
import { enqueueImport, hasFollowedProducts } from "@openshelf/integration-trendyol";
import { adminGeliver } from "./routes/admin-geliver";
import { adminEfaturam } from "./routes/admin-efaturam";
import { adminCampaigns } from "./routes/admin-campaigns";
import { unsubscribeRoutes } from "./routes/unsubscribe";
import { campaignSendJob } from "./lib/campaigns";
import { encryptionKeyProblem } from "./lib/origins";
import { mountMcp } from "./mcp/server";
import { mountOauth } from "./oauth/routes";
import { adminOauth } from "./routes/admin-oauth";
import { adminTokens } from "./routes/admin-tokens";
import { adminMcp } from "./routes/admin-mcp";
import { notificationJobHandlers } from "./lib/notify";
import { log } from "./lib/log";
import { getAdapter, isIntegrationEnabled } from "./lib/integrations";

registerJobHandlers(notificationJobHandlers);
registerJobHandlers({ [TRACK_JOB]: trackShipmentsHandler, [QUESTION_SCAN_JOB]: questionScanHandler, [QUESTION_NOTIFY_JOB]: questionNotifyHandler });
registerJobHandlers({ "campaign.send": campaignSendJob });
export const app = new Hono<AppEnv>();
app.use("*", baseMiddleware);
app.use("/api/*", corsMiddleware);
// Machine endpoints and the admin SPA must never be indexed (media stays indexable for image search).
app.use("*", async (c, next) => {
  await next();
  const p = c.req.path;
  if (p.startsWith("/api/") || p === "/admin" || p.startsWith("/admin/") || p.startsWith("/mock/") || p.startsWith("/webhooks/")) {
    if (!c.res.headers.has("X-Robots-Tag")) { c.res = new Response(c.res.body, c.res); c.res.headers.set("X-Robots-Tag", "noindex"); }
  }
});

const admin = new Hono<AppEnv>();
admin.use("*", adminGuard);
// Operator actions (issue invoice, Trendyol sync, campaign send, "check now" …) queue jobs; run them now instead of at the next 15-minute tick.
admin.use("*", async (c, next) => {
  await next();
  if (c.req.method === "GET" || c.res.status >= 400 || c.env.INLINE_OUTBOX === "false") return;
  try { c.executionCtx.waitUntil(runOutbox(c.env, { limit: 10 }).catch((e) => log("warn", "inline outbox failed", { error: String(e) }))); } catch { /* no execution context (tests) */ }
});
admin.route("/", adminAuth);
admin.route("/", mockAdmin); // before adminSettings: owner-only PUT /settings/system wins over the generic group route
admin.route("/", adminSettings);
admin.route("/", adminCatalog);
admin.route("/", adminSeo);
admin.route("/", adminOrders);
admin.route("/", adminData);
admin.route("/", adminNotifications);
admin.route("/", adminManualInvoices);
admin.route("/", adminManualShipments);
admin.route("/", adminEmails);
admin.route("/", adminTrendyol);
admin.route("/", adminTrendyolSync);
admin.route("/", adminTrendyolDraft);
admin.route("/", adminGeliver);
admin.route("/", adminEfaturam);
admin.route("/", adminCampaigns);
admin.route("/", adminTokens);
admin.route("/", adminMcp);
admin.route("/", adminOauth);
admin.route("/media", adminMedia);
admin.route("/", adminHelp);
app.route("/api/admin", admin);
mountOauth(app); // OAuth 2.1 for MCP clients: /.well-known/*, /oauth/register|authorize|token|revoke (+ CORS for /mcp)
mountMcp(app); // MCP over Streamable HTTP at /mcp (Bearer: OAuth access token or personal access token)
app.route("/api/store/payment/callback", paymentCallback);
app.route("/api/store", store);
app.route("/webhooks", webhooks);
app.route("/mock", mockRoutes); // 404 unless system.mockMode
app.route("/media", mediaPublic);
app.route("/img", imgProxy); // product photos hosted on the marketplace CDN, served via our own domain
app.route("/", unsubscribeRoutes);
app.route("/", publicRoutes);
app.route("/", siteRoutes);
app.route("/", storefrontRoutes);
/** Deployment self-check (no secrets, no customer data). The launch page calls it cross-origin to tell a new owner what is still missing. */
app.get("/health", async (c) => {
  let setup: "needed" | "done" | "unknown" = "unknown"; let dbOk = true;
  try { setup = (await c.env.DB.prepare("SELECT 1 AS x FROM admins LIMIT 1").first()) ? "done" : "needed"; } catch { dbOk = false; }
  const key = encryptionKeyProblem(c.env);
  c.header("Access-Control-Allow-Origin", "*"); c.header("Cache-Control", "no-store");
  return c.json({
    ok: dbOk, db: dbOk ? "ok" : "error (migrations not applied?)", setup,
    encryptionKey: key === null ? "ok" : c.env.APP_ENCRYPTION_KEY?.trim() ? "invalid" : "missing",
    setupToken: c.env.SETUP_TOKEN?.trim() ? "set" : "missing",
  });
});

app.notFound((c) => storefrontNotFound(c) ?? c.json({ error: { code: "not_found", message: "Route not found" } }, 404));
app.onError((err, c) => {
  if (err instanceof ApiError) {
    for (const [k, v] of Object.entries(err.headers ?? {})) c.header(k, v);
    return c.json({ error: { code: err.code, message: err.message, ...(err.details !== undefined ? { details: err.details } : {}) } }, err.status as 400);
  }
  if (err instanceof ZodError) return c.json({ error: { code: "validation_error", message: "Invalid request", details: zodDetails(err) } }, 400);
  if (err instanceof HTTPException) return c.json({ error: { code: "http_error", message: err.message } }, err.status);
  log("error", "unhandled error", { path: c.req.path.replace(/^(\/mcp\/).+$/, "$1<token>"), requestId: c.get("requestId"), error: err instanceof Error ? err.message : String(err) });
  return c.json({ error: { code: "internal_error", message: "Internal server error", requestId: c.get("requestId") } }, 500);
});

/** Cron (every minute): outbox, reservation expiry, periodic housekeeping, marketplace reconcile. */
/**
 * Cron schedule. Wrangler fires every 15 minutes (minutes 0/15/30/45, UTC); everything runs in that tick, hourly work only on the full hour:
 *   15 min  expired stock reservations released (unpaid orders cancelled)
 *   15 min  Trendyol order import (marketplace sales take stock)       — the Trendyol webhook only queues it, it runs in the next tick
 *   15 min  Trendyol stock push sweep (catches any drift)
 *   15 min  job queue: e-mails/SMS, labels, tracking, marketplace pushes …
 *   hourly  housekeeping; Trendyol followed-product refresh, listing approval check, unanswered-question reminder; Geliver tracking
 *   6-hourly  Trendyol missing-product scan (dry-run import; result on the dashboard)
 * Jobs started by an operator in the admin panel do not wait for the tick (see the admin router).
 * Invoices are never issued by cron: staff cut them with the "Issue invoice" button.
 */
const OUTBOX_BUDGET_MS = 25_000;
export async function runScheduled(env: Env, now = new Date()) {
  const db = drizzle(env.DB, { schema });
  const out: Record<string, unknown> = {};
  const minute = Math.floor(now.getTime() / 60000);
  const q = Math.floor(minute / 15), h = Math.floor(minute / 60);
  const quarter = minute % 15 === 0, hour = minute % 60 === 0;
  if (!quarter) return out; // manual/off-schedule invocation: nothing is due
  try { out.reservations = await expireReservations(db, now); } catch (e) { log("error", "expireReservations failed", { error: String(e) }); }
  try {
    const ty = await getAdapter(env, db, "trendyol");
    if (ty) {
      await enqueueJob(db, { kind: "trendyol.reconcile_orders", payload: {}, dedupeKey: `trendyol.reconcile_orders:${q}` }, now);
      // Safety net: whatever changed stock (sale, refund, cancel, reservation, manual edit), drifted listings are pushed within 15 minutes.
      await enqueueJob(db, { kind: "trendyol.stock_push", payload: { stockOnly: true }, dedupeKey: `trendyol.stock_push:sweep:${q}` }, now);
      if (hour) {
        // Unanswered customer questions: admin e-mail when new and again 6 hours before Trendyol's 24-hour answer limit.
        await enqueueQuestionScan(db, now);
        // Listings waiting for a product to be created/approved on Trendyol are re-checked hourly (then stock starts flowing).
        await enqueueJob(db, { kind: "trendyol.verify_listings", payload: {}, dedupeKey: `trendyol.verify_listings:cron:${h}` }, now);
        // Products whose content or price follows Trendyol are refreshed hourly.
        if (await hasFollowedProducts(db)) await enqueueJob(db, { kind: "trendyol.pull_products", payload: {}, dedupeKey: `trendyol.pull_products:cron:${h}:first` }, now);
        // Every 6 hours: dry-run scan of the whole Trendyol catalog; products missing on the website show up on the dashboard.
        if (h % 6 === 0) await enqueueImport(db, { createMissing: true, dryRun: true, runId: `scan-${h}` }, now);
      }
    }
  } catch (e) { log("warn", "trendyol reconcile enqueue failed", { error: String(e) }); }
  // Geliver tracking sweep: moves website orders to shipped/delivered even when the webhook is not registered or a delivery was missed.
  if (hour) {
    try { if (await isIntegrationEnabled(env, db, "geliver")) await enqueueJob(db, { kind: TRACK_JOB, payload: {}, dedupeKey: `${TRACK_JOB}:cron:${h}` }, now); }
    catch (e) { log("warn", "geliver tracking enqueue failed", { error: String(e) }); }
  }
  // The queue only runs every 15 minutes, so drain it: keep claiming (chained jobs such as campaign batches included) within a time budget.
  try {
    const started = Date.now(); const total = { claimed: 0, done: 0, failed: 0, dead: 0 };
    for (let round = 0; round < 10 && Date.now() - started < OUTBOX_BUDGET_MS; round++) {
      const r = await runOutbox(env, { now: round === 0 ? now : new Date(now.getTime() + (Date.now() - started)), limit: 50 });
      for (const k of Object.keys(total) as (keyof typeof total)[]) total[k] += r[k];
      if (r.claimed === 0) break;
    }
    out.outbox = total;
  } catch (e) { log("error", "outbox failed", { error: String(e) }); }
  if (hour) {
    const t = Math.floor(now.getTime() / 1000);
    await env.DB.batch([
      env.DB.prepare("DELETE FROM rate_limits WHERE window_start < ?1").bind(t - 86400),
      env.DB.prepare("DELETE FROM login_attempts WHERE at < ?1").bind(t - 7 * 86400),
      env.DB.prepare("DELETE FROM admin_sessions WHERE expires_at < ?1").bind(t),
      env.DB.prepare("DELETE FROM oauth_codes WHERE expires_at < ?1 - 86400").bind(t),
      env.DB.prepare("DELETE FROM oauth_grants WHERE (revoked_at IS NOT NULL AND revoked_at < ?1 - 30 * 86400) OR refresh_expires_at < ?1 - 30 * 86400").bind(t),
      env.DB.prepare("DELETE FROM oauth_clients WHERE kind = 'dynamic' AND last_used_at IS NULL AND created_at < ?1 - 7 * 86400").bind(t),
      env.DB.prepare("DELETE FROM api_tokens WHERE (expires_at IS NOT NULL AND expires_at < ?1 - 30 * 86400) OR (revoked_at IS NOT NULL AND revoked_at < ?1 - 30 * 86400)").bind(t),
      env.DB.prepare("DELETE FROM carts WHERE updated_at < ?1 AND id NOT IN (SELECT cart_id FROM inventory_reservations WHERE cart_id IS NOT NULL AND status = 'active')").bind(t - 30 * 86400),
      env.DB.prepare("DELETE FROM outbox_jobs WHERE status = 'done' AND updated_at < ?1").bind(t - 14 * 86400),
      // mock inbox holds full recipients/bodies: keep it short-lived (7 days) and bounded (2000 rows)
      env.DB.prepare("DELETE FROM mock_messages WHERE created_at < ?1").bind(t - 7 * 86400),
      env.DB.prepare("DELETE FROM mock_messages WHERE id <= (SELECT MAX(id) FROM mock_messages) - 2000"),
      // Trendyol API console history: 30 days / 2000 rows (mock_state is intentionally left alone)
      env.DB.prepare("DELETE FROM trendyol_calls WHERE created_at < ?1").bind(t - 30 * 86400),
      env.DB.prepare("DELETE FROM trendyol_calls WHERE id <= (SELECT MAX(id) FROM trendyol_calls) - 2000"),
    ]).catch((e) => log("warn", "housekeeping failed", { error: String(e) }));
  }
  return out;
}

export default {
  fetch: app.fetch,
  scheduled(ev: ScheduledController, env: Env, ctx: ExecutionContext) { ctx.waitUntil(runScheduled(env, new Date(ev.scheduledTime))); },
} satisfies ExportedHandler<Env>;

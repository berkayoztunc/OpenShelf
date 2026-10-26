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
import { adminNotifications } from "./routes/notifications";
import { adminManualInvoices } from "./routes/manual-invoices";
import { adminEmails } from "./routes/admin-emails";
import { adminTrendyol } from "./routes/admin-trendyol";
import { notificationJobHandlers } from "./lib/notify";
import { log } from "./lib/log";
import { getAdapter } from "./lib/integrations";

registerJobHandlers(notificationJobHandlers);
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
admin.route("/", adminAuth);
admin.route("/", mockAdmin); // before adminSettings: owner-only PUT /settings/system wins over the generic group route
admin.route("/", adminSettings);
admin.route("/", adminCatalog);
admin.route("/", adminSeo);
admin.route("/", adminOrders);
admin.route("/", adminData);
admin.route("/", adminNotifications);
admin.route("/", adminManualInvoices);
admin.route("/", adminEmails);
admin.route("/", adminTrendyol);
admin.route("/media", adminMedia);
app.route("/api/admin", admin);
app.route("/api/store/payment/callback", paymentCallback);
app.route("/api/store", store);
app.route("/webhooks", webhooks);
app.route("/mock", mockRoutes); // 404 unless system.mockMode
app.route("/media", mediaPublic);
app.route("/", publicRoutes);
app.route("/", siteRoutes);
app.route("/", storefrontRoutes);
app.get("/health", (c) => c.json({ ok: true }));

app.notFound((c) => storefrontNotFound(c) ?? c.json({ error: { code: "not_found", message: "Route not found" } }, 404));
app.onError((err, c) => {
  if (err instanceof ApiError) {
    for (const [k, v] of Object.entries(err.headers ?? {})) c.header(k, v);
    return c.json({ error: { code: err.code, message: err.message, ...(err.details !== undefined ? { details: err.details } : {}) } }, err.status as 400);
  }
  if (err instanceof ZodError) return c.json({ error: { code: "validation_error", message: "Invalid request", details: zodDetails(err) } }, 400);
  if (err instanceof HTTPException) return c.json({ error: { code: "http_error", message: err.message } }, err.status);
  log("error", "unhandled error", { path: c.req.path, requestId: c.get("requestId"), error: err instanceof Error ? err.message : String(err) });
  return c.json({ error: { code: "internal_error", message: "Internal server error", requestId: c.get("requestId") } }, 500);
});

/** Cron (every minute): outbox, reservation expiry, periodic housekeeping, marketplace reconcile. */
export async function runScheduled(env: Env, now = new Date()) {
  const db = drizzle(env.DB, { schema });
  const out: Record<string, unknown> = {};
  try { out.reservations = await expireReservations(db, now); } catch (e) { log("error", "expireReservations failed", { error: String(e) }); }
  const minute = Math.floor(now.getTime() / 60000);
  try {
    if (await getAdapter(env, db, "trendyol")) await enqueueJob(db, { kind: "trendyol.reconcile_orders", payload: {}, dedupeKey: `trendyol.reconcile_orders:${Math.floor(minute / 5)}` }, now);
  } catch (e) { log("warn", "trendyol reconcile enqueue failed", { error: String(e) }); }
  try { out.outbox = await runOutbox(env, { now, limit: 20 }); } catch (e) { log("error", "outbox failed", { error: String(e) }); }
  if (minute % 60 === 0) {
    const t = Math.floor(now.getTime() / 1000);
    await env.DB.batch([
      env.DB.prepare("DELETE FROM rate_limits WHERE window_start < ?1").bind(t - 86400),
      env.DB.prepare("DELETE FROM login_attempts WHERE at < ?1").bind(t - 7 * 86400),
      env.DB.prepare("DELETE FROM admin_sessions WHERE expires_at < ?1").bind(t),
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
  scheduled(_ev: ScheduledController, env: Env, ctx: ExecutionContext) { ctx.waitUntil(runScheduled(env)); },
} satisfies ExportedHandler<Env>;

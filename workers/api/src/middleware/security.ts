import type { MiddlewareHandler } from "hono";
import { cors } from "hono/cors";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "@openshelf/db";
import type { AppEnv } from "../env";
import { ApiError } from "../lib/http";
import { derivedOnWorkersDev, encryptionKeyProblem, warnDerivedOrigins, withDerivedOrigins } from "../lib/origins";

/** Setup + login need APP_ENCRYPTION_KEY (MFA secrets / integration credentials): refuse early with a friendly error. */
const KEY_GUARDED = new Set(["/api/admin/setup", "/api/admin/auth/login"]);

export const baseMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (derivedOnWorkersDev(c.env, c.req.url)) { c.set("derivedWorkersDev", true); warnDerivedOrigins(c.req.url); }
  c.env = withDerivedOrigins(c.env, c.req.url); // unset ORIGIN vars -> request origin (single-Worker deployment)
  c.set("requestId", crypto.randomUUID());
  c.set("ip", c.req.header("CF-Connecting-IP") ?? c.req.header("X-Forwarded-For")?.split(",")[0]?.trim() ?? "unknown");
  c.set("db", drizzle(c.env.DB, { schema }));
  if (c.req.method === "POST" && KEY_GUARDED.has(c.req.path)) {
    const problem = encryptionKeyProblem(c.env);
    if (problem) return c.json({ error: { code: "misconfigured", message: problem } }, 503);
  }
  await next();
  // Responses proxied from static assets (/admin/*) have immutable headers: copy before adding security headers.
  if (c.req.path === "/admin" || c.req.path.startsWith("/admin/")) c.res = new Response(c.res.body, c.res);
  const h = c.res.headers;
  const set = (k: string, v: string) => { if (!h.has(k)) h.set(k, v); };
  set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
  set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  set("X-Content-Type-Options", "nosniff");
  set("Referrer-Policy", "no-referrer");
  set("X-Frame-Options", "DENY");
  set("Cross-Origin-Resource-Policy", "same-site");
  set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  set("X-Request-Id", c.get("requestId"));
  if (c.req.path.startsWith("/api/") || c.req.path.startsWith("/webhooks/")) set("Cache-Control", "no-store");
};

/** CORS restricted to the configured admin + storefront origins. */
export const corsMiddleware: MiddlewareHandler<AppEnv> = (c, next) => {
  const allowed = [c.env.ADMIN_ORIGIN, c.env.STOREFRONT_ORIGIN].filter(Boolean);
  return cors({
    origin: (origin) => (allowed.includes(origin) ? origin : null),
    allowHeaders: ["Content-Type", "X-CSRF-Token", "X-Cart-Id"],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true, maxAge: 600,
  })(c, next);
};

/** D1 fixed-window counter. Atomic upsert; returns the new count. */
export async function hit(db: D1Database, key: string, windowSec: number, now = Date.now()): Promise<{ count: number; resetIn: number }> {
  const t = Math.floor(now / 1000);
  const row = await db.prepare(
    `INSERT INTO rate_limits (key, count, window_start) VALUES (?1, 1, ?2)
     ON CONFLICT(key) DO UPDATE SET
       count = CASE WHEN window_start <= ?2 - ?3 THEN 1 ELSE count + 1 END,
       window_start = CASE WHEN window_start <= ?2 - ?3 THEN ?2 ELSE window_start END
     RETURNING count, window_start`).bind(key, t, windowSec).first<{ count: number; window_start: number }>();
  return { count: row?.count ?? 1, resetIn: Math.max(1, windowSec - (t - (row?.window_start ?? t))) };
}
export async function enforceRateLimit(c: { env: { DB: D1Database }; get(k: "ip"): string }, name: string, limit: number, windowSec: number, extraKey = "") {
  const r = await hit(c.env.DB, `${name}:${c.get("ip")}${extraKey ? ":" + extraKey : ""}`, windowSec);
  if (r.count > limit) throw new ApiError(429, "rate_limited", "Too many requests, slow down", undefined, { "Retry-After": String(r.resetIn) });
}
export const rateLimited = (name: string, limit: number, windowSec: number): MiddlewareHandler<AppEnv> => async (c, next) => {
  await enforceRateLimit(c, name, limit, windowSec);
  await next();
};

/** Cloudflare Turnstile server-side verification. No-op (true) when TURNSTILE_SECRET is not configured. */
export async function verifyTurnstile(secret: string | undefined, token: string | undefined, ip: string): Promise<boolean> {
  if (!secret) return true;
  if (!token) return false;
  try {
    const form = new FormData(); form.set("secret", secret); form.set("response", token); if (ip !== "unknown") form.set("remoteip", ip);
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form });
    return ((await r.json()) as { success?: boolean }).success === true;
  } catch { return false; }
}

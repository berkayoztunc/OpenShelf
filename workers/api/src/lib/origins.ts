import type { Env } from "../env";

/**
 * Single-Worker deployment: storefront, admin and API share one origin, so STOREFRONT_ORIGIN / ADMIN_ORIGIN / API_ORIGIN
 * default to the origin of the incoming request when unset or empty. Explicitly configured values are kept as-is
 * (strict allowlist behaviour for split-domain setups).
 */
export function withDerivedOrigins(env: Env, requestUrl: string): Env {
  if (env.STOREFRONT_ORIGIN && env.ADMIN_ORIGIN && env.API_ORIGIN) return env;
  const origin = new URL(requestUrl).origin;
  return {
    ...env,
    STOREFRONT_ORIGIN: env.STOREFRONT_ORIGIN || origin,
    ADMIN_ORIGIN: env.ADMIN_ORIGIN || origin,
    API_ORIGIN: env.API_ORIGIN || origin,
  };
}

/** True when at least one origin var is unset (so derived from the request) and the request host is a *.workers.dev subdomain. */
export function derivedOnWorkersDev(env: Pick<Env, "STOREFRONT_ORIGIN" | "ADMIN_ORIGIN" | "API_ORIGIN">, requestUrl: string): boolean {
  if (env.STOREFRONT_ORIGIN && env.ADMIN_ORIGIN && env.API_ORIGIN) return false;
  return /\.workers\.dev$/i.test(new URL(requestUrl).hostname);
}
let warnedDerived = false;
/** One log line per isolate. */
export function warnDerivedOrigins(requestUrl: string): void {
  if (warnedDerived) return;
  warnedDerived = true;
  console.warn(JSON.stringify({ level: "warn", msg: "Running with derived origins on a workers.dev host: pin STOREFRONT_ORIGIN/ADMIN_ORIGIN/API_ORIGIN or attach a custom domain", host: new URL(requestUrl).hostname }));
}

/** Returns a human-readable problem if APP_ENCRYPTION_KEY is absent or not base64 of exactly 32 bytes, else null. */
export function encryptionKeyProblem(env: Pick<Env, "APP_ENCRYPTION_KEY">): string | null {
  const raw = env.APP_ENCRYPTION_KEY?.trim();
  if (!raw) return "APP_ENCRYPTION_KEY is not set. Add it as a Worker secret (generate with: openssl rand -base64 32), then retry.";
  try {
    const bin = atob(raw);
    if (bin.length === 32) return null;
  } catch { /* fall through */ }
  return "APP_ENCRYPTION_KEY is invalid: it must be base64 of exactly 32 random bytes (generate with: openssl rand -base64 32).";
}

const ORIGIN_KEY = "_runtime_origin";
let rememberedOrigin = "";
/**
 * Background jobs (cron outbox) have no request, so unset *_ORIGIN vars cannot be derived there. An authenticated admin
 * request records its origin (never an anonymous Host header: it ends up in customer emails/SMS links).
 */
export async function rememberOrigin(d1: D1Database, requestUrl: string, adminOrigin?: string): Promise<void> {
  const origin = new URL(requestUrl).origin;
  if (adminOrigin !== undefined && origin !== adminOrigin) return; // only the configured/derived admin origin is ever recorded
  if (origin === rememberedOrigin) return;
  await d1.prepare(`INSERT INTO store_settings ("group", value, updated_at) VALUES (?1, ?2, ?3) ON CONFLICT("group") DO UPDATE SET value = ?2, updated_at = ?3`)
    .bind(ORIGIN_KEY, JSON.stringify(origin), Math.floor(Date.now() / 1000)).run();
  rememberedOrigin = origin;
}
/** Test helper: forget the per-isolate cache. */
export const resetRememberedOrigin = () => { rememberedOrigin = ""; };
export async function recallOrigin(d1: D1Database): Promise<string> {
  const row = await d1.prepare(`SELECT value FROM store_settings WHERE "group" = ?1`).bind(ORIGIN_KEY).first<{ value: string }>();
  try { const v = row ? JSON.parse(row.value) : ""; return typeof v === "string" ? v : ""; } catch { return ""; }
}

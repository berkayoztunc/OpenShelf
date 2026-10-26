import type { MiddlewareHandler } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { eq } from "drizzle-orm";
import { admins, adminSessions } from "@openshelf/db";
import type { Role } from "@openshelf/shared";
import type { AppEnv, Env } from "../env";
import { ApiError, forbidden, unauthorized } from "../lib/http";
import { rememberOrigin } from "../lib/origins";
import { randomToken, sha256Hex, timingSafeEqual } from "../lib/crypto";

export const SESSION_COOKIE = "os_session"; // stored as __Host-os_session
export const IDLE_TIMEOUT_SEC = 2 * 60 * 60;
export const ABSOLUTE_TIMEOUT_SEC = 12 * 60 * 60;
const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const PUBLIC_ADMIN_PATHS = new Set(["/api/admin/setup/status", "/api/admin/setup", "/api/admin/auth/login"]);
const RANK: Record<Role, number> = { staff: 1, admin: 2, owner: 3 };

export function originAllowed(env: Env, origin: string | undefined) {
  return !!origin && origin === env.ADMIN_ORIGIN;
}

export async function createSession(c: Parameters<MiddlewareHandler<AppEnv>>[0], adminId: string, mfaVerified: boolean) {
  const token = randomToken(32);
  const csrf = randomToken(24);
  const now = Date.now();
  await c.get("db").insert(adminSessions).values({
    tokenHash: await sha256Hex(token), adminId, csrfToken: csrf, mfaVerified, ip: c.get("ip"),
    userAgent: (c.req.header("User-Agent") ?? "").slice(0, 200), createdAt: new Date(now), lastSeenAt: new Date(now),
    expiresAt: new Date(now + ABSOLUTE_TIMEOUT_SEC * 1000),
  });
  setCookie(c, SESSION_COOKIE, token, { prefix: "host", httpOnly: true, secure: true, sameSite: "Lax", path: "/", maxAge: ABSOLUTE_TIMEOUT_SEC });
  return { token, csrf };
}
export const clearSessionCookie = (c: Parameters<MiddlewareHandler<AppEnv>>[0]) => deleteCookie(c, SESSION_COOKIE, { prefix: "host", secure: true, path: "/" });

/** Origin check (all admin mutations) + session auth + CSRF token (authenticated mutations). */
export const adminGuard: MiddlewareHandler<AppEnv> = async (c, next) => {
  const mutating = MUTATING.has(c.req.method);
  if (mutating && !originAllowed(c.env, c.req.header("Origin"))) throw forbidden("Origin not allowed");
  if (PUBLIC_ADMIN_PATHS.has(c.req.path)) return next();

  const token = getCookie(c, SESSION_COOKIE, "host");
  if (!token) throw unauthorized();
  const db = c.get("db");
  const hash = await sha256Hex(token);
  const [row] = await db.select({ s: adminSessions, a: admins }).from(adminSessions).innerJoin(admins, eq(admins.id, adminSessions.adminId)).where(eq(adminSessions.tokenHash, hash)).limit(1);
  const now = Date.now();
  if (!row || row.a.disabled || row.s.expiresAt.getTime() <= now || row.s.lastSeenAt.getTime() + IDLE_TIMEOUT_SEC * 1000 <= now || !row.s.mfaVerified) {
    if (row) await db.delete(adminSessions).where(eq(adminSessions.tokenHash, hash));
    clearSessionCookie(c);
    throw unauthorized("Session expired");
  }
  if (mutating) {
    const sent = c.req.header("X-CSRF-Token") ?? "";
    if (!sent || !timingSafeEqual(sent, row.s.csrfToken)) throw forbidden("Invalid CSRF token");
  }
  if (now - row.s.lastSeenAt.getTime() > 60_000) await db.update(adminSessions).set({ lastSeenAt: new Date(now) }).where(eq(adminSessions.tokenHash, hash));
  c.set("admin", { id: row.a.id, email: row.a.email, name: row.a.name, role: row.a.role as Role, totpEnabled: row.a.totpEnabled, sessionHash: hash, csrfToken: row.s.csrfToken });
  // Cron jobs have no request: remember the admin origin for customer links. Only after full admin auth (session + MFA + CSRF for
  // mutations), only for admin/owner roles, and only when this request's origin IS the configured/derived ADMIN origin.
  if (row.a.role !== "staff" && (!mutating || originAllowed(c.env, c.req.header("Origin")))) await rememberOrigin(c.env.DB, c.req.url, c.env.ADMIN_ORIGIN).catch(() => {});
  await next();
};

/** RBAC: minimum role (owner > admin > staff). */
export const requireRole = (min: Role): MiddlewareHandler<AppEnv> => async (c, next) => {
  const a = c.get("admin");
  if (!a) throw unauthorized();
  if (RANK[a.role] < RANK[min]) throw new ApiError(403, "forbidden", "Insufficient role");
  await next();
};

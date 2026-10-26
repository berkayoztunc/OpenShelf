import { Hono } from "hono";
import type { Context } from "hono";
import { and, desc, eq, gte, ne, sql } from "drizzle-orm";
import { admins, adminSessions, loginAttempts, setupTokens } from "@openshelf/db";
import { LoginBody, MfaDisableBody, MfaEnableBody, PasswordChangeBody, SetupBody, UserCreateBody, UserPatchBody, type AdminPublic } from "@openshelf/shared";
import type { AppEnv } from "../env";
import { ApiError, body, forbidden, notFound, unauthorized } from "../lib/http";
import { audit } from "../lib/audit";
import { clearSessionCookie, createSession, requireRole } from "../middleware/auth";
import { enforceRateLimit, verifyTurnstile } from "../middleware/security";
import { decryptBytes, dummyVerify, encryptBytes, generateTotpSecret, hashPassword, sha256Hex, timingSafeEqual, toBytes, verifyPassword, verifyTotpStep } from "../lib/crypto";

export const LOCKOUT_FAILS = 5;
export const LOCKOUT_WINDOW_SEC = 15 * 60;
/** Looser per-IP ceiling of failed logins (any email) inside the window. */
export const IP_LOCKOUT_FAILS = 20;

/** Owner/admin roles must enroll TOTP; staff may opt in. */
const mfaEnrollmentRequired = (a: { role: string; totpEnabled: boolean }) => (a.role === "owner" || a.role === "admin") && !a.totpEnabled;
/** Atomically record a TOTP step; false if it was already used (or an older step). */
async function consumeTotpStep(c: Context<AppEnv>, adminId: string, step: number) {
  const r = await c.env.DB.prepare("UPDATE admins SET last_totp_step = ?2 WHERE id = ?1 AND (last_totp_step IS NULL OR last_totp_step < ?2)").bind(adminId, step).run();
  return r.meta.changes > 0;
}

const pub = (a: typeof admins.$inferSelect): AdminPublic => ({ id: a.id, email: a.email, name: a.name, role: a.role as AdminPublic["role"], totpEnabled: a.totpEnabled, mfaEnrollmentRequired: mfaEnrollmentRequired(a) });
const aadTotp = (id: string) => `totp:${id}`;

export const adminAuth = new Hono<AppEnv>();

adminAuth.get("/setup/status", async (c) => {
  const [r] = await c.get("db").select({ n: sql<number>`count(*)` }).from(admins);
  return c.json({ needsSetup: (r?.n ?? 0) === 0 });
});

adminAuth.post("/setup", async (c) => {
  await enforceRateLimit(c, "setup", 5, 900);
  const b = await body(c, SetupBody);
  const db = c.get("db");
  const expected = c.env.SETUP_TOKEN;
  if (!expected) throw new ApiError(503, "setup_disabled", "SETUP_TOKEN is not configured");
  const [existing] = await db.select({ n: sql<number>`count(*)` }).from(admins);
  if ((existing?.n ?? 0) > 0) throw new ApiError(409, "setup_locked", "Setup already completed");
  if (!timingSafeEqual(await sha256Hex(b.setupToken), await sha256Hex(expected))) throw new ApiError(403, "invalid_setup_token", "Invalid setup token");
  const id = crypto.randomUUID();
  const passwordHash = await hashPassword(b.password);
  // Insert only if no admin exists: race-safe single statement.
  const res = await c.env.DB.prepare(
    `INSERT INTO admins (id, email, name, role, password_hash, totp_enabled, disabled, created_at)
     SELECT ?1, ?2, ?3, 'owner', ?4, 0, 0, unixepoch() WHERE NOT EXISTS (SELECT 1 FROM admins)`)
    .bind(id, b.email.toLowerCase(), b.name, passwordHash).run();
  if (!res.meta.changes) throw new ApiError(409, "setup_locked", "Setup already completed");
  await db.insert(setupTokens).values({ tokenHash: await sha256Hex(b.setupToken), usedAt: new Date() }).onConflictDoNothing();
  await audit(c, "setup.complete", "admin", id, { email: b.email }, id);
  return c.json({ ok: true }, 201);
});

adminAuth.post("/auth/login", async (c) => {
  const ip = c.get("ip");
  await enforceRateLimit(c, "login", 20, 900);
  const b = await body(c, LoginBody);
  const email = b.email.toLowerCase();
  const db = c.get("db");
  const since = new Date(Date.now() - LOCKOUT_WINDOW_SEC * 1000);
  const failed = (col: typeof loginAttempts.email | typeof loginAttempts.ip, v: string) => and(eq(col, v), eq(loginAttempts.success, false), gte(loginAttempts.at, since));
  // Lockout is keyed on email+IP so a remote attacker cannot lock the real owner out from their own IP.
  const [byPair] = await db.select({ n: sql<number>`count(*)` }).from(loginAttempts).where(and(failed(loginAttempts.email, email), eq(loginAttempts.ip, ip)));
  const [byEmail] = await db.select({ n: sql<number>`count(*)` }).from(loginAttempts).where(failed(loginAttempts.email, email));
  const [byIp] = await db.select({ n: sql<number>`count(*)` }).from(loginAttempts).where(failed(loginAttempts.ip, ip));
  const lockedHeaders = { "Retry-After": String(LOCKOUT_WINDOW_SEC) };
  if ((byPair?.n ?? 0) >= LOCKOUT_FAILS) throw new ApiError(429, "account_locked", "Too many failed attempts. Try again later.", undefined, lockedHeaders);
  if ((byIp?.n ?? 0) >= IP_LOCKOUT_FAILS) throw new ApiError(429, "account_locked", "Too many failed attempts. Try again later.", undefined, lockedHeaders);
  // Distributed guessing against one email: demand a captcha (never a hard lock for everyone).
  if (((byIp?.n ?? 0) >= 3 || (byEmail?.n ?? 0) >= LOCKOUT_FAILS) && !(await verifyTurnstile(c.env.TURNSTILE_SECRET, b.turnstileToken, ip))) {
    throw new ApiError(403, "turnstile_required", "Captcha verification required");
  }
  const fail = async () => { await db.insert(loginAttempts).values({ email, ip, success: false }); throw unauthorized("Invalid credentials"); };

  const [a] = await db.select().from(admins).where(eq(admins.email, email)).limit(1);
  if (!a) { await dummyVerify(b.password); return fail(); }
  if (!(await verifyPassword(b.password, a.passwordHash)) || a.disabled) return fail();
  let mfaOk = false;
  if (a.totpEnabled) {
    if (!b.totp) return c.json({ mfaRequired: true as const });
    if (!a.totpSecretEnc || !a.totpIv) return fail();
    const secret = new TextDecoder().decode(await decryptBytes(c.env, toBytes(a.totpSecretEnc), toBytes(a.totpIv), 1, aadTotp(a.id)));
    const step = await verifyTotpStep(secret, b.totp);
    if (step === null || !(await consumeTotpStep(c, a.id, step))) return fail(); // wrong, replayed or older code
    mfaOk = true;
  }
  await db.insert(loginAttempts).values({ email, ip, success: true });
  await db.update(admins).set({ lastLoginAt: new Date() }).where(eq(admins.id, a.id));
  const { csrf } = await createSession(c, a.id, mfaOk || !a.totpEnabled);
  await audit(c, "auth.login", "admin", a.id, undefined, a.id);
  return c.json({ admin: pub(a), csrfToken: csrf });
});

adminAuth.get("/auth/me", (c) => {
  const a = c.get("admin")!;
  return c.json({ admin: { id: a.id, email: a.email, name: a.name, role: a.role, totpEnabled: a.totpEnabled, mfaEnrollmentRequired: mfaEnrollmentRequired(a) }, csrfToken: a.csrfToken });
});

adminAuth.post("/auth/logout", async (c) => {
  const a = c.get("admin")!;
  await c.get("db").delete(adminSessions).where(eq(adminSessions.tokenHash, a.sessionHash));
  clearSessionCookie(c);
  return c.body(null, 204);
});
adminAuth.post("/auth/logout-all", async (c) => {
  const a = c.get("admin")!;
  await c.get("db").delete(adminSessions).where(eq(adminSessions.adminId, a.id));
  clearSessionCookie(c);
  await audit(c, "auth.logout_all", "admin", a.id);
  return c.body(null, 204);
});

adminAuth.post("/auth/password", async (c) => {
  const a = c.get("admin")!;
  const b = await body(c, PasswordChangeBody);
  const db = c.get("db");
  const [row] = await db.select().from(admins).where(eq(admins.id, a.id)).limit(1);
  if (!row || !(await verifyPassword(b.current, row.passwordHash))) throw new ApiError(400, "invalid_password", "Current password is incorrect");
  await db.update(admins).set({ passwordHash: await hashPassword(b.next) }).where(eq(admins.id, a.id));
  await db.delete(adminSessions).where(and(eq(adminSessions.adminId, a.id), ne(adminSessions.tokenHash, a.sessionHash)));
  await audit(c, "auth.password_change", "admin", a.id);
  return c.body(null, 204);
});

// ---------- MFA ----------
adminAuth.post("/auth/mfa/setup", async (c) => {
  const a = c.get("admin")!;
  if (a.totpEnabled) throw new ApiError(409, "mfa_already_enabled", "MFA already enabled");
  const secret = generateTotpSecret();
  const e = await encryptBytes(c.env, new TextEncoder().encode(secret), aadTotp(a.id));
  await c.get("db").update(admins).set({ totpSecretEnc: Buffer.from(e.ciphertext), totpIv: Buffer.from(e.iv), totpEnabled: false }).where(eq(admins.id, a.id));
  const issuer = "OpenShelf";
  return c.json({ secret, otpauthUrl: `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(a.email)}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30` });
});
adminAuth.post("/auth/mfa/enable", async (c) => {
  const a = c.get("admin")!;
  const { code } = await body(c, MfaEnableBody);
  const db = c.get("db");
  const [row] = await db.select().from(admins).where(eq(admins.id, a.id)).limit(1);
  if (!row?.totpSecretEnc || !row.totpIv) throw new ApiError(400, "mfa_not_initialized", "Call /mfa/setup first");
  const secret = new TextDecoder().decode(await decryptBytes(c.env, toBytes(row.totpSecretEnc), toBytes(row.totpIv), 1, aadTotp(a.id)));
  const step = await verifyTotpStep(secret, code);
  if (step === null) throw new ApiError(400, "invalid_code", "Invalid code");
  await db.update(admins).set({ totpEnabled: true, lastTotpStep: step }).where(eq(admins.id, a.id));
  await audit(c, "auth.mfa_enable", "admin", a.id);
  return c.body(null, 204);
});
adminAuth.post("/auth/mfa/disable", async (c) => {
  const a = c.get("admin")!;
  const b = await body(c, MfaDisableBody);
  const db = c.get("db");
  const [row] = await db.select().from(admins).where(eq(admins.id, a.id)).limit(1);
  if (!row?.totpEnabled || !row.totpSecretEnc || !row.totpIv) throw new ApiError(400, "mfa_not_enabled", "MFA is not enabled");
  const secret = new TextDecoder().decode(await decryptBytes(c.env, toBytes(row.totpSecretEnc), toBytes(row.totpIv), 1, aadTotp(a.id)));
  const step = await verifyTotpStep(secret, b.code);
  if (!(await verifyPassword(b.password, row.passwordHash)) || step === null || !(await consumeTotpStep(c, a.id, step))) throw new ApiError(400, "invalid_credentials", "Invalid password or code");
  await db.update(admins).set({ totpEnabled: false, totpSecretEnc: null, totpIv: null, lastTotpStep: null }).where(eq(admins.id, a.id));
  await audit(c, "auth.mfa_disable", "admin", a.id);
  return c.body(null, 204);
});

// ---------- users (owner only) ----------
adminAuth.get("/users", requireRole("owner"), async (c) => {
  const rows = await c.get("db").select().from(admins).orderBy(desc(admins.createdAt));
  return c.json({ items: rows.map((r) => ({ ...pub(r), disabled: r.disabled, createdAt: r.createdAt, lastLoginAt: r.lastLoginAt })) });
});
adminAuth.post("/users", requireRole("owner"), async (c) => {
  const b = await body(c, UserCreateBody);
  const db = c.get("db");
  const email = b.email.toLowerCase();
  const [dup] = await db.select({ id: admins.id }).from(admins).where(eq(admins.email, email)).limit(1);
  if (dup) throw new ApiError(409, "email_taken", "Email already in use");
  const id = crypto.randomUUID();
  await db.insert(admins).values({ id, email, name: b.name, role: b.role, passwordHash: await hashPassword(b.password) });
  await audit(c, "user.create", "admin", id, { email, role: b.role });
  return c.json({ id, email, name: b.name, role: b.role, totpEnabled: false }, 201);
});
adminAuth.patch("/users/:id", requireRole("owner"), async (c) => {
  const id = c.req.param("id");
  const b = await body(c, UserPatchBody);
  const me = c.get("admin")!;
  const db = c.get("db");
  const [t] = await db.select().from(admins).where(eq(admins.id, id)).limit(1);
  if (!t) throw notFound("User");
  if (id === me.id && (b.role && b.role !== "owner" || b.disabled)) throw forbidden("You cannot demote or disable yourself");
  if (t.role === "owner" && (b.role && b.role !== "owner" || b.disabled)) await assertOtherOwner(c, id);
  const set: Partial<typeof admins.$inferInsert> = {};
  if (b.name) set.name = b.name;
  if (b.role) set.role = b.role;
  if (b.disabled !== undefined) set.disabled = b.disabled;
  if (b.password) set.passwordHash = await hashPassword(b.password);
  if (Object.keys(set).length) await db.update(admins).set(set).where(eq(admins.id, id));
  if (b.disabled || b.password || b.role) await db.delete(adminSessions).where(eq(adminSessions.adminId, id));
  await audit(c, "user.update", "admin", id, { ...b, password: b.password ? "[set]" : undefined });
  const [u] = await db.select().from(admins).where(eq(admins.id, id)).limit(1);
  return c.json(pub(u!));
});
adminAuth.delete("/users/:id", requireRole("owner"), async (c) => {
  const id = c.req.param("id");
  if (id === c.get("admin")!.id) throw forbidden("You cannot delete yourself");
  const db = c.get("db");
  const [t] = await db.select().from(admins).where(eq(admins.id, id)).limit(1);
  if (!t) throw notFound("User");
  if (t.role === "owner") await assertOtherOwner(c, id);
  await db.delete(admins).where(eq(admins.id, id));
  await audit(c, "user.delete", "admin", id, { email: t.email });
  return c.body(null, 204);
});
async function assertOtherOwner(c: import("hono").Context<AppEnv>, excludeId: string) {
  const [r] = await c.get("db").select({ n: sql<number>`count(*)` }).from(admins).where(and(eq(admins.role, "owner"), eq(admins.disabled, false), ne(admins.id, excludeId)));
  if ((r?.n ?? 0) < 1) throw new ApiError(409, "last_owner", "At least one active owner is required");
}

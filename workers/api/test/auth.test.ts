import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { admin, call, ensureOwner, freshIp, j, loginAs, OWNER } from "./helpers";
import { totpCode, base32Decode } from "../src/lib/crypto";
import { IDLE_TIMEOUT_SEC } from "../src/middleware/auth";

describe("setup", () => {
  it("rejects bad setup token, creates owner once, then locks", async () => {
    const fresh = (await j<any>(await call("/api/admin/setup/status"))).needsSetup as boolean; // false if another test file already ran setup
    const bad = await call("/api/admin/setup", { json: { setupToken: "nope", email: OWNER.email, name: "O", password: OWNER.password }, ip: freshIp() });
    expect(bad.status).toBe(fresh ? 403 : 409);
    if (fresh) {
      const short = await call("/api/admin/setup", { json: { setupToken: env.SETUP_TOKEN, email: OWNER.email, name: "O", password: "short" }, ip: freshIp() });
      expect(short.status).toBe(400);
      const ok = await call("/api/admin/setup", { json: { setupToken: env.SETUP_TOKEN, email: OWNER.email, name: "O", password: OWNER.password }, ip: freshIp() });
      expect(ok.status).toBe(201);
    }
    const again = await call("/api/admin/setup", { json: { setupToken: env.SETUP_TOKEN, email: "x@example.com", name: "O", password: OWNER.password }, ip: freshIp() });
    expect(again.status).toBe(409);
    expect((await j<any>(await call("/api/admin/setup/status"))).needsSetup).toBe(false);
  });
});

describe("auth + CSRF + RBAC", () => {
  it("login sets hardened cookie; stores only a hash of the token", async () => {
    await ensureOwner();
    const r = await call("/api/admin/auth/login", { json: OWNER, ip: freshIp() });
    expect(r.status).toBe(200);
    const sc = r.headers.get("Set-Cookie")!;
    expect(sc).toMatch(/^__Host-os_session=/);
    expect(sc).toMatch(/HttpOnly/i); expect(sc).toMatch(/Secure/i); expect(sc).toMatch(/SameSite=Lax/i); expect(sc).toMatch(/Path=\//);
    const token = sc.split(";")[0]!.split("=")[1]!;
    const rows = await env.DB.prepare("SELECT token_hash FROM admin_sessions").all<{ token_hash: string }>();
    expect(rows.results.some((x) => x.token_hash === token)).toBe(false);
    expect(rows.results.every((x) => /^[0-9a-f]{64}$/.test(x.token_hash))).toBe(true);
  });

  it("security headers present", async () => {
    const r = await call("/health");
    expect(r.headers.get("Content-Security-Policy")).toContain("default-src 'none'");
    expect(r.headers.get("Strict-Transport-Security")).toBeTruthy();
    expect(r.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(r.headers.get("Referrer-Policy")).toBeTruthy();
  });

  it("wrong password -> 401, unauthenticated admin routes -> 401", async () => {
    await ensureOwner();
    expect((await call("/api/admin/auth/login", { json: { email: OWNER.email, password: "wrong-wrong-wrong" }, ip: freshIp() })).status).toBe(401);
    expect((await call("/api/admin/settings")).status).toBe(401);
    expect((await call("/api/admin/orders")).status).toBe(401);
  });

  it("mutations need CSRF token and allowed Origin", async () => {
    const s = await ensureOwner();
    const me = await j<any>(await call("/api/admin/auth/me", { cookie: s.cookie }));
    expect(me.csrfToken).toBe(s.csrf);
    const body = { storeName: "CSRF Store", currency: "TRY" };
    expect((await call("/api/admin/settings/general", { method: "PUT", json: body, cookie: s.cookie, ip: s.ip })).status).toBe(403); // no csrf
    expect((await call("/api/admin/settings/general", { method: "PUT", json: body, cookie: s.cookie, csrf: "wrong", ip: s.ip })).status).toBe(403);
    expect((await call("/api/admin/settings/general", { method: "PUT", json: body, cookie: s.cookie, csrf: s.csrf, origin: "http://evil.test", ip: s.ip })).status).toBe(403);
    expect((await call("/api/admin/settings/general", { method: "PUT", json: body, cookie: s.cookie, csrf: s.csrf, origin: null, ip: s.ip })).status).toBe(403);
    const ok = await call("/api/admin/settings/general", { method: "PUT", json: body, cookie: s.cookie, csrf: s.csrf, ip: s.ip });
    expect(ok.status).toBe(200);
    const cfg = await j<any>(await call("/api/store/config"));
    expect(cfg.general.storeName).toBe("CSRF Store");
    expect(JSON.stringify(cfg)).not.toMatch(/secret/i);
    const logs = await j<any>(await admin(s, "/audit-logs"));
    expect(logs.items.some((l: any) => l.action === "settings.update")).toBe(true);
  });

  it("CORS restricted to configured origins", async () => {
    const good = await call("/api/store/config", { headers: { Origin: "http://shop.test" } });
    expect(good.headers.get("Access-Control-Allow-Origin")).toBe("http://shop.test");
    const bad = await call("/api/store/config", { headers: { Origin: "http://evil.test" } });
    expect(bad.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("RBAC: staff cannot write settings or manage users; owner can", async () => {
    const owner = await ensureOwner();
    const email = `staff-${Date.now()}@example.com`; const pw = "staff password 12345";
    const created = await admin(owner, "/users", "POST", { email, name: "Staff", password: pw, role: "staff" });
    expect(created.status).toBe(201);
    const staff = await loginAs(email, pw);
    expect((await admin(staff, "/orders")).status).toBe(200);
    expect((await admin(staff, "/settings/general", "PUT", { storeName: "Hax" })).status).toBe(403);
    expect((await admin(staff, "/users")).status).toBe(403);
    expect((await admin(staff, "/integrations")).status).toBe(403);
    expect((await admin(owner, "/users")).status).toBe(200);
  });

  it("session expiry: absolute and idle", async () => {
    const s = await ensureOwner();
    expect((await call("/api/admin/auth/me", { cookie: s.cookie })).status).toBe(200);
    await env.DB.prepare("UPDATE admin_sessions SET last_seen_at = unixepoch() - ?1").bind(IDLE_TIMEOUT_SEC + 10).run();
    expect((await call("/api/admin/auth/me", { cookie: s.cookie })).status).toBe(401);
    const s2 = await ensureOwner();
    await env.DB.prepare("UPDATE admin_sessions SET expires_at = unixepoch() - 1").run();
    expect((await call("/api/admin/auth/me", { cookie: s2.cookie })).status).toBe(401);
  });

  it("logout invalidates the session; logout-all kills the rest", async () => {
    const a = await ensureOwner(); const b = await ensureOwner();
    expect((await admin(a, "/auth/logout", "POST")).status).toBe(204);
    expect((await call("/api/admin/auth/me", { cookie: a.cookie })).status).toBe(401);
    expect((await admin(b, "/auth/logout-all", "POST")).status).toBe(204);
    expect((await call("/api/admin/auth/me", { cookie: b.cookie })).status).toBe(401);
  });

  it("TOTP MFA: enable, login requires code, wrong code rejected", async () => {
    const email = `mfa-${Date.now()}@example.com`; const pw = "mfa password 123456";
    const owner = await ensureOwner();
    await admin(owner, "/users", "POST", { email, name: "Mfa", password: pw, role: "admin" });
    const s = await loginAs(email, pw);
    const setup = await j<any>(await admin(s, "/auth/mfa/setup", "POST"));
    expect(setup.otpauthUrl).toContain("otpauth://totp/");
    const stored = await env.DB.prepare("SELECT hex(totp_secret_enc) AS h FROM admins WHERE email = ?1").bind(email).first<{ h: string }>();
    expect(stored!.h.length).toBeGreaterThan(0);
    expect(Buffer.from(stored!.h, "hex").toString("utf8")).not.toContain(setup.secret); // encrypted at rest
    expect((await admin(s, "/auth/mfa/enable", "POST", { code: "000000" })).status).toBe(400);
    const code = await totpCode(setup.secret, Date.now());
    expect((await admin(s, "/auth/mfa/enable", "POST", { code })).status).toBe(204);
    const ip = freshIp();
    const need = await j<any>(await call("/api/admin/auth/login", { json: { email, password: pw }, ip }));
    expect(need.mfaRequired).toBe(true); expect(need.csrfToken).toBeUndefined();
    expect((await call("/api/admin/auth/login", { json: { email, password: pw, totp: "123456" }, ip })).status).toBe(401);
    const okRes = await call("/api/admin/auth/login", { json: { email, password: pw, totp: await totpCode(setup.secret, Date.now(), 1) }, ip });
    expect(okRes.status).toBe(200); // the enable-step code is already consumed, so the next step is used
    void base32Decode;
  });

  it("login lockout is keyed on email+IP: the attacker's IP is locked, the real user's IP is not", async () => {
    const email = `victim-${Date.now()}@example.com`;
    const attacker = freshIp();
    for (let i = 0; i < 5; i++) expect((await call("/api/admin/auth/login", { json: { email, password: "bad-password-1" }, ip: attacker })).status).toBe(401);
    const locked = await call("/api/admin/auth/login", { json: { email, password: "bad-password-1" }, ip: attacker });
    expect(locked.status).toBe(429);
    expect((await j<any>(locked)).error.code).toBe("account_locked");
    // a different IP is not locked out for the same account (no turnstile secret configured in tests)
    expect((await call("/api/admin/auth/login", { json: { email, password: "bad-password-1" }, ip: freshIp() })).status).toBe(401);
    // the real owner can still log in from another IP even while an attacker hammers the owner email
    await ensureOwner();
    const atk2 = freshIp();
    for (let i = 0; i < 5; i++) await call("/api/admin/auth/login", { json: { email: OWNER.email, password: "bad-password-1" }, ip: atk2 });
    expect((await call("/api/admin/auth/login", { json: { email: OWNER.email, password: "bad-password-1" }, ip: atk2 })).status).toBe(429);
    expect((await call("/api/admin/auth/login", { json: { email: OWNER.email, password: OWNER.password }, ip: freshIp() })).status).toBe(200);
  });

  it("IP rate limit returns 429", async () => {
    const email = "x@example.com";
    const ip = freshIp(); let last = 0;
    for (let i = 0; i < 22; i++) last = (await call("/api/admin/auth/login", { json: { email: `u${i}@example.com`, password: "bad-password-1" }, ip })).status;
    expect(last).toBe(429);
  });
});

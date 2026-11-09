import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { RESET_TABLES } from "../src/routes/admin-data";
import { admin, ensureOwner, j, loginAs, OWNER, type Session } from "./helpers";

let owner: Session; let staff: Session;
const KEPT = ["stores", "admins", "admin_sessions", "login_attempts", "rate_limits", "setup_tokens", "audit_logs"];

beforeAll(async () => {
  owner = await ensureOwner();
  const email = `staff-reset-${Date.now()}@example.com`;
  expect((await admin(owner, "/users", "POST", { email, name: "S", password: "staff password 12345", role: "staff" })).status).toBe(201);
  staff = await loginAs(email, "staff password 12345");
});

describe("factory reset guards", () => {
  it("non-owner gets 403", async () => {
    expect((await admin(staff, "/system/reset", "POST", { confirm: "SIFIRLA", password: "x" })).status).toBe(403);
  });
  it("wrong confirmation word or wrong password deletes nothing", async () => {
    await env.DB.prepare("INSERT OR IGNORE INTO coupons (code, type, value, active, used_count, created_at) VALUES ('RESETKEEP','percent',10,1,0,unixepoch())").run().catch(() => {});
    const before = (await env.DB.prepare("SELECT COUNT(*) AS n FROM store_settings").first<{ n: number }>())!.n;
    expect((await admin(owner, "/system/reset", "POST", { confirm: "nope", password: OWNER.password })).status).toBeGreaterThanOrEqual(400);
    const r = await admin(owner, "/system/reset", "POST", { confirm: "SIFIRLA", password: "wrong password" });
    expect(r.status).toBe(400);
    expect((await j<any>(r)).error.code).toBe("invalid_password");
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM store_settings").first<{ n: number }>())!.n).toBe(before);
  });
  it("every table is either wiped or deliberately kept (new tables must be classified)", async () => {
    const rows = (await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'd1_%'").all<{ name: string }>()).results.map((r) => r.name);
    const known = new Set<string>([...RESET_TABLES, ...KEPT]);
    expect(rows.filter((n) => !known.has(n))).toEqual([]);
    for (const t of RESET_TABLES) expect(rows).toContain(t);
  });
  it("owner with password + word wipes data, keeps admins and audit, records the reset", async () => {
    await env.DB.prepare("INSERT INTO orders (id, number, source, status, email, shipping_address, currency, subtotal, total, tracking_token, created_at, updated_at) VALUES ('rs-1','RS-1','website','paid','a@example.invalid','{}','TRY',1,1,'rs-1',unixepoch(),unixepoch())").run();
    const r = await admin(owner, "/system/reset", "POST", { confirm: "SIFIRLA", password: OWNER.password });
    expect(r.status).toBe(200);
    expect((await j<any>(r)).deleted.orders).toBeGreaterThanOrEqual(1);
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM orders").first<{ n: number }>())!.n).toBe(0);
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM admins").first<{ n: number }>())!.n).toBeGreaterThanOrEqual(1);
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE action = 'system.reset'").first<{ n: number }>())!.n).toBe(1);
  });
});

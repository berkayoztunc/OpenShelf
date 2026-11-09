import { env } from "cloudflare:test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runOutbox } from "../src/outbox";
import { clearSettingsCache } from "../src/lib/settings";
import { admin, ensureOwner, j, loginAs, type Session } from "./helpers";

let owner: Session; let staff: Session;
const setMock = (on: boolean) => env.DB.prepare(`INSERT INTO store_settings ("group", value, updated_at) VALUES ('system', ?1, unixepoch()) ON CONFLICT("group") DO UPDATE SET value = ?1`).bind(JSON.stringify({ mockMode: on })).run().then(() => clearSettingsCache());

beforeAll(async () => {
  owner = await ensureOwner();
  const email = `staff-tyimp-${Date.now()}@example.com`;
  expect((await admin(owner, "/users", "POST", { email, name: "S", password: "staff password 12345", role: "staff" })).status).toBe(201);
  staff = await loginAs(email, "staff password 12345");
  await setMock(true);
  await env.DB.exec("DELETE FROM sync_cursors WHERE key = 'trendyol:products:last'");
});
// the DB is shared with other suites: only this file's jobs may be pending when the outbox runs
const clearOutbox = () => env.DB.exec("DELETE FROM outbox_jobs");
afterAll(async () => { await setMock(false); });

describe("POST /trendyol/import (mock mode)", () => {
  it("is owner/admin only", async () => {
    expect((await admin(staff, "/trendyol/import", "POST", {})).status).toBe(403);
    expect((await admin(staff, "/trendyol/import")).status).toBe(403);
  });

  it("queues, runs through the outbox, creates draft products and reports status", async () => {
    expect((await j<any>(await admin(owner, "/trendyol/import"))).status).toBeNull();
    await clearOutbox();
    const r = await admin(owner, "/trendyol/import", "POST", { createMissing: true });
    expect(r.status).toBe(202);
    expect((await j<any>(await admin(owner, "/trendyol/import"))).status.state).toBe("queued");
    // a second start while the first is queued is refused
    expect((await admin(owner, "/trendyol/import", "POST", {})).status).toBe(409);

    const stats = await runOutbox(env as never, { limit: 20 });
    expect(stats.dead).toBe(0);
    const st = (await j<any>(await admin(owner, "/trendyol/import"))).status;
    expect(st).toMatchObject({ state: "done", createMissing: true, dryRun: false });
    expect(st.totals).toMatchObject({ pages: 1, variants: 2, created: 2 });

    const p = await env.DB.prepare("SELECT status, name_tr FROM products WHERE id = 'ty-900001'").first<{ status: string; name_tr: string }>();
    expect(p).toEqual({ status: "draft", name_tr: "Mock Trendyol Tişört" });
    const inv = await env.DB.prepare("SELECT total FROM inventory WHERE variant_id = 'tyv-MOCKTY-1-S'").first<{ total: number }>();
    expect(inv?.total).toBe(12);
    const map = await env.DB.prepare("SELECT COUNT(*) AS n FROM product_mappings WHERE provider = 'trendyol' AND external_id = '900001'").first<{ n: number }>();
    expect(map?.n).toBe(2);
  });

  it("dry run writes nothing", async () => {
    await env.DB.exec("DELETE FROM sync_cursors WHERE key = 'trendyol:products:last'; DELETE FROM product_mappings; DELETE FROM inventory; DELETE FROM product_variants WHERE id LIKE 'tyv-%'; DELETE FROM products WHERE id LIKE 'ty-%';");
    await clearOutbox();
    expect((await admin(owner, "/trendyol/import", "POST", { createMissing: true, dryRun: true })).status).toBe(202);
    await runOutbox(env as never, { limit: 20 });
    const st = (await j<any>(await admin(owner, "/trendyol/import"))).status;
    expect(st).toMatchObject({ state: "done", dryRun: true });
    expect(st.totals.created).toBe(2);
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM products WHERE id LIKE 'ty-%'").first<{ n: number }>())?.n).toBe(0);
  });
});

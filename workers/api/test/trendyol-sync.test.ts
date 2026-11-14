import { env } from "cloudflare:test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "@openshelf/db";
import { importTrendyolOrder } from "@openshelf/integration-trendyol";
import { runOutbox } from "../src/outbox";
import { clearSettingsCache } from "../src/lib/settings";
import { admin, ensureOwner, j, loginAs, type Session } from "./helpers";

let owner: Session; let staff: Session;
const setMock = (on: boolean) => env.DB.prepare(`INSERT INTO store_settings ("group", value, updated_at) VALUES ('system', ?1, unixepoch()) ON CONFLICT("group") DO UPDATE SET value = ?1`).bind(JSON.stringify({ mockMode: on })).run().then(() => clearSettingsCache());
const one = <T,>(q: string, ...b: unknown[]) => env.DB.prepare(q).bind(...b).first<T>();
const P = "sync-p1"; const V1 = "sync-v1"; const V2 = "sync-v2";

beforeAll(async () => {
  owner = await ensureOwner();
  const email = `staff-tysync-${Date.now()}@example.com`;
  expect((await admin(owner, "/users", "POST", { email, name: "S", password: "staff password 12345", role: "staff" })).status).toBe(201);
  staff = await loginAs(email, "staff password 12345");
  await setMock(true);
  // barcodes match the mock Trendyol catalog (MOCKTY-1-S / -M); the second variant of the pair has no barcode
  await env.DB.batch([
    env.DB.prepare("INSERT INTO products (id, slug, name_tr, status) VALUES (?1, 'sync-p1', 'Yerel Tişört', 'active')").bind(P),
    env.DB.prepare("INSERT INTO product_variants (id, product_id, sku, barcode, position) VALUES (?1, ?2, 'SYNC-S', 'MOCKTY-1-S', 0)").bind(V1, P),
    env.DB.prepare("INSERT INTO product_variants (id, product_id, sku, barcode, position) VALUES (?1, ?2, 'SYNC-X', NULL, 1)").bind(V2, P),
    env.DB.prepare("INSERT INTO inventory (variant_id, total, reserved, safety_stock) VALUES (?1, 10, 0, 0)").bind(V1),
    env.DB.prepare("INSERT INTO inventory (variant_id, total, reserved, safety_stock) VALUES (?1, 5, 0, 0)").bind(V2),
    env.DB.prepare("INSERT INTO channel_prices (variant_id, channel, price) VALUES (?1, 'website', 30000)").bind(V1),
  ]);
});
// the DB is shared with other suites (the import suite expects the mock barcodes to be unknown): remove everything this file created
afterAll(async () => {
  await env.DB.exec(`DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE external_order_id LIKE 'SYNC-ORD-%'); DELETE FROM orders WHERE external_order_id LIKE 'SYNC-ORD-%'; DELETE FROM product_mappings WHERE variant_id LIKE 'sync-v%'; DELETE FROM channel_listings WHERE variant_id LIKE 'sync-v%'; DELETE FROM channel_prices WHERE variant_id LIKE 'sync-v%'; DELETE FROM inventory_movements WHERE variant_id LIKE 'sync-v%'; DELETE FROM inventory WHERE variant_id LIKE 'sync-v%'; DELETE FROM product_images WHERE product_id = 'sync-p1'; DELETE FROM channel_product_settings WHERE product_id = 'sync-p1'; DELETE FROM product_variants WHERE id LIKE 'sync-v%'; DELETE FROM products WHERE id = 'sync-p1'; DELETE FROM outbox_jobs;`);
  await setMock(false);
});
const clearOutbox = () => env.DB.exec("DELETE FROM outbox_jobs");
const row = async () => (await j<any>(await admin(owner, `/trendyol/sync/${P}`)));

describe("Trendyol sync control", () => {
  it("is owner/admin only", async () => {
    expect((await admin(staff, "/trendyol/sync")).status).toBe(403);
    expect((await admin(staff, `/trendyol/sync/${P}`)).status).toBe(403);
    expect((await admin(staff, "/trendyol/sync", "PUT", { productIds: [P], enabled: true })).status).toBe(403);
  });

  it("a new product is website only and listed that way", async () => {
    const r = await row();
    expect(r).toMatchObject({ mode: "website_only", linked: 0, enabled: 0, contentSource: "local", priceSource: "local", stock: 15 });
    const list = await j<any>(await admin(owner, "/trendyol/sync?mode=website_only&search=Yerel"));
    expect(list.items.map((i: any) => i.productId)).toContain(P);
    expect(list.summary.websiteOnly).toBeGreaterThan(0);
    expect((await j<any>(await admin(owner, "/trendyol/sync?mode=synced&search=Yerel"))).items).toEqual([]);
    expect((await admin(owner, "/trendyol/sync?mode=nope")).status).toBe(400);
  });

  it("turning sync on links variants by barcode, skips the ones without, and queues a stock push", async () => {
    await clearOutbox();
    const r = await admin(owner, "/trendyol/sync", "PUT", { productIds: [P], enabled: true });
    expect(await j(r)).toEqual({ updated: 1, linked: 1, skippedNoBarcode: 1, barcodeTaken: 0 });
    const d = await row();
    expect(d).toMatchObject({ mode: "synced", linked: 1, enabled: 1 });
    expect(d.variantRows.map((v: any) => [v.sku, v.linked, v.enabled])).toEqual([["SYNC-S", true, true], ["SYNC-X", false, false]]);
    expect((await runOutbox(env as never, { limit: 20 })).dead).toBe(0);
    expect((await one<{ s: number }>("SELECT last_synced_stock AS s FROM channel_listings WHERE variant_id = ?1", V1))?.s).toBe(10);
  });

  it("content/price source 'remote' pulls from Trendyol; stock stays local", async () => {
    await clearOutbox();
    expect((await admin(owner, "/trendyol/sync", "PUT", { productIds: [P], contentSource: "remote", priceSource: "remote" })).status).toBe(200);
    expect((await runOutbox(env as never, { limit: 20 })).dead).toBe(0);
    expect((await one<{ n: string }>("SELECT name_tr AS n FROM products WHERE id = ?1", P))?.n).toBe("Mock Trendyol Tişört");
    expect((await one<{ p: number }>("SELECT price AS p FROM channel_prices WHERE variant_id = ?1 AND channel = 'website'", V1))?.p).toBe(19990);
    expect((await one<{ t: number }>("SELECT total AS t FROM inventory WHERE variant_id = ?1", V1))?.t).toBe(10);
    const d = await row();
    expect(d).toMatchObject({ contentSource: "remote", priceSource: "remote" }); expect(d.lastPulledAt).toBeTruthy();
  });

  it("manual stock pull overwrites local stock for the picked product only", async () => {
    await clearOutbox();
    expect((await admin(owner, "/trendyol/sync/pull", "POST", { productIds: [P], stock: true })).status).toBe(202);
    await runOutbox(env as never, { limit: 20 });
    expect((await one<{ t: number }>("SELECT total AS t FROM inventory WHERE variant_id = ?1", V1))?.t).toBe(12);
  });

  it("Trendyol sale takes stock, cancellation returns it once (real D1 batch)", async () => {
    const db = drizzle(env.DB, { schema });
    const o = (status: string) => ({ externalId: "SYNC-ORD-1", status, placedAt: new Date(0).toISOString(), total: 1000, currency: "TRY", customer: { name: "A", address: "x", city: "y" }, lines: [{ sku: "SYNC-S", barcode: "MOCKTY-1-S", quantity: 3, unitPrice: 500 }] });
    const total = async () => (await one<{ t: number }>("SELECT total AS t FROM inventory WHERE variant_id = ?1", V1))?.t;
    expect(await importTrendyolOrder(db, o("paid"))).toBe("imported");
    expect(await total()).toBe(9);
    const fx = { stockChanged: false };
    await importTrendyolOrder(db, o("cancelled"), undefined, fx); await importTrendyolOrder(db, o("cancelled"));
    expect(await total()).toBe(12); expect(fx.stockChanged).toBe(true);
  });

  it("website only: listing off, Trendyol sales no longer take its stock, manual push is a no-op", async () => {
    expect((await admin(owner, "/trendyol/sync", "PUT", { productIds: [P], enabled: false })).status).toBe(200);
    expect(await row()).toMatchObject({ mode: "website_only", linked: 1, enabled: 0 });
    const db = drizzle(env.DB, { schema });
    await importTrendyolOrder(db, { externalId: "SYNC-ORD-2", status: "paid", placedAt: new Date(0).toISOString(), total: 500, currency: "TRY", customer: { name: "A", address: "x", city: "y" }, lines: [{ sku: "SYNC-S", barcode: "MOCKTY-1-S", quantity: 2, unitPrice: 250 }] });
    expect((await one<{ t: number }>("SELECT total AS t FROM inventory WHERE variant_id = ?1", V1))?.t).toBe(12);
    expect((await admin(owner, "/trendyol/sync/push", "POST", { productIds: [P] })).status).toBe(202);
  });

  it("validates input", async () => {
    expect((await admin(owner, "/trendyol/sync", "PUT", { productIds: [P] })).status).toBe(400);
    expect((await admin(owner, "/trendyol/sync", "PUT", { productIds: ["nope"], enabled: true })).status).toBe(404);
    expect((await admin(owner, "/trendyol/sync/nope")).status).toBe(404);
  });
});

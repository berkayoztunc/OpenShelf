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
  await env.DB.exec(`DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE external_order_id LIKE 'SYNC-ORD-%'); DELETE FROM orders WHERE external_order_id LIKE 'SYNC-ORD-%'; DELETE FROM product_mappings WHERE variant_id LIKE 'sync-v%'; DELETE FROM channel_listings WHERE variant_id LIKE 'sync-v%'; DELETE FROM channel_prices WHERE variant_id LIKE 'sync-v%'; DELETE FROM inventory_movements WHERE variant_id LIKE 'sync-v%'; DELETE FROM inventory WHERE variant_id LIKE 'sync-v%'; DELETE FROM product_images WHERE product_id LIKE 'sync-p%'; DELETE FROM channel_product_settings WHERE product_id LIKE 'sync-p%'; DELETE FROM product_variants WHERE id LIKE 'sync-v%'; DELETE FROM products WHERE id IN ('sync-p1','sync-p2'); DELETE FROM outbox_jobs;`);
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
    expect(await j(r)).toEqual({ updated: 1, linked: 1, skippedNoBarcode: 1, barcodeTaken: 0, notOnTrendyol: 0, pendingApproval: 0 });
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

  it("a product that was never created on Trendyol is reported as such and gets no stock push until it exists there", async () => {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO products (id, slug, name_tr, status) VALUES ('sync-p2', 'sync-p2', 'Yeni Çanta Süsü', 'active')"),
      env.DB.prepare("INSERT INTO product_variants (id, product_id, sku, barcode, position) VALUES ('sync-v3', 'sync-p2', 'SYNC-NEW', '2411198546', 0)"),
      env.DB.prepare("INSERT INTO product_variants (id, product_id, sku, barcode, position) VALUES ('sync-v4', 'sync-p2', 'SYNC-WAIT', 'MOCKTY-PENDING-1', 1)"),
      env.DB.prepare("INSERT INTO inventory (variant_id, total, reserved, safety_stock) VALUES ('sync-v3', 20, 0, 0)"),
      env.DB.prepare("INSERT INTO inventory (variant_id, total, reserved, safety_stock) VALUES ('sync-v4', 7, 0, 0)"),
    ]);
    await clearOutbox();
    const r = await j<any>(await admin(owner, "/trendyol/sync", "PUT", { productIds: ["sync-p2"], enabled: true }));
    expect(r).toMatchObject({ linked: 2, notOnTrendyol: 1, pendingApproval: 1 });
    const d = await j<any>(await admin(owner, "/trendyol/sync/sync-p2"));
    expect(d).toMatchObject({ mode: "synced", notListed: 1, pending: 1, errors: 0 });
    expect(d.variantRows.map((v: any) => [v.sku, v.state, v.lastError])).toEqual([["SYNC-NEW", "not_listed", null], ["SYNC-WAIT", "pending", null]]);
    // nothing is pushed for them, so they never look "in sync"
    await runOutbox(env as never, { limit: 20 });
    expect((await one<{ s: number | null }>("SELECT last_synced_stock AS s FROM channel_listings WHERE variant_id = 'sync-v3'"))?.s).toBeNull();
    const list = await j<any>(await admin(owner, "/trendyol/sync?mode=not_listed"));
    expect(list.items.map((i: any) => i.productId)).toEqual(["sync-p2"]); expect(list.summary.notListed).toBe(1);
    // the product gets created + approved on Trendyol (here: its barcode becomes a known one), then a re-check starts the sync
    await env.DB.exec("UPDATE product_mappings SET external_barcode = 'MOCKTY-1-M' WHERE variant_id = 'sync-v3'");
    const v = await j<any>(await admin(owner, "/trendyol/sync/verify", "POST", { productIds: ["sync-p2"] }));
    expect(v).toMatchObject({ approved: 1, pending: 1, notListed: 0 });
    await runOutbox(env as never, { limit: 20 });
    const after = await j<any>(await admin(owner, "/trendyol/sync/sync-p2"));
    expect(after.variantRows[0]).toMatchObject({ state: "listed", lastSyncedStock: 20 });
    expect(await one<{ e: string }>("SELECT external_id AS e FROM product_mappings WHERE variant_id = 'sync-v3'")).toEqual({ e: "900001" });
  });

  it("remembers the Trendyol choices per local category (admin only, validated)", async () => {
    const d = { localCategoryId: "cat-remember", trendyolCategoryId: 411, categoryPath: "Aksesuar › Çanta Süsü", brandId: 9001, brandName: "Nuad", attrs: { "47": { ids: [1002], custom: "" } }, cargo: "YKMP", vatRate: "20", dimensionalWeight: "1", deliveryDuration: "2", origin: "TR" };
    expect(await j<any>(await admin(owner, "/trendyol/defaults?category=cat-remember"))).toEqual({ defaults: null });
    expect((await admin(owner, "/trendyol/defaults", "PUT", d)).status).toBe(204);
    const { localCategoryId, ...saved } = d;
    expect(await j<any>(await admin(owner, `/trendyol/defaults?category=${localCategoryId}`))).toEqual({ defaults: saved });
    expect((await admin(owner, "/trendyol/defaults", "PUT", { ...d, brandName: "Yeni" })).status).toBe(204);   // overwrite, not duplicate
    expect((await j<any>(await admin(owner, "/trendyol/defaults?category=cat-remember"))).defaults.brandName).toBe("Yeni");
    expect((await admin(owner, "/trendyol/defaults", "PUT", { ...d, trendyolCategoryId: -1 })).status).toBe(400);
    expect((await admin(owner, "/trendyol/defaults", "PUT", { ...d, attrs: { abc: { ids: [], custom: "" } } })).status).toBe(400);
    expect((await admin(owner, "/trendyol/defaults")).status).toBe(400);
    expect((await admin(staff, "/trendyol/defaults?category=cat-remember")).status).toBe(403);
    expect((await admin(staff, "/trendyol/defaults", "PUT", d)).status).toBe(403);
    await env.DB.exec("DELETE FROM sync_cursors WHERE key LIKE 'trendyol:defaults:%'");
  });

  it("validates input", async () => {
    expect((await admin(owner, "/trendyol/sync", "PUT", { productIds: [P] })).status).toBe(400);
    expect((await admin(owner, "/trendyol/sync", "PUT", { productIds: ["nope"], enabled: true })).status).toBe(404);
    expect((await admin(owner, "/trendyol/sync/nope")).status).toBe(404);
  });
});

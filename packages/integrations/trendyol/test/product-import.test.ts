import { describe, it, expect, vi } from "vitest";
import { eq } from "drizzle-orm";
import { channelListings, channelPrices, inventory, inventoryMovements, outboxJobs, productImages, productMappings, productVariants, products, syncCursors } from "@openshelf/db";
import { applyTrendyolProducts, factory, jobHandlers, loadImportStatus, mapContent, PRODUCTS_STATUS_KEY } from "../src";
import { makeDb, seedProduct, seedVariants } from "./db";

const creds = (sot?: string) => ({ config: { supplierId: "12345", ...(sot ? { sourceOfTruth: sot } : {}) }, secrets: { apiKey: "key1", apiSecret: "sec1" } });
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s });
const now = () => new Date("2026-01-10T00:00:00Z");
const provider = (f: any, sot?: string) => factory.create(creds(sot), { fetch: f, now, sleep: async () => {} } as any);
const ctxOf = (db: any, p: any) => ({ db, env: {}, getAdapter: async () => p, log: vi.fn(async () => {}) });

const content = (id: number, variants: any[], extra: any = {}) => ({
  contentId: id, productMainId: `MAIN${id}`, title: `Ürün Çiçeği ${id}`, description: "desc", brand: { id: 1, name: "Marka" }, category: { id: 2, name: "Giyim" },
  images: [{ url: "https://cdn.dsmcdn.com/a.jpg" }, { url: "http://insecure/b.jpg" }], variants, ...extra,
});
const variant = (barcode: string, qty: number, sale = 199.9, list = 249.9, extra: any = {}) => ({
  barcode, stockCode: `S-${barcode}`, vatRate: 20, attributes: [{ attributeName: "Beden", attributeValue: "M" }],
  stock: { quantity: qty }, price: { salePrice: sale, listPrice: list }, archived: false, blacklisted: false, ...extra,
});

describe("mapContent", () => {
  it("maps minor units, https-only images and variant options", () => {
    const m = mapContent(content(1, [variant("B1", 5)]));
    expect(m.externalId).toBe("1");
    expect(m.images).toEqual(["https://cdn.dsmcdn.com/a.jpg"]);
    expect(m.variants[0]).toMatchObject({ barcode: "B1", quantity: 5, salePrice: 19990, listPrice: 24990, options: { Beden: "M" }, active: true });
  });
  it("list price never below sale price; archived variant inactive", () => {
    const m = mapContent(content(1, [variant("B1", 1, 100, 50, { archived: true })]));
    expect(m.variants[0]).toMatchObject({ salePrice: 10000, listPrice: 10000, active: false });
  });
});

describe("fetchProducts", () => {
  it("pages through approved products with page cursor", async () => {
    const f = vi.fn(async (_url: string, _init?: unknown) => json({ content: [content(1, [variant("B1", 1)])], totalPages: 2, page: 0 }));
    const r = await provider(f).fetchProducts();
    expect(String(f.mock.calls[0]![0])).toContain("/product/sellers/12345/products/approved?page=0&size=100");
    expect(r.nextCursor).toBe("1");
    const f2 = vi.fn(async () => json({ content: [content(2, [variant("B2", 1)])], totalPages: 2, page: 1 }));
    expect((await provider(f2).fetchProducts("1")).nextCursor).toBeUndefined();
  });
});

describe("applyTrendyolProducts", () => {
  it("link-only (source local): links by barcode, never touches stock/price/content", async () => {
    const { db, raw } = makeDb(); seedProduct(raw); seedVariants(raw);
    const r = await applyTrendyolProducts(db, [mapContent(content(1, [variant("BC1", 99, 1, 2)]))], { sourceOfTruth: "local", createMissing: false, dryRun: false });
    expect(r).toMatchObject({ linked: 1, created: 0, updated: 0, skipped: 0 });
    expect((await db.select().from(productMappings))[0]).toMatchObject({ variantId: "v1", externalBarcode: "BC1", externalId: "1" });
    expect((await db.select().from(inventory).where(eq(inventory.variantId, "v1")))[0]!.total).toBe(10);
    expect((await db.select().from(channelPrices).where(eq(channelPrices.variantId, "v1")))[0]!.price).toBe(10990);
    expect((await db.select().from(products))[0]!.nameTr).toBe("Local P1");
  });

  it("matches by sku == stockCode when barcode differs", async () => {
    const { db, raw } = makeDb(); seedProduct(raw); seedVariants(raw);
    const m = mapContent(content(1, [variant("OTHER", 1)])); m.variants[0]!.stockCode = "SKU2";
    const r = await applyTrendyolProducts(db, [m], { sourceOfTruth: "local", createMissing: false, dryRun: false });
    expect(r.linked).toBe(1);
    expect((await db.select().from(productMappings))[0]!.variantId).toBe("v2");
  });

  it("source trendyol: overwrites stock via ledger (keeping reserved+safety), prices and content", async () => {
    const { db, raw } = makeDb(); seedProduct(raw); seedVariants(raw); // v1 total 10 reserved 1 safety 1
    const r = await applyTrendyolProducts(db, [mapContent(content(1, [variant("BC1", 5, 150, 200)]))], { sourceOfTruth: "trendyol", createMissing: false, dryRun: false });
    expect(r).toMatchObject({ linked: 1, updated: 1, stockChanged: 1 });
    const inv = (await db.select().from(inventory).where(eq(inventory.variantId, "v1")))[0]!;
    expect(inv.total - inv.reserved - inv.safetyStock).toBe(5); // available == Trendyol quantity
    const mv = (await db.select().from(inventoryMovements))[0]!;
    expect(mv).toMatchObject({ variantId: "v1", reason: "trendyol_sync", delta: inv.total - 10 });
    const prices = await db.select().from(channelPrices).where(eq(channelPrices.variantId, "v1"));
    expect(prices.map((p) => [p.channel, p.price, p.compareAtPrice]).sort()).toEqual([["trendyol", 15000, 20000], ["website", 15000, 20000]]);
    expect((await db.select().from(products))[0]).toMatchObject({ nameTr: "Ürün Çiçeği 1", brand: "Marka" });
    expect((await db.select().from(productImages)).map((i) => i.url)).toEqual(["https://cdn.dsmcdn.com/a.jpg"]);
    expect((await db.select().from(channelListings).where(eq(channelListings.variantId, "v1")))[0]!.lastSyncedStock).toBe(5);
  });

  it("is idempotent: second run changes no stock and writes no extra movement", async () => {
    const { db, raw } = makeDb(); seedProduct(raw); seedVariants(raw);
    const rem = [mapContent(content(1, [variant("BC1", 5)]))];
    await applyTrendyolProducts(db, rem, { sourceOfTruth: "trendyol", createMissing: false, dryRun: false });
    const r2 = await applyTrendyolProducts(db, rem, { sourceOfTruth: "trendyol", createMissing: false, dryRun: false });
    expect(r2.stockChanged).toBe(0);
    expect(await db.select().from(inventoryMovements)).toHaveLength(1);
    expect(await db.select().from(productMappings)).toHaveLength(1);
  });

  it("createMissing: creates a DRAFT product with variants, stock, prices, images, category and mapping; re-run does not duplicate", async () => {
    const { db } = makeDb();
    const rem = [mapContent(content(7, [variant("NEW1", 4), variant("NEW2", 0)]))];
    const r = await applyTrendyolProducts(db, rem, { sourceOfTruth: "local", createMissing: true, dryRun: false });
    expect(r).toMatchObject({ created: 2, linked: 0 });
    const p = (await db.select().from(products))[0]!;
    expect(p).toMatchObject({ id: "ty-7", status: "draft", nameTr: "Ürün Çiçeği 7", slug: "urun-cicegi-7-7" });
    expect(p.categoryId).toBeTruthy();
    expect((await db.select().from(productVariants)).map((v) => v.sku).sort()).toEqual(["S-NEW1", "S-NEW2"]);
    expect((await db.select().from(inventory).where(eq(inventory.variantId, "tyv-NEW1")))[0]!.total).toBe(4);
    expect((await db.select().from(channelPrices))).toHaveLength(4);
    expect(await db.select().from(productMappings)).toHaveLength(2);
    const r2 = await applyTrendyolProducts(db, rem, { sourceOfTruth: "local", createMissing: true, dryRun: false });
    expect(r2.created).toBe(0); expect(r2.linked).toBe(2);
    expect(await db.select().from(products)).toHaveLength(1);
    expect(await db.select().from(productVariants)).toHaveLength(2);
  });

  it("unmatched variants are skipped without createMissing", async () => {
    const { db } = makeDb();
    const r = await applyTrendyolProducts(db, [mapContent(content(1, [variant("X", 1)]))], { sourceOfTruth: "local", createMissing: false, dryRun: false });
    expect(r).toMatchObject({ skipped: 1, created: 0 });
    expect(await db.select().from(products)).toHaveLength(0);
  });

  it("dryRun counts but writes nothing", async () => {
    const { db, raw } = makeDb(); seedProduct(raw); seedVariants(raw);
    const r = await applyTrendyolProducts(db, [mapContent(content(1, [variant("BC1", 5), variant("NEW", 1)]))], { sourceOfTruth: "trendyol", createMissing: true, dryRun: true });
    expect(r).toMatchObject({ linked: 1, created: 1 });
    expect(await db.select().from(productMappings)).toHaveLength(0);
    expect(await db.select().from(inventoryMovements)).toHaveLength(0);
    expect(await db.select().from(products)).toHaveLength(1);
  });

  it("duplicate stock codes within one run create only one variant", async () => {
    const { db } = makeDb();
    const a = mapContent(content(1, [variant("A1", 1)])); const b = mapContent(content(2, [variant("A2", 1)]));
    a.variants[0]!.stockCode = "DUP"; b.variants[0]!.stockCode = "DUP";
    const r = await applyTrendyolProducts(db, [a, b], { sourceOfTruth: "local", createMissing: true, dryRun: false });
    expect(r).toMatchObject({ created: 1, skipped: 1 });
  });
});

describe("trendyol.import_products job", () => {
  it("processes a page, chains the next page and records final status", async () => {
    const { db } = makeDb();
    let call = 0;
    const f = vi.fn(async () => json({ content: [content(++call, [variant(`PB${call}`, 3)])], totalPages: 2 }));
    const p = provider(f, "trendyol");
    const h = jobHandlers["trendyol.import_products"]!;
    await h({ id: "j1", kind: "k", payload: { runId: "run1" }, attempts: 1 }, ctxOf(db, p));
    expect((await loadImportStatus(db))!.state).toBe("running");
    const next = (await db.select().from(outboxJobs))[0]!;
    expect(next).toMatchObject({ kind: "trendyol.import_products", dedupeKey: "trendyol.import_products:run1:1" });
    await h({ id: "j2", kind: "k", payload: next.payload as any, attempts: 1 }, ctxOf(db, p));
    const st = (await loadImportStatus(db))!;
    expect(st).toMatchObject({ state: "done", sourceOfTruth: "trendyol", createMissing: true });
    expect(st.totals).toMatchObject({ pages: 2, contents: 2, created: 2 });
    expect(await db.select().from(outboxJobs)).toHaveLength(1); // no third page
  });

  it("no-op when trendyol disabled; error is rethrown for outbox retry", async () => {
    const { db } = makeDb();
    const h = jobHandlers["trendyol.import_products"]!;
    await h({ id: "j", kind: "k", payload: {}, attempts: 1 }, ctxOf(db, null));
    expect(await db.select().from(syncCursors).where(eq(syncCursors.key, PRODUCTS_STATUS_KEY))).toHaveLength(0);
    const bad = provider(vi.fn(async () => json({}, 500)));
    await expect(h({ id: "j", kind: "k", payload: {}, attempts: 1 }, ctxOf(db, bad))).rejects.toThrow("Trendyol HTTP 500");
    expect((await loadImportStatus(db))!.error).toContain("500");
  });

  it("stock_push does nothing while Trendyol is the source of truth", async () => {
    const { db, raw } = makeDb(); seedProduct(raw); seedVariants(raw);
    raw.prepare("INSERT INTO product_mappings (id, variant_id, provider, external_sku, external_barcode) VALUES ('m1','v1','trendyol','SKU1','BC1')").run();
    const f = vi.fn(async () => json({ batchRequestId: "b" }));
    await jobHandlers["trendyol.stock_push"]!({ id: "j", kind: "k", payload: {}, attempts: 1 }, ctxOf(db, provider(f, "trendyol")));
    expect(f).not.toHaveBeenCalled();
  });
});

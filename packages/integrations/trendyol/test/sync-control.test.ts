import { describe, it, expect, vi } from "vitest";
import { applyFollowedProducts, hasFollowedProducts, importTrendyolOrder, jobHandlers } from "../src";
import type { MarketplaceOrder, MarketplaceProduct } from "@openshelf/integration-sdk";
import { makeDb, seedProduct, seedVariants } from "./db";

const ctxOf = (db: any, p: any) => ({ db, env: {}, getAdapter: async () => p, log: vi.fn(async () => {}) });
const order = (id: string, status: string, qty = 2): MarketplaceOrder => ({
  externalId: id, status, placedAt: new Date(0).toISOString(), total: 1000, currency: "TRY",
  customer: { name: "A", address: "x", city: "y" }, lines: [{ sku: "SKU1", barcode: "BC1", quantity: qty, unitPrice: 500 }],
});
const remote = (over: Partial<MarketplaceProduct> = {}): MarketplaceProduct => ({
  externalId: "900", title: "Trendyol Title", description: "Trendyol desc", brand: "TyBrand", images: ["https://cdn.dsmcdn.com/a.jpg"],
  variants: [{ barcode: "BC1", stockCode: "SKU1", quantity: 4, salePrice: 5550, listPrice: 6000, active: true }], ...over,
});
function setup() {
  const { db, raw } = makeDb(); seedProduct(raw); seedVariants(raw, 2);
  for (const i of [1, 2]) raw.prepare("INSERT INTO product_mappings (id, variant_id, provider, external_sku, external_barcode) VALUES (?,?,?,?,?)").run(`m${i}`, `v${i}`, "trendyol", `SKU${i}`, `BC${i}`);
  const total = (v = "v1") => (raw.prepare("SELECT total FROM inventory WHERE variant_id = ?").get(v) as any).total as number;
  const settings = (content: string, price: string) => raw.prepare("INSERT INTO channel_product_settings (product_id, channel, content_source, price_source) VALUES ('p1','trendyol',?,?)").run(content, price);
  return { db, raw, total, settings };
}

describe("website-only products and Trendyol sales", () => {
  it("a Trendyol sale takes stock for a synced variant and reports the change", async () => {
    const { db, total } = setup(); const fx = { stockChanged: false };
    expect(await importTrendyolOrder(db, order("1", "paid"), undefined, fx)).toBe("imported");
    expect(total()).toBe(8); expect(fx.stockChanged).toBe(true);
  });
  it("a website-only variant (listing off) keeps its own stock", async () => {
    const { db, raw, total } = setup(); const fx = { stockChanged: false };
    raw.prepare("UPDATE channel_listings SET enabled = 0 WHERE variant_id = 'v1'").run();
    expect(await importTrendyolOrder(db, order("1", "paid"), undefined, fx)).toBe("imported");
    expect(total()).toBe(10); expect(fx.stockChanged).toBe(false);
    expect((raw.prepare("SELECT variant_id AS v FROM order_items").get() as any).v).toBe("v1"); // still linked for reporting
  });
});

describe("cancelled Trendyol order", () => {
  it("puts the stock back exactly once and asks for a push", async () => {
    const { db, raw, total } = setup();
    await importTrendyolOrder(db, order("1", "paid"));
    expect(total()).toBe(8);
    const fx = { stockChanged: false };
    expect(await importTrendyolOrder(db, order("1", "cancelled"), undefined, fx)).toBe("duplicate");
    expect(total()).toBe(10); expect(fx.stockChanged).toBe(true);
    const again = { stockChanged: false };
    await importTrendyolOrder(db, order("1", "cancelled"), undefined, again);
    expect(total()).toBe(10); expect(again.stockChanged).toBe(false);
    expect((raw.prepare("SELECT COUNT(*) AS n FROM inventory_movements WHERE reason = 'trendyol_cancel'").get() as any).n).toBe(1);
  });
  it("does not restock an order that never took stock (website-only)", async () => {
    const { db, raw, total } = setup();
    raw.prepare("UPDATE channel_listings SET enabled = 0 WHERE variant_id = 'v1'").run();
    await importTrendyolOrder(db, order("1", "paid"));
    await importTrendyolOrder(db, order("1", "cancelled"));
    expect(total()).toBe(10);
  });
  it("reconcile job queues a stock push after a cancellation", async () => {
    const { db, raw } = setup();
    await importTrendyolOrder(db, order("1", "paid"));
    const p = { fetchOrders: async () => ({ orders: [order("1", "cancelled")] }) };
    await jobHandlers["trendyol.reconcile_orders"]!({ id: "j", kind: "trendyol.reconcile_orders", payload: {}, attempts: 0 }, ctxOf(db, p));
    expect((raw.prepare("SELECT COUNT(*) AS n FROM outbox_jobs WHERE kind = 'trendyol.stock_push'").get() as any).n).toBe(1);
  });
});

describe("price source", () => {
  it("stock push sends no price for products whose price follows Trendyol", async () => {
    const { db, settings } = setup(); settings("local", "remote");
    const push = vi.fn(async (_u: any[]) => ({ ok: true }));
    await jobHandlers["trendyol.stock_push"]!({ id: "j", kind: "trendyol.stock_push", payload: {}, attempts: 0 }, ctxOf(db, { pushStockAndPrice: push }));
    expect(push.mock.calls[0]![0].map((u: any) => u.price)).toEqual([undefined, undefined]);
    expect(push.mock.calls[0]![0][0].quantity).toBe(8);
  });
  it("stock push sends the Trendyol price when it is managed here", async () => {
    const { db } = setup();
    const push = vi.fn(async (_u: any[]) => ({ ok: true }));
    await jobHandlers["trendyol.stock_push"]!({ id: "j", kind: "trendyol.stock_push", payload: {}, attempts: 0 }, ctxOf(db, { pushStockAndPrice: push }));
    expect(push.mock.calls[0]![0][0].price).toBe(109.9);
  });
});

describe("applyFollowedProducts", () => {
  const row = (raw: any) => raw.prepare("SELECT name_tr AS n, brand AS b FROM products WHERE id = 'p1'").get() as any;
  const price = (raw: any, ch: string) => (raw.prepare("SELECT price FROM channel_prices WHERE variant_id = 'v1' AND channel = ?").get(ch) as any)?.price;
  it("touches nothing when the product is managed here", async () => {
    const { db, raw, total } = setup();
    expect(await hasFollowedProducts(db)).toBe(false);
    expect(await applyFollowedProducts(db, [remote()])).toMatchObject({ products: 0, content: 0, prices: 0 });
    expect(row(raw).n).toBe("Local P1"); expect(total()).toBe(10);
  });
  it("content follows Trendyol, price stays local", async () => {
    const { db, raw, settings } = setup(); settings("remote", "local");
    expect(await hasFollowedProducts(db)).toBe(true);
    expect(await applyFollowedProducts(db, [remote()])).toMatchObject({ products: 1, content: 1, prices: 0 });
    expect(row(raw)).toEqual({ n: "Trendyol Title", b: "TyBrand" });
    expect((raw.prepare("SELECT url FROM product_images WHERE product_id = 'p1'").get() as any).url).toBe("https://cdn.dsmcdn.com/a.jpg");
    expect(price(raw, "trendyol")).toBe(10990);
    expect((raw.prepare("SELECT last_pulled_at AS t FROM channel_product_settings").get() as any).t).toBeTruthy();
  });
  it("price follows Trendyol on both channels, content and stock stay local", async () => {
    const { db, raw, total, settings } = setup(); settings("local", "remote");
    await applyFollowedProducts(db, [remote()]); await applyFollowedProducts(db, [remote()]);
    expect(price(raw, "trendyol")).toBe(5550); expect(price(raw, "website")).toBe(5550);
    expect(row(raw).n).toBe("Local P1"); expect(total()).toBe(10);
  });
  it("skips website-only variants and products outside productIds", async () => {
    const { db, raw, settings } = setup(); settings("remote", "remote");
    expect((await applyFollowedProducts(db, [remote()], { productIds: ["other"] })).products).toBe(0);
    raw.prepare("UPDATE channel_listings SET enabled = 0").run();
    expect((await applyFollowedProducts(db, [remote()])).products).toBe(0);
    expect(row(raw).n).toBe("Local P1");
  });
  it("manual stock pull sets sellable quantity to Trendyol's, keeping reserved + safety", async () => {
    const { db, raw, total } = setup(); // v1: total 10, reserved 1, safety 1
    const r = await applyFollowedProducts(db, [remote()], { productIds: ["p1"], stock: true });
    expect(r.stock).toBe(1); expect(total()).toBe(6);
    expect((raw.prepare("SELECT last_synced_stock AS s FROM channel_listings WHERE variant_id = 'v1'").get() as any).s).toBe(4);
  });
  it("pull job never overwrites stock without explicit products, and chains pages", async () => {
    const { db, raw, total, settings } = setup(); settings("remote", "local");
    const p = { fetchProducts: vi.fn(async (c?: string) => (c ? { products: [] } : { products: [remote()], nextCursor: "1" })) };
    await jobHandlers["trendyol.pull_products"]!({ id: "run1", kind: "trendyol.pull_products", payload: { stock: true }, attempts: 0 }, ctxOf(db, p));
    expect(total()).toBe(10); expect(row(raw).n).toBe("Trendyol Title");
    const next = raw.prepare("SELECT payload FROM outbox_jobs WHERE kind = 'trendyol.pull_products'").get() as any;
    expect(JSON.parse(next.payload)).toMatchObject({ runId: "run1", cursor: "1", stock: false });
  });
});

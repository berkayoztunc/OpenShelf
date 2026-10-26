import { describe, it, expect, vi } from "vitest";
import { factory, jobHandlers, mapTrendyolStatus, computeStockDrift, mapPackage } from "../src";
import { importTrendyolOrder } from "../src";
import { MAX_INVENTORY_BATCH } from "../src/endpoints";
import { orders, orderItems, inventory, inventoryMovements, syncCursors, channelListings } from "@openshelf/db";
import { eq } from "drizzle-orm";
import { makeDb, seedVariants } from "./db";

const creds = { config: { supplierId: "12345" }, secrets: { apiKey: "key1", apiSecret: "sec1", webhookUsername: "wu", webhookPassword: "wp" } };
const now = () => new Date("2026-01-10T00:00:00Z");
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s });
const provider = (f: any) => factory.create(creds, { fetch: f, now, sleep: async () => {} } as any);
const ctxOf = (db: any, p: any) => ({ db, env: {}, getAdapter: async () => p, log: vi.fn(async () => {}) });

const pkg = (id: number, status = "Created", lines = [{ merchantSku: "SKU1", barcode: "BC1", quantity: 2, price: 100.5 }]) => ({
  shipmentPackageId: id, status, orderDate: 1767000000000, totalPrice: 201, currencyCode: "TRY", customerEmail: "a@b.c",
  shipmentAddress: { fullName: "Ali Veli", address1: "Sk 1", city: "Istanbul", phone: "555" }, lines,
});

describe("trendyol provider", () => {
  it("uses Basic auth + SelfIntegration User-Agent, allowlisted host", async () => {
    const f = vi.fn(async () => json({ content: [], totalPages: 1 }));
    expect((await provider(f).healthCheck()).ok).toBe(true);
    const [url, init] = f.mock.calls[0] as any;
    expect(new URL(url).hostname).toBe("apigw.trendyol.com");
    expect(init.headers.authorization).toBe(`Basic ${btoa("key1:sec1")}`);
    expect(init.headers["user-agent"]).toBe("12345 - SelfIntegration");
  });
  it("stage environment uses the stage host; production is default", async () => {
    const f = vi.fn(async () => json({ content: [], totalPages: 1 }));
    await factory.create({ config: { supplierId: "12345", environment: "stage" }, secrets: creds.secrets }, { fetch: f, now, sleep: async () => {} } as any).healthCheck();
    expect(new URL((f.mock.calls[0] as any)[0]).hostname).toBe("stageapigw.trendyol.com");
    expect(factory.manifest.publicFields.find((x) => x.key === "environment")).toMatchObject({ type: "select" });
  });
  it("order window: v2 path, <= 2 weeks, size 200, Awaiting skipped", async () => {
    const f = vi.fn(async () => json({ totalPages: 1, content: [pkg(1), pkg(2, "Awaiting")] }));
    const r = await provider(f).fetchOrders(new Date("2025-01-01T00:00:00Z"));
    const u = new URL((f.mock.calls[0] as any)[0]);
    expect(u.pathname).toBe("/integration/order/sellers/12345/v2/orders");
    expect(Number(u.searchParams.get("endDate")) - Number(u.searchParams.get("startDate"))).toBeLessThanOrEqual(14 * 24 * 3600 * 1000);
    expect(u.searchParams.get("size")).toBe("200");
    expect(r.orders.map((o) => o.externalId)).toEqual(["1"]);
  });
  it("price/stock body + inventory path; 429 backs off using Retry-After then succeeds", async () => {
    const sleeps: number[] = [];
    let n = 0;
    const calls: { url: string; body?: any }[] = [];
    const f = vi.fn(async (u: string, init?: any) => {
      calls.push({ url: u, body: init?.body ? JSON.parse(init.body) : undefined });
      if (init?.method === "POST") return ++n === 1 ? new Response("{}", { status: 429, headers: { "retry-after": "3" } }) : json({ batchRequestId: "b1" });
      return json({ items: [{ status: "SUCCESS", failureReasons: [] }] });
    });
    const p = factory.create(creds, { fetch: f, now, sleep: async (ms: number) => { sleeps.push(ms); } } as any);
    const r = await p.pushStockAndPrice([{ sku: "s", barcode: "B1", quantity: 99999, price: 12.5 }]);
    expect(r.ok).toBe(true);
    expect(sleeps[0]).toBe(3000);
    expect(new URL(calls[0]!.url).pathname).toBe("/integration/inventory/sellers/12345/products/price-and-inventory");
    expect(calls[0]!.body).toEqual({ items: [{ barcode: "B1", quantity: 20000, salePrice: 12.5, listPrice: 12.5 }] });
    expect(new URL(calls[2]!.url).pathname).toBe("/integration/product/sellers/12345/products/batch-requests/b1");
  });
  it("gives up after repeated 429", async () => {
    const f = vi.fn(async () => new Response("{}", { status: 429 }));
    expect((await provider(f).healthCheck()).ok).toBe(false);
    expect(f).toHaveBeenCalledTimes(4);
  });
  it("updateShipment sends alternative-delivery with a tracking link only", async () => {
    const f = vi.fn(async () => json({}));
    const p = provider(f);
    expect(await p.updateShipment!("77", { carrier: "x", trackingNumber: "ABC123" })).toEqual({ ok: false });
    expect(f).not.toHaveBeenCalled();
    expect(await p.updateShipment!("77", { carrier: "x", trackingNumber: "https://track.example/1" })).toEqual({ ok: true });
    const [url, init] = f.mock.calls[0] as any;
    expect(new URL(url).pathname).toBe("/integration/order/sellers/12345/shipment-packages/77/alternative-delivery");
    expect(JSON.parse(init.body)).toEqual({ isPhoneNumber: false, trackingInfo: "https://track.example/1", params: {} });
  });
  it("fetchOrders paginates and maps to minor units", async () => {
    const f = vi.fn(async (u: string) => new URL(u).searchParams.get("page") === "0"
      ? json({ totalPages: 2, content: [pkg(1)] }) : json({ totalPages: 2, content: [pkg(2)] }));
    const p = provider(f);
    const a = await p.fetchOrders(new Date("2026-01-09T00:00:00Z"));
    expect(a.nextCursor).toBe("1");
    expect(a.orders[0]).toMatchObject({ externalId: "1", status: "paid", total: 20100 });
    expect(a.orders[0]!.lines[0]).toMatchObject({ unitPrice: 10050, quantity: 2 });
    const b = await p.fetchOrders(new Date("2026-01-09T00:00:00Z"), "1");
    expect(b.nextCursor).toBeUndefined();
  });
  it("status mapping", () => {
    expect(mapTrendyolStatus("Shipped")).toBe("shipped");
    expect(mapTrendyolStatus("Delivered")).toBe("delivered");
    expect(mapTrendyolStatus("Cancelled")).toBe("cancelled");
    expect(mapTrendyolStatus("Returned")).toBe("refunded");
    expect(mapPackage(pkg(9, "Picking")).status).toBe("fulfilling");
  });
  it("batches >1000 updates, polls result, reports failures", async () => {
    const posts: number[] = [];
    const f = vi.fn(async (u: string, init?: any) => {
      if (init?.method === "POST") { posts.push(JSON.parse(init.body).items.length); return json({ batchRequestId: `b${posts.length}` }); }
      return json({ status: "COMPLETED", items: [{ status: "FAILED", failureReasons: ["bad"], requestItem: { barcode: "B0" } }] });
    });
    const ups = Array.from({ length: MAX_INVENTORY_BATCH + 5 }, (_, i) => ({ sku: `s${i}`, barcode: `B${i}`, quantity: 3, price: 10 }));
    ups.push({ sku: "nobc", quantity: 1 } as any);
    const r = await provider(f).pushStockAndPrice(ups);
    expect(posts).toEqual([MAX_INVENTORY_BATCH, 5]);
    expect(r.ok).toBe(false);
    expect(r.errors).toContain("B0: bad");
    expect(r.errors).toContain("nobc: missing barcode");
  });
  it("webhook verification", async () => {
    const p = provider(vi.fn());
    const ok = new Request("https://x", { headers: { authorization: `Basic ${btoa("wu:wp")}` } });
    expect((await p.verifyWebhook!(ok, JSON.stringify(pkg(5))))?.externalId).toBe("5");
    const bad = new Request("https://x", { headers: { authorization: "Basic xxx" } });
    await expect(p.verifyWebhook!(bad, "{}")).rejects.toThrow();
  });
  it("rejects bad config", () => {
    expect(factory.manifest.schema.safeParse({ config: { supplierId: "x" }, secrets: {} }).success).toBe(false);
  });
});

describe("trendyol.reconcile_orders", () => {
  it("imports idempotently and decrements inventory once", async () => {
    const { db, raw } = makeDb(); seedVariants(raw);
    const f = vi.fn(async () => json({ totalPages: 1, content: [pkg(100), pkg(101, "Created", [{ merchantSku: "ZZZ", barcode: "NOPE", quantity: 1, price: 5 }])] }));
    const ctx = ctxOf(db, provider(f));
    const job = { id: "j", kind: "trendyol.reconcile_orders", payload: {}, attempts: 0 };
    await jobHandlers["trendyol.reconcile_orders"]!(job, ctx);
    await jobHandlers["trendyol.reconcile_orders"]!(job, ctx);
    expect(await db.select().from(orders)).toHaveLength(2);
    expect(await db.select().from(orderItems)).toHaveLength(2);
    expect((await db.select().from(inventory).where(eq(inventory.variantId, "v1")))[0]!.total).toBe(8);
    const mv = await db.select().from(inventoryMovements);
    expect(mv).toHaveLength(1);
    expect(mv[0]).toMatchObject({ reason: "trendyol_sale", delta: -2, variantId: "v1" });
    expect((await db.select().from(syncCursors))[0]!.key).toBe("trendyol:orders:since");
  });
  it("status change updates existing order without double decrement", async () => {
    const { db, raw } = makeDb(); seedVariants(raw);
    expect(await importTrendyolOrder(db, mapPackage(pkg(7)))).toBe("imported");
    expect(await importTrendyolOrder(db, mapPackage(pkg(7, "Shipped")))).toBe("duplicate");
    expect((await db.select().from(orders))[0]!.status).toBe("shipped");
    expect((await db.select().from(inventory).where(eq(inventory.variantId, "v1")))[0]!.total).toBe(8);
  });
  it("import is atomic: a failure mid-batch leaves no order and no stock change", async () => {
    const { db, raw } = makeDb(); seedVariants(raw);
    raw.exec("DROP TABLE inventory_movements"); // makes the last statement of the batch fail
    await expect(importTrendyolOrder(db, mapPackage(pkg(55)))).rejects.toThrow();
    expect(await db.select().from(orders)).toHaveLength(0);
    expect(await db.select().from(orderItems)).toHaveLength(0);
    expect((await db.select().from(inventory).where(eq(inventory.variantId, "v1")))[0]!.total).toBe(10);
  });
  it("concurrent imports of the same order decrement stock exactly once", async () => {
    const { db, raw } = makeDb(); seedVariants(raw);
    const results = await Promise.all([1, 2, 3].map(() => importTrendyolOrder(db, mapPackage(pkg(66)))));
    expect(results.filter((r) => r === "imported")).toHaveLength(1);
    expect(results.filter((r) => r === "duplicate")).toHaveLength(2);
    expect((await db.select().from(inventory).where(eq(inventory.variantId, "v1")))[0]!.total).toBe(8);
    expect(await db.select().from(inventoryMovements)).toHaveLength(1);
    expect(await db.select().from(orderItems)).toHaveLength(1);
  });
  it("no-op when trendyol disabled", async () => {
    const { db } = makeDb();
    const ctx = ctxOf(db, null);
    await jobHandlers["trendyol.reconcile_orders"]!({ id: "j", kind: "k", payload: {}, attempts: 0 }, ctx);
    expect(await db.select().from(orders)).toHaveLength(0);
  });
});

describe("trendyol.stock_push", () => {
  it("computes available (total-reserved-safety), dedupes ids, one batch, updates listings", async () => {
    const { db, raw } = makeDb(); seedVariants(raw);
    const bodies: any[] = [];
    const f = vi.fn(async (u: string, init?: any) => {
      if (init?.method === "POST") { bodies.push(JSON.parse(init.body)); return json({ batchRequestId: "b1" }); }
      return json({ status: "COMPLETED", items: [] });
    });
    const ctx = ctxOf(db, provider(f));
    await jobHandlers["trendyol.stock_push"]!({ id: "j", kind: "k", payload: { variantIds: ["v1", "v1", "v2"] }, attempts: 0 }, ctx);
    expect(bodies).toHaveLength(1);
    expect(bodies[0].items).toEqual([
      { barcode: "BC1", quantity: 8, salePrice: 109.9, listPrice: 109.9 },
      { barcode: "BC2", quantity: 17, salePrice: 209.9, listPrice: 209.9 },
    ]);
    const l = await db.select().from(channelListings).where(eq(channelListings.variantId, "v1"));
    expect(l[0]!.lastSyncedStock).toBe(8);
    // stockOnly skips unchanged
    await jobHandlers["trendyol.stock_push"]!({ id: "j", kind: "k", payload: { variantIds: ["v1", "v2"], stockOnly: true }, attempts: 0 }, ctx);
    expect(bodies).toHaveLength(1);
  });
  it("drift helper", () => {
    const d = computeStockDrift([
      { variantId: "a", centralAvailable: 5, remoteQuantity: 5 },
      { variantId: "b", centralAvailable: 5, remoteQuantity: 9 },
      { variantId: "c", centralAvailable: 2, remoteQuantity: null },
    ]);
    expect(d.map((x) => x.variantId)).toEqual(["b", "c"]);
    expect(d[0]!.delta).toBe(4);
  });
});

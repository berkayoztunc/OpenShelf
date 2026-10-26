import { describe, it, expect } from "vitest";
import type { MockRequest, MockState, TrendyolOperation } from "@openshelf/shared";
import { operations as catalogOps } from "../src/catalog/ops/catalog";
import { operations as productOps } from "../src/catalog/ops/products";
import { mockHandlers as catalogMock } from "../src/catalog/mock/catalog";
import { mockHandlers as productMock } from "../src/catalog/mock/products";

const ops: TrendyolOperation[] = [...catalogOps, ...productOps];
const handlers = { ...catalogMock, ...productMock };

function memState(start = 1_800_000_000_000) {
  const m = new Map<string, unknown>();
  const counters = new Map<string, number>();
  let t = start;
  const state: MockState & { advance(ms: number): void } = {
    async get<T>(k: string) { const v = m.get(k); return v === undefined ? undefined : (JSON.parse(JSON.stringify(v)) as T); },
    async set(k, v) { m.set(k, JSON.parse(JSON.stringify(v))); },
    async nextId(ns) { const n = (counters.get(ns) ?? 0) + 1; counters.set(ns, n); return n; },
    now: () => t,
    advance(ms) { t += ms; },
  };
  return state;
}
type S = ReturnType<typeof memState>;

async function call(state: S, id: string, o: { path?: Record<string, string | number>; query?: Record<string, unknown>; body?: unknown } = {}) {
  const op = ops.find((x) => x.id === id)!;
  const req: MockRequest = { op, sellerId: "12345", env: "stage", path: o.path ?? {}, query: o.query ?? {}, body: o.body };
  const res = await handlers[id]!(req, state);
  return res as { status: number; body: any };
}

const newItem = (over: Record<string, unknown> = {}) => ({
  barcode: "8680000000061", title: "Seramik Vazo - Mat Beyaz 25 cm", productMainId: "SERAMIK-VAZO-25", brandId: 9001, categoryId: 411, quantity: 25,
  stockCode: "OS-VAZO-25", description: "<p>El yapımı vazo</p>", listPrice: 549.9, salePrice: 479.9, vatRate: 20,
  images: [{ url: "https://cdn.dsmcdn.com/mock/openshelf/1.jpg" }], attributes: [{ attributeId: 47, attributeValueId: 1002 }], ...over,
});

describe("G1 catalog definitions", () => {
  it("has unique ids and a mock handler for every operation", () => {
    const ids = ops.map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ops.length).toBeGreaterThanOrEqual(26);
    for (const id of ids) expect(handlers[id], id).toBeTypeOf("function");
    for (const k of Object.keys(handlers)) expect(ids, k).toContain(k);
  });
  for (const op of ops) {
    it(`${op.id} is well formed`, () => {
      expect(op.docsUrl).toMatch(/^https:\/\/developers\.trendyol\.com\/v2\.0\//);
      expect(["GET", "POST", "PUT", "DELETE", "PATCH"]).toContain(op.method);
      expect(op.path.startsWith("/integration/")).toBe(true);
      const declared = new Set(op.params.filter((p) => p.in === "path").map((p) => p.name));
      for (const m of op.path.matchAll(/\{(\w+)\}/g)) expect(m[1] === "sellerId" || declared.has(m[1]!), `${op.id} {${m[1]}}`).toBe(true);
      for (const p of declared) expect(op.path).toContain(`{${p}}`);
      const names = op.params.map((p) => `${p.in}:${p.name}`);
      expect(new Set(names).size).toBe(names.length);
      expect(op.params.find((p) => p.name === "sellerId")).toBeUndefined();
      expect(op.params.find((p) => /^(authorization|user-agent)$/i.test(p.name))).toBeUndefined();
      for (const p of op.params) { expect(p.description.tr.length).toBeGreaterThan(0); expect(p.description.en.length).toBeGreaterThan(0); }
      for (const tx of [op.title, op.summary]) { expect(tx.tr.trim()).not.toBe(""); expect(tx.en.trim()).not.toBe(""); }
      if (op.notes) { expect(op.notes.tr).not.toBe(""); expect(op.notes.en).not.toBe(""); }
      if (op.rateLimit) { expect(op.rateLimit.tr).not.toBe(""); expect(op.rateLimit.en).not.toBe(""); }
      expect(["read", "write", "destructive"]).toContain(op.risk);
      if (op.body.kind === "json") expect(op.body.example).toBeDefined();
      expect(() => JSON.stringify(op.body.example ?? null)).not.toThrow();
      expect(JSON.parse(JSON.stringify(op.body.example ?? null))).toEqual(op.body.example ?? null);
      if (op.table) { expect(op.table.columns.length).toBeGreaterThanOrEqual(2); for (const c of op.table.columns) { expect(c.label.tr).not.toBe(""); expect(c.label.en).not.toBe(""); } }
      if (op.method === "GET") expect(op.risk).toBe("read");
    });
  }
  it("risk classification", () => {
    const r = (id: string) => ops.find((o) => o.id === id)!.risk;
    expect(r("deleteProducts")).toBe("destructive");
    expect(r("createProducts")).toBe("write");
    expect(r("updatePriceAndInventory")).toBe("write");
    expect(r("filterApprovedProducts")).toBe("read");
    expect(r("getBuyboxInformation")).toBe("read");
  });
  it("body examples of JSON operations run through their own mock handlers without 5xx", async () => {
    for (const op of ops.filter((o) => o.body.kind === "json")) {
      const state = memState();
      const res = await call(state, op.id, { body: op.body.example });
      expect(res.status, op.id).toBeLessThan(500);
    }
  });
});

describe("G1 lookup mocks", () => {
  it("brands, categories, attributes, cargo", async () => {
    const s = memState();
    const brands = await call(s, "getBrands");
    expect(brands.body.brands.length).toBeGreaterThanOrEqual(20);
    expect((await call(s, "getBrandsByName", { query: { name: "Arçelik" } })).body[0].name).toBe("Arçelik");
    const created = await call(s, "createBrand", { body: { name: "Atölye Seramik" } });
    expect(created.status).toBe(201);
    expect((await call(s, "createBrand", { body: { name: "Atölye Seramik" } })).status).toBe(400);
    expect((await call(s, "getBrandsByName", { query: { name: "Atölye" } })).body).toHaveLength(1);
    const tree = (await call(s, "getCategoryTree")).body;
    expect(tree.length).toBeGreaterThan(2);
    const filtered = (await call(s, "getCategoryTree", { query: { name: "Mum" } })).body;
    expect(JSON.stringify(filtered)).toContain("613");
    for (const id of [411, 512, 613, 714, 815]) {
      const a = (await call(s, "getCategoryAttributes", { path: { categoryId: id } })).body;
      expect(a.categoryAttributes.length).toBeGreaterThan(0);
    }
    const req = (await call(s, "getCategoryAttributes", { path: { categoryId: 411 }, query: { required: true } })).body.categoryAttributes;
    expect(req.every((x: any) => x.required)).toBe(true);
    const vals = (await call(s, "getCategoryAttributeValues", { path: { categoryId: 411, attributeId: 47 } })).body;
    expect(vals.content[0].attributeValueId).toBe(1001);
    expect((await call(s, "getCategoryAttributeValues", { path: { categoryId: 411, attributeId: 999 } })).status).toBe(404);
    const cargo = (await call(s, "getCargoProviders")).body;
    expect(cargo.map((c: any) => c.code)).toContain("YKMP");
  });
});

describe("G1 product flows", () => {
  it("create -> unapproved list -> poll batch -> approved list", async () => {
    const s = memState();
    const created = await call(s, "createProducts", { body: { items: [newItem()] } });
    expect(created.status).toBe(200);
    const batchId = created.body.batchRequestId as string;
    expect(batchId).toBeTruthy();
    const un = await call(s, "filterUnapprovedProducts");
    expect(un.body.content.map((c: any) => c.barcode)).toContain("8680000000061");
    expect(un.body.content[0].status).toBe("pendingApproval");
    expect((await call(s, "getProductBase", { path: { barcode: "8680000000061" } })).body.approved).toBe(false);
    const res = await call(s, "getBatchRequestResult", { path: { batchRequestId: batchId } });
    expect(res.body).toMatchObject({ status: "COMPLETED", itemCount: 1, failedItemCount: 0, batchRequestType: "ProductV2OnBoarding" });
    expect(res.body.items[0].status).toBe("SUCCESS");
    expect((await call(s, "filterUnapprovedProducts")).body.content).toHaveLength(0);
    const ap = await call(s, "filterApprovedProducts", { query: { barcode: "8680000000061" } });
    expect(ap.body.totalElements).toBe(1);
    expect(ap.body.content[0].variants[0].barcode).toBe("8680000000061");
    expect((await call(s, "getProductBase", { path: { barcode: "8680000000061" } })).body.approved).toBe(true);
  });

  it("approves automatically after a few seconds", async () => {
    const s = memState();
    await call(s, "createProducts", { body: { items: [newItem()] } });
    s.advance(6000);
    expect((await call(s, "filterApprovedProducts", { query: { barcode: "8680000000061" } })).body.totalElements).toBe(1);
  });

  it("validation errors return Trendyol-style 400 bodies", async () => {
    const s = memState();
    const bad = await call(s, "createProducts", { body: { items: [newItem({ barcode: undefined, title: "x".repeat(101), listPrice: 100, salePrice: 200, images: [] })] } });
    expect(bad.status).toBe(400);
    expect(bad.body.errors.length).toBeGreaterThanOrEqual(3);
    expect(bad.body.errors[0]).toMatchObject({ errorCode: "400" });
    expect(bad.body.errors[0].key).toBeTruthy();
    const dup = await call(s, "createProducts", { body: { items: [newItem(), newItem()] } });
    expect(dup.status).toBe(400);
    expect((await call(s, "createProducts", { body: { items: [] } })).status).toBe(400);
    expect((await call(s, "createProducts", { body: { items: Array.from({ length: 1001 }, () => newItem()) } })).status).toBe(400);
  });

  it("batch-level failures: unknown brand, non-leaf category, missing required attribute, existing barcode", async () => {
    const s = memState();
    const r = await call(s, "createProducts", { body: { items: [
      newItem({ barcode: "B1", brandId: 424242 }), newItem({ barcode: "B2", categoryId: 410 }), newItem({ barcode: "B3", attributes: [] }), newItem({ barcode: "8680000000011" }),
    ] } });
    expect(r.status).toBe(200);
    const res = await call(s, "getBatchRequestResult", { path: { batchRequestId: r.body.batchRequestId } });
    expect(res.body.failedItemCount).toBe(4);
    expect(res.body.items.every((i: any) => i.status === "FAILED" && i.failureReasons.length)).toBe(true);
    expect((await call(s, "filterUnapprovedProducts")).body.content).toHaveLength(0);
    expect((await call(s, "getBatchRequestResult", { path: { batchRequestId: "nope" } })).status).toBe(404);
  });

  it("price/stock update is visible in the filters and enforces limits", async () => {
    const s = memState();
    const up = await call(s, "updatePriceAndInventory", { body: { items: [
      { barcode: "8680000000011", quantity: 77, salePrice: 300, listPrice: 449 },
      { barcode: "8680000000012", quantity: 20001 },
      { barcode: "8680000000021", salePrice: 500, listPrice: 299 },
      { barcode: "UNKNOWN-1", quantity: 1 },
    ] } });
    expect(up.status).toBe(200);
    const res = (await call(s, "getBatchRequestResult", { path: { batchRequestId: up.body.batchRequestId } })).body;
    expect(res.batchRequestType).toBe("ProductInventoryUpdate");
    expect(res.status).toBeUndefined();
    expect(res.items.map((i: any) => i.status)).toEqual(["SUCCESS", "FAILED", "FAILED", "FAILED"]);
    const inv = (await call(s, "filterApprovedProductsInventoryAndPrice", { query: { barcode: "8680000000011" } })).body.content[0].variants[0];
    expect(inv).toMatchObject({ quantity: 77, salePrice: 300, listPrice: 449 });
    expect(inv.stockLastModifiedDate).not.toBeNull();
    const full = (await call(s, "filterApprovedProducts", { query: { barcode: "8680000000011" } })).body.content[0].variants[0];
    expect(full.price.salePrice).toBe(300);
    expect(full.stock.quantity).toBe(77);
    // identical request within 15 minutes is rejected
    const again = await call(s, "updatePriceAndInventory", { body: { items: [
      { barcode: "8680000000011", quantity: 77, salePrice: 300, listPrice: 449 },
      { barcode: "8680000000012", quantity: 20001 },
      { barcode: "8680000000021", salePrice: 500, listPrice: 299 },
      { barcode: "UNKNOWN-1", quantity: 1 },
    ] } });
    expect(again.status).toBe(400);
    expect((await call(s, "updatePriceAndInventory", { body: { items: Array.from({ length: 1001 }, (_, i) => ({ barcode: `X${i}`, quantity: 1 })) } })).status).toBe(400);
    // out of stock flips onSale
    await call(s, "updatePriceAndInventory", { body: { items: [{ barcode: "8680000000011", quantity: 0 }] } });
    expect((await call(s, "filterApprovedProducts", { query: { barcode: "8680000000011", status: "onSale" } })).body.totalElements).toBe(0);
    expect((await call(s, "filterApprovedProducts", { query: { status: "notOnSale" } })).body.totalElements).toBeGreaterThanOrEqual(2);
  });

  it("filters honour barcode/stockCode/title paging and page size limits", async () => {
    const s = memState();
    const all = (await call(s, "filterApprovedProducts")).body;
    expect(all.totalElements).toBe(6);
    expect(all.content[0].variants[0]).toHaveProperty("productUrl");
    expect((await call(s, "filterApprovedProducts", { query: { stockCode: "DEMO-MUM-SETI-1" } })).body.content[0].variants[0].barcode).toBe("8680000000031");
    expect((await call(s, "filterApprovedProducts", { query: { barcodes: ["8680000000011", "8680000000021"] } })).body.totalElements).toBe(2);
    const p1 = (await call(s, "filterApprovedProducts", { query: { page: 0, size: 2 } })).body;
    expect(p1).toMatchObject({ page: 0, size: 2, totalPages: 3 });
    expect(p1.nextPageToken).toBeTruthy();
    const p2 = (await call(s, "filterApprovedProducts", { query: { size: 2, nextPageToken: p1.nextPageToken } })).body;
    expect(p2.page).toBe(1);
    expect((await call(s, "filterApprovedProducts", { query: { size: 101 } })).status).toBe(400);
    expect((await call(s, "filterUnapprovedProducts", { query: { size: 1001 } })).status).toBe(400);
    const future = (await call(s, "filterApprovedProducts", { query: { startDate: s.now() + 1000, dateQueryType: "VARIANT_CREATED_DATE" } })).body;
    expect(future.totalElements).toBe(0);
    expect((await call(s, "getProductBase", { path: { barcode: "nope" } })).status).toBe(404);
  });

  it("archive toggles archived, delete only removes allowed products", async () => {
    const s = memState();
    const a = await call(s, "archiveProducts", { body: { items: [{ barcode: "8680000000051", archived: true }] } });
    expect(a.status).toBe(200);
    expect((await call(s, "filterApprovedProducts", { query: { status: "archived" } })).body.content[0].variants[0].archived).toBe(true);
    expect((await call(s, "archiveProducts", { body: { items: [{ barcode: "NOPE", archived: true }] } })).status).toBe(404);
    expect((await call(s, "archiveProducts", { body: { items: [{ barcode: "8680000000051" }] } })).status).toBe(400);
    // approved + not archived -> FAILED; archived < 1 day -> FAILED
    const d1 = await call(s, "deleteProducts", { body: { items: [{ barcode: "8680000000011" }, { barcode: "8680000000051" }, { barcode: "NOPE" }] } });
    const r1 = (await call(s, "getBatchRequestResult", { path: { batchRequestId: d1.body.batchRequestId } })).body;
    expect(r1.items.map((i: any) => i.status)).toEqual(["FAILED", "FAILED", "FAILED"]);
    // after more than one day the archived product can be deleted
    s.advance(86_400_000 + 1000);
    const d2 = await call(s, "deleteProducts", { body: { items: [{ barcode: "8680000000051" }] } });
    expect((await call(s, "getBatchRequestResult", { path: { batchRequestId: d2.body.batchRequestId } })).body.items[0].status).toBe("SUCCESS");
    expect((await call(s, "getProductBase", { path: { barcode: "8680000000051" } })).status).toBe(404);
    // unapproved products can be deleted right away
    await call(s, "createProducts", { body: { items: [newItem({ barcode: "TMP-1" })] } });
    const d3 = await call(s, "deleteProducts", { body: { items: [{ barcode: "TMP-1" }] } });
    expect((await call(s, "getBatchRequestResult", { path: { batchRequestId: d3.body.batchRequestId } })).body.items[0].status).toBe("SUCCESS");
    expect((await call(s, "getProductBase", { path: { barcode: "TMP-1" } })).status).toBe(404);
  });

  it("unarchive restores sale state", async () => {
    const s = memState();
    await call(s, "archiveProducts", { body: { items: [{ barcode: "8680000000011", archived: true }] } });
    await call(s, "archiveProducts", { body: { items: [{ barcode: "8680000000011", archived: false }] } });
    expect((await call(s, "filterApprovedProducts", { query: { barcode: "8680000000011" } })).body.content[0].variants[0]).toMatchObject({ archived: false, onSale: true });
  });

  it("buybox, unlock", async () => {
    const s = memState();
    const bb = await call(s, "getBuyboxInformation", { body: { barcodes: ["8680000000011", "8680000000021"] } });
    expect(bb.body.buyboxInfo).toHaveLength(2);
    expect(bb.body.buyboxInfo[0]).toHaveProperty("buyboxOrder");
    expect((await call(s, "getBuyboxInformation", { body: { barcodes: Array.from({ length: 11 }, (_, i) => `B${i}`) } })).status).toBe(400);
    // lock one product via state, then unlock
    const products = (await s.get<any[]>("ty:products"))!;
    products.find((p) => p.barcode === "8680000000041").locked = true;
    await s.set("ty:products", products);
    expect((await call(s, "filterApprovedProducts", { query: { status: "locked" } })).body.totalElements).toBe(1);
    const un = await call(s, "unlockProducts", { body: { items: [{ barcode: "8680000000041" }] } });
    expect((await call(s, "getBatchRequestResult", { path: { batchRequestId: un.body.batchRequestId } })).body.items[0].status).toBe("SUCCESS");
    expect((await call(s, "filterApprovedProducts", { query: { status: "locked" } })).body.totalElements).toBe(0);
    expect((await call(s, "unlockProducts", { body: { items: [{ barcode: "NOPE" }] } })).status).toBe(404);
    expect((await call(s, "unlockProducts", { body: { items: [{ barcode: "bad barcode!" }] } })).status).toBe(400);
  });

  it("updates: unapproved, content (+audits/QC), variant, delivery", async () => {
    const s = memState();
    await call(s, "createProducts", { body: { items: [newItem({ barcode: "UP-1" })] } });
    const u = await call(s, "updateUnapprovedProducts", { body: { items: [{ barcode: "UP-1", title: "Yeni Başlık Vazo" }, { barcode: "8680000000011", title: "x" }] } });
    const ur = (await call(s, "getBatchRequestResult", { path: { batchRequestId: u.body.batchRequestId } })).body;
    expect(ur.items.map((i: any) => i.status)).toEqual(["SUCCESS", "FAILED"]);
    expect((await call(s, "filterUnapprovedProducts", { query: { barcode: "UP-1" } })).body.content[0].title).toBe("Yeni Başlık Vazo");

    const c = await call(s, "updateContentBulk", { body: { items: [{ contentId: 100000, title: "Seramik Vazo - S (El Yapımı)", description: `${"Seramik Vazo - S"} — OpenShelf demo ürünü.` }] } });
    expect(c.status).toBe(200);
    const audits = (await call(s, "getUpdateAudits", { path: { contentId: 100000 } })).body;
    expect(audits.content).toHaveLength(1);
    const types = Object.fromEntries(audits.content[0].updates.map((x: any) => [x.type, x.status]));
    expect(types).toEqual({ TITLE: "SUCCESS", DESCRIPTION: "FAIL" });
    expect((await call(s, "getUpdateAudits", { path: { contentId: 100000 }, query: { status: "RUNNING" } })).body.content).toHaveLength(0);
    expect((await call(s, "updateContentBulk", { body: { items: [{ title: "x" }] } })).status).toBe(400);

    const v = await call(s, "updateVariantBulk", { body: { items: [{ barcode: "8680000000011", stockCode: "NEW-STOCK", vatRate: 10 }, { barcode: "8680000000021", channels: [] }] } });
    expect((await call(s, "getBatchRequestResult", { path: { batchRequestId: v.body.batchRequestId } })).body.items.map((i: any) => i.status)).toEqual(["SUCCESS", "FAILED"]);
    expect((await call(s, "filterApprovedProducts", { query: { stockCode: "NEW-STOCK" } })).body.content[0].variants[0].vatRate).toBe(10);

    const d = await call(s, "updateDeliveryInfoBulk", { body: { items: [{ barcode: "8680000000011", deliveryOptions: { deliveryDuration: 0 } }] } });
    expect((await call(s, "getBatchRequestResult", { path: { batchRequestId: d.body.batchRequestId } })).body.items[0].status).toBe("SUCCESS");
    expect((await call(s, "filterApprovedProducts", { query: { barcode: "8680000000011" } })).body.content[0].variants[0].deliveryOption.deliveryDuration).toBe(0);
  });

  it("video and warranty", async () => {
    const s = memState();
    expect((await call(s, "createVideo", { body: { title: "ab", videoUrl: "ftp://x", productContentIds: [] } })).status).toBe(400);
    const v = await call(s, "createVideo", { body: { title: "Vazo Tanıtım", videoUrl: "https://cdn.example.com/v.mp4", productContentIds: ["100000"] } });
    expect(v.status).toBe(200);
    expect((await call(s, "getVideos")).body.data[0].status).toBe("IN_PROGRESS");
    s.advance(11_000);
    const list = (await call(s, "getVideos", { query: { id: v.body.videoId } })).body;
    expect(list.data[0]).toMatchObject({ status: "SUCCESS", isApproved: true });
    expect((await call(s, "getVideos", { query: { sellerIntegrationStatus: "BOGUS" } })).status).toBe(400);
    expect((await call(s, "createWarrantyDocument", { body: {} })).status).toBe(400);
    expect((await call(s, "createWarrantyDocument", { body: { shipmentPackageId: "1", lineId: "2" } })).status).toBe(200);
  });
});

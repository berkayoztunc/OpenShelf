import { describe, it, expect } from "vitest";
import type { MockRequest, MockResponse, MockState, TrendyolOperation } from "@openshelf/shared";
import { operations } from "../src/catalog/ops/orders";
import { mockHandlers } from "../src/catalog/mock/orders";

function memState(start = Date.parse("2026-10-26T10:00:00Z")): MockState & { advance(ms: number): void } {
  const m = new Map<string, unknown>(); const c = new Map<string, number>(); let now = start;
  return {
    async get<T>(k: string) { return m.has(k) ? (structuredClone(m.get(k)) as T) : undefined; },
    async set(k, v) { m.set(k, structuredClone(v)); },
    async nextId(ns) { const n = (c.get(ns) ?? 0) + 1; c.set(ns, n); return n; },
    now: () => now, advance(ms) { now += ms; },
  };
}
const op = (id: string) => operations.find((o) => o.id === id)!;
async function call(st: MockState, id: string, o: { path?: Record<string, string | number>; query?: Record<string, unknown>; body?: unknown } = {}): Promise<MockResponse> {
  const req: MockRequest = { op: op(id), sellerId: "2738", env: "stage", path: o.path ?? {}, query: o.query ?? {}, body: o.body };
  return mockHandlers[id]!(req, st);
}
const pkgs = async (st: MockState, query: Record<string, unknown> = {}) => {
  const r = await call(st, "getShipmentPackages", { query: { startDate: st.now() - 14 * 86_400_000, endDate: st.now(), ...query } });
  expect(r.status).toBe(200);
  return (r.body as any).content as any[];
};
const pidOf = async (st: MockState, status: string) => (await pkgs(st, { status }))[0];

describe("catalog g2 static", () => {
  it("has the full operation set with unique ids", () => {
    expect(operations.length).toBe(32); // updateTestClaimToWaitingInAction lives in the claims group
    expect(new Set(operations.map((o) => o.id)).size).toBe(operations.length);
  });
  for (const o of operations as TrendyolOperation[]) {
    it(`op ${o.id} is well-formed`, () => {
      expect(o.docsUrl).toMatch(/^https:\/\/developers\.trendyol\.com\/v2\.0\/reference\/[a-z0-9]+$/);
      expect(["GET", "POST", "PUT", "DELETE", "PATCH"]).toContain(o.method);
      expect(o.path).toMatch(/^\/integration\/[A-Za-z0-9/_{}.-]+$/);
      const declared = new Set(o.params.filter((p) => p.in === "path").map((p) => p.name));
      for (const m of o.path.matchAll(/\{(\w+)\}/g)) expect(m[1] === "sellerId" || declared.has(m[1]!)).toBe(true);
      for (const p of declared) expect(o.path).toContain(`{${p}}`);
      expect(new Set(o.params.map((p) => p.name)).size).toBe(o.params.length);
      expect(o.params.some((p) => ["sellerId", "Authorization", "User-Agent"].includes(p.name))).toBe(false);
      expect(JSON.parse(JSON.stringify(o.body.example ?? null))).toEqual(o.body.example ?? null);
      if (o.method !== "GET" && o.body.kind === "json") expect(o.body.example).toBeDefined();
      for (const t of [o.title, o.summary, ...o.params.map((p) => p.description), ...(o.body.fields ?? []).map((f) => f.description)]) { expect(t.tr.length).toBeGreaterThan(2); expect(t.en.length).toBeGreaterThan(2); }
      expect(["read", "write", "destructive"]).toContain(o.risk);
      expect(typeof mockHandlers[o.id]).toBe("function");
    });
  }
  it("test ops are stage only and risk levels sensible", () => {
    for (const id of ["createTestOrder", "updateTestOrderStatus"]) expect(op(id).envs).toEqual(["stage"]);
    expect(op("cancelOrderPackageItem").risk).toBe("destructive");
    expect(op("manualReturnByPackageId").risk).toBe("destructive");
    expect(op("getShipmentPackages").pagination).toMatchObject({ maxSize: 200, firstPage: 0 });
  });
  it("every handler belongs to an op", () => { for (const k of Object.keys(mockHandlers)) expect(op(k)).toBeDefined(); });
});

describe("mock flows", () => {
  it("lists with filters and paging", async () => {
    const st = memState();
    const all = await pkgs(st);
    expect(all.length).toBeGreaterThanOrEqual(5);
    const created = await pkgs(st, { status: "Created,Picking" });
    expect(created.length).toBeGreaterThan(0);
    expect(created.every((p) => ["Created", "Picking"].includes(p.status))).toBe(true);
    const wide = await call(st, "getShipmentPackages", { query: { startDate: st.now() - 14 * 86_400_000, endDate: st.now(), size: 2, page: 1 } });
    expect(wide.body).toMatchObject({ page: 1, size: 2 });
    expect((wide.body as any).content.length).toBe(2);
    const one = await pkgs(st, { orderNumber: all[0].orderNumber });
    expect(one.every((p) => p.orderNumber === all[0].orderNumber)).toBe(true);
    const byId = await pkgs(st, { shipmentPackageIds: `${all[0].shipmentPackageId},${all[1].shipmentPackageId}` });
    expect(byId.length).toBe(2);
    expect((await call(st, "getShipmentPackages", { query: { size: 500 } })).status).toBe(400);
    expect((await call(st, "getShipmentPackages", { query: { startDate: 1, endDate: 1 + 30 * 86_400_000 } })).status).toBe(400);
    expect((await call(st, "getShipmentPackages", { query: { status: "Nope" } })).status).toBe(400);
    expect(JSON.stringify(all)).not.toContain("_cargoCode");
  });
  it("seeds all statuses", async () => {
    const st = memState();
    const r = await call(st, "getShipmentPackages", { query: { startDate: st.now() - 14 * 86_400_000, endDate: st.now(), status: "Created,Picking,Invoiced,Shipped,Delivered,Cancelled,UnSupplied,Returned", size: 200 } });
    const seen = new Set(((r.body as any).content as any[]).map((p) => p.status));
    expect(seen.size).toBeGreaterThanOrEqual(7);
    const old = await call(st, "getShipmentPackages", { query: { startDate: st.now() - 14 * 86_400_000, endDate: st.now(), status: "Returned" } });
    expect((old.body as any).totalElements).toBeLessThanOrEqual(1);
  });
  it("stream pages with a cursor", async () => {
    const st = memState();
    const seen: number[] = []; let cursor: string | undefined; let n = 0;
    do {
      const r = await call(st, "getShipmentPackagesStream", { query: { size: 4, ...(cursor ? { nextCursor: cursor } : {}) } });
      expect(r.status).toBe(200);
      const b = r.body as any; seen.push(...b.content.map((p: any) => p.shipmentPackageId));
      cursor = b.hasMore ? b.nextCursor : undefined; n++;
    } while (cursor && n < 10);
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen.length).toBeGreaterThan(4);
    const first = (await call(st, "getShipmentPackagesStream", { query: { size: 2 } })).body as any;
    expect((await call(st, "getShipmentPackagesStream", { query: { size: 2, nextCursor: first.nextCursor, packageItemStatuses: "Created" } })).status).toBe(400);
    expect((await call(st, "getShipmentPackagesStream", { query: { nextCursor: "garbage" } })).status).toBe(400);
  });
  it("Created -> Picking -> Invoiced and rejects invalid transitions", async () => {
    const st = memState(); const p = await pidOf(st, "Created"); const path = { packageId: p.shipmentPackageId };
    const lines = p.lines.map((l: any) => ({ lineId: l.lineId, quantity: l.quantity }));
    expect((await call(st, "updatePackage", { path, body: { lines, params: { invoiceNumber: "X1" }, status: "Invoiced" } })).status).toBe(400);
    expect((await call(st, "updatePackage", { path, body: { lines, params: {}, status: "Picking" } })).status).toBe(200);
    expect((await call(st, "updatePackage", { path, body: { lines, params: {}, status: "Picking" } })).status).toBe(400);
    expect((await call(st, "updatePackage", { path, body: { lines, params: { invoiceNumber: "EME2018000025208" }, status: "Invoiced" } })).status).toBe(200);
    expect((await call(st, "updatePackage", { path, body: { status: "Shipped" } })).status).toBe(400);
    const after = (await pkgs(st, { shipmentPackageIds: p.shipmentPackageId }))[0];
    expect(after.status).toBe("Invoiced");
    expect(after.packageHistories.map((h: any) => h.status)).toEqual(["Created", "Picking", "Invoiced"]);
    expect((await call(st, "updatePackage", { path: { packageId: 1 }, body: { status: "Picking" } })).status).toBe(404);
  });
  it("cancels items fully and partially", async () => {
    const st = memState(); const all = await pkgs(st, { status: "Created" });
    const multi = all.find((p) => p.lines.length > 1)!; const path = { packageId: multi.shipmentPackageId };
    expect((await call(st, "cancelOrderPackageItem", { path, body: { lines: [{ lineId: multi.lines[0].lineId, quantity: 1 }], reasonId: 999 } })).status).toBe(400);
    expect((await call(st, "cancelOrderPackageItem", { path, body: { lines: [{ lineId: multi.lines[0].lineId, quantity: 99 }], reasonId: 500 } })).status).toBe(400);
    expect((await call(st, "cancelOrderPackageItem", { path, body: { lines: [{ lineId: multi.lines[0].lineId, quantity: multi.lines[0].quantity }], reasonId: 500 } })).status).toBe(200);
    const same = await pkgs(st, { orderNumber: multi.orderNumber });
    expect(same.length).toBe(2);
    const old = same.find((p) => p.shipmentPackageId === multi.shipmentPackageId)!;
    const fresh = same.find((p) => p.shipmentPackageId !== multi.shipmentPackageId)!;
    expect(old.status).toBe("Cancelled"); expect(old.lines[0].cancelReasonCode).toBe(500);
    expect(fresh.status).toBe("Created"); expect(fresh.createdBy).toBe("cancel"); expect(fresh.cargoTrackingNumber).not.toBe(multi.cargoTrackingNumber);
    const single = await pidOf(st, "Picking");
    const r = await call(st, "cancelOrderPackageItem", { path: { packageId: single.shipmentPackageId }, body: { lines: single.lines.map((l: any) => ({ lineId: l.lineId, quantity: l.quantity })), reasonId: 501 } });
    expect(r.status).toBe(200);
    expect((await pkgs(st, { shipmentPackageIds: single.shipmentPackageId }))[0].status).toBe("Cancelled");
    const shipped = await pidOf(st, "Shipped");
    expect((await call(st, "cancelOrderPackageItem", { path: { packageId: shipped.shipmentPackageId }, body: { lines: [{ lineId: shipped.lines[0].lineId, quantity: 1 }], reasonId: 500 } })).status).toBe(400);
  });
  it("splits packages in all four ways", async () => {
    const st = memState(); const all = await pkgs(st, { status: "Created" });
    const multi = all.find((p) => p.lines.length > 1)!;
    const r = await call(st, "splitShipmentPackage", { path: { packageId: multi.shipmentPackageId }, body: { orderLineIds: [multi.lines[0].lineId] } });
    expect(r.status).toBe(200); expect((r.body as any).newPackageId).toBeGreaterThan(0);
    const parts = await pkgs(st, { orderNumber: multi.orderNumber });
    expect(parts.find((p) => p.shipmentPackageId === multi.shipmentPackageId).status).toBe("UnPacked");
    expect(parts.filter((p) => p.createdBy === "split").length).toBe(2);
    expect((await call(st, "splitShipmentPackage", { path: { packageId: multi.shipmentPackageId }, body: { orderLineIds: [multi.lines[0].lineId] } })).status).toBe(400);
    // by quantity
    const q = (await pkgs(st, { status: "Created" })).find((p) => p.lines.some((l: any) => l.quantity >= 2))!;
    const line = q.lines.find((l: any) => l.quantity >= 2);
    const rq = await call(st, "splitShipmentPackageByQuantity", { path: { packageId: q.shipmentPackageId }, body: { quantitySplit: [{ orderLineId: line.lineId, quantities: [1] }] } });
    expect(rq.status).toBe(200); expect((rq.body as any).newPackageIds.length).toBe(1);
    // multi split
    const m = (await pkgs(st, { status: "Created" })).find((p) => p.lines.length > 1 && p.createdBy !== "split")!;
    if (m) {
      const rm = await call(st, "multiSplitShipmentPackage", { path: { packageId: m.shipmentPackageId }, body: { splitGroups: [{ orderLineIds: [m.lines[0].lineId] }, { orderLineIds: [m.lines[1].lineId] }] } });
      expect(rm.status).toBe(200); expect((rm.body as any).results.length).toBe(2);
    }
    // split multi by quantity
    const s = (await pkgs(st, { status: "Picking" })).find((p) => p.lines.length > 1)!;
    const rs = await call(st, "splitMultiPackageByQuantity", { path: { packageId: s.shipmentPackageId }, body: { splitPackages: [{ packageDetails: [{ orderLineId: s.lines[0].lineId, quantities: 1 }] }] } });
    expect(rs.status).toBe(200);
    expect((await call(st, "splitMultiPackageByQuantity", { path: { packageId: s.shipmentPackageId }, body: { splitPackages: [] } })).status).toBe(400);
  });
  it("box info, warehouse, labor, extend, cargo provider, delivered by service", async () => {
    const st = memState(); const p = await pidOf(st, "Picking"); const path = { packageId: p.shipmentPackageId };
    expect((await call(st, "updateBoxInfo", { path, body: { deci: 3.2, boxQuantity: 2 } })).status).toBe(200);
    expect((await call(st, "updateBoxInfo", { path, body: { deci: -1, boxQuantity: 2 } })).status).toBe(400);
    expect((await call(st, "updateWarehouse", { path, body: { warehouseId: 555 } })).status).toBe(200);
    expect((await call(st, "updateLaborCosts", { path, body: [{ orderLineId: p.lines[0].lineId, laborCostPerItem: 12.5 }] })).status).toBe(200);
    expect((await call(st, "updateLaborCosts", { path, body: [{ orderLineId: 1, laborCostPerItem: 12.5 }] })).status).toBe(400);
    expect((await call(st, "extendAgreedDeliveryDate", { path, body: { extendedDayCount: 2 } })).status).toBe(200);
    expect((await call(st, "extendAgreedDeliveryDate", { path, body: { extendedDayCount: 2 } })).status).toBe(400);
    const cur = (await pkgs(st, { shipmentPackageIds: p.shipmentPackageId }))[0];
    expect(cur.deci).toBe(3.2); expect(cur.warehouseId).toBe(555); expect(cur.lines[0].laborCostPerItem).toBe(12.5);
    expect(cur.extendedAgreedDeliveryDate).toBe(cur.agreedDeliveryDate + 2 * 86_400_000);
    expect((await call(st, "changeCargoProvider", { path, body: { cargoProvider: "NOPE" } })).status).toBe(400);
    expect((await call(st, "changeCargoProvider", { path, body: { cargoProvider: "SURATMP" } })).status).toBe(200);
    expect((await call(st, "changeCargoProvider", { path, body: { cargoProvider: "PTTMP" } })).status).toBe(400);
    st.advance(6 * 60_000);
    expect((await call(st, "changeCargoProvider", { path, body: { cargoProvider: "PTTMP" } })).status).toBe(200);
    const after = (await pkgs(st, { shipmentPackageIds: p.shipmentPackageId }))[0];
    expect(after.cargoProviderName).toContain("PTT"); expect(after.cargoTrackingNumber).not.toBe(p.cargoTrackingNumber);
    const sh = await pidOf(st, "Shipped");
    expect((await call(st, "deliveredByService", { path: { packageId: sh.shipmentPackageId } })).status).toBe(200);
  });
  it("alternative delivery and manual deliver/return", async () => {
    const st = memState(); const inv = await pidOf(st, "Invoiced");
    expect((await call(st, "processAlternativeDelivery", { path: { packageId: inv.shipmentPackageId }, body: { isPhoneNumber: false, trackingInfo: "nope" } })).status).toBe(400);
    expect((await call(st, "processAlternativeDelivery", { path: { packageId: inv.shipmentPackageId }, body: { isPhoneNumber: false, trackingInfo: "https://t.example.com/x", params: {}, boxQuantity: 1, deci: 1.4 } })).status).toBe(200);
    expect((await pkgs(st, { shipmentPackageIds: inv.shipmentPackageId }))[0].status).toBe("Shipped");
    const pick = await pidOf(st, "Picking");
    expect((await call(st, "processAlternativeDeliveryDigital", { path: { packageId: pick.shipmentPackageId }, body: { isPhoneNumber: true, trackingInfo: "5555555555", params: { digitalCode: "abc" } } })).status).toBe(400);
    expect((await call(st, "processAlternativeDeliveryDigital", { path: { packageId: pick.shipmentPackageId }, body: { isPhoneNumber: true, trackingInfo: "5555555555", params: { digitalCode: "AX4567fasdf" } } })).status).toBe(200);
    const shipped = await pkgs(st, { status: "Shipped" });
    expect((await call(st, "manualDeliverByPackageId", { path: { packageId: shipped[0].shipmentPackageId } })).status).toBe(200);
    expect((await call(st, "manualDeliverByPackageId", { path: { packageId: shipped[0].shipmentPackageId } })).status).toBe(400);
    expect((await call(st, "manualDeliverByTrackingNumber", { path: { cargoTrackingNumber: String(shipped[1].cargoTrackingNumber) } })).status).toBe(200);
    expect((await call(st, "manualDeliverByTrackingNumber", { path: { cargoTrackingNumber: "0" } })).status).toBe(400);
    const sh2 = await pkgs(st, { status: "Shipped" });
    expect((await call(st, "manualReturnByPackageId", { path: { packageId: sh2[0].shipmentPackageId } })).status).toBe(200);
    expect((await pkgs(st, { shipmentPackageIds: sh2[0].shipmentPackageId }))[0].status).toBe("Returned");
    if (sh2[1]) expect((await call(st, "manualReturnByTrackingNumber", { path: { cargoTrackingNumber: String(sh2[1].cargoTrackingNumber) } })).status).toBe(200);
  });
  it("address lookups", async () => {
    const st = memState();
    const c = (await call(st, "getTurkeyCities")).body as any[];
    expect(c.length).toBe(81); expect(c.find((x) => x.id === 34).name).toBe("İstanbul"); expect(c.find((x) => x.id === 6).name).toBe("Ankara"); expect(c.find((x) => x.id === 35).name).toBe("İzmir");
    const d = (await call(st, "getTurkeyDistricts", { path: { CityCode: 34 } })).body as any[];
    expect(d.some((x) => x.name === "Kadıköy")).toBe(true);
    const n = (await call(st, "getTurkeyNeighborhoods", { path: { CityCode: 34, DistrictCode: d[0].id } })).body as any[];
    expect(n.length).toBeGreaterThan(0);
    expect((await call(st, "getTurkeyDistricts", { path: { CityCode: 999 } })).status).toBe(404);
    expect(((await call(st, "getCountries")).body as any[]).some((x) => x.code === "TR")).toBe(true);
    expect(((await call(st, "getCitiesByCountry", { path: { CountryCode: "AE" } })).body as any[]).length).toBeGreaterThan(0);
    expect(((await call(st, "getDistrictsByCity", { path: { CountryCode: "AE", cityId: 1 } })).body as any[]).length).toBeGreaterThan(0);
    const az = (await call(st, "getAzerbaijanCities")).body as any[];
    expect(((await call(st, "getAzerbaijanDistricts", { path: { cityCode: az[0].id } })).body as any[]).length).toBeGreaterThan(0);
  });
  it("common label create then get", async () => {
    const st = memState(); const p = (await pkgs(st)).find((x) => /Aras|Express/.test(x.cargoProviderName))!; const tn = String(p.cargoTrackingNumber);
    expect((await call(st, "getCommonLabel", { path: { cargoTrackingNumber: tn } })).status).toBe(400);
    expect((await call(st, "createCommonLabel", { path: { cargoTrackingNumber: "1" }, body: { format: "ZPL" } })).status).toBe(404);
    expect((await call(st, "createCommonLabel", { path: { cargoTrackingNumber: tn }, body: { format: "ZPL", boxQuantity: 2, volumetricHeight: 3.5 } })).status).toBe(200);
    const g = await call(st, "getCommonLabel", { path: { cargoTrackingNumber: tn } });
    expect((g.body as any).data.length).toBe(2); expect((g.body as any).data[0]).toMatchObject({ format: "ZPL" });
    expect((g.body as any).data[0].label).toContain("^XA");
  });
  it("test order appears in the list and can be advanced", async () => {
    const st = memState(); const before = (await pkgs(st)).length;
    const body = (op("createTestOrder").body.example) as any;
    const r = await call(st, "createTestOrder", { body });
    expect(r.status).toBe(200); const orderNumber = (r.body as any).orderNumber;
    expect(orderNumber).toMatch(/^\d{11}$/);
    const found = await pkgs(st, { orderNumber });
    expect(found.length).toBe(1); expect(found[0].status).toBe("Created"); expect(found[0].lines[0].barcode).toBe("8680000000011");
    expect((await pkgs(st)).length).toBe(before + 1);
    const path = { packageId: found[0].shipmentPackageId }; const lines = [{ lineId: found[0].lines[0].lineId, quantity: 2 }];
    expect((await call(st, "updateTestOrderStatus", { path, body: { lines, params: {}, status: "Delivered" } })).status).toBe(400);
    expect((await call(st, "updateTestOrderStatus", { path, body: { lines, params: {}, status: "Shipped" } })).status).toBe(200);
    expect((await call(st, "updateTestOrderStatus", { path, body: { lines, params: {}, status: "Delivered" } })).body).toBe("200 OK");
    expect((await call(st, "updateTestOrderStatus", { path, body: { lines, params: {}, status: "Shipped" } })).status).toBe(400);
    expect((await pkgs(st, { orderNumber }))[0].status).toBe("Delivered");
    expect((await call(st, "createTestOrder", { body: { ...body, lines: [{ barcode: "0000", quantity: 1 }] } })).status).toBe(400);
  });
});

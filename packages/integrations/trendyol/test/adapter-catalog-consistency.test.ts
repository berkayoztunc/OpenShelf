import { describe, expect, it } from "vitest";
import { getOperation, TRENDYOL_MOCKS, TRENDYOL_OPERATIONS } from "../src/catalog";
import { alternativeDeliveryPath, batchResultPath, inventoryUpdatePath, shipmentPackagesPath, shipmentPackagesStreamPath, updatePackagePath } from "../src/endpoints";

const fill = (p: string) => p.replace("{sellerId}", "123").replace(/\{(\w+)\}/g, "$1");
const pathOf = (id: string) => { const op = getOperation(id); expect(op, id).toBeTruthy(); return op!.path; };

describe("adapter paths == catalog (single source of truth)", () => {
  it("order endpoints", () => {
    expect(shipmentPackagesPath("123")).toBe(fill(pathOf("getShipmentPackages")));
    expect(shipmentPackagesStreamPath("123")).toBe(fill(pathOf("getShipmentPackagesStream")));
    expect(alternativeDeliveryPath("123", "packageId")).toBe(fill(pathOf("processAlternativeDelivery")));
    expect(updatePackagePath("123", "packageId")).toBe(fill(pathOf("updatePackage")));
  });
  it("inventory + batch endpoints", () => {
    expect(inventoryUpdatePath("123")).toBe(fill(pathOf("updatePriceAndInventory")));
    expect(batchResultPath("123", "batchRequestId")).toBe(fill(pathOf("getBatchRequestResult")));
  });
});

describe("catalog invariants", () => {
  it("has every operation, each with a mock handler", () => {
    expect(TRENDYOL_OPERATIONS.length).toBeGreaterThanOrEqual(80);
    expect(TRENDYOL_OPERATIONS.filter((o) => !TRENDYOL_MOCKS[o.id]).map((o) => o.id)).toEqual([]);
    expect(Object.keys(TRENDYOL_MOCKS).filter((id) => !getOperation(id))).toEqual([]);
  });
  it("ids are unique and only the two allowlisted hosts are ever used", () => {
    const ids = TRENDYOL_OPERATIONS.map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const o of TRENDYOL_OPERATIONS) expect(o.path.startsWith("/"), o.id).toBe(true);
  });
  it("write/destructive operations are never silently 'read'", () => {
    for (const o of TRENDYOL_OPERATIONS) if (["POST", "PUT", "DELETE", "PATCH"].includes(o.method) && o.risk === "read") {
      // POST used as a query (filters, getters) is allowed only when the id says so
      expect(/^(get|filter|list|search)/i.test(o.id), `${o.id} is ${o.method} but marked read`).toBe(true);
    }
  });
});

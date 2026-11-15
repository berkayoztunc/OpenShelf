import { describe, expect, it } from "vitest";
import { leaves, remoteVariants } from "@openshelf/shared";
import fx from "./fixtures/real-shapes.json";

/** What the live API answered (trimmed, no real ids/urls): the shared helpers must read exactly these shapes. */
describe("real Trendyol response shapes", () => {
  it("approved (content -> variants) and unapproved (flat) become one list; pending / rejected keep their status and reason", () => {
    const r = remoteVariants(fx.approved.content, fx.unapproved.content);
    expect(r.map((x) => [x.barcode, x.status, x.stockCode])).toEqual([["B-100", "approved", ""], ["B-101", "approved", "S-101"], ["B-200", "pending", ""], ["B-300", "rejected", "S-300"]]);
    expect(r[3]!.rejectReason).toBe("Görselde Yasaklı Kelime");
    expect(r[0]!.productMainId).toBe("MAIN-1");
  });
  it("category tree is wrapped in { categories }, subCategories may be null or empty: both are leaves", () => {
    expect(leaves(fx.categoryTree).map((l) => [l.id, l.path])).toEqual([[971, "Aksesuar › Omuz Çantası"], [5, "Aksesuar › Şapka"]]);
  });
  it("closed attribute lists come inline, free-text ones have none", () => {
    const [custom, closed] = fx.categoryAttributes.categoryAttributes as { allowCustom: boolean; attributeValues?: unknown[] }[];
    expect(custom!.allowCustom).toBe(true); expect(custom!.attributeValues).toBeUndefined();
    expect(closed!.attributeValues).toHaveLength(2);
  });
  it("the values endpoint uses attributeValueId / attributeValue", () => {
    expect(fx.attributeValues.content[0]).toEqual({ attributeValueId: 144271, attributeValue: "Standart" });
  });
});

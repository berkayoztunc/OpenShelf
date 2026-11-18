import { describe, expect, it } from "vitest";
import { TR_GEO } from "@openshelf/shared/src/trGeo";
import { addressProblems } from "../pages/Checkout";

const A = { fullName: "Ayşe Yılmaz", phone: "+905551112233", line1: "Atatürk Cad. No 1", line2: "", city: "Mersin", district: "Yenişehir", postalCode: "", country: "TR" };

describe("checkout address", () => {
  it("province/district data: 81 provinces with their districts, sorted for Turkish", () => {
    expect(TR_GEO.length).toBe(81);
    expect(TR_GEO.every(([code, name, ds]) => /^\d{2}$/.test(code) && name.length > 1 && ds.length > 0)).toBe(true);
    const mersin = TR_GEO.find((c) => c[0] === "33")!;
    expect(mersin[1]).toBe("Mersin"); expect(mersin[2]).toContain("Yenişehir"); expect(mersin[2]).not.toContain("Yeni");
    expect(TR_GEO.findIndex((c) => c[1] === "Çanakkale")).toBeLessThan(TR_GEO.findIndex((c) => c[1] === "Denizli")); // ç sorts after c
  });
  it("Turkey: province and district must come from the list", () => {
    expect(addressProblems(A)).toEqual([]);
    expect(addressProblems({ ...A, district: "Yeni" })).toEqual(["district"]);       // the typo that broke the shipment
    expect(addressProblems({ ...A, district: "" })).toEqual(["district"]);
    expect(addressProblems({ ...A, city: "mersin" })).toEqual(["city", "district"]);
    expect(addressProblems({ ...A, city: "", district: "" })).toEqual(["city", "district"]);
    expect(addressProblems({ ...A, district: "Kadıköy" })).toEqual(["district"]);    // real district, wrong province
  });
  it("other countries keep free text and an optional district", () => {
    expect(addressProblems({ ...A, country: "DE", city: "Berlin", district: "" })).toEqual([]);
    expect(addressProblems({ ...A, country: "DE", city: "", fullName: " " })).toEqual(["fullName", "city"]);
  });
});

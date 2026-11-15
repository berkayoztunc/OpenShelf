import { describe, expect, it } from "vitest";
import { desiFromGrams, importedCategoryId, matchAttrValue, matchBrand, norm, rankCategories } from "../pages/trendyol/views/products/autofill";

const leaves = [
  { id: 1, name: "Çanta Süsü", path: "Aksesuar › Çanta Süsü" },
  { id: 2, name: "Anahtarlık", path: "Aksesuar › Anahtarlık" },
  { id: 3, name: "Çanta", path: "Kadın › Çanta" },
  { id: 4, name: "Vazo", path: "Ev › Dekoratif Ürünler › Vazo" },
  { id: 5, name: "Vazo", path: "Bahçe › Vazo" },
  { id: 6, name: "Takı Seti", path: "Aksesuar › Takı › Set" },
];

describe("autofill matching", () => {
  it("norm folds Turkish letters and punctuation", () => {
    expect(norm("  Çanta Süsü! ")).toBe("canta susu"); expect(norm("IŞIK")).toBe("isik"); expect(norm(null)).toBe("");
  });
  it("brand: takes the equal name, otherwise only suggests", () => {
    const list = [{ id: 1, name: "NUAD Atelier Home" }, { id: 2, name: "Nuad Atelier" }, { id: 3, name: "Nuad" }];
    expect(matchBrand(list, "nuad atelier").exact).toEqual({ id: 2, name: "Nuad Atelier" });
    expect(matchBrand(list, "Nuad Atelier").ranked.map((b) => b.id)).toEqual([2, 1, 3]);
    expect(matchBrand(list, "Başka").exact).toBeNull();
    expect(matchBrand([{ id: 1, name: "Nuad" }, { id: 2, name: "NUAD" }], "nuad").exact).toBeNull(); // two equal names: not a safe guess
    expect(matchBrand(list, "").exact).toBeNull();
  });
  it("category: an equal leaf name wins; ambiguity is only suggested; parents help ranking", () => {
    const a = rankCategories(leaves, ["Çanta Süsü"]);
    expect(a.exact?.id).toBe(1); expect(a.ranked[0]!.id).toBe(1);
    expect(rankCategories(leaves, ["Vazo"]).exact).toBeNull();                       // two "Vazo" leaves
    expect(rankCategories(leaves, ["Vazo", "Ev"]).ranked[0]!.id).toBe(4);            // the parent "Ev" breaks the tie
    expect(rankCategories(leaves, ["Canta"]).exact?.id).toBe(3);                     // diacritics do not matter
    expect(rankCategories(leaves, ["Takı"]).ranked.map((l) => l.id)).toContain(6);   // contained in the path
    expect(rankCategories(leaves, ["Hiçbiri"]).ranked).toEqual([]);
    expect(rankCategories(leaves, []).exact).toBeNull();
  });
  it("attribute value from the variant's name or option values", () => {
    const colors = [{ id: 10, name: "Pembe" }, { id: 11, name: "Mavi" }, { id: 12, name: "Açık Mavi" }];
    expect(matchAttrValue(colors, ["Pembe"])?.id).toBe(10);
    expect(matchAttrValue(colors, ["pembe / büyük"])?.id).toBe(10);                  // one word of the candidate
    expect(matchAttrValue(colors, ["Açık Mavi"])?.id).toBe(12);                      // the whole name beats the word "mavi"
    expect(matchAttrValue(colors, ["Siyah"])).toBeNull();
    expect(matchAttrValue([{ id: 1, name: "M" }, { id: 2, name: "L" }], ["Beden: M"])?.id).toBe(1);
    expect(matchAttrValue([{ id: 1, name: "Mavi" }, { id: 2, name: "mavi" }], ["Mavi"])).toBeNull(); // duplicates: no guess
    expect(matchAttrValue([], ["x"])).toBeNull();
  });
  it("desi and imported category ids", () => {
    expect([desiFromGrams(null), desiFromGrams(0), desiFromGrams(250), desiFromGrams(1001), desiFromGrams(2500)]).toEqual([1, 1, 1, 2, 3]);
    expect(importedCategoryId("ty-cat-411")).toBe(411); expect(importedCategoryId("ty-cat-n-canta")).toBeNull(); expect(importedCategoryId("abc")).toBeNull(); expect(importedCategoryId(null)).toBeNull();
  });
});

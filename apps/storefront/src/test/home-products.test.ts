import { describe, expect, it } from "vitest";
import { homePlan } from "../lib/homeProducts";

const cfg = (o: object) => ({ mode: "auto", productIds: [], limit: 8, title: "", titleEn: "", ...o }) as never;

describe("homePlan", () => {
  it("auto (or no config): default order, limit products, default heading", () => {
    expect(homePlan(undefined, "tr")).toEqual({ ids: null, count: 8, title: "" });
    expect(homePlan(cfg({ limit: 12 }), "tr")).toEqual({ ids: null, count: 12, title: "" });
  });
  it("manual: exactly the curated ids in order, all of them shown", () => {
    expect(homePlan(cfg({ mode: "manual", productIds: ["b", "a", "c"] }), "tr")).toEqual({ ids: "b,a,c", count: 3, title: "" });
  });
  it("manual with an empty list behaves like auto", () => {
    expect(homePlan(cfg({ mode: "manual", productIds: [] }), "tr").ids).toBeNull();
  });
  it("heading follows the locale and falls back to the Turkish one", () => {
    expect(homePlan(cfg({ title: "Seçtiklerimiz", titleEn: "Our picks" }), "en").title).toBe("Our picks");
    expect(homePlan(cfg({ title: "Seçtiklerimiz", titleEn: "Our picks" }), "tr").title).toBe("Seçtiklerimiz");
    expect(homePlan(cfg({ title: "Seçtiklerimiz" }), "en").title).toBe("Seçtiklerimiz");
  });
});

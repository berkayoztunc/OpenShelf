import { describe, expect, it } from "vitest";
import { deltaPct, labelIdx, niceMax, pathOf, toPoints, yTicks } from "../lib/insights";

describe("insights helpers", () => {
  it("deltaPct: percentage vs previous period; null when there is no baseline", () => {
    expect(deltaPct(150, 100)).toBe(50); expect(deltaPct(50, 100)).toBe(-50);
    expect(deltaPct(0, 0)).toBe(0); expect(deltaPct(10, 0)).toBeNull();
  });
  it("niceMax rounds up to clean tick values and is always positive", () => {
    expect(niceMax(0)).toBe(100); expect(niceMax(-5)).toBe(100);
    expect(niceMax(730)).toBe(1000); expect(niceMax(1900)).toBe(2000); expect(niceMax(2300)).toBe(2500); expect(niceMax(4100)).toBe(5000); expect(niceMax(12345)).toBe(20000);
    for (const v of [1, 7, 99, 1234, 98765]) expect(niceMax(v)).toBeGreaterThanOrEqual(v);
    expect(yTicks(2000)).toEqual([0, 500, 1000, 1500, 2000]);
  });
  it("labelIdx always includes first and last, evenly spread, no duplicates", () => {
    expect(labelIdx(3)).toEqual([0, 1, 2]);
    const l = labelIdx(30); expect(l[0]).toBe(0); expect(l[l.length - 1]).toBe(29); expect(l).toHaveLength(5); expect(new Set(l).size).toBe(l.length);
  });
  it("toPoints maps values into the box (clamped) and pathOf builds an SVG path", () => {
    const box = { x0: 0, x1: 100, yTop: 0, yBottom: 50 };
    expect(toPoints([0, 50, 100], 100, box)).toEqual([[0, 50], [50, 25], [100, 0]]);
    expect(toPoints([500], 100, box)).toEqual([[50, 0]]);
    expect(pathOf([[0, 50], [50, 25]])).toBe("M0.0 50.0 L50.0 25.0");
  });
});

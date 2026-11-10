import { intlTag } from "../i18n";

export interface Pair { cur: number; prev: number }
export interface DayPoint { date: string; revenue: number; orders: number; website: number; trendyol: number }
export interface Insights {
  range: { days: 7 | 30 | 90; timezone: string; from: string; to: string };
  kpis: { revenue: Pair; orders: Pair; aov: Pair; units: Pair; customers: Pair };
  series: DayPoint[]; previous: { date: string; revenue: number; orders: number }[];
  channels: { website: { revenue: number; orders: number }; trendyol: { revenue: number; orders: number } };
  topProducts: { productId: string | null; name: string; units: number; revenue: number }[];
  topCities: { city: string | null; orders: number; revenue: number }[];
  attention: { toShip: number; awaitingPayment: number; toInvoice: number; failedJobs: number; outOfStock: number; lowStock: number; noImage: number; drafts: number };
  activity: { id: number; action: string; entity: string | null; entityId: string | null; at: string; admin: string | null }[];
}

/** Change vs the previous period. `null` = no baseline (previous was 0): show "new" instead of a percentage. */
export function deltaPct(cur: number, prev: number): number | null {
  if (prev === 0) return cur === 0 ? 0 : null;
  return ((cur - prev) / prev) * 100;
}

/** Round the chart maximum up to a clean number so ticks land on 1/2/2.5/5 × 10^n. Always > 0. */
export function niceMax(max: number): number {
  if (max <= 0) return 100;
  const exp = Math.pow(10, Math.floor(Math.log10(max)));
  const f = max / exp;
  const step = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return step * exp;
}
export const yTicks = (top: number, n = 4): number[] => Array.from({ length: n + 1 }, (_, i) => (top / n) * i);

/** Indexes of the x labels to print (always the first and last, evenly spread in between). */
export function labelIdx(len: number, want = 5): number[] {
  if (len <= want) return Array.from({ length: len }, (_, i) => i);
  return [...new Set(Array.from({ length: want }, (_, i) => Math.round((i * (len - 1)) / (want - 1))))];
}

/** Axis money: full under 10,000 (minor units → major), compact above (12K, 1.2M). */
export function axisMoney(minor: number): string {
  const v = minor / 100;
  return v < 10_000 ? new Intl.NumberFormat(intlTag(), { maximumFractionDigits: 0 }).format(v) : new Intl.NumberFormat(intlTag(), { notation: "compact", maximumFractionDigits: 1 }).format(v);
}

/** Points for a polyline (x spread over [x0,x1], y mapped from [0,top] to [yBottom,yTop]). */
export function toPoints(values: number[], top: number, box: { x0: number; x1: number; yTop: number; yBottom: number }): [number, number][] {
  const n = values.length;
  return values.map((v, i) => [n === 1 ? (box.x0 + box.x1) / 2 : box.x0 + (i * (box.x1 - box.x0)) / (n - 1), box.yBottom - (Math.min(v, top) / top) * (box.yBottom - box.yTop)]);
}
export const pathOf = (pts: [number, number][]) => pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");

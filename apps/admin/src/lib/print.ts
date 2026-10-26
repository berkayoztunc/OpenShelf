export type PrintKind = "label" | "packing" | "invoice" | "summary" | "manual-invoice";
export const PRINT_KINDS: PrintKind[] = ["label", "packing", "invoice", "summary", "manual-invoice"];
export const MAX_PRINT_IDS = 50;
/** URL for the chrome-less print route (opens outside the SPA router, so BASE_URL is prefixed). */
export function printUrl(kind: PrintKind, ids: string[]): string {
  const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
  return `${base}/print/${kind}?ids=${ids.map(encodeURIComponent).join(",")}`;
}
export const openPrint = (kind: PrintKind, ids: string[]) => { window.open(printUrl(kind, ids), "_blank", "noopener"); };

/** Run `fn` over `items` with at most `limit` in flight; preserves input order. Never rejects: each slot is settled. */
export async function mapPool<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<PromiseSettledResult<R>[]> {
  const out: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      try { out[i] = { status: "fulfilled", value: await fn(items[i]!) }; } catch (reason) { out[i] = { status: "rejected", reason }; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}
/** Parse `?ids=a,b,c`: trims, dedupes, caps at MAX_PRINT_IDS. */
export function parseIds(raw: string | null): { ids: string[]; truncated: boolean } {
  const all = [...new Set((raw ?? "").split(",").map((s) => s.trim()).filter(Boolean))];
  return { ids: all.slice(0, MAX_PRINT_IDS), truncated: all.length > MAX_PRINT_IDS };
}

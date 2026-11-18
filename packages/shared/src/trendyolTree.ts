import { norm } from "./trendyolMatch";

/**
 * Flatten Trendyol's category tree into leaves with their path. The real API answers `{ "categories": [...] }` (the mock and older docs
 * show a bare array), nodes may carry `subCategories: null`, and ids may be numeric strings: all of that is accepted. Only a node without
 * children is a leaf, because Trendyol only accepts products in leaf categories.
 */
export interface Leaf { id: number; name: string; path: string }
export function leaves(tree: unknown, trail: string[] = []): Leaf[] {
  const nodes = Array.isArray(tree) ? tree : Array.isArray((tree as { categories?: unknown } | null)?.categories) ? (tree as { categories: unknown[] }).categories : [];
  const out: Leaf[] = [];
  for (const raw of nodes) {
    const c = (raw ?? {}) as { id?: number | string; name?: string; subCategories?: unknown };
    const here = [...trail, String(c.name ?? "")];
    const id = typeof c.id === "number" ? c.id : typeof c.id === "string" && /^\d+$/.test(c.id) ? Number(c.id) : null;
    if (Array.isArray(c.subCategories) && c.subCategories.length) out.push(...leaves(c.subCategories, here));
    else if (id != null) out.push({ id, name: String(c.name ?? ""), path: here.join(" › ") });
  }
  return out;
}

/** Leaves whose path contains EVERY word the user typed (any order, Turkish letters folded), shortest path first. */
export function filterLeaves(all: Leaf[], text: string, limit = 40): Leaf[] {
  const words = norm(text).split(" ").filter(Boolean);
  if (!words.length) return all.slice(0, limit);
  return all.filter((l) => { const p = norm(l.path); return words.every((w) => p.includes(w)); })
    .sort((a, b) => Number(norm(b.name).includes(words.join(" "))) - Number(norm(a.name).includes(words.join(" "))) || a.path.length - b.path.length).slice(0, limit);
}

/** Batch finished? (`status: COMPLETED`, or every item has SUCCESS/FAILED when the batch carries no status — stock/price updates). */
export function batchFinished(body: unknown): boolean {
  const b = (body ?? {}) as { status?: string; items?: { status?: string }[] };
  if (b.status === "COMPLETED") return true;
  if (b.status === "IN_PROGRESS") return false;
  const items = Array.isArray(b.items) ? b.items : [];
  return items.length > 0 && items.every((x) => x.status === "SUCCESS" || x.status === "FAILED");
}

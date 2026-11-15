/**
 * Pure matching helpers that let the "create product on Trendyol" wizard fill brand, category and attributes by itself from what the
 * store already knows (the local product's brand and category, the variants' option values) and from what was chosen last time.
 * Nothing here talks to the network; the wizard feeds in Trendyol's own lists.
 */

/** Lower-case, Turkish letters folded to ASCII, punctuation gone: "Çanta Süsü!" -> "canta susu". */
export const norm = (s: unknown): string =>
  String(s ?? "").trim().toLocaleLowerCase("tr-TR").replace(/ı/g, "i").replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ş/g, "s").replace(/ö/g, "o").replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, " ").trim();
const tokens = (s: string) => norm(s).split(" ").filter(Boolean);

export interface BrandHit { id: number; name: string }

/** Brand to take automatically: the one whose name equals the wanted name. Otherwise nothing is chosen for you; `ranked` are suggestions. */
export function matchBrand(list: BrandHit[], wanted: string): { exact: BrandHit | null; ranked: BrandHit[] } {
  const w = norm(wanted);
  if (!w) return { exact: null, ranked: list.slice(0, 5) };
  const exact = list.filter((b) => norm(b.name) === w);
  const rank = (b: BrandHit) => (norm(b.name) === w ? 0 : norm(b.name).startsWith(w) || w.startsWith(norm(b.name)) ? 1 : 2);
  return { exact: exact.length === 1 ? exact[0]! : null, ranked: [...list].sort((a, b) => rank(a) - rank(b)).slice(0, 5) };
}

export interface CategoryLeaf { id: number; name: string; path: string }

/**
 * Trendyol leaf categories that fit the names the store uses (local category + its parents, product name), best first.
 * Score: the leaf's own name equals a wanted name (strongest), a wanted name is contained in the leaf name or the path, shared words.
 * `exact` is set only when ONE leaf has an equal name, so a guess is never applied silently when the name is ambiguous.
 */
export function rankCategories(leaves: CategoryLeaf[], wanted: string[], limit = 5): { exact: CategoryLeaf | null; ranked: (CategoryLeaf & { score: number })[] } {
  const ws = wanted.map(norm).filter(Boolean);
  if (!ws.length) return { exact: null, ranked: [] };
  const scored = leaves.map((l) => {
    const n = norm(l.name); const p = norm(l.path); const lt = new Set(tokens(l.path));
    let score = 0;
    ws.forEach((w, i) => {
      const weight = i === 0 ? 1 : 0.5; // the product's own category counts more than its parents
      if (n === w) score += 100 * weight;
      else if (n.includes(w) || (w.includes(n) && n.length >= 4)) score += 60 * weight;
      else if (p.includes(w)) score += 30 * weight;
      else { const shared = tokens(w).filter((t) => t.length >= 3 && lt.has(t)).length; score += shared * 10 * weight; }
    });
    return { ...l, score };
  }).filter((l) => l.score > 0).sort((a, b) => b.score - a.score || a.path.length - b.path.length);
  const first = ws[0]!;
  const equal = leaves.filter((l) => norm(l.name) === first);
  return { exact: equal.length === 1 ? equal[0]! : null, ranked: scored.slice(0, limit) };
}

export interface AttrOption { id: number; name: string }

/**
 * Attribute value to take for what the variant is called ("Pembe", "M / Bej", option values {Renk: "Pembe"}): an option whose name equals
 * a candidate, or equals one WORD of a candidate. When several options match, nothing is chosen.
 */
export function matchAttrValue(options: AttrOption[], candidates: string[]): AttrOption | null {
  const cands = candidates.map(norm).filter(Boolean);
  if (!cands.length || !options.length) return null;
  const whole = options.filter((o) => cands.includes(norm(o.name)));
  if (whole.length === 1) return whole[0]!;
  if (whole.length > 1) return null;
  const words = new Set(cands.flatMap((c) => c.split(" ")));
  const part = options.filter((o) => { const n = norm(o.name); return n.length >= 1 && !n.includes(" ") && words.has(n); });
  return part.length === 1 ? part[0]! : null;
}

/** Desi (dimensional weight) from a variant's weight in grams: at least 1, rounded up to a whole desi. */
export const desiFromGrams = (grams: number | null | undefined): number => Math.max(1, Math.ceil((grams ?? 0) / 1000));

/** Trendyol category id hidden in a local category id created by the Trendyol import (`ty-cat-<id>`), or null for the store's own categories. */
export function importedCategoryId(localId: string | null | undefined): number | null {
  const m = /^ty-cat-(\d+)$/.exec(localId ?? "");
  return m ? Number(m[1]) : null;
}

/** What the wizard remembers per local category, so the next product of that category is filled without any matching. */
export interface RememberedDefaults {
  trendyolCategoryId: number; categoryPath: string; brandId: number | null; brandName: string;
  /** shared (non-variant) attribute choices: attributeId -> value ids / custom text */
  attrs: Record<string, { ids: number[]; custom: string }>;
  cargo: string; vatRate: string; dimensionalWeight: string; deliveryDuration: string; origin: string;
}

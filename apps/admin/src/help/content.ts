import { type Locale } from "../i18n";
import { foldTr, slugify } from "./slug";

/**
 * Guide content: Markdown files `help/<locale>/NN-slug.md` (NN = order). The first `# ` line is the title.
 * Syntax extras handled by GuideView: `> [!NOTE|TIP|WARNING|DANGER]` callouts, `[SKU](term:sku)` glossary terms,
 * images `![alt](help/tr/orders-detail.png)` (served from /admin/help/...), internal links `[x](/help/orders#iade)`.
 * The virtual section `glossary` is generated from the glossary dictionaries, not from a file.
 */
const files = import.meta.glob("./{tr,en}/*.md", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

export const GLOSSARY_SLUG = "glossary";
export interface Heading { level: 2 | 3; text: string; id: string }
export interface Section { slug: string; order: number; title: string; md: string; headings: Heading[]; locale: Locale; fallback: boolean }

/** `## Channel prices {#kanal-fiyatlari}` pins the anchor (used by translations, whose text slugifies differently). */
export const ANCHOR_SUFFIX = /\s*\{#([a-z0-9-]+)\}\s*$/;
function parseHeadings(md: string): Heading[] {
  const out: Heading[] = []; const seen = new Map<string, number>();
  let fence = false;
  for (const line of md.split("\n")) {
    if (/^```/.test(line)) { fence = !fence; continue; }
    if (fence) continue;
    const m = /^(#{2,3})\s+(.+?)\s*#*\s*$/.exec(line);
    if (!m) continue;
    let raw = m[2]!; const am = ANCHOR_SUFFIX.exec(raw); if (am) raw = raw.slice(0, am.index);
    const text = raw.replace(/[*_`]|\[([^\]]*)\]\([^)]*\)/g, "$1");
    let id = am?.[1] ?? (slugify(text) || "bolum"); const n = seen.get(id) ?? 0; seen.set(id, n + 1); if (n) id = `${id}-${n}`;
    out.push({ level: m[1]!.length as 2 | 3, text, id });
  }
  return out;
}
const titleOf = (md: string, fallback: string) => /^#\s+(.+)$/m.exec(md)?.[1]?.trim() ?? fallback;

const bySlug: Record<Locale, Map<string, { order: number; md: string }>> = { tr: new Map(), en: new Map() };
for (const [path, md] of Object.entries(files)) {
  const m = /\.\/(tr|en)\/(\d+)-([a-z0-9-]+)\.md$/.exec(path);
  if (m) bySlug[m[1] as Locale].set(m[3]!, { order: Number(m[2]), md });
}

/** All sections in order for a locale; sections missing in that locale fall back to Turkish (`fallback: true`). */
export function sectionList(locale: Locale): Section[] {
  const slugs = new Map<string, number>();
  for (const l of ["tr", "en"] as Locale[]) for (const [s, v] of bySlug[l]) if (!slugs.has(s)) slugs.set(s, v.order);
  return [...slugs.entries()].sort((a, b) => a[1] - b[1]).map(([slug, order]) => {
    const own = bySlug[locale].get(slug); const src = own ?? bySlug.tr.get(slug) ?? bySlug.en.get(slug)!;
    return { slug, order, md: src.md, title: titleOf(src.md, slug), headings: parseHeadings(src.md), locale: own ? locale : "tr", fallback: !own };
  });
}
export const getSection = (locale: Locale, slug: string) => sectionList(locale).find((s) => s.slug === slug);

export interface SearchHit { slug: string; title: string; heading?: Heading; snippet: string; score: number }
/** Tiny client-side full-text search over the current language's sections (accent- and case-insensitive). */
export function searchGuide(locale: Locale, query: string, limit = 20): SearchHit[] {
  const terms = foldTr(query).split(/\s+/).filter((t) => t.length > 1);
  if (!terms.length) return [];
  const hits: SearchHit[] = [];
  for (const s of sectionList(locale)) {
    const lines = s.md.split("\n");
    let current: Heading | undefined; let hi = 0; const heads = s.headings;
    const titleScore = terms.every((t) => foldTr(s.title).includes(t)) ? 20 : 0;
    if (titleScore) hits.push({ slug: s.slug, title: s.title, snippet: lines.find((l) => l.trim() && !l.startsWith("#"))?.slice(0, 160) ?? "", score: titleScore });
    for (const raw of lines) {
      const h = /^(#{2,3})\s+(.+?)\s*$/.exec(raw);
      if (h) { current = heads[hi++]; }
      const line = foldTr(raw);
      const matched = terms.filter((t) => line.includes(t)).length;
      if (!matched || /^#\s/.test(raw)) continue;
      const score = matched * 3 + (h ? 8 : 0) + (matched === terms.length ? 5 : 0);
      const text = raw.replace(ANCHOR_SUFFIX, "").replace(/[#>*_`|]|\[([^\]]*)\]\([^)]*\)/g, "$1").trim();
      hits.push({ slug: s.slug, title: s.title, heading: current, snippet: text.slice(0, 180), score });
    }
  }
  const best = new Map<string, SearchHit>();
  for (const h of hits.sort((a, b) => b.score - a.score)) { const k = `${h.slug}#${h.heading?.id ?? ""}`; if (!best.has(k)) best.set(k, h); }
  return [...best.values()].slice(0, limit);
}

import { type Locale } from "../i18n";
import { parseHeadings, searchSections, titleOf, type Heading } from "@openshelf/shared";

/**
 * Guide content: Markdown files `help/<locale>/NN-slug.md` (NN = order). The first `# ` line is the title.
 * Syntax extras handled by GuideView: `> [!NOTE|TIP|WARNING|DANGER]` callouts, `[SKU](term:sku)` glossary terms,
 * images `![alt](help/tr/orders-detail.png)` (served from /admin/help/...), internal links `[x](/help/orders#iade)`.
 * The virtual section `glossary` is generated from the glossary dictionaries, not from a file.
 */
const files = import.meta.glob("./{tr,en}/*.md", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

export const GLOSSARY_SLUG = "glossary";
export interface Section { slug: string; order: number; title: string; md: string; headings: Heading[]; locale: Locale; fallback: boolean }

export { ANCHOR_SUFFIX, type Heading } from "@openshelf/shared";
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

export type { SearchHit } from "@openshelf/shared";
/** Tiny client-side full-text search over the current language's sections (accent- and case-insensitive). */
export const searchGuide = (locale: Locale, query: string, limit = 20) => searchSections(sectionList(locale), query, limit);

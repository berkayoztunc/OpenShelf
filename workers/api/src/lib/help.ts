import { cleanForAi, parseHeadings, searchSections, sliceSection, titleOf, type Heading } from "@openshelf/shared";
import { HELP_DOCS } from "../mcp/helpDocs.generated";

export type HelpLang = "tr" | "en";
export const HELP_MAX_CHARS = 60_000;
export interface HelpTopic { slug: string; order: number; title: string; language: HelpLang; md: string; headings: Heading[] }

/** All guide chapters for a language (a chapter missing in that language falls back to Turkish, like the admin guide). */
export function helpTopics(lang: HelpLang): HelpTopic[] {
  const slugs = new Map<string, number>();
  for (const l of ["tr", "en"] as const) for (const d of HELP_DOCS[l]) if (!slugs.has(d.slug)) slugs.set(d.slug, d.order);
  return [...slugs.entries()].sort((a, b) => a[1] - b[1]).map(([slug, order]) => {
    const own = HELP_DOCS[lang].find((d) => d.slug === slug); const src = own ?? HELP_DOCS.tr.find((d) => d.slug === slug) ?? HELP_DOCS.en.find((d) => d.slug === slug)!;
    return { slug, order, title: titleOf(src.md, slug), language: own ? lang : "tr", md: src.md, headings: parseHeadings(src.md) };
  });
}
export const helpIndex = (lang: HelpLang) => helpTopics(lang).map((t) => ({ topic: t.slug, title: t.title, language: t.language, sections: t.headings.filter((h) => h.level === 2).map((h) => ({ id: h.id, title: h.text })) }));

/** One chapter (or one section of it) as AI-readable markdown, capped so a single call stays cheap. */
export function helpRead(lang: HelpLang, topic: string, section?: string) {
  const t = helpTopics(lang).find((x) => x.slug === topic);
  if (!t) return { error: "unknown_topic" as const };
  const raw = section ? sliceSection(t.md, t.headings, section) : t.md;
  if (raw === null) return { error: "unknown_section" as const, topic: t.slug, sections: t.headings.map((h) => ({ id: h.id, title: h.text })) };
  const full = cleanForAi(raw);
  const truncated = full.length > HELP_MAX_CHARS;
  return {
    topic: t.slug, title: t.title, language: t.language, ...(section ? { section } : {}),
    sections: t.headings.map((h) => ({ id: h.id, title: h.text, level: h.level })),
    markdown: truncated ? `${full.slice(0, HELP_MAX_CHARS)}\n\n…[truncated: this chapter is long. Read one section at a time with help_read topic=${t.slug} section=<id>]` : full,
    ...(truncated ? { truncated: true } : {}),
  };
}
export const helpSearch = (lang: HelpLang, q: string, limit: number) =>
  searchSections(helpTopics(lang), q, limit).map((h) => ({ topic: h.slug, title: h.title, ...(h.heading ? { section: h.heading.id, sectionTitle: h.heading.text } : {}), snippet: h.snippet, read: `help_read topic=${h.slug}${h.heading ? ` section=${h.heading.id}` : ""}` }));

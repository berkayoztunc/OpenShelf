/**
 * Guide (help) documents: parsing, anchors, search and AI-friendly cleaning. Pure functions shared by the admin guide screen and the MCP help tools,
 * so a heading has the same anchor id everywhere (links like /help/orders#iade and `help_read` section ids match).
 */

/** Fold Turkish letters and punctuation so search and anchors work with or without diacritics. */
export const foldTr = (s: string) =>
  s.toLocaleLowerCase("tr").replace(/ç/g, "c").replace(/ğ/g, "g").replace(/ı/g, "i").replace(/ö/g, "o").replace(/ş/g, "s").replace(/ü/g, "u").replace(/â/g, "a").replace(/î/g, "i").replace(/û/g, "u");
/** Anchor id for a heading: "İade nasıl yapılır?" -> "iade-nasil-yapilir". */
export const slugify = (s: string) => foldTr(s).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

export interface Heading { level: 2 | 3; text: string; id: string }
/** `## Channel prices {#kanal-fiyatlari}` pins the anchor (used by translations, whose text slugifies differently). */
export const ANCHOR_SUFFIX = /\s*\{#([a-z0-9-]+)\}\s*$/;

export function parseHeadings(md: string): Heading[] {
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
export const titleOf = (md: string, fallback: string) => /^#\s+(.+)$/m.exec(md)?.[1]?.trim() ?? fallback;

export interface SearchableSection { slug: string; title: string; md: string; headings: Heading[] }
export interface SearchHit { slug: string; title: string; heading?: Heading; snippet: string; score: number }
/** Tiny full-text search over guide sections (accent- and case-insensitive). Best hit per heading first. */
export function searchSections(sections: SearchableSection[], query: string, limit = 20): SearchHit[] {
  const terms = foldTr(query).split(/\s+/).filter((t) => t.length > 1);
  if (!terms.length) return [];
  const hits: SearchHit[] = [];
  for (const s of sections) {
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

/** The markdown of one section: from its heading up to the next heading of the same or a higher level. */
export function sliceSection(md: string, headings: Heading[], id: string): string | null {
  const target = headings.find((h) => h.id === id); if (!target) return null;
  const lines = md.split("\n"); let hi = 0; let start = -1; let fence = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (/^```/.test(line)) { fence = !fence; continue; }
    if (fence) continue;
    const m = /^(#{2,3})\s+(.+?)\s*#*\s*$/.exec(line);
    if (!m) continue;
    const h = headings[hi++]!;
    if (start >= 0 && h.level <= target.level) return lines.slice(start, i).join("\n").trimEnd();
    if (h.id === id) start = i;
  }
  return start >= 0 ? lines.slice(start).join("\n").trimEnd() : null;
}

/**
 * Guide markdown made readable for an AI: screenshots become a short note, glossary links keep their text, internal guide links
 * point at the help_read tool, pinned anchors disappear from headings (ids are listed separately).
 */
export function cleanForAi(md: string): string {
  return md
    .replace(/^!\[([^\]]*)\]\([^)]*\)\s*$/gm, (_m, alt: string) => (alt.trim() ? `_(screenshot: ${alt.trim()})_` : ""))
    .replace(/\[([^\]]+)\]\(term:[^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\(\/help\/?([a-z0-9-]*)#?([a-z0-9-]*)\)/g, (_m, text: string, topic: string, sec: string) => (topic ? `${text} (help_read topic=${topic}${sec ? ` section=${sec}` : ""})` : text))
    .replace(/^(#{1,3}\s+.+?)\s*\{#[a-z0-9-]+\}\s*$/gm, "$1")
    .replace(/\n{3,}/g, "\n\n");
}

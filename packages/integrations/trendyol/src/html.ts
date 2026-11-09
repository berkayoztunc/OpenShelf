const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", hellip: "…", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", copy: "©", reg: "®", trade: "™", deg: "°" };

/** Decodes the common named entities and numeric (&#39; / &#x27;) ones. Unknown entities stay as written. */
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const n = e[1]!.toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : m;
    }
    return ENT[e.toLowerCase()] ?? m;
  });
}

/**
 * Trendyol sends product descriptions as HTML. OpenShelf stores them as plain text with line breaks:
 * block tags become line breaks, list items become "• ", every other tag (and script/style bodies) is dropped, entities are decoded.
 * Never returns markup, so it is safe to render as text.
 */
export function htmlToText(html: string | null | undefined): string {
  if (!html) return "";
  let s = String(html).replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, "").replace(/<!--[\s\S]*?-->/g, "");
  s = s.replace(/<br\s*\/?>/gi, "\n").replace(/<li\b[^>]*>/gi, "\n• ").replace(/<\/(p|div|h[1-6]|ul|ol|tr|table|section|article|blockquote)\s*>/gi, "\n")
    .replace(/<(p|div|h[1-6]|ul|ol|tr|table|section|article|blockquote)\b[^>]*>/gi, "\n");
  s = s.replace(/<\/?[a-z][^>]*>/gi, "").replace(/<[^>]*$/, ""); // remaining tags + a truncated trailing tag
  s = decodeEntities(s).replace(/ /g, " ");
  return s.split("\n").map((l) => l.replace(/[ \t]+/g, " ").trim()).join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** True when a stored description still contains HTML markup (used by the one-off cleanup). */
export const looksLikeHtml = (s: string | null | undefined) => !!s && /<\/?[a-z][^>]*>|&(nbsp|amp|lt|gt|quot|#\d+);/i.test(s);

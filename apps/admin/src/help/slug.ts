/** Fold Turkish letters and punctuation so search and anchors work with or without diacritics. */
export const foldTr = (s: string) =>
  s.toLocaleLowerCase("tr").replace(/ç/g, "c").replace(/ğ/g, "g").replace(/ı/g, "i").replace(/ö/g, "o").replace(/ş/g, "s").replace(/ü/g, "u").replace(/â/g, "a").replace(/î/g, "i").replace(/û/g, "u");
/** Anchor id for a heading: "İade nasıl yapılır?" -> "iade-nasil-yapilir". */
export const slugify = (s: string) => foldTr(s).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
/** "orders#iade" -> { section: "orders", anchor: "iade" } */
export function parseGuide(ref: string): { section: string; anchor?: string } {
  const [section = "", anchor] = ref.replace(/^\/?help\/?/, "").split("#");
  return { section, anchor: anchor || undefined };
}
export const guidePath = (ref: string) => { const { section, anchor } = parseGuide(ref); return `/help${section ? `/${section}` : ""}${anchor ? `#${anchor}` : ""}`; };

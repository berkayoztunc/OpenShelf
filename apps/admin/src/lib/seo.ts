/** SEO helpers shared by the product / category / settings editors. Texts come from the dictionaries (catalog.seo.*). */
import { getLocale, plural, tNow } from "../i18n";

export const TITLE_MAX = 70;
export const TITLE_IDEAL = 60;
export const DESC_MAX = 320;
export const DESC_MIN = 120;
export const DESC_IDEAL = 155;

/** Google-style truncation: cut at `max` chars on a word boundary where possible and add an ellipsis. */
export function truncate(s: string, max: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const sp = cut.lastIndexOf(" ");
  return `${(sp > max * 0.6 ? cut.slice(0, sp) : cut).trimEnd()}…`;
}

export type MeterTone = "empty" | "good" | "warn" | "bad";
export interface Meter { len: number; tone: MeterTone; pct: number; label: string }

/** Title: ≤60 good, 61-70 warn (may truncate), >70 bad. */
export function titleMeter(s: string, empty = tNow("catalog.seo.meter.titleEmptyProduct")): Meter {
  const len = s.trim().length;
  if (len === 0) return { len, tone: "empty", pct: 0, label: empty };
  if (len <= TITLE_IDEAL) return { len, tone: "good", pct: (len / TITLE_IDEAL) * 100, label: tNow("catalog.seo.meter.good") };
  if (len <= TITLE_MAX) return { len, tone: "warn", pct: 100, label: tNow("catalog.seo.meter.cut") };
  return { len, tone: "bad", pct: 100, label: tNow("catalog.seo.meter.tooLong") };
}
/** Description: 120-155 good, shorter or 156-320 warn, >320 bad. */
export function descMeter(s: string, empty = tNow("catalog.seo.meter.descEmpty")): Meter {
  const len = s.trim().length;
  if (len === 0) return { len, tone: "empty", pct: 0, label: empty };
  if (len > DESC_MAX) return { len, tone: "bad", pct: 100, label: tNow("catalog.seo.meter.tooLong") };
  const pct = Math.min(100, (len / DESC_IDEAL) * 100);
  if (len >= DESC_MIN && len <= DESC_IDEAL) return { len, tone: "good", pct, label: tNow("catalog.seo.meter.good") };
  if (len < DESC_MIN) return { len, tone: "warn", pct, label: tNow("catalog.seo.meter.aim", { min: DESC_MIN, max: DESC_IDEAL }) };
  return { len, tone: "warn", pct: 100, label: tNow("catalog.seo.meter.cut") };
}

/** `%s` = page title, `{storeName}` = store name (same rules as the storefront). */
export function applyTitleTemplate(template: string, title: string, storeName: string): string {
  return (template || "%s").replace("%s", title).replace("{storeName}", storeName);
}

/** "https://shop.test/product/abc" -> host + breadcrumb-style path for the SERP URL line. */
export function serpUrlParts(url: string): { host: string; crumbs: string[] } {
  try {
    const u = new URL(url);
    return { host: u.host, crumbs: u.pathname.split("/").filter(Boolean) };
  } catch { return { host: url, crumbs: [] }; }
}

export const isHttps = (s: string) => /^https:\/\/\S+$/i.test(s.trim());
export const isCleanSlug = (s: string) => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(s) && s.length <= 75;

export type CheckState = "ok" | "warn" | "bad";
export interface Check { id: string; label: string; state: CheckState; tip: string }

export interface ProductSeoInput {
  title: string; name: string; description: string; metaDescription: string; slug: string;
  images: { alt?: string }[]; hasOgImage: boolean; hasPrice: boolean; hasStock: boolean; noindex: boolean;
}
/** Actionable SEO checklist for a product. Tip is shown to the user for non-ok states. */
export function productChecks(i: ProductSeoInput): Check[] {
  const t = titleMeter(i.title || i.name);
  const d = descMeter(i.metaDescription || i.description.slice(0, 160));
  const missingAlt = i.images.filter((im) => !im.alt?.trim()).length;
  return [
    { id: "title", label: tNow("catalog.seo.check.title"), state: t.tone === "good" ? "ok" : t.tone === "bad" || t.len === 0 ? "bad" : "warn", tip: tNow("catalog.seo.tip.title") },
    { id: "description", label: tNow("catalog.seo.check.description"), state: d.tone === "good" ? "ok" : d.tone === "bad" || d.len === 0 ? "bad" : "warn", tip: tNow("catalog.seo.tip.description", { min: DESC_MIN, max: DESC_IDEAL }) },
    { id: "image", label: tNow("catalog.seo.check.image"), state: i.images.length > 0 || i.hasOgImage ? "ok" : "bad", tip: tNow("catalog.seo.tip.image") },
    { id: "alt", label: tNow("catalog.seo.check.alt"), state: i.images.length === 0 ? "warn" : missingAlt === 0 ? "ok" : "warn", tip: missingAlt ? plural(getLocale(), "catalog.seo.tip.alt", missingAlt) : tNow("catalog.seo.tip.altNone") },
    { id: "slug", label: tNow("catalog.seo.check.slug"), state: isCleanSlug(i.slug) ? "ok" : "warn", tip: tNow("catalog.seo.tip.slug") },
    { id: "price", label: tNow("catalog.seo.check.price"), state: i.hasPrice && i.hasStock ? "ok" : "warn", tip: tNow("catalog.seo.tip.price") },
    ...(i.noindex ? [{ id: "noindex", label: tNow("catalog.seo.check.noindex"), state: "bad" as const, tip: tNow("catalog.seo.tip.noindex") }] : []),
  ];
}

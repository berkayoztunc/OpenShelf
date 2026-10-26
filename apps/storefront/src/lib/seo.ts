import type { StoreConfig } from "../api/types";

export function pageTitle(config: StoreConfig, page?: string): string {
  const name = config.general.storeName;
  if (!page) return config.seo.homeTitle || (config.general.tagline ? `${name} – ${config.general.tagline}` : name);
  return (config.seo.titleTemplate || "%s | {storeName}").replace("%s", page).replace("{storeName}", name);
}

/** Home page description: explicit SEO setting, else the store description. */
export const homeDescription = (config: StoreConfig) => config.seo.homeDescription || config.general.description || undefined;

/** Defaults shared by every page's head. JSON-LD is on unless explicitly disabled (older configs lack the flag). */
export const jsonLdEnabled = (config: StoreConfig) => config.seo.jsonLd !== false;
export const siteHead = (config: StoreConfig) => ({ siteName: config.general.storeName, twitterSite: config.seo.twitterHandle || undefined });

export const clip = (s: string | undefined, n: number) => {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t;
};

export interface Crumb { name: string; url: string }
export function breadcrumbLd(crumbs: Crumb[]) {
  return {
    "@context": "https://schema.org", "@type": "BreadcrumbList",
    itemListElement: crumbs.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: c.url })),
  };
}

export function lowestPrice(p: { price?: number; variants?: { price: number }[] }): number | undefined {
  if (p.variants?.length) return Math.min(...p.variants.map((v) => v.price));
  return p.price;
}
export function totalAvailable(p: { available?: number; variants?: { available: number }[] }): number | undefined {
  if (p.variants?.length) return p.variants.reduce((n, v) => n + v.available, 0);
  return p.available;
}

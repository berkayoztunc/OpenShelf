import type { Locale, StoreConfig } from "../api/types";

export interface HomePlan {
  /** manual curated list: fetch exactly these ids; otherwise the default-ordered list */
  ids: string | null;
  /** how many products the grid shows */
  count: number;
  /** custom section heading for the current locale, "" = default text */
  title: string;
}

/** Resolves what the home page "featured" section should show from the public config. */
export function homePlan(cfg: StoreConfig["homepage"] | undefined, locale: Locale): HomePlan {
  const manual = cfg?.mode === "manual" && cfg.productIds.length > 0;
  const title = ((locale === "en" && cfg?.titleEn.trim()) || cfg?.title.trim() || "").toString();
  return { ids: manual ? cfg!.productIds.join(",") : null, count: manual ? cfg!.productIds.length : cfg?.limit ?? 8, title };
}

import { useEffect } from "react";

export interface HeadOptions {
  title: string;
  description?: string;
  image?: string | null;
  imageAlt?: string;
  /** Canonical URL (absolute). Defaults to origin + pathname (query string dropped). */
  url?: string;
  type?: "website" | "product";
  noindex?: boolean;
  /** One or several JSON-LD documents. */
  jsonLd?: object | object[] | null;
  prev?: string | null;
  next?: string | null;
  siteName?: string;
  /** Twitter handle, with or without the leading @. */
  twitterSite?: string;
}

/** Marks tags this hook created. */
const ATTR = "data-os-head";
/** Tags emitted by the Worker (HTML injection) or the legacy prerender step: removed once the SPA owns the head. */
const FOREIGN = "[data-ssr-head],[data-prerender]";

const esc = (s: string) => s.replace(/"/g, '\\"');

/** Drop any head element (not created by us) that would duplicate / conflict with the one we are about to add. */
function evictForeign(selector: string) {
  document.head.querySelectorAll(`${selector}:not([${ATTR}])`).forEach((n) => n.remove());
}

/**
 * Declarative <head> management (title, description, canonical, robots, prev/next, OG/Twitter, JSON-LD).
 * Takes ownership of tags injected by the server (`[data-ssr-head]`, `[data-prerender]`) and of any static
 * duplicates, so after hydration the document has exactly one of each tag. Cleans up on unmount.
 */
export function useHead(o: HeadOptions) {
  const lds = o.jsonLd ? (Array.isArray(o.jsonLd) ? o.jsonLd : [o.jsonLd]) : [];
  const ld = lds.length ? JSON.stringify(lds) : "";
  useEffect(() => {
    document.head.querySelectorAll(FOREIGN).forEach((n) => n.remove());
    document.title = o.title;
    const url = (o.url ?? `${location.origin}${location.pathname}`).split("#")[0]!;
    const els: Element[] = [];
    const push = (el: Element) => { el.setAttribute(ATTR, ""); document.head.appendChild(el); els.push(el); };
    const meta = (attr: "name" | "property", key: string, content?: string | null) => {
      if (!content) return;
      evictForeign(`meta[${attr}="${esc(key)}"]`);
      const el = document.createElement("meta");
      el.setAttribute(attr, key); el.content = content; push(el);
    };
    const link = (rel: string, href?: string | null) => {
      if (!href) return;
      evictForeign(`link[rel="${rel}"]`);
      const el = document.createElement("link");
      el.rel = rel; el.href = href; push(el);
    };
    meta("name", "description", o.description);
    meta("name", "robots", o.noindex ? "noindex,follow" : undefined);
    meta("property", "og:site_name", o.siteName);
    meta("property", "og:title", o.title);
    meta("property", "og:description", o.description);
    meta("property", "og:type", o.type ?? "website");
    meta("property", "og:url", url);
    meta("property", "og:image", o.image);
    meta("property", "og:image:alt", o.image ? o.imageAlt : undefined);
    meta("name", "twitter:card", o.image ? "summary_large_image" : "summary");
    meta("name", "twitter:title", o.title);
    meta("name", "twitter:description", o.description);
    meta("name", "twitter:image", o.image);
    meta("name", "twitter:site", o.twitterSite ? (o.twitterSite.startsWith("@") ? o.twitterSite : `@${o.twitterSite}`) : undefined);
    link("canonical", url);
    link("prev", o.prev);
    link("next", o.next);
    if (ld) {
      evictForeign('script[type="application/ld+json"]');
      for (const doc of JSON.parse(ld) as object[]) {
        const s = document.createElement("script");
        s.type = "application/ld+json"; s.textContent = JSON.stringify(doc).replace(/</g, "\\u003c"); push(s);
      }
    }
    return () => els.forEach((e) => e.remove());
  }, [o.title, o.description, o.image, o.imageAlt, o.url, o.type, o.noindex, o.prev, o.next, o.siteName, o.twitterSite, ld]);
}

export const absUrl = (u?: string | null) => (u ? new URL(u, location.origin).href : undefined);

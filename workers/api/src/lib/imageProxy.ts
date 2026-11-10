import type { ImageView } from "./catalog";

/**
 * Hosts whose images may be served through our own domain (/img/p/:id). The merchant's marketplace CDN (Trendyol) only: this is not an
 * open proxy, and a request never carries a URL: it names an image that is registered on one of OUR products.
 */
export const PROXY_HOSTS = ["dsmcdn.com", "trendyol.com"] as const;
export const proxyHostOk = (host: string): boolean => { const h = host.toLowerCase().replace(/\.$/, ""); return PROXY_HOSTS.some((d) => h === d || h.endsWith(`.${d}`)); };
export const proxyableUrl = (url: string | null | undefined): boolean => { try { const u = new URL(url ?? ""); return u.protocol === "https:" && proxyHostOk(u.hostname); } catch { return false; } };

/** Cheap non-crypto fingerprint of the upstream URL: part of the proxy link, so a changed source URL gets a fresh cache entry. */
export const urlTag = (s: string): string => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };

/** Relative proxy link for an image row, or null when it is already local (/media) or hosted somewhere we do not proxy. */
export function proxyPath(i: { id: string; mediaId: string | null; url: string | null }): string | null {
  return !i.mediaId && i.url && proxyableUrl(i.url) ? `/img/p/${encodeURIComponent(i.id)}?v=${urlTag(i.url)}` : null;
}
export type { ImageView };

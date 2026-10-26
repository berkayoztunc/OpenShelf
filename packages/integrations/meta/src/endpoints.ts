/** All outbound URL shapes for Meta live here. Only allowlisted hosts. */
export const ALLOWED_HOSTS = ["graph.facebook.com"] as const;
export const DEFAULT_API_VERSION = "v21.0";

export function assertAllowed(url: string): void {
  const u = new URL(url);
  if (u.protocol !== "https:" || !(ALLOWED_HOSTS as readonly string[]).includes(u.hostname)) {
    throw new Error(`meta: host not allowlisted: ${u.hostname}`);
  }
}

/** POST https://graph.facebook.com/{version}/{pixel_id}/events  (Conversions API; token via Bearer header) */
export const eventsUrl = (version: string, pixelId: string) =>
  `https://graph.facebook.com/${version}/${encodeURIComponent(pixelId)}/events`;

// UNVERIFIED: dataset lookup used by healthCheck (GET /{pixel_id}?fields=id,name); standard Graph node read.
export const pixelUrl = (version: string, pixelId: string) =>
  `https://graph.facebook.com/${version}/${encodeURIComponent(pixelId)}?fields=id,name`;

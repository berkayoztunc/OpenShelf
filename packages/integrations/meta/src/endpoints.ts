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

/**
 * GET https://graph.facebook.com/{version}/debug_token?input_token={token}
 * Token introspection used by healthCheck. Verified live: an Events Manager "Generate access token"
 * token (SYSTEM_USER, scope read_ads_dataset_quality) can inspect itself and lists its datasets in
 * granular_scopes[].target_ids. The Graph API only accepts input_token as a query parameter.
 */
export const debugTokenUrl = (version: string, token: string) =>
  `https://graph.facebook.com/${version}/debug_token?input_token=${encodeURIComponent(token)}`;

// Dataset node read (GET /{pixel_id}?fields=id,name). Needs ads_read/ads_management: an Events Manager
// CAPI token gets "(#100) Missing Permission" here, so healthCheck only uses it as a fallback.
export const pixelUrl = (version: string, pixelId: string) =>
  `https://graph.facebook.com/${version}/${encodeURIComponent(pixelId)}?fields=id,name`;

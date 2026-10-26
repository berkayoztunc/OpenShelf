export const ALLOWED_HOSTS = ["www.google-analytics.com"] as const;

export function assertAllowed(url: string): void {
  const u = new URL(url);
  if (u.protocol !== "https:" || !(ALLOWED_HOSTS as readonly string[]).includes(u.hostname)) {
    throw new Error(`ga4: host not allowlisted: ${u.hostname}`);
  }
}

/** POST https://www.google-analytics.com/mp/collect?measurement_id=&api_secret=  (returns 2xx, empty body, no validation) */
export const collectUrl = (measurementId: string, apiSecret: string) =>
  `https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(measurementId)}&api_secret=${encodeURIComponent(apiSecret)}`;

/** POST https://www.google-analytics.com/debug/mp/collect -> { validationMessages: [...] } (same query/body shape) */
export const debugUrl = (measurementId: string, apiSecret: string) =>
  `https://www.google-analytics.com/debug/mp/collect?measurement_id=${encodeURIComponent(measurementId)}&api_secret=${encodeURIComponent(apiSecret)}`;

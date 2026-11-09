// Browser-side secret generation for the launch page. Pure functions (no DOM) so they can be unit-tested in Node.
// Nothing here is ever sent anywhere: values live in the page until the user copies them into the Cloudflare deploy form.
const bytes = (n) => crypto.getRandomValues(new Uint8Array(n));

/** APP_ENCRYPTION_KEY: base64 of exactly 32 random bytes (what the Worker validates). */
export function genEncryptionKey() {
  let s = ""; for (const b of bytes(32)) s += String.fromCharCode(b);
  return btoa(s);
}
/** SETUP_TOKEN: 48 hex chars (24 random bytes), typed once at /admin/setup. */
export function genSetupToken() {
  return [...bytes(24)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
/** Normalises what a user pastes ("my-shop.workers.dev", "https://my-shop.workers.dev/admin") to an origin, or null. */
export function normalizeOrigin(input) {
  const raw = String(input || "").trim();
  if (!raw) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (!/^[a-z0-9.-]+$/i.test(u.hostname) || !u.hostname.includes(".")) return null;
    return u.origin;
  } catch { return null; }
}
export const DEPLOY_URL = (repo) => `https://deploy.workers.cloudflare.com/?url=${encodeURIComponent(`https://github.com/${repo}`)}`;

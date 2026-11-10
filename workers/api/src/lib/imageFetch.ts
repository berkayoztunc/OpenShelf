import { ApiError } from "./http";

/** Hostnames an import may never target: literals, loopback, link-local and internal names (SSRF). Workers cannot reach private networks, but never rely on that. */
export function blockedHost(host: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, "");
  if (!h.includes(".") || h === "localhost" || /\.(local|localhost|internal|lan|home|corp|intranet)$/.test(h)) return true;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h) || h.includes(":") || h.startsWith("[") || /^0x[0-9a-f]+$/i.test(h) || /^\d+$/.test(h)) return true; // IP literals in any notation
  return false;
}

/** Validates an https image URL for server-side fetching. */
export function checkImportUrl(raw: string): URL {
  let u: URL;
  try { u = new URL(raw); } catch { throw new ApiError(400, "invalid_url", "url must be a valid https URL"); }
  if (u.protocol !== "https:") throw new ApiError(400, "invalid_url", "Only https URLs can be imported");
  if (u.username || u.password) throw new ApiError(400, "invalid_url", "URLs with credentials are not allowed");
  if (u.port && u.port !== "443") throw new ApiError(400, "invalid_url", "Only the default https port is allowed");
  if (blockedHost(u.hostname)) throw new ApiError(400, "invalid_url", "This host is not allowed (use a public image host)");
  return u;
}

const MAX_REDIRECTS = 3; const TIMEOUT_MS = 15_000;
/** Fetches an image over https with redirect re-validation, a timeout and a hard byte cap (aborts as soon as it is exceeded). No cookies/credentials are sent. */
export async function fetchImageBytes(raw: string, maxBytes: number, fetcher: typeof fetch = fetch): Promise<Uint8Array<ArrayBuffer>> {
  let url = checkImportUrl(raw);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let res: Response;
    try { res = await fetcher(url.toString(), { redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS), headers: { Accept: "image/*", "User-Agent": "OpenShelf-media-import/1.0" } }); }
    catch { throw new ApiError(502, "fetch_failed", "Could not download the image (timeout or network error)"); }
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc || hop === MAX_REDIRECTS) throw new ApiError(502, "fetch_failed", "Too many redirects");
      url = checkImportUrl(new URL(loc, url).toString()); // every hop is re-validated
      continue;
    }
    if (!res.ok) throw new ApiError(502, "fetch_failed", `The image host answered HTTP ${res.status}`);
    const declared = Number(res.headers.get("content-length") ?? 0);
    if (declared > maxBytes) throw new ApiError(413, "payload_too_large", `Image is larger than the ${Math.floor(maxBytes / 1024)}KB limit`);
    if (!res.body) throw new ApiError(502, "fetch_failed", "Empty response");
    const reader = res.body.getReader(); const chunks: Uint8Array[] = []; let n = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      n += value.byteLength;
      if (n > maxBytes) { await reader.cancel().catch(() => {}); throw new ApiError(413, "payload_too_large", `Image is larger than the ${Math.floor(maxBytes / 1024)}KB limit`); }
      chunks.push(value);
    }
    const out = new Uint8Array(n); let o = 0;
    for (const ch of chunks) { out.set(ch, o); o += ch.byteLength; }
    return out;
  }
  throw new ApiError(502, "fetch_failed", "Too many redirects");
}

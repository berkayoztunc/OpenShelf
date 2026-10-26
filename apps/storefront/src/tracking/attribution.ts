import type { Attribution } from "../api/types";
import { getConsent, getVisitorId, onConsentChange } from "./consent";

const KEY = "os_attr";
const PARAMS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "fbclid", "gclid"] as const;

/** Landing params are held in memory only; they are persisted solely once marketing consent exists. */
let pending: Attribution = {};

function cookie(name: string): string | undefined {
  const m = document.cookie.match(new RegExp(`(?:^|; )${name.replace(/[^\w]/g, "\\$&")}=([^;]*)`));
  return m?.[1] ? decodeURIComponent(m[1]) : undefined;
}

/** Read click ids/UTMs from the current URL into memory (no storage, no network). */
export function bufferLandingParams(search = location.search) {
  const sp = new URLSearchParams(search);
  const found: Attribution = {};
  for (const k of PARAMS) { const v = sp.get(k); if (v) found[k] = v.slice(0, 200); }
  if (Object.keys(found).length) pending = { ...pending, ...found };
  persistIfAllowed();
}

function persistIfAllowed() {
  if (!getConsent().marketing || !Object.keys(pending).length) return;
  try {
    const prev = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Attribution;
    localStorage.setItem(KEY, JSON.stringify({ ...prev, ...pending }));
    pending = {};
  } catch { /* ignore */ }
}
onConsentChange(persistIfAllowed);

/** GA client id from the `_ga` cookie: GA1.1.<id1>.<id2> -> "<id1>.<id2>" */
function gaClientId(): string | undefined {
  const v = cookie("_ga");
  const parts = v?.split(".");
  return parts && parts.length >= 4 ? `${parts[2]}.${parts[3]}` : undefined;
}

/** Everything sent to the API on checkout/track. Empty object without marketing consent. */
export function getAttribution(): Attribution {
  if (!getConsent().marketing) return {};
  let stored: Attribution = {};
  try { stored = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Attribution; } catch { /* ignore */ }
  const a: Attribution = { ...stored, ...pending };
  const fbclid = a.fbclid;
  a.fbp = cookie("_fbp");
  a.fbc = cookie("_fbc") ?? (fbclid ? `fb.1.${Date.now()}.${fbclid}` : undefined);
  a.gaClientId = gaClientId();
  a.visitorId = getVisitorId();
  for (const k of Object.keys(a) as (keyof Attribution)[]) if (!a[k]) delete a[k];
  return a;
}

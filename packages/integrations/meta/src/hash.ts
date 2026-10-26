/** Meta Advanced Matching normalization + SHA-256 (WebCrypto). */
export async function sha256Hex(input: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Digits only incl. country code. Turkish local formats (05xx..., 5xx...) get the 90 prefix. */
export function normalizePhone(phone: string, defaultCountryCode = "90"): string {
  let d = phone.replace(/\D+/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  else if (d.length === 11 && d.startsWith("0")) d = defaultCountryCode + d.slice(1);
  else if (d.length === 10) d = defaultCountryCode + d;
  return d;
}

export function normalizeExternalId(id: string): string {
  return id.trim().toLowerCase();
}

export async function hashEmail(e: string) { return sha256Hex(normalizeEmail(e)); }
export async function hashPhone(p: string) { return sha256Hex(normalizePhone(p)); }
export async function hashExternalId(i: string) { return sha256Hex(normalizeExternalId(i)); }

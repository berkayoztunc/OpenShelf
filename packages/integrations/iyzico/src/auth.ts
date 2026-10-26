const enc = new TextEncoder();

export function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function hmacSha256Hex(key: string, data: string): Promise<string> {
  const k = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return toHex(await crypto.subtle.sign("HMAC", k, enc.encode(data)));
}

function b64(s: string): string {
  const bytes = enc.encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

/** IYZWSv2: signature = hex(HMAC-SHA256(secret, randomKey + uriPath + body)); header = base64("apiKey:..&randomKey:..&signature:.."). */
export async function iyzicoAuthHeader(apiKey: string, secretKey: string, randomKey: string, uriPath: string, body: string): Promise<string> {
  const signature = await hmacSha256Hex(secretKey, randomKey + uriPath + body);
  return "IYZWSv2 " + b64(`apiKey:${apiKey}&randomKey:${randomKey}&signature:${signature}`);
}

/** Constant-time string compare. */
export function safeEqual(a: string, b: string): boolean {
  const ab = enc.encode(a), bb = enc.encode(b);
  let diff = ab.length ^ bb.length;
  const n = Math.max(ab.length, bb.length);
  for (let i = 0; i < n; i++) diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  return diff === 0;
}

export type WebhookPayload = {
  iyziEventType?: string; iyziPaymentId?: string | number; paymentId?: string | number; token?: string;
  paymentConversationId?: string; status?: string; iyziReferenceCode?: string; iyziEventTime?: number;
};

/** X-IYZ-SIGNATURE-V3. HPP (checkout form) format includes token; direct format uses paymentId. */
export async function webhookSignature(secretKey: string, p: WebhookPayload): Promise<string> {
  const key = p.token
    ? secretKey + p.iyziEventType + p.iyziPaymentId + p.token + p.paymentConversationId + p.status
    : secretKey + p.iyziEventType + p.paymentId + p.paymentConversationId + p.status;
  return hmacSha256Hex(secretKey, key);
}

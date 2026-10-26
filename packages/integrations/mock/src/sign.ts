import type { PaymentEvent } from "@openshelf/integration-sdk";

const enc = new TextEncoder();
const keys = new Map<string, Promise<CryptoKey>>();

/** HMAC key derived (HKDF-SHA256, info "mock-pay") from APP_ENCRYPTION_KEY: never the raw key, never usable for real providers. */
export function deriveMockKey(appKeyB64: string | undefined): Promise<CryptoKey> {
  if (!appKeyB64) return Promise.reject(new Error("APP_ENCRYPTION_KEY is required for mock signing"));
  let k = keys.get(appKeyB64);
  if (!k) {
    k = (async () => {
      const raw = Uint8Array.from(atob(appKeyB64.trim()), (c) => c.charCodeAt(0));
      const base = await crypto.subtle.importKey("raw", raw, "HKDF", false, ["deriveKey"]);
      return crypto.subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: enc.encode("mock-pay") }, base, { name: "HMAC", hash: "SHA-256", length: 256 }, false, ["sign", "verify"]);
    })();
    keys.set(appKeyB64, k);
  }
  return k;
}

const toHex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
const fromHex = (h: string) => (/^[0-9a-f]+$/i.test(h) && h.length % 2 === 0 ? Uint8Array.from(h.match(/../g) ?? [], (x) => parseInt(x, 16)) : null);
async function sign(appKey: string | undefined, msg: string) { return toHex(await crypto.subtle.sign("HMAC", await deriveMockKey(appKey), enc.encode(msg))); }
async function verify(appKey: string | undefined, msg: string, sigHex: string) {
  const sig = fromHex(sigHex); if (!sig) return false;
  return crypto.subtle.verify("HMAC", await deriveMockKey(appKey), sig, enc.encode(msg));
}

export type MockPaymentEvent = Omit<PaymentEvent, "raw">;
const canon = (e: MockPaymentEvent) => ["mock-event", e.eventId, e.providerTxId, e.orderId, e.status, e.amount, e.currency.toUpperCase()].join("|");
export const signMockEvent = (appKey: string | undefined, e: MockPaymentEvent) => sign(appKey, canon(e));
export const verifyMockEvent = (appKey: string | undefined, e: MockPaymentEvent, sig: string) => verify(appKey, canon(e), sig);
export const MOCK_SIGNATURE_HEADER = "x-mock-signature";

/** Checkout token: `<orderId>.<hmac24>`; unforgeable without the app key, so /mock/pay/:token cannot be enumerated. */
export async function mockPayToken(appKey: string | undefined, orderId: string): Promise<string> {
  return `${orderId}.${(await sign(appKey, `mock-token|${orderId}`)).slice(0, 24)}`;
}
export async function parseMockPayToken(appKey: string | undefined, token: string): Promise<{ orderId: string } | null> {
  const i = token.lastIndexOf("."); if (i < 1) return null;
  const orderId = token.slice(0, i);
  return (await mockPayToken(appKey, orderId)) === token ? { orderId } : null;
}

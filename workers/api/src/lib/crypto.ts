import type { Env } from "../env";

type U8 = Uint8Array<ArrayBuffer>;
const enc = new TextEncoder();
const dec = new TextDecoder();

export function toBytes(v: unknown): U8 {
  if (v instanceof Uint8Array) return new Uint8Array(v) as U8;
  if (v instanceof ArrayBuffer) return new Uint8Array(v);
  if (Array.isArray(v)) return Uint8Array.from(v as number[]) as U8;
  if (ArrayBuffer.isView(v)) return new Uint8Array(v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength) as ArrayBuffer);
  throw new Error("not_bytes");
}
export const b64 = (b: Uint8Array) => { let s = ""; for (const x of b) s += String.fromCharCode(x); return btoa(s); };
export const unb64 = (s: string): U8 => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
export const b64url = (b: Uint8Array) => b64(b).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
export const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, "0")).join("");

export const randomBytes = (n: number): U8 => crypto.getRandomValues(new Uint8Array(n));
/** 256-bit URL-safe random token. */
export const randomToken = (bytes = 32) => b64url(randomBytes(bytes));

export async function sha256Hex(data: string | U8): Promise<string> {
  const buf = typeof data === "string" ? enc.encode(data) : data;
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", buf)));
}

export function timingSafeEqual(a: string, b: string): boolean {
  const ab = enc.encode(a); const bb = enc.encode(b);
  let diff = ab.length ^ bb.length;
  const n = Math.max(ab.length, bb.length);
  for (let i = 0; i < n; i++) diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  return diff === 0;
}

// ---------- passwords: PBKDF2-SHA256 (Workers cap = 100k iterations) ----------
export const PBKDF2_ITERATIONS = 100_000;
async function pbkdf2(password: string, salt: U8, iterations: number) {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256));
}
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${b64(salt)}$${b64(await pbkdf2(password, salt, PBKDF2_ITERATIONS))}`;
}
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [alg, iterS, saltB64, hashB64] = stored.split("$");
  if (alg !== "pbkdf2" || !iterS || !saltB64 || !hashB64) return false;
  const got = b64(await pbkdf2(password, unb64(saltB64), Math.min(Number(iterS) || PBKDF2_ITERATIONS, PBKDF2_ITERATIONS)));
  return timingSafeEqual(got, hashB64);
}
let dummyHash: Promise<string> | undefined;
/** Burn equal CPU for unknown users (timing-safe login). */
export const dummyVerify = async (password: string) => { dummyHash ??= hashPassword("dummy-password-for-timing"); await verifyPassword(password, await dummyHash); };

// ---------- AES-256-GCM at rest ----------
export const CURRENT_KEY_VERSION = 1;
async function aesKey(env: Pick<Env, "APP_ENCRYPTION_KEY">, _version: number) {
  const raw = env.APP_ENCRYPTION_KEY;
  if (!raw) throw new Error("APP_ENCRYPTION_KEY is not configured");
  const bytes = unb64(raw.trim());
  if (bytes.length !== 32) throw new Error("APP_ENCRYPTION_KEY must be base64 of 32 bytes");
  return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]);
}
export async function encryptBytes(env: Pick<Env, "APP_ENCRYPTION_KEY">, plain: U8, aad?: string) {
  const iv = randomBytes(12);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, ...(aad ? { additionalData: enc.encode(aad) } : {}) }, await aesKey(env, CURRENT_KEY_VERSION), plain));
  return { ciphertext: ct, iv, keyVersion: CURRENT_KEY_VERSION };
}
export async function decryptBytes(env: Pick<Env, "APP_ENCRYPTION_KEY">, ct: U8, iv: U8, keyVersion = CURRENT_KEY_VERSION, aad?: string) {
  return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv, ...(aad ? { additionalData: enc.encode(aad) } : {}) }, await aesKey(env, keyVersion), ct));
}
export const encryptJson = (env: Pick<Env, "APP_ENCRYPTION_KEY">, value: unknown, aad?: string) => encryptBytes(env, enc.encode(JSON.stringify(value)), aad);
export async function decryptJson<T>(env: Pick<Env, "APP_ENCRYPTION_KEY">, ct: U8, iv: U8, keyVersion = CURRENT_KEY_VERSION, aad?: string): Promise<T> {
  return JSON.parse(dec.decode(await decryptBytes(env, ct, iv, keyVersion, aad))) as T;
}

// ---------- TOTP (RFC 6238, SHA-1, 6 digits, 30s) ----------
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export function base32Encode(bytes: Uint8Array): string {
  let bits = 0, value = 0, out = "";
  for (const b of bytes) { value = (value << 8) | b; bits += 8; while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}
export function base32Decode(s: string): U8 {
  let bits = 0, value = 0; const out: number[] = [];
  for (const ch of s.replace(/=+$/, "").toUpperCase()) {
    const i = B32.indexOf(ch); if (i < 0) throw new Error("bad_base32");
    value = (value << 5) | i; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Uint8Array.from(out) as U8;
}
export const generateTotpSecret = () => base32Encode(randomBytes(20));
export async function totpCode(secretB32: string, atMs: number, stepOffset = 0): Promise<string> {
  const counter = Math.floor(atMs / 1000 / 30) + stepOffset;
  const msg = new Uint8Array(8); new DataView(msg.buffer).setBigUint64(0, BigInt(counter));
  const key = await crypto.subtle.importKey("raw", base32Decode(secretB32), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const h = new Uint8Array(await crypto.subtle.sign("HMAC", key, msg));
  const o = h[h.length - 1]! & 15;
  const bin = ((h[o]! & 0x7f) << 24) | (h[o + 1]! << 16) | (h[o + 2]! << 8) | h[o + 3]!;
  return String(bin % 1_000_000).padStart(6, "0");
}
/** Returns the matched TOTP time-step (for replay protection) or null. */
export async function verifyTotpStep(secretB32: string, code: string, atMs = Date.now()): Promise<number | null> {
  let hit: number | null = null;
  for (const off of [-1, 0, 1]) if (timingSafeEqual(await totpCode(secretB32, atMs, off), code)) hit = Math.floor(atMs / 1000 / 30) + off;
  return hit;
}
export async function verifyTotp(secretB32: string, code: string, atMs = Date.now()): Promise<boolean> {
  let ok = false;
  for (const off of [-1, 0, 1]) if (timingSafeEqual(await totpCode(secretB32, atMs, off), code)) ok = true;
  return ok;
}

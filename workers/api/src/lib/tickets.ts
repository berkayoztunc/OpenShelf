import type { Env } from "../env";
import { timingSafeEqual } from "./crypto";

/** Short-lived signed upload ticket: lets ONE client with a shell/HTTP access PUT raw image bytes without a login (the AI chat cannot carry big base64). */
export interface UploadTicket { n: string; aid: string; kind: string; alt: string | null; exp: number }
const b64u = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
async function mac(env: Pick<Env, "APP_ENCRYPTION_KEY">, data: string) {
  if (!env.APP_ENCRYPTION_KEY) throw new Error("APP_ENCRYPTION_KEY missing");
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(`upload-ticket:${env.APP_ENCRYPTION_KEY}`), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64u(new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(data))));
}
export async function signTicket(env: Pick<Env, "APP_ENCRYPTION_KEY">, t: Omit<UploadTicket, "n" | "exp">, ttlMs = 600_000, now = Date.now()) {
  const full: UploadTicket = { ...t, n: crypto.randomUUID(), exp: now + ttlMs };
  const p = b64u(new TextEncoder().encode(JSON.stringify(full)));
  return `${p}.${await mac(env, p)}`;
}
export async function verifyTicket(env: Pick<Env, "APP_ENCRYPTION_KEY">, raw: string, now = Date.now()): Promise<UploadTicket | null> {
  try {
    const [p, sig] = raw.split(".");
    if (!p || !sig || !timingSafeEqual(sig, await mac(env, p))) return null;
    const t = JSON.parse(new TextDecoder().decode(fromB64u(p))) as UploadTicket;
    return t && typeof t.n === "string" && typeof t.exp === "number" && t.exp >= now ? t : null;
  } catch { return null; }
}

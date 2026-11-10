import type { Env } from "../env";
import { timingSafeEqual } from "./crypto";

/**
 * Short-lived signed upload ticket. An authenticated MCP client mints it (create_upload_link) and hands it to a code sandbox that can run an
 * HTTP request but cannot hold the MCP token: the sandbox then PUTs ONE image to /mcp/upload with `X-Upload-Ticket`. The ticket fixes the
 * image kind, expires after minutes, and the server accepts a single successful upload per ticket. It carries no token and is never put in a URL.
 */
export interface UploadTicket { n: string; aid: string; role: string; lvl: string; tid: string; kind: string; alt: string | null; exp: number }
export const TICKET_PREFIX = "upl_";
export const TICKET_TTL_MS = 10 * 60_000;
const b64u = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
async function mac(env: Pick<Env, "APP_ENCRYPTION_KEY">, data: string) {
  if (!env.APP_ENCRYPTION_KEY) throw new Error("APP_ENCRYPTION_KEY missing");
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(`upload-ticket:${env.APP_ENCRYPTION_KEY}`), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64u(new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(data))));
}
export async function signTicket(env: Pick<Env, "APP_ENCRYPTION_KEY">, t: Omit<UploadTicket, "n" | "exp">, ttlMs = TICKET_TTL_MS, now = Date.now()): Promise<string> {
  const full: UploadTicket = { ...t, n: crypto.randomUUID(), exp: now + ttlMs };
  const p = b64u(new TextEncoder().encode(JSON.stringify(full)));
  return `${TICKET_PREFIX}${p}.${await mac(env, p)}`;
}
export async function verifyTicket(env: Pick<Env, "APP_ENCRYPTION_KEY">, raw: string, now = Date.now()): Promise<UploadTicket | null> {
  try {
    if (!raw.startsWith(TICKET_PREFIX) || raw.length > 1200) return null;
    const [p, sig] = raw.slice(TICKET_PREFIX.length).split(".");
    if (!p || !sig || !timingSafeEqual(sig, await mac(env, p))) return null;
    const t = JSON.parse(new TextDecoder().decode(fromB64u(p))) as UploadTicket;
    return t && typeof t.n === "string" && typeof t.aid === "string" && typeof t.exp === "number" && t.exp >= now ? t : null;
  } catch { return null; }
}

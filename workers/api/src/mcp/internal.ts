import type { Role } from "@openshelf/shared";
import type { Env } from "../env";
import { timingSafeEqual } from "../lib/crypto";

/**
 * Short-lived, HMAC-signed marker the MCP layer attaches to its INTERNAL requests to /api/admin/*. Only this process can mint it
 * (key = APP_ENCRYPTION_KEY), so an API token alone can never reach the admin API directly: it has to go through the MCP tool
 * layer, which enforces the token level, the confirm rule and the exclusion list.
 */
export const INTERNAL_HEADER = "x-os-internal";
export interface InternalClaim { aid: string; role: Role; lvl: string; tid: string; exp: number }

const b64u = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
async function mac(env: Pick<Env, "APP_ENCRYPTION_KEY">, data: string): Promise<string> {
  if (!env.APP_ENCRYPTION_KEY) throw new Error("APP_ENCRYPTION_KEY missing");
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(`mcp-internal:${env.APP_ENCRYPTION_KEY}`), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64u(new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(data))));
}

export async function signInternal(env: Pick<Env, "APP_ENCRYPTION_KEY">, claim: Omit<InternalClaim, "exp">, ttlMs = 60_000, now = Date.now()): Promise<string> {
  const payload = b64u(new TextEncoder().encode(JSON.stringify({ ...claim, exp: now + ttlMs })));
  return `${payload}.${await mac(env, payload)}`;
}

export async function verifyInternal(env: Pick<Env, "APP_ENCRYPTION_KEY">, header: string, now = Date.now()): Promise<InternalClaim | null> {
  try {
    const [payload, sig] = header.split(".");
    if (!payload || !sig) return null;
    if (!timingSafeEqual(sig, await mac(env, payload))) return null;
    const c = JSON.parse(new TextDecoder().decode(fromB64u(payload))) as InternalClaim;
    if (!c || typeof c.aid !== "string" || typeof c.exp !== "number" || c.exp < now) return null;
    return c;
  } catch { return null; }
}

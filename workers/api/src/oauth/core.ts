import { and, eq, isNull } from "drizzle-orm";
import { apiTokens, oauthClients, oauthGrants } from "@openshelf/db";
import type { Db } from "../env";
import { randomToken, sha256Hex, timingSafeEqual } from "../lib/crypto";
import type { Level } from "../mcp/tools";
import { LEVEL_RANK } from "../mcp/tools";

export const ACCESS_TTL_SEC = 3600;
export const REFRESH_TTL_SEC = 30 * 86400;
export const CODE_TTL_SEC = 300;
export const MAX_CLIENTS = 300;
export const SCOPES = ["mcp:read", "mcp:write", "mcp:full"] as const;
export const REFRESH_PREFIX = "osr_";
export const CLIENT_SECRET_PREFIX = "osc_";

/** OAuth error that is shown on a plain page (never redirected: the redirect_uri is not trusted yet). */
export class OAuthPageError extends Error { constructor(message: string) { super(message); } }

export const levelOfScope = (scope: string | null | undefined): Level | null => {
  const found = (scope ?? "").split(/\s+/).map((s) => s.replace(/^mcp:/, "")).filter((s): s is Level => s === "read" || s === "write" || s === "full");
  return found.length ? found.reduce((a, b) => (LEVEL_RANK[b] > LEVEL_RANK[a] ? b : a)) : null;
};
export const scopeOfLevel = (l: Level) => `mcp:${l}`;
export const minLevel = (a: Level, b: Level): Level => (LEVEL_RANK[a] <= LEVEL_RANK[b] ? a : b);

/** https, or http on a loopback host (native/desktop apps); no fragments, no credentials, no other schemes. */
export function validRedirectUri(raw: unknown): raw is string {
  if (typeof raw !== "string" || raw.length > 500) return false;
  let u: URL;
  try { u = new URL(raw); } catch { return false; }
  if (u.hash || u.username || u.password) return false;
  if (u.protocol === "https:") return true;
  return u.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
}

export const pkceChallenge = async (verifier: string) => {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  return btoa(String.fromCharCode(...d)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
export const validVerifier = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9\-._~]{43,128}$/.test(v);
export const validChallenge = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9\-_]{43}$/.test(v);

export interface AuthRequest { client: typeof oauthClients.$inferSelect; redirectUri: string; state: string | null; codeChallenge: string; maxLevel: Level; scope: string | null; resource: string | null }

/** Validates an authorization request (shared by GET /oauth/authorize, the consent page info and the consent POST). Throws OAuthPageError. */
export async function validateAuthRequest(db: Db, origin: string, p: Record<string, string | undefined>): Promise<AuthRequest> {
  if (p["response_type"] !== "code") throw new OAuthPageError("Unsupported response_type (must be \"code\").");
  const clientId = p["client_id"];
  if (!clientId) throw new OAuthPageError("Missing client_id.");
  const [client] = await db.select().from(oauthClients).where(eq(oauthClients.clientId, clientId)).limit(1);
  if (!client || client.disabledAt) throw new OAuthPageError("Unknown or disabled application.");
  const redirectUri = p["redirect_uri"];
  if (!redirectUri || !client.redirectUris.includes(redirectUri)) throw new OAuthPageError("The redirect_uri does not match one registered for this application.");
  if (p["code_challenge_method"] !== "S256" || !validChallenge(p["code_challenge"])) throw new OAuthPageError("PKCE with code_challenge_method=S256 is required.");
  const resource = p["resource"] ?? null;
  if (resource && resource.replace(/\/+$/, "") !== `${origin}/mcp`) throw new OAuthPageError("Unknown resource: this server only issues tokens for its own /mcp endpoint.");
  return { client, redirectUri, state: p["state"] ?? null, codeChallenge: p["code_challenge"], maxLevel: levelOfScope(p["scope"]) ?? "full", scope: p["scope"] ?? null, resource };
}

/** Creates the access token row (osk_…, 1 h, tied to the grant) and returns the clear token. */
export async function issueAccessToken(db: Db, g: { id: string; adminId: string; level: string }, clientName: string, now = new Date()) {
  const token = `osk_${randomToken(32)}`;
  await db.insert(apiTokens).values({ id: crypto.randomUUID(), adminId: g.adminId, name: `OAuth: ${clientName}`.slice(0, 80), tokenHash: await sha256Hex(token), prefix: token.slice(0, 12), level: g.level, expiresAt: new Date(now.getTime() + ACCESS_TTL_SEC * 1000), grantId: g.id });
  return token;
}

/** Revokes a grant and every access token issued from it. */
export async function revokeGrant(db: Db, grantId: string, now = new Date()) {
  await db.batch([
    db.update(oauthGrants).set({ revokedAt: now }).where(and(eq(oauthGrants.id, grantId), isNull(oauthGrants.revokedAt))),
    db.update(apiTokens).set({ revokedAt: now }).where(and(eq(apiTokens.grantId, grantId), isNull(apiTokens.revokedAt))),
  ]);
}

/** Client authentication at the token endpoint: public clients send none; confidential (manual) clients must present the secret (post body or Basic). */
export async function authenticateClient(c: { clientId: string; secretHash: string | null }, form: Record<string, unknown>, basic: string | null): Promise<boolean> {
  if (!c.secretHash) return true;
  let secret = typeof form["client_secret"] === "string" ? (form["client_secret"] as string) : "";
  if (!secret && basic?.toLowerCase().startsWith("basic ")) {
    try { const [id, ...rest] = atob(basic.slice(6)).split(":"); if (decodeURIComponent(id ?? "") === c.clientId) secret = decodeURIComponent(rest.join(":")); } catch { /* invalid */ }
  }
  return !!secret && timingSafeEqual(await sha256Hex(secret), c.secretHash);
}

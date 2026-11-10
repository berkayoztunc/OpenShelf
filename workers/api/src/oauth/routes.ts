import { Hono } from "hono";
import { cors } from "hono/cors";
import { and, count, eq, isNull, lt } from "drizzle-orm";
import { oauthClients, oauthCodes, oauthGrants } from "@openshelf/db";
import type { AppEnv } from "../env";
import { audit } from "../lib/audit";
import { randomToken, sha256Hex } from "../lib/crypto";
import { hit } from "../middleware/security";
import {
  ACCESS_TTL_SEC, MAX_CLIENTS, OAuthPageError, REFRESH_PREFIX, REFRESH_TTL_SEC, SCOPES, authenticateClient, issueAccessToken, pkceChallenge, revokeGrant, validRedirectUri, validVerifier, validateAuthRequest,
} from "./core";

const origin = (c: { req: { url: string } }) => new URL(c.req.url).origin;
const json = (body: unknown, status = 200, extra: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...extra } });
const oauthErr = (error: string, description: string, status = 400) => json({ error, error_description: description }, status);
const page = (title: string, body: string, status = 400) => new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title></head><body style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;background:#f5f5f7;margin:0;padding:24px"><main style="max-width:460px;margin:48px auto;background:#fff;border-radius:12px;padding:28px;line-height:1.5"><h1 style="font-size:20px;margin:0 0 12px">${title}</h1><p>${body}</p></main></body></html>`,
  { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "referrer-policy": "no-referrer", "x-robots-tag": "noindex" } });
const esc = (s: string) => s.replace(/[<>&"']/g, (ch) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" })[ch]!);

/** Public OAuth 2.1 endpoints for MCP clients: discovery, dynamic registration, authorize (-> admin consent page), token, revoke. */
export function mountOauth(app: Hono<AppEnv>) {
  // Browser-based MCP clients call these cross-origin (no cookies, bearer/PKCE only).
  const open = cors({ origin: "*", allowHeaders: ["Authorization", "Content-Type", "Mcp-Protocol-Version", "Mcp-Session-Id"], allowMethods: ["GET", "POST", "OPTIONS"], exposeHeaders: ["WWW-Authenticate"], maxAge: 600 });
  for (const p of ["/mcp", "/oauth/register", "/oauth/token", "/oauth/revoke", "/.well-known/*"]) app.use(p, open);

  /* ---------- discovery ---------- */
  const resourceMeta = (c: { req: { url: string } }) => json({ resource: `${origin(c)}/mcp`, authorization_servers: [origin(c)], bearer_methods_supported: ["header"], scopes_supported: [...SCOPES], resource_name: "OpenShelf store management (MCP)" }, 200, { "cache-control": "public, max-age=300" });
  const serverMeta = (c: { req: { url: string } }) => json({
    issuer: origin(c), authorization_endpoint: `${origin(c)}/oauth/authorize`, token_endpoint: `${origin(c)}/oauth/token`, registration_endpoint: `${origin(c)}/oauth/register`, revocation_endpoint: `${origin(c)}/oauth/revoke`,
    response_types_supported: ["code"], grant_types_supported: ["authorization_code", "refresh_token"], code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"], scopes_supported: [...SCOPES], service_documentation: "https://github.com/berkayoztunc/OpenShelf/blob/main/docs/mcp.md",
  }, 200, { "cache-control": "public, max-age=300" });
  for (const p of ["/.well-known/oauth-protected-resource", "/.well-known/oauth-protected-resource/mcp"]) app.get(p, (c) => resourceMeta(c));
  for (const p of ["/.well-known/oauth-authorization-server", "/.well-known/oauth-authorization-server/mcp", "/.well-known/openid-configuration"]) app.get(p, (c) => serverMeta(c));

  /* ---------- dynamic client registration (RFC 7591) ---------- */
  app.post("/oauth/register", async (c) => {
    const db = c.get("db");
    if ((await hit(c.env.DB, `oauth-register:${c.get("ip")}`, 3600)).count > 10) return oauthErr("temporarily_unavailable", "Too many registrations, try again later", 429);
    let b: Record<string, unknown>;
    try { b = (await c.req.json()) as Record<string, unknown>; } catch { return oauthErr("invalid_client_metadata", "Body must be JSON"); }
    const uris = b["redirect_uris"];
    if (!Array.isArray(uris) || uris.length === 0 || uris.length > 5 || !uris.every(validRedirectUri)) return oauthErr("invalid_redirect_uri", "redirect_uris must be 1-5 https URLs (or http loopback URLs for native apps) without fragments");
    const name = typeof b["client_name"] === "string" && b["client_name"].trim() ? b["client_name"].trim().slice(0, 80) : "MCP client";
    // prune never-used self-registered clients, then enforce the global cap
    await db.delete(oauthClients).where(and(eq(oauthClients.kind, "dynamic"), isNull(oauthClients.lastUsedAt), lt(oauthClients.createdAt, new Date(Date.now() - 86400_000))));
    const [n] = await db.select({ n: count() }).from(oauthClients);
    if ((n?.n ?? 0) >= MAX_CLIENTS) return oauthErr("temporarily_unavailable", "Client registry is full", 503);
    const clientId = `osc-${randomToken(18)}`;
    await db.insert(oauthClients).values({ clientId, name, redirectUris: uris as string[], kind: "dynamic" });
    await audit(c, "oauth.client_register", "oauth_client", clientId, { name, hosts: (uris as string[]).map((u) => new URL(u).host) }, undefined).catch(() => {});
    return json({ client_id: clientId, client_name: name, redirect_uris: uris, grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], token_endpoint_auth_method: "none", client_id_issued_at: Math.floor(Date.now() / 1000) }, 201);
  });

  /* ---------- authorize: validate, then hand over to the admin consent page ---------- */
  app.get("/oauth/authorize", async (c) => {
    try {
      const q = c.req.query();
      await validateAuthRequest(c.get("db"), origin(c), q);
      const next = new URL(`${origin(c)}/admin/oauth/authorize`);
      for (const k of ["response_type", "client_id", "redirect_uri", "state", "code_challenge", "code_challenge_method", "scope", "resource"]) if (q[k]) next.searchParams.set(k, q[k]!);
      return new Response(null, { status: 302, headers: { Location: next.toString(), "cache-control": "no-store", "referrer-policy": "no-referrer" } });
    } catch (e) {
      if (e instanceof OAuthPageError) return page("Cannot authorize", esc(e.message));
      throw e;
    }
  });

  /* ---------- token ---------- */
  app.post("/oauth/token", async (c) => {
    const db = c.get("db");
    if ((await hit(c.env.DB, `oauth-token:${c.get("ip")}`, 60)).count > 60) return oauthErr("temporarily_unavailable", "Rate limit exceeded", 429);
    const form = (await c.req.parseBody().catch(() => ({}))) as Record<string, unknown>;
    const str = (k: string) => (typeof form[k] === "string" ? (form[k] as string) : "");
    const basic = c.req.header("Authorization") ?? null;
    const clientId = str("client_id") || (basic?.toLowerCase().startsWith("basic ") ? (() => { try { return decodeURIComponent(atob(basic.slice(6)).split(":")[0] ?? ""); } catch { return ""; } })() : "");
    const [client] = clientId ? await db.select().from(oauthClients).where(eq(oauthClients.clientId, clientId)).limit(1) : [];
    if (!client || client.disabledAt) return oauthErr("invalid_client", "Unknown client", 401);
    if (!(await authenticateClient(client, form, basic))) return oauthErr("invalid_client", "Client authentication failed", 401);
    const now = new Date();
    const grantType = str("grant_type");

    if (grantType === "authorization_code") {
      const code = str("code"); const verifier = str("code_verifier");
      if (!code) return oauthErr("invalid_request", "code is required");
      if (!validVerifier(verifier)) return oauthErr("invalid_request", "code_verifier is required (43-128 chars)");
      const hash = await sha256Hex(code);
      const [row] = await db.select().from(oauthCodes).where(eq(oauthCodes.codeHash, hash)).limit(1);
      if (!row) return oauthErr("invalid_grant", "Invalid authorization code");
      if (row.usedAt) { if (row.grantId) await revokeGrant(db, row.grantId, now); return oauthErr("invalid_grant", "Authorization code already used"); } // replay: kill what it produced
      if (row.expiresAt.getTime() < now.getTime()) return oauthErr("invalid_grant", "Authorization code expired");
      if (row.clientId !== client.clientId || row.redirectUri !== str("redirect_uri")) return oauthErr("invalid_grant", "client_id or redirect_uri does not match the authorization request");
      if ((await pkceChallenge(verifier)) !== row.codeChallenge) return oauthErr("invalid_grant", "PKCE verification failed");
      const claim = await c.env.DB.prepare("UPDATE oauth_codes SET used_at = unixepoch() WHERE code_hash = ?1 AND used_at IS NULL").bind(hash).run();
      if (!claim.meta.changes) return oauthErr("invalid_grant", "Authorization code already used");
      const refresh = `${REFRESH_PREFIX}${randomToken(32)}`; const grantId = crypto.randomUUID();
      await db.insert(oauthGrants).values({ id: grantId, clientId: client.clientId, adminId: row.adminId, level: row.level, refreshHash: await sha256Hex(refresh), refreshExpiresAt: new Date(now.getTime() + REFRESH_TTL_SEC * 1000), lastUsedAt: now });
      await db.update(oauthCodes).set({ grantId }).where(eq(oauthCodes.codeHash, hash));
      await db.update(oauthClients).set({ lastUsedAt: now }).where(eq(oauthClients.clientId, client.clientId));
      const access = await issueAccessToken(db, { id: grantId, adminId: row.adminId, level: row.level }, client.name, now);
      await audit(c, "oauth.token", "oauth_grant", grantId, { client: client.name, level: row.level, grant: "authorization_code" }, row.adminId).catch(() => {});
      return json({ access_token: access, token_type: "Bearer", expires_in: ACCESS_TTL_SEC, refresh_token: refresh, scope: `mcp:${row.level}` });
    }

    if (grantType === "refresh_token") {
      const rt = str("refresh_token");
      if (!rt.startsWith(REFRESH_PREFIX)) return oauthErr("invalid_grant", "Invalid refresh token");
      const hash = await sha256Hex(rt);
      const [cur] = await db.select().from(oauthGrants).where(eq(oauthGrants.refreshHash, hash)).limit(1);
      if (!cur) {
        const [reused] = await db.select().from(oauthGrants).where(eq(oauthGrants.prevRefreshHash, hash)).limit(1);
        if (reused) await revokeGrant(db, reused.id, now); // an already-rotated refresh token came back: assume theft, kill the grant
        return oauthErr("invalid_grant", "Invalid refresh token");
      }
      if (cur.revokedAt || cur.refreshExpiresAt.getTime() < now.getTime() || cur.clientId !== client.clientId) return oauthErr("invalid_grant", "Refresh token is revoked, expired or belongs to another client");
      const next = `${REFRESH_PREFIX}${randomToken(32)}`;
      const rot = await c.env.DB.prepare("UPDATE oauth_grants SET prev_refresh_hash = refresh_hash, refresh_hash = ?2, refresh_expires_at = ?3, last_used_at = ?4 WHERE id = ?1 AND refresh_hash = ?5 AND revoked_at IS NULL")
        .bind(cur.id, await sha256Hex(next), Math.floor((now.getTime() + REFRESH_TTL_SEC * 1000) / 1000), Math.floor(now.getTime() / 1000), hash).run();
      if (!rot.meta.changes) return oauthErr("invalid_grant", "Refresh token already used");
      const access = await issueAccessToken(db, cur, client.name, now);
      return json({ access_token: access, token_type: "Bearer", expires_in: ACCESS_TTL_SEC, refresh_token: next, scope: `mcp:${cur.level}` });
    }
    return oauthErr("unsupported_grant_type", "Use authorization_code or refresh_token");
  });

  /* ---------- revoke (RFC 7009): always 200 ---------- */
  app.post("/oauth/revoke", async (c) => {
    const db = c.get("db");
    const form = (await c.req.parseBody().catch(() => ({}))) as Record<string, unknown>;
    const tok = typeof form["token"] === "string" ? (form["token"] as string) : "";
    if (tok) {
      const hash = await sha256Hex(tok);
      if (tok.startsWith(REFRESH_PREFIX)) {
        const [g] = await db.select().from(oauthGrants).where(eq(oauthGrants.refreshHash, hash)).limit(1);
        if (g) await revokeGrant(db, g.id);
      } else {
        const r = await c.env.DB.prepare("SELECT grant_id AS g FROM api_tokens WHERE token_hash = ?1 AND grant_id IS NOT NULL").bind(hash).first<{ g: string }>();
        if (r?.g) await revokeGrant(db, r.g);
      }
    }
    return new Response(null, { status: 200, headers: { "cache-control": "no-store" } });
  });
}

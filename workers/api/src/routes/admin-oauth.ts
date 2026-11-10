import { Hono, type MiddlewareHandler } from "hono";
import { desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { oauthClients, oauthCodes, oauthGrants } from "@openshelf/db";
import type { AppEnv } from "../env";
import { ApiError, body, notFound } from "../lib/http";
import { audit } from "../lib/audit";
import { randomToken, sha256Hex } from "../lib/crypto";
import { requireRole } from "../middleware/auth";
import { CLIENT_SECRET_PREFIX, CODE_TTL_SEC, OAuthPageError, minLevel, revokeGrant, scopeOfLevel, validRedirectUri, validateAuthRequest } from "../oauth/core";
import { type Level } from "../mcp/tools";

export const adminOauth = new Hono<AppEnv>();
adminOauth.use("/oauth/*", requireRole("admin"));
// browser panel only: the internal MCP claim has no csrfToken, so a token can never approve apps or create clients
const panelOnly: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!c.get("admin")!.csrfToken) throw new ApiError(403, "forbidden", "OAuth apps can only be managed from the admin panel");
  await next();
};
adminOauth.use("/oauth/*", panelOnly);
const origin = (c: { req: { url: string } }) => new URL(c.req.url).origin;
const bad = (e: unknown): never => { if (e instanceof OAuthPageError) throw new ApiError(400, "invalid_authorization_request", e.message); throw e; };

/** Consent page data: validates the request exactly like /oauth/authorize and tells the human who is asking. */
adminOauth.get("/oauth/authorize-info", async (c) => {
  try {
    const r = await validateAuthRequest(c.get("db"), origin(c), c.req.query());
    return c.json({ client: { id: r.client.clientId, name: r.client.name, kind: r.client.kind, neverUsed: !r.client.lastUsedAt }, redirectUri: r.redirectUri, redirectHost: new URL(r.redirectUri).host, maxLevel: r.maxLevel, scope: r.scope });
  } catch (e) { return bad(e); }
});

const ApproveBody = z.object({
  response_type: z.string(), client_id: z.string(), redirect_uri: z.string(), state: z.string().max(2000).optional(), code_challenge: z.string(), code_challenge_method: z.string(),
  scope: z.string().optional(), resource: z.string().optional(), level: z.enum(["read", "write", "full"]), decision: z.enum(["allow", "deny"]),
});
adminOauth.post("/oauth/authorize", async (c) => {
  const b = await body(c, ApproveBody); const db = c.get("db"); const a = c.get("admin")!;
  let req;
  try { req = await validateAuthRequest(db, origin(c), b); } catch (e) { return bad(e); }
  const redirect = new URL(req.redirectUri);
  if (b.decision === "deny") {
    redirect.searchParams.set("error", "access_denied"); if (req.state) redirect.searchParams.set("state", req.state);
    await audit(c, "oauth.deny", "oauth_client", req.client.clientId, { client: req.client.name });
    return c.json({ redirectTo: redirect.toString() });
  }
  const level: Level = minLevel(b.level, req.maxLevel);
  const code = randomToken(32);
  await db.insert(oauthCodes).values({ codeHash: await sha256Hex(code), clientId: req.client.clientId, adminId: a.id, redirectUri: req.redirectUri, codeChallenge: req.codeChallenge, level, resource: req.resource, expiresAt: new Date(Date.now() + CODE_TTL_SEC * 1000) });
  redirect.searchParams.set("code", code); if (req.state) redirect.searchParams.set("state", req.state);
  await audit(c, "oauth.authorize", "oauth_client", req.client.clientId, { client: req.client.name, level, host: redirect.host });
  return c.json({ redirectTo: redirect.toString(), level, scope: scopeOfLevel(level) });
});

/* ---------- connected apps (grants) ---------- */
adminOauth.get("/oauth/grants", async (c) => {
  const a = c.get("admin")!; const db = c.get("db");
  const rows = await db.select({ g: oauthGrants, name: oauthClients.name, kind: oauthClients.kind }).from(oauthGrants).leftJoin(oauthClients, eq(oauthClients.clientId, oauthGrants.clientId)).where(isNull(oauthGrants.revokedAt)).orderBy(desc(oauthGrants.createdAt)).limit(200);
  return c.json({ items: rows.filter((r) => a.role === "owner" || r.g.adminId === a.id).map((r) => ({ id: r.g.id, client: r.name ?? "(deleted client)", kind: r.kind, level: r.g.level, adminId: r.g.adminId, createdAt: r.g.createdAt, lastUsedAt: r.g.lastUsedAt ?? null, refreshExpiresAt: r.g.refreshExpiresAt })) });
});
adminOauth.delete("/oauth/grants/:id", async (c) => {
  const a = c.get("admin")!; const db = c.get("db"); const id = c.req.param("id");
  const [g] = await db.select().from(oauthGrants).where(eq(oauthGrants.id, id)).limit(1);
  if (!g || (a.role !== "owner" && g.adminId !== a.id)) throw notFound("Grant");
  await revokeGrant(db, id);
  await audit(c, "oauth.grant_revoke", "oauth_grant", id);
  return c.body(null, 204);
});

/* ---------- manual (confidential) clients ---------- */
adminOauth.get("/oauth/clients", async (c) => {
  const rows = await c.get("db").select().from(oauthClients).orderBy(desc(oauthClients.createdAt)).limit(300);
  return c.json({ items: rows.map((r) => ({ clientId: r.clientId, name: r.name, kind: r.kind, redirectUris: r.redirectUris, confidential: !!r.secretHash, createdAt: r.createdAt, lastUsedAt: r.lastUsedAt ?? null, disabled: !!r.disabledAt })) });
});
const ClientBody = z.object({ name: z.string().trim().min(1).max(80), redirectUris: z.array(z.string()).min(1).max(5) });
adminOauth.post("/oauth/clients", requireRole("owner"), async (c) => {
  const b = await body(c, ClientBody); const a = c.get("admin")!;
  if (!b.redirectUris.every(validRedirectUri)) throw new ApiError(400, "validation_error", "Redirect URIs must be https URLs (or http loopback) without fragments");
  const clientId = `osm-${randomToken(14)}`; const secret = `${CLIENT_SECRET_PREFIX}${randomToken(32)}`;
  await c.get("db").insert(oauthClients).values({ clientId, name: b.name, redirectUris: b.redirectUris, secretHash: await sha256Hex(secret), kind: "manual", createdBy: a.id });
  await audit(c, "oauth.client_create", "oauth_client", clientId, { name: b.name });
  return c.json({ clientId, clientSecret: secret, name: b.name, redirectUris: b.redirectUris }, 201); // the secret is shown once
});
adminOauth.delete("/oauth/clients/:id", requireRole("owner"), async (c) => {
  const db = c.get("db"); const id = c.req.param("id");
  const [cl] = await db.select().from(oauthClients).where(eq(oauthClients.clientId, id)).limit(1);
  if (!cl) throw notFound("Client");
  const grants = await db.select({ id: oauthGrants.id }).from(oauthGrants).where(eq(oauthGrants.clientId, id));
  for (const g of grants) await revokeGrant(db, g.id);
  await db.delete(oauthClients).where(eq(oauthClients.clientId, id));
  await audit(c, "oauth.client_delete", "oauth_client", id, { revokedGrants: grants.length });
  return c.body(null, 204);
});

import { Hono } from "hono";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { apiTokens } from "@openshelf/db";
import type { AppEnv } from "../env";
import { ApiError, body, notFound } from "../lib/http";
import { audit } from "../lib/audit";
import { randomToken, sha256Hex } from "../lib/crypto";
import { requireRole } from "../middleware/auth";
import { enforceRateLimit } from "../middleware/security";
import { TOKEN_PREFIX } from "../mcp/server";

export const adminTokens = new Hono<AppEnv>();
// Tokens grant access to the whole store: owner/admin only, and ONLY from a browser session (the internal MCP claim has no csrfToken).
adminTokens.use("/tokens", requireRole("admin"));
adminTokens.use("/tokens/*", requireRole("admin"));
adminTokens.use("/tokens", async (c, next) => { if (!c.get("admin")!.csrfToken) throw new ApiError(403, "forbidden", "API tokens can only be managed from the admin panel"); await next(); });
adminTokens.use("/tokens/*", async (c, next) => { if (!c.get("admin")!.csrfToken) throw new ApiError(403, "forbidden", "API tokens can only be managed from the admin panel"); await next(); });

const CreateBody = z.object({
  name: z.string().trim().min(1).max(80),
  level: z.enum(["read", "write", "full"]),
  /** days until expiry; null = never */
  expiresInDays: z.number().int().min(1).max(3650).nullable().default(90),
});

const view = (t: typeof apiTokens.$inferSelect) => ({
  id: t.id, name: t.name, prefix: t.prefix, level: t.level, adminId: t.adminId, createdAt: t.createdAt, lastUsedAt: t.lastUsedAt ?? null,
  expiresAt: t.expiresAt ?? null, revokedAt: t.revokedAt ?? null,
});

adminTokens.get("/tokens", async (c) => {
  const a = c.get("admin")!;
  const rows = await c.get("db").select().from(apiTokens).orderBy(desc(apiTokens.createdAt)).limit(200);
  // admins see their own tokens; the owner sees everyone's (to be able to revoke)
  return c.json({ items: rows.filter((r) => a.role === "owner" || r.adminId === a.id).map(view) });
});

adminTokens.post("/tokens", async (c) => {
  const b = await body(c, CreateBody); const a = c.get("admin")!;
  await enforceRateLimit(c, "token-create", 30, 3600, a.id);
  const token = `${TOKEN_PREFIX}${randomToken(32)}`;
  const id = crypto.randomUUID();
  const expiresAt = b.expiresInDays ? new Date(Date.now() + b.expiresInDays * 86400_000) : null;
  await c.get("db").insert(apiTokens).values({ id, adminId: a.id, name: b.name, tokenHash: await sha256Hex(token), prefix: token.slice(0, 12), level: b.level, expiresAt });
  await audit(c, "token.create", "api_token", id, { level: b.level, expiresInDays: b.expiresInDays });
  // the clear token is returned ONCE and never stored
  return c.json({ token, mcpUrl: `${new URL(c.req.url).origin}/mcp`, ...view((await c.get("db").select().from(apiTokens).where(eq(apiTokens.id, id)).limit(1))[0]!) }, 201);
});

adminTokens.delete("/tokens/:id", async (c) => {
  const a = c.get("admin")!; const id = c.req.param("id"); const db = c.get("db");
  const [t] = await db.select().from(apiTokens).where(eq(apiTokens.id, id)).limit(1);
  if (!t || (a.role !== "owner" && t.adminId !== a.id)) throw notFound("Token");
  if (!t.revokedAt) await db.update(apiTokens).set({ revokedAt: new Date() }).where(eq(apiTokens.id, id));
  await audit(c, "token.revoke", "api_token", id);
  return c.body(null, 204);
});

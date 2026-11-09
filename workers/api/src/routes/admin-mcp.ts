import { Hono, type MiddlewareHandler } from "hono";
import { z } from "zod";
import type { AppEnv } from "../env";
import { ApiError, body } from "../lib/http";
import { audit } from "../lib/audit";
import { requireRole } from "../middleware/auth";
import { isKnownTool, loadPolicy, savePolicy } from "../mcp/policy";
import { TOOLS, groupOf } from "../mcp/tools";

export const adminMcp = new Hono<AppEnv>();
// Reachable only from the admin panel (cookie session): the internal MCP claim has no csrfToken, so a token can never change its own permissions.
const panelOnly: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!c.get("admin")!.csrfToken) throw new ApiError(403, "forbidden", "MCP permissions can only be managed from the admin panel");
  await next();
};
adminMcp.use("/mcp/*", requireRole("admin"));
adminMcp.use("/mcp/*", panelOnly);

const PatchBody = z.object({ masterEnabled: z.boolean().optional(), tools: z.record(z.string(), z.boolean()).optional() }).refine((b) => b.masterEnabled !== undefined || (b.tools && Object.keys(b.tools).length > 0), "nothing to change");

const view = async (db: AppEnv["Variables"]["db"]) => {
  const p = await loadPolicy(db);
  return {
    masterEnabled: p.masterEnabled,
    tools: TOOLS.map((t) => ({ name: t.name, title: t.title, description: t.description, level: t.level, group: groupOf(t), method: t.method, path: t.path, readOnly: t.method === "GET" || t.level === "read", enabled: !p.disabled.has(t.name) })),
  };
};

adminMcp.get("/mcp/tools", async (c) => c.json(await view(c.get("db"))));

/** Owner only: widening or narrowing what AI clients may do is an owner decision. */
adminMcp.put("/mcp/tools", requireRole("owner"), async (c) => {
  const b = await body(c, PatchBody); const db = c.get("db");
  const unknown = Object.keys(b.tools ?? {}).filter((n) => !isKnownTool(n));
  if (unknown.length) throw new ApiError(400, "validation_error", `Unknown tool(s): ${unknown.slice(0, 5).join(", ")}`);
  await savePolicy(db, c.get("admin")!.id, b);
  await audit(c, "mcp.policy.update", "mcp", "tools", { masterEnabled: b.masterEnabled, changed: Object.keys(b.tools ?? {}).length, disabled: Object.values(b.tools ?? {}).filter((v) => !v).length });
  return c.json(await view(db));
});

import { Hono } from "hono";
import { and, desc, eq, sql } from "drizzle-orm";
import { auditLogs, integrationEvents, marketingEvents, outboxJobs } from "@openshelf/db";
import { SETTING_GROUPS, type SettingGroup, IntegrationPutBody } from "@openshelf/shared";
import type { AppEnv } from "../env";
import { ApiError, body, notFound, paged, paging, parse } from "../lib/http";
import { audit } from "../lib/audit";
import { requireRole } from "../middleware/auth";
import { getAllSettings, saveSettings } from "../lib/settings";
import { isProvider, listIntegrations, saveIntegration, testIntegration } from "../lib/integrations";

export const adminSettings = new Hono<AppEnv>();

adminSettings.get("/settings", requireRole("staff"), async (c) => c.json(await getAllSettings(c.get("db"))));
adminSettings.put("/settings/:group", requireRole("admin"), async (c) => {
  const group = c.req.param("group") as SettingGroup;
  if (!(group in SETTING_GROUPS)) throw notFound("Settings group");
  const value = await body(c, SETTING_GROUPS[group]);
  await saveSettings(c.get("db"), group, value as never, c.get("admin")!.id);
  await audit(c, "settings.update", "settings", group, { keys: Object.keys(value as object) });
  return c.json(value);
});

adminSettings.get("/integrations", requireRole("admin"), async (c) => c.json(await listIntegrations(c.env, c.get("db"))));
adminSettings.put("/integrations/:provider", requireRole("admin"), async (c) => {
  const provider = c.req.param("provider");
  if (!isProvider(provider)) throw notFound("Integration");
  const b = await body(c, IntegrationPutBody);
  await saveIntegration(c.env, c.get("db"), provider, b, c.get("admin")!.id);
  // audit records which secret keys changed, never values
  await audit(c, "integration.update", "integration", provider, { enabled: b.enabled, secretKeysTouched: Object.keys(b.secrets ?? {}).filter((k) => b.secrets![k] !== "") });
  const all = await listIntegrations(c.env, c.get("db"));
  return c.json(all.find((i) => i.provider === provider));
});
adminSettings.post("/integrations/:provider/test", requireRole("admin"), async (c) => {
  const provider = c.req.param("provider");
  if (!isProvider(provider)) throw notFound("Integration");
  const r = await testIntegration(c.env, c.get("db"), provider);
  await audit(c, "integration.test", "integration", provider, { ok: r.ok });
  return c.json(r);
});

adminSettings.get("/integration-events", requireRole("admin"), async (c) => {
  const p = paging(c, 50); const db = c.get("db");
  const provider = c.req.query("provider");
  const where = provider ? eq(integrationEvents.provider, provider) : undefined;
  const items = await db.select().from(integrationEvents).where(where).orderBy(desc(integrationEvents.id)).limit(p.pageSize).offset(p.offset);
  const [t] = await db.select({ n: sql<number>`count(*)` }).from(integrationEvents).where(where);
  return c.json(paged(items, t?.n ?? 0, p));
});
adminSettings.get("/marketing-events", requireRole("admin"), async (c) => {
  const p = paging(c, 50); const db = c.get("db");
  const items = await db.select().from(marketingEvents).orderBy(desc(marketingEvents.id)).limit(p.pageSize).offset(p.offset);
  const [t] = await db.select({ n: sql<number>`count(*)` }).from(marketingEvents);
  return c.json(paged(items, t?.n ?? 0, p));
});
adminSettings.get("/outbox", requireRole("admin"), async (c) => {
  const p = paging(c, 50); const db = c.get("db");
  const status = c.req.query("status");
  const where = status ? eq(outboxJobs.status, status) : undefined;
  const items = await db.select().from(outboxJobs).where(where).orderBy(desc(outboxJobs.createdAt)).limit(p.pageSize).offset(p.offset);
  const [t] = await db.select({ n: sql<number>`count(*)` }).from(outboxJobs).where(where);
  return c.json(paged(items, t?.n ?? 0, p));
});
adminSettings.post("/outbox/:id/retry", requireRole("admin"), async (c) => {
  const id = c.req.param("id");
  const r = await c.env.DB.prepare(`UPDATE outbox_jobs SET status = 'pending', attempts = 0, next_run_at = unixepoch(), last_error = NULL, updated_at = unixepoch() WHERE id = ?1 AND status IN ('failed','dead','pending')`).bind(id).run();
  if (!r.meta.changes) throw new ApiError(404, "not_found", "Job not found or already running/done");
  await audit(c, "outbox.retry", "outbox", id);
  return c.json({ ok: true });
});
adminSettings.get("/audit-logs", requireRole("admin"), async (c) => {
  const p = paging(c, 50); const db = c.get("db");
  const items = await db.select().from(auditLogs).orderBy(desc(auditLogs.id)).limit(p.pageSize).offset(p.offset);
  const [t] = await db.select({ n: sql<number>`count(*)` }).from(auditLogs);
  return c.json(paged(items, t?.n ?? 0, p));
});
void parse; void and;

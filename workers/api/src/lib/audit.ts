import type { Context } from "hono";
import type { AppEnv } from "../env";
import { auditLogs } from "@openshelf/db";
import { redact } from "./log";

export async function audit(c: Context<AppEnv>, action: string, entity?: string, entityId?: string, meta?: Record<string, unknown>, adminId?: string) {
  await c.get("db").insert(auditLogs).values({
    adminId: adminId ?? c.get("admin")?.id ?? null, action, entity: entity ?? null, entityId: entityId ?? null,
    meta: meta ? (redact(meta) as Record<string, unknown>) : null, ip: c.get("ip"),
  });
}

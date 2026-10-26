import type { OpenShelfIntegration } from "@openshelf/integration-sdk";
import type { ProviderId } from "@openshelf/shared";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "@openshelf/db";
import type { Db, Env } from "./env";
import { getAdapter, logIntegrationEvent } from "./lib/integrations";
import { log } from "./lib/log";
import { allJobHandlers } from "./integrations/registry";

export interface OutboxJob { id: string; kind: string; payload: unknown; attempts: number; maxAttempts: number }
export interface JobContext {
  env: Env; db: Db; now: Date;
  /** Writes to integration_events (shown in admin). */
  log(level: "info" | "warn" | "error", msg: string, meta?: unknown): Promise<void>;
  /** Decrypted, enabled adapter for a provider (null if disabled/unavailable). */
  getAdapter<T extends OpenShelfIntegration = OpenShelfIntegration>(provider: ProviderId): Promise<T | null>;
}
export type JobHandler = (job: OutboxJob, ctx: JobContext) => Promise<void>;

const handlers = new Map<string, JobHandler>();
export function registerJobHandler(kind: string, handler: JobHandler) { handlers.set(kind, handler); }
export function registerJobHandlers(map: Record<string, JobHandler>) { for (const [k, h] of Object.entries(map)) registerJobHandler(k, h); }
export const hasJobHandler = (kind: string) => handlers.has(kind);

let adapterHandlersLoaded = false;
async function ensureHandlers() {
  if (adapterHandlersLoaded) return;
  adapterHandlersLoaded = true;
  const fromPackages = await allJobHandlers();
  for (const [k, h] of Object.entries(fromPackages)) if (!handlers.has(k)) handlers.set(k, h);
}

export const backoffSeconds = (attempts: number) => Math.min(30 * 2 ** Math.max(0, attempts - 1), 3600);
const STUCK_AFTER_SEC = 300;

interface RawJob { id: string; kind: string; payload: string; attempts: number; max_attempts: number }

/** Atomically claim due jobs (single UPDATE ... RETURNING => no double processing). */
export async function claimJobs(d1: D1Database, limit: number, nowSec: number): Promise<RawJob[]> {
  const r = await d1.prepare(
    `UPDATE outbox_jobs SET status = 'running', attempts = attempts + 1, updated_at = ?1
     WHERE id IN (SELECT id FROM outbox_jobs
        WHERE (status = 'pending' AND next_run_at <= ?1) OR (status = 'running' AND updated_at <= ?1 - ?3)
        ORDER BY next_run_at LIMIT ?2)
     RETURNING id, kind, payload, attempts, max_attempts`).bind(nowSec, limit, STUCK_AFTER_SEC).all<RawJob>();
  return r.results ?? [];
}

export async function runOutbox(env: Env, opts: { limit?: number; now?: Date } = {}): Promise<{ claimed: number; done: number; failed: number; dead: number }> {
  await ensureHandlers();
  const now = opts.now ?? new Date();
  const t = Math.floor(now.getTime() / 1000);
  const db = drizzle(env.DB, { schema });
  const jobs = await claimJobs(env.DB, opts.limit ?? 10, t);
  const stats = { claimed: jobs.length, done: 0, failed: 0, dead: 0 };
  const ctx: JobContext = { env, db, now, log: (level, msg, meta) => logIntegrationEvent(db, "outbox", level, msg, meta), getAdapter: (p) => getAdapter(env, db, p).then((a) => (a?.adapter as never) ?? null) };
  for (const j of jobs) {
    const handler = handlers.get(j.kind);
    try {
      if (!handler) throw new Error(`No handler registered for job kind "${j.kind}"`);
      await handler({ id: j.id, kind: j.kind, payload: JSON.parse(j.payload), attempts: j.attempts, maxAttempts: j.max_attempts }, ctx);
      await env.DB.prepare(`UPDATE outbox_jobs SET status = 'done', last_error = NULL, updated_at = ?2 WHERE id = ?1`).bind(j.id, t).run();
      stats.done++;
    } catch (e) {
      const msg = (e instanceof Error ? e.message : String(e)).slice(0, 500);
      const dead = j.attempts >= j.max_attempts;
      await env.DB.prepare(`UPDATE outbox_jobs SET status = ?2, last_error = ?3, next_run_at = ?4, updated_at = ?5 WHERE id = ?1`)
        .bind(j.id, dead ? "dead" : "pending", msg, t + backoffSeconds(j.attempts), t).run();
      dead ? stats.dead++ : stats.failed++;
      const provider = j.kind.split(".")[0] ?? "outbox";
      log(dead ? "error" : "warn", "outbox job failed", { id: j.id, kind: j.kind, attempts: j.attempts, error: msg });
      await logIntegrationEvent(db, provider, dead ? "error" : "warn", `${dead ? "Job dead-lettered" : "Job failed"}: ${j.kind} — ${msg}`, { jobId: j.id, attempts: j.attempts }).catch(() => {});
    }
  }
  return stats;
}

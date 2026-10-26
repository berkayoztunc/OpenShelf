import type { MockHandler, MockState, TrendyolCallResult, TrendyolEnv, TrendyolOperation } from "@openshelf/shared";
import { TRENDYOL_MOCKS, buildRequest, type ConsoleCreds } from "@openshelf/integration-trendyol";

/** Prefix of every mock_state key the Trendyol simulation owns (reset deletes exactly these). */
export const MOCK_PREFIX = "ty:";

/** D1-backed key/value state for the offline Trendyol simulation (table mock_state, JSON values). */
export function d1MockState(d1: D1Database, now: () => number = Date.now): MockState {
  return {
    async get<T = unknown>(key: string) {
      const row = await d1.prepare("SELECT value FROM mock_state WHERE key = ?1").bind(key).first<{ value: string }>();
      if (!row) return undefined;
      try { return JSON.parse(row.value) as T; } catch { return undefined; }
    },
    async set(key: string, value: unknown) {
      await d1.prepare("INSERT INTO mock_state (key, value, updated_at) VALUES (?1, ?2, unixepoch()) ON CONFLICT(key) DO UPDATE SET value = ?2, updated_at = unixepoch()")
        .bind(key, JSON.stringify(value ?? null)).run();
    },
    /** Atomic: one UPSERT ... RETURNING statement, so concurrent callers never see the same id. */
    async nextId(namespace: string) {
      const row = await d1.prepare(
        "INSERT INTO mock_state (key, value, updated_at) VALUES (?1, '1', unixepoch()) ON CONFLICT(key) DO UPDATE SET value = CAST(value AS INTEGER) + 1, updated_at = unixepoch() RETURNING value",
      ).bind(`${MOCK_PREFIX}seq:${namespace}`).first<{ value: string | number }>();
      return Number(row?.value ?? 1);
    },
    now,
  };
}

export async function resetMockTrendyol(d1: D1Database): Promise<number> {
  const r = await d1.prepare("DELETE FROM mock_state WHERE key LIKE ?1").bind(`${MOCK_PREFIX}%`).run();
  return r.meta.changes ?? 0;
}

export interface RunMockInput { sellerId: string; env: TrendyolEnv; path: Record<string, string | number>; query: Record<string, unknown>; body?: unknown }
/**
 * Runs the offline handler for `op`. Same validation and URL shape as a live call (dummy credentials, never sent anywhere),
 * but nothing leaves the Worker: no fetch, no secrets.
 */
export async function runMock(d1: D1Database, op: TrendyolOperation, input: RunMockInput, handlers: Record<string, MockHandler> = TRENDYOL_MOCKS): Promise<TrendyolCallResult> {
  const dummy: ConsoleCreds = { sellerId: input.sellerId, apiKey: "mock", apiSecret: "mock" };
  const req = buildRequest(op, dummy, input.env, { path: input.path, query: input.query as never, body: input.body }); // throws ConsoleError like a live call
  const started = Date.now();
  const handler = handlers[op.id];
  let status = 200; let body: unknown = { mock: true, operationId: op.id }; let headers: Record<string, string> = {};
  try {
    if (handler) {
      const r = await handler({ op, sellerId: input.sellerId, env: input.env, path: input.path, query: input.query, body: req.echo.body }, d1MockState(d1));
      status = r.status; body = r.body; headers = r.headers ?? {};
    }
  } catch (e) {
    status = 500; body = { error: "mock_handler_error", message: e instanceof Error ? e.message.slice(0, 300) : "error" };
  }
  const ok = status >= 200 && status < 400;
  const msg = typeof (body as { message?: unknown })?.message === "string" ? (body as { message: string }).message : `HTTP ${status}`;
  return {
    ok, status, durationMs: Date.now() - started, mock: true, env: input.env, operationId: op.id, risk: op.risk,
    request: { ...req.echo, url: req.url },
    response: { headers: { "content-type": "application/json", ...headers }, body, contentType: "application/json" },
    ...(ok ? {} : { error: { message: msg, hint: "mock response" } }),
  };
}

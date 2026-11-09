import type { GeliverCallBody, GeliverCallResult, GeliverOperation } from "@openshelf/shared";
import { ALLOWED_HOSTS, BASE_URL } from "./endpoints";

export const MAX_BODY_BYTES = 1024 * 1024;
export const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
export const CALL_TIMEOUT_MS = 20_000;

export class GeliverConsoleError extends Error {
  constructor(public code: "invalid_params" | "body_too_large", message: string, public details?: unknown) { super(message); }
}
export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export interface BuiltGeliverRequest { method: string; url: string; query: Record<string, string>; body?: string }

/** Validates params against the operation and builds the request. Nothing outside the catalog can be requested. */
export function buildGeliverRequest(op: GeliverOperation, call: Pick<GeliverCallBody, "path" | "query" | "body">): BuiltGeliverRequest {
  let path = op.path;
  for (const p of op.params.filter((x) => x.in === "path")) {
    const v = call.path[p.name];
    if (v === undefined || String(v).trim() === "") throw new GeliverConsoleError("invalid_params", `Missing path parameter: ${p.name}`, [{ field: p.name, message: "required" }]);
    path = path.replace(`{${p.name}}`, encodeURIComponent(String(v)));
  }
  if (/\{[^}]+\}/.test(path)) throw new GeliverConsoleError("invalid_params", "Unresolved path parameter");
  const known = new Set(op.params.filter((x) => x.in === "query").map((x) => x.name));
  const query: Record<string, string> = {};
  for (const [k, v] of Object.entries(call.query)) {
    if (!known.has(k)) throw new GeliverConsoleError("invalid_params", `Unknown query parameter: ${k}`, [{ field: k, message: "not part of this operation" }]);
    if (v === "" || v === undefined) continue;
    query[k] = String(v);
  }
  for (const p of op.params.filter((x) => x.in === "query" && x.required)) {
    if (query[p.name] === undefined) throw new GeliverConsoleError("invalid_params", `Missing query parameter: ${p.name}`, [{ field: p.name, message: "required" }]);
  }
  let body: string | undefined;
  if (op.body.kind === "json" && call.body !== undefined) {
    body = typeof call.body === "string" ? call.body : JSON.stringify(call.body);
    if (new TextEncoder().encode(body).length > MAX_BODY_BYTES) throw new GeliverConsoleError("body_too_large", "Request body is too large");
    if (typeof call.body === "string") { try { JSON.parse(body); } catch { throw new GeliverConsoleError("invalid_params", "Body is not valid JSON"); } }
  }
  const qs = new URLSearchParams(query).toString();
  return { method: op.method, url: BASE_URL + path + (qs ? `?${qs}` : ""), query, body };
}

/** Executes one catalog operation. The token only ever goes into the Authorization header and never into the result. */
export async function runGeliverCall(deps: { fetch: FetchLike }, token: string, op: GeliverOperation, call: Pick<GeliverCallBody, "path" | "query" | "body">): Promise<GeliverCallResult> {
  const req = buildGeliverRequest(op, call);
  if (!ALLOWED_HOSTS.includes(new URL(req.url).hostname)) throw new GeliverConsoleError("invalid_params", "host not allowlisted");
  const started = Date.now();
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), CALL_TIMEOUT_MS);
  const base = { mock: false, operationId: op.id, risk: op.risk, request: { method: req.method, url: req.url, query: req.query, ...(req.body !== undefined ? { body: JSON.parse(req.body) } : {}) } };
  try {
    const res = await deps.fetch(req.url, {
      method: req.method, signal: ctl.signal,
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json", ...(req.body !== undefined ? { "Content-Type": "application/json" } : {}) },
      ...(req.body !== undefined ? { body: req.body } : {}),
    });
    let text = await res.text(); let truncated = false;
    if (text.length > MAX_RESPONSE_BYTES) { text = text.slice(0, MAX_RESPONSE_BYTES); truncated = true; }
    let parsed: unknown = text;
    try { parsed = text ? JSON.parse(text) : null; } catch { /* keep text */ }
    const env = parsed as { result?: boolean; message?: string; additionalMessage?: string; code?: string } | null;
    const ok = res.ok && env?.result !== false;
    return { ...base, ok, status: res.status, durationMs: Date.now() - started, response: { body: parsed, ...(truncated ? { truncated } : {}) },
      ...(ok ? {} : { error: { message: env?.additionalMessage ?? env?.message ?? `HTTP ${res.status}`, ...(env?.code ? { code: env.code } : {}) } }) };
  } catch (e) {
    const aborted = e instanceof Error && e.name === "AbortError";
    return { ...base, ok: false, status: 0, durationMs: Date.now() - started, response: { body: null }, error: { message: aborted ? "Timed out" : e instanceof Error ? e.message : "Network error" } };
  } finally { clearTimeout(timer); }
}

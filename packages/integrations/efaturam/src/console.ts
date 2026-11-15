import type { EfaturamCallBody, EfaturamCallResult, EfaturamOperation } from "@openshelf/shared";
import { ALLOWED_HOSTS, bearer } from "./endpoints";

export const MAX_BODY_BYTES = 1024 * 1024;
export const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
export const CALL_TIMEOUT_MS = 20_000;

export class EfaturamConsoleError extends Error {
  constructor(public code: "invalid_params" | "body_too_large", message: string, public details?: unknown) { super(message); }
}
export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;
export type ConsoleCall = Pick<EfaturamCallBody, "path" | "query" | "body">;
export interface AccountIds { companyId: number; userId: number }

export interface BuiltEfaturamRequest { method: string; url: string; query: Record<string, string>; body?: string }

/**
 * Validates params against the operation and builds the request. Nothing outside the catalog can be requested.
 * `ids` fills the operation's `autofill` fields the caller left out; without `ids` (validation before sign-in) they stay empty.
 */
export function buildEfaturamRequest(op: EfaturamOperation, call: ConsoleCall, baseUrl: string, ids?: AccountIds): BuiltEfaturamRequest {
  const auto = new Set<string>(op.autofill ?? []);
  let path = op.path;
  for (const p of op.params.filter((x) => x.in === "path")) {
    let v: string | number | undefined = call.path[p.name];
    if ((v === undefined || String(v).trim() === "") && auto.has(p.name)) v = ids ? ids[p.name as keyof AccountIds] : 0;
    if (v === undefined || String(v).trim() === "") throw new EfaturamConsoleError("invalid_params", `Missing path parameter: ${p.name}`, [{ field: p.name, message: "required" }]);
    path = path.replace(`{${p.name}}`, encodeURIComponent(String(v).trim()));
  }
  if (/\{[^}]+\}/.test(path)) throw new EfaturamConsoleError("invalid_params", "Unresolved path parameter");
  const known = new Set(op.params.filter((x) => x.in === "query").map((x) => x.name));
  const query: Record<string, string> = {};
  for (const [k, v] of Object.entries(call.query)) {
    if (!known.has(k)) throw new EfaturamConsoleError("invalid_params", `Unknown query parameter: ${k}`, [{ field: k, message: "not part of this operation" }]);
    if (v === "" || v === undefined) continue;
    query[k] = String(v);
  }
  let body: string | undefined;
  if (op.body.kind === "json") {
    let parsed: unknown = call.body;
    if (typeof parsed === "string") { try { parsed = JSON.parse(parsed); } catch { throw new EfaturamConsoleError("invalid_params", "Body is not valid JSON"); } }
    if (parsed === undefined || parsed === null) parsed = {};
    if (typeof parsed !== "object" || Array.isArray(parsed)) throw new EfaturamConsoleError("invalid_params", "Body must be a JSON object");
    const obj = { ...(parsed as Record<string, unknown>) };
    if (ids) for (const k of auto) if (!op.params.some((p) => p.name === k) && (obj[k] === undefined || obj[k] === null || obj[k] === "")) obj[k] = ids[k as keyof AccountIds];
    body = JSON.stringify(obj);
    if (new TextEncoder().encode(body).length > MAX_BODY_BYTES) throw new EfaturamConsoleError("body_too_large", "Request body is too large");
  }
  const qs = new URLSearchParams(query).toString();
  return { method: op.method, url: baseUrl.replace(/\/+$/, "") + path + (qs ? `?${qs}` : ""), query, body };
}

const describe = (req: BuiltEfaturamRequest) => ({ method: req.method, url: req.url, query: req.query, ...(req.body !== undefined ? { body: JSON.parse(req.body) } : {}) });

/** A result for a call that never left because signing in failed. */
export function signInFailure(op: EfaturamOperation, req: BuiltEfaturamRequest, status: number | undefined, message: string): EfaturamCallResult {
  return { ok: false, status: status ?? 0, durationMs: 0, mock: false, operationId: op.id, risk: op.risk, request: describe(req), response: { body: null }, error: { message, code: "sign_in_failed" } };
}

/** Executes one built request. The token only ever goes into the request header and never into the result. */
export async function runEfaturamCall(deps: { fetch: FetchLike }, token: string, op: EfaturamOperation, req: BuiltEfaturamRequest): Promise<EfaturamCallResult> {
  if (!ALLOWED_HOSTS.includes(new URL(req.url).hostname)) throw new EfaturamConsoleError("invalid_params", "host not allowlisted");
  const started = Date.now();
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), CALL_TIMEOUT_MS);
  const base = { mock: false, operationId: op.id, risk: op.risk, request: describe(req) };
  try {
    const res = await deps.fetch(req.url, {
      method: req.method, signal: ctl.signal,
      headers: { ...bearer(token), Accept: "application/json, text/plain", ...(req.body !== undefined ? { "Content-Type": "application/json" } : {}) },
      ...(req.body !== undefined ? { body: req.body } : {}),
    });
    let text = await res.text(); let truncated = false;
    if (text.length > MAX_RESPONSE_BYTES) { text = text.slice(0, MAX_RESPONSE_BYTES); truncated = true; }
    let parsed: unknown = text; let json = false;
    try { parsed = text ? JSON.parse(text) : null; json = true; } catch { /* keep text (download links are plain text) */ }
    const problem = json && parsed && typeof parsed === "object" ? (parsed as { title?: string; detail?: string; message?: string; type?: string }) : undefined;
    // A 403 that is not the gateway's JSON is a firewall page: the request never reached e-Faturam.
    const blocked = res.status === 403 && !problem;
    if (blocked) parsed = null;
    return { ...base, ok: res.ok, status: res.status, durationMs: Date.now() - started, response: { body: parsed, ...(truncated ? { truncated } : {}) },
      ...(res.ok ? {} : { error: { message: blocked ? "Blocked before reaching the gateway (IP not allowed)" : problem?.title ?? problem?.detail ?? problem?.message ?? `HTTP ${res.status}`, ...(blocked ? { code: "blocked" } : problem?.type ? { code: problem.type.split("/").pop()! } : {}) } }) };
  } catch (e) {
    const aborted = e instanceof Error && e.name === "AbortError";
    return { ...base, ok: false, status: 0, durationMs: Date.now() - started, response: { body: null }, error: { message: aborted ? "Timed out" : e instanceof Error ? e.message : "Network error" } };
  } finally { clearTimeout(timer); }
}

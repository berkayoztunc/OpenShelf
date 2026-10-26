import { TRENDYOL_HOSTS, type TrendyolCallBody, type TrendyolCallResult, type TrendyolEnv, type TrendyolOperation } from "@openshelf/shared";

/** Hard limits shared with the Worker route and the admin UI. */
export const MAX_BODY_BYTES = 2 * 1024 * 1024;
export const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
export const CALL_TIMEOUT_MS = 20_000;

const SAFE_PARAM = /^[A-Za-z0-9._~-]+$/;
const SAFE_QUERY_NAME = /^[A-Za-z0-9._-]{1,64}$/;
const SAFE_HEADER_VALUE = /^[\x20-\x7e]{1,200}$/;
const FORBIDDEN_HEADERS = new Set(["authorization", "user-agent", "host", "content-length", "content-type", "cookie", "connection", "transfer-encoding"]);

export type ConsoleErrorCode = "invalid_params" | "body_too_large" | "env_unavailable";
export class ConsoleError extends Error {
  constructor(public code: ConsoleErrorCode, message: string, public details: { field: string; message: string }[] = []) { super(message); }
}

export interface ConsoleCreds { sellerId: string; apiKey: string; apiSecret: string }
export interface BuiltRequest {
  url: string; method: string; headers: Record<string, string>; body?: string | FormData;
  /** what may be shown to the admin / stored: no credentials, no file bytes */
  echo: TrendyolCallResult["request"];
}

export const opAvailableOn = (op: TrendyolOperation, env: TrendyolEnv) => (op.envs ?? ["production", "stage"]).includes(env);
export const userAgentFor = (sellerId: string) => `${sellerId} - SelfIntegration`;
export const basicAuth = (apiKey: string, apiSecret: string) => `Basic ${btoa(`${apiKey}:${apiSecret}`)}`;

type Detail = { field: string; message: string };
const scalar = (v: unknown): v is string | number | boolean => typeof v === "string" || typeof v === "number" || typeof v === "boolean";

function serializeQuery(op: TrendyolOperation, sellerId: string, input: TrendyolCallBody["query"], details: Detail[]): { pairs: [string, string][]; headers: Record<string, string> } {
  const pairs: [string, string][] = [];
  const headers: Record<string, string> = {};
  const known = new Set<string>();
  for (const p of op.params) {
    if (p.in === "path") continue;
    known.add(p.name);
    let raw: unknown = input[p.name];
    if (raw === undefined || raw === "" || (Array.isArray(raw) && raw.length === 0)) raw = p.default;
    if (raw === undefined && p.in === "header" && p.name.toLowerCase() === "sellerid") raw = sellerId; // stage test-order APIs expect the seller id header
    if (raw === undefined) {
      if (p.required) details.push({ field: `${p.in}.${p.name}`, message: "required" });
      continue;
    }
    const items = Array.isArray(raw) ? raw : [raw];
    if (Array.isArray(raw) && p.type !== "array") { details.push({ field: `${p.in}.${p.name}`, message: "must not be an array" }); continue; }
    let bad = false;
    for (const it of items) {
      if (!scalar(it)) { bad = true; break; }
      const s = String(it);
      if ((p.type === "integer" || p.type === "timestamp_ms") && !/^-?\d+$/.test(s)) { details.push({ field: `${p.in}.${p.name}`, message: "must be an integer" }); bad = true; break; }
      if (p.type === "number" && !Number.isFinite(Number(s))) { details.push({ field: `${p.in}.${p.name}`, message: "must be a number" }); bad = true; break; }
      if (p.type === "boolean" && s !== "true" && s !== "false") { details.push({ field: `${p.in}.${p.name}`, message: "must be true or false" }); bad = true; break; }
      if (p.enum && !p.enum.includes(s)) { details.push({ field: `${p.in}.${p.name}`, message: `must be one of ${p.enum.join(", ")}` }); bad = true; break; }
    }
    if (bad) { if (!details.some((d) => d.field === `${p.in}.${p.name}`)) details.push({ field: `${p.in}.${p.name}`, message: "invalid value" }); continue; }
    const strs = items.map(String);
    if (p.in === "header") {
      const v = strs.join(",");
      if (FORBIDDEN_HEADERS.has(p.name.toLowerCase()) || !SAFE_QUERY_NAME.test(p.name) || !SAFE_HEADER_VALUE.test(v)) details.push({ field: `header.${p.name}`, message: "not allowed" });
      else headers[p.name] = v;
    } else if (p.type === "array" && p.arrayStyle === "repeat") for (const s of strs) pairs.push([p.name, s]);
    else pairs.push([p.name, strs.join(",")]);
  }
  // unknown keys: pass through scalars/arrays with a safe name (catalog may lag behind Trendyol), never anything exotic
  for (const [k, v] of Object.entries(input)) {
    if (known.has(k)) continue;
    if (!SAFE_QUERY_NAME.test(k)) { details.push({ field: `query.${k}`, message: "invalid parameter name" }); continue; }
    const arr = Array.isArray(v) ? v : [v];
    if (!arr.every(scalar)) { details.push({ field: `query.${k}`, message: "invalid value" }); continue; }
    if (v === "" ) continue;
    pairs.push([k, arr.map(String).join(",")]);
  }
  return { pairs, headers };
}

function fillPath(op: TrendyolOperation, sellerId: string, input: TrendyolCallBody["path"], details: Detail[]): string {
  if (!op.path.startsWith("/") || /[?#\s]/.test(op.path) || op.path.includes("//")) throw new Error(`catalog path invalid for ${op.id}`);
  return op.path.replace(/\{([A-Za-z0-9_]+)\}/g, (_m, name: string) => {
    const v = name === "sellerId" ? sellerId : input[name];
    const s = v === undefined ? "" : String(v);
    if (!s) { details.push({ field: `path.${name}`, message: "required" }); return ""; }
    if (!SAFE_PARAM.test(s) || s === "." || s === ".." || s.length > 128) { details.push({ field: `path.${name}`, message: "only letters, digits and . _ ~ - are allowed" }); return ""; }
    return encodeURIComponent(s);
  });
}

const byteLen = (s: string) => new TextEncoder().encode(s).length;

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64.replace(/^data:[^,]*,/, "").replace(/\s+/g, ""));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function buildBody(op: TrendyolOperation, input: unknown, details: Detail[]): { raw?: string | FormData; echo?: unknown; contentType?: string } {
  const kind = op.body.kind;
  if (kind === "none") return {};
  if (input === undefined || input === null || input === "") { details.push({ field: "body", message: "required" }); return {}; }
  if (kind === "json") {
    let value = input;
    if (typeof input === "string") {
      try { value = JSON.parse(input); } catch { details.push({ field: "body", message: "invalid JSON" }); return {}; }
    }
    const text = JSON.stringify(value);
    if (text === undefined) { details.push({ field: "body", message: "invalid JSON" }); return {}; }
    if (byteLen(text) > MAX_BODY_BYTES) throw new ConsoleError("body_too_large", `Body exceeds ${MAX_BODY_BYTES} bytes`);
    return { raw: text, echo: value, contentType: "application/json" };
  }
  // multipart: { file: { name, type, base64 }, ...fields }
  if (typeof input !== "object" || Array.isArray(input)) { details.push({ field: "body", message: "must be an object" }); return {}; }
  const { file, ...fields } = input as { file?: { name?: unknown; type?: unknown; base64?: unknown } } & Record<string, unknown>;
  const spec = op.body.file;
  if (!file || typeof file !== "object" || typeof file.base64 !== "string" || typeof file.name !== "string" || typeof file.type !== "string") {
    details.push({ field: "body.file", message: "file {name, type, base64} required" }); return {};
  }
  if (spec && spec.accept.length && !spec.accept.includes(file.type)) { details.push({ field: "body.file.type", message: `must be one of ${spec.accept.join(", ")}` }); return {}; }
  // base64 length bounds the decoded size before we allocate it
  if (Math.floor((file.base64.length * 3) / 4) > MAX_BODY_BYTES + 8) throw new ConsoleError("body_too_large", `File exceeds ${MAX_BODY_BYTES} bytes`);
  let bytes: Uint8Array;
  try { bytes = b64ToBytes(file.base64); } catch { details.push({ field: "body.file.base64", message: "invalid base64" }); return {}; }
  if (bytes.length > MAX_BODY_BYTES) throw new ConsoleError("body_too_large", `File exceeds ${MAX_BODY_BYTES} bytes`);
  const fname = file.name.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 100) || "file";
  const form = new FormData();
  const echoFields: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (!SAFE_QUERY_NAME.test(k) || v === undefined || v === null) continue;
    form.append(k, typeof v === "string" ? v : JSON.stringify(v));
    echoFields[k] = v;
  }
  form.append(spec?.field ?? "file", new Blob([bytes as BlobPart], { type: file.type }), fname);
  return { raw: form, echo: { ...echoFields, file: { name: fname, type: file.type, size: bytes.length } } };
}

/** Builds the outgoing request from a catalog operation. The URL only ever comes from TRENDYOL_HOSTS + the catalog path. */
export function buildRequest(op: TrendyolOperation, creds: ConsoleCreds, env: TrendyolEnv, call: Pick<TrendyolCallBody, "path" | "query" | "body">): BuiltRequest {
  if (!opAvailableOn(op, env)) throw new ConsoleError("env_unavailable", `${op.id} is not available on ${env}`);
  const host = TRENDYOL_HOSTS[env];
  if (!host) throw new ConsoleError("env_unavailable", `Unknown environment ${String(env)}`);
  const details: Detail[] = [];
  if (!SAFE_PARAM.test(creds.sellerId)) details.push({ field: "sellerId", message: "invalid seller id" });
  const path = fillPath(op, creds.sellerId, call.path ?? {}, details);
  const q = serializeQuery(op, creds.sellerId, call.query ?? {}, details);
  const b = buildBody(op, call.body, details);
  if (details.length) throw new ConsoleError("invalid_params", "Invalid parameters", details);

  const qs = q.pairs.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v).replace(/%2C/g, ",")}`).join("&");
  const url = `${host}${path}${qs ? `?${qs}` : ""}`;
  const parsed = new URL(url);
  if (parsed.origin !== host || parsed.username || parsed.password) throw new Error("trendyol console: URL escaped the allowlisted host"); // belt and braces
  const headers: Record<string, string> = {
    ...q.headers,
    Authorization: basicAuth(creds.apiKey, creds.apiSecret),
    "User-Agent": userAgentFor(creds.sellerId),
    Accept: "application/json",
  };
  if (b.contentType) headers["Content-Type"] = b.contentType;
  const query: Record<string, unknown> = {};
  for (const [k, v] of q.pairs) query[k] = k in query ? [...[query[k]].flat(), v] : v;
  return { url, method: op.method, headers, body: b.raw, echo: { method: op.method, url, query, ...(b.echo !== undefined ? { body: b.echo } : {}) } };
}

const SAFE_RESPONSE_HEADERS = /^(content-type|retry-after|x-ratelimit.*|x-request-id)$/i;
export interface ExecResponse { status: number; headers: Record<string, string>; body: unknown; truncated?: boolean; contentType?: string; durationMs: number; networkError?: "timeout" | "network" }

async function readCapped(res: Response, cap: number): Promise<{ text: string; truncated: boolean }> {
  if (!res.body) return { text: await res.text(), truncated: false };
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let text = ""; let size = 0; let truncated = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > cap) {
      const keep = value.byteLength - (size - cap);
      text += dec.decode(value.subarray(0, Math.max(0, keep)));
      truncated = true;
      await reader.cancel().catch(() => {});
      break;
    }
    text += dec.decode(value, { stream: true });
  }
  return { text, truncated };
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** Sends the request (20 s timeout), never throws for transport problems: they come back as status 0 + networkError. */
export async function execute(fetchFn: FetchLike, req: BuiltRequest, opts: { timeoutMs?: number; now?: () => number } = {}): Promise<ExecResponse> {
  const now = opts.now ?? Date.now;
  const started = now();
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), opts.timeoutMs ?? CALL_TIMEOUT_MS);
  try {
    const res = await fetchFn(req.url, { method: req.method, headers: req.headers, body: req.body, signal: ac.signal, redirect: "manual" });
    const { text, truncated } = await readCapped(res, MAX_RESPONSE_BYTES);
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => { if (SAFE_RESPONSE_HEADERS.test(k)) headers[k.toLowerCase()] = v; });
    const contentType = res.headers.get("content-type") ?? undefined;
    let body: unknown = text;
    if (!truncated && text) { try { body = JSON.parse(text); } catch { /* plain text */ } }
    else if (!text) body = null;
    return { status: res.status, headers, body, ...(truncated ? { truncated: true } : {}), ...(contentType ? { contentType } : {}), durationMs: now() - started };
  } catch (e) {
    const timeout = ac.signal.aborted || (e instanceof Error && e.name === "AbortError");
    return { status: 0, headers: {}, body: null, durationMs: now() - started, networkError: timeout ? "timeout" : "network" };
  } finally { clearTimeout(timer); }
}

/** Maps the Trendyol error shapes to {code,message,hint}. Returns undefined for 2xx/3xx. */
export function mapError(r: Pick<ExecResponse, "status" | "headers" | "body" | "networkError">, env: TrendyolEnv): TrendyolCallResult["error"] | undefined {
  if (r.networkError === "timeout") return { code: "timeout", message: `No answer from Trendyol within ${CALL_TIMEOUT_MS / 1000}s`, hint: "temporary network problem or Trendyol slow; retry. If it persists from a foreign host, contact Trendyol partner support" };
  if (r.networkError) return { code: "network_error", message: "Could not reach Trendyol", hint: "network problem; retry later" };
  if (r.status < 400) return undefined;
  const b = (r.body && typeof r.body === "object" ? r.body : {}) as Record<string, unknown>;
  let code = typeof b.exception === "string" ? b.exception : typeof b.code === "string" ? b.code : typeof b.error === "string" ? b.error : undefined;
  let message = typeof b.message === "string" ? b.message : typeof r.body === "string" && r.body ? r.body.slice(0, 300) : "";
  if (Array.isArray(b.errors) && b.errors.length) {
    const parts = b.errors.slice(0, 20).map((e) => {
      if (typeof e === "string") return e;
      const o = (e ?? {}) as Record<string, unknown>;
      return [o.key, o.message ?? o.errorMessage, o.errorCode ? `(${String(o.errorCode)})` : ""].filter(Boolean).join(" ");
    });
    message = parts.join("; ");
    code ??= "validation_errors";
  }
  let hint: string | undefined;
  const retry = r.headers["retry-after"];
  if (r.status === 401) { code ??= "ClientApiAuthenticationException"; hint = "check apiKey/apiSecret and environment (prod and stage credentials differ)"; }
  else if (r.status === 403) hint = "User-Agent missing or IP blocked";
  else if (r.status === 503 && env === "stage") hint = "stage IP not whitelisted by Trendyol";
  else if (r.status === 429) { code ??= "too.many.requests"; hint = `rate limit hit (50 requests per 10 s per endpoint); wait ${retry ? `${retry} s (Retry-After)` : "10 s"} before retrying`; }
  else if (r.status === 404) hint = "path or id not found: check operation parameters and that the operation exists on this environment";
  else if (r.status >= 500) hint = "temporary Trendyol error; retry in a few minutes";
  return { ...(code ? { code } : {}), message: message || `HTTP ${r.status}`, ...(hint ? { hint } : {}) };
}

export interface RunDeps { fetch: FetchLike; now?: () => number }

/** Full live call: build -> execute -> result. Credentials are only used to build headers and never end up in the result. */
export async function runCall(deps: RunDeps, creds: ConsoleCreds, env: TrendyolEnv, op: TrendyolOperation, call: Pick<TrendyolCallBody, "path" | "query" | "body">): Promise<TrendyolCallResult> {
  const req = buildRequest(op, creds, env, call);
  const r = await execute(deps.fetch, req, { now: deps.now });
  const error = mapError(r, env);
  return {
    ok: r.status >= 200 && r.status < 400, status: r.status, durationMs: r.durationMs, mock: false, env, operationId: op.id, risk: op.risk,
    request: req.echo,
    response: { headers: r.headers, body: r.body, ...(r.truncated ? { truncated: true } : {}), ...(r.contentType ? { contentType: r.contentType } : {}) },
    ...(error ? { error } : {}),
  };
}

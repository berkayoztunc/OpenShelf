/**
 * Thin typed API client. Cookie session (credentials: include) + CSRF header on mutations.
 * The CSRF token is held in memory only (never localStorage). Secrets are never logged.
 */
import { getLocale, hasKey, plural, tNow } from "../i18n";

export class ApiError extends Error {
  /** `retryAfter` = seconds from the Retry-After header (429 responses). */
  constructor(public status: number, public code: string, message: string, public details?: unknown, public retryAfter?: number) {
    super(message);
    this.name = "ApiError";
  }
}

export interface ApiClientOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  onUnauthorized?: () => void;
}

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function createApiClient(opts: ApiClientOptions = {}) {
  const base = opts.baseUrl ?? "";
  let csrfToken: string | null = null;
  let csrfInflight: Promise<string | null> | null = null;
  const doFetch: typeof fetch = (...a) => (opts.fetchImpl ?? fetch)(...a);

  async function parse(res: Response): Promise<unknown> {
    if (res.status === 204) return undefined;
    const ct = res.headers.get("content-type") ?? "";
    if (ct.includes("application/json")) return res.json().catch(() => undefined);
    return res.text();
  }

  function toError(res: Response, body: unknown): ApiError {
    const e = (body as { error?: { code?: string; message?: string; details?: unknown } } | undefined)?.error;
    const ra = Number(res.headers.get("retry-after"));
    return new ApiError(res.status, e?.code ?? "http_error", e?.message ?? `Request failed (${res.status})`, e?.details, Number.isFinite(ra) && ra > 0 ? ra : undefined);
  }

  /** Fetch (or refresh) CSRF token from /auth/me. Returns null when unauthenticated. */
  async function refreshCsrf(): Promise<string | null> {
    csrfInflight ??= (async () => {
      try {
        const res = await doFetch(`${base}/api/admin/auth/me`, { credentials: "include", headers: { Accept: "application/json" } });
        if (!res.ok) { csrfToken = null; return null; }
        const body = (await res.json()) as { csrfToken?: string };
        csrfToken = body.csrfToken ?? null;
        return csrfToken;
      } finally { csrfInflight = null; }
    })();
    return csrfInflight;
  }

  async function request<T>(method: string, path: string, body?: unknown, retried = false): Promise<T> {
    const headers: Record<string, string> = { Accept: "application/json" };
    let payload: BodyInit | undefined;
    if (body instanceof FormData) payload = body;
    else if (body !== undefined) { headers["Content-Type"] = "application/json"; payload = JSON.stringify(body); }
    if (MUTATING.has(method)) {
      const t = csrfToken ?? (await refreshCsrf());
      if (t) headers["X-CSRF-Token"] = t;
    }
    const res = await doFetch(`${base}${path}`, { method, headers, body: payload, credentials: "include" });
    const data = await parse(res);
    if (res.ok) return data as T;
    if (res.status === 401) {
      csrfToken = null;
      // Bad credentials / setup errors stay on their form; everything else means the session is gone.
      if (!/\/api\/admin\/(auth\/login|setup)/.test(path)) opts.onUnauthorized?.();
    }
    if (res.status === 403 && MUTATING.has(method) && !retried && !/csrf/i.test(path)) {
      const old = csrfToken;
      csrfToken = null;
      const fresh = await refreshCsrf();
      if (fresh && fresh !== old) return request<T>(method, path, body, true);
    }
    throw toError(res, data);
  }

  return {
    get: <T>(path: string) => request<T>("GET", path),
    post: <T>(path: string, body?: unknown) => request<T>("POST", path, body ?? {}),
    put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body ?? {}),
    patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body ?? {}),
    del: <T>(path: string) => request<T>("DELETE", path),
    upload: <T>(path: string, form: FormData) => request<T>("POST", path, form),
    setCsrf(t: string | null) { csrfToken = t; },
    getCsrf: () => csrfToken,
    refreshCsrf,
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

/** App singleton; the router wires onUnauthorized (redirect to /login). */
let unauthorizedHandler: () => void = () => {};
export const setUnauthorizedHandler = (fn: () => void) => { unauthorizedHandler = fn; };
export const api = createApiClient({ onUnauthorized: () => unauthorizedHandler() });

/** Translate one zod-style validation detail (`{ path, message, code }`) into friendly text in the active language. */
function detailText(d: { path?: string; message?: string; code?: string }): string {
  const m = d.message ?? ""; const c = d.code ?? "";
  const n = (re: RegExp) => re.exec(m)?.[1];
  let key: string | null = null; let vars: Record<string, string> | undefined;
  if (/^required$/i.test(m) || /received undefined/i.test(m)) key = "error.v.required";
  else if (c === "invalid_type") { const t = n(/Expected (\w+)/); key = t === "number" ? "error.v.number" : t === "string" ? "error.v.text" : "error.v.invalid"; }
  else if (c === "too_small" || /at least|greater than/i.test(m)) {
    const chars = n(/at least (\d+) character/i); const num = n(/(?:greater than(?: or equal to)?|at least) (-?\d+(?:\.\d+)?)/i);
    if (chars) { key = chars === "1" ? "error.v.empty" : "error.v.tooShort"; vars = { n: chars }; } else if (num) { key = "error.v.min"; vars = { n: num }; }
  } else if (c === "too_big" || /at most|less than/i.test(m)) {
    const chars = n(/at most (\d+) character/i); const num = n(/(?:less than(?: or equal to)?|at most) (-?\d+(?:\.\d+)?)/i);
    if (chars) { key = "error.v.tooLong"; vars = { n: chars }; } else if (num) { key = "error.v.max"; vars = { n: num }; }
  } else if (/invalid email/i.test(m)) key = "error.v.email";
  else if (/invalid url/i.test(m)) key = "error.v.url";
  else if (c === "invalid_enum_value" || /invalid enum value/i.test(m)) key = "error.v.enum";
  else if (c === "unrecognized_keys") key = "error.v.unknownField";
  else if (c === "invalid_string" || /^invalid$/i.test(m)) key = "error.v.regex";
  return key ? tNow(key, vars) : m || tNow("error.v.invalid");
}
const fieldLabel = (path?: string) => {
  const leaf = [...(path ?? "").split(".")].reverse().find((s) => s && !/^\d+$/.test(s));
  if (!leaf) return "";
  return hasKey(`error.field.${leaf}`) ? tNow(`error.field.${leaf}`) : leaf;
};
/** Friendly one-line-per-field list for a `validation_error` response (empty when the error carries no details). */
export function errDetailList(e: unknown): string[] {
  const det = e instanceof ApiError && Array.isArray(e.details) ? (e.details as { path?: string; message?: string; code?: string }[]) : [];
  return det.filter((d) => d && typeof d === "object").map((d) => { const f = fieldLabel(d.path); const t = detailText(d); return f ? `${f} (${t})` : t; });
}

function retryHint(e: ApiError): string {
  const s = e.retryAfter;
  if (!s) return tNow("error.retryLater");
  return s < 90 ? tNow("error.retryInSeconds", { n: Math.max(1, Math.round(s)) }) : plural(getLocale(), "error.retryIn", Math.ceil(s / 60));
}

/**
 * Human text for an API error in the active language, chosen by `error.code` (keys `error.<code>`).
 * Unknown codes fall back to the server message. Never shows a raw code.
 */
export function errMsg(e: unknown): string {
  if (e instanceof ApiError) {
    const msg = e.message; const code = e.code;
    if (code === "unauthorized") return tNow(/invalid credentials/i.test(msg) ? "error.loginFailed" : /session expired/i.test(msg) ? "error.sessionExpired" : "error.unauthorized");
    if (code === "forbidden") {
      if (/csrf/i.test(msg)) return tNow("error.csrf");
      if (/origin/i.test(msg)) return tNow("error.origin");
      if (/demote|disable yourself/i.test(msg)) return tNow("error.forbidden_self_demote");
      if (/delete yourself/i.test(msg)) return tNow("error.forbidden_self_delete");
      if (/insufficient role/i.test(msg)) return tNow("error.insufficient_role");
      return tNow("error.forbidden");
    }
    if (code === "csrf") return tNow("error.csrf");
    if (code === "not_found") {
      const what = /^(.+) not found$/.exec(msg)?.[1]; const k = what ? `error.entity.${what.toLowerCase().replace(/[^a-z0-9]/g, "")}` : "";
      return k && hasKey(k) ? tNow("error.not_found", { what: tNow(k) }) : tNow("error.not_found_plain");
    }
    if (code === "validation_error") {
      const list = errDetailList(e);
      return list.length ? tNow("error.validation_list", { list: list.slice(0, 5).join("; ") + (list.length > 5 ? "…" : "") }) : tNow("error.validation_error");
    }
    if (code === "http_error") return tNow("error.http", { status: e.status });
    if (hasKey(`error.${code}`)) {
      const base = tNow(`error.${code}`);
      return e.status === 429 ? `${base} ${retryHint(e)}` : base;
    }
    if (e.status === 429) return `${tNow("error.rate_limited")} ${retryHint(e)}`;
    return msg || tNow("error.generic");
  }
  if (e instanceof TypeError) return tNow("error.network");
  return e instanceof Error && e.message ? e.message : tNow("error.generic");
}

export function qs(params: Record<string, string | number | undefined | null>): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") u.set(k, String(v));
  const s = u.toString();
  return s ? `?${s}` : "";
}

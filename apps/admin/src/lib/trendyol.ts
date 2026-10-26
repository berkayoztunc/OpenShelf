/**
 * Trendyol API console: typed client, shared hooks (`useTrendyolCatalog`, `useTrendyolCall`) and pure helpers
 * (request building, curl, JSON utilities, timestamps, saved params, history).
 * Contract: docs/api-contract.md "Trendyol API console" and packages/shared/src/trendyol.ts.
 */
import { createElement, useCallback, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  OpParam, Risk, Text, TrendyolCallBody, TrendyolCallResult, TrendyolCatalogResponse, TrendyolEnv, TrendyolOperation,
} from "@openshelf/shared";
import { ApiError, api, errMsg, qs } from "./api";
import { tNow, useT } from "../i18n";
import type { Locale } from "../i18n";
import { useToast } from "../components/ui";
import { TrendyolConfirmDialog } from "../components/trendyol/ConfirmCall";

export type { OpParam, Risk, Text, TrendyolCallBody, TrendyolCallResult, TrendyolCatalogResponse, TrendyolEnv, TrendyolOperation };

/** Local copy of the two allowlisted hosts (the shared constant is a runtime value; the admin only imports types). */
export const TRENDYOL_HOSTS: Record<TrendyolEnv, string> = { production: "https://apigw.trendyol.com", stage: "https://stageapigw.trendyol.com" };

/** Display order of the task areas (mirrors TRENDYOL_AREAS in the shared package). */
export const AREA_ORDER = ["catalog", "products", "orders", "returns", "questions", "finance", "tools"] as const;

/* ---------------------------------------------------------------- catalog */

export const CATALOG_KEY = ["trendyol", "catalog"] as const;

export interface TrendyolCatalog {
  isPending: boolean;
  error: unknown;
  refetch: () => void;
  mode: TrendyolCatalogResponse["mode"] | undefined;
  reason: TrendyolCatalogResponse["reason"];
  env: TrendyolEnv;
  sellerId?: string;
  operations: TrendyolOperation[];
  byId: Map<string, TrendyolOperation>;
  limits: TrendyolCatalogResponse["limits"];
  /** true when calls can be sent (mock or live) */
  canSend: boolean;
}

const DEFAULT_LIMITS = { maxBodyBytes: 2 * 1024 * 1024, maxResponseBytes: 2 * 1024 * 1024 };

/** Catalog + mode, loaded once (react-query cache is shared by the explorer and every view). */
export function useTrendyolCatalog(): TrendyolCatalog {
  const q = useQuery({
    queryKey: CATALOG_KEY, staleTime: 5 * 60_000,
    queryFn: () => api.get<TrendyolCatalogResponse>("/api/admin/trendyol/catalog"),
  });
  const data = q.data;
  const operations = useMemo(() => data?.operations ?? [], [data]);
  const byId = useMemo(() => new Map(operations.map((o) => [o.id, o])), [operations]);
  return {
    isPending: q.isPending, error: q.error, refetch: () => { void q.refetch(); },
    mode: data?.mode, reason: data?.reason, env: data?.env ?? "production", sellerId: data?.sellerId,
    operations, byId, limits: data?.limits ?? DEFAULT_LIMITS, canSend: data?.mode === "mock" || data?.mode === "live",
  };
}

/** Bilingual text in the active language (falls back to the other one). */
export const loc = (x: Text | undefined, locale: Locale): string => (x ? x[locale] || x.en || x.tr : "");

/** `12••••89` */
export const maskSeller = (id?: string): string => (!id ? "" : id.length <= 4 ? `${id.slice(0, 1)}•••` : `${id.slice(0, 2)}••••${id.slice(-2)}`);

/* ---------------------------------------------------------------- call hook */

export interface CallInput { path?: Record<string, string | number>; query?: Record<string, unknown>; body?: unknown; env?: TrendyolEnv }

/** Friendly text for our own (non-Trendyol) failures of POST /call. */
export function callErrorText(e: unknown): string {
  if (e instanceof ApiError) {
    const k = `trendyol.err.${e.code}`;
    const m = tNow(k);
    if (m !== k) return m;
  }
  return errMsg(e);
}

/** Does this call need the explicit "I understand" step? (live + write/destructive) */
export const needsConfirm = (op: Pick<TrendyolOperation, "risk">, mode?: string): boolean => mode === "live" && op.risk !== "read";

/**
 * Mutation wrapper around POST /call.
 *  - `run(op, input)` resolves with the result, or `null` on a transport failure (already toasted) or when the user cancels.
 *  - Live write/destructive calls open the confirmation dialog first (render `confirmNode` once in your view); the hook then sends `confirm: op.id`.
 *  - Mock calls never ask. Pass `{ skipConfirm: true }` when you already confirmed with your own UI.
 */
export function useTrendyolCall() {
  const cat = useTrendyolCatalog();
  const qc = useQueryClient(); const toast = useToast(); const { t } = useT();
  const [result, setResult] = useState<TrendyolCallResult | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState<{ op: TrendyolOperation; input: CallInput; resolve: (r: TrendyolCallResult | null) => void } | null>(null);
  const ref = useRef(pending); ref.current = pending;

  const mut = useMutation({
    mutationFn: (v: { op: TrendyolOperation; input: CallInput; confirm: boolean }) => {
      const body: Record<string, unknown> = { operationId: v.op.id, path: v.input.path ?? {}, query: v.input.query ?? {} };
      if (v.input.body !== undefined) body.body = v.input.body;
      if (v.input.env) body.env = v.input.env;
      if (v.confirm) body.confirm = v.op.id;
      return api.post<TrendyolCallResult>("/api/admin/trendyol/call", body);
    },
  });

  const send = useCallback(async (op: TrendyolOperation, input: CallInput, confirm: boolean): Promise<TrendyolCallResult | null> => {
    setError(null);
    try {
      const r = await mut.mutateAsync({ op, input, confirm });
      setResult(r);
      if (op.risk !== "read") void qc.invalidateQueries({ queryKey: ["trendyol", "history"] });
      if (op.risk !== "read" && r.ok) toast.success(t(r.mock ? "trendyol.call.doneMock" : "trendyol.call.doneLive", { op: op.id }));
      return r;
    } catch (e) { setError(e); toast.error(callErrorText(e)); return null; }
  }, [mut, qc, toast, t]);

  const run = useCallback((op: TrendyolOperation, input: CallInput = {}, opts: { skipConfirm?: boolean } = {}): Promise<TrendyolCallResult | null> => {
    if (needsConfirm(op, cat.mode) && !opts.skipConfirm) return new Promise((resolve) => setPending({ op, input, resolve }));
    return send(op, input, needsConfirm(op, cat.mode));
  }, [cat.mode, send]);

  const confirmNode: ReactNode = createElement(TrendyolConfirmDialog, {
    op: pending?.op ?? null, env: pending?.input.env ?? cat.env, sellerId: cat.sellerId, loading: mut.isPending,
    onClose: () => { pending?.resolve(null); setPending(null); },
    onConfirm: async () => { const p = ref.current; if (!p) return; const r = await send(p.op, p.input, true); setPending(null); p.resolve(r); },
  });

  return { run, result, error, isPending: mut.isPending, reset: () => { setResult(null); setError(null); }, confirmNode, setResult };
}

/* ---------------------------------------------------------------- params */

/** Form state of one operation: everything is a string (arrays comma separated, timestamps in ms, booleans "true"/"false"). */
export type ParamValues = Record<string, string>;

export const isPathParam = (p: OpParam) => p.in === "path" && p.name !== "sellerId";
export const visibleParams = (op: TrendyolOperation): OpParam[] => op.params.filter((p) => p.in !== "header" && p.name !== "sellerId");
/** `{x}` placeholders of the path that the user must fill (everything except sellerId). */
export const pathPlaceholders = (op: TrendyolOperation): string[] =>
  [...op.path.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).filter((n) => n !== "sellerId");

export function defaultValues(op: TrendyolOperation): ParamValues {
  const v: ParamValues = {};
  for (const p of visibleParams(op)) {
    if (p.default !== undefined) v[p.name] = String(p.default);
    else if (p.required && p.example !== undefined) v[p.name] = String(p.example);
    else v[p.name] = "";
  }
  for (const n of pathPlaceholders(op)) v[n] ??= "";
  return v;
}

export const splitList = (s: string): string[] => s.split(",").map((x) => x.trim()).filter(Boolean);

/** Typed query value from the raw form string (undefined = leave out). */
export function typedValue(p: OpParam, raw: string): string | number | boolean | (string | number)[] | undefined {
  const s = raw.trim();
  if (s === "") return undefined;
  switch (p.type) {
    case "integer": case "number": case "timestamp_ms": { const n = Number(s); return Number.isFinite(n) ? n : s; }
    case "boolean": return s === "true";
    case "array": return splitList(s);
    default: return s;
  }
}

export interface BuiltRequest {
  path: Record<string, string>;
  query: Record<string, string | number | boolean | (string | number)[]>;
  missing: string[];
  /** path with values filled (sellerId shown masked or as the placeholder when unknown) */
  url: string;
  queryString: string;
}

/** Serialise a query object like the Worker does: `comma` (default) or `repeat` arrays. */
export function serialiseQuery(op: TrendyolOperation, query: Record<string, unknown>): string {
  const parts: string[] = [];
  const enc = encodeURIComponent;
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === "") continue;
    if (Array.isArray(v)) {
      if (!v.length) continue;
      const style = op.params.find((p) => p.name === k)?.arrayStyle ?? "comma";
      if (style === "repeat") for (const x of v) parts.push(`${enc(k)}=${enc(String(x))}`);
      else parts.push(`${enc(k)}=${v.map((x) => enc(String(x))).join(",")}`);
    } else parts.push(`${enc(k)}=${enc(String(v))}`);
  }
  return parts.join("&");
}

export function buildRequest(op: TrendyolOperation, values: ParamValues, env: TrendyolEnv, sellerId?: string): BuiltRequest {
  const missing: string[] = [];
  const path: Record<string, string> = {};
  const query: BuiltRequest["query"] = {};
  for (const n of pathPlaceholders(op)) { const s = (values[n] ?? "").trim(); if (s) path[n] = s; else missing.push(n); }
  for (const p of visibleParams(op)) {
    if (p.in === "path") continue;
    const v = typedValue(p, values[p.name] ?? "");
    if (v === undefined) { if (p.required) missing.push(p.name); } else query[p.name] = v;
  }
  const filled = op.path
    .replace(/\{sellerId\}/g, sellerId || "{sellerId}")
    .replace(/\{(\w+)\}/g, (_m, n: string) => (path[n] ? encodeURIComponent(path[n]) : `{${n}}`));
  const queryString = serialiseQuery(op, query);
  return { path, query, missing, url: `${TRENDYOL_HOSTS[env]}${filled}`, queryString };
}

/* ---------------------------------------------------------------- curl */

const shq = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

/** curl command for the request. Credentials are ALWAYS placeholders (`$TRENDYOL_API_KEY:$TRENDYOL_API_SECRET`). */
export function buildCurl(op: TrendyolOperation, req: BuiltRequest, body: unknown, sellerId?: string): string {
  const url = `${req.url}${req.queryString ? `?${req.queryString}` : ""}`;
  const lines = [`curl -X ${op.method} ${shq(url)}`,
    `  -u "$TRENDYOL_API_KEY:$TRENDYOL_API_SECRET"`,
    `  -H ${shq(`User-Agent: ${sellerId || "$TRENDYOL_SELLER_ID"} - SelfIntegration`)}`,
    `  -H 'Accept: application/json'`];
  if (op.body.kind !== "none" && body !== undefined) {
    lines.push(`  -H 'Content-Type: application/json'`);
    lines.push(`  -d ${shq(typeof body === "string" ? body : JSON.stringify(body))}`);
  }
  return lines.join(" \\\n");
}

/* ---------------------------------------------------------------- JSON utils */

export type JsonCheck = { ok: true; value: unknown } | { ok: false; message: string; line: number; col: number; pos: number };

export function checkJson(text: string): JsonCheck {
  try { return { ok: true, value: JSON.parse(text) as unknown }; } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    let pos = Number(/position (\d+)/.exec(message)?.[1] ?? NaN);
    const lc = /line (\d+) column (\d+)/.exec(message);
    if (Number.isNaN(pos) && lc) {
      const lines = text.split("\n"); pos = lines.slice(0, Number(lc[1]) - 1).reduce((a, l) => a + l.length + 1, 0) + Number(lc[2]) - 1;
    }
    if (Number.isNaN(pos)) pos = text.length;
    const before = text.slice(0, pos).split("\n");
    return { ok: false, message, pos, line: before.length, col: (before.at(-1)?.length ?? 0) + 1 };
  }
}
export const prettyJson = (v: unknown): string => JSON.stringify(v, null, 2) ?? "";
export const byteLength = (s: string): number => new TextEncoder().encode(s).length;
export function formatBytes(n: number): string { return n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(2)} MB`; }

/** `a.b` / `items[].x` style lookup (`[]` = first element). "" returns the root. */
export function getByPath(obj: unknown, path: string): unknown {
  if (!path) return obj;
  let cur: unknown = obj;
  for (const seg of path.split(".")) {
    if (cur === null || cur === undefined) return undefined;
    const arr = seg.endsWith("[]");
    const key = arr ? seg.slice(0, -2) : seg;
    cur = key ? (cur as Record<string, unknown>)[key] : cur;
    if (arr) cur = Array.isArray(cur) ? cur[0] : undefined;
  }
  return cur;
}

const placeholderFor = (type: string): unknown => {
  const t = type.toLowerCase();
  if (/int|long|number|double|float|decimal/.test(t)) return 0;
  if (/bool/.test(t)) return false;
  if (/array|list/.test(t)) return [];
  if (/object/.test(t)) return {};
  return "";
};

/** Insert a hinted field (`items[].barcode`) into the JSON text and return the new pretty-printed text. */
export function insertField(text: string, path: string, type: string): string {
  const parsed = checkJson(text);
  let root: unknown = parsed.ok && parsed.value !== null && typeof parsed.value === "object" ? parsed.value : {};
  if (Array.isArray(root)) root = { items: root };
  const segs = path.split(".");
  let cur = root as Record<string, unknown>;
  segs.forEach((seg, i) => {
    const arr = seg.endsWith("[]"); const key = arr ? seg.slice(0, -2) : seg;
    const last = i === segs.length - 1;
    if (arr) {
      const list = Array.isArray(cur[key]) ? (cur[key] as unknown[]) : (cur[key] = []) as unknown[];
      if (last) { if (!list.length) list.push(placeholderFor(type)); return; }
      if (list[0] === undefined || typeof list[0] !== "object" || list[0] === null) list[0] = {};
      cur = list[0] as Record<string, unknown>;
    } else if (last) { if (cur[key] === undefined) cur[key] = placeholderFor(type); }
    else { if (typeof cur[key] !== "object" || cur[key] === null) cur[key] = {}; cur = cur[key] as Record<string, unknown>; }
  });
  return prettyJson(root);
}

/** Flattened `path -> value` search used by the JSON tree. */
export function matchesDeep(v: unknown, q: string, depth = 0): boolean {
  if (!q) return false;
  const n = q.toLowerCase();
  if (v === null || typeof v !== "object") return String(v).toLowerCase().includes(n);
  if (depth > 12) return false;
  return Object.entries(v as Record<string, unknown>).some(([k, x]) => k.toLowerCase().includes(n) || matchesDeep(x, q, depth + 1));
}

/* ---------------------------------------------------------------- timestamps */

const pad = (n: number) => String(n).padStart(2, "0");
/** ms -> value for `<input type="datetime-local">` (browser local time). */
export function msToLocalInput(ms: string | number): string {
  const n = Number(ms); if (!ms || !Number.isFinite(n)) return "";
  const d = new Date(n);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function localInputToMs(s: string): string { if (!s) return ""; const n = new Date(s).getTime(); return Number.isFinite(n) ? String(n) : ""; }

export type Preset = "today" | "last7" | "last14";
const startRe = /start|from|after|begin/i; const endRe = /end|to$|until|before/i;
/** Preset for a whole operation: start-like timestamps get the range start, end-like ones get "now". */
export function presetValue(kind: Preset, name: string, now = Date.now()): string {
  if (endRe.test(name) && !startRe.test(name)) return String(now);
  const d = new Date(now); d.setHours(0, 0, 0, 0);
  if (kind === "today") return String(d.getTime());
  return String(kind === "last7" ? now - 7 * 864e5 : now - 14 * 864e5);
}
export function applyPreset(op: TrendyolOperation, values: ParamValues, kind: Preset, now = Date.now()): ParamValues {
  const out = { ...values };
  for (const p of visibleParams(op)) if (p.type === "timestamp_ms") out[p.name] = presetValue(kind, p.name, now);
  return out;
}

/* ---------------------------------------------------------------- saved params (per operation, this tab) */

export interface SavedState { values: ParamValues; body: string }
const skey = (id: string) => `os_trendyol_params:${id}`;
export function loadSaved(id: string): SavedState | null {
  try { const s = sessionStorage.getItem(skey(id)); return s ? (JSON.parse(s) as SavedState) : null; } catch { return null; }
}
export function saveSaved(id: string, s: SavedState): void { try { sessionStorage.setItem(skey(id), JSON.stringify(s)); } catch { /* storage unavailable */ } }

/* ---------------------------------------------------------------- history */

export interface HistoryItem {
  id: number | string; operationId: string; method: string; env: TrendyolEnv; mock: boolean; risk: Risk; status: number;
  durationMs: number; adminId?: string; requestSummary?: unknown; responseSummary?: unknown; at: string;
}
export const HISTORY_KEY = ["trendyol", "history"] as const;
export const historyUrl = (page: number, operationId?: string) => `/api/admin/trendyol/history${qs({ page, operationId })}`;
export const fetchHistory = (page = 1, operationId?: string) => api.get<{ items: HistoryItem[]; total: number }>(historyUrl(page, operationId));

/** The summary may arrive as an object or a JSON string; returns the stored query (values as raw strings). */
export function summaryQuery(item: HistoryItem): Record<string, unknown> {
  let s: unknown = item.requestSummary;
  if (typeof s === "string") { try { s = JSON.parse(s); } catch { s = undefined; } }
  const q = (s as { query?: unknown } | undefined)?.query;
  return q && typeof q === "object" ? (q as Record<string, unknown>) : {};
}
/** History query -> form values for the operation. */
export function valuesFromQuery(op: TrendyolOperation, query: Record<string, unknown>): ParamValues {
  const v = defaultValues(op);
  for (const [k, x] of Object.entries(query)) if (k in v || op.params.some((p) => p.name === k)) v[k] = Array.isArray(x) ? x.join(",") : String(x);
  return v;
}

/* ---------------------------------------------------------------- misc */

export const statusTone = (status: number): "success" | "warning" | "danger" | "neutral" =>
  status >= 200 && status < 300 ? "success" : status >= 400 && status < 500 ? "warning" : status >= 500 ? "danger" : "neutral";

export const isMultipart = (op: TrendyolOperation) => op.body.kind === "multipart";

export function fileToBase64(file: File): Promise<{ name: string; type: string; base64: string }> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(r.error);
    r.onload = () => { const s = String(r.result); resolve({ name: file.name, type: file.type || "application/octet-stream", base64: s.slice(s.indexOf(",") + 1) }); };
    r.readAsDataURL(file);
  });
}

/** Rows of the table view: array at `op.table.listPath`, or any array-of-objects found in the body. */
export function tableRows(op: TrendyolOperation, body: unknown): Record<string, unknown>[] | null {
  if (!op.table) return null;
  const v = getByPath(body, op.table.listPath);
  return Array.isArray(v) ? (v as Record<string, unknown>[]) : null;
}

/**
 * Shared building blocks of the task-oriented Trendyol views (Products, Orders, Returns, Questions, Finance).
 * Everything talks to Trendyol only through `useTrendyolCall().run` (catalog operations), never directly.
 */
import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, Button, Card, EmptyState, ErrorState, Pagination, Skeleton, cx } from "../../ui";
import type { Tone } from "../../ui";
import { Term } from "../../help/Term";
import { EnvPill } from "../Chips";
import { callErrorText, localInputToMs, maskSeller, msToLocalInput, useTrendyolCall, useTrendyolCatalog } from "../../../lib/trendyol";
import type { TrendyolCallResult, TrendyolOperation } from "../../../lib/trendyol";
import { dateTime, money } from "../../../lib/format";
import { tNow, useT } from "../../../i18n";

export const DAY = 86_400_000;
/** Query-key prefix of every view query; invalidated after successful writes. */
export const VIEW_KEY = ["trendyol", "view"] as const;

/* ------------------------------------------------------------------ formatting */

/** Trendyol sends TRY in MAJOR units (399.9); `money()` expects minor units. */
export const tryMoney = (major: unknown): string => (typeof major === "number" && Number.isFinite(major) ? money(Math.round(major * 100)) : "-");
export const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0);
/** Epoch ms (or seconds) -> localised date + time. */
export const tsDate = (v: unknown): string => {
  const n = Number(v);
  if (!v || !Number.isFinite(n)) return "-";
  return dateTime(new Date(n < 1e11 ? n * 1000 : n).toISOString());
};
export const str = (v: unknown): string => (v === null || v === undefined ? "" : String(v));
export const rec = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
export const arr = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? (v as Record<string, unknown>[]) : []);
/** `a.b.0.c` dot-path lookup (table column keys of the catalog). */
export function dig(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const seg of path.split(".")) {
    if (cur === null || cur === undefined) return undefined;
    if (seg === "length" && Array.isArray(cur)) { cur = cur.length; continue; }
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

/** Paging wrapper of Trendyol list responses. */
export interface Paged<T = Record<string, unknown>> { content: T[]; page: number; size: number; totalElements: number; totalPages: number; nextPageToken?: string }
export function paged(body: unknown): Paged {
  const b = rec(body);
  const content = arr(b.content);
  return { content, page: num(b.page), size: num(b.size) || content.length || 1, totalElements: num(b.totalElements) || content.length, totalPages: num(b.totalPages) || 1, nextPageToken: typeof b.nextPageToken === "string" ? b.nextPageToken : undefined };
}

/* ------------------------------------------------------------------ errors */

export class TyError extends Error {
  status: number; hint?: string; code?: string;
  constructor(message: string, status: number, hint?: string, code?: string) { super(message); this.status = status; this.hint = hint; this.code = code; }
}
/** Trendyol's own error text of a failed result (message, errors[].message, error.title …). */
export function failText(r: TrendyolCallResult): string {
  if (r.error?.message) return r.error.message;
  const b = rec(r.response?.body);
  const errs = arr(b.errors).map((e) => str(e.message || e.title || e.key)).filter(Boolean);
  if (errs.length) return errs.join(" · ");
  const e1 = rec(b.error);
  const nested = arr(e1.errors).map((e) => str(e.title || e.message)).filter(Boolean);
  if (nested.length) return nested.join(" · ");
  return str(b.message || b.error || e1.message) || `HTTP ${r.status}`;
}
/** Known Trendyol rules explained next to the raw error. */
export function errorHintKey(text: string): "trendyolviews.hint.repeat" | "trendyolviews.hint.rate" | null {
  if (/15 dakika|15 minutes|tekrarl/i.test(text)) return "trendyolviews.hint.repeat";
  if (/too\.many|429|rate/i.test(text)) return "trendyolviews.hint.rate";
  return null;
}

/* ------------------------------------------------------------------ operations + reads */

export function useOps(ids: string[]) {
  const cat = useTrendyolCatalog();
  const key = ids.join(",");
  const ops = useMemo(() => Object.fromEntries(ids.map((i) => [i, cat.byId.get(i)])) as Record<string, TrendyolOperation | undefined>, [cat.byId, key]); // eslint-disable-line react-hooks/exhaustive-deps
  return { cat, ops };
}

type Run = ReturnType<typeof useTrendyolCall>["run"];
interface ReadInput { path?: Record<string, string | number>; query?: Record<string, unknown>; body?: unknown }

/** Read operation as a cached query. Rejects with `TyError` when Trendyol (or the mock) answers non-2xx. */
export function useTyQuery(run: Run, op: TrendyolOperation | undefined, input: ReadInput, opts: { enabled?: boolean; refetchInterval?: number | false } = {}) {
  return useQuery({
    queryKey: [...VIEW_KEY, op?.id, input],
    enabled: !!op && opts.enabled !== false,
    refetchInterval: opts.refetchInterval,
    staleTime: 15_000,
    retry: false,
    queryFn: async () => {
      const r = await run(op!, input, { skipConfirm: true });
      if (!r) throw new TyError(tNow("trendyolviews.error.transport"), 0);
      if (!r.ok) throw new TyError(failText(r), r.status, r.error?.hint, r.error?.code);
      return r;
    },
  });
}

/** Write helper: runs the op, refreshes the view queries on success and reports Trendyol's own error text. */
export function useTyWrite() {
  const call = useTrendyolCall();
  const qc = useQueryClient();
  const [local, setLocal] = useState<string | null>(null);
  const exec = async (op: TrendyolOperation | undefined, input: ReadInput, opts: { skipConfirm?: boolean; refresh?: boolean } = {}): Promise<TrendyolCallResult | null> => {
    if (!op) return null;
    setLocal(null);
    const r = await call.run(op, input, { skipConfirm: opts.skipConfirm });
    if (!r) return null;
    if (!r.ok) { setLocal(failText(r)); return r; }
    if (opts.refresh !== false) void qc.invalidateQueries({ queryKey: VIEW_KEY });
    return r;
  };
  // our own transport failures (409 confirm_required, 429 …) live in the hook's error state
  const err = local ?? (call.error ? callErrorText(call.error) : null);
  return { call, exec, err, clearErr: () => { setLocal(null); call.reset(); } };
}

/* ------------------------------------------------------------------ UI */

/** Mode strip + disabled / loading / error gate. Children render only when calls can be sent. */
export function ViewGate({ children }: { children: ReactNode }) {
  const { t } = useT();
  const cat = useTrendyolCatalog();
  if (cat.isPending) return <div className="space-y-3"><Skeleton className="h-10" /><Skeleton className="h-64" /></div>;
  if (cat.error) return <ErrorState error={cat.error} retry={cat.refetch} />;
  if (!cat.canSend) return (
    <Card testId="tdyv-disabled">
      <EmptyState title={t("trendyolviews.gate.disabled.title")} description={t(cat.reason === "integration_disabled" ? "trendyolviews.gate.disabled.off" : "trendyolviews.gate.disabled.body")}
        action={<div className="flex flex-wrap justify-center gap-2">
          <Link to="/integrations?configure=trendyol" className="inline-flex h-9 items-center rounded-lg bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700">{t("trendyolviews.gate.configure")}</Link>
          <Link to="/settings/system" className="inline-flex h-9 items-center rounded-lg border border-line bg-surface px-4 text-sm font-medium text-ink hover:bg-canvas">{t("trendyolviews.gate.mock")}</Link>
        </div>} />
    </Card>
  );
  return (
    <div className="space-y-5">
      <div data-testid="tdyv-mode" className="flex flex-wrap items-center gap-2 text-sm text-muted">
        {cat.mode === "mock" ? <Badge tone="danger">{t("trendyolviews.mode.mock")}</Badge> : <><Badge tone="success">{t("trendyolviews.mode.live")}</Badge><EnvPill env={cat.env} /></>}
        <span className="min-w-0">{cat.mode === "mock" ? t("trendyolviews.mode.mockNote") : <>{t("trendyolviews.mode.liveNote")} <Term id="sellerid" />: <span className="font-mono text-ink">{maskSeller(cat.sellerId) || "—"}</span></>}</span>
      </div>
      {children}
    </div>
  );
}

/** Error box with Trendyol's text, an explanation of well-known rules and a retry. */
export function TyErrorBox({ error, retry }: { error: unknown; retry?: () => void }) {
  const { t } = useT();
  const text = error instanceof TyError ? error.message : callErrorText(error);
  const hk = errorHintKey(text);
  return (
    <div role="alert" className="rounded-xl border border-danger-line bg-danger-soft p-4 text-sm text-danger">
      <p className="font-medium">{t("trendyolviews.error.title")}</p>
      <p className="mt-1 break-words">{text}</p>
      {error instanceof TyError && error.hint && <p className="mt-1 text-xs">{error.hint}</p>}
      {hk && <p className="mt-2 rounded-lg bg-surface/60 p-2 text-xs text-ink">{t(hk)}</p>}
      {retry && <Button variant="secondary" size="sm" className="mt-3" onClick={retry}>{t("common.retry")}</Button>}
    </div>
  );
}
export function InlineError({ text }: { text: string | null }) {
  const { t } = useT();
  if (!text) return null;
  const hk = errorHintKey(text);
  return (
    <div role="alert" className="rounded-lg border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger">
      <p className="break-words">{text}</p>
      {hk && <p className="mt-1 text-xs text-ink">{t(hk)}</p>}
    </div>
  );
}

export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return <div data-testid="tdyv-skeleton" className="space-y-2" aria-hidden>{Array.from({ length: rows }, (_, i) => <Skeleton key={i} className="h-11" />)}</div>;
}

/** Paging bar for Trendyol `{page,size,totalElements}` wrappers (0-based page). */
export function TyPager({ data, onPage }: { data: Paged; onPage: (p: number) => void }) {
  return <Pagination page={data.page + 1} pageSize={data.size} total={data.totalElements} onPage={(p) => onPage(p - 1)} />;
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4 shadow-soft">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="mt-1 break-words font-display text-xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </div>
  );
}

/** Label/value pair for detail panels. */
export function KV({ label, children, mono }: { label: ReactNode; children: ReactNode; mono?: boolean }) {
  return <div className="min-w-0"><dt className="text-xs text-muted">{label}</dt><dd className={cx("break-words text-sm", mono && "font-mono text-[13px]")}>{children || "-"}</dd></div>;
}

export function Section({ title, children, note }: { title: ReactNode; children: ReactNode; note?: ReactNode }) {
  return <section className="space-y-2"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold">{title}</h3>{note}</div>{children}</section>;
}

/** Status -> badge tone. Unknown statuses stay neutral. */
export const TONES: Record<string, Tone> = {
  Created: "warning", WaitingInAction: "warning", WAITING_FOR_ANSWER: "warning", Awaiting: "warning", pendingApproval: "warning", WaitingFraudCheck: "warning", InAnalysis: "info",
  Picking: "info", Invoiced: "info", Shipped: "info", AtCollectionPoint: "info", Verified: "info", RUNNING: "info", IN_PROGRESS: "info",
  Delivered: "success", Accepted: "success", ANSWERED: "success", SUCCESS: "success", COMPLETED: "success",
  Cancelled: "danger", UnSupplied: "danger", Returned: "danger", UnDelivered: "danger", Rejected: "danger", Unresolved: "danger", REJECTED: "danger", REPORTED: "danger", FAILED: "danger", FAIL: "danger", rejected: "danger",
};
export function StatusBadge({ group, value }: { group: string; value: string }) {
  const { td } = useT();
  const key = `trendyolviews.status.${group}.${value}`;
  const label = td(key);
  return <Badge tone={TONES[value] ?? "neutral"}>{label === key ? value : label}</Badge>;
}

/* ------------------------------------------------------------------ date range */

export interface Range { start: number; end: number }
export const startOfToday = (now = Date.now()): number => { const d = new Date(now); d.setHours(0, 0, 0, 0); return d.getTime(); };
export type RangePreset = "today" | "d3" | "d7" | "d14";
export function presetRange(p: RangePreset, now = Date.now()): Range {
  if (p === "today") return { start: startOfToday(now), end: now };
  const days = p === "d3" ? 3 : p === "d7" ? 7 : 14;
  return { start: now - days * DAY, end: now };
}

/** Date window (datetime-local inputs) with preset buttons and a max-window check. */
export function RangeFields({ range, onChange, presets, maxDays, idPrefix }: { range: Range; onChange: (r: Range) => void; presets: RangePreset[]; maxDays: number; idPrefix: string }) {
  const { t, td } = useT();
  const [active, setActive] = useState<RangePreset | null>(presets.includes("d7") ? "d7" : presets[0] ?? null);
  const tooLong = range.end - range.start > maxDays * DAY;
  const bad = range.end < range.start;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t("trendyolviews.range.presets")}>
        {presets.map((p) => (
          <Button key={p} size="sm" variant={active === p ? "primary" : "secondary"} aria-pressed={active === p} onClick={() => { setActive(p); onChange(presetRange(p)); }}>{td(`trendyolviews.range.${p}`)}</Button>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5"><label htmlFor={`${idPrefix}-from`} className="block text-[13px] font-medium">{t("trendyolviews.range.from")}</label>
          <input id={`${idPrefix}-from`} type="datetime-local" value={msToLocalInput(range.start)} onChange={(e) => { setActive(null); const v = localInputToMs(e.target.value); if (v) onChange({ ...range, start: Number(v) }); }}
            className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-brand-600 focus:ring-4 focus:ring-brand-600/15 dark:bg-canvas" /></div>
        <div className="space-y-1.5"><label htmlFor={`${idPrefix}-to`} className="block text-[13px] font-medium">{t("trendyolviews.range.to")}</label>
          <input id={`${idPrefix}-to`} type="datetime-local" value={msToLocalInput(range.end)} onChange={(e) => { setActive(null); const v = localInputToMs(e.target.value); if (v) onChange({ ...range, end: Number(v) }); }}
            className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-brand-600 focus:ring-4 focus:ring-brand-600/15 dark:bg-canvas" /></div>
      </div>
      <p className={cx("text-xs", tooLong || bad ? "text-danger" : "text-muted")} role={tooLong || bad ? "alert" : undefined}>
        {bad ? t("trendyolviews.range.badOrder") : tooLong ? t("trendyolviews.range.tooLong", { days: maxDays }) : t("trendyolviews.range.limit", { days: maxDays })}
      </p>
    </div>
  );
}
export const rangeValid = (r: Range, maxDays: number): boolean => r.end >= r.start && r.end - r.start <= maxDays * DAY;

/* ------------------------------------------------------------------ CSV */

/** CSV text with UTF-8 BOM; `sep` is `;` in Turkish and `,` in English. Cells with separators/quotes/newlines are quoted. */
export function toCsv(head: string[], rows: (string | number | null | undefined)[][], sep: string): string {
  const cell = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? "" : String(v);
    return new RegExp(`[${sep}"\\n\\r]`).test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + [head, ...rows].map((r) => r.map(cell).join(sep)).join("\r\n");
}
export function downloadText(name: string, text: string, mime = "text/csv;charset=utf-8"): void {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Small "copy" friendly code block. */
export function CodeBlock({ children, label }: { children: string; label: string }) {
  return <pre aria-label={label} className="max-h-72 overflow-auto rounded-lg border border-line bg-canvas p-3 font-mono text-xs leading-relaxed">{children}</pre>;
}

/** Product thumbnail with a neutral placeholder. */
export function Thumb({ src, alt, size = 40 }: { src?: string; alt?: string; size?: number }) {
  const [bad, setBad] = useState(false);
  const style = { width: size, height: size };
  if (!src || bad) return <span aria-hidden style={style} className="inline-block shrink-0 rounded-lg bg-hover ring-1 ring-inset ring-line" />;
  return <img src={src} alt={alt ?? ""} loading="lazy" style={style} onError={() => setBad(true)} className="shrink-0 rounded-lg object-cover ring-1 ring-inset ring-line" />;
}

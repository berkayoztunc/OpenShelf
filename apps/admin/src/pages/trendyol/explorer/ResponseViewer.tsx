import { Fragment, useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, Copy, Download } from "lucide-react";
import { Badge, Button, cx, inputClass, Tabs, useToast } from "../../../components/ui";
import { JsonTree } from "../../../components/trendyol/JsonTree";
import { statusTone, tableRows, getByPath, prettyJson, loc, formatBytes, byteLength } from "../../../lib/trendyol";
import type { TrendyolCallResult, TrendyolOperation } from "../../../lib/trendyol";
import { intlTag, useT } from "../../../i18n";

type View = "tree" | "raw" | "table" | "headers" | "request";

function fmtCell(v: unknown, key: string): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "number" && v >= 1e11 && /date|time|at$|timestamp|updated|created/i.test(key)) return new Date(v).toLocaleString(intlTag());
  if (typeof v === "object") { const s = JSON.stringify(v); return s.length > 120 ? `${s.slice(0, 120)}…` : s; }
  return String(v);
}

export function ResponseViewer({ op, result, onPage, busy }: { op: TrendyolOperation; result: TrendyolCallResult; onPage?: (page: number) => void; busy?: boolean }) {
  const { t, locale } = useT(); const toast = useToast();
  const body = result.response.body;
  const rows = useMemo(() => tableRows(op, body), [op, body]);
  const [view, setView] = useState<View>(rows ? "table" : "tree");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<boolean | null>(null);
  const [expandKey, setExpandKey] = useState(0);
  const raw = useMemo(() => (typeof body === "string" ? body : prettyJson(body)), [body]);
  const isJson = body !== null && typeof body === "object";
  const copy = (s: string) => void navigator.clipboard?.writeText(s).then(() => toast.success(t("common.copied")));
  const download = () => {
    const url = URL.createObjectURL(new Blob([raw], { type: isJson ? "application/json" : "text/plain" }));
    const a = document.createElement("a"); a.href = url; a.download = `${op.id}-${result.status}.${isJson ? "json" : "txt"}`; a.click(); URL.revokeObjectURL(url);
  };
  const tabs: { id: View; label: string }[] = [
    ...(rows ? [{ id: "table" as const, label: t("trendyol.resp.table") }] : []),
    { id: "tree", label: t("trendyol.resp.tree") }, { id: "raw", label: t("trendyol.resp.raw") },
    { id: "headers", label: t("trendyol.resp.headers") }, { id: "request", label: t("trendyol.resp.request") },
  ];
  const pg = op.pagination;
  const curPage = pg ? Number(result.request.query?.[pg.pageParam] ?? pg.firstPage) : 0;
  const totalPages = Number((body as { totalPages?: unknown } | null)?.totalPages);
  const hasTotal = Number.isFinite(totalPages) && totalPages > 0;
  const canNext = !!rows?.length && (!hasTotal || curPage - (pg?.firstPage ?? 0) + 1 < totalPages);

  return (
    <div className="space-y-4" data-testid="tdy-response">
      <div className="flex flex-wrap items-center gap-2" role="status">
        <span data-testid="tdy-status" className={cx("rounded-md px-2.5 py-1 font-mono text-sm font-bold ring-1 ring-inset",
          { success: "bg-success-soft text-success ring-success-line", warning: "bg-warn-soft text-warn ring-warn-line", danger: "bg-danger-soft text-danger ring-danger-line", neutral: "bg-hover text-muted ring-line-strong" }[statusTone(result.status)])}>{result.status}</span>
        <span className="text-sm text-muted">{t("trendyol.resp.duration", { ms: result.durationMs })}</span>
        <Badge tone={result.mock ? "danger" : "success"}>{t(result.mock ? "trendyol.resp.mock" : "trendyol.resp.live")}</Badge>
        <span className="text-xs text-muted">{t(result.env === "production" ? "trendyol.env.production" : "trendyol.env.stage")} · {formatBytes(byteLength(raw))}</span>
        <div className="ml-auto flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => copy(raw)}><Copy size={13} />{t("trendyol.resp.copy")}</Button>
          <Button variant="secondary" size="sm" onClick={download}><Download size={13} />{t("common.download")}</Button>
        </div>
      </div>
      {result.mock && <p className="rounded-lg border border-danger-line bg-danger-soft px-3 py-2 text-xs text-danger">{t("trendyol.resp.mockNote")}</p>}
      {result.error && (
        <div role="alert" className="rounded-xl border border-danger-line bg-danger-soft p-3 text-sm text-danger">
          <p className="flex items-center gap-2 font-semibold"><AlertTriangle size={16} />{result.error.message}</p>
          {result.error.code && <p className="mt-0.5 font-mono text-xs opacity-80">{result.error.code}</p>}
          {result.error.hint && <p className="mt-1.5">{result.error.hint}</p>}
        </div>
      )}
      {result.response.truncated && <p role="status" className="rounded-lg border border-warn-line bg-warn-soft px-3 py-2 text-xs text-warn">{t("trendyol.resp.truncated")}</p>}

      <Tabs tabs={tabs} value={view} onChange={setView} label={t("trendyol.resp.views")} />

      {view === "table" && rows && (
        rows.length === 0 ? <p className="py-6 text-center text-sm text-muted">{t("trendyol.resp.noRows")}</p> : (
          <div className="max-h-[60vh] overflow-auto rounded-lg border border-line">
            <table className="w-full min-w-[32rem] text-left text-[13px]">
              <thead className="sticky top-0 bg-canvas text-[11px] uppercase tracking-wider text-muted shadow-[0_1px_0_var(--color-line)]"><tr>{op.table!.columns.map((c) => <th key={c.key} scope="col" className="px-3 py-2 font-semibold">{loc(c.label, locale)}</th>)}</tr></thead>
              <tbody className="divide-y divide-line">
                {rows.slice(0, 200).map((r, i) => <tr key={i} className="hover:bg-hover">{op.table!.columns.map((c) => <td key={c.key} className="max-w-[18rem] truncate px-3 py-2" title={fmtCell(getByPath(r, c.key), c.key)}>{fmtCell(getByPath(r, c.key), c.key)}</td>)}</tr>)}
              </tbody>
            </table>
          </div>
        )
      )}
      {view === "tree" && (isJson ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <input aria-label={t("trendyol.resp.search")} placeholder={t("trendyol.resp.search")} value={search} onChange={(e) => setSearch(e.target.value)} className={cx(inputClass, "!w-56 !py-1.5")} type="search" />
            <Button variant="secondary" size="sm" onClick={() => { setExpanded(true); setExpandKey((k) => k + 1); }}><ChevronDown size={13} />{t("trendyol.resp.expandAll")}</Button>
            <Button variant="secondary" size="sm" onClick={() => { setExpanded(false); setExpandKey((k) => k + 1); }}>{t("trendyol.resp.collapseAll")}</Button>
          </div>
          <div className="max-h-[60vh] overflow-auto rounded-lg border border-line bg-canvas p-3"><JsonTree value={body} search={search} expanded={expanded} expandKey={expandKey} /></div>
        </div>
      ) : <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-lg border border-line bg-canvas p-3 font-mono text-[12.5px]">{raw || t("trendyol.resp.emptyBody")}</pre>)}
      {view === "raw" && <pre data-testid="tdy-raw" className="max-h-[60vh] overflow-auto whitespace-pre rounded-lg border border-line bg-canvas p-3 font-mono text-[12.5px]">{raw || t("trendyol.resp.emptyBody")}</pre>}
      {view === "headers" && (
        <dl className="grid grid-cols-[minmax(8rem,14rem)_1fr] gap-x-4 gap-y-1.5 rounded-lg border border-line p-3 font-mono text-[12.5px]">
          {Object.entries(result.response.headers ?? {}).map(([k, v]) => <Fragment key={k}><dt className="text-muted">{k}</dt><dd className="break-all">{v}</dd></Fragment>)}
          {!Object.keys(result.response.headers ?? {}).length && <p className="col-span-2 font-sans text-muted">{t("trendyol.resp.noHeaders")}</p>}
        </dl>
      )}
      {view === "request" && (
        <div className="space-y-2 text-[12.5px]">
          <p className="font-mono"><span className="font-bold">{result.request.method}</span> <span className="break-all">{result.request.url}</span></p>
          <pre className="max-h-[40vh] overflow-auto rounded-lg border border-line bg-canvas p-3 font-mono">{prettyJson({ query: result.request.query, ...(result.request.body !== undefined ? { body: result.request.body } : {}) })}</pre>
        </div>
      )}

      {pg && onPage && (
        <div className="flex items-center justify-between gap-2 text-sm text-muted">
          <Button variant="secondary" size="sm" loading={busy} disabled={curPage <= pg.firstPage} onClick={() => onPage(curPage - 1)}>{t("common.previous")}</Button>
          <span aria-live="polite">{hasTotal ? t("trendyol.resp.pageOf", { page: curPage - pg.firstPage + 1, pages: totalPages }) : t("trendyol.resp.page", { page: curPage - pg.firstPage + 1 })}</span>
          <Button variant="secondary" size="sm" loading={busy} disabled={!canNext} onClick={() => onPage(curPage + 1)}>{t("common.next")}</Button>
        </div>
      )}
    </div>
  );
}

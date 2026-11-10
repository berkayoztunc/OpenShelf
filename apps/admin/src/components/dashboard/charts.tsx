import { useId, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, Minus, Table2, LineChart } from "lucide-react";
import { intlTag, useT } from "../../i18n";
import { money } from "../../lib/format";
import { axisMoney, deltaPct, labelIdx, niceMax, pathOf, toPoints, yTicks, type DayPoint } from "../../lib/insights";
import { Button } from "../ui";

/** Signed change vs the previous period. Direction is shown by arrow + sign + color, never color alone. Up is good for every dashboard KPI. */
export function Delta({ cur, prev }: { cur: number; prev: number }) {
  const { t } = useT();
  const d = deltaPct(cur, prev);
  if (d === null) return <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-ink">{t("dashboard.delta.new")}</span>;
  const r = Math.abs(d) < 0.05 ? 0 : d;
  const tone = r === 0 ? "bg-hover text-muted" : r > 0 ? "bg-success-soft text-success" : "bg-danger-soft text-danger";
  const Icon = r === 0 ? Minus : r > 0 ? ArrowUpRight : ArrowDownRight;
  const text = `${r > 0 ? "+" : r < 0 ? "−" : ""}${new Intl.NumberFormat(intlTag(), { maximumFractionDigits: 1 }).format(Math.abs(r))}%`;
  return <span className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums ${tone}`}><Icon size={12} aria-hidden />{text}</span>;
}

/** Tiny trend line for a KPI tile: 2px line, no axes (the tile's number and delta carry the values). */
export function Sparkline({ values }: { values: number[] }) {
  const top = Math.max(...values, 1);
  const pts = toPoints(values, top, { x0: 2, x1: 118, yTop: 4, yBottom: 28 });
  const d = pathOf(pts);
  return (
    <svg viewBox="0 0 120 32" aria-hidden className="h-8 w-full">
      <path d={`${d} L118 30 L2 30 Z`} className="fill-brand-600" opacity=".1" />
      <path d={d} fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="stroke-brand-600" />
    </svg>
  );
}

const W = 720, H = 300, BOX = { x0: 52, x1: 706, yTop: 14, yBottom: 264 };

/** Revenue per day with the previous period overlaid. Hover/keyboard crosshair + tooltip, and a table view for screen readers. */
export function RevenueChart({ series, previous, currency, days }: { series: DayPoint[]; previous: { revenue: number; orders: number }[]; currency: string; days: number }) {
  const { t } = useT(); const tag = intlTag();
  const [view, setView] = useState<"chart" | "table">("chart");
  const [hover, setHover] = useState<number | null>(null);
  const ref = useRef<SVGSVGElement>(null); const id = useId();
  const cur = series.map((s) => s.revenue); const prev = previous.map((p) => p.revenue);
  const top = niceMax(Math.max(...cur, ...prev, 0));
  const curPts = toPoints(cur, top, BOX); const prevPts = toPoints(prev, top, BOX);
  const total = cur.reduce((a, b) => a + b, 0);
  const fmtDay = (iso: string, long = false) => new Date(`${iso}T12:00:00`).toLocaleDateString(tag, long ? { weekday: "long", day: "numeric", month: "long" } : { day: "numeric", month: "short" });
  const idxAt = (clientX: number) => {
    const r = ref.current?.getBoundingClientRect(); if (!r || r.width === 0) return 0;
    const x = ((clientX - r.left) / r.width) * W;
    return Math.max(0, Math.min(series.length - 1, Math.round(((x - BOX.x0) / (BOX.x1 - BOX.x0)) * (series.length - 1))));
  };
  const onMove = (e: PointerEvent) => setHover(idxAt(e.clientX));
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowRight") { e.preventDefault(); setHover((h) => Math.min(series.length - 1, (h ?? -1) + 1)); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); setHover((h) => Math.max(0, (h ?? series.length) - 1)); }
    else if (e.key === "Escape") setHover(null);
  };
  const h = hover !== null ? series[hover] : undefined; const hp = hover !== null ? curPts[hover] : undefined;
  const flip = hp ? hp[0] > W * 0.62 : false;
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <p className="text-sm text-muted">{t("dashboard.chart.caption", { days })}</p>
        <div className="flex items-center gap-4">
          <ul className="flex items-center gap-4 text-xs text-muted" aria-label={t("dashboard.chart.legend")}>
            <li className="flex items-center gap-1.5"><span aria-hidden className="h-0.5 w-4 rounded-full bg-brand-600" />{t("dashboard.chart.current")}</li>
            <li className="flex items-center gap-1.5"><span aria-hidden className="h-0.5 w-4 rounded-full bg-data-muted" />{t("dashboard.chart.previous")}</li>
          </ul>
          <Button size="sm" variant="ghost" onClick={() => setView(view === "chart" ? "table" : "chart")} aria-pressed={view === "table"}>{view === "chart" ? <><Table2 size={14} />{t("dashboard.chart.showTable")}</> : <><LineChart size={14} />{t("dashboard.chart.showChart")}</>}</Button>
        </div>
      </div>
      {view === "table" ? (
        <div className="max-h-72 overflow-auto rounded-lg border border-line">
          <table className="w-full text-left text-sm"><caption className="sr-only">{t("dashboard.chart.aria", { total: money(total, currency), days })}</caption>
            <thead className="sticky top-0 bg-canvas text-[11px] uppercase tracking-wider text-muted"><tr>{["date", "revenue", "orders", "previous"].map((k) => <th key={k} scope="col" className="px-3 py-2 font-semibold">{t(`dashboard.chart.col.${k}` as "dashboard.chart.col.date")}</th>)}</tr></thead>
            <tbody className="divide-y divide-line">{series.map((s, i) => <tr key={s.date}><td className="px-3 py-1.5">{fmtDay(s.date)}</td><td className="px-3 py-1.5 tabular-nums">{money(s.revenue, currency)}</td><td className="px-3 py-1.5 tabular-nums">{s.orders}</td><td className="px-3 py-1.5 tabular-nums text-muted">{money(prev[i] ?? 0, currency)}</td></tr>)}</tbody>
          </table>
        </div>
      ) : (
        <div className="relative">
          <svg ref={ref} viewBox={`0 0 ${W} ${H}`} role="img" tabIndex={0} aria-label={t("dashboard.chart.aria", { total: money(total, currency), days })} aria-describedby={`${id}-hint`}
            className="h-auto w-full touch-none select-none outline-none focus-visible:ring-2 focus-visible:ring-brand-600/40" onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)} onKeyDown={onKey} onBlur={() => setHover(null)}>
            {yTicks(top).map((v) => {
              const y = BOX.yBottom - (v / top) * (BOX.yBottom - BOX.yTop);
              return <g key={v}><line x1={BOX.x0} x2={BOX.x1} y1={y} y2={y} strokeWidth="1" className="stroke-line" /><text x={BOX.x0 - 8} y={y + 3.5} textAnchor="end" className="fill-muted text-[10px] tabular-nums">{axisMoney(v)}</text></g>;
            })}
            {labelIdx(series.length).map((i) => <text key={i} x={curPts[i]![0]} y={H - 8} textAnchor={i === 0 ? "start" : i === series.length - 1 ? "end" : "middle"} className="fill-muted text-[10px]">{fmtDay(series[i]!.date)}</text>)}
            <path d={pathOf(prevPts)} fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="stroke-data-muted" />
            <path d={`${pathOf(curPts)} L${BOX.x1} ${BOX.yBottom} L${BOX.x0} ${BOX.yBottom} Z`} className="fill-brand-600" opacity=".1" />
            <path d={pathOf(curPts)} fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="stroke-brand-600" />
            {hover === null && curPts.length > 0 && <circle cx={curPts[curPts.length - 1]![0]} cy={curPts[curPts.length - 1]![1]} r="4" strokeWidth="2" className="fill-brand-600 stroke-surface" />}
            {hp && <>
              <line x1={hp[0]} x2={hp[0]} y1={BOX.yTop} y2={BOX.yBottom} strokeWidth="1" className="stroke-line-strong" />
              {prevPts[hover!] && <circle cx={prevPts[hover!]![0]} cy={prevPts[hover!]![1]} r="4" strokeWidth="2" className="fill-data-muted stroke-surface" />}
              <circle cx={hp[0]} cy={hp[1]} r="4.5" strokeWidth="2" className="fill-brand-600 stroke-surface" />
            </>}
          </svg>
          <p id={`${id}-hint`} className="sr-only">{t("dashboard.chart.hint")}</p>
          {h && hp && (
            <div role="status" data-testid="chart-tooltip" className="pointer-events-none absolute top-2 z-10 min-w-40 rounded-lg border border-line bg-raised px-3 py-2 text-xs shadow-lift" style={{ left: `${(hp[0] / W) * 100}%`, transform: `translateX(${flip ? "calc(-100% - 12px)" : "12px"})` }}>
              <p className="font-medium">{fmtDay(h.date, true)}</p>
              <p className="mt-1 flex items-center justify-between gap-4"><span className="flex items-center gap-1.5"><span aria-hidden className="size-2 rounded-full bg-brand-600" />{t("dashboard.chart.current")}</span><span className="font-semibold tabular-nums">{money(h.revenue, currency)}</span></p>
              <p className="flex items-center justify-between gap-4 text-muted"><span className="flex items-center gap-1.5"><span aria-hidden className="size-2 rounded-full bg-data-muted" />{t("dashboard.chart.previous")}</span><span className="tabular-nums">{money(prev[hover!] ?? 0, currency)}</span></p>
              <p className="mt-1 text-muted">{t("dashboard.tooltip.orders", { n: h.orders })}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Ranked horizontal bars: name left, bar, value at the tip (text stays in ink tokens; the bar carries the color). */
export function RankBars({ rows }: { rows: { key: string; label: string; value: number; valueText: string; sub?: string }[] }) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <ol className="space-y-3">{rows.map((r, i) => (
      <li key={r.key}>
        <div className="mb-1 flex items-baseline justify-between gap-3 text-sm"><span className="flex min-w-0 items-baseline gap-2"><span className="w-4 shrink-0 text-xs tabular-nums text-faint">{i + 1}</span><span className="truncate font-medium">{r.label}</span></span><span className="shrink-0 tabular-nums">{r.valueText}{r.sub && <span className="ml-2 text-xs text-muted">{r.sub}</span>}</span></div>
        <div className="ml-6 h-2 rounded-r-[4px] rounded-l-none bg-hover" aria-hidden><div className="h-2 rounded-r-[4px] bg-brand-600" style={{ width: `${Math.max(2, (r.value / max) * 100)}%` }} /></div>
      </li>
    ))}</ol>
  );
}

/** One whole split into parts (here: sales channels). Segments are separated by a 2px surface gap; all values are written out in the legend. */
export function SplitBar({ parts }: { parts: { key: string; label: string; value: number; valueText: string; sub: string; className: string }[] }) {
  const total = parts.reduce((n, p) => n + p.value, 0);
  const pct = (v: number) => (total ? Math.round((v / total) * 100) : 0);
  return (
    <div>
      <div className="flex h-3 gap-0.5 overflow-hidden rounded-full bg-surface" role="img" aria-label={parts.map((p) => `${p.label} ${pct(p.value)}%`).join(", ")}>
        {parts.filter((p) => p.value > 0).map((p) => <span key={p.key} className={p.className} style={{ width: `${(p.value / total) * 100}%` }} />)}
        {total === 0 && <span className="w-full bg-hover" />}
      </div>
      <ul className="mt-4 space-y-2.5">{parts.map((p) => (
        <li key={p.key} className="flex items-center justify-between gap-3 text-sm"><span className="flex items-center gap-2"><span aria-hidden className={`size-2.5 rounded-full ${p.className}`} />{p.label}</span><span className="tabular-nums"><span className="font-medium">{p.valueText}</span><span className="ml-2 text-xs text-muted">{pct(p.value)}% · {p.sub}</span></span></li>
      ))}</ul>
    </div>
  );
}

export function KpiCard({ title, value, delta, spark, sub, icon }: { title: string; value: string; delta?: ReactNode; spark?: number[]; sub?: ReactNode; icon: ReactNode }) {
  return (
    <div className="flex flex-col rounded-xl border border-line bg-surface p-4 shadow-soft transition duration-200 hover:-translate-y-0.5 hover:shadow-lift">
      <div className="flex items-center justify-between"><p className="text-[13px] font-medium text-muted">{title}</p><span aria-hidden className="grid size-8 place-items-center rounded-lg bg-brand-50 text-brand-ink">{icon}</span></div>
      <p className="mt-2 font-display text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
      <div className="mt-1 flex min-h-5 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">{delta}{sub}</div>
      {spark && spark.length > 1 && <div className="mt-2">{<Sparkline values={spark} />}</div>}
    </div>
  );
}

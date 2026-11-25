import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Calculator, RotateCcw, TrendingDown, TrendingUp } from "lucide-react";
import { api, qs } from "../lib/api";
import { mapPaged, productFromApi } from "../lib/adapt";
import { money } from "../lib/format";
import { useT } from "../i18n";
import type { Paged } from "../lib/types";
import { computeProfit, DEFAULT_PARAMS, loadProfitState, saveProfitState, type Channel, type ProfitParams, type ProfitState, type RowOverride } from "../lib/profit";
import { Button, Card, EmptyState, ErrorState, Loading, PageHeader, Pagination, Table, Td, TextField, useDebounced } from "../components/ui";

const CHANNELS: Channel[] = ["website", "trendyol"];
const fmtNum = (v: number | undefined) => (v === undefined || !Number.isFinite(v) ? "" : String(v));
const parseNum = (s: string): number | undefined => { const n = Number(s.replace(",", ".").trim()); return s.trim() === "" || Number.isNaN(n) ? undefined : n; };

/** Compact numeric input that keeps its own text while typing and commits on blur / Enter. */
function NumInput({ value, placeholder, onCommit, label, suffix }: { value: number | undefined; placeholder?: string; onCommit: (v: number | undefined) => void; label: string; suffix: string }) {
  const [text, setText] = useState(fmtNum(value));
  useEffect(() => setText(fmtNum(value)), [value]);
  return (
    <span className="relative inline-flex">
      <input aria-label={label} inputMode="decimal" value={text} placeholder={placeholder}
        onFocus={(e) => e.currentTarget.select()} onChange={(e) => setText(e.target.value)} onBlur={() => onCommit(parseNum(text))} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        className="h-8 w-24 rounded-md border border-line bg-surface pl-2 pr-7 text-right text-[13px] tabular-nums placeholder:text-faint focus:border-brand-600 focus:outline-none" />
      <span aria-hidden className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-faint">{suffix}</span>
    </span>
  );
}

/**
 * Parameter field that owns its text while focused, so it can be emptied and retyped.
 * Valid numbers apply live; leaving it empty falls back to the channel default on blur.
 */
function ParamField({ label, hint, value, onChange }: { label: string; hint?: string; value: number; onChange: (v: number | undefined) => void }) {
  const [text, setText] = useState(fmtNum(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => { if (!focused) setText(fmtNum(value)); }, [value, focused]);
  return (
    <TextField label={label} hint={hint} inputMode="decimal" value={text}
      onFocus={(e) => { setFocused(true); e.currentTarget.select(); }}
      onChange={(e) => { setText(e.target.value); const n = parseNum(e.target.value); if (n !== undefined && n >= 0) onChange(n); }}
      onBlur={() => { setFocused(false); const n = parseNum(text); if (n === undefined || n < 0) onChange(undefined); }}
      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />
  );
}

export default function Profit() {
  const { t } = useT();
  const [channel, setChannel] = useState<Channel>("website");
  const [state, setState] = useState<ProfitState>(loadProfitState);
  useEffect(() => saveProfitState(state), [state]);
  const [q, setQ] = useState(""); const dq = useDebounced(q);
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [dq, channel]);

  const list = useQuery({
    queryKey: ["products", "profit", dq, channel, page],
    queryFn: async () => mapPaged(await api.get<Paged<unknown>>(`/api/admin/products${qs({ q: dq, status: "active", channel: channel === "trendyol" ? "trendyol" : "", page, pageSize: 50 })}`), productFromApi),
  });

  const params = state.params[channel];
  const setParam = (k: keyof ProfitParams, v: number | undefined) => setState((s) => ({ ...s, params: { ...s.params, [channel]: { ...s.params[channel], [k]: v ?? DEFAULT_PARAMS[channel][k] } } }));
  const rowKey = (variantKey: string) => `${channel}:${variantKey}`;
  const setRow = (key: string, k: keyof RowOverride, v: number | undefined) => setState((s) => {
    const cur = { ...s.rows[key] }; if (v === undefined) delete cur[k]; else cur[k] = v;
    const rows = { ...s.rows }; if (Object.keys(cur).length) rows[key] = cur; else delete rows[key];
    return { ...s, rows };
  });

  const rows = useMemo(() => (list.data?.items ?? []).flatMap((p) => p.variants.map((v) => {
    const key = rowKey(v.id ?? v.sku);
    const o = state.rows[key] ?? {};
    const price = channel === "trendyol" ? (v.prices.trendyol ?? v.prices.website) : v.prices.website;
    const b = computeProfit({ ...params, price, cost: o.cost ?? 0, commissionPct: o.commissionPct ?? params.commissionPct, shipping: o.shipping ?? params.shipping });
    return { key, product: p, variant: v, o, b, hasCost: o.cost !== undefined };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  })), [list.data, state, channel]);

  const withCost = rows.filter((r) => r.hasCost);
  const losing = withCost.filter((r) => r.b.net < 0).length;
  const avgMargin = withCost.length ? withCost.reduce((n, r) => n + r.b.margin, 0) / withCost.length : null;
  const pctText = (m: number) => `${(m * 100).toLocaleString("tr-TR", { maximumFractionDigits: 1 })}%`;

  const head = [
    t("profit.col.product"), <span key="p" className="block text-right">{t("profit.col.price")}</span>, t("profit.col.cost"), t("profit.col.commissionPct"),
    <span key="c" className="block text-right">{t("profit.col.commission")}</span>, t("profit.col.shipping"),
    <span key="v" className="block text-right">{t("profit.col.vat")}</span>, <span key="pt" className="block text-right">{t("profit.col.preTax")}</span>,
    <span key="it" className="block text-right">{t("profit.col.incomeTax")}</span>, <span key="n" className="block text-right">{t("profit.col.net")}</span>,
    <span key="m" className="block text-right">{t("profit.col.margin")}</span>,
  ];

  return (
    <>
      <PageHeader title={t("profit.title")} description={t("profit.description")} />
      <Card title={t("profit.params.title")} description={t("profit.params.body")}
        actions={<Button size="sm" variant="ghost" onClick={() => setState((s) => ({ ...s, params: { ...s.params, [channel]: { ...DEFAULT_PARAMS[channel] } } }))}><RotateCcw size={14} />{t("profit.params.reset")}</Button>}>
        <div role="tablist" aria-label={t("profit.channel")} className="mb-4 inline-flex rounded-lg border border-line p-0.5">
          {CHANNELS.map((c) => (
            <button key={c} type="button" role="tab" aria-selected={c === channel} onClick={() => setChannel(c)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${c === channel ? "bg-brand-600 text-white" : "text-muted hover:text-ink"}`}>{t(`profit.channel.${c}`)}</button>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-5">
          <ParamField label={t("profit.param.commissionPct")} value={params.commissionPct} onChange={(v) => setParam("commissionPct", v)} />
          <ParamField label={t("profit.param.shipping")} value={params.shipping / 100} onChange={(v) => setParam("shipping", v === undefined ? undefined : Math.round(v * 100))} />
          <ParamField label={t("profit.param.vatPct")} value={params.vatPct} onChange={(v) => setParam("vatPct", v)} />
          <ParamField label={t("profit.param.incomeTaxPct")} value={params.incomeTaxPct} onChange={(v) => setParam("incomeTaxPct", v)} />
          <ParamField label={t("profit.param.withholdingPct")} hint={t("profit.param.withholdingPct.hint")} value={params.withholdingPct} onChange={(v) => setParam("withholdingPct", v)} />
        </div>
      </Card>

      <div className="my-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-line bg-raised p-4"><p className="text-xs text-muted">{t("profit.kpi.rows")}</p><p className="mt-1 text-xl font-semibold tabular-nums">{withCost.length} / {rows.length}</p></div>
        <div className="rounded-xl border border-line bg-raised p-4"><p className="text-xs text-muted">{t("profit.kpi.avgMargin")}</p><p className={`mt-1 flex items-center gap-1.5 text-xl font-semibold tabular-nums ${avgMargin !== null && avgMargin < 0 ? "text-danger" : ""}`}>{avgMargin === null ? "-" : <>{avgMargin < 0 ? <TrendingDown size={18} /> : <TrendingUp size={18} />}{pctText(avgMargin)}</>}</p></div>
        <div className="rounded-xl border border-line bg-raised p-4"><p className="text-xs text-muted">{t("profit.kpi.losing")}</p><p className={`mt-1 text-xl font-semibold tabular-nums ${losing ? "text-danger" : ""}`}>{losing}</p></div>
      </div>

      <Card>
        <div className="mb-4 max-w-md"><TextField label={t("common.search")} type="search" placeholder={t("profit.search")} value={q} onChange={(e) => setQ(e.target.value)} /></div>
        {list.isPending ? <Loading /> : list.isError ? <ErrorState error={list.error} retry={() => list.refetch()} /> :
          rows.length === 0 ? <EmptyState icon={<Calculator size={22} />} title={t("profit.empty.title")} description={t("profit.empty.body")} /> : (
            <>
              <Table minWidth="86rem" head={head} caption={t("profit.title")}>{rows.map(({ key, product, variant, o, b, hasCost }) => (
                <tr key={key}>
                  <Td className="max-w-[18rem]">
                    <Link to={`/products/${product.id}`} className="block truncate font-medium hover:underline" title={product.name}>{product.name}</Link>
                    <span className="block truncate text-xs text-muted">{[variant.title, variant.sku].filter(Boolean).join(" · ")}</span>
                  </Td>
                  <Td className="whitespace-nowrap text-right tabular-nums">{money(b.price)}</Td>
                  <Td><NumInput label={t("profit.col.cost")} suffix="₺" placeholder={t("profit.cost.placeholder")} value={o.cost === undefined ? undefined : o.cost / 100} onCommit={(v) => setRow(key, "cost", v === undefined ? undefined : Math.round(v * 100))} /></Td>
                  <Td><NumInput label={t("profit.col.commissionPct")} suffix="%" placeholder={fmtNum(params.commissionPct)} value={o.commissionPct} onCommit={(v) => setRow(key, "commissionPct", v)} /></Td>
                  <Td className="whitespace-nowrap text-right tabular-nums text-muted">−{money(b.commission)}</Td>
                  <Td><NumInput label={t("profit.col.shipping")} suffix="₺" placeholder={fmtNum(params.shipping / 100)} value={o.shipping === undefined ? undefined : o.shipping / 100} onCommit={(v) => setRow(key, "shipping", v === undefined ? undefined : Math.round(v * 100))} /></Td>
                  <Td className="whitespace-nowrap text-right tabular-nums text-muted" ><span title={t("profit.vat.tooltip", { out: money(b.outputVat), in: money(b.inputVat) })}>−{money(b.vatPayable)}</span></Td>
                  <Td className="whitespace-nowrap text-right tabular-nums">{money(b.preTax)}</Td>
                  <Td className="whitespace-nowrap text-right tabular-nums text-muted">−{money(b.incomeTax)}</Td>
                  <Td className={`whitespace-nowrap text-right font-semibold tabular-nums ${b.net < 0 ? "text-danger" : hasCost ? "text-success" : "text-faint"}`}>{money(b.net)}</Td>
                  <Td className={`whitespace-nowrap text-right tabular-nums ${b.net < 0 ? "text-danger" : hasCost ? "" : "text-faint"}`}>{hasCost ? pctText(b.margin) : <span title={t("profit.noCost")}>~{pctText(b.margin)}</span>}</Td>
                </tr>
              ))}</Table>
              <Pagination page={list.data.page} pageSize={list.data.pageSize} total={list.data.total} onPage={setPage} />
              <p className="mt-3 text-xs text-muted">{t("profit.footnote")}</p>
            </>
          )}
      </Card>
    </>
  );
}

import { useMemo, useRef, useState } from "react";
import { RefreshCw, Search } from "lucide-react";
import { Button, Card, EmptyState, Table, TextField, Td, cx } from "../../../components/ui";
import { RangeFields, Stat, StatusBadge, TableSkeleton, TyErrorBox, TyPager, ViewGate, arr, num, paged, presetRange, rangeValid, str, tryMoney, tsDate, useOps, useTyQuery, useTyWrite } from "../../../components/trendyol/views/shared";
import type { Range } from "../../../components/trendyol/views/shared";
import { OrderDrawer } from "./orders/OrderDrawer";
import { useT } from "../../../i18n";

const STATUSES = ["Created", "Picking", "Invoiced", "Shipped", "Delivered", "Cancelled", "UnSupplied", "Returned", "UnDelivered"] as const;
const PAGE_SIZE = 50;
const OPS = ["getShipmentPackages", "updatePackage", "cancelOrderPackageItem", "updateBoxInfo", "processAlternativeDelivery", "sendInvoiceLink", "createCommonLabel", "getCommonLabel"];

export default function OrdersView() {
  return <ViewGate><OrdersBody /></ViewGate>;
}

function OrdersBody() {
  const { t } = useT();
  const { ops } = useOps(OPS);
  const base = useTyWrite();
  // after a successful write the window end moves to "now", so the package we just changed (new lastModifiedDate) stays in the list
  const w = useMemo(() => ({ ...base, exec: (async (...a: Parameters<typeof base.exec>) => { const r = await base.exec(...a); if (r?.ok) setRange((x) => ({ ...x, end: Date.now() })); return r; }) as typeof base.exec }), [base]); // eslint-disable-line react-hooks/exhaustive-deps
  const [range, setRange] = useState<Range>(() => presetRange("d7"));
  const [statuses, setStatuses] = useState<string[]>([]);
  const [draft, setDraft] = useState(""); const [orderNo, setOrderNo] = useState("");
  const [page, setPage] = useState(0);
  const [openId, setOpenId] = useState<number | null>(null);
  const valid = rangeValid(range, 14);

  const query = { startDate: range.start, endDate: range.end, page, size: PAGE_SIZE, ...(statuses.length ? { status: statuses } : {}), ...(orderNo ? { orderNumber: orderNo } : {}) };
  const q = useTyQuery(w.call.run, ops.getShipmentPackages, { query }, { enabled: valid });
  const data = useMemo(() => paged(q.data?.response.body), [q.data]);
  const rows = data.content;
  const lastPkg = useRef<Record<string, unknown> | null>(null);
  const found = rows.find((r) => num(r.shipmentPackageId) === openId) ?? null;
  if (found) lastPkg.current = found;
  const pkg = openId === null ? null : found ?? (lastPkg.current && num(lastPkg.current.shipmentPackageId) === openId ? lastPkg.current : null);

  const kpi = useMemo(() => {
    const by: Record<string, number> = {}; const top = new Map<string, number>(); let gross = 0;
    for (const p of rows) {
      const s = str(p.status); by[s] = (by[s] ?? 0) + 1;
      if (!["Cancelled", "UnSupplied", "Returned"].includes(s)) gross += num(p.packageTotalPrice);
      for (const l of arr(p.lines)) top.set(str(l.productName), (top.get(str(l.productName)) ?? 0) + num(l.quantity));
    }
    return { by, gross, top: [...top.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3) };
  }, [rows]);

  const toggle = (s: string) => { setPage(0); setStatuses((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s])); };
  const summary = (p: Record<string, unknown>) => { const l = arr(p.lines); return l.length ? `${str(l[0]!.productName)} ×${num(l[0]!.quantity)}${l.length > 1 ? ` +${l.length - 1}` : ""}` : "-"; };

  return (
    <div className="space-y-5">
      <Card title={t("trendyolviews.orders.filters")} actions={<Button size="sm" variant="secondary" loading={q.isFetching} onClick={() => void q.refetch()}><RefreshCw size={13} />{t("trendyolviews.common.refresh")}</Button>}>
        <div className="space-y-4">
          <RangeFields idPrefix="tyo" range={range} maxDays={14} presets={["today", "d3", "d7", "d14"]} onChange={(r) => { setPage(0); setRange(r); }} />
          <fieldset className="space-y-1.5">
            <legend className="text-[13px] font-medium">{t("trendyolviews.orders.statusFilter")}</legend>
            <div className="flex flex-wrap gap-2">
              {STATUSES.map((s) => (
                <button key={s} type="button" aria-pressed={statuses.includes(s)} onClick={() => toggle(s)}
                  className={cx("rounded-full border px-3 py-1 text-xs font-medium transition", statuses.includes(s) ? "border-brand-600 bg-brand-50 text-brand-ink" : "border-line bg-surface text-muted hover:text-ink")}>
                  <StatusLabel value={s} />
                </button>
              ))}
            </div>
            <p className="text-xs text-muted">{t("trendyolviews.orders.statusFilter.hint")}</p>
          </fieldset>
          <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); setPage(0); setOrderNo(draft.trim()); }} role="search">
            <div className="min-w-56 flex-1"><TextField label={t("trendyolviews.orders.search")} hint={t("trendyolviews.orders.search.hint")} help="trendyolviews.orderSearch" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="10751234500" inputMode="numeric" /></div>
            <Button type="submit" variant="secondary"><Search size={14} />{t("trendyolviews.common.search")}</Button>
            {orderNo && <Button variant="ghost" onClick={() => { setDraft(""); setOrderNo(""); }}>{t("trendyolviews.common.clear")}</Button>}
          </form>
        </div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label={t("trendyolviews.orders.kpi")}>
        <Stat label={t("trendyolviews.orders.kpi.count")} value={q.isPending ? "…" : data.totalElements} hint={t("trendyolviews.orders.kpi.loaded", { n: rows.length })} />
        <Stat label={t("trendyolviews.orders.kpi.revenue")} value={q.isPending ? "…" : tryMoney(kpi.gross)} hint={t("trendyolviews.orders.kpi.revenueHint")} />
        <div className="rounded-xl border border-line bg-surface p-4 shadow-soft"><p className="text-xs font-medium text-muted">{t("trendyolviews.orders.kpi.byStatus")}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">{Object.entries(kpi.by).map(([s, n]) => <span key={s} className="inline-flex items-center gap-1 text-xs"><StatusBadge group="order" value={s} /><b className="tabular-nums">{n}</b></span>)}{Object.keys(kpi.by).length === 0 && <span className="text-xs text-muted">-</span>}</div></div>
        <div className="rounded-xl border border-line bg-surface p-4 shadow-soft"><p className="text-xs font-medium text-muted">{t("trendyolviews.orders.kpi.top")}</p>
          <ol className="mt-1.5 space-y-0.5 text-sm">{kpi.top.map(([n, c]) => <li key={n} className="flex justify-between gap-2"><span className="truncate">{n}</span><b className="tabular-nums">×{c}</b></li>)}{kpi.top.length === 0 && <li className="text-xs text-muted">-</li>}</ol></div>
      </div>
      <p className="text-xs text-muted">{t("trendyolviews.orders.kpi.note")}</p>

      <Card>
        {!valid ? <EmptyState title={t("trendyolviews.orders.invalidRange.title")} description={t("trendyolviews.orders.invalidRange.body")} />
          : q.isPending ? <TableSkeleton />
          : q.error ? <TyErrorBox error={q.error} retry={() => void q.refetch()} />
          : rows.length === 0 ? <EmptyState title={t("trendyolviews.orders.empty.title")} description={t("trendyolviews.orders.empty.body")} action={<Button variant="secondary" onClick={() => { setStatuses([]); setOrderNo(""); setDraft(""); setRange(presetRange("d14")); }}>{t("trendyolviews.orders.empty.action")}</Button>} />
          : <>
            <Table caption={t("trendyolviews.orders.title")} head={[t("trendyolviews.orders.col.order"), t("trendyolviews.orders.col.date"), t("trendyolviews.orders.col.customer"), t("trendyolviews.orders.col.items"), t("trendyolviews.orders.col.total"), t("trendyolviews.orders.col.status"), t("trendyolviews.orders.cargo")]}>
              {rows.map((p) => {
                const id = num(p.shipmentPackageId);
                return (
                  <tr key={id} className="cursor-pointer" onClick={() => setOpenId(id)}>
                    <Td><button type="button" className="font-mono text-[13px] font-medium text-brand-ink underline-offset-2 hover:underline focus-visible:underline" onClick={(e) => { e.stopPropagation(); setOpenId(id); }} aria-label={t("trendyolviews.orders.open", { no: str(p.orderNumber) })}>{str(p.orderNumber)}</button></Td>
                    <Td className="whitespace-nowrap text-muted">{tsDate(p.orderDate)}</Td>
                    <Td>{[p.customerFirstName, p.customerLastName].filter(Boolean).join(" ")}</Td>
                    <Td className="max-w-64 truncate" >{summary(p)}</Td>
                    <Td className="whitespace-nowrap text-right tabular-nums">{tryMoney(p.packageTotalPrice)}</Td>
                    <Td><StatusBadge group="order" value={str(p.status)} /></Td>
                    <Td><span className="block text-xs">{str(p.cargoProviderName)}</span><span className="font-mono text-[11px] text-muted">{str(p.cargoTrackingNumber)}</span></Td>
                  </tr>
                );
              })}
            </Table>
            <TyPager data={data} onPage={setPage} />
          </>}
      </Card>
      {w.call.confirmNode}
      <OrderDrawer pkg={pkg} ops={ops} w={w} onClose={() => setOpenId(null)} />
    </div>
  );
}

function StatusLabel({ value }: { value: string }) {
  const { td } = useT();
  const k = `trendyolviews.status.order.${value}`; const l = td(k);
  return <>{l === k ? value : l}</>;
}

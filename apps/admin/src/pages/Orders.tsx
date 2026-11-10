import { useEffect, useState } from "react";
import { ClipboardList, Eye, Printer, SlidersHorizontal } from "lucide-react";
import { MAX_PRINT_IDS, openPrint } from "../lib/print";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ORDER_SOURCES, ORDER_TRANSITIONS } from "@openshelf/shared";
import { api, qs } from "../lib/api";
import { dateTime, enumLabel, money } from "../lib/format";
import { useT } from "../i18n";
import type { Paged, OrderRow } from "../lib/types";
import { mapPaged, orderRowFromApi } from "../lib/adapt";
import { Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, Loading, Modal, PageHeader, Pagination, SelectField, statusTone, Table, Td, TextField, useDebounced, useToast } from "../components/ui";
import { MANUAL_STATUSES, OrderQuickView } from "../components/OrderQuickView";
import { describeOrderError } from "../lib/orderErrors";
import { runBulk, type BulkResult } from "../lib/bulk";

/** Tabs group the order statuses into the stages a shop owner actually works through. */
const TABS = [
  { key: "all", statuses: [] as string[] },
  { key: "awaiting", statuses: ["pending", "awaiting_payment"] },
  { key: "prepare", statuses: ["paid", "fulfilling"] },
  { key: "shipped", statuses: ["shipped"] },
  { key: "delivered", statuses: ["delivered"] },
  { key: "closed", statuses: ["cancelled", "refunded"] },
] as const;
const PAYMENT = ["succeeded", "pending", "failed", "refunded"] as const;
const SHIPMENT = ["created", "in_transit", "delivered", "returned", "cancelled"] as const;
const INVOICE = ["draft", "issuing", "issued", "failed", "cancelled"] as const;
/** Filters that narrow the list (everything except tab and page). */
const FILTER_KEYS = ["source", "payment", "shipping", "invoice", "from", "to", "min", "max"] as const;
const toMinor = (v: string) => (v.trim() === "" || Number.isNaN(Number(v)) ? undefined : Math.round(Number(v) * 100));

/** Needs-attention hints: orders that are paid but have no shipment / invoice yet. */
const READY_TO_SHIP = new Set(["paid", "fulfilling"]);
const PAID_ON = new Set(["paid", "fulfilling", "shipped", "delivered"]);

function Dash() { return <span className="text-faint">-</span>; }

export default function Orders() {
  const { t } = useT();
  const [sp, setSp] = useSearchParams();
  const [q, setQ] = useState(sp.get("q") ?? "");
  const dq = useDebounced(q);
  const get = (k: string) => sp.get(k) ?? "";
  const tabKey = TABS.some((x) => x.key === get("tab")) ? get("tab") : "all";
  const tab = TABS.find((x) => x.key === tabKey)!;
  const page = Number(sp.get("page") ?? 1);
  const activeFilters = FILTER_KEYS.filter((k) => get(k)).length;
  const [more, setMore] = useState(() => (["from", "to", "min", "max"] as const).some((k) => !!sp.get(k)));

  const filterParams = { q: dq, source: get("source"), payment: get("payment"), shipping: get("shipping"), invoice: get("invoice"), from: get("from"), to: get("to"), minTotal: toMinor(get("min")), maxTotal: toMinor(get("max")) };
  const list = useQuery({
    queryKey: ["orders", filterParams, tabKey, page],
    queryFn: async () => mapPaged(await api.get<Paged<unknown>>(`/api/admin/orders${qs({ ...filterParams, status: tab.statuses.join(","), page, pageSize: 25 })}`), orderRowFromApi),
  });
  const counts = useQuery({
    queryKey: ["orders", "counts", filterParams],
    queryFn: () => api.get<{ byStatus: Record<string, number>; total: number }>(`/api/admin/orders/counts${qs(filterParams)}`),
  });
  const countOf = (statuses: readonly string[]): number | undefined => { const c = counts.data; if (!c?.byStatus) return undefined; return statuses.length ? statuses.reduce((n, s) => n + (c.byStatus[s] ?? 0), 0) : c.total; };

  const [sel, setSel] = useState<Set<string>>(new Set());
  useEffect(() => setSel(new Set()), [dq, tabKey, page, sp.toString()]);
  const rows: OrderRow[] = list.data?.items ?? [];
  const allOn = rows.length > 0 && rows.every((o) => sel.has(o.id));
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const ids = [...sel].slice(0, MAX_PRINT_IDS);
  const [quick, setQuick] = useState<string | null>(null);

  // ---- bulk actions (client-side fan-out over the per-order endpoints; each order is validated server-side)
  const qc = useQueryClient(); const toast = useToast();
  const picked = rows.filter((o) => sel.has(o.id));
  const shipEligible = picked.filter((o) => o.source === "website" && READY_TO_SHIP.has(o.status) && o.shipment === null);
  const invoiceEligible = picked.filter((o) => o.source === "website" && PAID_ON.has(o.status) && o.invoice === null);
  const statusTargets = MANUAL_STATUSES.filter((s) => picked.some((o) => (ORDER_TRANSITIONS[o.status] ?? []).includes(s)));
  const [bulk, setBulk] = useState<null | { kind: "status"; status: string } | { kind: "ship"; serviceId: string } | { kind: "invoice" }>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<BulkResult | null>(null);
  const numberOf = (id: string) => rows.find((o) => o.id === id)?.number ?? id;
  const execBulk = async () => {
    if (!bulk) return;
    const spec = bulk; let targets: typeof picked; let fn: (id: string) => Promise<unknown>;
    if (spec.kind === "status") { targets = picked.filter((o) => (ORDER_TRANSITIONS[o.status] ?? []).includes(spec.status as never)); fn = (id) => api.post(`/api/admin/orders/${id}/status`, { status: spec.status }); }
    else if (spec.kind === "ship") { targets = shipEligible; fn = (id) => api.post(`/api/admin/orders/${id}/shipment`, { serviceId: spec.serviceId.trim() }); }
    else { targets = invoiceEligible; fn = (id) => api.post(`/api/admin/orders/${id}/invoice`); }
    setProgress({ done: 0, total: targets.length });
    const res = await runBulk(targets.map((o) => o.id), fn, (e) => describeOrderError(e).message, (done, total) => setProgress({ done, total }));
    setProgress(null); setBulk(null);
    qc.invalidateQueries({ queryKey: ["orders"] }); for (const id of res.ok) qc.invalidateQueries({ queryKey: ["order", id] });
    if (res.failed.length === 0) { toast.success(t("orders.bulk.result.ok", { n: res.ok.length })); setSel(new Set()); } else { setResult(res); }
  };
  const bulkEligible = !bulk ? 0 : bulk.kind === "status" ? picked.filter((o) => (ORDER_TRANSITIONS[o.status] ?? []).includes(bulk.status as never)).length : bulk.kind === "ship" ? shipEligible.length : invoiceEligible.length;
  const upd = (k: string, v: string) => setSp((p) => { const n = new URLSearchParams(p); v ? n.set(k, v) : n.delete(k); if (k !== "page") n.delete("page"); return n; }, { replace: k === "q" });
  const clear = () => { setQ(""); setSp((p) => { const n = new URLSearchParams(); const tb = p.get("tab"); if (tb) n.set("tab", tb); return n; }); };
  const procSelect = (key: string, label: string, values: readonly string[], group: string) => (
    <SelectField label={label} value={get(key)} onChange={(e) => upd(key, e.target.value)}>
      <option value="">{t("common.all")}</option><option value="none">{t("orders.filter.none")}</option>
      {values.map((s) => <option key={s} value={s}>{enumLabel(group, s)}</option>)}
    </SelectField>
  );

  return (
    <>
      <PageHeader title={t("orders.title")} description={t("orders.description")} guide="orders#siparis-durumlari" />
      <Card>
        <div role="tablist" aria-label={t("orders.tabs.label")} className="-mx-1 mb-5 flex gap-1 overflow-x-auto border-b border-line pb-px">
          {TABS.map((x) => {
            const on = x.key === tabKey; const n = countOf(x.statuses);
            return (
              <button key={x.key} role="tab" type="button" aria-selected={on} onClick={() => upd("tab", x.key === "all" ? "" : x.key)}
                className={`-mb-px inline-flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors ${on ? "border-brand-600 text-brand-ink" : "border-transparent text-muted hover:text-ink"}`}>
                {t(`orders.tab.${x.key}`)}
                {n !== undefined && <span className={`rounded-full px-2 py-px text-xs tabular-nums ${on ? "bg-brand-600/10 text-brand-ink" : "bg-hover text-muted"}`}>{n}</span>}
              </button>
            );
          })}
        </div>
        <div className="mb-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <div className="sm:col-span-2 xl:col-span-2">
            <TextField label={t("common.search")} type="search" placeholder={t("orders.filter.searchPlaceholder")} hint={t("orders.filter.search.hint")} help="orders.search" value={q} onChange={(e) => { setQ(e.target.value); upd("q", e.target.value); }} />
          </div>
          <SelectField label={t("orders.filter.source")} help="orders.source" value={get("source")} onChange={(e) => upd("source", e.target.value)}><option value="">{t("common.all")}</option>{ORDER_SOURCES.map((s) => <option key={s} value={s}>{enumLabel("source", s)}</option>)}</SelectField>
          {procSelect("payment", t("orders.filter.payment"), PAYMENT, "payment")}
          {procSelect("shipping", t("orders.filter.shipping"), SHIPMENT, "shipment")}
          {procSelect("invoice", t("orders.filter.invoice"), INVOICE, "invoice")}
        </div>
        {more && (
          <div className="mb-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <TextField label={t("orders.filter.from")} type="date" value={get("from")} max={get("to") || undefined} onChange={(e) => upd("from", e.target.value)} />
            <TextField label={t("orders.filter.to")} type="date" value={get("to")} min={get("from") || undefined} onChange={(e) => upd("to", e.target.value)} />
            <TextField label={t("orders.filter.minTotal")} type="number" inputMode="decimal" min={0} value={get("min")} onChange={(e) => upd("min", e.target.value)} />
            <TextField label={t("orders.filter.maxTotal")} type="number" inputMode="decimal" min={0} value={get("max")} onChange={(e) => upd("max", e.target.value)} />
          </div>
        )}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Button size="sm" variant="ghost" aria-expanded={more} onClick={() => setMore((m) => !m)}><SlidersHorizontal size={14} />{more ? t("orders.filter.less") : t("orders.filter.more")}</Button>
          {(activeFilters > 0 || dq) && <>
            <span className="text-xs text-muted">{t("orders.filter.active", { n: activeFilters + (dq ? 1 : 0) })}</span>
            <Button size="sm" variant="ghost" onClick={clear}>{t("orders.filter.clear")}</Button>
          </>}
        </div>
        {list.isPending ? <Loading /> : list.isError ? <ErrorState error={list.error} retry={() => list.refetch()} /> :
          list.data.items.length === 0 ? <EmptyState icon={<ClipboardList size={22} />} title={t("orders.empty.title")} description={t("orders.empty.body")} /> : (
            <>
              <Table minWidth="78rem" head={[<input key="all" type="checkbox" aria-label={t("orders.col.selectAll")} className="size-4 accent-[var(--color-brand-600)]" checked={allOn} onChange={() => setSel(allOn ? new Set() : new Set(rows.map((o) => o.id)))} />, t("orders.col.order"), t("orders.col.customer"), t("orders.col.items"), t("orders.col.payment"), t("orders.col.shipping"), t("orders.col.invoice"), t("orders.col.status"), <span key="t" className="block text-right">{t("orders.col.total")}</span>]} caption={t("orders.table.caption")}>{rows.map((o) => {
                const needsShip = READY_TO_SHIP.has(o.status) && o.shipment === null && o.source === "website";
                const needsInvoice = PAID_ON.has(o.status) && o.invoice === null && o.source === "website";
                const where = [o.district, o.city].filter(Boolean).join(", ");
                return (
                  <tr key={o.id} className="cursor-pointer" onClick={(e) => { if (!(e.target as HTMLElement).closest("a,button,input,select,label")) setQuick(o.id); }}>
                    <Td className="w-10"><input type="checkbox" aria-label={t("orders.selectOne", { number: o.number })} className="size-4 accent-[var(--color-brand-600)]" checked={sel.has(o.id)} onChange={() => toggle(o.id)} /></Td>
                    <Td className="whitespace-nowrap">
                      <Link className="font-medium text-brand-ink hover:underline" to={`/orders/${o.id}`}>#{o.number}</Link>
                      <button type="button" aria-label={t("orders.quick.open", { number: o.number })} title={t("orders.quick.open", { number: o.number })} onClick={() => setQuick(o.id)} className="ml-1.5 inline-grid size-6 place-items-center rounded-md align-middle text-faint transition hover:bg-hover hover:text-ink"><Eye size={14} /></button>{o.isMock && <span className="ml-2"><Badge tone="danger">{t("orders.mockBadge")}</Badge></span>}
                      <span className="mt-0.5 block text-xs text-muted">{dateTime(o.createdAt)} · {enumLabel("source", o.source)}</span>
                    </Td>
                    <Td>
                      <span className="block font-medium">{o.customerName ?? o.email ?? "-"}</span>
                      {o.customerName && o.email && <span className="block text-xs text-muted">{o.email}</span>}
                      {where && <span className="block text-xs text-muted">{where}</span>}
                    </Td>
                    <Td className="max-w-[16rem]">
                      {o.lines && o.lines.length > 0 ? <>
                        {o.lines.map((l, i) => <span key={i} className="block truncate text-[13px]" title={l.sku ? `${l.name} (${l.sku})` : l.name}><span className="tabular-nums text-muted">{l.quantity}×</span> {l.name}</span>)}
                        {(o.lineCount ?? 0) > o.lines.length && <span className="block text-xs text-muted">{t("orders.items.more", { n: (o.lineCount ?? 0) - o.lines.length })}</span>}
                      </> : <Dash />}
                    </Td>
                    <Td>{o.payment ? <><Badge tone={statusTone(o.payment.status)}>{enumLabel("payment", o.payment.status)}</Badge><span className="mt-0.5 block text-xs text-muted">{enumLabel("provider", o.payment.provider)}</span></> : <span className="text-xs text-muted">{t("orders.cell.noPayment")}</span>}</Td>
                    <Td>
                      {o.shipment ? <>
                        <Badge tone={statusTone(o.shipment.status)}>{enumLabel("shipment", o.shipment.status)}</Badge>
                        {(o.shipment.carrier || o.shipment.trackingNumber) && <span className="mt-0.5 block text-xs text-muted">
                          {o.shipment.carrier}{o.shipment.carrier && o.shipment.trackingNumber ? " · " : ""}
                          {o.shipment.trackingNumber && (o.shipment.trackingUrl ? <a className="text-brand-ink hover:underline" href={o.shipment.trackingUrl} target="_blank" rel="noopener noreferrer" aria-label={`${t("orders.cell.track")} ${o.shipment.trackingNumber}`}>{o.shipment.trackingNumber}</a> : <span className="tabular-nums">{o.shipment.trackingNumber}</span>)}
                        </span>}
                      </> : needsShip ? <Badge tone="warning">{t("orders.attn.ship")}</Badge> : <span className="text-xs text-muted">{t("orders.cell.noShipment")}</span>}
                    </Td>
                    <Td>
                      {o.invoice ? <>
                        <Badge tone={statusTone(o.invoice.status)}>{enumLabel("invoice", o.invoice.status)}</Badge>
                        {o.invoice.number && <span className="mt-0.5 block text-xs tabular-nums text-muted">{o.invoice.number}</span>}
                      </> : needsInvoice ? <Badge tone="warning">{t("orders.attn.invoice")}</Badge> : <span className="text-xs text-muted">{t("orders.cell.noInvoice")}</span>}
                    </Td>
                    <Td><Badge tone={statusTone(o.status)}>{enumLabel("status", o.status)}</Badge></Td>
                    <Td className="whitespace-nowrap text-right font-medium tabular-nums">{money(o.total, o.currency)}
                      {(o.itemCount ?? 0) > 0 && <span className="block text-xs font-normal text-muted">{t("orders.items.qty", { n: o.itemCount ?? 0 })}</span>}
                    </Td>
                  </tr>
                );
              })}</Table>
              <Pagination page={list.data.page} pageSize={list.data.pageSize} total={list.data.total} onPage={(n) => upd("page", String(n))} />
            </>
          )}
      </Card>
      {sel.size > 0 && (
        <div role="region" aria-label={t("orders.bulk.label")} className="sticky bottom-4 z-20 mx-auto mt-4 flex w-fit max-w-full flex-wrap items-center gap-2 rounded-xl border border-line bg-raised px-4 py-2.5 shadow-lift">
          <span className="text-sm font-medium">{sel.size > MAX_PRINT_IDS ? t("orders.bulk.selectedCapped", { n: sel.size, max: MAX_PRINT_IDS }) : t("orders.bulk.selected", { n: sel.size })}</span>
          <Button size="sm" variant="secondary" onClick={() => openPrint("label", ids)}><Printer size={14} />{t("orders.bulk.printLabels", { n: ids.length })}</Button>
          <Button size="sm" variant="secondary" onClick={() => openPrint("packing", ids)}>{t("orders.bulk.packing", { n: ids.length })}</Button>
          <Button size="sm" variant="secondary" onClick={() => openPrint("invoice", ids)}>{t("orders.bulk.invoices", { n: ids.length })}</Button>
          <span aria-hidden className="mx-1 h-5 w-px bg-line" />
          <label className="sr-only" htmlFor="bulk-status">{t("orders.bulk.status")}</label>
          <select id="bulk-status" className="h-8 rounded-lg border border-line bg-surface px-2 text-[13px] disabled:opacity-50" value="" disabled={statusTargets.length === 0} onChange={(e) => e.target.value && setBulk({ kind: "status", status: e.target.value })}>
            <option value="">{t("orders.bulk.status")}</option>{statusTargets.map((s) => <option key={s} value={s}>{enumLabel("status", s)}</option>)}
          </select>
          <Button size="sm" variant="secondary" disabled={shipEligible.length === 0} onClick={() => setBulk({ kind: "ship", serviceId: "" })}>{t("orders.bulk.ship", { n: shipEligible.length })}</Button>
          <Button size="sm" variant="secondary" disabled={invoiceEligible.length === 0} onClick={() => setBulk({ kind: "invoice" })}>{t("orders.bulk.issueInvoice", { n: invoiceEligible.length })}</Button>
          <Button size="sm" variant="ghost" onClick={() => setSel(new Set())}>{t("common.clear")}</Button>
          <span className="basis-full text-xs text-muted">{t("orders.bulk.hint", { max: MAX_PRINT_IDS })}</span>
        </div>
      )}
      <OrderQuickView id={quick} onClose={() => setQuick(null)} />
      <ConfirmDialog open={bulk?.kind === "status" || bulk?.kind === "invoice"} loading={!!progress}
        title={bulk?.kind === "invoice" ? t("orders.bulk.invoice.title") : t("orders.bulk.status.title")}
        confirmLabel={progress ? t("orders.bulk.running", progress) : t("orders.bulk.apply", { n: bulkEligible })}
        danger={bulk?.kind === "status" && bulk.status === "cancelled"}
        message={bulk ? `${bulk.kind === "status" ? t("orders.bulk.status.body", { n: bulkEligible, status: enumLabel("status", bulk.status) }) : t("orders.bulk.invoice.body", { n: bulkEligible })} ${bulkEligible < sel.size ? t("orders.bulk.skipped", { n: sel.size - bulkEligible }) : ""}`.trim() : ""}
        onConfirm={() => void execBulk()} onClose={() => !progress && setBulk(null)} />
      <Modal open={bulk?.kind === "ship"} onClose={() => !progress && setBulk(null)} title={t("orders.bulk.ship.title")}
        footer={<><Button variant="ghost" disabled={!!progress} onClick={() => setBulk(null)}>{t("common.cancel")}</Button><Button loading={!!progress} disabled={bulk?.kind !== "ship" || !bulk.serviceId.trim()} onClick={() => void execBulk()}>{progress ? t("orders.bulk.running", progress) : t("orders.bulk.apply", { n: bulkEligible })}</Button></>}>
        {bulk?.kind === "ship" && <div className="space-y-3">
          <TextField label={t("orders.ship.serviceId")} help="orders.shipService" hint={t("orders.ship.serviceId.hint")} value={bulk.serviceId} onChange={(e) => setBulk({ kind: "ship", serviceId: e.target.value })} />
          <p className="text-sm text-muted">{t("orders.bulk.ship.body", { n: bulkEligible })} {bulkEligible < sel.size ? t("orders.bulk.skipped", { n: sel.size - bulkEligible }) : ""}</p>
          <p className="text-sm text-muted">{t("orders.ship.consequences")}</p>
        </div>}
      </Modal>
      <Modal open={!!result} onClose={() => { setResult(null); setSel(new Set()); }} title={t("orders.bulk.result.title")} wide
        footer={<Button onClick={() => { setResult(null); setSel(new Set()); }}>{t("common.close")}</Button>}>
        {result && <div className="space-y-3 text-sm">
          <p>{t("orders.bulk.result.partial", { ok: result.ok.length, failed: result.failed.length })}</p>
          <ul className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-line p-3">{result.failed.map((f) => <li key={f.id}><span className="font-medium">#{numberOf(f.id)}</span> <span className="text-danger">{f.message}</span></li>)}</ul>
        </div>}
      </Modal>
    </>
  );
}

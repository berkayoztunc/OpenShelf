import { useState } from "react";
import { Plus, RefreshCw, Truck } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, errMsg, qs } from "../lib/api";
import { dateTime, enumLabel } from "../lib/format";
import { useT } from "../i18n";
import type { Paged } from "../lib/types";
import { useAdmin } from "../lib/auth";
import { MANUAL_SHIPMENT_STATUSES, recipientName, shipmentTone, type ManualShipment } from "../lib/manualShipments";
import { Badge, Button, Card, ConfirmDialog, cx, Drawer, EmptyState, ErrorState, Loading, PageHeader, Pagination, Skeleton, Table, Td, TextField, useDebounced, useToast } from "../components/ui";

/** Shipments sent without an order (gifts, extra items). The drawer shows one shipment; `?open=<id>` opens it directly. */
export default function Shipments() {
  const { t } = useT();
  const [sp, setSp] = useSearchParams();
  const [q, setQ] = useState(sp.get("q") ?? ""); const dq = useDebounced(q);
  const status = sp.get("status") ?? ""; const page = Number(sp.get("page") ?? 1); const open = sp.get("open");
  const canBuy = useAdmin()?.role !== "staff";
  const list = useQuery({ queryKey: ["manual-shipments", dq, status, page], queryFn: () => api.get<Paged<ManualShipment>>(`/api/admin/manual-shipments${qs({ q: dq, status, page, pageSize: 20 })}`) });
  const upd = (k: string, v: string) => setSp((p) => { const n = new URLSearchParams(p); v ? n.set(k, v) : n.delete(k); if (k !== "page" && k !== "open") n.delete("page"); return n; });
  const chip = (value: string, text: string) => (
    <button key={value} type="button" aria-pressed={status === value} onClick={() => upd("status", value)}
      className={cx("rounded-full border px-3 py-1 text-[13px] font-medium transition", status === value ? "border-brand-600 bg-brand-50 text-brand-ink" : "border-line text-muted hover:border-line-strong hover:text-ink")}>{text}</button>
  );
  return (
    <>
      <PageHeader title={t("shipments.title")} description={t("shipments.description")}
        actions={canBuy ? <Link to="/shipments/new"><Button><Plus size={16} />{t("shipments.new")}</Button></Link> : undefined} />
      <Card>
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div role="group" aria-label={t("shipments.filterByStatus")} className="flex flex-wrap items-center gap-2">{chip("", t("common.all"))}{MANUAL_SHIPMENT_STATUSES.map((s) => chip(s, enumLabel("shipment", s)))}</div>
          <div className="w-full sm:w-72"><TextField label={t("common.search")} type="search" placeholder={t("shipments.searchPlaceholder")} value={q} onChange={(e) => { setQ(e.target.value); upd("q", e.target.value); }} /></div>
        </div>
        {list.isPending ? <Loading /> : list.isError ? <ErrorState error={list.error} retry={() => list.refetch()} /> :
          list.data.items.length === 0 ? <EmptyState icon={<Truck size={22} />} title={t("shipments.empty.title")} description={t("shipments.empty.body")}
            action={canBuy ? <Link to="/shipments/new"><Button>{t("shipments.new")}</Button></Link> : undefined} /> : (
            <>
              <Table head={[t("shipments.col.created"), t("shipments.col.reference"), t("shipments.col.recipient"), t("shipments.col.contents"), t("shipments.col.carrier"), t("shipments.col.status")]} caption={t("shipments.title")}>{list.data.items.map((s) => (
                <tr key={s.id}>
                  <Td>{dateTime(s.createdAt)}</Td>
                  <Td><button type="button" className="font-medium text-brand-ink hover:underline" onClick={() => upd("open", s.id)}>{s.reference}</button></Td>
                  <Td>{recipientName(s.recipient)}<span className="block text-xs text-muted">{[s.recipient.district, s.recipient.city].filter(Boolean).join(" / ")}</span></Td>
                  <Td className="max-w-56 truncate">{s.contents}</Td>
                  <Td>{s.carrier ?? "-"}{s.trackingNumber && <span className="block text-xs text-muted">{s.trackingNumber}</span>}</Td>
                  <Td><Badge tone={shipmentTone(s.status)}>{enumLabel("shipment", s.status)}</Badge></Td>
                </tr>
              ))}</Table>
              <Pagination page={list.data.page} pageSize={list.data.pageSize} total={list.data.total} onPage={(n) => upd("page", String(n))} />
            </>
          )}
      </Card>
      {open && <ShipmentDrawer id={open} canCancel={canBuy} onClose={() => upd("open", "")} />}
    </>
  );
}

function ShipmentDrawer({ id, canCancel, onClose }: { id: string; canCancel: boolean; onClose: () => void }) {
  const { t } = useT(); const qc = useQueryClient(); const toast = useToast();
  const [ask, setAsk] = useState(false);
  const one = useQuery({ queryKey: ["manual-shipment", id], queryFn: () => api.get<ManualShipment>(`/api/admin/manual-shipments/${id}`) });
  const after = (msg: string) => () => { void qc.invalidateQueries({ queryKey: ["manual-shipments"] }); void qc.invalidateQueries({ queryKey: ["manual-shipment", id] }); toast.success(msg); };
  const refresh = useMutation({ mutationFn: () => api.post(`/api/admin/manual-shipments/${id}/refresh`), onSuccess: after(t("shipments.toast.refreshed")), onError: (e) => toast.error(errMsg(e)) });
  const cancel = useMutation({ mutationFn: () => api.post(`/api/admin/manual-shipments/${id}/cancel`), onSuccess: () => { setAsk(false); after(t("shipments.toast.cancelled"))(); }, onError: (e) => { setAsk(false); toast.error(errMsg(e)); } });
  const s = one.data;
  const row = (k: string, v: React.ReactNode) => <div className="flex justify-between gap-4 py-1.5 text-sm"><dt className="text-muted">{k}</dt><dd className="text-right">{v}</dd></div>;
  return (
    <Drawer open onClose={onClose} title={s?.reference ?? t("shipments.title")} subtitle={s ? <Badge tone={shipmentTone(s.status)}>{enumLabel("shipment", s.status)}</Badge> : undefined}
      footer={s && <div className="flex flex-wrap justify-end gap-2">
        {canCancel && s.status === "created" && <Button variant="ghost" onClick={() => setAsk(true)}>{t("shipments.cancel")}</Button>}
        {!["delivered", "returned", "cancelled"].includes(s.status) && <Button variant="secondary" loading={refresh.isPending} onClick={() => refresh.mutate()}><RefreshCw size={15} />{t("shipments.refresh")}</Button>}
        {s.labelUrl && <a href={s.labelUrl} target="_blank" rel="noopener noreferrer"><Button>{t("shipments.label")}</Button></a>}
      </div>}>
      {one.isPending ? <Skeleton className="h-48" /> : one.isError ? <ErrorState error={one.error} retry={() => one.refetch()} /> : s && (
        <div className="space-y-5">
          <section>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">{t("shipments.recipient")}</h3>
            <address className="text-sm not-italic leading-relaxed">
              <span className="block font-medium">{recipientName(s.recipient)}</span>
              <span className="block text-muted">{s.recipient.phone}{s.recipient.email ? ` · ${s.recipient.email}` : ""}</span>
              <span className="block text-muted">{[s.recipient.line1, s.recipient.line2].filter(Boolean).join(" ")}</span>
              <span className="block text-muted">{[s.recipient.district, s.recipient.city].filter(Boolean).join(" / ")}{s.recipient.zip ? ` ${s.recipient.zip}` : ""}</span>
            </address>
            {s.orderId && <Link className="mt-1 inline-block text-xs text-brand-ink underline" to={`/orders/${s.orderId}`}>{t("shipments.fromOrder")}</Link>}
          </section>
          <dl className="divide-y divide-line">
            {row(t("shipments.contents"), s.contents)}
            {s.note && row(t("shipments.note"), s.note)}
            {row(t("shipments.weight"), `${s.weightKg} kg${s.desi ? ` · ${s.desi} desi` : ""}`)}
            {row(t("shipments.col.carrier"), `${s.carrier ?? "-"} · ${s.serviceId}`)}
            {row(t("shipments.tracking"), s.trackingNumber ? (s.trackingUrl ? <a className="text-brand-ink underline" href={s.trackingUrl} target="_blank" rel="noopener noreferrer">{s.trackingNumber}</a> : s.trackingNumber) : t("shipments.trackingPending"))}
            {row(t("shipments.col.created"), dateTime(s.createdAt))}
          </dl>
          {!!s.events?.length && <section>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">{t("shipments.events")}</h3>
            <ol className="space-y-1.5 text-sm">{s.events.map((e) => <li key={e.id} className="flex justify-between gap-3"><span><Badge tone={shipmentTone(e.status)}>{enumLabel("shipment", e.status)}</Badge> <span className="text-muted">{e.detail}</span></span><span className="shrink-0 text-xs text-muted">{dateTime(e.at)}</span></li>)}</ol>
          </section>}
        </div>
      )}
      <ConfirmDialog open={ask} title={t("shipments.cancel.title")} message={t("shipments.cancel.body", { ref: s?.reference ?? "" })} confirmLabel={t("shipments.cancel")} danger loading={cancel.isPending}
        onConfirm={() => cancel.mutate()} onClose={() => !cancel.isPending && setAsk(false)} />
    </Drawer>
  );
}

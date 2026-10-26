import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { FileText, Mail } from "lucide-react";
import { PrintMenu } from "../components/PrintMenu";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ORDER_TRANSITIONS } from "@openshelf/shared";
import { api } from "../lib/api";
import { describeOrderError } from "../lib/orderErrors";
import { useT } from "../i18n";
import { Term } from "../components/help/Term";
import { HelpTip } from "../components/help/HelpTip";
import { typeLabel } from "./Invoices";
import { dateTime, enumLabel, label, money, toMajor, toMinor } from "../lib/format";
import { orderDetailFromApi } from "../lib/adapt";
import { NotificationHistory } from "../components/NotificationHistory";
import { Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, Loading, Modal, PageHeader, statusTone, Table, Td, TextField, useToast } from "../components/ui";

export default function OrderDetail() {
  const { id } = useParams();
  const { t, td } = useT();
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ["order", id], queryFn: async () => orderDetailFromApi(await api.get<unknown>(`/api/admin/orders/${id}`)) });
  const [transition, setTransition] = useState<string | null>(null);
  const [refund, setRefund] = useState<{ amount: string; reason: string } | null>(null);
  const [ship, setShip] = useState<string | null>(null);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const done = (msg: string) => () => { qc.invalidateQueries({ queryKey: ["order", id] }); qc.invalidateQueries({ queryKey: ["orders"] }); toast.success(msg); };
  const fail = (e: unknown) => toast.error(describeOrderError(e).message);

  const status = useMutation({ mutationFn: (s: string) => api.post(`/api/admin/orders/${id}/status`, { status: s }), onSuccess: () => { setTransition(null); done(t("orders.toast.statusUpdated"))(); }, onError: fail });
  const doRefund = useMutation({ mutationFn: () => api.post(`/api/admin/orders/${id}/refund`, { amount: toMinor(refund!.amount), reason: refund!.reason }), onSuccess: () => { setRefund(null); done(t("orders.toast.refundRequested"))(); }, onError: fail });
  const doShip = useMutation({ mutationFn: () => api.post(`/api/admin/orders/${id}/shipment`, { serviceId: ship }), onSuccess: () => { setShip(null); done(t("orders.toast.shipmentCreated"))(); }, onError: fail });
  const invoice = useMutation({ mutationFn: () => api.post(`/api/admin/orders/${id}/invoice`), onSuccess: () => { setInvoiceOpen(false); done(t("orders.toast.invoiceQueued"))(); }, onError: (e) => { setInvoiceOpen(false); fail(e); } });

  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const o = q.data;
  const allNext = ORDER_TRANSITIONS[o.status] ?? [];
  // "Paid" and "Refunded" are set by the payment/refund flows (the API rejects manual changes), so they are not offered as buttons.
  const next = allNext.filter((s) => s !== "paid" && s !== "refunded");
  const canRefund = ["paid", "fulfilling", "shipped", "delivered"].includes(o.status);

  const eventText = (e: { type: string; detail?: string }) => {
    let d: Record<string, unknown> | null = null;
    if (e.detail?.startsWith("{")) { try { d = JSON.parse(e.detail) as Record<string, unknown>; } catch { d = null; } }
    if (e.type === "order.status" && d?.from && d?.to) return t("orders.event.status", { from: enumLabel("status", String(d.from)), to: enumLabel("status", String(d.to)) });
    if (e.type === "order.refund") return t(d?.full ? "orders.event.refundFull" : "orders.event.refund", { amount: money(Number(d?.amount ?? 0), o.currency) });
    if (e.type === "order.refund_failed") return t("orders.event.refundFailed");
    if (e.type === "order.shipment") return t("orders.event.shipment");
    if (e.type === "order.invoice") return t("orders.event.invoice");
    if (e.type.startsWith("payment.")) return t("orders.event.payment", { status: enumLabel("payment", e.type.slice(8)) });
    return `${label(e.type)}${e.detail && !e.detail.startsWith("{") ? `: ${e.detail}` : ""}`;
  };
  const timeline = [
    ...o.events.map((e) => ({ at: e.createdAt, text: eventText(e) })),
    ...o.payments.map((p) => ({ at: p.createdAt ?? "", text: t("orders.timeline.payment", { status: enumLabel("payment", p.status), provider: enumLabel("provider", p.provider), amount: money(p.amount, o.currency) }) })),
    ...o.shipments.map((s) => ({ at: s.createdAt ?? "", text: s.trackingNumber ? t("orders.timeline.shipmentTracking", { status: enumLabel("shipment", s.status), tracking: s.trackingNumber }) : t("orders.timeline.shipment", { status: enumLabel("shipment", s.status) }) })),
    ...o.invoices.map((i) => ({ at: i.createdAt ?? "", text: i.number ? t("orders.timeline.invoiceNumber", { type: typeLabel(i.type), status: enumLabel("invoice", i.status), number: i.number }) : t("orders.timeline.invoice", { type: typeLabel(i.type), status: enumLabel("invoice", i.status) }) })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  const mockPay = o.payments.some((p) => p.isMock);
  return (
    <>
      <PageHeader title={t("orders.detail.title", { number: o.number })} description={t("orders.detail.description", { date: dateTime(o.createdAt), customer: `${o.customerName ?? ""} ${o.email ?? ""}`.trim() || "-" })} guide="orders#siparis-detayi"
        actions={<><Link to="/orders"><Button variant="ghost">{t("common.back")}</Button></Link>
          {canRefund && <Button variant="secondary" title={t("orders.detail.refund.title")} onClick={() => setRefund({ amount: "", reason: "" })}>{t("orders.detail.refund")}</Button>}
          <Button variant="secondary" title={t("orders.detail.createShipment.title")} onClick={() => setShip("")}>{t("orders.detail.createShipment")}</Button>
          <Button variant="secondary" title={t("orders.detail.issueInvoice.title")} loading={invoice.isPending} onClick={() => setInvoiceOpen(true)}>{t("orders.detail.issueInvoice")}</Button>
          <Link to={`/invoices/new?orderId=${encodeURIComponent(o.id)}`} title={t("orders.detail.invoiceFromOrder.title")}><Button variant="secondary"><FileText size={15} />{t("orders.detail.invoiceFromOrder")}</Button></Link>
          <Link to={`/emails/compose?${new URLSearchParams({ ...(o.email ? { to: o.email } : {}), orderId: o.id, subject: t("orders.detail.emailSubject", { number: o.number }) })}`} title={t("orders.detail.emailCustomer.title")}><Button variant="secondary"><Mail size={15} />{t("orders.detail.emailCustomer")}</Button></Link>
          <PrintMenu orderId={o.id} /></>} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title={t("orders.detail.items")}>
            <Table head={[t("orders.detail.col.item"), t("orders.detail.col.qty"), t("orders.detail.col.unit"), t("orders.detail.col.total")]} caption={t("orders.detail.itemsCaption")}>{o.items.map((i) => (
              <tr key={i.id}><Td>{i.title}{i.sku && <span className="ml-2 text-xs text-muted">{i.sku}</span>}</Td><Td>{i.quantity}</Td><Td>{money(i.unitPrice, o.currency)}</Td><Td>{money(i.total, o.currency)}</Td></tr>
            ))}</Table>
            <p className="mt-3 text-right font-semibold">{t("orders.detail.totalLine", { total: money(o.total, o.currency) })}</p>
          </Card>
          <Card title={t("orders.detail.payments")}>{o.payments.length === 0 ? <EmptyState title={t("orders.detail.payments.empty")} description={t("orders.detail.payments.emptyBody")} /> : (
            <Table head={[t("orders.detail.col.provider"), t("orders.detail.col.status"), t("orders.detail.col.amount"), t("orders.detail.col.date")]}>{o.payments.map((p) => <tr key={p.id}><Td>{enumLabel("provider", p.provider)}{p.isMock && <span className="ml-2"><Badge tone="danger">{t("orders.mockBadge")}</Badge></span>}</Td><Td><Badge tone={statusTone(p.status)}>{enumLabel("payment", p.status)}</Badge></Td><Td>{money(p.amount, o.currency)}</Td><Td>{dateTime(p.createdAt)}</Td></tr>)}</Table>)}</Card>
          <Card title={t("orders.detail.shipments")}>{o.shipments.length === 0 ? <EmptyState title={t("orders.detail.shipments.empty")} description={t("orders.detail.shipments.emptyBody")} /> : (
            <Table head={[<Term key="c" id="carrier">{t("orders.detail.col.carrier")}</Term>, <Term key="t" id="trackingno">{t("orders.detail.col.tracking")}</Term>, t("orders.detail.col.status"), t("orders.detail.col.label")]}>{o.shipments.map((s) => <tr key={s.id}><Td>{s.carrier ?? "-"}</Td><Td>{s.trackingNumber ?? "-"}</Td><Td><Badge tone={statusTone(s.status)}>{enumLabel("shipment", s.status)}</Badge></Td><Td>{s.labelUrl ? <a className="text-brand-ink underline" href={s.labelUrl} target="_blank" rel="noopener noreferrer">{t("common.open")}</a> : "-"}</Td></tr>)}</Table>)}</Card>
          <NotificationHistory orderId={o.id} />
          <Card title={t("orders.detail.invoices")}>{o.invoices.length === 0 ? <EmptyState title={t("orders.detail.invoices.empty")} description={t("orders.detail.invoices.emptyBody")} /> : (
            <Table head={[t("orders.detail.col.type"), t("orders.detail.col.number"), t("orders.detail.col.status"), t("orders.detail.col.document")]}>{o.invoices.map((i) => <tr key={i.id}><Td>{typeLabel(i.type)}</Td><Td>{i.number ?? "-"}</Td><Td><Badge tone={statusTone(i.status)}>{enumLabel("invoice", i.status)}</Badge></Td><Td>{i.url ? <a className="text-brand-ink underline" href={i.url} target="_blank" rel="noopener noreferrer">{t("common.open")}</a> : "-"}</Td></tr>)}</Table>)}</Card>
        </div>
        <div className="space-y-6">
          <Card title={<span className="inline-flex items-center gap-1">{t("orders.detail.statusCard")}<HelpTip id="orders.statusActions" /></span>}>
            <p className="mb-3"><Badge tone={statusTone(o.status)}>{enumLabel("status", o.status)}</Badge> {mockPay && <Badge tone="danger">{t("orders.mockBadge")}</Badge>} <span className="ml-1 text-xs text-muted">{enumLabel("source", o.source)}</span></p>
            {allNext.length === 0 ? <p className="text-sm text-muted">{t("orders.detail.finalState")}</p> : (
              <>
                {next.length > 0 && <div className="flex flex-wrap gap-2">{next.map((s) => <Button key={s} size="sm" variant={s === "cancelled" ? "danger" : "secondary"} onClick={() => setTransition(s)}>{enumLabel("status", s)}</Button>)}</div>}
                <p className="mt-3 text-xs text-muted">{t("orders.detail.statusHint")}</p>
              </>
            )}
          </Card>
          <Card title={t("orders.detail.timeline")}>
            {timeline.length === 0 ? <EmptyState title={t("orders.detail.timeline.empty")} description={t("orders.detail.timeline.emptyBody")} /> : (
              <ol className="space-y-3 border-l border-line pl-4">{timeline.map((e, i) => (
                <li key={i} className="relative text-sm"><span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-brand-600" aria-hidden /><p>{e.text}</p><p className="text-xs text-muted">{dateTime(e.at)}</p></li>
              ))}</ol>
            )}
          </Card>
        </div>
      </div>
      <ConfirmDialog open={!!transition} title={t("orders.transition.title")} confirmLabel={t("orders.transition.action")}
        message={transition ? `${t("orders.transition.confirm", { status: enumLabel("status", transition) })} ${td(`orders.transition.effect.${transition}`) === `orders.transition.effect.${transition}` ? t("orders.transition.effect.default") : td(`orders.transition.effect.${transition}`)}` : ""}
        danger={transition === "cancelled"} loading={status.isPending}
        onConfirm={() => transition && status.mutate(transition)} onClose={() => setTransition(null)} />
      <ConfirmDialog open={invoiceOpen} title={t("orders.invoice.confirmTitle")} message={t("orders.invoice.confirmMessage")} confirmLabel={t("orders.invoice.confirmAction")} loading={invoice.isPending}
        onConfirm={() => invoice.mutate()} onClose={() => setInvoiceOpen(false)} />
      <Modal open={!!refund} onClose={() => setRefund(null)} title={t("orders.refund.title")}
        footer={<><Button variant="ghost" onClick={() => setRefund(null)}>{t("common.cancel")}</Button><Button variant="danger" loading={doRefund.isPending} disabled={!refund?.amount || !refund?.reason} onClick={() => doRefund.mutate()}>{t("orders.refund.action")}</Button></>}>
        {refund && <div className="space-y-3">
          <TextField label={t("orders.refund.amount", { currency: o.currency })} inputMode="decimal" help="orders.refundAmount" hint={t("orders.refund.amount.hint", { total: money(o.total, o.currency) })} value={refund.amount} onChange={(e) => setRefund({ ...refund, amount: e.target.value })} />
          <Button size="sm" variant="secondary" onClick={() => setRefund({ ...refund, amount: toMajor(o.total) })}>{t("orders.refund.fillFull")}</Button>
          <TextField label={t("orders.refund.reason")} help="orders.refundReason" hint={t("orders.refund.reason.hint")} value={refund.reason} onChange={(e) => setRefund({ ...refund, reason: e.target.value })} />
          <p role="note" className="rounded-lg border border-warn-line bg-warn-soft px-3 py-2 text-sm text-warn">{t("orders.refund.consequences")}</p>
        </div>}
      </Modal>
      <Modal open={ship !== null} onClose={() => setShip(null)} title={t("orders.ship.title")}
        footer={<><Button variant="ghost" onClick={() => setShip(null)}>{t("common.cancel")}</Button><Button loading={doShip.isPending} disabled={!ship} onClick={() => doShip.mutate()}>{t("orders.ship.action")}</Button></>}>
        <div className="space-y-3">
          <TextField label={t("orders.ship.serviceId")} help="orders.shipService" hint={t("orders.ship.serviceId.hint")} value={ship ?? ""} onChange={(e) => setShip(e.target.value)} />
          <p className="text-sm text-muted">{t("orders.ship.consequences")}</p>
        </div>
      </Modal>
    </>
  );
}

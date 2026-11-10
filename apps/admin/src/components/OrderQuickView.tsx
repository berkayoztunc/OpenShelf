import { useState } from "react";
import { Link } from "react-router-dom";
import { ExternalLink } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ORDER_TRANSITIONS } from "@openshelf/shared";
import { api } from "../lib/api";
import { describeOrderError } from "../lib/orderErrors";
import { orderDetailFromApi } from "../lib/adapt";
import { dateTime, enumLabel, money } from "../lib/format";
import { useT } from "../i18n";
import { typeLabel } from "../pages/Invoices";
import { Badge, Button, ConfirmDialog, Drawer, ErrorState, Loading, statusTone, useToast } from "./ui";

/** Statuses an operator may set by hand ("paid" / "refunded" come from the payment and refund flows). */
export const MANUAL_STATUSES = ["fulfilling", "shipped", "delivered", "cancelled"] as const;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="-mx-5 border-b border-line px-5 py-4 last:border-b-0"><h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">{title}</h3>{children}</section>;
}

export function OrderQuickView({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { t, td } = useT();
  const qc = useQueryClient(); const toast = useToast();
  const q = useQuery({ queryKey: ["order", id], enabled: !!id, queryFn: async () => orderDetailFromApi(await api.get<unknown>(`/api/admin/orders/${id}`)) });
  const [transition, setTransition] = useState<string | null>(null);
  const status = useMutation({
    mutationFn: (s: string) => api.post(`/api/admin/orders/${id}/status`, { status: s }),
    onSuccess: () => { setTransition(null); qc.invalidateQueries({ queryKey: ["order", id] }); qc.invalidateQueries({ queryKey: ["orders"] }); toast.success(t("orders.toast.statusUpdated")); },
    onError: (e) => { setTransition(null); toast.error(describeOrderError(e).message); },
  });
  const o = q.data;
  const next = o ? (ORDER_TRANSITIONS[o.status] ?? []).filter((s) => (MANUAL_STATUSES as readonly string[]).includes(s)) : [];
  const a = o?.shippingAddress as { name?: string; surname?: string; phone?: string; line1?: string; line2?: string; district?: string; city?: string; zip?: string } | undefined;
  const managed = !!o && o.source !== "website";
  return (
    <>
      <Drawer open={!!id} onClose={onClose} title={o ? t("orders.quick.title", { number: o.number }) : t("orders.quick.loading")}
        subtitle={o ? <span className="flex flex-wrap items-center gap-2"><Badge tone={statusTone(o.status)}>{enumLabel("status", o.status)}</Badge><span>{dateTime(o.createdAt)} · {enumLabel("source", o.source)}</span></span> : undefined}
        footer={o ? <Link to={`/orders/${o.id}`} className="w-full"><Button variant="secondary" className="w-full"><ExternalLink size={14} />{t("orders.quick.fullPage")}</Button></Link> : undefined}>
        {q.isPending ? <Loading /> : q.isError ? <ErrorState error={q.error} retry={() => q.refetch()} /> : o && (
          <div className="-my-5">
            <Section title={t("orders.quick.customer")}>
              <p className="font-medium">{[a?.name, a?.surname].filter(Boolean).join(" ") || o.email || "-"}</p>
              <p className="text-sm text-muted">{o.email}{a?.phone ? ` · ${a.phone}` : ""}</p>
              {a?.line1 && <p className="mt-1 text-sm">{[a.line1, a.line2, [a.district, a.city].filter(Boolean).join(" / "), a.zip].filter(Boolean).join(", ")}</p>}
            </Section>
            <Section title={t("orders.quick.items")}>
              <ul className="space-y-1.5 text-sm">{o.items.map((i) => (
                <li key={i.id} className="flex items-baseline justify-between gap-3"><span className="min-w-0"><span className="tabular-nums text-muted">{i.quantity}×</span> {i.title}{i.sku && <span className="ml-2 text-xs text-muted">{i.sku}</span>}</span><span className="whitespace-nowrap tabular-nums">{money(i.total, o.currency)}</span></li>
              ))}</ul>
              <p className="mt-3 flex justify-between border-t border-line pt-2 font-semibold"><span>{t("orders.col.total")}</span><span className="tabular-nums">{money(o.total, o.currency)}</span></p>
            </Section>
            <Section title={t("orders.quick.process")}>
              <dl className="space-y-3 text-sm">
                <div className="flex items-start justify-between gap-3"><dt className="text-muted">{t("orders.col.payment")}</dt><dd className="text-right">
                  {o.payments.length === 0 ? <span className="text-muted">{t("orders.cell.noPayment")}</span> : o.payments.map((p) => <span key={p.id} className="mb-1 block"><Badge tone={statusTone(p.status)}>{enumLabel("payment", p.status)}</Badge><span className="ml-2 text-xs text-muted">{enumLabel("provider", p.provider)} · {money(p.amount, o.currency)}</span></span>)}
                </dd></div>
                <div className="flex items-start justify-between gap-3"><dt className="text-muted">{t("orders.col.shipping")}</dt><dd className="text-right">
                  {o.shipments.length === 0 ? <span className="text-muted">{managed ? t("orders.cell.noShipment") : t("orders.attn.ship")}</span> : o.shipments.map((s) => (
                    <span key={s.id} className="mb-1 block"><Badge tone={statusTone(s.status)}>{enumLabel("shipment", s.status)}</Badge>
                      <span className="ml-2 text-xs text-muted">{s.carrier}{s.carrier && s.trackingNumber ? " · " : ""}{s.trackingNumber && (s.trackingUrl ? <a className="text-brand-ink underline" href={s.trackingUrl} target="_blank" rel="noopener noreferrer">{s.trackingNumber}</a> : s.trackingNumber)}</span>
                      {s.labelUrl && <a className="ml-2 text-xs text-brand-ink underline" href={s.labelUrl} target="_blank" rel="noopener noreferrer">{t("orders.detail.col.label")}</a>}</span>
                  ))}
                </dd></div>
                <div className="flex items-start justify-between gap-3"><dt className="text-muted">{t("orders.col.invoice")}</dt><dd className="text-right">
                  {o.invoices.length === 0 ? <span className="text-muted">{managed ? t("orders.cell.noInvoice") : t("orders.attn.invoice")}</span> : o.invoices.map((i) => (
                    <span key={i.id} className="mb-1 block"><Badge tone={statusTone(i.status)}>{enumLabel("invoice", i.status)}</Badge><span className="ml-2 text-xs text-muted">{typeLabel(i.type)}{i.number ? ` · ${i.number}` : ""}</span>
                      {i.url && <a className="ml-2 text-xs text-brand-ink underline" href={i.url} target="_blank" rel="noopener noreferrer">{t("common.open")}</a>}</span>
                  ))}
                </dd></div>
              </dl>
            </Section>
            {next.length > 0 && (
              <Section title={t("orders.quick.changeStatus")}>
                <div className="flex flex-wrap gap-2">{next.map((s) => <Button key={s} size="sm" variant={s === "cancelled" ? "danger" : "secondary"} onClick={() => setTransition(s)}>{enumLabel("status", s)}</Button>)}</div>
              </Section>
            )}
          </div>
        )}
      </Drawer>
      <ConfirmDialog open={!!transition} title={t("orders.transition.title")} confirmLabel={t("orders.transition.action")}
        message={transition ? `${t("orders.transition.confirm", { status: enumLabel("status", transition) })} ${td(`orders.transition.effect.${transition}`) === `orders.transition.effect.${transition}` ? t("orders.transition.effect.default") : td(`orders.transition.effect.${transition}`)}` : ""}
        danger={transition === "cancelled"} loading={status.isPending} onConfirm={() => transition && status.mutate(transition)} onClose={() => setTransition(null)} />
    </>
  );
}

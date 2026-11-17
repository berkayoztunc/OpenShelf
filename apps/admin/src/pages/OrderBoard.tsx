import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQueries, useQueryClient } from "@tanstack/react-query";
import { CircleCheck, CircleX, Clock, CreditCard, Eye, FileText, List, PackageCheck, Printer, RefreshCw, Truck, type LucideIcon } from "lucide-react";
import { ORDER_SOURCES, ORDER_TRANSITIONS } from "@openshelf/shared";
import { api, qs } from "../lib/api";
import { mapPaged, orderRowFromApi } from "../lib/adapt";
import { dateTime, enumLabel, money } from "../lib/format";
import { openPrint } from "../lib/print";
import { describeOrderError } from "../lib/orderErrors";
import { useT } from "../i18n";
import type { OrderRow, Paged } from "../lib/types";
import { Badge, Button, ConfirmDialog, ErrorState, PageHeader, SelectField, Skeleton, TextField, cx, useDebounced, useToast } from "../components/ui";
import { MANUAL_STATUSES, OrderQuickView } from "../components/OrderQuickView";

/** Board columns: the stages an order moves through, left to right. `tab` links to the matching list tab. */
type ColKey = "awaiting" | "paid" | "fulfilling" | "shipped" | "delivered" | "closed";
const COLUMNS: { key: ColKey; statuses: string[]; icon: LucideIcon; tone: string; tab: string }[] = [
  { key: "awaiting", statuses: ["pending", "awaiting_payment"], icon: Clock, tone: "text-warn", tab: "awaiting" },
  { key: "paid", statuses: ["paid"], icon: CreditCard, tone: "text-success", tab: "prepare" },
  { key: "fulfilling", statuses: ["fulfilling"], icon: PackageCheck, tone: "text-info", tab: "prepare" },
  { key: "shipped", statuses: ["shipped"], icon: Truck, tone: "text-info", tab: "shipped" },
  { key: "delivered", statuses: ["delivered"], icon: CircleCheck, tone: "text-success", tab: "delivered" },
  { key: "closed", statuses: ["cancelled", "refunded"], icon: CircleX, tone: "text-danger", tab: "closed" },
];
const PER_COLUMN = 30;
const PAID_ON = new Set(["paid", "fulfilling", "shipped", "delivered"]);
const PREPARED = new Set(["fulfilling", "shipped", "delivered"]);
/** Icons for the status an operator can move an order to (cancel is handled separately). */
const NEXT_ICON: Record<string, LucideIcon> = { fulfilling: PackageCheck, shipped: Truck, delivered: CircleCheck };

type StepState = "done" | "active" | "todo" | "error" | "skip";
interface Step { key: "payment" | "prepare" | "invoice" | "shipment" | "delivered"; icon: LucideIcon; state: StepState }

/** Process steps of one order, derived from its status and latest payment / invoice / shipment. */
export function orderSteps(o: OrderRow): Step[] {
  const closed = o.status === "cancelled" || o.status === "refunded";
  const paid = PAID_ON.has(o.status) || o.payment?.status === "succeeded" || o.status === "refunded";
  const inv = o.invoice?.status;
  const shp = o.shipment?.status;
  const pending = (s: StepState): StepState => (closed && s !== "done" ? "skip" : s);
  return [
    { key: "payment", icon: CreditCard, state: pending(paid ? "done" : o.payment?.status === "failed" ? "error" : "active") },
    { key: "prepare", icon: PackageCheck, state: pending(PREPARED.has(o.status) ? "done" : o.status === "paid" ? "active" : "todo") },
    { key: "invoice", icon: FileText, state: pending(inv === "issued" ? "done" : inv === "failed" ? "error" : inv ? "active" : paid ? "active" : "todo") },
    { key: "shipment", icon: Truck, state: pending(shp === "delivered" || o.status === "delivered" ? "done" : shp === "returned" || shp === "cancelled" ? "error" : shp || o.status === "shipped" ? "active" : "todo") },
    { key: "delivered", icon: CircleCheck, state: pending(o.status === "delivered" ? "done" : "todo") },
  ];
}
const STEP_CLS: Record<StepState, string> = {
  done: "bg-success-soft text-success ring-success-line",
  active: "bg-info-soft text-info ring-info-line",
  todo: "bg-hover text-faint ring-line",
  error: "bg-danger-soft text-danger ring-danger-line",
  skip: "bg-hover text-faint/60 ring-line opacity-60",
};

function IconBtn({ label, icon: Icon, onClick, danger, disabled }: { label: string; icon: LucideIcon; onClick: () => void; danger?: boolean; disabled?: boolean }) {
  return (
    <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick}
      className={cx("inline-grid size-7 place-items-center rounded-md text-muted transition hover:bg-hover disabled:opacity-40", danger ? "hover:text-danger" : "hover:text-ink")}>
      <Icon size={15} />
    </button>
  );
}

type Pending = { order: OrderRow; kind: "status"; status: string } | { order: OrderRow; kind: "invoice" };

function OrderCard({ o, onQuick, onAct }: { o: OrderRow; onQuick: () => void; onAct: (p: Pending) => void }) {
  const { t } = useT();
  const steps = orderSteps(o);
  const done = steps.filter((s) => s.state === "done").length;
  const closed = o.status === "cancelled" || o.status === "refunded";
  const website = o.source === "website";
  const next = website ? (ORDER_TRANSITIONS[o.status] ?? []).filter((s) => s !== "cancelled" && (MANUAL_STATUSES as readonly string[]).includes(s)) : [];
  const canCancel = website && (ORDER_TRANSITIONS[o.status] ?? []).includes("cancelled");
  const canInvoice = website && PAID_ON.has(o.status) && !o.invoice;
  const first = o.lines?.[0];
  return (
    <li className="rounded-lg border border-line bg-raised p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link to={`/orders/${o.id}`} className="font-medium text-brand-ink hover:underline">#{o.number}</Link>
          {o.isMock && <span className="ml-1.5"><Badge tone="danger">{t("orders.mockBadge")}</Badge></span>}
          <p className="truncate text-xs text-muted">{dateTime(o.createdAt)} · {enumLabel("source", o.source)}</p>
        </div>
        <span className="whitespace-nowrap text-sm font-semibold tabular-nums">{money(o.total, o.currency)}</span>
      </div>
      <p className="mt-1.5 truncate text-sm">{o.customerName ?? o.email ?? "-"}{o.city && <span className="text-xs text-muted"> · {o.city}</span>}</p>
      {first && <p className="truncate text-xs text-muted" title={first.name}><span className="tabular-nums">{first.quantity}×</span> {first.name}{(o.lineCount ?? 0) > 1 && ` ${t("board.moreLines", { n: (o.lineCount ?? 1) - 1 })}`}</p>}

      <div className="mt-2.5" aria-label={t("board.progress", { done, total: steps.length })}>
        <ol className="flex items-center gap-1">
          {steps.map((s, i) => (
            <li key={s.key} className="flex flex-1 items-center gap-1 last:flex-none">
              <span title={`${t(`board.step.${s.key}`)}: ${t(`board.state.${s.state}`)}`} className={cx("grid size-6 shrink-0 place-items-center rounded-full ring-1 ring-inset", STEP_CLS[s.state])}><s.icon size={12} /></span>
              {i < steps.length - 1 && <span aria-hidden className={cx("h-0.5 flex-1 rounded-full", s.state === "done" ? "bg-success" : "bg-line")} />}
            </li>
          ))}
        </ol>
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-hover"><div className={cx("h-full rounded-full transition-all", closed ? "bg-danger/50" : "bg-brand-600")} style={{ width: `${(done / steps.length) * 100}%` }} /></div>
      </div>

      <div className="mt-2 flex items-center gap-0.5 border-t border-line pt-2">
        <IconBtn label={t("orders.quick.open", { number: o.number })} icon={Eye} onClick={onQuick} />
        {next.map((s) => <IconBtn key={s} label={t("board.action.move", { status: enumLabel("status", s) })} icon={NEXT_ICON[s] ?? CircleCheck} onClick={() => onAct({ order: o, kind: "status", status: s })} />)}
        {canInvoice && <IconBtn label={t("board.action.invoice")} icon={FileText} onClick={() => onAct({ order: o, kind: "invoice" })} />}
        <IconBtn label={t("board.action.label")} icon={Printer} onClick={() => openPrint("label", [o.id])} />
        {canCancel && <span className="ml-auto"><IconBtn danger label={t("board.action.cancel")} icon={CircleX} onClick={() => onAct({ order: o, kind: "status", status: "cancelled" })} /></span>}
      </div>
    </li>
  );
}

export default function OrderBoard() {
  const { t } = useT();
  const qc = useQueryClient(); const toast = useToast();
  const [q, setQ] = useState(""); const dq = useDebounced(q);
  const [source, setSource] = useState("");
  const [quick, setQuick] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);

  const cols = useQueries({
    queries: COLUMNS.map((c) => ({
      queryKey: ["orders", "board", c.key, dq, source],
      queryFn: async () => mapPaged(await api.get<Paged<unknown>>(`/api/admin/orders${qs({ q: dq, source, status: c.statuses.join(","), page: 1, pageSize: PER_COLUMN })}`), orderRowFromApi),
      refetchInterval: 60_000,
    })),
  });
  const fetching = cols.some((c) => c.isFetching);

  const act = useMutation({
    mutationFn: (p: Pending) => (p.kind === "status" ? api.post(`/api/admin/orders/${p.order.id}/status`, { status: p.status }) : api.post(`/api/admin/orders/${p.order.id}/invoice`)),
    onSuccess: (_d, p) => {
      setPending(null);
      qc.invalidateQueries({ queryKey: ["orders"] }); qc.invalidateQueries({ queryKey: ["order", p.order.id] });
      toast.success(p.kind === "status" ? t("orders.toast.statusUpdated") : t("board.toast.invoice"));
    },
    onError: (e) => { setPending(null); toast.error(describeOrderError(e).message); },
  });

  return (
    <>
      <PageHeader title={t("board.title")} description={t("board.description")}
        actions={<>
          <Button size="sm" variant="ghost" loading={fetching} onClick={() => qc.invalidateQueries({ queryKey: ["orders", "board"] })}><RefreshCw size={14} />{t("board.refresh")}</Button>
          <Link to="/orders"><Button size="sm" variant="secondary"><List size={14} />{t("board.listView")}</Button></Link>
        </>} />
      <div className="mb-4 grid gap-3 sm:grid-cols-[minmax(0,22rem)_12rem]">
        <TextField label={t("common.search")} type="search" placeholder={t("orders.filter.searchPlaceholder")} value={q} onChange={(e) => setQ(e.target.value)} />
        <SelectField label={t("orders.filter.source")} value={source} onChange={(e) => setSource(e.target.value)}>
          <option value="">{t("common.all")}</option>{ORDER_SOURCES.map((s) => <option key={s} value={s}>{enumLabel("source", s)}</option>)}
        </SelectField>
      </div>

      <div className="-mx-1 flex gap-3 overflow-x-auto pb-3">
        {COLUMNS.map((c, i) => {
          const r = cols[i]!;
          const total = r.data?.total ?? 0; const items = r.data?.items ?? [];
          return (
            <section key={c.key} aria-label={t(`board.col.${c.key}`)} className="flex w-72 shrink-0 flex-col rounded-xl border border-line bg-canvas">
              <header className="flex items-center gap-2 border-b border-line px-3 py-2.5">
                <c.icon size={16} className={c.tone} aria-hidden />
                <h2 className="text-sm font-semibold">{t(`board.col.${c.key}`)}</h2>
                <span className="ml-auto rounded-full bg-hover px-2 py-px text-xs tabular-nums text-muted">{r.data ? total : "…"}</span>
              </header>
              <div className="max-h-[70vh] flex-1 overflow-y-auto p-2">
                {r.isPending ? <div className="space-y-2">{[0, 1, 2].map((k) => <Skeleton key={k} className="h-32" />)}</div>
                  : r.isError ? <ErrorState error={r.error} retry={() => r.refetch()} />
                  : items.length === 0 ? <p className="py-8 text-center text-xs text-faint">{t("board.empty")}</p>
                  : <ul className="space-y-2">{items.map((o) => <OrderCard key={o.id} o={o} onQuick={() => setQuick(o.id)} onAct={setPending} />)}</ul>}
                {total > items.length && <Link to={`/orders?tab=${c.tab}`} className="mt-2 block text-center text-xs font-medium text-brand-ink hover:underline">{t("board.seeAll", { n: total - items.length })}</Link>}
              </div>
            </section>
          );
        })}
      </div>

      <OrderQuickView id={quick} onClose={() => setQuick(null)} />
      <ConfirmDialog open={!!pending} loading={act.isPending}
        danger={pending?.kind === "status" && pending.status === "cancelled"}
        title={pending?.kind === "invoice" ? t("board.confirm.invoice.title") : t("board.confirm.status.title")}
        confirmLabel={t("board.confirm.apply")}
        message={!pending ? "" : pending.kind === "invoice" ? t("board.confirm.invoice.body", { number: pending.order.number }) : t("board.confirm.status.body", { number: pending.order.number, status: enumLabel("status", pending.status) })}
        onConfirm={() => pending && act.mutate(pending)} onClose={() => !act.isPending && setPending(null)} />
    </>
  );
}

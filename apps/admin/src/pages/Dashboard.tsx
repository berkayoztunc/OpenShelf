import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { money, pickAmount, statusLabel } from "../lib/format";
import { enumLabel } from "../lib/format";
import { intlTag, useT } from "../i18n";
import { useAdmin } from "../lib/auth";
import { statusOf, useIntegrations } from "../lib/integrations";
import { buildOnboarding } from "../lib/onboarding";
import { GuideLink } from "../components/help/GuideLink";
import { AlertTriangle, ArrowUpRight, Banknote, CalendarDays, Check, CheckCircle2, PackageOpen, ShoppingBag, Plug } from "lucide-react";
import { Badge, Card, EmptyState, ErrorState, PageHeader, Skeleton, statusTone, Table, Td } from "../components/ui";
import { mapPaged, orderRowFromApi } from "../lib/adapt";
import { dateTime } from "../lib/format";
import type { OrderRow, Paged } from "../lib/types";
import { useSettings } from "../lib/settings";

interface DashboardData {
  salesToday: unknown; salesWeek: unknown; mockSalesWeek?: unknown; originNotice?: string | null;
  ordersByStatus: Record<string, number> | { status: string; count: number }[];
  lowStock: { variantId?: string; sku?: string; title?: string; name?: string; productName?: string; available?: number; total?: number; reserved?: number }[];
  integrationHealth: { provider: string; ok: boolean; detail?: string; enabled?: boolean; at?: string }[];
  stockDrift: { variantId?: string; sku?: string; reserved?: number; expectedReserved?: number; total?: number }[];
}

function Stat({ title, value, sub, icon, tone = "brand" }: { title: string; value: string | number; sub?: string; icon: React.ReactNode; tone?: "brand" | "amber" | "emerald" | "red" }) {
  const tones = { brand: "bg-brand-50 text-brand-ink", amber: "bg-warn-soft text-warn", emerald: "bg-success-soft text-success", red: "bg-danger-soft text-danger" };
  return (
    <div className="group rounded-xl border border-line bg-surface p-5 shadow-soft transition duration-200 hover:-translate-y-0.5 hover:shadow-lift">
      <div className="flex items-start justify-between"><p className="text-[13px] font-medium text-muted">{title}</p><span className={`grid size-9 place-items-center rounded-lg ${tones[tone]}`}>{icon}</span></div>
      <p className="mt-3 font-display text-3xl font-semibold tracking-tight tabular-nums">{value}</p>
      <p className="mt-1 min-h-4 text-xs text-muted">{sub}</p>
    </div>
  );
}

/** Revenue per day for the last 7 days, from the most recent orders. Inline SVG, no chart lib. */
function RevenueBars({ orders, currency }: { orders: OrderRow[]; currency: string }) {
  const { t } = useT(); const tag = intlTag();
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - (6 - i)); return d; });
  const totals = days.map((d) => orders.filter((o) => !["cancelled", "refunded"].includes(o.status) && new Date(o.createdAt).toDateString() === d.toDateString()).reduce((n, o) => n + o.total, 0));
  const max = Math.max(...totals, 1);
  const sum = totals.reduce((a, b) => a + b, 0);
  return (
    <div>
      <p className="font-display text-2xl font-semibold tabular-nums">{money(sum, currency)}</p>
      <p className="text-xs text-muted">{t("dashboard.revenue.caption", { n: orders.length })}</p>
      <svg viewBox="0 0 280 90" role="img" aria-label={t("dashboard.revenue.aria", { total: money(sum, currency) })} className="mt-4 h-28 w-full">
        {totals.map((t, i) => {
          const h = Math.max(3, (t / max) * 66);
          return (
            <g key={i}>
              <title>{`${days[i]!.toLocaleDateString(tag, { weekday: "long", month: "short", day: "numeric" })}: ${money(t, currency)}`}</title>
              <rect x={i * 40 + 6} y={72 - h} width="28" height={h} rx="5" className={t > 0 ? "fill-brand-600" : "fill-hover"} />
              <text x={i * 40 + 20} y="87" textAnchor="middle" className="fill-muted text-[9px]">{days[i]!.toLocaleDateString(tag, { weekday: "short" }).slice(0, 3)}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** Orders by status as one stacked bar + legend. */
function StatusBar({ statuses }: { statuses: (readonly [string, number])[] }) {
  const { t } = useT();
  const total = statuses.reduce((n, [, c]) => n + c, 0) || 1;
  const color: Record<string, string> = { paid: "bg-data-ok", delivered: "bg-data-ok", shipped: "bg-data-info", fulfilling: "bg-data-info", pending: "bg-data-warn", awaiting_payment: "bg-data-warn", cancelled: "bg-data-bad", refunded: "bg-data-bad" };
  return (
    <div>
      <div className="flex h-2.5 overflow-hidden rounded-full bg-hover" role="img" aria-label={t("dashboard.byStatus.aria")}>
        {statuses.map(([s, c]) => <span key={s} className={`${color[s] ?? "bg-faint"} transition-all`} style={{ width: `${(c / total) * 100}%` }} />)}
      </div>
      <ul className="mt-4 space-y-1">{statuses.map(([s, c]) => (
        <li key={s}><Link to={`/orders?status=${s}`} className="-mx-2 flex items-center justify-between rounded-lg px-2 py-1.5 transition hover:bg-hover"><span className="flex items-center gap-2.5"><span aria-hidden className={`size-2.5 rounded-full ${color[s] ?? "bg-faint"}`} /><Badge tone={statusTone(s)}>{statusLabel(s)}</Badge></span><span className="font-medium tabular-nums">{c}</span></Link></li>
      ))}</ul>
    </div>
  );
}

function DashboardSkeleton() {
  const { t } = useT();
  return (
    <div aria-busy role="status" aria-label={t("dashboard.skeleton")}>
      <Skeleton className="mb-6 h-8 w-48" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-32 rounded-xl" />)}</div>
      <div className="mt-6 grid gap-6 lg:grid-cols-3"><Skeleton className="h-64 rounded-xl lg:col-span-2" /><Skeleton className="h-64 rounded-xl" /></div>
    </div>
  );
}

function Onboarding({ originNotice, mockMode, storeName, logoMediaId, adminEmail }: { originNotice?: string | null; mockMode: boolean; storeName?: string; logoMediaId?: string | null; adminEmail?: string }) {
  const { t } = useT();
  const admin = useAdmin();
  const elevated = admin?.role !== "staff";
  const products = useQuery({ queryKey: ["onboarding-products"], enabled: elevated, queryFn: () => api.get<{ total?: number; items?: unknown[] }>("/api/admin/products?pageSize=1") });
  const ints = useIntegrations(elevated);
  if (!elevated || products.isPending || ints.isPending) return null;
  const connected = (p: string) => { const it = ints.data?.find((i) => i.provider === p); return !!it && statusOf(it, false) === "connected"; };
  const steps = buildOnboarding({
    storeName, logoMediaId, adminEmail, originNotice, mockMode, totpEnabled: !!admin?.totpEnabled,
    productCount: products.data?.total ?? products.data?.items?.length ?? 0,
    paymentConnected: connected("iyzico"), shippingConnected: connected("geliver"), invoicingConnected: connected("efaturam"),
  });
  const done = steps.filter((s) => s.done).length;
  if (done === steps.length) return null;
  return (
    <section aria-label={t("dashboard.onboarding.title")} data-testid="onboarding" className="mb-6 rounded-xl border border-brand-600/30 bg-surface p-5 shadow-soft">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div><h2 className="font-display text-lg font-semibold">{t("dashboard.onboarding.title")}</h2><p className="mt-1 max-w-2xl text-sm text-muted">{t("dashboard.onboarding.subtitle")}</p></div>
        <p className="text-sm font-medium text-brand-ink">{t("dashboard.onboarding.progress", { done, n: steps.length })}</p>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-hover" role="progressbar" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={done}><span className="block h-full rounded-full bg-brand-600 transition-all" style={{ width: `${(done / steps.length) * 100}%` }} /></div>
      <ol className="mt-4 grid gap-2 md:grid-cols-2">
        {steps.map((s, i) => (
          <li key={s.id} data-done={s.done} className="flex items-start gap-3 rounded-lg border border-line px-3 py-2.5">
            <span aria-hidden className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold ring-1 ring-inset ${s.done ? "bg-success-soft text-success ring-success-line" : "text-muted ring-line-strong"}`}>{s.done ? <Check size={13} strokeWidth={3} /> : i + 1}</span>
            <div className="min-w-0 flex-1">
              <p className={`text-[13px] font-medium ${s.done ? "text-muted line-through decoration-line-strong" : ""}`}>{t(s.title)}<span className="sr-only"> ({s.done ? t("dashboard.onboarding.doneLabel") : t("dashboard.onboarding.todoLabel")})</span></p>
              <p className="mt-0.5 text-xs text-muted">{t(s.body)}</p>
              {!s.done && <p className="mt-1.5 flex items-center gap-3"><Link to={s.to} className="text-[13px] font-medium text-brand-ink hover:underline">{t("dashboard.onboarding.open")}</Link><GuideLink guide={s.guide}>{t("dashboard.onboarding.guide")}</GuideLink></p>}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

export default function Dashboard() {
  const { t } = useT();
  const q = useQuery({ queryKey: ["dashboard"], queryFn: () => api.get<DashboardData>("/api/admin/dashboard") });
  const recent = useQuery({ queryKey: ["orders", "dashboard-recent"], queryFn: async () => mapPaged(await api.get<Paged<unknown>>("/api/admin/orders?pageSize=50"), orderRowFromApi) });
  const settings = useSettings().data;
  const cur = settings?.general?.currency ?? "TRY";
  if (q.isPending) return <DashboardSkeleton />;
  if (q.isError) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const d = q.data;
  const statuses = Array.isArray(d.ordersByStatus) ? d.ordersByStatus.map((x) => [x.status, x.count] as const) : Object.entries(d.ordersByStatus ?? {});
  const totalOrders = statuses.reduce((n, [, c]) => n + c, 0);
  const countOf = (v: unknown) => (v && typeof v === "object" && typeof (v as { count?: number }).count === "number" ? t("dashboard.stat.ordersCount", { n: (v as { count: number }).count }) : undefined);
  const enabledHealth = d.integrationHealth?.filter((h) => h.enabled) ?? [];
  const orders = recent.data?.items ?? [];

  return (
    <>
      <PageHeader title={t("dashboard.title")} description={t("dashboard.description")} guide="getting-started#ilk-10-adim" />
      <Onboarding originNotice={d.originNotice} mockMode={!!settings?.system?.mockMode} storeName={settings?.general?.storeName} logoMediaId={settings?.branding?.logoMediaId} adminEmail={settings?.notifications?.adminEmail} />
      {d.originNotice === "derived_origins_workers_dev" && (
        <div role="alert" className="mb-6 flex gap-3 rounded-xl border border-warn-line bg-warn-soft p-4 text-sm text-warn">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <p><strong>{t("dashboard.origin.title")}</strong> {t("dashboard.origin.body")}</p>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat title={t("dashboard.stat.salesToday")} icon={<Banknote size={18} />} value={money(pickAmount(d.salesToday), cur)} sub={countOf(d.salesToday)} />
        <Stat title={t("dashboard.stat.salesWeek")} tone="emerald" icon={<CalendarDays size={18} />} value={money(pickAmount(d.salesWeek), cur)} sub={[countOf(d.salesWeek), d.mockSalesWeek && (d.mockSalesWeek as { count?: number }).count ? t("dashboard.stat.exclMock", { n: (d.mockSalesWeek as { count: number }).count }) : undefined].filter(Boolean).join(" · ") || undefined} />
        <Stat title={t("dashboard.stat.orders")} icon={<ShoppingBag size={18} />} value={totalOrders} sub={t("dashboard.stat.statuses", { n: statuses.length })} />
        <Stat title={t("dashboard.stat.lowStock")} tone={d.lowStock?.length ? "amber" : "emerald"} icon={<PackageOpen size={18} />} value={d.lowStock?.length ?? 0} sub={d.stockDrift?.length ? t("dashboard.stat.drift", { n: d.stockDrift.length }) : t("dashboard.stat.noDrift")} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card title={t("dashboard.revenue.title")} className="lg:col-span-2">{recent.isPending ? <Skeleton className="h-40" /> : <RevenueBars orders={orders} currency={cur} />}</Card>
        <Card title={t("dashboard.byStatus.title")}>
          {statuses.length === 0 ? <EmptyState title={t("dashboard.empty.title")} description={t("dashboard.empty.body")} /> : <StatusBar statuses={statuses} />}
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card title={t("dashboard.recent.title")} className="lg:col-span-2" actions={<Link className="inline-flex items-center gap-1 text-[13px] font-medium text-brand-ink hover:underline" to="/orders">{t("dashboard.recent.viewAll")}<ArrowUpRight size={14} /></Link>}>
          {recent.isPending ? <Skeleton className="h-40" /> : orders.length === 0 ? <EmptyState icon={<ShoppingBag size={22} />} title={t("dashboard.empty.title")} description={t("dashboard.recent.empty")} /> : (
            <Table head={[t("dashboard.recent.order"), t("common.date"), t("common.status"), t("common.total")]} caption={t("dashboard.recent.caption")}>{orders.slice(0, 6).map((o) => (
              <tr key={o.id}>
                <Td><Link className="font-medium text-brand-ink hover:underline" to={`/orders/${o.id}`}>#{o.number}</Link>{o.isMock && <span className="ml-2"><Badge tone="danger">{t("dashboard.mockBadge")}</Badge></span>}</Td>
                <Td className="text-muted">{dateTime(o.createdAt)}</Td>
                <Td><Badge tone={statusTone(o.status)}>{statusLabel(o.status)}</Badge></Td>
                <Td className="font-medium tabular-nums">{money(o.total, o.currency)}</Td>
              </tr>
            ))}</Table>
          )}
        </Card>
        <div className="space-y-6">
          <Card title={t("dashboard.health.title")} actions={<Link className="text-[13px] font-medium text-brand-ink hover:underline" to="/integrations">{t("dashboard.health.manage")}</Link>}>
            {!enabledHealth.length ? <EmptyState icon={<Plug size={22} />} title={t("dashboard.health.emptyTitle")} description={t("dashboard.health.emptyBody")} action={<Link to="/integrations" className="inline-flex h-8 items-center rounded-lg bg-brand-600 px-3 text-[13px] font-medium text-white hover:bg-brand-700">{t("dashboard.health.open")}</Link>} /> : (
              <><p className="mb-3 text-xs text-muted" data-testid="health-summary">{t("dashboard.health.summary", { ok: enabledHealth.filter((h) => h.ok).length, n: enabledHealth.length })}{enabledHealth.some((h) => !h.ok) && <> · <Link to="/integrations" className="font-medium text-danger hover:underline">{t("dashboard.health.fix")}</Link></>}</p>
              <ul className="space-y-3">{enabledHealth.map((h) => (
                <li key={h.provider} className="flex items-center justify-between gap-3"><span className="flex items-center gap-2.5"><span aria-hidden className="grid size-7 place-items-center rounded-md bg-brand-50 text-xs font-bold text-brand-ink">{enumLabel("provider", h.provider).charAt(0).toUpperCase()}</span>{enumLabel("provider", h.provider)}</span>
                  <Badge tone={h.ok ? "success" : "danger"}>{h.ok ? t("dashboard.health.ok") : t("dashboard.health.bad")}</Badge></li>
              ))}</ul></>
            )}
          </Card>
          <Card title={t("dashboard.lowStock.title")}>
            {!d.lowStock?.length ? <EmptyState icon={<CheckCircle2 size={22} />} title={t("dashboard.lowStock.empty")} /> : (
              <ul className="space-y-2.5">{d.lowStock.slice(0, 6).map((l, i) => (
                <li key={l.variantId ?? i} className="flex items-center justify-between gap-3 text-sm"><span className="min-w-0 truncate">{l.productName ?? l.name ?? l.title ?? l.sku}<span className="ml-2 text-xs text-muted">{l.sku}</span></span><Badge tone="warning">{l.available ?? (l.total ?? 0) - (l.reserved ?? 0)}</Badge></li>
              ))}</ul>
            )}
          </Card>
        </div>
      </div>
      {!!d.stockDrift?.length && (
        <Card title={t("dashboard.drift.title")} className="mt-6">
          <Table head={[t("dashboard.drift.sku"), t("dashboard.drift.total"), t("dashboard.drift.reserved"), t("dashboard.drift.expected")]} caption={t("dashboard.drift.caption")}>{d.stockDrift.map((l, i) => (
            <tr key={l.variantId ?? i}><Td>{l.sku}</Td><Td>{l.total}</Td><Td>{l.reserved}</Td><Td>{l.expectedReserved}</Td></tr>
          ))}</Table>
        </Card>
      )}
    </>
  );
}

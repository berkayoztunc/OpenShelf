import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { enumLabel, label as prettify, money, pickAmount, statusLabel, timeAgo } from "../lib/format";
import { intlTag, useT } from "../i18n";
import { useAdmin } from "../lib/auth";
import { statusOf, useIntegrations } from "../lib/integrations";
import { buildOnboarding } from "../lib/onboarding";
import { GuideLink } from "../components/help/GuideLink";
import { AlertTriangle, ArrowUpRight, Banknote, Check, CheckCircle2, Package, Plug, Receipt, ShoppingBag, UserPlus } from "lucide-react";
import { Badge, Card, EmptyState, ErrorState, PageHeader, Skeleton, statusTone, Table, Td } from "../components/ui";
import { mapPaged, orderRowFromApi } from "../lib/adapt";
import type { Insights } from "../lib/insights";
import { Delta, KpiCard, RankBars, RevenueChart, SplitBar } from "../components/dashboard/charts";
import { dateTime } from "../lib/format";
import type { Paged } from "../lib/types";
import { useSettings } from "../lib/settings";

interface DashboardData {
  salesToday: unknown; salesWeek: unknown; mockSalesWeek?: unknown; originNotice?: string | null;
  ordersByStatus: Record<string, number> | { status: string; count: number }[];
  lowStock: { variantId?: string; sku?: string; title?: string; name?: string; productName?: string; available?: number; total?: number; reserved?: number }[];
  integrationHealth: { provider: string; ok: boolean; detail?: string; enabled?: boolean; at?: string }[];
  stockDrift: { variantId?: string; sku?: string; reserved?: number; expectedReserved?: number; total?: number }[];
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
  const [all, setAll] = useState(false);
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
        {steps.map((s, i) => ({ s, i })).filter(({ s }) => all || !s.done).slice(0, all ? steps.length : 4).map(({ s, i }) => (
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
      {done > 0 && <button type="button" aria-expanded={all} onClick={() => setAll((v) => !v)} className="mt-3 text-[13px] font-medium text-brand-ink hover:underline">{all ? t("dashboard.onboarding.showTodo") : t("dashboard.onboarding.showAll", { n: steps.length })}</button>}
    </section>
  );
}

const RANGES = [7, 30, 90] as const;
type AttentionKey = keyof Insights["attention"];
/** Work queue: what needs a human today. Each row links to the filtered list that fixes it. */
const ATTENTION: { key: AttentionKey; to: string; tone: "warn" | "bad" | "info" }[] = [
  { key: "toShip", to: "/orders?tab=prepare&shipping=none&source=website", tone: "warn" },
  { key: "awaitingPayment", to: "/orders?tab=awaiting", tone: "info" },
  { key: "toInvoice", to: "/orders?invoice=none&payment=succeeded&source=website", tone: "warn" },
  { key: "failedJobs", to: "/integration-events", tone: "bad" },
  { key: "outOfStock", to: "/products?stock=out&status=active", tone: "bad" },
  { key: "lowStock", to: "/products?stock=low&status=active", tone: "warn" },
  { key: "noImage", to: "/products?image=none&status=active", tone: "info" },
  { key: "drafts", to: "/products?status=draft", tone: "info" },
];
const TONE = { warn: "bg-warn-soft text-warn ring-warn-line", bad: "bg-danger-soft text-danger ring-danger-line", info: "bg-brand-50 text-brand-ink ring-line" } as const;

export default function Dashboard() {
  const { t } = useT();
  const admin = useAdmin();
  const [sp, setSp] = useSearchParams();
  const days = (RANGES as readonly number[]).includes(Number(sp.get("days"))) ? (Number(sp.get("days")) as 7 | 30 | 90) : 30;
  const q = useQuery({ queryKey: ["dashboard"], queryFn: () => api.get<DashboardData>("/api/admin/dashboard") });
  const ins = useQuery({ queryKey: ["dashboard", "insights", days], queryFn: () => api.get<Insights>(`/api/admin/dashboard/insights?days=${days}`) });
  const recent = useQuery({ queryKey: ["orders", "dashboard-recent"], queryFn: async () => mapPaged(await api.get<Paged<unknown>>("/api/admin/orders?pageSize=8"), orderRowFromApi) });
  const settings = useSettings().data;
  const cur = settings?.general?.currency ?? "TRY";
  if (q.isPending) return <DashboardSkeleton />;
  if (q.isError) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const d = q.data;
  const statuses = Array.isArray(d.ordersByStatus) ? d.ordersByStatus.map((x) => [x.status, x.count] as const) : Object.entries(d.ordersByStatus ?? {});
  const enabledHealth = d.integrationHealth?.filter((h) => h.enabled) ?? [];
  const orders = recent.data?.items ?? [];
  const i = ins.data;
  const todaySales = d.salesToday && typeof d.salesToday === "object" ? (d.salesToday as { total?: number; count?: number }) : null;
  const mockCount = (d.mockSalesWeek as { count?: number } | undefined)?.count ?? 0;
  const queue = i ? ATTENTION.filter((a) => i.attention[a.key] > 0) : [];
  const first = admin?.name?.split(" ")[0];

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[1.65rem] font-semibold leading-tight tracking-tight">{first ? t("dashboard.greeting", { name: first }) : t("dashboard.title")}</h1>
          <p className="mt-1 text-sm text-muted">{new Date().toLocaleDateString(intlTag(), { weekday: "long", day: "numeric", month: "long" })}{todaySales && <> · {t("dashboard.today", { amount: money(pickAmount(todaySales), cur), n: todaySales.count ?? 0 })}</>}</p>
        </div>
        <div className="flex items-center gap-3">
          <div role="group" aria-label={t("dashboard.range.label")} className="inline-flex rounded-lg border border-line bg-surface p-0.5">
            {RANGES.map((r) => <button key={r} type="button" aria-pressed={r === days} onClick={() => setSp((p) => { const n = new URLSearchParams(p); r === 30 ? n.delete("days") : n.set("days", String(r)); return n; }, { replace: true })}
              className={`h-8 rounded-md px-3 text-[13px] font-medium transition-colors ${r === days ? "bg-brand-600 text-white" : "text-muted hover:text-ink"}`}>{t("dashboard.range.days", { n: r })}</button>)}
          </div>
          <GuideLink guide="getting-started#ilk-10-adim">{t("dashboard.onboarding.guide")}</GuideLink>
        </div>
      </div>
      <Onboarding originNotice={d.originNotice} mockMode={!!settings?.system?.mockMode} storeName={settings?.general?.storeName} logoMediaId={settings?.branding?.logoMediaId} adminEmail={settings?.notifications?.adminEmail} />
      {d.originNotice === "derived_origins_workers_dev" && (
        <div role="alert" className="mb-6 flex gap-3 rounded-xl border border-warn-line bg-warn-soft p-4 text-sm text-warn">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <p><strong>{t("dashboard.origin.title")}</strong> {t("dashboard.origin.body")}</p>
        </div>
      )}

      {ins.isError ? (
        <div className="mb-6 grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2"><ErrorState error={ins.error} retry={() => ins.refetch()} /></div>
          <Card title={t("dashboard.byStatus.title")}>
            {statuses.every(([, c]) => c === 0) ? <EmptyState title={t("dashboard.empty.title")} description={t("dashboard.empty.body")} /> : <StatusBar statuses={statuses.filter(([, c]) => c > 0)} />}
          </Card>
        </div>
      ) : (
        <>
          <section aria-label={t("dashboard.attention.title")} className="mb-6 rounded-xl border border-line bg-surface p-4 shadow-soft">
            <h2 className="mb-3 text-sm font-semibold">{t("dashboard.attention.title")}</h2>
            {ins.isPending ? <Skeleton className="h-12" /> : queue.length === 0 ? (
              <p className="flex items-center gap-2 text-sm text-muted"><CheckCircle2 size={18} className="text-success" aria-hidden />{t("dashboard.attention.clear")}</p>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{queue.map((a) => (
                <li key={a.key}><Link to={a.to} className={`flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 ring-1 ring-inset transition hover:brightness-95 ${TONE[a.tone]}`}>
                  <span className="text-[13px] font-medium">{t(`dashboard.attention.${a.key}` as "dashboard.attention.toShip")}</span><span className="font-display text-xl font-semibold tabular-nums">{i!.attention[a.key]}</span></Link></li>
              ))}</ul>
            )}
          </section>

          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-5">
            {ins.isPending ? [0, 1, 2, 3, 4].map((n) => <Skeleton key={n} className="h-36 rounded-xl" />) : i && <>
              <KpiCard title={t("dashboard.kpi.revenue")} icon={<Banknote size={16} />} value={money(i.kpis.revenue.cur, cur)} delta={<Delta {...i.kpis.revenue} />} spark={i.series.map((x) => x.revenue)} sub={mockCount > 0 ? t("dashboard.stat.exclMock", { n: mockCount }) : undefined} />
              <KpiCard title={t("dashboard.kpi.orders")} icon={<ShoppingBag size={16} />} value={String(i.kpis.orders.cur)} delta={<Delta {...i.kpis.orders} />} spark={i.series.map((x) => x.orders)} />
              <KpiCard title={t("dashboard.kpi.aov")} icon={<Receipt size={16} />} value={money(i.kpis.aov.cur, cur)} delta={<Delta {...i.kpis.aov} />} />
              <KpiCard title={t("dashboard.kpi.units")} icon={<Package size={16} />} value={String(i.kpis.units.cur)} delta={<Delta {...i.kpis.units} />} />
              <KpiCard title={t("dashboard.kpi.customers")} icon={<UserPlus size={16} />} value={String(i.kpis.customers.cur)} delta={<Delta {...i.kpis.customers} />} />
            </>}
          </div>
          <p className="mt-2 text-xs text-muted">{t("dashboard.vsPrev", { days })}</p>

          <div className="mt-6 grid items-start gap-6 lg:grid-cols-3">
            <Card title={t("dashboard.revenue.title")} className="lg:col-span-2">{ins.isPending ? <Skeleton className="h-64" /> : i && <RevenueChart series={i.series} previous={i.previous} currency={cur} days={days} />}</Card>
            <div className="space-y-6">
              <Card title={t("dashboard.channels.title")}>
                {ins.isPending ? <Skeleton className="h-24" /> : i && (
                  <SplitBar parts={(["website", "trendyol"] as const).map((k) => ({ key: k, label: enumLabel("source", k), value: i.channels[k].revenue, valueText: money(i.channels[k].revenue, cur), sub: t("dashboard.channels.orders", { n: i.channels[k].orders }), className: k === "website" ? "bg-brand-600" : "bg-accent-500" }))} />
                )}
              </Card>
              <Card title={t("dashboard.byStatus.title")}>
                {statuses.every(([, c]) => c === 0) ? <EmptyState title={t("dashboard.empty.title")} description={t("dashboard.empty.body")} /> : <StatusBar statuses={statuses.filter(([, c]) => c > 0)} />}
              </Card>
            </div>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            <Card title={t("dashboard.top.products")}>
              {ins.isPending ? <Skeleton className="h-40" /> : !i || i.topProducts.length === 0 ? <EmptyState icon={<Package size={22} />} title={t("dashboard.top.empty")} /> : (
                <RankBars rows={i.topProducts.map((p, n) => ({ key: p.productId ?? String(n), label: p.name, value: p.revenue, valueText: money(p.revenue, cur), sub: t("dashboard.top.units", { n: p.units }) }))} />
              )}
            </Card>
            <Card title={t("dashboard.cities.title")}>
              {ins.isPending ? <Skeleton className="h-40" /> : !i || i.topCities.length === 0 ? <EmptyState icon={<ShoppingBag size={22} />} title={t("dashboard.top.empty")} /> : (
                <RankBars rows={i.topCities.map((c) => ({ key: c.city ?? "?", label: c.city ?? "-", value: c.orders, valueText: t("dashboard.channels.orders", { n: c.orders }), sub: money(c.revenue, cur) }))} />
              )}
            </Card>
            <Card title={t("dashboard.activity.title")} actions={<Link className="text-[13px] font-medium text-brand-ink hover:underline" to="/audit">{t("dashboard.recent.viewAll")}</Link>}>
              {ins.isPending ? <Skeleton className="h-40" /> : !i || i.activity.length === 0 ? <EmptyState title={t("dashboard.activity.empty")} /> : (
                <ol className="space-y-3 border-l border-line pl-4">{i.activity.map((a) => (
                  <li key={a.id} className="relative text-sm"><span aria-hidden className="absolute -left-[21px] top-1.5 size-2.5 rounded-full bg-brand-600" /><p className="truncate">{prettify(a.action.replace(/[._]/g, " "))}{a.entity ? <span className="text-muted"> · {a.entity}</span> : null}</p><p className="text-xs text-muted">{a.admin ?? t("dashboard.activity.system")} · {timeAgo(a.at)}</p></li>
                ))}</ol>
              )}
            </Card>
          </div>
        </>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card title={t("dashboard.recent.title")} className="lg:col-span-2" actions={<Link className="inline-flex items-center gap-1 text-[13px] font-medium text-brand-ink hover:underline" to="/orders">{t("dashboard.recent.viewAll")}<ArrowUpRight size={14} /></Link>}>
          {recent.isPending ? <Skeleton className="h-40" /> : orders.length === 0 ? <EmptyState icon={<ShoppingBag size={22} />} title={t("dashboard.empty.title")} description={t("dashboard.recent.empty")} /> : (
            <Table head={[t("dashboard.recent.order"), t("common.date"), t("common.status"), t("common.total")]} caption={t("dashboard.recent.caption")}>{orders.slice(0, 8).map((o) => (
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

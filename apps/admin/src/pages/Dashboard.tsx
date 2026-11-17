import { useState, type ReactNode } from "react";
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
import { Delta, RankBars, RevenueChart, Sparkline, SplitBar } from "../components/dashboard/charts";
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

const STATUS_COLOR: Record<string, string> = { paid: "bg-data-ok", delivered: "bg-data-ok", shipped: "bg-data-info", fulfilling: "bg-data-info", pending: "bg-data-warn", awaiting_payment: "bg-data-warn", cancelled: "bg-data-bad", refunded: "bg-data-bad" };

/** Orders by status: one thin stacked bar and a dense two-column legend linking to the filtered list. */
function StatusBar({ statuses }: { statuses: (readonly [string, number])[] }) {
  const { t } = useT();
  const total = statuses.reduce((n, [, c]) => n + c, 0) || 1;
  return (
    <div>
      <div className="flex h-1.5 overflow-hidden rounded-full bg-hover" role="img" aria-label={t("dashboard.byStatus.aria")}>
        {statuses.map(([s, c]) => <span key={s} className={STATUS_COLOR[s] ?? "bg-faint"} style={{ width: `${(c / total) * 100}%` }} />)}
      </div>
      <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-0.5">{statuses.map(([s, c]) => (
        <li key={s}><Link to={`/orders?status=${s}`} className="-mx-1.5 flex items-center justify-between gap-2 rounded-md px-1.5 py-1 text-[13px] transition hover:bg-hover">
          <span className="flex min-w-0 items-center gap-2"><span aria-hidden className={`size-2 shrink-0 rounded-full ${STATUS_COLOR[s] ?? "bg-faint"}`} /><span className="truncate">{statusLabel(s)}</span></span><span className="tabular-nums text-muted">{c}</span></Link></li>
      ))}</ul>
    </div>
  );
}

function DashboardSkeleton() {
  const { t } = useT();
  return (
    <div aria-busy role="status" aria-label={t("dashboard.skeleton")} className="space-y-4">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-24 rounded-xl" />
      <div className="grid gap-4 lg:grid-cols-12"><Skeleton className="h-64 rounded-xl lg:col-span-8" /><Skeleton className="h-64 rounded-xl lg:col-span-4" /></div>
    </div>
  );
}

/** Flat panel: thin border, compact header with optional right-side control. */
function Panel({ title, actions, children, className = "", bodyClass = "p-4" }: { title: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClass?: string }) {
  return (
    <section className={`flex flex-col rounded-xl border border-line bg-surface ${className}`}>
      <header className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-line px-4"><h2 className="text-[13px] font-semibold">{title}</h2>{actions}</header>
      <div className={`min-h-0 flex-1 ${bodyClass}`}>{children}</div>
    </section>
  );
}
/** Small segmented control for switching a panel's content. */
function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="inline-flex rounded-md bg-hover p-0.5">
      {options.map((o) => <button key={o.id} type="button" role="tab" aria-selected={o.id === value} onClick={() => onChange(o.id)}
        className={`h-6 rounded px-2 text-xs font-medium transition ${o.id === value ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink"}`}>{o.label}</button>)}
    </div>
  );
}
const viewAll = (to: string, label: string) => <Link className="inline-flex items-center gap-0.5 text-xs font-medium text-muted hover:text-ink" to={to}>{label}<ArrowUpRight size={12} /></Link>;

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
const DOT = { warn: "bg-data-warn", bad: "bg-data-bad", info: "bg-data-info" } as const;
type InsightTab = "products" | "cities" | "stock" | "activity";

export default function Dashboard() {
  const { t } = useT();
  const admin = useAdmin();
  const [sp, setSp] = useSearchParams();
  const [tab, setTab] = useState<InsightTab>("products");
  const days = (RANGES as readonly number[]).includes(Number(sp.get("days"))) ? (Number(sp.get("days")) as 7 | 30 | 90) : 30;
  const q = useQuery({ queryKey: ["dashboard"], queryFn: () => api.get<DashboardData>("/api/admin/dashboard") });
  const ins = useQuery({ queryKey: ["dashboard", "insights", days], queryFn: () => api.get<Insights>(`/api/admin/dashboard/insights?days=${days}`) });
  const recent = useQuery({ queryKey: ["orders", "dashboard-recent"], queryFn: async () => mapPaged(await api.get<Paged<unknown>>("/api/admin/orders?pageSize=6"), orderRowFromApi) });
  const settings = useSettings().data;
  const cur = settings?.general?.currency ?? "TRY";
  if (q.isPending) return <DashboardSkeleton />;
  if (q.isError) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const d = q.data;
  const statuses = (Array.isArray(d.ordersByStatus) ? d.ordersByStatus.map((x) => [x.status, x.count] as const) : Object.entries(d.ordersByStatus ?? {})).filter(([, c]) => c > 0);
  const enabledHealth = d.integrationHealth?.filter((h) => h.enabled) ?? [];
  const healthBad = enabledHealth.filter((h) => !h.ok);
  const orders = recent.data?.items ?? [];
  const i = ins.data;
  const todaySales = d.salesToday && typeof d.salesToday === "object" ? (d.salesToday as { total?: number; count?: number }) : null;
  const mockCount = (d.mockSalesWeek as { count?: number } | undefined)?.count ?? 0;
  const queue = i ? ATTENTION.filter((a) => i.attention[a.key] > 0) : [];
  const first = admin?.name?.split(" ")[0];
  const kpis = i ? [
    { key: "revenue", title: t("dashboard.kpi.revenue"), value: money(i.kpis.revenue.cur, cur), k: i.kpis.revenue, spark: i.series.map((x) => x.revenue), sub: mockCount > 0 ? t("dashboard.stat.exclMock", { n: mockCount }) : undefined },
    { key: "orders", title: t("dashboard.kpi.orders"), value: String(i.kpis.orders.cur), k: i.kpis.orders, spark: i.series.map((x) => x.orders) },
    { key: "aov", title: t("dashboard.kpi.aov"), value: money(i.kpis.aov.cur, cur), k: i.kpis.aov },
    { key: "units", title: t("dashboard.kpi.units"), value: String(i.kpis.units.cur), k: i.kpis.units },
    { key: "customers", title: t("dashboard.kpi.customers"), value: String(i.kpis.customers.cur), k: i.kpis.customers },
  ] : [];
  const statusPanel = statuses.length === 0 ? <p className="text-sm text-muted">{t("dashboard.empty.body")}</p> : <StatusBar statuses={statuses} />;

  return (
    <div className="space-y-4">
      {/* header: one line */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight">{first ? t("dashboard.greeting", { name: first }) : t("dashboard.title")}</h1>
          <p className="text-[13px] text-muted">{new Date().toLocaleDateString(intlTag(), { weekday: "long", day: "numeric", month: "long" })}{todaySales && <> · {t("dashboard.today", { amount: money(pickAmount(todaySales), cur), n: todaySales.count ?? 0 })}</>}</p>
        </div>
        <div className="flex items-center gap-3">
          <div role="group" aria-label={t("dashboard.range.label")} className="inline-flex rounded-lg bg-hover p-0.5">
            {RANGES.map((r) => <button key={r} type="button" aria-pressed={r === days} onClick={() => setSp((p) => { const n = new URLSearchParams(p); r === 30 ? n.delete("days") : n.set("days", String(r)); return n; }, { replace: true })}
              className={`h-7 rounded-md px-3 text-xs font-medium transition ${r === days ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink"}`}>{t("dashboard.range.days", { n: r })}</button>)}
          </div>
          <GuideLink guide="getting-started#ilk-10-adim">{t("dashboard.onboarding.guide")}</GuideLink>
        </div>
      </div>
      <Onboarding originNotice={d.originNotice} mockMode={!!settings?.system?.mockMode} storeName={settings?.general?.storeName} logoMediaId={settings?.branding?.logoMediaId} adminEmail={settings?.notifications?.adminEmail} />
      {d.originNotice === "derived_origins_workers_dev" && (
        <div role="alert" className="flex gap-3 rounded-xl border border-warn-line bg-warn-soft p-3 text-sm text-warn">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" /><p><strong>{t("dashboard.origin.title")}</strong> {t("dashboard.origin.body")}</p>
        </div>
      )}

      {ins.isError ? (
        <ErrorState error={ins.error} retry={() => ins.refetch()} />
      ) : (
        <>
          {/* KPI strip: one surface, hairline dividers */}
          <section aria-label={t("dashboard.vsPrev", { days })} title={t("dashboard.vsPrev", { days })} className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-3 xl:grid-cols-5">
            {ins.isPending ? [0, 1, 2, 3, 4].map((n) => <div key={n} className="bg-surface p-4"><Skeleton className="h-14" /></div>) : kpis.map((k) => (
              <div key={k.key} className="flex items-end justify-between gap-3 bg-surface px-4 py-3.5">
                <div className="min-w-0">
                  <div><p className="text-xs text-muted">{k.title}</p></div>
                  <p className="mt-1 truncate text-[1.375rem] font-semibold leading-tight tracking-tight tabular-nums">{k.value}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted"><Delta {...k.k} />{k.sub}</div>
                </div>
                {k.spark && k.spark.length > 1 && <div className="hidden w-20 shrink-0 sm:block"><Sparkline values={k.spark} /></div>}
              </div>
            ))}
          </section>

          {/* trend + work queue */}
          <div className="grid items-stretch gap-4 lg:grid-cols-12">
            <section className="rounded-xl border border-line bg-surface p-4 lg:col-span-8" aria-label={t("dashboard.revenue.title")}>
              {ins.isPending ? <Skeleton className="h-56" /> : i && <RevenueChart compact series={i.series} previous={i.previous} currency={cur} days={days} />}
            </section>
            <Panel title={t("dashboard.attention.title")} className="lg:col-span-4" bodyClass="flex flex-col"
              actions={queue.length > 0 ? <span className="rounded-full bg-hover px-2 py-0.5 text-xs font-semibold tabular-nums">{queue.reduce((n, a) => n + i!.attention[a.key], 0)}</span> : undefined}>
              <div className="flex-1 px-2 py-1.5" aria-label={t("dashboard.attention.title")}>
                {ins.isPending ? <Skeleton className="m-2 h-40" /> : queue.length === 0 ? (
                  <p className="flex items-center gap-2 px-2 py-3 text-sm text-muted"><CheckCircle2 size={16} className="text-success" aria-hidden />{t("dashboard.attention.clear")}</p>
                ) : (
                  <ul>{queue.map((a) => (
                    <li key={a.key}><Link to={a.to} className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 transition hover:bg-hover">
                      <span className="flex items-center gap-2.5 text-[13px]"><span aria-hidden className={`size-2 rounded-full ${DOT[a.tone]}`} />{t(`dashboard.attention.${a.key}` as "dashboard.attention.toShip")}</span>
                      <span className="text-sm font-semibold tabular-nums">{i!.attention[a.key]}</span></Link></li>
                  ))}</ul>
                )}
              </div>
              <footer className="border-t border-line px-4 py-2.5 text-xs">
                {!enabledHealth.length ? (
                  <Link to="/integrations" className="inline-flex items-center gap-1.5 text-muted hover:text-ink"><Plug size={13} aria-hidden />{t("dashboard.health.emptyTitle")}</Link>
                ) : (
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-muted" data-testid="health-summary">
                    <span aria-hidden className={`size-2 rounded-full ${healthBad.length ? "bg-data-bad" : "bg-data-ok"}`} />
                    <Link to="/integrations" className="hover:text-ink">{t("dashboard.health.summary", { ok: enabledHealth.length - healthBad.length, n: enabledHealth.length })}</Link>
                    {healthBad.map((h) => <span key={h.provider} className="font-medium text-danger">{enumLabel("provider", h.provider)}</span>)}
                    {healthBad.length > 0 && <Link to="/integrations" className="font-medium text-danger hover:underline">{t("dashboard.health.fix")}</Link>}
                  </p>
                )}
              </footer>
            </Panel>
          </div>
        </>
      )}

      {/* orders · sales mix · insights */}
      <div className="grid items-stretch gap-4 lg:grid-cols-12">
        <Panel title={t("dashboard.recent.title")} className="lg:col-span-12 xl:col-span-5" bodyClass="px-2 py-1.5" actions={viewAll("/orders", t("dashboard.recent.viewAll"))}>
          {recent.isPending ? <Skeleton className="m-2 h-48" /> : orders.length === 0 ? <p className="px-2 py-3 text-sm text-muted">{t("dashboard.recent.empty")}</p> : (
            <ul aria-label={t("dashboard.recent.caption")}>{orders.slice(0, 6).map((o) => (
              <li key={o.id}><Link to={`/orders/${o.id}`} className="flex items-center gap-3 rounded-md px-2 py-1.5 transition hover:bg-hover">
                <span aria-hidden className={`size-2 shrink-0 rounded-full ${STATUS_COLOR[o.status] ?? "bg-faint"}`} />
                <span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-medium">{o.customerName ?? o.email ?? `#${o.number}`}{o.isMock && <span className="ml-2 text-xs font-normal text-danger">{t("dashboard.mockBadge")}</span>}</span>
                  <span className="block truncate text-xs text-muted">#{o.number} · {enumLabel("source", o.source)} · {timeAgo(o.createdAt)}</span></span>
                <span className="text-right"><span className="block text-[13px] font-medium tabular-nums">{money(o.total, o.currency)}</span><span className="block text-xs text-muted">{statusLabel(o.status)}</span></span>
              </Link></li>
            ))}</ul>
          )}
        </Panel>

        <Panel title={t("dashboard.mix.title")} className="lg:col-span-6 xl:col-span-3" bodyClass="space-y-5 p-4">
          {!ins.isError && (ins.isPending ? <Skeleton className="h-16" /> : i && (<div><h3 className="mb-2 text-xs font-medium text-muted">{t("dashboard.channels.title")}</h3>
            <SplitBar parts={(["website", "trendyol"] as const).map((k) => ({ key: k, label: enumLabel("source", k), value: i.channels[k].revenue, valueText: money(i.channels[k].revenue, cur), sub: t("dashboard.channels.orders", { n: i.channels[k].orders }), className: k === "website" ? "bg-brand-600" : "bg-accent-500" }))} /></div>
          ))}
          <div>
            <h3 className="mb-2 text-xs font-medium text-muted">{t("dashboard.byStatus.title")}</h3>
            {statusPanel}
          </div>
        </Panel>

        <Panel className="lg:col-span-6 xl:col-span-4" bodyClass="px-4 py-3"
          title={<Seg<InsightTab> label={t("dashboard.insights.label")} value={tab} onChange={setTab} options={[
            { id: "products", label: t("dashboard.insights.products") }, { id: "cities", label: t("dashboard.insights.cities") },
            { id: "stock", label: t("dashboard.insights.stock") }, { id: "activity", label: t("dashboard.insights.activity") },
          ]} />}
          actions={viewAll(tab === "activity" ? "/audit" : tab === "stock" ? "/products?stock=low&status=active" : tab === "cities" ? "/orders" : "/products", t("dashboard.recent.viewAll"))}>
          <div role="tabpanel">
            {tab === "products" && (ins.isPending ? <Skeleton className="h-40" /> : !i || i.topProducts.length === 0 ? <p className="text-sm text-muted">{t("dashboard.top.empty")}</p> : (
              <RankBars rows={i.topProducts.slice(0, 5).map((p, n) => ({ key: p.productId ?? String(n), label: p.name, value: p.revenue, valueText: money(p.revenue, cur), sub: t("dashboard.top.units", { n: p.units }) }))} />
            ))}
            {tab === "cities" && (ins.isPending ? <Skeleton className="h-40" /> : !i || i.topCities.length === 0 ? <p className="text-sm text-muted">{t("dashboard.top.empty")}</p> : (
              <RankBars rows={i.topCities.slice(0, 5).map((c) => ({ key: c.city ?? "?", label: c.city ?? "-", value: c.orders, valueText: t("dashboard.channels.orders", { n: c.orders }), sub: money(c.revenue, cur) }))} />
            ))}
            {tab === "stock" && (!d.lowStock?.length ? <p className="flex items-center gap-2 text-sm text-muted"><CheckCircle2 size={16} className="text-success" aria-hidden />{t("dashboard.lowStock.empty")}</p> : (
              <ul className="space-y-1.5">{d.lowStock.slice(0, 6).map((l, n) => (
                <li key={l.variantId ?? n} className="flex items-center justify-between gap-3 text-[13px]"><span className="min-w-0 truncate">{l.productName ?? l.name ?? l.title ?? l.sku}<span className="ml-2 text-xs text-muted">{l.sku}</span></span><span className="font-semibold tabular-nums text-warn">{l.available ?? (l.total ?? 0) - (l.reserved ?? 0)}</span></li>
              ))}</ul>
            ))}
            {tab === "activity" && (ins.isPending ? <Skeleton className="h-40" /> : !i || i.activity.length === 0 ? <p className="text-sm text-muted">{t("dashboard.activity.empty")}</p> : (
              <ul className="space-y-2">{i.activity.slice(0, 6).map((a) => (
                <li key={a.id} className="flex items-baseline justify-between gap-3 text-[13px]"><span className="min-w-0 truncate">{prettify(a.action.replace(/[._]/g, " "))}<span className="text-muted"> · {a.admin ?? t("dashboard.activity.system")}</span></span><span className="shrink-0 text-xs text-muted">{timeAgo(a.at)}</span></li>
              ))}</ul>
            ))}
          </div>
        </Panel>
      </div>

      {!!d.stockDrift?.length && (
        <Card title={t("dashboard.drift.title")}>
          <Table head={[t("dashboard.drift.sku"), t("dashboard.drift.total"), t("dashboard.drift.reserved"), t("dashboard.drift.expected")]} caption={t("dashboard.drift.caption")}>{d.stockDrift.map((l, n) => (
            <tr key={l.variantId ?? n}><Td>{l.sku}</Td><Td>{l.total}</Td><Td>{l.reserved}</Td><Td>{l.expectedReserved}</Td></tr>
          ))}</Table>
        </Card>
      )}
    </div>
  );
}

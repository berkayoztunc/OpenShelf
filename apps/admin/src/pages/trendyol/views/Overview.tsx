import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Badge, Card } from "../../../components/ui";
import { KV, Stat, TyErrorBox, TableSkeleton } from "../../../components/trendyol/views/shared";
import { api } from "../../../lib/api";
import { dateTime } from "../../../lib/format";
import { useT } from "../../../i18n";

interface Health {
  orders: { total: number; last7d: number; lastAt: string | null; withoutCargo: number; unmappedLines: number };
  reconcile: { lastRunAt: string | null };
  stock: { listings: number; errors: number; drift: number; lastPushAt: string | null; truth: "local" };
  import: { state: string; dryRun: boolean; finishedAt?: string; error?: string } | null;
  errors: { id: number; level: string; message: string; at: string | null }[];
}
export const HEALTH_KEY = ["trendyol", "health"] as const;

/** Landing tab: is the Trendyol sync healthy? Orders mirrored, cargo coverage, stock drift (OpenShelf is the truth), recent problems. */
export default function Overview() {
  const { t } = useT();
  const q = useQuery({ queryKey: HEALTH_KEY, queryFn: () => api.get<Health>("/api/admin/trendyol/health"), refetchInterval: 30_000 });
  if (q.isPending) return <TableSkeleton rows={3} />;
  if (q.error) return <TyErrorBox error={q.error} retry={() => void q.refetch()} />;
  const h = q.data;
  const warn = (n: number) => (n > 0 ? "text-warn" : "");
  return (
    <div className="space-y-5" data-testid="tdy-overview">
      <p className="rounded-xl border border-line bg-surface px-4 py-3 text-sm text-muted">{t("trendyol.overview.truth")}</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={t("trendyol.overview.orders")} value={h.orders.total} hint={t("trendyol.overview.ordersWeek", { n: h.orders.last7d })} />
        <Stat label={t("trendyol.overview.noCargo")} value={<span className={warn(h.orders.withoutCargo)}>{h.orders.withoutCargo}</span>} hint={t("trendyol.overview.noCargoHint")} />
        <Stat label={t("trendyol.overview.drift")} value={<span className={warn(h.stock.drift)}>{h.stock.drift}</span>} hint={t("trendyol.overview.driftHint")} />
        <Stat label={t("trendyol.overview.unmapped")} value={<span className={warn(h.orders.unmappedLines)}>{h.orders.unmappedLines}</span>} hint={t("trendyol.overview.unmappedHint")} />
      </div>
      <Card title={t("trendyol.overview.sync")}>
        <dl className="grid gap-4 sm:grid-cols-3">
          <KV label={t("trendyol.overview.lastReconcile")}>{h.reconcile.lastRunAt ? dateTime(h.reconcile.lastRunAt) : ""}</KV>
          <KV label={t("trendyol.overview.lastOrder")}>{h.orders.lastAt ? dateTime(h.orders.lastAt) : ""}</KV>
          <KV label={t("trendyol.overview.lastPush")}>{h.stock.lastPushAt ? dateTime(h.stock.lastPushAt) : ""}</KV>
          <KV label={t("trendyol.overview.listings")}>{String(h.stock.listings)}</KV>
          <KV label={t("trendyol.overview.listingErrors")}><span className={warn(h.stock.errors)}>{h.stock.errors}</span></KV>
          <KV label={t("trendyol.overview.import")}>{h.import ? <Badge tone={h.import.state === "done" ? "success" : h.import.state === "error" ? "danger" : "info"}>{h.import.state}</Badge> : ""}</KV>
        </dl>
        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          <Link className="text-brand-ink underline" to="/trendyol/orders">{t("trendyol.overview.goOrders")}</Link>
          <Link className="text-brand-ink underline" to="/trendyol/products">{t("trendyol.overview.goProducts")}</Link>
          <Link className="text-brand-ink underline" to="/trendyol/explorer">{t("trendyol.overview.goExplorer")}</Link>
        </div>
      </Card>
      <Card title={t("trendyol.overview.errors")}>
        {h.errors.length === 0 ? <p className="text-sm text-muted">{t("trendyol.overview.noErrors")}</p> : (
          <ul className="space-y-2 text-sm">{h.errors.map((e) => <li key={e.id} className="flex flex-wrap items-baseline gap-2"><Badge tone={e.level === "error" ? "danger" : "warning"}>{e.level}</Badge><span className="min-w-0 flex-1 break-words">{e.message}</span><span className="text-xs text-muted">{e.at ? dateTime(e.at) : ""}</span></li>)}</ul>
        )}
      </Card>
    </div>
  );
}

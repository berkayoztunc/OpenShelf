import { useState } from "react";
import { Link } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowDownToLine, ArrowUpFromLine, Globe, RefreshCw, Store } from "lucide-react";
import { Badge, Button, Card, ConfirmDialog, EmptyState, Pagination, StatTile, Table, Tabs, Td, TextField, Toggle, inputClass, useDebounced } from "../../../components/ui";
import { TableSkeleton, TyErrorBox } from "../../../components/trendyol/views/shared";
import { api, qs } from "../../../lib/api";
import { timeAgo } from "../../../lib/format";
import { SYNC_KEY, useSyncActions, type SyncList, type SyncRow, type SyncSource } from "../../../lib/trendyolSync";
import { useT } from "../../../i18n";

const FILTERS = ["all", "synced", "website_only", "errors"] as const;
type Filter = (typeof FILTERS)[number];

function SourceSelect({ value, label, disabled, onChange }: { value: SyncSource; label: string; disabled?: boolean; onChange: (v: SyncSource) => void }) {
  const { t } = useT();
  return (
    <select aria-label={label} className={`${inputClass} !h-8 !w-auto !py-0 !text-[13px]`} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value as SyncSource)}>
      <option value="local">{t("trendyolsync.source.local")}</option>
      <option value="remote">{t("trendyolsync.source.remote")}</option>
    </select>
  );
}

/** 'Senkron kontrolü' tab: pick website-only vs synced per product (or in bulk), choose content/price sources, push or pull on demand. */
export default function Sync() {
  const { t } = useT();
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState(""); const term = useDebounced(search.trim());
  const [page, setPage] = useState(1);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [askStock, setAskStock] = useState(false);
  const q = useQuery({
    queryKey: [...SYNC_KEY, "list", filter, term, page], placeholderData: keepPreviousData,
    queryFn: () => api.get<SyncList>(`/api/admin/trendyol/sync${qs({ mode: filter === "all" ? undefined : filter, search: term || undefined, page, pageSize: 25 })}`),
  });
  const { update, push, pull } = useSyncActions();
  if (q.isPending) return <TableSkeleton rows={6} />;
  if (q.error) return <TyErrorBox error={q.error} retry={() => void q.refetch()} />;
  const d = q.data; const items = d.items; const s = d.summary;
  const ids = [...picked];
  const allOnPage = items.length > 0 && items.every((r) => picked.has(r.productId));
  const toggleAll = () => setPicked((p) => { const n = new Set(p); for (const r of items) { if (allOnPage) n.delete(r.productId); else n.add(r.productId); } return n; });
  const toggleOne = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const clear = { onSuccess: () => setPicked(new Set()) };
  const busy = update.isPending;
  const rowBadge = (r: SyncRow) =>
    r.mode === "website_only" ? <Badge tone="neutral">{t(r.linked ? "trendyolsync.mode.website_only" : "trendyolsync.mode.notLinked")}</Badge>
      : r.errors ? <Badge tone="danger">{t("trendyolsync.mode.error")}</Badge>
      : r.enabled < r.variants ? <Badge tone="warning">{t("trendyolsync.mode.partial", { on: r.enabled, all: r.variants })}</Badge>
      : <Badge tone="success">{t("trendyolsync.mode.synced")}</Badge>;
  return (
    <div className="space-y-5" data-testid="tdy-sync">
      <p className="rounded-xl border border-line bg-surface px-4 py-3 text-sm text-muted">{t("trendyolsync.intro")}</p>
      {!d.available && <p className="rounded-xl border border-warn-line bg-warn-soft px-4 py-3 text-sm text-warn">{t("trendyolsync.card.unavailable")}</p>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label={t("trendyolsync.stat.synced")} value={s.synced} hint={t("trendyolsync.stat.synced.hint")} icon={<RefreshCw size={15} />} tone="success" />
        <StatTile label={t("trendyolsync.stat.websiteOnly")} value={s.websiteOnly} hint={t("trendyolsync.stat.websiteOnly.hint")} icon={<Globe size={15} />} tone="neutral" />
        <StatTile label={t("trendyolsync.stat.following")} value={s.following} hint={t("trendyolsync.stat.following.hint")} icon={<Store size={15} />} />
        <StatTile label={t("trendyolsync.stat.errors")} value={s.errors} hint={t("trendyolsync.stat.errors.hint")} icon={<AlertTriangle size={15} />} tone={s.errors ? "danger" : "neutral"} />
      </div>
      <Card title={t("trendyolsync.table.title")} description={t("trendyolsync.table.body")}>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <Tabs<Filter> label={t("trendyolsync.filter.label")} value={filter} onChange={(f) => { setFilter(f); setPage(1); }}
            tabs={FILTERS.map((id) => ({ id, label: t(`trendyolsync.filter.${id}`), count: id === "all" ? s.total : id === "synced" ? s.synced : id === "website_only" ? s.websiteOnly : s.errors }))} />
          <div className="w-full sm:w-64"><TextField label={t("trendyolsync.search.label")} placeholder={t("trendyolsync.search.placeholder")} value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} /></div>
        </div>
        {ids.length > 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-canvas px-3 py-2.5" data-testid="tdy-sync-bulk" role="region" aria-label={t("trendyolsync.bulk.label")}>
            <p className="mr-1 text-sm font-medium">{t("trendyolsync.bulk.count", { n: ids.length })}</p>
            <Button size="sm" loading={busy && update.variables?.enabled === true} onClick={() => update.mutate({ productIds: ids, enabled: true }, clear)}>{t("trendyolsync.bulk.on")}</Button>
            <Button size="sm" variant="secondary" loading={busy && update.variables?.enabled === false} onClick={() => update.mutate({ productIds: ids, enabled: false }, clear)}>{t("trendyolsync.bulk.off")}</Button>
            <label className="flex items-center gap-1.5 text-xs text-muted">{t("trendyolsync.contentSource.label")}
              <select className={`${inputClass} !h-8 !w-auto !py-0 !text-[13px]`} value="" disabled={busy} onChange={(e) => e.target.value && update.mutate({ productIds: ids, contentSource: e.target.value as SyncSource })}>
                <option value="">{t("trendyolsync.bulk.choose")}</option><option value="local">{t("trendyolsync.source.local")}</option><option value="remote">{t("trendyolsync.source.remote")}</option>
              </select></label>
            <label className="flex items-center gap-1.5 text-xs text-muted">{t("trendyolsync.priceSource.label")}
              <select className={`${inputClass} !h-8 !w-auto !py-0 !text-[13px]`} value="" disabled={busy} onChange={(e) => e.target.value && update.mutate({ productIds: ids, priceSource: e.target.value as SyncSource })}>
                <option value="">{t("trendyolsync.bulk.choose")}</option><option value="local">{t("trendyolsync.source.local")}</option><option value="remote">{t("trendyolsync.source.remote")}</option>
              </select></label>
            <Button size="sm" variant="secondary" loading={push.isPending} disabled={!d.available} onClick={() => push.mutate(ids)}><ArrowUpFromLine size={13} />{t("trendyolsync.action.push")}</Button>
            <Button size="sm" variant="secondary" loading={pull.isPending && !pull.variables?.stock} disabled={!d.available} onClick={() => pull.mutate({ productIds: ids })}><ArrowDownToLine size={13} />{t("trendyolsync.action.pull")}</Button>
            <Button size="sm" variant="ghost" disabled={!d.available} onClick={() => setAskStock(true)}>{t("trendyolsync.action.pullStock")}</Button>
            <Button size="sm" variant="ghost" onClick={() => setPicked(new Set())}>{t("trendyolsync.bulk.clear")}</Button>
          </div>
        )}
        {items.length === 0 ? <EmptyState title={t("trendyolsync.empty.title")} description={t("trendyolsync.empty.body")} />
          : <Table caption={t("trendyolsync.table.title")} minWidth="56rem" head={[
            <input key="all" type="checkbox" className="size-4 accent-[var(--color-brand-600)]" aria-label={t("trendyolsync.pick.all")} checked={allOnPage} onChange={toggleAll} />,
            t("trendyolsync.col.product"), t("trendyolsync.col.sync"), t("trendyolsync.contentSource.label"), t("trendyolsync.priceSource.label"), t("trendyolsync.col.stock"), t("trendyolsync.col.status"),
          ]}>
            {items.map((r) => {
              const on = r.mode === "synced";
              return (
                <tr key={r.productId} data-testid={`tdy-sync-row-${r.productId}`}>
                  <Td className="w-10"><input type="checkbox" className="size-4 accent-[var(--color-brand-600)]" aria-label={t("trendyolsync.pick.one", { name: r.name })} checked={picked.has(r.productId)} onChange={() => toggleOne(r.productId)} /></Td>
                  <Td>
                    <div className="flex items-center gap-3">
                      <span className="size-9 shrink-0 overflow-hidden rounded-lg bg-canvas ring-1 ring-line">{r.imageUrl && <img src={r.imageUrl} alt="" loading="lazy" className="size-full object-cover" />}</span>
                      <span className="min-w-0"><Link to={`/products/${r.productId}`} className="block truncate font-medium hover:underline">{r.name}</Link>
                        <span className="block text-xs text-muted">{t("trendyolsync.row.variants", { n: r.variants, barcodes: r.withBarcode })}</span></span>
                    </div>
                  </Td>
                  <Td><Toggle hideLabel checked={on} label={t("trendyolsync.row.toggle", { name: r.name })} onChange={(v) => update.mutate({ productIds: [r.productId], enabled: v })} /></Td>
                  <Td><SourceSelect value={r.contentSource} label={`${t("trendyolsync.contentSource.label")}: ${r.name}`} disabled={!on || busy} onChange={(v) => update.mutate({ productIds: [r.productId], contentSource: v })} /></Td>
                  <Td><SourceSelect value={r.priceSource} label={`${t("trendyolsync.priceSource.label")}: ${r.name}`} disabled={!on || busy} onChange={(v) => update.mutate({ productIds: [r.productId], priceSource: v })} /></Td>
                  <Td className="tabular-nums">{r.available}</Td>
                  <Td>{rowBadge(r)}{on && <span className="mt-1 block text-xs text-muted">{r.lastSyncedAt ? timeAgo(r.lastSyncedAt) : t("trendyolsync.never")}</span>}</Td>
                </tr>
              );
            })}
          </Table>}
        <Pagination page={d.page} pageSize={d.pageSize} total={d.total} onPage={setPage} />
      </Card>
      <ConfirmDialog open={askStock} danger title={t("trendyolsync.pullStock.title")} message={t("trendyolsync.pullStock.message")} confirmLabel={t("trendyolsync.action.pullStock")}
        loading={pull.isPending} onClose={() => setAskStock(false)} onConfirm={() => pull.mutate({ productIds: ids, stock: true }, { onSuccess: () => { setAskStock(false); setPicked(new Set()); } })} />
    </div>
  );
}

import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownToLine, ArrowUpFromLine, ArrowUpRight } from "lucide-react";
import { Badge, Button, Card, ConfirmDialog, SelectField, Skeleton, Toggle } from "../ui";
import { api } from "../../lib/api";
import { dateTime } from "../../lib/format";
import { SYNC_KEY, useSyncActions, type SyncDetail, type SyncSource, type SyncVariant } from "../../lib/trendyolSync";
import { useT } from "../../i18n";

function VariantLine({ v }: { v: SyncVariant }) {
  const { t } = useT();
  const inSync = v.enabled && v.lastSyncedStock === v.available && !v.lastError;
  return (
    <li className="py-2.5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-mono text-xs">{v.sku}</p>
          <p className="truncate text-xs text-muted">{v.barcode ? t("trendyolsync.variant.barcode", { barcode: v.barcode }) : t("trendyolsync.variant.noBarcode")}</p>
        </div>
        <div className="shrink-0 text-right">
          {!v.linked ? <Badge tone="neutral">{t("trendyolsync.variant.notLinked")}</Badge>
            : !v.enabled ? <Badge tone="neutral">{t("trendyolsync.variant.off")}</Badge>
            : v.lastError ? <Badge tone="danger">{t("trendyolsync.variant.error")}</Badge>
            : inSync ? <Badge tone="success">{t("trendyolsync.variant.ok")}</Badge>
            : <Badge tone="info">{t("trendyolsync.variant.pending")}</Badge>}
          <p className="mt-1 text-xs tabular-nums text-muted">{t("trendyolsync.variant.stock", { here: v.available, there: v.lastSyncedStock ?? "–" })}</p>
        </div>
      </div>
      {v.enabled && v.lastError && <p className="mt-1 break-words text-xs text-danger">{v.lastError}</p>}
    </li>
  );
}

/**
 * Product page card: keep this product in sync with Trendyol or website-only, pick where content and price come from, see each
 * variant's sync state, and push/pull on demand. Renders nothing for roles without Trendyol access or stores that never set it up.
 */
export function TrendyolSyncCard({ productId }: { productId: string }) {
  const { t } = useT();
  const q = useQuery({ queryKey: [...SYNC_KEY, "product", productId], queryFn: () => api.get<SyncDetail>(`/api/admin/trendyol/sync/${productId}`), retry: false });
  const { update, push, pull } = useSyncActions();
  const [askStock, setAskStock] = useState(false);
  if (q.isPending) return <Skeleton className="h-40" />;
  if (q.error || !q.data) return null; // staff role (403) or product gone
  const d = q.data;
  if (!d.available && d.linked === 0) return null; // Trendyol was never connected: keep the page quiet
  const synced = d.mode === "synced";
  const ids = [productId];
  const busy = update.isPending;
  const src = (key: "contentSource" | "priceSource") => (
    <SelectField label={t(`trendyolsync.${key}.label`)} hint={t(`trendyolsync.${key}.${d[key]}.hint`)} value={d[key]} disabled={busy}
      onChange={(e) => update.mutate({ productIds: ids, [key]: e.target.value as SyncSource })}>
      <option value="local">{t("trendyolsync.source.local")}</option>
      <option value="remote">{t("trendyolsync.source.remote")}</option>
    </SelectField>
  );
  return (
    <Card testId="product-trendyol-card" title={t("trendyolsync.card.title")}
      actions={<Badge tone={synced ? (d.errors ? "danger" : "success") : "neutral"}>{t(synced ? (d.errors ? "trendyolsync.mode.error" : "trendyolsync.mode.synced") : "trendyolsync.mode.website_only")}</Badge>}>
      <div className="space-y-4">
        {!d.available && <p className="rounded-lg bg-warn-soft p-2.5 text-xs text-warn">{t("trendyolsync.card.unavailable")}</p>}
        <Toggle checked={synced} onChange={(v) => update.mutate({ productIds: ids, enabled: v })} label={t("trendyolsync.card.toggle")}
          hint={t(synced ? "trendyolsync.card.toggle.on" : "trendyolsync.card.toggle.off")} />
        {!synced && d.withBarcode === 0 && <p className="text-xs text-warn">{t("trendyolsync.card.needBarcode")}</p>}
        {synced && (
          <>
            {src("contentSource")}
            {src("priceSource")}
            <p className="rounded-lg bg-canvas p-2.5 text-xs text-muted">{t("trendyolsync.card.stockNote")}</p>
          </>
        )}
        {d.linked > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t("trendyolsync.card.variants")}</p>
            <ul className="mt-1 divide-y divide-line">{d.variantRows.map((v) => <VariantLine key={v.variantId} v={v} />)}</ul>
          </div>
        )}
        {synced && (
          <>
            <dl className="space-y-1 text-xs text-muted">
              <div className="flex justify-between gap-3"><dt>{t("trendyolsync.card.lastPush")}</dt><dd className="text-ink">{d.lastSyncedAt ? dateTime(d.lastSyncedAt) : t("trendyolsync.never")}</dd></div>
              {(d.contentSource === "remote" || d.priceSource === "remote") && <div className="flex justify-between gap-3"><dt>{t("trendyolsync.card.lastPull")}</dt><dd className="text-ink">{d.lastPulledAt ? dateTime(d.lastPulledAt) : t("trendyolsync.never")}</dd></div>}
            </dl>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" loading={push.isPending} disabled={!d.available} onClick={() => push.mutate(ids)}><ArrowUpFromLine size={13} />{t("trendyolsync.action.push")}</Button>
              {(d.contentSource === "remote" || d.priceSource === "remote") && <Button size="sm" variant="secondary" loading={pull.isPending && !pull.variables?.stock} disabled={!d.available} onClick={() => pull.mutate({ productIds: ids })}><ArrowDownToLine size={13} />{t("trendyolsync.action.pull")}</Button>}
              <Button size="sm" variant="ghost" disabled={!d.available} onClick={() => setAskStock(true)}>{t("trendyolsync.action.pullStock")}</Button>
            </div>
          </>
        )}
        <Link to="/trendyol/sync" className="inline-flex items-center gap-1 text-xs font-medium text-brand-ink hover:underline">{t("trendyolsync.card.openControl")}<ArrowUpRight size={12} /></Link>
      </div>
      <ConfirmDialog open={askStock} danger title={t("trendyolsync.pullStock.title")} message={t("trendyolsync.pullStock.message")} confirmLabel={t("trendyolsync.action.pullStock")}
        loading={pull.isPending} onClose={() => setAskStock(false)} onConfirm={() => pull.mutate({ productIds: ids, stock: true }, { onSuccess: () => setAskStock(false) })} />
    </Card>
  );
}

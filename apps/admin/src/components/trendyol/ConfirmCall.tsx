import { AlertTriangle } from "lucide-react";
import { Button, Modal } from "../ui";
import { Term } from "../help/Term";
import { MethodChip, RiskBadge } from "./Chips";
import { loc, maskSeller, TRENDYOL_HOSTS } from "../../lib/trendyol";
import type { TrendyolEnv, TrendyolOperation } from "../../lib/trendyol";
import { useT } from "../../i18n";

/** Confirmation before a LIVE write / destructive call: operation, environment, seller, consequence. */
export function TrendyolConfirmDialog({ op, env, sellerId, loading, onConfirm, onClose }:
  { op: TrendyolOperation | null; env: TrendyolEnv; sellerId?: string; loading?: boolean; onConfirm: () => void; onClose: () => void }) {
  const { t, locale } = useT();
  const destructive = op?.risk === "destructive";
  return (
    <Modal open={!!op} onClose={onClose} title={t("trendyol.confirm.title")} wide
      footer={<><Button variant="ghost" onClick={onClose}>{t("common.cancel")}</Button>
        <Button variant={destructive ? "danger" : "primary"} className={destructive ? undefined : "!bg-warn !text-canvas"} loading={loading} onClick={onConfirm}>{t(destructive ? "trendyol.confirm.actionDestructive" : "trendyol.confirm.action")}</Button></>}>
      {op && (
        <div className="space-y-4 text-sm">
          {env === "production" && (
            <div role="alert" className="flex items-start gap-3 rounded-xl border border-danger-line bg-danger-soft p-3 text-danger">
              <AlertTriangle size={20} className="mt-0.5 shrink-0" />
              <div><p className="text-base font-bold tracking-wide">{t("trendyol.confirm.production")}</p><p className="mt-0.5">{t("trendyol.confirm.productionBody")}</p></div>
            </div>
          )}
          <dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-2">
            <dt className="text-muted">{t("trendyol.confirm.operation")}</dt>
            <dd className="min-w-0"><span className="font-medium">{loc(op.title, locale)}</span> <code className="font-mono text-xs text-muted">{op.id}</code></dd>
            <dt className="text-muted">{t("trendyol.confirm.request")}</dt>
            <dd className="flex min-w-0 flex-wrap items-center gap-2"><MethodChip method={op.method} /><code className="break-all font-mono text-xs">{TRENDYOL_HOSTS[env]}{op.path}</code></dd>
            <dt className="text-muted">{t("trendyol.confirm.risk")}</dt><dd><RiskBadge risk={op.risk} /></dd>
            <dt className="text-muted">{t("trendyol.confirm.environment")}</dt><dd>{t(env === "production" ? "trendyol.env.production" : "trendyol.env.stage")}</dd>
            <dt className="text-muted"><Term id="sellerid" /></dt><dd className="font-mono">{maskSeller(sellerId) || t("common.none")}</dd>
          </dl>
          <p className="rounded-lg bg-hover px-3 py-2 text-muted">{t(destructive ? "trendyol.confirm.consequenceDestructive" : "trendyol.confirm.consequenceWrite")}</p>
        </div>
      )}
    </Modal>
  );
}

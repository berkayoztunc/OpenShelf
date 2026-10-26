import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { Badge, Button, Spinner, Table, Td } from "../../../../components/ui";
import { Term } from "../../../../components/help/Term";
import { StatusBadge, TyErrorBox, VIEW_KEY, arr, rec, str, useTyQuery } from "../../../../components/trendyol/views/shared";
import type { TrendyolOperation } from "../../../../lib/trendyol";
import { useT } from "../../../../i18n";
import { batchFinished } from "./build";

export const POLL_MS = 2000;
const MAX_POLLS = 90;

type Run = Parameters<typeof useTyQuery>[0];
const reasonText = (v: unknown): string => (typeof v === "string" ? v : str(rec(v).message ?? rec(v).reason ?? rec(v).title ?? JSON.stringify(v)));

/** "Sonucu izle": polls getBatchRequestResult every 2 s until every item is SUCCESS/FAILED (or the batch is COMPLETED), then stops. */
export function BatchPanel({ id, label, run, op, onClose, extra }: { id: string; label: string; run: Run; op: TrendyolOperation | undefined; onClose: () => void; extra?: (items: Record<string, unknown>[]) => ReactNode }) {
  const { t } = useT();
  const qc = useQueryClient();
  const [poll, setPoll] = useState(true);
  const q = useTyQuery(run, op, { path: { batchRequestId: id } }, { refetchInterval: poll ? POLL_MS : false });
  const body = rec(q.data?.response.body);
  const items = arr(body.items);
  const done = batchFinished(body);
  const polls = useRef(0);
  useEffect(() => { if (q.dataUpdatedAt) polls.current += 1; }, [q.dataUpdatedAt]);
  const gaveUp = polls.current >= MAX_POLLS;
  const refreshed = useRef(false);
  useEffect(() => { if (done || gaveUp || q.error) setPoll(false); }, [done, gaveUp, q.error]);
  useEffect(() => { if (done && !refreshed.current) { refreshed.current = true; void qc.invalidateQueries({ queryKey: VIEW_KEY, predicate: (x) => x.queryKey[2] !== op?.id }); } }, [done, qc, op?.id]);
  const failed = items.filter((x) => x.status === "FAILED").length;

  return (
    <section className="rounded-xl border border-line bg-surface p-5 shadow-soft" aria-label={t("trendyolviews.batch.title")} data-testid="tdyv-batch">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0"><p className="text-sm font-semibold">{label}</p><p className="break-all text-xs text-muted"><Term id="batchrequest" />: <span className="font-mono">{id}</span></p></div>
        <div className="flex items-center gap-2">
          {done ? <Badge tone={failed ? "warning" : "success"}>{failed ? t("trendyolviews.batch.doneFailed", { n: failed }) : t("trendyolviews.batch.done")}</Badge>
            : <span className="inline-flex items-center gap-2 text-xs text-muted" role="status"><Spinner className="h-4 w-4" />{t("trendyolviews.batch.polling")}</span>}
          <Button variant="ghost" size="sm" aria-label={t("common.close")} onClick={onClose}><X size={14} /></Button>
        </div>
      </div>
      {q.error && !q.data && <div className="mt-3"><TyErrorBox error={q.error} retry={() => { setPoll(true); void q.refetch(); }} /></div>}
      {gaveUp && !done && <p className="mt-3 text-sm text-warn">{t("trendyolviews.batch.gaveUp")} <Button size="sm" variant="secondary" onClick={() => { setPoll(true); void q.refetch(); }}>{t("trendyolviews.batch.again")}</Button></p>}
      {items.length > 0 && (
        <div className="mt-3">
          <Table caption={t("trendyolviews.batch.title")} head={[t("trendyolviews.products.col.barcode"), t("trendyolviews.batch.col.result"), t("trendyolviews.batch.col.reasons")]}>
            {items.map((it, i) => {
              const reasons = arr(it.failureReasons).length ? (it.failureReasons as unknown[]) : [];
              return <tr key={i}><Td className="font-mono text-[13px]">{str(rec(it.requestItem).barcode ?? it.barcode)}</Td><Td><StatusBadge group="batch" value={str(it.status)} /></Td><Td className="text-sm text-danger">{reasons.length ? reasons.map(reasonText).join(" · ") : <span className="text-muted">-</span>}</Td></tr>;
            })}
          </Table>
        </div>
      )}
      {done && extra && <div className="mt-3">{extra(items)}</div>}
    </section>
  );
}

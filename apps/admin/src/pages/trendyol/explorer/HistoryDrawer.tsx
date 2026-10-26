import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { Badge, Button, ConfirmDialog, Drawer, EmptyState, ErrorState, Loading, Pagination, useToast } from "../../../components/ui";
import { MethodChip } from "../../../components/trendyol/Chips";
import { api, errMsg } from "../../../lib/api";
import { fetchHistory, HISTORY_KEY, loc, statusTone } from "../../../lib/trendyol";
import type { HistoryItem, TrendyolOperation } from "../../../lib/trendyol";
import { timeAgo } from "../../../lib/format";
import { useT } from "../../../i18n";

const PAGE_SIZE = 30;
const TONE = { success: "success", warning: "warning", danger: "danger", neutral: "neutral" } as const;

/** Recent calls (last 30 days). Clicking a row restores the operation and its query into the form. */
export function HistoryDrawer({ open, onClose, byId, onRestore, isOwner }: { open: boolean; onClose: () => void; byId: Map<string, TrendyolOperation>; onRestore: (i: HistoryItem) => void; isOwner: boolean }) {
  const { t, locale } = useT(); const toast = useToast(); const qc = useQueryClient();
  const [page, setPage] = useState(1); const [confirm, setConfirm] = useState(false);
  const q = useQuery({ queryKey: [...HISTORY_KEY, page], queryFn: () => fetchHistory(page), enabled: open });
  const clear = useMutation({
    mutationFn: () => api.del("/api/admin/trendyol/history"),
    onSuccess: () => { setConfirm(false); setPage(1); void qc.invalidateQueries({ queryKey: HISTORY_KEY }); toast.success(t("trendyol.history.cleared")); },
    onError: (e) => toast.error(errMsg(e)),
  });
  return (
    <>
      <Drawer open={open} onClose={onClose} title={t("trendyol.history.title")} subtitle={t("trendyol.history.subtitle")}
        footer={isOwner ? <Button variant="ghost" size="sm" disabled={!q.data?.items.length} onClick={() => setConfirm(true)}><Trash2 size={14} />{t("trendyol.history.clear")}</Button> : undefined}>
        {q.isPending ? <Loading /> : q.isError ? <ErrorState error={q.error} retry={() => void q.refetch()} /> :
          q.data.items.length === 0 ? <EmptyState title={t("trendyol.history.empty.title")} description={t("trendyol.history.empty.body")} /> : (
            <>
              <ul className="divide-y divide-line rounded-xl border border-line" aria-label={t("trendyol.history.title")}>
                {q.data.items.map((i) => {
                  const op = byId.get(i.operationId);
                  return (
                    <li key={i.id}>
                      <button type="button" onClick={() => onRestore(i)} className="flex w-full flex-col gap-1 px-3 py-2.5 text-left transition hover:bg-hover">
                        <span className="flex items-center gap-2"><MethodChip method={i.method} /><span className="min-w-0 flex-1 truncate text-sm font-medium">{op ? loc(op.title, locale) : i.operationId}</span><Badge tone={TONE[statusTone(i.status)]}>{i.status}</Badge></span>
                        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                          <code className="font-mono">{i.operationId}</code>
                          <span>{t("trendyol.resp.duration", { ms: i.durationMs })}</span>
                          <Badge tone={i.mock ? "danger" : "success"}>{t(i.mock ? "trendyol.resp.mock" : "trendyol.resp.live")}</Badge>
                          <span>{timeAgo(i.at)}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              <Pagination page={page} pageSize={PAGE_SIZE} total={q.data.total} onPage={setPage} />
            </>
          )}
      </Drawer>
      <ConfirmDialog open={confirm} danger loading={clear.isPending} title={t("trendyol.history.confirm.title")} message={t("trendyol.history.confirm.message")} confirmLabel={t("trendyol.history.clear")} onConfirm={() => clear.mutate()} onClose={() => setConfirm(false)} />
    </>
  );
}

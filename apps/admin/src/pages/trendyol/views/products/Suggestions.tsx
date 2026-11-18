import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { MatchReport, Suggestion } from "@openshelf/shared";
import { Badge, Button, Card, useToast } from "../../../../components/ui";
import { InlineError, TyErrorBox } from "../../../../components/trendyol/views/shared";
import { api, errMsg } from "../../../../lib/api";
import { useT } from "../../../../i18n";
import { MAPPINGS_KEY } from "./Mappings";

type Report = MatchReport & { counts: { remote: number; local: number }; truncated: boolean };
const TONE = { approved: "success", pending: "warning", rejected: "danger" } as const;

/**
 * Match suggestions (GET /api/admin/trendyol/match-suggestions): Trendyol listings that belong to unlinked local variants.
 * Reads Trendyol on demand (button), links nothing by itself: each suggestion is confirmed (POST /api/admin/trendyol/mappings).
 */
export function SuggestionsCard() {
  const { t } = useT();
  const qc = useQueryClient(); const toast = useToast();
  const [report, setReport] = useState<Report | null>(null);
  const find = useMutation({ mutationFn: () => api.get<Report>("/api/admin/trendyol/match-suggestions"), onSuccess: setReport });
  const link = useMutation({
    mutationFn: async (list: Suggestion[]) => { for (const s of list) await api.post("/api/admin/trendyol/mappings", { variantId: s.variantId, barcode: s.barcode }); return list; },
    onSuccess: (list) => {
      setReport((r) => (r ? { ...r, suggestions: r.suggestions.filter((s) => !list.some((l) => l.variantId === s.variantId)) } : r));
      void qc.invalidateQueries({ queryKey: MAPPINGS_KEY }); toast.success(t("trendyolviews.suggest.linked", { n: list.length }));
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  const list = (xs: string[]) => xs.slice(0, 6).join(", ") + (xs.length > 6 ? ` +${xs.length - 6}` : "");
  return (
    <Card title={t("trendyolviews.suggest.title")} testId="tdyv-suggest" actions={<Button size="sm" variant="secondary" loading={find.isPending} onClick={() => find.mutate()}>{t(report ? "trendyolviews.suggest.rerun" : "trendyolviews.suggest.run")}</Button>}>
      <p className="text-sm text-muted">{t("trendyolviews.suggest.body")}</p>
      {find.error && <div className="mt-3"><TyErrorBox error={find.error} retry={() => find.mutate()} /></div>}
      {report && (
        <div className="mt-4 space-y-3">
          {report.truncated && <InlineError text={t("trendyolviews.suggest.truncated")} />}
          {report.suggestions.length === 0 ? <p className="text-sm text-muted">{t("trendyolviews.suggest.none")}</p> : (
            <>
              <div className="flex items-center justify-between gap-2"><span className="text-sm font-medium">{t("trendyolviews.suggest.found", { n: report.suggestions.length })}</span>
                <Button size="sm" loading={link.isPending} onClick={() => link.mutate(report.suggestions)}>{t("trendyolviews.suggest.confirmAll", { n: report.suggestions.length })}</Button></div>
              <ul className="divide-y divide-line rounded-xl border border-line">
                {report.suggestions.map((s) => (
                  <li key={s.variantId} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                    <span className="min-w-0"><span className="block truncate font-medium">{s.label}</span><span className="block truncate text-xs text-muted"><span className="font-mono">{s.barcode}</span> · {s.title} · {t(`trendyolviews.suggest.by.${s.by}`)}</span></span>
                    <span className="flex items-center gap-2"><Badge tone={TONE[s.status]}>{t(`trendyolviews.suggest.status.${s.status}`)}</Badge>
                      <Button size="sm" variant="secondary" disabled={link.isPending} onClick={() => link.mutate([s])}>{t("trendyolviews.suggest.confirm")}</Button></span>
                  </li>
                ))}
              </ul>
            </>
          )}
          <ul className="space-y-1 text-xs text-muted">
            {report.conflicts.length > 0 && <li className="text-warn">{t("trendyolviews.suggest.conflicts", { list: list(report.conflicts.map((c) => c.barcode)) })}</li>}
            {report.staleMappings.length > 0 && <li className="text-warn">{t("trendyolviews.suggest.stale", { list: list(report.staleMappings.map((s) => s.barcode)) })}</li>}
            {report.unmatchedRemote.length > 0 && <li>{t("trendyolviews.suggest.unmatchedRemote", { n: report.unmatchedRemote.length })}</li>}
            {report.unmatchedLocal.length > 0 && <li>{t("trendyolviews.suggest.unmatchedLocal", { n: report.unmatchedLocal.length })}</li>}
          </ul>
        </div>
      )}
    </Card>
  );
}

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { CheckCircle2, PackagePlus, RefreshCw } from "lucide-react";
import { Button, Skeleton, useToast } from "../ui";
import { api, errMsg } from "../../lib/api";
import { money, timeAgo } from "../../lib/format";
import { useT } from "../../i18n";

interface MissingProduct { externalId: string; title: string; brand?: string; image?: string; barcodes: string[]; variants: number; quantity: number; salePrice: number }
interface MissingReport { runId: string; complete: boolean; startedAt: string; finishedAt?: string; imported: boolean; total: number; variants: number; items: MissingProduct[] }
interface ImportStatus { state: "queued" | "running" | "done" | "error"; dryRun: boolean; createMissing: boolean; error?: string; totals: { created: number } }
export interface MissingResponse { report: MissingReport | null; status: ImportStatus | null; running: boolean }

export const MISSING_KEY = ["trendyol", "import", "missing"] as const;
const SHOW = 5;

/**
 * Dashboard card: Trendyol products that are not on the website (from the 6-hourly dry-run scan or a manual one),
 * with one-click import as draft products. Rendered only when Trendyol is connected and the viewer is owner/admin.
 */
export function TrendyolMissing() {
  const { t } = useT();
  const qc = useQueryClient(); const toast = useToast();
  const q = useQuery({
    queryKey: MISSING_KEY, queryFn: () => api.get<MissingResponse>("/api/admin/trendyol/import/missing"),
    refetchInterval: (query) => (query.state.data?.running ? 4000 : false),
  });
  const start = useMutation({
    mutationFn: (mode: "scan" | "import") => api.post("/api/admin/trendyol/import", mode === "scan" ? { createMissing: true, dryRun: true } : { createMissing: true }),
    onSuccess: (_r, mode) => {
      toast.success(t(mode === "scan" ? "dashboard.tyMissing.scanQueued" : "dashboard.tyMissing.importQueued"));
      void qc.invalidateQueries({ queryKey: MISSING_KEY }); void qc.invalidateQueries({ queryKey: ["trendyol", "import"] });
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  if (q.isPending) return <Skeleton className="h-14 rounded-xl" />;
  if (q.isError) return null; // not connected / no permission: the card simply stays away

  const { report, status, running } = q.data;
  const importing = running && status?.createMissing && !status.dryRun;
  const missing = report?.complete && !report.imported ? report.total : 0;
  const justImported = report?.complete && report.imported && status?.state === "done" && !status.dryRun ? status.totals.created : 0;
  const scanBtn = (
    <Button size="sm" variant="ghost" disabled={running} loading={start.isPending && start.variables === "scan"} onClick={() => start.mutate("scan")}>
      <RefreshCw size={13} aria-hidden className={running && !importing ? "animate-spin" : ""} />{running && !importing ? t("dashboard.tyMissing.scanning") : t("dashboard.tyMissing.scan")}
    </Button>
  );
  const when = report?.finishedAt ? t("dashboard.tyMissing.lastScan", { ago: timeAgo(report.finishedAt) }) : null;

  // nothing missing (or never scanned): one quiet line
  if (!missing) {
    return (
      <section aria-label={t("dashboard.tyMissing.title")} data-testid="ty-missing" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-surface px-4 py-2.5 text-[13px]">
        <p className="flex min-w-0 items-center gap-2 text-muted">
          {report?.complete ? <CheckCircle2 size={15} className="shrink-0 text-success" aria-hidden /> : <PackagePlus size={15} className="shrink-0" aria-hidden />}
          <span>
            {importing ? t("dashboard.tyMissing.importing")
              : justImported ? <>{t("dashboard.tyMissing.imported", { n: justImported })} <Link to="/products?status=draft" className="font-medium text-brand-ink hover:underline">{t("dashboard.tyMissing.viewDrafts")}</Link></>
              : report?.complete ? t("dashboard.tyMissing.clear")
              : t("dashboard.tyMissing.never")}
            {when && !importing && <span className="text-faint"> · {when}</span>}
          </span>
        </p>
        {scanBtn}
      </section>
    );
  }

  const items = report!.items.slice(0, SHOW);
  return (
    <section aria-label={t("dashboard.tyMissing.title")} data-testid="ty-missing" className="rounded-xl border border-warn-line bg-surface">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-2.5">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-[13px] font-semibold"><span aria-hidden className="size-2 rounded-full bg-data-warn" />{t("dashboard.tyMissing.found", { n: missing, v: report!.variants })}</h2>
          <p className="mt-0.5 text-xs text-muted">{t("dashboard.tyMissing.body")}{when && <> · {when}</>}</p>
        </div>
        <div className="flex items-center gap-2">
          {scanBtn}
          <Button size="sm" disabled={running} loading={importing || (start.isPending && start.variables === "import")} onClick={() => start.mutate("import")}>
            <PackagePlus size={14} aria-hidden />{importing ? t("dashboard.tyMissing.importing") : t("dashboard.tyMissing.importAll", { n: missing })}
          </Button>
        </div>
      </header>
      <ul className="divide-y divide-line px-2 py-1">{items.map((m) => (
        <li key={m.externalId} className="flex items-center gap-3 px-2 py-1.5">
          {m.image ? <img src={m.image} alt="" loading="lazy" className="size-8 shrink-0 rounded object-cover ring-1 ring-line" /> : <span aria-hidden className="size-8 shrink-0 rounded bg-hover" />}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-medium">{m.title}</span>
            <span className="block truncate text-xs text-muted">{[m.brand, m.barcodes[0], t("dashboard.tyMissing.variants", { n: m.variants })].filter(Boolean).join(" · ")}</span>
          </span>
          <span className="shrink-0 text-right text-xs">
            <span className="block font-medium tabular-nums">{money(m.salePrice, "TRY")}</span>
            <span className="block text-muted">{t("dashboard.tyMissing.stock", { n: m.quantity })}</span>
          </span>
        </li>
      ))}</ul>
      {missing > SHOW && <p className="border-t border-line px-4 py-2 text-xs text-muted">{t("dashboard.tyMissing.more", { n: missing - SHOW })}</p>}
    </section>
  );
}

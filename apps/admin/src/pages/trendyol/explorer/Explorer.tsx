import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { History, ListTree } from "lucide-react";
import { Button, Card, Drawer, EmptyState, ErrorState, Skeleton } from "../../../components/ui";
import { OpTree } from "./OpTree";
import { OpWorkspace } from "./OpWorkspace";
import { HistoryDrawer } from "./HistoryDrawer";
import { loc, summaryQuery, useTrendyolCatalog, valuesFromQuery } from "../../../lib/trendyol";
import type { HistoryItem, ParamValues } from "../../../lib/trendyol";
import { useAdmin } from "../../../lib/auth";
import { useT } from "../../../i18n";

/** matchMedia is missing in jsdom: assume desktop there. */
function useDesktop(): boolean {
  const q = "(min-width: 1024px)";
  const get = () => (typeof window === "undefined" || !window.matchMedia ? true : window.matchMedia(q).matches);
  const [v, setV] = useState(get);
  useEffect(() => {
    if (!window.matchMedia) return;
    const m = window.matchMedia(q); const f = () => setV(m.matches);
    m.addEventListener("change", f); return () => m.removeEventListener("change", f);
  }, []);
  return v;
}

export default function Explorer() {
  const { t, locale } = useT();
  const cat = useTrendyolCatalog();
  const admin = useAdmin();
  const desktop = useDesktop();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [history, setHistory] = useState(false);
  const [treeOpen, setTreeOpen] = useState(false);
  const [restore, setRestore] = useState<{ n: number; values?: ParamValues }>({ n: 0 });
  const opId = params.get("op") ?? undefined;
  const op = opId ? cat.byId.get(opId) : undefined;

  const select = useCallback((id: string) => {
    const p = new URLSearchParams(params); p.set("op", id); setParams(p, { replace: false });
    setRestore((r) => ({ n: r.n + 1 })); setTreeOpen(false);
  }, [params, setParams]);

  const onRestore = (i: HistoryItem) => {
    const o = cat.byId.get(i.operationId); if (!o) return;
    const p = new URLSearchParams(params); p.set("op", i.operationId); setParams(p);
    setRestore((r) => ({ n: r.n + 1, values: valuesFromQuery(o, summaryQuery(i)) })); setHistory(false);
  };

  if (cat.isPending) return <div className="grid gap-6 lg:grid-cols-[20rem_1fr]"><Skeleton className="h-96" /><Skeleton className="h-96" /></div>;
  if (cat.error) return <ErrorState error={cat.error} retry={cat.refetch} />;
  if (!cat.operations.length) return <Card><EmptyState title={t("trendyol.explorer.noOps.title")} description={t("trendyol.explorer.noOps.body")} /></Card>;

  const tree = <OpTree ops={cat.operations} selectedId={opId} onSelect={select} search={search} onSearch={setSearch} />;
  return (
    <div className="grid gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
      {desktop && <aside aria-label={t("trendyol.tree.label")} className="lg:sticky lg:top-4 lg:self-start">{tree}</aside>}
      <section className="min-w-0 space-y-5" aria-live="polite">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {!desktop ? <Button variant="secondary" size="sm" onClick={() => setTreeOpen(true)}><ListTree size={14} />{op ? loc(op.title, locale) : t("trendyol.tree.choose")}</Button> : <span />}
          <Button variant="secondary" size="sm" onClick={() => setHistory(true)}><History size={14} />{t("trendyol.history.open")}</Button>
        </div>
        {op ? <OpWorkspace key={`${op.id}:${restore.n}`} op={op} cat={cat} initialValues={restore.values} />
          : <Card><EmptyState title={t("trendyol.explorer.pick.title")} description={t("trendyol.explorer.pick.body", { n: cat.operations.length })} /></Card>}
      </section>
      {!desktop && <Drawer open={treeOpen} onClose={() => setTreeOpen(false)} title={t("trendyol.tree.label")}>{tree}</Drawer>}
      <HistoryDrawer open={history} onClose={() => setHistory(false)} byId={cat.byId} onRestore={onRestore} isOwner={admin?.role === "owner"} />
    </div>
  );
}

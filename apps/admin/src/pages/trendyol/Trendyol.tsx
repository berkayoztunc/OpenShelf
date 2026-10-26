import { Suspense, lazy, useState } from "react";
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { RotateCcw } from "lucide-react";
import { Badge, Button, ConfirmDialog, EmptyState, Loading, PageHeader, Skeleton, Tabs, useToast } from "../../components/ui";
import { Term } from "../../components/help/Term";
import { EnvPill } from "../../components/trendyol/Chips";
import { api, errMsg } from "../../lib/api";
import { useAdmin } from "../../lib/auth";
import { maskSeller, useTrendyolCatalog } from "../../lib/trendyol";
import { useT } from "../../i18n";

const Explorer = lazy(() => import("./explorer/Explorer"));
const Products = lazy(() => import("./views/Products"));
const Orders = lazy(() => import("./views/Orders"));
const Returns = lazy(() => import("./views/Returns"));
const Questions = lazy(() => import("./views/Questions"));
const Finance = lazy(() => import("./views/Finance"));

const GUIDE: Record<string, string> = { explorer: "trendyol#api-gezgini", products: "trendyol#urunler", orders: "trendyol#son-satislar", returns: "trendyol#iadeler", questions: "trendyol#sorular", finance: "trendyol#finans" };
const TABS = ["explorer", "products", "orders", "returns", "questions", "finance"] as const;
type TabId = (typeof TABS)[number];

function StatusBar() {
  const { t } = useT();
  const cat = useTrendyolCatalog();
  const admin = useAdmin(); const toast = useToast(); const qc = useQueryClient();
  const [confirm, setConfirm] = useState(false);
  const owner = admin?.role === "owner";
  const reset = useMutation({
    mutationFn: () => api.post("/api/admin/trendyol/mock/reset"),
    onSuccess: () => { setConfirm(false); void qc.invalidateQueries({ queryKey: ["trendyol"] }); toast.success(t("trendyol.mock.resetDone")); },
    onError: (e) => toast.error(errMsg(e)),
  });
  if (cat.isPending) return <Skeleton className="mb-5 h-14" />;
  if (cat.error || !cat.mode) return null;
  if (cat.mode === "mock") return (
    <div role="status" data-testid="tdy-mode" className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-danger-line bg-danger-soft px-4 py-3 text-danger">
      <Badge tone="danger">{t("trendyol.mode.mock")}</Badge>
      <p className="min-w-0 flex-1 text-sm font-medium">{t("trendyol.mode.mockBody")} <Term id="mock" /></p>
      {owner && <Button variant="secondary" size="sm" onClick={() => setConfirm(true)}><RotateCcw size={13} />{t("trendyol.mock.reset")}</Button>}
      <ConfirmDialog open={confirm} danger loading={reset.isPending} title={t("trendyol.mock.confirm.title")} message={t("trendyol.mock.confirm.message")} confirmLabel={t("trendyol.mock.reset")} onConfirm={() => reset.mutate()} onClose={() => setConfirm(false)} />
    </div>
  );
  if (cat.mode === "live") return (
    <div role="status" data-testid="tdy-mode" className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3">
      <Badge tone="success">{t("trendyol.mode.live")}</Badge><EnvPill env={cat.env} />
      <p className="text-sm text-muted"><Term id="sellerid" />: <span className="font-mono text-ink">{maskSeller(cat.sellerId) || "—"}</span></p>
      <p className="min-w-0 flex-1 text-sm text-muted">{t(cat.env === "production" ? "trendyol.mode.liveProd" : "trendyol.mode.liveStage")}</p>
    </div>
  );
  return (
    <div role="status" data-testid="tdy-mode" className="mb-5 space-y-3 rounded-xl border border-warn-line bg-warn-soft px-4 py-3 text-warn">
      <div className="flex items-center gap-2"><Badge tone="warning">{t("trendyol.mode.disabled")}</Badge><p className="text-sm font-medium">{t(cat.reason === "integration_disabled" ? "trendyol.mode.disabledOff" : "trendyol.mode.disabledNotConfigured")}</p></div>
      <p className="text-sm">{t("trendyol.mode.disabledBody")}</p>
      <div className="flex flex-wrap gap-2">
        <Link to="/integrations?configure=trendyol" className="inline-flex h-8 items-center rounded-lg bg-brand-600 px-3 text-[13px] font-medium text-white hover:bg-brand-700">{t("trendyol.mode.configure")}</Link>
        {owner && <Link to="/settings/system" className="inline-flex h-8 items-center rounded-lg border border-line bg-surface px-3 text-[13px] font-medium text-ink hover:bg-canvas">{t("trendyol.mode.enableMock")}</Link>}
      </div>
    </div>
  );
}

export default function Trendyol() {
  const { t } = useT();
  const loc = useLocation(); const nav = useNavigate(); const admin = useAdmin();
  const seg = loc.pathname.replace(/^\/trendyol\/?/, "").split("/")[0] ?? "";
  const tab: TabId = (TABS as readonly string[]).includes(seg) ? (seg as TabId) : "explorer";
  const go = (id: TabId) => nav(id === "explorer" ? "/trendyol" : `/trendyol/${id}`);
  const header = <PageHeader title={t("trendyol.title")} description={t("trendyol.description")} guide={GUIDE[tab]} />;
  if (admin && admin.role === "staff") return <>{header}<EmptyState title={t("trendyol.forbidden.title")} description={t("trendyol.forbidden.body")} /></>;
  return (
    <>
      {header}
      <StatusBar />
      <Tabs tabs={TABS.map((id) => ({ id, label: t(`trendyol.tab.${id}`) }))} value={tab} onChange={go} label={t("trendyol.tabs.label")} />
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route index element={<Explorer />} />
          <Route path="products/*" element={<Products />} />
          <Route path="orders/*" element={<Orders />} />
          <Route path="returns/*" element={<Returns />} />
          <Route path="questions/*" element={<Questions />} />
          <Route path="finance/*" element={<Finance />} />
          <Route path="*" element={<Navigate to="/trendyol" replace />} />
        </Routes>
      </Suspense>
    </>
  );
}

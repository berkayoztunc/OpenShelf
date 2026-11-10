import { lazy, Suspense } from "react";
import { NavLink, Navigate, useParams } from "react-router-dom";
import { ArrowUpDown, House, Menu as MenuIcon } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Loading, PageHeader } from "../../components/ui";
import { useT } from "../../i18n";

const HomeProducts = lazy(() => import("./HomeProducts"));
const Menu = lazy(() => import("./Menu"));
const Merchandising = lazy(() => import("./Merchandising"));

const TABS = [
  { id: "home", C: HomeProducts, guide: "ana-sayfa-urunleri", icon: House },
  { id: "menu", C: Menu, guide: "menu", icon: MenuIcon },
  { id: "order", C: Merchandising, guide: "vitrin-siralamasi", icon: ArrowUpDown },
] as const satisfies readonly { id: string; C: unknown; guide: string; icon: LucideIcon }[];

/** Everything that decides what visitors see first: home page products, top menu and product order. */
export default function Storefront() {
  const { tab } = useParams();
  const { t } = useT();
  const cur = TABS.find((x) => x.id === tab);
  if (!cur) return <Navigate to="/storefront/home" replace />;
  return (
    <>
      <PageHeader title={t("storefront.title")} description={t("storefront.description")} guide={`store-settings#${cur.guide}`} />
      <div className="grid gap-6 lg:grid-cols-[13rem_1fr] lg:gap-10">
        <nav aria-label={t("storefront.nav.label")} className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 [scrollbar-width:none] lg:sticky lg:top-20 lg:mx-0 lg:h-fit lg:flex-col lg:overflow-visible lg:px-0">
          {TABS.map(({ id, icon: Icon }) => (
            <NavLink key={id} to={`/storefront/${id}`}
              className={({ isActive }) => `flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 text-[13px] font-medium transition-colors ${isActive ? "bg-brand-50 text-brand-700" : "text-muted hover:bg-hover hover:text-ink"}`}>
              <Icon size={16} />{t(`storefront.tab.${id}`)}
            </NavLink>
          ))}
        </nav>
        <div role="tabpanel" aria-label={t(`storefront.tab.${cur.id}`)} className="min-w-0">
          <p className="mb-5 max-w-2xl text-sm text-muted">{t(`storefront.tab.${cur.id}.description`)}</p>
          <Suspense fallback={<Loading />}><cur.C /></Suspense>
        </div>
      </div>
    </>
  );
}

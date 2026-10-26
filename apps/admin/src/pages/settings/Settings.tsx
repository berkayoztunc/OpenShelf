import { lazy, Suspense } from "react";
import { NavLink, Navigate, useParams } from "react-router-dom";
import { Activity, Bell, Palette, Scale, Search, Server, ShoppingCart, Store } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Loading, PageHeader } from "../../components/ui";
import { useT } from "../../i18n";

const General = lazy(() => import("./General"));
const Branding = lazy(() => import("./Branding"));
const Seo = lazy(() => import("./Seo"));
const Legal = lazy(() => import("./Legal"));
const Checkout = lazy(() => import("./Checkout"));
const Tracking = lazy(() => import("./Tracking"));
const Notifications = lazy(() => import("./Notifications"));
const System = lazy(() => import("./System"));

const TABS = [
  { id: "general", C: General, guide: "genel" }, { id: "branding", C: Branding, guide: "marka" },
  { id: "seo", C: Seo, guide: "seo-ayarlari" }, { id: "legal", C: Legal, guide: "yasal-metinler" },
  { id: "checkout", C: Checkout, guide: "odeme-ve-siparis" }, { id: "tracking", C: Tracking, guide: "takip-ve-reklam" },
  { id: "notifications", C: Notifications, guide: "bildirimler" },
  { id: "system", C: System, guide: "sistem" },
] as const;
type TabId = (typeof TABS)[number]["id"];

const ICONS: Record<TabId, LucideIcon> = { general: Store, branding: Palette, seo: Search, legal: Scale, checkout: ShoppingCart, tracking: Activity, notifications: Bell, system: Server };

export default function Settings() {
  const { tab } = useParams();
  const { t } = useT();
  const cur = TABS.find((t) => t.id === tab);
  if (!cur) return <Navigate to="/settings/general" replace />;
  return (
    <>
      <PageHeader title={t("settings.title")} description={t("settings.description")} guide={`store-settings#${cur.guide}`} />
      <div className="grid gap-6 lg:grid-cols-[13rem_1fr] lg:gap-10">
        <nav aria-label={t("settings.nav.label")} className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 [scrollbar-width:none] lg:sticky lg:top-20 lg:mx-0 lg:h-fit lg:flex-col lg:overflow-visible lg:px-0">
          {TABS.map(({ id }) => {
            const Icon = ICONS[id];
            return (
              <NavLink key={id} to={`/settings/${id}`}
                className={({ isActive }) => `flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 text-[13px] font-medium transition-colors ${isActive ? "bg-brand-50 text-brand-700" : "text-muted hover:bg-hover hover:text-ink"}`}>
                <Icon size={16} />{t(`settings.tab.${id}`)}
              </NavLink>
            );
          })}
        </nav>
        <div role="tabpanel" aria-label={t(`settings.tab.${cur.id}`)} className="min-w-0">
          <p className="mb-5 max-w-2xl text-sm text-muted">{t(`settings.tab.${cur.id}.description`)}</p>
          <Suspense fallback={<Loading />}><cur.C /></Suspense>
        </div>
      </div>
    </>
  );
}

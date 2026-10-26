import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { applyBrandTheme } from "@openshelf/ui";
import { ShoppingBag, BookOpen, BarChart3, ChevronRight, ClipboardList, Database, LayoutDashboard, LogOut, Menu, Package, Plug, Settings, ShieldCheck, Store, Tags, Ticket, Users, X, Zap, Inbox, FileText, Mail } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { api } from "../lib/api";
import { useAdmin } from "../lib/auth";
import { mediaUrl } from "../lib/media";
import { useSettings } from "../lib/settings";
import { unhealthyCount, useIntegrations } from "../lib/integrations";
import { cx } from "./ui";
import { useT, type MessageKey } from "../i18n";
import { enumLabel } from "../lib/format";
import { LocaleSwitch } from "./LocaleSwitch";
import { MockBanner } from "./MockBanner";
import { ThemeMenu } from "./ThemeMenu";

/** `badge: "integrations"` shows a red dot when an enabled integration is failing. Add new pages by appending to an `items` array. */
interface NavItem { to: string; labelKey: MessageKey; icon: LucideIcon; mockOnly?: boolean; badge?: "integrations" }
export const NAV_GROUPS: { titleKey: MessageKey; items: NavItem[] }[] = [
  { titleKey: "nav.group.store", items: [
    { to: "/", labelKey: "nav.dashboard", icon: LayoutDashboard },
    { to: "/orders", labelKey: "nav.orders", icon: ClipboardList },
    { to: "/invoices", labelKey: "nav.invoices", icon: FileText },
    { to: "/emails", labelKey: "nav.emails", icon: Mail },
    { to: "/products", labelKey: "nav.products", icon: Package },
    { to: "/categories", labelKey: "nav.categories", icon: Tags },
    { to: "/customers", labelKey: "nav.customers", icon: Users },
    { to: "/coupons", labelKey: "nav.coupons", icon: Ticket },
  ] },
  { titleKey: "nav.group.configuration", items: [
    { to: "/integrations", labelKey: "nav.integrations", icon: Plug, badge: "integrations" },
    { to: "/trendyol", labelKey: "nav.trendyol", icon: ShoppingBag },
    { to: "/settings", labelKey: "nav.settings", icon: Settings },
    { to: "/mock-inbox", labelKey: "nav.mockInbox", icon: Inbox, mockOnly: true },
    { to: "/integration-events", labelKey: "nav.integrationEvents", icon: Zap },
  ] },
  { titleKey: "nav.group.administration", items: [
    { to: "/security", labelKey: "nav.security", icon: ShieldCheck },
    { to: "/audit", labelKey: "nav.audit", icon: BarChart3 },
    { to: "/data", labelKey: "nav.data", icon: Database },
    { to: "/help", labelKey: "nav.help", icon: BookOpen },
  ] },
];
const TITLE_KEYS: Record<string, MessageKey> = Object.fromEntries(NAV_GROUPS.flatMap((g) => g.items.map((i) => [i.to.slice(1), i.labelKey])));

/** Persistent (non-dismissible) banner for owner/admin accounts that have not enrolled TOTP yet. */
export function MfaBanner() {
  const admin = useAdmin();
  const { t } = useT();
  if (!admin?.mfaEnrollmentRequired) return null;
  return (
    <div role="alert" className="border-b border-warn-line bg-warn-soft px-4 py-2 text-sm text-warn">
      {t("shell.mfa.required")} <NavLink to="/security" className="font-semibold underline">{t("shell.mfa.link")}</NavLink>
    </div>
  );
}

function Crumbs() {
  const { t, td } = useT();
  const { pathname } = useLocation();
  const parts = pathname.split("/").filter(Boolean);
  if (!parts.length) return <span className="text-sm font-medium">{t("nav.dashboard")}</span>;
  return (
    <nav aria-label={t("shell.breadcrumb")} className="flex min-w-0 items-center gap-1.5 text-sm">
      <Link to="/" className="text-muted transition hover:text-ink">{t("nav.crumb.home")}</Link>
      {parts.map((p, i) => {
        const label = TITLE_KEYS[p] ? t(TITLE_KEYS[p]!) : td(`nav.crumb.${p}`) !== `nav.crumb.${p}` ? td(`nav.crumb.${p}`) : p.length > 14 ? td("nav.crumb.details") : p.replace(/[-_]/g, " ").replace(/^\w/, (c) => c.toUpperCase());
        const last = i === parts.length - 1;
        return (
          <span key={i} className="flex min-w-0 items-center gap-1.5">
            <ChevronRight size={14} className="shrink-0 text-muted" aria-hidden />
            {last ? <span aria-current="page" className="truncate font-medium">{label}</span> : <Link to={"/" + parts.slice(0, i + 1).join("/")} className="text-muted transition hover:text-ink">{label}</Link>}
          </span>
        );
      })}
    </nav>
  );
}

function UserMenu({ onLogout }: { onLogout: () => void }) {
  const admin = useAdmin();
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const click = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", click); document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", click); document.removeEventListener("keydown", key); };
  }, [open]);
  const initial = (admin?.name || admin?.email || "?").charAt(0).toUpperCase();
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} aria-label={t("shell.user.menu")}
        className="flex items-center gap-2 rounded-lg p-1 pr-2 transition hover:bg-hover">
        <span className="grid size-8 place-items-center rounded-full bg-brand-600 text-sm font-semibold text-white">{initial}</span>
        <span className="hidden text-left leading-tight sm:block"><span className="block max-w-36 truncate text-[13px] font-medium">{admin?.name || admin?.email}</span><span className="block text-[11px] text-muted">{admin?.role ? enumLabel("role", admin.role) : ""}</span></span>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-30 mt-2 w-60 overflow-hidden rounded-xl border border-line bg-raised shadow-lift">
          <div className="border-b border-line px-4 py-3"><p className="truncate text-sm font-medium">{admin?.name}</p><p className="truncate text-xs text-muted">{admin?.email}</p></div>
          <Link role="menuitem" to="/security" onClick={() => setOpen(false)} className="flex items-center gap-2.5 px-4 py-2.5 text-sm transition hover:bg-hover"><ShieldCheck size={16} className="text-muted" />{t("shell.user.security")}</Link>
          <button role="menuitem" onClick={onLogout} className="flex w-full items-center gap-2.5 border-t border-line px-4 py-2.5 text-left text-sm text-danger transition hover:bg-danger-soft"><LogOut size={16} />{t("shell.user.signOut")}</button>
        </div>
      )}
    </div>
  );
}

export function Layout() {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  const nav = useNavigate();
  const qc = useQueryClient();
  const settings = useSettings();
  const admin = useAdmin();
  const integrations = useIntegrations(admin?.role !== "staff");
  const badges = { integrations: unhealthyCount(integrations.data ?? [], !!settings.data?.system?.mockMode) };

  useEffect(() => setOpen(false), [loc.pathname]);
  useEffect(() => { if (settings.data?.branding) applyBrandTheme(settings.data.branding); }, [settings.data?.branding]);

  const logout = useMutation({
    mutationFn: () => api.post("/api/admin/auth/logout"),
    onSettled: () => { api.setCsrf(null); qc.clear(); nav("/login", { replace: true }); },
  });

  const name = settings.data?.general.storeName ?? "OpenShelf";
  const logoId = settings.data?.branding?.logoMediaId;
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[15rem_1fr]">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-2 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2">{t("shell.skip")}</a>
      <aside data-app-chrome className={cx("fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-line bg-surface transition-transform duration-200 lg:sticky lg:top-0 lg:h-screen lg:translate-x-0", open ? "translate-x-0 shadow-lift" : "-translate-x-full")}
        aria-label={t("shell.nav.primary")}>
        <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-line px-4">
          <Link to="/" className="flex min-w-0 items-center gap-2.5">
            {logoId ? <img src={mediaUrl(logoId)} alt="" className="size-8 shrink-0 rounded-lg bg-canvas object-contain" /> : <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand-600 text-white"><Store size={17} /></span>}
            <span className="min-w-0 leading-tight"><span className="block truncate font-display text-[15px] font-semibold">{name}</span><span className="block text-[11px] text-muted">{t("shell.caption")}</span></span>
          </Link>
          <button className="grid size-8 place-items-center rounded-lg text-muted hover:bg-hover lg:hidden" aria-label={t("shell.nav.close")} onClick={() => setOpen(false)}><X size={18} /></button>
        </div>
        <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
          {NAV_GROUPS.map((g) => {
            const items = g.items.filter((n) => !n.mockOnly || settings.data?.system?.mockMode);
            return (
              <div key={g.titleKey}>
                <p className="mb-1.5 px-2 text-[11px] font-semibold uppercase tracking-wider text-muted">{t(g.titleKey)}</p>
                <div className="space-y-0.5">
                  {items.map((n) => (
                    <NavLink key={n.to} to={n.to} end={n.to === "/"}
                      className={({ isActive }) => cx("group relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors",
                        isActive ? "bg-brand-50 text-brand-700 dark:text-brand-ink" : "text-muted hover:bg-hover hover:text-ink")}>
                      {({ isActive }) => (<>
                        {isActive && <span aria-hidden className="absolute -left-3 top-1.5 h-6 w-1 rounded-r bg-brand-600" />}
                        <n.icon size={17} className={cx("shrink-0 transition-colors", isActive ? "text-brand-ink" : "text-muted group-hover:text-ink")} />{t(n.labelKey)}
                        {n.badge === "integrations" && badges.integrations > 0 && <span data-testid="integrations-alert" className="ml-auto inline-flex items-center gap-1 rounded-full bg-danger-soft px-1.5 py-0.5 text-[11px] font-semibold leading-none text-danger ring-1 ring-inset ring-danger-line"><span aria-hidden className="size-1.5 rounded-full bg-data-bad" />{badges.integrations}<span className="sr-only">{t("shell.integrationsFailing")}</span></span>}
                      </>)}
                    </NavLink>
                  ))}
                </div>
              </div>
            );
          })}
        </nav>
      </aside>
      {open && <div className="fixed inset-0 z-30 bg-[var(--os-scrim)] backdrop-blur-[2px] lg:hidden" onClick={() => setOpen(false)} aria-hidden />}
      <div className="min-w-0">
        <header data-app-chrome className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-line bg-[var(--os-glass)] px-4 backdrop-blur-xl sm:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <button className="grid size-9 place-items-center rounded-lg text-ink transition hover:bg-hover lg:hidden" aria-expanded={open} aria-label={t("shell.nav.toggle")} onClick={() => setOpen((o) => !o)}><Menu size={20} /></button>
            <Crumbs />
          </div>
          <div className="flex items-center gap-1">
            <LocaleSwitch className="mr-1 hidden sm:inline-flex" />
            <ThemeMenu />
            <UserMenu onLogout={() => logout.mutate()} />
          </div>
        </header>
        <MockBanner />
        <MfaBanner />
        <main id="main" tabIndex={-1} className="page-in mx-auto max-w-6xl p-4 outline-none sm:p-6 lg:p-8" key={loc.pathname.split("/")[1] ?? ""}><Outlet /></main>
      </div>
    </div>
  );
}

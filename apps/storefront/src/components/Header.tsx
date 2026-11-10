import { useEffect, useState, type FormEvent } from "react";
import { NavLink, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ThemeMenu } from "./ThemeMenu";
import { api } from "../api/client";
import { useCart } from "../cart/CartContext";
import { useI18n } from "../i18n";
import { BagIcon, SearchIcon } from "../lib/Icons";
import { useConfig } from "../store/ConfigContext";
import { Logo } from "./Logo";
import { buildMenu, type MenuLink, type MenuNode } from "../lib/menu";

const navCls = ({ isActive }: { isActive: boolean }) =>
  `relative py-2 text-sm font-medium transition-colors after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:origin-left after:rounded-full after:bg-brand-600 after:transition-transform after:duration-300 ${isActive ? "text-ink after:scale-x-100" : "text-muted after:scale-x-0 hover:text-ink hover:after:scale-x-100"}`;
const dropCls = ({ isActive }: { isActive: boolean }) =>
  `block rounded-lg px-3 py-2 text-sm transition-colors hover:bg-hover ${isActive ? "font-semibold text-ink" : "text-muted hover:text-ink"}`;
const chipCls = ({ isActive }: { isActive: boolean }) =>
  `chip ${isActive ? "border-brand-600 bg-brand-600 text-white" : "border-line bg-surface text-muted"}`;

export function Header() {
  const { t, locale, setLocale } = useI18n();
  const { locales, config } = useConfig();
  const { totals, setDrawerOpen } = useCart();
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const [q, setQ] = useState(sp.get("q") ?? "");
  const [searchOpen, setSearchOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const cats = useQuery({ queryKey: ["categories"], queryFn: api.categories, staleTime: 5 * 60_000 });

  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on(); window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    nav(q.trim() ? `/products?q=${encodeURIComponent(q.trim())}` : "/products");
    setSearchOpen(false);
  };
  const searchForm = (
    <form role="search" onSubmit={submit} className="relative w-full">
      <label htmlFor="site-search" className="sr-only">{t("search.label")}</label>
      <input id="site-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("search.placeholder")} className="field rounded-full bg-canvas pr-11 pl-4" enterKeyHint="search" />
      <button type="submit" className="absolute right-0 top-0 inline-flex size-11 items-center justify-center text-muted transition hover:text-ink" aria-label={t("search.submit")}><SearchIcon size={18} /></button>
    </form>
  );
  const menu = buildMenu(config.menu, cats.data ?? [], locale, t("nav.products"));
  /** Mobile chips: a flat row, sub-categories follow their parent. */
  const chips: MenuLink[] = menu.flatMap((n) => [n, ...n.children]);

  return (
    <header className={`sticky top-0 z-40 border-b bg-canvas/80 backdrop-blur-xl transition-shadow duration-300 ${scrolled ? "border-line shadow-[0_8px_24px_-16px_rgb(28_25_23/.25)]" : "border-transparent"}`}>
      <div className="container-x flex h-[68px] items-center gap-2 sm:gap-3">
        <Logo />
        <nav aria-label={t("nav.menu")} className="ml-6 hidden items-center gap-7 md:flex">
          {menu.map((n) => <DesktopItem key={n.key} node={n} />)}
        </nav>
        <div className="ml-auto hidden w-64 lg:block xl:w-72">{searchForm}</div>
        <button className="icon-btn ml-auto lg:hidden" aria-label={t("search.label")} aria-expanded={searchOpen} onClick={() => setSearchOpen((v) => !v)}><SearchIcon /></button>
        {locales.length > 1 && (
          <button className="icon-btn text-xs font-bold uppercase tracking-wide" aria-label={`${t("lang.switch")}: ${locale}`} onClick={() => setLocale(locale === "tr" ? "en" : "tr")}>{locale === "tr" ? "EN" : "TR"}</button>
        )}
        <ThemeMenu />
        <button className="icon-btn relative" aria-label={`${t("nav.cart")} (${t("cart.items", { n: totals.itemCount })})`} onClick={() => setDrawerOpen(true)}>
          <BagIcon />
          {totals.itemCount > 0 && (
            <span key={totals.itemCount} className="absolute right-0.5 top-0.5 grid h-[18px] min-w-[18px] animate-[os-rise_.3s_ease-out] place-items-center rounded-full bg-accent-500 px-1 text-[11px] font-bold leading-none text-stone-900 ring-2 ring-canvas" aria-hidden>{totals.itemCount}</span>
          )}
        </button>
      </div>
      {searchOpen && <div className="container-x pb-3 lg:hidden">{searchForm}</div>}
      <nav aria-label={t("nav.menu")} className="container-x flex gap-2 overflow-x-auto pb-3 [scrollbar-width:none] md:hidden">
        {chips.map((c) => c.to
          ? <NavLink key={c.key} to={c.to} end={c.to === "/products"} className={chipCls} {...(c.newTab ? { target: "_blank", rel: "noopener noreferrer" } : {})}>{c.label}</NavLink>
          : <a key={c.key} href={c.href} className="chip border-line bg-surface text-muted" {...(c.newTab ? { target: "_blank", rel: "noopener noreferrer" } : {})}>{c.label}</a>)}
      </nav>
    </header>
  );
}

function ItemLink({ link, cls }: { link: MenuLink; cls: ({ isActive }: { isActive: boolean }) => string }) {
  const ext = link.newTab ? { target: "_blank", rel: "noopener noreferrer" } : {};
  if (link.to) return <NavLink to={link.to} end={link.to === "/products"} className={cls} {...ext}>{link.label}</NavLink>;
  return <a href={link.href} className={cls({ isActive: false })} {...ext}>{link.label}</a>;
}

/** A top-level item; with sub-categories it opens a dropdown on hover and keyboard focus. */
function DesktopItem({ node }: { node: MenuNode }) {
  if (node.children.length === 0) return <ItemLink link={node} cls={navCls} />;
  return (
    <div className="group relative">
      <ItemLink link={node} cls={navCls} />
      <ul className="invisible absolute left-1/2 top-full z-50 min-w-48 -translate-x-1/2 translate-y-1 rounded-xl border border-line bg-raised p-1.5 opacity-0 shadow-lift transition duration-150 group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100">
        {node.children.map((c) => <li key={c.key}><ItemLink link={c} cls={dropCls} /></li>)}
      </ul>
    </div>
  );
}

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

const navCls = ({ isActive }: { isActive: boolean }) =>
  `relative py-2 text-sm font-medium transition-colors after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:origin-left after:rounded-full after:bg-brand-600 after:transition-transform after:duration-300 ${isActive ? "text-ink after:scale-x-100" : "text-muted after:scale-x-0 hover:text-ink hover:after:scale-x-100"}`;
const chipCls = ({ isActive }: { isActive: boolean }) =>
  `chip ${isActive ? "border-brand-600 bg-brand-600 text-white" : "border-line bg-surface text-muted"}`;

export function Header() {
  const { t, locale, setLocale } = useI18n();
  const { locales } = useConfig();
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
  const top = (cats.data ?? []).filter((c) => !c.parentId);

  return (
    <header className={`sticky top-0 z-40 border-b bg-canvas/80 backdrop-blur-xl transition-shadow duration-300 ${scrolled ? "border-line shadow-[0_8px_24px_-16px_rgb(28_25_23/.25)]" : "border-transparent"}`}>
      <div className="container-x flex h-[68px] items-center gap-2 sm:gap-3">
        <Logo />
        <nav aria-label={t("nav.menu")} className="ml-6 hidden items-center gap-7 md:flex">
          <NavLink to="/products" end className={navCls}>{t("nav.products")}</NavLink>
          {top.slice(0, 4).map((c) => <NavLink key={c.id} to={`/category/${c.slug}`} className={navCls}>{c.name}</NavLink>)}
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
        <NavLink to="/products" end className={chipCls}>{t("nav.products")}</NavLink>
        {top.map((c) => <NavLink key={c.id} to={`/category/${c.slug}`} className={chipCls}>{c.name}</NavLink>)}
      </nav>
    </header>
  );
}

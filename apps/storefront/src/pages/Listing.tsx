import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { api } from "../api/client";
import { Pagination } from "../components/Pagination";
import { ProductGrid, ProductGridSkeleton } from "../components/ProductCard";
import { useI18n } from "../i18n";
import { absUrl, useHead } from "../lib/head";
import { breadcrumbLd, jsonLdEnabled, lowestPrice, pageTitle, siteHead } from "../lib/seo";
import { SearchIcon } from "../lib/Icons";
import { useConfig } from "../store/ConfigContext";
import { getConsent, onConsentChange, track } from "../tracking";

const PAGE_SIZE = 12;
const SORTS = ["newest", "price_asc", "price_desc"] as const;

export default function Listing() {
  const { t } = useI18n();
  const { config } = useConfig();
  const { slug } = useParams();
  const [sp, setSp] = useSearchParams();
  const q = sp.get("q") ?? "";
  const sort = sp.get("sort") ?? "newest";
  const page = Math.max(1, Number(sp.get("page")) || 1);
  const category = slug ?? sp.get("category") ?? undefined;

  const cats = useQuery({ queryKey: ["categories"], queryFn: api.categories, staleTime: 5 * 60_000 });
  const res = useQuery({
    queryKey: ["products", { category, q, sort, page }],
    queryFn: () => api.products({ category, q, sort, page, pageSize: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });
  const activeCat = cats.data?.find((c) => c.slug === category);
  const heading = q ? t("list.searchTitle", { q }) : activeCat?.name ?? t("list.title");
  const seo = activeCat?.seo ?? res.data?.seo;
  const sorted = sp.has("sort") && sort !== "newest";
  const filtered = !!q || sorted || sp.has("sort");
  // Canonical: clean path (+ ?page=n for pagination); `?category=` on /products canonicalises to /category/:slug.
  const basePath = slug ? `/category/${slug}` : category && activeCat ? `/category/${category}` : "/products";
  const canonical = `${location.origin}${basePath}${page > 1 ? `?page=${page}` : ""}`;
  const pageUrl = (n: number) => `${location.origin}${basePath}${n > 1 ? `?page=${n}` : ""}`;
  const pages = res.data ? Math.max(1, Math.ceil(res.data.total / (res.data.pageSize || PAGE_SIZE))) : 1;
  const base = seo?.title || pageTitle(config, heading);
  useHead({
    title: page > 1 ? `${base} (${t("page.of", { p: page, n: pages })})` : base,
    description: seo?.description || config.general.description || undefined,
    image: absUrl(seo?.image) ?? absUrl(config.seo.defaultOgUrl), url: seo?.canonical && page === 1 ? seo.canonical : canonical,
    noindex: filtered || !!seo?.noindex, prev: !filtered && page > 1 ? pageUrl(page - 1) : null, next: !filtered && page < pages ? pageUrl(page + 1) : null,
    ...siteHead(config),
    jsonLd: jsonLdEnabled(config) && !filtered && res.data?.items.length ? [
      breadcrumbLd([{ name: t("product.home"), url: `${location.origin}/` }, ...(activeCat ? [{ name: activeCat.name, url: `${location.origin}/category/${activeCat.slug}` }] : [{ name: t("list.title"), url: `${location.origin}/products` }])]),
      { "@context": "https://schema.org", "@type": "ItemList", itemListElement: res.data.items.map((p, i) => ({ "@type": "ListItem", position: (page - 1) * PAGE_SIZE + i + 1, url: `${location.origin}/product/${p.slug}`, name: p.title })) },
    ] : null,
  });

  // Analytics: view_item_list (+ search). Keyed per result set; channels dedupe across consent flips.
  const [, bump] = useState(0);
  useEffect(() => onConsentChange(() => bump((n) => n + 1)), []);
  const consent = getConsent();
  const items = res.data?.items;
  useEffect(() => {
    if (!items || res.isPlaceholderData) return;
    const key = `${category ?? ""}|${q}|${sort}|${page}`;
    track("view_item_list", {
      currency: config.general.currency,
      items: items.map((p) => ({ id: p.variants?.[0]?.id ?? p.id, name: p.title, price: (lowestPrice(p) ?? 0) / 100, quantity: 1, category: p.category?.name })),
    }, { dedupeKey: key });
    if (q) track("search", { search_term: q }, { dedupeKey: `${q}|${page}` });
  }, [items, res.isPlaceholderData, category, q, sort, page, config.general.currency, consent.analytics, consent.marketing]);

  const update = (patch: Record<string, string | undefined>) => {
    const n = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(patch)) { if (v) n.set(k, v); else n.delete(k); }
    if (!("page" in patch)) n.delete("page");
    setSp(n);
  };

  return (
    <>
      <div className="border-b border-line bg-surface">
        <div className="container-x py-8 sm:py-12">
          <p className="eyebrow">{activeCat ? t("home.categories") : t("nav.products")}</p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight sm:text-5xl">{heading}</h1>
          {res.data && <p className="mt-2 text-sm text-muted" aria-live="polite">{t("list.count", { n: res.data.total })}</p>}
        </div>
      </div>
      <div className="container-x py-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <nav aria-label={t("list.filters")} className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:flex-wrap md:px-0">
            <FilterChip active={!category} to={() => { const n = new URLSearchParams(sp); n.delete("category"); n.delete("page"); return n; }} label={t("list.allCategories")}/>
            {(cats.data ?? []).map((c) => (
              <FilterChip key={c.id} active={category === c.slug} label={c.name} to={() => { const n = new URLSearchParams(sp); n.set("category", c.slug); n.delete("page"); return n; }} />
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <label className="sr-only" htmlFor="sort">{t("list.sort")}</label>
            <select id="sort" className="field !w-auto cursor-pointer !rounded-full !pr-8" value={SORTS.includes(sort as never) ? sort : "newest"} onChange={(e) => update({ sort: e.target.value === "newest" ? undefined : e.target.value })}>
              {SORTS.map((s) => <option key={s} value={s}>{t(`sort.${s}`)}</option>)}
            </select>
          </div>
        </div>
        <div className={`mt-8 transition-opacity duration-300 ${res.isFetching && res.isPlaceholderData ? "opacity-60" : ""}`} aria-busy={res.isFetching}>
          {res.isLoading ? <ProductGridSkeleton /> : res.isError ? <p role="alert" className="py-16 text-center text-muted">{t("list.error")}</p>
            : res.data && res.data.items.length ? <ProductGrid products={res.data.items} /> : (
              <div className="py-20 text-center">
                <span className="mx-auto grid size-16 place-items-center rounded-full bg-brand-50 text-brand-ink"><SearchIcon size={26} /></span>
                <p className="mt-5 text-muted">{t("list.empty")}</p>
                <Link to="/products" className="btn-primary mt-6">{t("list.allCategories")}</Link>
              </div>
            )}
        </div>
        {res.data && <Pagination page={page} total={res.data.total} pageSize={res.data.pageSize || PAGE_SIZE} onPage={(p) => { update({ page: p > 1 ? String(p) : undefined }); window.scrollTo({ top: 0 }); }} />}
      </div>
    </>
  );
}

function FilterChip({ active, label, to }: { active: boolean; label: string; to: () => URLSearchParams }) {
  // On /category/:slug the slug lives in the path; switching category moves to /products?category=.
  const qs = to().toString();
  return (
    <Link to={`/products${qs ? `?${qs}` : ""}`} aria-current={active ? "true" : undefined}
      className={`chip ${active ? "border-brand-600 bg-brand-600 text-white shadow-sm" : "border-line bg-surface hover:border-ink/40"}`}>
      {label}
    </Link>
  );
}

import { useEffect, useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Banner } from "../components/Banner";
import { ProductGrid, ProductGridSkeleton } from "../components/ProductCard";
import { TrustBar } from "../components/TrustBar";
import { api } from "../api/client";
import type { ProductSummary } from "../api/types";
import { useI18n } from "../i18n";
import { useHead, absUrl } from "../lib/head";
import { ArrowIcon } from "../lib/Icons";
import { CategoryCard } from "../components/CategoryCard";
import { homeDescription, jsonLdEnabled, pageTitle, siteHead } from "../lib/seo";
import { useConfig } from "../store/ConfigContext";
import { homePlan } from "../lib/homeProducts";

/** Products fetched per infinite-scroll step. */
const PAGE_SIZE = 12;

export default function Home() {
  const { t, locale } = useI18n();
  const { config } = useConfig();
  const plan = homePlan(config.homepage, locale);
  const cats = useQuery({ queryKey: ["categories"], queryFn: api.categories });
  // Curated (manual) selection: those products lead the grid, then the default-ordered feed continues below them.
  const curated = useQuery({
    queryKey: ["products", "home", "curated", plan.ids],
    queryFn: () => api.products({ ids: plan.ids!, pageSize: 60 }),
    enabled: !!plan.ids,
  });
  // Default-ordered catalogue, loaded page by page as the shopper scrolls; stops when every product is shown.
  const feed = useInfiniteQuery({
    queryKey: ["products", "home", "feed", config.merchandising?.defaultSort ?? "", PAGE_SIZE],
    queryFn: ({ pageParam }) => api.products({ page: pageParam, pageSize: PAGE_SIZE }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page * last.pageSize < last.total ? last.page + 1 : undefined),
  });
  useHead({
    title: pageTitle(config), description: homeDescription(config), image: absUrl(config.seo.defaultOgUrl), url: `${location.origin}/`, ...siteHead(config),
    jsonLd: jsonLdEnabled(config) ? [
      { "@context": "https://schema.org", "@type": "Organization", name: config.general.storeName, url: location.origin, logo: absUrl(config.branding.logoUrl) },
      { "@context": "https://schema.org", "@type": "WebSite", name: config.general.storeName, url: location.origin, potentialAction: { "@type": "SearchAction", target: `${location.origin}/products?q={search_term_string}`, "query-input": "required name=search_term_string" } },
    ] : null,
  });

  // Curated first, then the feed; each product once (curated ones are skipped when the feed reaches them).
  const gridItems = useMemo(() => {
    const seen = new Map<string, ProductSummary>();
    for (const p of curated.data?.items ?? []) seen.set(p.id, p);
    for (const page of feed.data?.pages ?? []) for (const p of page.items) if (!seen.has(p.id)) seen.set(p.id, p);
    return [...seen.values()];
  }, [curated.data, feed.data]);

  const { hasNextPage, isFetchingNextPage, fetchNextPage } = feed;
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasNextPage || typeof IntersectionObserver === "undefined") return;
    // Start loading well before the end of the grid so scrolling does not hit a wall.
    const io = new IntersectionObserver(([e]) => { if (e?.isIntersecting && !isFetchingNextPage) void fetchNextPage(); }, { rootMargin: "800px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const loading = feed.isLoading || (!!plan.ids && curated.isLoading);
  const cardMode = config.homepage?.categoryCards === "image" ? "image" : "plain";
  const top = (cats.data ?? []).filter((c) => !c.parentId).slice(0, 4);
  const coverFor = (id: string, slug: string, own?: string | null) => own || gridItems.find((p) => p.categoryId === id || p.category?.slug === slug)?.images[0]?.url || null;
  const collage = gridItems.filter((p) => p.images[0]).slice(0, 3).map((p) => ({ url: p.images[0]!.url, title: p.title }));
  return (
    <>
      <Banner collage={collage} />
      <TrustBar />
      {top.length > 0 && (
        <section id="categories" className="container-x mt-16 scroll-mt-24 sm:mt-24" aria-labelledby="h-cats">
          <div className="max-w-xl">
            <p className="eyebrow">{t("home.shopCategory")}</p>
            <h2 id="h-cats" className="section-title mt-2">{t("home.categories")}</h2>
            <p className="mt-2 text-muted">{t("home.categoriesSub")}</p>
          </div>
          <ul className={`mt-8 grid grid-cols-2 gap-3 sm:gap-5 ${top.length === 3 ? "lg:grid-cols-3" : "lg:grid-cols-4"}`}>
            {top.map((c) => (
              <li key={c.id}><CategoryCard cat={c} mode={cardMode} cover={coverFor(c.id, c.slug, c.imageUrl)} /></li>
            ))}
          </ul>
        </section>
      )}
      <section className="container-x mb-16 mt-16 sm:mb-24 sm:mt-24" aria-labelledby="h-feat">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="max-w-xl">
            <p className="eyebrow">{t("hero.new")}</p>
            <h2 id="h-feat" className="section-title mt-2">{plan.title || t("home.featured")}</h2>
            <p className="mt-2 text-muted">{t("home.featuredSub")}</p>
          </div>
          <Link to="/products" className="link-arrow">{t("home.viewAll")}<ArrowIcon size={16} /></Link>
        </div>
        <div className="mt-8" aria-busy={loading || isFetchingNextPage}>
          {loading ? <ProductGridSkeleton /> : <ProductGrid products={gridItems} />}
          {isFetchingNextPage && <div className="mt-9"><ProductGridSkeleton n={4} /></div>}
        </div>
        <div ref={sentinel} className="mt-10 flex justify-center">
          {feed.isFetchNextPageError ? (
            <p role="alert" className="flex items-center gap-3 text-sm text-danger">{t("home.loadError")}<button type="button" className="btn-ghost" onClick={() => void fetchNextPage()}>{t("home.retry")}</button></p>
          ) : hasNextPage ? (
            // Fallback for browsers without IntersectionObserver and for keyboard users; the observer normally fires first.
            <button type="button" className="btn-ghost" disabled={isFetchingNextPage} onClick={() => void fetchNextPage()}>{t("home.loadMore")}</button>
          ) : !loading && gridItems.length > PAGE_SIZE ? (
            <p className="text-sm text-muted">{t("home.allShown")}</p>
          ) : null}
        </div>
      </section>
    </>
  );
}

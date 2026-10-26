import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Banner } from "../components/Banner";
import { ProductImage } from "../components/ProductImage";
import { ProductGrid, ProductGridSkeleton } from "../components/ProductCard";
import { TrustBar } from "../components/TrustBar";
import { api } from "../api/client";
import { useI18n } from "../i18n";
import { useHead, absUrl } from "../lib/head";
import { ArrowIcon, CATEGORY_ICONS } from "../lib/Icons";
import { homeDescription, jsonLdEnabled, pageTitle, siteHead } from "../lib/seo";
import { useConfig } from "../store/ConfigContext";

export default function Home() {
  const { t } = useI18n();
  const { config } = useConfig();
  const cats = useQuery({ queryKey: ["categories"], queryFn: api.categories });
  // One wider fetch feeds the featured grid, the hero collage and the category cover images.
  const featured = useQuery({ queryKey: ["products", "home", 24], queryFn: () => api.products({ sort: "newest", pageSize: 24 }) });
  useHead({
    title: pageTitle(config), description: homeDescription(config), image: absUrl(config.seo.defaultOgUrl), url: `${location.origin}/`, ...siteHead(config),
    jsonLd: jsonLdEnabled(config) ? [
      { "@context": "https://schema.org", "@type": "Organization", name: config.general.storeName, url: location.origin, logo: absUrl(config.branding.logoUrl) },
      { "@context": "https://schema.org", "@type": "WebSite", name: config.general.storeName, url: location.origin, potentialAction: { "@type": "SearchAction", target: `${location.origin}/products?q={search_term_string}`, "query-input": "required name=search_term_string" } },
    ] : null,
  });
  const items = featured.data?.items ?? [];
  const top = (cats.data ?? []).filter((c) => !c.parentId).slice(0, 4);
  const coverFor = (id: string, slug: string, own?: string | null) => own || items.find((p) => p.categoryId === id || p.category?.slug === slug)?.images[0]?.url || null;
  const collage = items.filter((p) => p.images[0]).slice(0, 3).map((p) => ({ url: p.images[0]!.url, title: p.title }));
  return (
    <>
      <Banner collage={collage} />
      <TrustBar />
      {top.length > 0 && (
        <section id="categories" className="container-x mt-16 scroll-mt-24 sm:mt-20" aria-labelledby="h-cats">
          <div className="max-w-xl">
            <p className="eyebrow">{t("home.shopCategory")}</p>
            <h2 id="h-cats" className="section-title mt-2">{t("home.categories")}</h2>
            <p className="mt-2 text-muted">{t("home.categoriesSub")}</p>
          </div>
          <ul className={`mt-8 grid grid-cols-2 gap-3 sm:gap-5 ${top.length === 3 ? "lg:grid-cols-3" : "lg:grid-cols-4"}`}>
            {top.map((c, idx) => {
              const cover = coverFor(c.id, c.slug, c.imageUrl);
              const Icon = CATEGORY_ICONS[idx % CATEGORY_ICONS.length]!;
              return (
                <li key={c.id}>
                  <Link to={`/category/${c.slug}`} className="group relative flex aspect-[4/5] items-end overflow-hidden rounded-2xl max-lg:aspect-[3/4] lg:aspect-[4/3] bg-brand-50 ring-1 ring-ink/[.07] transition duration-300 hover:shadow-lift">
                    {cover ? (
                      <>
                        <ProductImage src={cover} title={c.name} alt="" className="absolute inset-0 size-full object-cover transition duration-700 group-hover:scale-105" />
                        <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                      </>
                    ) : (
                      <span aria-hidden className="hero-mesh absolute inset-0 grid place-items-center">
                        <Icon size={64} strokeWidth={1.1} className="text-brand-ink/70 transition duration-500 group-hover:scale-110" />
                      </span>
                    )}
                    <span className={`relative flex w-full items-end justify-between gap-2 p-4 sm:p-5 ${cover ? "text-white" : ""}`}>
                      <span className="font-display text-xl font-semibold leading-tight sm:text-2xl">{c.name}</span>
                      <span aria-hidden className={`grid size-9 shrink-0 place-items-center rounded-full transition duration-300 group-hover:translate-x-0.5 ${cover ? "bg-white/90 text-stone-900" : "bg-brand-600 text-white"}`}><ArrowIcon size={18} /></span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}
      <section className="container-x mt-16 sm:mt-24" aria-labelledby="h-feat">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="max-w-xl">
            <p className="eyebrow">{t("hero.new")}</p>
            <h2 id="h-feat" className="section-title mt-2">{t("home.featured")}</h2>
            <p className="mt-2 text-muted">{t("home.featuredSub")}</p>
          </div>
          <Link to="/products" className="link-arrow">{t("home.viewAll")}<ArrowIcon size={16} /></Link>
        </div>
        <div className="mt-8">
          {featured.isLoading ? <ProductGridSkeleton /> : featured.data ? <ProductGrid products={items.slice(0, 8)} /> : null}
        </div>
      </section>
    </>
  );
}

import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "../api/client";
import type { ProductDetail, Variant } from "../api/types";
import { useCart } from "../cart/CartContext";
import { useMoney } from "../components/Money";
import { useI18n } from "../i18n";
import { BagIcon, CheckIcon, ChevronIcon, MinusIcon, PlusIcon, ReturnIcon, ShieldIcon, TruckIcon } from "../lib/Icons";
import { ProductImage } from "../components/ProductImage";
import { absUrl, useHead } from "../lib/head";
import { breadcrumbLd, clip, jsonLdEnabled, pageTitle, siteHead } from "../lib/seo";
import { ProductGrid } from "../components/ProductCard";
import { useConfig } from "../store/ConfigContext";
import { getConsent, onConsentChange, track } from "../tracking";
import NotFound from "./NotFound";

export function buildJsonLd(p: ProductDetail, currency: string, url: string, storeName: string) {
  const prices = p.variants.map((v) => v.price / 100);
  const inStock = p.variants.some((v) => v.available > 0);
  const offerBase = { "@type": "Offer", priceCurrency: currency, url, availability: `https://schema.org/${inStock ? "InStock" : "OutOfStock"}`, itemCondition: "https://schema.org/NewCondition" };
  const offers = p.variants.length > 1 && new Set(prices).size > 1
    ? { "@type": "AggregateOffer", priceCurrency: currency, lowPrice: Math.min(...prices), highPrice: Math.max(...prices), offerCount: p.variants.length, availability: offerBase.availability, offers: p.variants.map((v) => ({ ...offerBase, price: v.price / 100, sku: v.sku ?? v.id, availability: `https://schema.org/${v.available > 0 ? "InStock" : "OutOfStock"}` })) }
    : { ...offerBase, price: prices[0] ?? 0 };
  return {
    "@context": "https://schema.org", "@type": "Product", name: p.title, description: p.description,
    image: p.images.map((i) => absUrl(i.url)), sku: p.variants[0]?.sku ?? p.variants[0]?.id, brand: { "@type": "Brand", name: storeName }, offers,
  };
}

/** Options -> matching variant. Falls back to a flat variant list when variants carry no option map. */
function optionGroups(variants: Variant[]) {
  const groups = new Map<string, string[]>();
  for (const v of variants) for (const [k, val] of Object.entries(v.options ?? {})) {
    const arr = groups.get(k) ?? []; if (!arr.includes(val)) arr.push(val); groups.set(k, arr);
  }
  return [...groups.entries()];
}

export default function Product() {
  const { slug = "" } = useParams();
  const q = useQuery({ queryKey: ["product", slug], queryFn: () => api.product(slug), retry: (n, e) => !(e instanceof ApiError && e.status === 404) && n < 2 });
  if (q.isLoading) return <div className="container-x grid gap-8 py-10 md:grid-cols-2 lg:gap-14" aria-hidden><div className="skeleton aspect-square rounded-2xl md:aspect-[4/5]" /><div className="space-y-4"><div className="skeleton h-4 w-24" /><div className="skeleton h-10 w-2/3" /><div className="skeleton h-8 w-32" /><div className="skeleton h-11 w-full" /><div className="skeleton h-12 w-full" /></div></div>;
  if (q.isError || !q.data) return <NotFound product />;
  return <ProductView key={q.data.id} product={q.data} />;
}

function ProductView({ product: p }: { product: ProductDetail }) {
  const { t } = useI18n();
  const { config } = useConfig();
  const money = useMoney();
  const { addItem, setDrawerOpen, busy } = useCart();
  const currency = p.currency ?? config.general.currency;
  const groups = useMemo(() => optionGroups(p.variants), [p.variants]);
  const firstAvail = p.variants.find((v) => v.available > 0) ?? p.variants[0];
  const [variantId, setVariantId] = useState(firstAvail?.id ?? "");
  const [qty, setQty] = useState(1);
  const [img, setImg] = useState(0);
  const [added, setAdded] = useState(false);
  const variant = p.variants.find((v) => v.id === variantId);
  const max = Math.max(0, variant?.available ?? 0);
  const soldOut = max <= 0;

  const cats = useQuery({ queryKey: ["categories"], queryFn: api.categories, staleTime: 5 * 60_000 });
  const category = p.category ?? (() => { const c = cats.data?.find((x) => x.id === p.categoryId); return c ? { slug: c.slug, name: c.name } : null; })();

  // Resolved `seo` from the server wins; otherwise derive client-side.
  const seo = p.seo;
  const url = seo?.canonical || `${location.origin}/product/${p.slug}`;
  const crumbs = [{ name: t("product.home"), url: `${location.origin}/` }, ...(category ? [{ name: category.name, url: `${location.origin}/category/${category.slug}` }] : []), { name: p.title, url }];
  const ldProduct = buildJsonLd(p, currency, url, config.general.storeName);
  const headImage = absUrl(seo?.image ?? p.images[0]?.url) ?? absUrl(config.seo.defaultOgUrl);
  useHead({
    title: seo?.title || pageTitle(config, p.title), description: seo?.description || clip(p.description, 160) || undefined,
    image: headImage, imageAlt: p.images[0]?.alt || p.title, url, type: "product", noindex: !!seo?.noindex, ...siteHead(config),
    jsonLd: jsonLdEnabled(config) ? [ldProduct, breadcrumbLd(crumbs)] : null,
  });

  // Related products: same category, up to 4 (excluding this one).
  const related = useQuery({
    queryKey: ["products", "related", category?.slug, p.id], enabled: !!category,
    queryFn: () => api.products({ category: category!.slug, pageSize: 5 }), staleTime: 5 * 60_000,
  });
  const relatedItems = (related.data?.items ?? []).filter((x) => x.id !== p.id).slice(0, 4);

  // view_item: variant id is the item id (matches Meta feed + GA4 items)
  const [, bump] = useState(0);
  useEffect(() => onConsentChange(() => bump((n) => n + 1)), []);
  const c = getConsent();
  useEffect(() => {
    if (!variant) return;
    track("view_item", { currency, value: variant.price / 100, items: [{ id: variant.id, name: p.title, price: variant.price / 100, quantity: 1, category: category?.name, variant: variant.title }] }, { dedupeKey: variant.id });
  }, [variant, p.title, category?.name, currency, c.analytics, c.marketing]);

  const selectOption = (key: string, value: string) => {
    const cur = variant?.options ?? {};
    const want = { ...cur, [key]: value };
    const match = p.variants.find((v) => Object.entries(want).every(([k, val]) => v.options?.[k] === val))
      ?? p.variants.find((v) => v.options?.[key] === value);
    if (match) { setVariantId(match.id); setQty(1); }
  };
  const optionAvailable = (key: string, value: string) => {
    const want = { ...(variant?.options ?? {}), [key]: value };
    return p.variants.some((v) => v.available > 0 && Object.entries(want).every(([k, val]) => v.options?.[k] === val));
  };

  const add = async () => {
    if (!variant || soldOut) return;
    const cart = await addItem(variant.id, qty);
    if (!cart) return;
    track("add_to_cart", { currency, value: (variant.price * qty) / 100, items: [{ id: variant.id, name: p.title, price: variant.price / 100, quantity: qty, category: category?.name, variant: variant.title }] });
    setAdded(true); setTimeout(() => setAdded(false), 2500);
    setDrawerOpen(true);
  };

  const sale = variant?.compareAtPrice && variant.compareAtPrice > variant.price ? { was: variant.compareAtPrice, pct: Math.round((1 - variant.price / variant.compareAtPrice) * 100) } : null;
  const th = config.checkout.freeShippingThreshold;
  const cur = p.images[img];
  const [zoom, setZoom] = useState<string | undefined>();
  const stockTone = soldOut ? "bg-data-bad" : max <= 5 ? "bg-data-warn" : "bg-data-ok";

  return (
    <div className="container-x py-6 lg:py-10">
      <nav aria-label="Breadcrumb" className="mb-6 text-xs text-muted"><ol className="flex flex-wrap items-center gap-1.5">
        <li><Link to="/" className="transition hover:text-ink">{t("product.home")}</Link></li><li aria-hidden><ChevronIcon size={12} /></li>
        {category && <><li><Link to={`/category/${category.slug}`} className="transition hover:text-ink">{category.name}</Link></li><li aria-hidden><ChevronIcon size={12} /></li></>}
        <li aria-current="page" className="truncate text-ink">{p.title}</li>
      </ol></nav>
      <div className="grid gap-8 md:grid-cols-2 lg:gap-14">
        <div className="flex flex-col gap-3 lg:flex-row-reverse">
          <div
            className="group relative aspect-square flex-1 cursor-zoom-in overflow-hidden rounded-2xl bg-line ring-1 ring-ink/[.07] md:aspect-[4/5]"
            onMouseMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); setZoom(`${((e.clientX - r.left) / r.width) * 100}% ${((e.clientY - r.top) / r.height) * 100}%`); }}
            onMouseLeave={() => setZoom(undefined)} style={{ "--zo": zoom ?? "50% 50%" } as React.CSSProperties}
          >
            <ProductImage key={cur?.url ?? "none"} src={cur?.url} alt={cur?.alt} title={p.title} eager fetchPriority="high" width={800} height={1000}
              className="absolute inset-0 size-full object-cover [transform-origin:var(--zo)] transition-transform duration-300 ease-out group-hover:scale-[1.6] motion-reduce:group-hover:scale-100"
              />
            {sale && !soldOut && <span className="absolute left-4 top-4 rounded-full bg-accent-500 px-3 py-1 text-xs font-bold text-stone-900 shadow-sm">−{sale.pct}%</span>}
          </div>
          {p.images.length > 1 && (
            <ul className="grid grid-cols-5 gap-2 lg:w-20 lg:grid-cols-1 lg:content-start">
              {p.images.map((im, i) => (
                <li key={im.id ?? im.url}>
                  <button className={`relative aspect-square w-full cursor-pointer overflow-hidden rounded-xl border-2 transition duration-200 ${i === img ? "border-brand-600" : "border-transparent opacity-70 hover:opacity-100"}`} aria-label={t("product.thumb", { n: i + 1 })} aria-current={i === img} onClick={() => setImg(i)}>
                    <ProductImage src={im.url} alt="" title={p.title} className="absolute inset-0 size-full object-cover" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="md:sticky md:top-28 md:self-start">
          {category && <p className="eyebrow">{category.name}</p>}
          <h1 className="mt-2 font-display text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">{p.title}</h1>
          {variant && (
            <p className="mt-4 flex flex-wrap items-baseline gap-3">
              <span className="text-3xl font-semibold tabular-nums">{money(variant.price, currency)}</span>
              {sale && <s className="text-lg text-muted tabular-nums">{money(sale.was, currency)}</s>}
              {sale && <span className="rounded-full bg-accent-500/20 px-2.5 py-0.5 text-xs font-bold text-warn">−{sale.pct}%</span>}
            </p>
          )}

          {groups.length > 0 ? groups.map(([key, values]) => (
            <fieldset key={key} className="mt-7">
              <legend className="label capitalize">{key}{variant?.options?.[key] && <span className="ml-2 font-normal text-muted">{variant.options[key]}</span>}</legend>
              <div className="flex flex-wrap gap-2">
                {values.map((val) => {
                  const selected = variant?.options?.[key] === val;
                  const ok = optionAvailable(key, val);
                  return (
                    <button key={val} type="button" aria-pressed={selected} onClick={() => selectOption(key, val)}
                      className={`chip !min-h-11 !rounded-xl !px-5 ${selected ? "border-brand-600 bg-brand-600 text-white shadow-md" : "border-line bg-surface hover:border-ink/40"} ${!ok && !selected ? "text-muted line-through opacity-60" : ""}`}>{val}</button>
                  );
                })}
              </div>
            </fieldset>
          )) : p.variants.length > 1 && (
            <fieldset className="mt-7">
              <legend className="label">{t("product.variant")}</legend>
              <div className="flex flex-wrap gap-2">
                {p.variants.map((v) => (
                  <button key={v.id} type="button" aria-pressed={v.id === variantId} onClick={() => { setVariantId(v.id); setQty(1); }}
                    className={`chip !min-h-11 !rounded-xl !px-5 ${v.id === variantId ? "border-brand-600 bg-brand-600 text-white shadow-md" : "border-line bg-surface hover:border-ink/40"} ${v.available <= 0 && v.id !== variantId ? "text-muted line-through opacity-60" : ""}`}>{v.title}</button>
                ))}
              </div>
            </fieldset>
          )}

          <p className={`mt-6 inline-flex items-center gap-2 text-sm font-medium ${soldOut ? "text-danger" : max <= 5 ? "text-warn" : "text-success"}`} role="status">
            <span aria-hidden className={`size-2 rounded-full ${stockTone} ${!soldOut ? "animate-pulse" : ""}`} />
            {soldOut ? t("product.unavailable") : max <= 5 ? t("product.lowStock", { n: max }) : t("product.inStock")}
          </p>

          <div className="mt-5 flex items-center gap-3">
            <div className="inline-flex items-center rounded-xl border border-line bg-surface" role="group" aria-label={t("product.quantity")}>
              <button className="icon-btn" aria-label={t("cart.decrease")} disabled={qty <= 1 || soldOut} onClick={() => setQty(qty - 1)}><MinusIcon /></button>
              <span className="w-9 text-center font-medium tabular-nums" aria-live="polite">{qty}</span>
              <button className="icon-btn" aria-label={t("cart.increase")} disabled={qty >= max || soldOut} onClick={() => setQty(qty + 1)}><PlusIcon /></button>
            </div>
            <button className="btn-primary !min-h-12 flex-1 !text-base" disabled={soldOut || busy || !variant} onClick={() => void add()}>
              {added ? <CheckIcon size={18} /> : <BagIcon size={18} />}{soldOut ? t("product.soldOut") : added ? t("product.added") : t("product.addToCart")}
            </button>
          </div>

          <ul className="mt-7 grid gap-3 rounded-2xl border border-line bg-surface p-4 text-sm">
            <li className="flex items-center gap-3"><TruckIcon className="shrink-0 text-brand-ink" /><span><strong className="font-semibold">{t("product.shipsFree")}</strong>{th != null && <span className="text-muted"> · {t("product.shipsFreeSub", { amount: money(th, currency) })}</span>}</span></li>
            <li className="flex items-center gap-3"><ShieldIcon className="shrink-0 text-brand-ink" /><span className="font-semibold">{t("product.securePay")}</span></li>
            <li className="flex items-center gap-3"><ReturnIcon className="shrink-0 text-brand-ink" /><span className="font-semibold">{t("product.easyReturns")}</span></li>
          </ul>

          {p.description && (
            <section className="mt-8 border-t border-line pt-6">
              <h2 className="text-sm font-semibold">{t("product.description")}</h2>
              <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted">{p.description.split(/\n{2,}/).map((para, i) => <p key={i}>{para}</p>)}</div>
            </section>
          )}
        </div>
      </div>
      {relatedItems.length > 0 && (
        <section className="mt-16 border-t border-line pt-10" aria-labelledby="h-related">
          <h2 id="h-related" className="section-title">{t("product.related")}</h2>
          <div className="mt-6"><ProductGrid products={relatedItems} /></div>
        </section>
      )}
    </div>
  );
}

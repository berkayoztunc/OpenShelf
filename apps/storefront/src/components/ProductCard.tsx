import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { ProductSummary } from "../api/types";
import { useCart } from "../cart/CartContext";
import { useI18n } from "../i18n";
import { CheckIcon, PlusIcon } from "../lib/Icons";
import { lowestPrice, totalAvailable } from "../lib/seo";
import { track } from "../tracking";
import { useMoney } from "./Money";
import { ProductImage } from "./ProductImage";

/** Best "was" price for the cheapest variant (or the summary), used for the sale badge + strike-through. */
export function saleInfo(p: ProductSummary) {
  const v = p.variants?.length ? [...p.variants].sort((a, b) => a.price - b.price)[0] : undefined;
  const price = v?.price ?? p.price;
  const was = v?.compareAtPrice ?? p.compareAtPrice;
  if (price === undefined || !was || was <= price) return null;
  return { was, pct: Math.round((1 - price / was) * 100) };
}

export function ProductCard({ product, priority = false }: { product: ProductSummary; priority?: boolean }) {
  const { t } = useI18n();
  const money = useMoney();
  const nav = useNavigate();
  const { addItem, setDrawerOpen, busy } = useCart();
  const [added, setAdded] = useState(false);
  const [first, second] = product.images;
  const price = lowestPrice(product);
  const avail = totalAvailable(product);
  const soldOut = avail !== undefined && avail <= 0;
  const sale = saleInfo(product);
  const multi = (product.variants?.length ?? 0) > 1 && new Set(product.variants!.map((v) => v.price)).size > 1;
  const single = product.variants?.length === 1 ? product.variants[0] : undefined;
  const href = `/product/${product.slug}`;

  const quickAdd = async () => {
    if (!single) { nav(href); return; }
    const cart = await addItem(single.id, 1);
    if (!cart) return;
    track("add_to_cart", { currency: product.currency ?? "TRY", value: single.price / 100, items: [{ id: single.id, name: product.title, price: single.price / 100, quantity: 1, category: product.category?.name, variant: single.title }] });
    setAdded(true); setTimeout(() => setAdded(false), 1800);
    setDrawerOpen(true);
  };

  return (
    <article className="group relative">
      <div className="relative aspect-[4/5] overflow-hidden rounded-2xl bg-line ring-1 ring-ink/[.07] transition duration-300 group-hover:shadow-lift">
        <Link to={href} tabIndex={-1} aria-hidden className="absolute inset-0 block">
          <ProductImage src={first?.url} alt={first?.alt} title={product.title} eager={priority}
            className={`absolute inset-0 size-full object-cover transition duration-700 ease-out group-hover:scale-105 ${second ? "group-hover:opacity-0" : ""} ${soldOut ? "opacity-60 grayscale-[.4]" : ""}`} />
          {second && (
            <img src={second.url} alt="" loading="lazy" decoding="async" onError={(e) => { e.currentTarget.style.display = "none"; }}
              className="absolute inset-0 size-full scale-105 object-cover opacity-0 transition duration-700 ease-out group-hover:scale-100 group-hover:opacity-100" />
          )}
        </Link>
        <div className="pointer-events-none absolute left-3 top-3 flex flex-col items-start gap-1.5">
          {soldOut && <span className="rounded-full bg-ink px-3 py-1 text-xs font-medium text-canvas">{t("product.soldOut")}</span>}
          {!soldOut && sale && <span className="rounded-full bg-accent-500 px-2.5 py-1 text-xs font-bold text-stone-900 shadow-sm">−{sale.pct}%</span>}
        </div>
        {!soldOut && (
          <button type="button" onClick={() => void quickAdd()} disabled={busy}
            aria-label={single ? `${t("product.quickAdd")}: ${product.title}` : `${t("product.chooseOptions")}: ${product.title}`}
            className="absolute bottom-3 right-3 z-10 inline-flex h-10 items-center gap-1.5 rounded-full bg-surface/95 px-3.5 text-sm font-semibold text-ink shadow-lg backdrop-blur transition duration-300 hover:bg-brand-600 hover:text-white focus-visible:translate-y-0 focus-visible:opacity-100 disabled:opacity-60 max-md:size-10 max-md:justify-center max-md:px-0 md:translate-y-2 md:opacity-0 md:group-hover:translate-y-0 md:group-hover:opacity-100">
            {added ? <CheckIcon size={18} /> : <PlusIcon size={18} />}
            <span className="max-md:sr-only">{single ? (added ? t("product.added") : t("product.quickAdd")) : t("product.chooseOptions")}</span>
          </button>
        )}
      </div>
      <div className="mt-3.5 px-0.5">
        {product.category && <p className="text-xs font-medium uppercase tracking-wider text-muted">{product.category.name}</p>}
        <h3 className="mt-0.5 text-[15px] font-medium leading-snug"><Link to={href} className="after:absolute after:inset-x-0 after:top-0 after:aspect-[4/5] after:content-[''] hover:text-brand-ink">{product.title}</Link></h3>
        {price !== undefined && (
          <p className="mt-1.5 flex flex-wrap items-baseline gap-x-2 text-sm">
            {multi && <span className="text-muted">{t("product.from")}</span>}
            <span className="font-semibold tabular-nums">{money(price, product.currency)}</span>
            {sale && <s className="text-xs text-muted tabular-nums">{money(sale.was, product.currency)}</s>}
          </p>
        )}
      </div>
    </article>
  );
}

export function ProductGridSkeleton({ n = 8 }: { n?: number }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-9 md:grid-cols-3 lg:grid-cols-4" aria-hidden>
      {Array.from({ length: n }, (_, i) => (
        <div key={i}><div className="skeleton aspect-[4/5] rounded-2xl" /><div className="skeleton mt-3.5 h-3 w-1/3" /><div className="skeleton mt-2 h-4 w-3/4" /><div className="skeleton mt-2 h-4 w-1/4" /></div>
      ))}
    </div>
  );
}

export function ProductGrid({ products }: { products: ProductSummary[] }) {
  return (
    <ul className="grid grid-cols-2 gap-x-4 gap-y-9 md:grid-cols-3 lg:grid-cols-4">
      {products.map((p, i) => <li key={p.id}><ProductCard product={p} priority={i < 4} /></li>)}
    </ul>
  );
}

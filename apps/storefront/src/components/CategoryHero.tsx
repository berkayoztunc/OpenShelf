import { Link } from "react-router-dom";
import type { Category, ProductSummary } from "../api/types";
import { useI18n } from "../i18n";
import { ArrowIcon, CATEGORY_ICONS, ChevronIcon } from "../lib/Icons";
import { ProductImage } from "./ProductImage";

/** Family of a category: its parent, its children and its siblings, resolved from the flat category list. */
export function categoryFamily(all: Category[], cat: Category) {
  const parent = cat.parentId ? all.find((c) => c.id === cat.parentId) : undefined;
  const children = all.filter((c) => c.parentId === cat.id);
  const siblings = parent ? all.filter((c) => c.parentId === parent.id) : [];
  return { parent, children, siblings };
}

/** Header of a category page: breadcrumb, title, description, product count and a collage of products from the category. */
export function CategoryHero({ cat, parent, count, previews }: { cat: Category; parent?: Category; count?: number; previews: ProductSummary[] }) {
  const { t, locale } = useI18n();
  const description = (locale === "en" && cat.descriptionEn) || cat.description || "";
  const tiles = previews.filter((p) => p.images[0]?.url).slice(0, 3);
  return (
    <div className="hero-mesh relative overflow-hidden border-b border-line">
      <div aria-hidden className="dot-grid absolute inset-0 opacity-30 [mask-image:radial-gradient(60%_90%_at_15%_20%,#000,transparent)]" />
      <div className={`container-x relative grid items-center gap-8 py-8 sm:py-12 ${tiles.length ? "lg:grid-cols-[1.1fr_.9fr]" : ""}`}>
        <div>
          <nav aria-label={t("cat.breadcrumb")} className="mb-4 text-xs text-muted">
            <ol className="flex flex-wrap items-center gap-1.5">
              <li><Link to="/" className="transition hover:text-ink">{t("product.home")}</Link></li><li aria-hidden><ChevronIcon size={12} /></li>
              {parent && <><li><Link to={`/category/${parent.slug}`} className="transition hover:text-ink">{parent.name}</Link></li><li aria-hidden><ChevronIcon size={12} /></li></>}
              <li aria-current="page" className="font-medium text-ink">{cat.name}</li>
            </ol>
          </nav>
          <h1 className="font-display text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">{cat.name}</h1>
          {description && <p className="mt-4 max-w-xl whitespace-pre-line text-base leading-relaxed text-muted sm:text-lg">{description}</p>}
          {count !== undefined && <p className="mt-5 inline-flex items-center rounded-full border border-line bg-surface/80 px-3.5 py-1.5 text-sm font-medium shadow-sm backdrop-blur" aria-live="polite">{t("list.count", { n: count })}</p>}
        </div>
        {tiles.length > 0 && (
          <div aria-hidden className="relative hidden h-64 grid-cols-3 items-end gap-3 lg:grid">
            {tiles.map((p, i) => (
              <div key={p.id} className={`relative overflow-hidden rounded-2xl shadow-lift ring-1 ring-ink/[.07] ${i === 1 ? "h-64" : "h-52"} ${i === 0 ? "-rotate-2" : i === 2 ? "rotate-2" : ""}`}>
                <ProductImage src={p.images[0]?.url} title={p.title} eager className="absolute inset-0 size-full object-cover" />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const pill = (active: boolean) => `chip ${active ? "border-brand-600 bg-brand-600 text-white shadow-sm" : "border-line bg-surface hover:border-ink/40"}`;

/** Navigation that belongs to THIS category only: its subcategories, or (inside a subcategory) its siblings and a way back to the parent. */
export function CategoryNav({ cat, parent, children, siblings }: { cat: Category; parent?: Category; children: Category[]; siblings: Category[] }) {
  const { t } = useI18n();
  if (!children.length && !(parent && siblings.length)) return null;
  const items = children.length ? children : siblings;
  return (
    <section aria-label={t(children.length ? "cat.sub" : "cat.inParent", { parent: parent?.name ?? cat.name })} className="mb-6">
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">{children.length ? t("cat.sub") : t("cat.inParent", { parent: parent!.name })}</h2>
        {!children.length && parent && <Link to={`/category/${parent.slug}`} className="link-arrow !text-sm"><ChevronIcon dir="left" size={14} />{t("cat.back", { parent: parent.name })}</Link>}
      </div>
      <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0">
        {items.map((c) => <li key={c.id} className="shrink-0"><Link to={`/category/${c.slug}`} aria-current={c.slug === cat.slug ? "page" : undefined} className={pill(c.slug === cat.slug)}>{c.name}</Link></li>)}
      </ul>
    </section>
  );
}

/** Bottom of a category page: the other top-level categories as tiles, so the way to the rest of the shop is there without crowding the top. */
export function OtherCategories({ all, cat }: { all: Category[]; cat: Category }) {
  const { t } = useI18n();
  const topId = cat.parentId ?? cat.id;
  const others = all.filter((c) => !c.parentId && c.id !== topId).slice(0, 8);
  if (!others.length) return null;
  return (
    <section aria-labelledby="h-others" className="-mb-24 border-t border-line bg-surface sm:-mb-32">
      <div className="container-x py-12 sm:py-16">
        <p className="eyebrow">{t("home.shopCategory")}</p>
        <h2 id="h-others" className="section-title mt-2">{t("cat.others")}</h2>
        <p className="mt-2 text-muted">{t("cat.othersSub")}</p>
        <ul className="mt-8 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {others.map((c, i) => {
            const Icon = CATEGORY_ICONS[i % CATEGORY_ICONS.length]!;
            return (
              <li key={c.id}>
                <Link to={`/category/${c.slug}`} className="group hero-mesh relative flex min-h-32 flex-col justify-between overflow-hidden rounded-2xl p-5 ring-1 ring-ink/[.07] transition duration-300 hover:-translate-y-0.5 hover:shadow-lift">
                  <Icon size={32} strokeWidth={1.2} className="text-brand-ink/70 transition duration-500 group-hover:scale-110" />
                  <span className="mt-6 flex items-end justify-between gap-2"><span className="font-display text-lg font-semibold leading-tight sm:text-xl">{c.name}</span>
                    <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-full bg-surface/90 text-ink shadow-sm transition group-hover:translate-x-0.5"><ArrowIcon size={16} /></span></span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

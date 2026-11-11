import { Link } from "react-router-dom";
import type { Category } from "../api/types";
import { useI18n } from "../i18n";
import { ArrowIcon } from "../lib/Icons";
import { ProductImage } from "./ProductImage";

export type CategoryCardMode = "plain" | "image";

/**
 * One category tile, used on the home page and under category pages.
 * plain (default): clean text card, no icon, no gradient. image: photo card; a category without a photo quietly renders plain.
 */
export function CategoryCard({ cat, mode, cover, compact }: { cat: Category; mode: CategoryCardMode; cover?: string | null; compact?: boolean }) {
  const { t, locale } = useI18n();
  const photo = mode === "image" ? cover || null : null;
  const desc = locale === "en" ? cat.descriptionEn || cat.description : cat.description;
  if (photo) {
    return (
      <Link to={`/category/${cat.slug}`} data-card="image" className={`group relative flex items-end overflow-hidden rounded-2xl bg-brand-50 ring-1 ring-ink/[.07] transition duration-300 hover:shadow-lift ${compact ? "aspect-[4/3]" : "aspect-[3/4] lg:aspect-[4/3]"}`}>
        <ProductImage src={photo} title={cat.name} alt="" className="absolute inset-0 size-full object-cover transition duration-700 group-hover:scale-105" />
        <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
        <span className="relative flex w-full items-end justify-between gap-2 p-4 text-white sm:p-5">
          <span className="font-display text-lg font-semibold leading-tight sm:text-2xl">{cat.name}</span>
          <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-white/90 text-stone-900 transition duration-300 group-hover:translate-x-0.5"><ArrowIcon size={18} /></span>
        </span>
      </Link>
    );
  }
  return (
    <Link to={`/category/${cat.slug}`} data-card="plain" className={`group flex flex-col justify-between rounded-2xl border border-line bg-surface p-5 transition duration-300 hover:-translate-y-0.5 hover:border-ink/25 hover:shadow-lift sm:p-6 ${compact ? "min-h-28" : "min-h-36"}`}>
      <span>
        <span className="block font-display text-lg font-semibold leading-tight sm:text-xl">{cat.name}</span>
        {desc && <span className="mt-1.5 line-clamp-2 block text-sm text-muted">{desc}</span>}
      </span>
      <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-brand-ink">{t("home.viewAll")}<ArrowIcon size={16} className="transition group-hover:translate-x-0.5" /></span>
    </Link>
  );
}

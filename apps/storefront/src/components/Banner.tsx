import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useI18n } from "../i18n";
import { ArrowIcon, ChevronIcon, SparkIcon, TruckIcon } from "../lib/Icons";
import { useConfig } from "../store/ConfigContext";
import { useMoney } from "./Money";
import { Placeholder, ProductImage } from "./ProductImage";

function Cta({ url, label, className }: { url: string; label: string; className: string }) {
  const inner = <>{label}<ArrowIcon size={18} /></>;
  return /^https?:\/\//.test(url) ? <a href={url} className={className}>{inner}</a> : <Link to={url || "/products"} className={className}>{inner}</Link>;
}

/**
 * Hero. With configured banner images: carousel (autoplay pauses on hover/focus and for reduced motion).
 * Without: a designed fallback (mesh gradient + display type + product collage) so a fresh store never looks empty.
 */
export function Banner({ collage = [] }: { collage?: { url?: string | null; title: string }[] }) {
  const { config } = useConfig();
  const { t } = useI18n();
  const money = useMoney();
  const { bannerUrls = [], bannerTitle, bannerSubtitle, bannerCtaLabel, bannerCtaUrl } = config.branding;
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const n = bannerUrls.length;

  useEffect(() => {
    if (n < 2 || paused || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setI((x) => (x + 1) % n), 6000);
    return () => clearInterval(id);
  }, [n, paused]);

  const hasText = !!(bannerTitle || bannerSubtitle || bannerCtaLabel);
  const ctaUrl = bannerCtaUrl || "/products";

  if (!n) {
    const tiles = [0, 1, 2].map((k) => collage[k]);
    const th = config.checkout.freeShippingThreshold;
    return (
      <section className="hero-mesh relative overflow-hidden">
        <div aria-hidden className="dot-grid absolute inset-0 opacity-40 [mask-image:radial-gradient(70%_80%_at_20%_30%,#000,transparent)]" />
        <div className="container-x relative grid items-center gap-10 py-12 sm:py-16 lg:grid-cols-[1.05fr_.95fr] lg:gap-14 lg:py-24">
          <div>
            <p className="rise inline-flex items-center gap-2 rounded-full border border-line bg-surface/80 px-3.5 py-1.5 text-xs font-semibold text-brand-ink shadow-sm backdrop-blur">
              <SparkIcon size={14} />{config.general.tagline || t("hero.new")}
            </p>
            <h1 className="rise rise-2 mt-5 font-display text-[2.6rem] font-semibold leading-[1.03] tracking-tight sm:text-6xl lg:text-7xl">{bannerTitle || config.general.storeName}</h1>
            <p className="rise rise-3 mt-5 max-w-lg text-base leading-relaxed text-muted sm:text-lg">{bannerSubtitle || t("hero.bestFor")}</p>
            <div className="rise rise-4 mt-8 flex flex-wrap gap-3">
              <Cta url={ctaUrl} label={bannerCtaLabel || t("hero.shop")} className="btn-primary !min-h-12 !px-6 !text-base" />
              <a href="#categories" className="btn-ghost !min-h-12 !px-6 !text-base">{t("hero.browse")}</a>
            </div>
          </div>
          <div aria-hidden className="rise rise-3 relative mx-auto grid h-[320px] w-full max-w-md grid-cols-2 grid-rows-2 gap-3 sm:h-[420px] lg:h-[500px] lg:max-w-none">
            <div className="relative row-span-2 overflow-hidden rounded-[28px] shadow-lift ring-1 ring-ink/[.07]">
              {tiles[0]?.url ? <ProductImage src={tiles[0].url} title={tiles[0].title} eager className="absolute inset-0 size-full object-cover" /> : <Placeholder title={config.general.storeName} />}
            </div>
            <div className="relative -translate-y-3 overflow-hidden rounded-[28px] shadow-lift ring-1 ring-ink/[.07] lg:-translate-y-6">
              {tiles[1]?.url ? <ProductImage src={tiles[1].url} title={tiles[1].title} eager className="absolute inset-0 size-full object-cover" /> : <Placeholder title={config.general.storeName + "1"} />}
            </div>
            <div className="relative translate-y-3 overflow-hidden rounded-[28px] shadow-lift ring-1 ring-ink/[.07] lg:translate-y-6">
              {tiles[2]?.url ? <ProductImage src={tiles[2].url} title={tiles[2].title} eager className="absolute inset-0 size-full object-cover" /> : <Placeholder title={config.general.storeName + "2"} />}
            </div>
            {th != null && (
              <span className="absolute -left-2 bottom-8 hidden items-center gap-2 rounded-full bg-surface px-4 py-2.5 text-sm font-semibold shadow-lift ring-1 ring-ink/[.07] sm:inline-flex lg:-left-8">
                <TruckIcon size={18} className="text-brand-ink" />{t("trust.shipping")} · {money(th)}+
              </span>
            )}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section
      aria-roledescription="carousel" aria-label={config.general.storeName}
      className="relative overflow-hidden bg-stone-900"
      onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}
    >
      <div className="relative aspect-[4/5] sm:aspect-[16/7] lg:max-h-[640px]">
        {bannerUrls.map((src, idx) => (
          <div key={src} role="group" aria-roledescription="slide" aria-label={`${idx + 1} / ${n}`} aria-hidden={idx !== i}
            className={`absolute inset-0 transition-opacity duration-1000 ${idx === i ? "opacity-100" : "pointer-events-none opacity-0"}`}>
            <img src={src} alt="" className={`size-full object-cover transition-transform duration-[7000ms] ease-out ${idx === i ? "scale-105" : "scale-100"}`} loading={idx === 0 ? "eager" : "lazy"} fetchPriority={idx === 0 ? "high" : "auto"} />
          </div>
        ))}
        {hasText && (
          <div className="absolute inset-0 flex items-end bg-gradient-to-t from-black/70 via-black/15 to-transparent lg:items-center lg:bg-gradient-to-r lg:from-black/65 lg:via-black/20">
            <div className="container-x pb-14 lg:pb-0">
              <div className="max-w-xl text-white">
                {bannerTitle && <h1 className="font-display text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">{bannerTitle}</h1>}
                {bannerSubtitle && <p className="mt-4 text-base text-white/85 sm:text-lg">{bannerSubtitle}</p>}
                <div className="mt-7 flex flex-wrap gap-3">
                  {bannerCtaLabel && <Cta url={ctaUrl} label={bannerCtaLabel} className="btn-primary !min-h-12 !bg-white !px-6 !text-base !text-stone-900 hover:!bg-white/85" />}
                  <a href="#categories" className="inline-flex min-h-12 items-center rounded-xl border border-white/40 px-6 text-base font-medium text-white backdrop-blur transition hover:bg-white/15">{t("hero.browse")}</a>
                </div>
              </div>
            </div>
          </div>
        )}
        {n > 1 && (
          <>
            <button className="icon-btn absolute left-4 top-1/2 hidden -translate-y-1/2 bg-black/30 text-white backdrop-blur hover:bg-black/50 sm:inline-flex" aria-label={t("banner.prev")} onClick={() => setI((i - 1 + n) % n)}><ChevronIcon dir="left" /></button>
            <button className="icon-btn absolute right-4 top-1/2 hidden -translate-y-1/2 bg-black/30 text-white backdrop-blur hover:bg-black/50 sm:inline-flex" aria-label={t("banner.next")} onClick={() => setI((i + 1) % n)}><ChevronIcon /></button>
            <div className="absolute inset-x-0 bottom-3 flex justify-center gap-1">
              {bannerUrls.map((_, idx) => (
                <button key={idx} aria-label={t("banner.goto", { n: idx + 1 })} aria-current={idx === i} onClick={() => setI(idx)} className="grid size-6 place-items-center">
                  <span className={`block h-2 rounded-full bg-white transition-all ${idx === i ? "w-6" : "w-2 opacity-60"}`} />
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import { useI18n } from "../i18n";
import type { MessageKey } from "../i18n/messages";
import { LEGAL_KEYS } from "../api/types";
import { legalTitle, useConfig } from "../store/ConfigContext";
import { openConsentBanner } from "../tracking";
import { Logo } from "./Logo";

const SOCIAL: [keyof NonNullable<ReturnType<typeof useConfig>["config"]["branding"]["social"]>, string][] = [
  ["instagram", "Instagram"], ["facebook", "Facebook"], ["x", "X"], ["youtube", "YouTube"], ["tiktok", "TikTok"],
];
const linkCls = "text-sm text-muted transition-colors hover:text-ink";
const h = "text-xs font-semibold uppercase tracking-[.14em] text-ink";

export function Footer() {
  const { t } = useI18n();
  const { config } = useConfig();
  const cats = useQuery({ queryKey: ["categories"], queryFn: api.categories, staleTime: 5 * 60_000 });
  const g = config.general;
  const social = SOCIAL.filter(([k]) => config.branding.social?.[k]);
  const legal = LEGAL_KEYS.filter((k) => legalTitle(config, k));
  const top = (cats.data ?? []).filter((c) => !c.parentId).slice(0, 5);
  return (
    <footer className="mt-24 border-t border-line bg-surface sm:mt-32">
      <div className="container-x grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr_1fr] lg:gap-12">
        <div>
          <Logo />
          {(g.description || g.tagline) && <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted">{g.description || g.tagline}</p>}
          {social.length > 0 && (
            <ul className="mt-5 flex flex-wrap gap-2" aria-label={t("footer.follow")}>
              {social.map(([k, label]) => <li key={k}><a className="inline-flex rounded-full border border-line px-3.5 py-1.5 text-xs font-medium text-muted transition hover:border-brand-600 hover:text-brand-ink" href={config.branding.social[k]} target="_blank" rel="noopener noreferrer">{label}</a></li>)}
            </ul>
          )}
        </div>
        <nav aria-label={t("footer.shop")}>
          <h2 className={h}>{t("footer.shop")}</h2>
          <ul className="mt-4 space-y-2.5">
            <li><Link className={linkCls} to="/products">{t("nav.products")}</Link></li>
            {top.map((c) => <li key={c.id}><Link className={linkCls} to={`/category/${c.slug}`}>{c.name}</Link></li>)}
          </ul>
        </nav>
        <div>
          <h2 className={h}>{t("footer.contact")}</h2>
          <ul className="mt-4 space-y-2.5">
            {g.contactEmail && <li><a className={linkCls} href={`mailto:${g.contactEmail}`}>{g.contactEmail}</a></li>}
            {g.contactPhone && <li><a className={linkCls} href={`tel:${g.contactPhone.replace(/\s/g, "")}`}>{g.contactPhone}</a></li>}
            {g.address && <li><address className={`${linkCls} not-italic`}>{g.address}</address></li>}
          </ul>
        </div>
        <nav aria-label={t("footer.legal")}>
          <h2 className={h}>{t("footer.legal")}</h2>
          <ul className="mt-4 space-y-2.5">
            {legal.map((k) => <li key={k}><Link className={linkCls} to={`/legal/${k}`}>{legalTitle(config, k) || t(`legal.${k}` as MessageKey)}</Link></li>)}
            <li><button type="button" className={`${linkCls} cursor-pointer`} onClick={openConsentBanner}>{t("footer.cookieSettings")}</button></li>
          </ul>
        </nav>
      </div>
      <div className="border-t border-line">
        <div className="container-x flex flex-col items-center justify-between gap-2 py-5 text-xs text-muted sm:flex-row">
          <p>© {new Date().getFullYear()} {g.storeName}. {t("footer.rights")}{g.taxId ? ` · ${g.taxId}` : ""}</p>
          <p>{t("footer.madeWith")}</p>
        </div>
      </div>
    </footer>
  );
}

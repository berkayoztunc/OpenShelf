import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { applyBrandTheme, initThemeMode } from "@openshelf/ui";
import { api } from "../api/client";
import type { LegalKey, Locale, StoreConfig } from "../api/types";
import { I18nProvider, translate } from "../i18n";
import { configureTracking, setConsentRequired } from "../tracking";

interface ConfigCtx { config: StoreConfig; locales: Locale[] }
const Ctx = createContext<ConfigCtx | null>(null);
export const useConfig = () => { const c = useContext(Ctx); if (!c) throw new Error("ConfigProvider missing"); return c; };

export function legalTitle(config: StoreConfig, key: LegalKey): string {
  const v = config.legal?.[key];
  return (typeof v === "string" ? v : v?.title) ?? "";
}

function setFavicon(url: string) {
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) { link = document.createElement("link"); link.rel = "icon"; document.head.appendChild(link); }
  link.href = url;
}

export function ConfigProvider({ children }: { children: ReactNode }) {
  const q = useQuery({ queryKey: ["config"], queryFn: api.config, staleTime: 5 * 60_000 });
  const config = q.data;

  useEffect(() => {
    if (!config) return;
    initThemeMode();
    applyBrandTheme(config.branding);
    if (config.branding.faviconUrl) setFavicon(config.branding.faviconUrl);
    setConsentRequired(config.tracking.consentRequired);
    configureTracking({
      ga4MeasurementId: config.tracking.ga4MeasurementId || undefined,
      metaPixelId: config.tracking.metaPixelId || undefined,
      gtmContainerId: config.tracking.gtmContainerId || undefined,
    });
  }, [config]);

  const value = useMemo(() => config ? { config, locales: (config.locales?.length ? config.locales : config.general.locales) as Locale[] } : null, [config]);

  if (q.isError) {
    const l = (navigator.language || "tr").startsWith("tr") ? "tr" : "en";
    return (
      <div role="alert" className="grid min-h-screen place-items-center p-6 text-center">
        <div>
          <h1 className="font-display text-2xl">{translate(l, "error.title")}</h1>
          <p className="mt-2 text-muted">{translate(l, "error.config")}</p>
          <button className="btn-primary mt-6" onClick={() => void q.refetch()}>{translate(l, "error.retry")}</button>
        </div>
      </div>
    );
  }
  if (!value) {
    return <div className="grid min-h-screen place-items-center" role="status" aria-live="polite"><span className="skeleton h-3 w-32" /><span className="sr-only">Loading…</span></div>;
  }
  return (
    <Ctx.Provider value={value}>
      <I18nProvider defaultLocale={value.config.general.defaultLocale} locales={value.locales}>{children}</I18nProvider>
    </Ctx.Provider>
  );
}

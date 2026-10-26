import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { useI18n } from "../i18n";
import { bufferLandingParams, getConsent, onConsentChange, track } from "../tracking";
import { CartDrawer } from "./CartDrawer";
import { ConsentBanner } from "./ConsentBanner";
import { Footer } from "./Footer";
import { Header } from "./Header";
import { MockBanner } from "./MockBanner";

export function usePageView() {
  const loc = useLocation();
  const [, force] = useState(0);
  useEffect(() => onConsentChange(() => force((n) => n + 1)), []);
  const c = getConsent();
  useEffect(() => {
    // dedupeKey is per channel, so granting marketing after analytics only adds Meta, never a 2nd GA4 page_view.
    track("page_view", {}, { dedupeKey: loc.pathname + loc.search });
  }, [loc.pathname, loc.search, c.analytics, c.marketing]);
}

export function Layout() {
  const { t } = useI18n();
  const loc = useLocation();
  usePageView();
  useEffect(() => { bufferLandingParams(); }, []);
  useEffect(() => { window.scrollTo({ top: 0 }); }, [loc.pathname]);
  return (
    <>
      <a href="#main" className="sr-only z-50 rounded-xl bg-surface px-4 py-2 focus:not-sr-only focus:fixed focus:left-3 focus:top-3">{t("nav.skip")}</a>
      <MockBanner />
      <Header />
      <main id="main" tabIndex={-1} className="outline-none"><Outlet /></main>
      <Footer />
      <CartDrawer />
      <ConsentBanner />
    </>
  );
}

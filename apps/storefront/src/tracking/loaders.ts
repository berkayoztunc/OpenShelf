/** Lazy third-party loaders. Nothing here runs until the tracker calls it after consent. */
declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    fbq?: FbqFn;
    _fbq?: FbqFn;
  }
}
interface FbqFn { (...args: unknown[]): void; callMethod?: (...a: unknown[]) => void; queue: unknown[][]; loaded?: boolean; version?: string; push?: unknown }

const loaded = new Set<string>();

export function loadScript(src: string): void {
  if (loaded.has(src)) return;
  loaded.add(src);
  const s = document.createElement("script");
  s.async = true; s.src = src;
  document.head.appendChild(s);
}

/** gtag stub + Consent Mode v2 defaults (all denied). Pure dataLayer pushes: no network. */
export function ensureGtagStub() {
  window.dataLayer = window.dataLayer || [];
  if (!window.gtag) {
    window.gtag = function gtag() { // eslint-disable-next-line prefer-rest-params
      (window.dataLayer as unknown[]).push(arguments);
    };
    window.gtag("consent", "default", {
      ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied", analytics_storage: "denied", wait_for_update: 500,
    });
  }
}

let gaConfigured = new Set<string>();
export function loadGA4(id: string) {
  ensureGtagStub();
  loadScript(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`);
  if (!gaConfigured.has(id)) {
    gaConfigured.add(id);
    window.gtag!("js", new Date());
    window.gtag!("config", id, { send_page_view: false });
  }
}
export function loadGTM(id: string) {
  ensureGtagStub();
  if (loaded.has(`gtm:${id}`)) return;
  loaded.add(`gtm:${id}`);
  (window.dataLayer as unknown[]).push({ "gtm.start": Date.now(), event: "gtm.js" });
  loadScript(`https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(id)}`);
}

export function updateGtagConsent(analytics: boolean, marketing: boolean) {
  if (!window.gtag) return;
  const g = (v: boolean) => (v ? "granted" : "denied");
  window.gtag("consent", "update", {
    analytics_storage: g(analytics), ad_storage: g(marketing), ad_user_data: g(marketing), ad_personalization: g(marketing),
  });
}

const pixelsInited = new Set<string>();
export function loadMetaPixel(id: string) {
  if (!window.fbq) {
    const fbq = function (...args: unknown[]) {
      if (fbq.callMethod) fbq.callMethod(...args); else fbq.queue.push(args);
    } as FbqFn;
    fbq.queue = []; fbq.loaded = true; fbq.version = "2.0";
    window.fbq = fbq; window._fbq = fbq;
  }
  loadScript("https://connect.facebook.net/en_US/fbevents.js");
  if (!pixelsInited.has(id)) { pixelsInited.add(id); window.fbq!("consent", "grant"); window.fbq!("init", id); }
}
export function revokeMetaConsent() { window.fbq?.("consent", "revoke"); }

/** test helper */
export function __resetLoaders() {
  loaded.clear(); gaConfigured = new Set(); pixelsInited.clear();
  delete window.dataLayer; delete window.gtag; delete window.fbq; delete window._fbq;
}

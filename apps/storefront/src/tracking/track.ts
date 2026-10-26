import { META_EVENT_MAP, type EventName, type TrackEvent, type TrackItem } from "@openshelf/shared";
import { api } from "../api/client";
import { getAttribution } from "./attribution";
import { getConsent, newId, onConsentChange } from "./consent";
import { ensureGtagStub, loadGA4, loadGTM, loadMetaPixel, revokeMetaConsent, updateGtagConsent } from "./loaders";

export interface TrackingConfig { ga4MeasurementId?: string; metaPixelId?: string; gtmContainerId?: string }
export interface TrackPayload {
  currency?: string; value?: number; items?: TrackItem[]; transaction_id?: string; search_term?: string;
}
export interface TrackOptions {
  /** Use a server-provided id (purchase). Otherwise a fresh UUID is generated. */
  eventId?: string;
  /** Per-channel once-only key (e.g. page path, product id) so consent flips never double-fire a channel. */
  dedupeKey?: string;
}
type Channel = "ga" | "meta" | "server";

let cfg: TrackingConfig = {};
const fired = new Map<string, Set<Channel>>();

/** Scripts are (un)loaded strictly from the current consent state. */
function syncScripts() {
  const c = getConsent();
  const gaOn = !!(cfg.ga4MeasurementId || cfg.gtmContainerId);
  if (gaOn) {
    ensureGtagStub(); // consent defaults = denied, dataLayer only
    if (c.analytics || c.marketing) {
      if (cfg.ga4MeasurementId) loadGA4(cfg.ga4MeasurementId);
      if (cfg.gtmContainerId) loadGTM(cfg.gtmContainerId);
    }
    updateGtagConsent(c.analytics, c.marketing);
  }
  if (cfg.metaPixelId) {
    if (c.marketing) loadMetaPixel(cfg.metaPixelId);
    else revokeMetaConsent();
  }
}

let unsub: (() => void) | undefined;
export function configureTracking(next: TrackingConfig) {
  cfg = next;
  unsub?.();
  unsub = onConsentChange(syncScripts);
  syncScripts();
}

function gaItems(items?: TrackItem[]) {
  return items?.map((i) => ({ item_id: i.id, item_name: i.name, price: i.price, quantity: i.quantity, item_category: i.category, item_variant: i.variant }));
}

function metaParams(name: EventName, p: TrackPayload): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (p.currency) out.currency = p.currency;
  if (p.value !== undefined) out.value = p.value;
  if (p.items?.length) {
    out.content_ids = p.items.map((i) => i.id); // variant id == catalog feed id
    out.contents = p.items.map((i) => ({ id: i.id, quantity: i.quantity, item_price: i.price }));
    out.content_type = "product";
    out.num_items = p.items.reduce((n, i) => n + i.quantity, 0);
  }
  if (name === "search" && p.search_term) out.search_string = p.search_term;
  return out;
}

/**
 * Single entry point. Returns the event_id actually dispatched, or null if nothing fired
 * (no consent / no channel configured / already fired). `purchase` must only be sent via
 * `trackPurchase` (order page) with the server-issued id and is never mirrored to /api/store/track.
 */
export function track(name: EventName, payload: TrackPayload = {}, opts: TrackOptions = {}): string | null {
  const consent = getConsent();
  const want: Channel[] = [];
  if (consent.analytics && (cfg.ga4MeasurementId || cfg.gtmContainerId)) want.push("ga");
  if (consent.marketing && cfg.metaPixelId && META_EVENT_MAP[name]) want.push("meta");
  if (name !== "purchase" && name !== "refund" && (consent.analytics || consent.marketing)) want.push("server");

  const key = opts.dedupeKey ? `${name}:${opts.dedupeKey}` : null;
  const done = key ? fired.get(key) : undefined;
  const channels = want.filter((c) => !done?.has(c));
  if (!channels.length) return null;
  if (key) fired.set(key, new Set([...(done ?? []), ...channels]));

  syncScripts();
  const event_id = opts.eventId ?? newId();

  if (channels.includes("ga")) {
    window.gtag?.("event", name, {
      event_id,
      ...(payload.currency && { currency: payload.currency }),
      ...(payload.value !== undefined && { value: payload.value }),
      ...(payload.transaction_id && { transaction_id: payload.transaction_id }),
      ...(payload.search_term && { search_term: payload.search_term }),
      ...(payload.items && { items: gaItems(payload.items) }),
    });
  }
  if (channels.includes("meta")) {
    // Same event_id as GA4/server -> Meta dedups browser vs CAPI via eventID.
    window.fbq?.("track", META_EVENT_MAP[name]!, metaParams(name, payload), { eventID: event_id });
  }
  if (channels.includes("server")) {
    const event: TrackEvent = {
      event_id, name, ...payload,
      items: payload.items?.map((i) => ({ ...i })),
      page_url: location.href,
    } as TrackEvent;
    api.postTrack({ event, consent: { analytics: consent.analytics, marketing: consent.marketing }, attribution: getAttribution() }).catch(() => {});
  }
  return event_id;
}

/** test helper */
export function __resetTracking() { cfg = {}; fired.clear(); unsub?.(); unsub = undefined; }

import type { ConsentState } from "@openshelf/shared";
import { api } from "../api/client";

/** Bump when the cookie/privacy text changes materially; users get re-prompted. */
export const POLICY_VERSION = "2025-01";
const KEY = "os_consent";

interface Stored { analytics: boolean; marketing: boolean; policyVersion: string; visitorId: string; at: string }

type Listener = (c: ConsentState) => void;
const listeners = new Set<Listener>();
let required = true;
let cache: Stored | null | undefined;

function read(): Stored | null {
  if (cache !== undefined) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    const p = raw ? (JSON.parse(raw) as Stored) : null;
    cache = p && p.policyVersion === POLICY_VERSION ? p : null;
  } catch { cache = null; }
  return cache;
}

export function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
}

/** Admin can disable the banner (tracking.consentRequired=false) -> everything allowed. */
export function setConsentRequired(v: boolean) { required = v; emit(); }

export function getConsent(): ConsentState {
  if (!required) return { necessary: true, analytics: true, marketing: true };
  const s = read();
  return { necessary: true, analytics: !!s?.analytics, marketing: !!s?.marketing };
}
export const hasDecision = () => !required || read() !== null;

export function getVisitorId(): string {
  const s = read();
  if (s) return s.visitorId;
  try {
    let id = localStorage.getItem("os_vid");
    if (!id) { id = newId(); localStorage.setItem("os_vid", id); }
    return id;
  } catch { return newId(); }
}

function emit() { const c = getConsent(); listeners.forEach((l) => l(c)); }
export function onConsentChange(l: Listener): () => void { listeners.add(l); return () => { listeners.delete(l); }; }

/** Persist the choice locally, notify listeners (tracker loads/unloads scripts) and record it server-side. */
export function setConsent(c: { analytics: boolean; marketing: boolean }) {
  const stored: Stored = { analytics: c.analytics, marketing: c.marketing, policyVersion: POLICY_VERSION, visitorId: getVisitorId(), at: new Date().toISOString() };
  cache = stored;
  try { localStorage.setItem(KEY, JSON.stringify(stored)); } catch { /* storage blocked: choice lives in memory */ }
  emit();
  // Recording the decision itself is allowed without consent (it is the consent record).
  api.postConsent({ visitorId: stored.visitorId, analytics: c.analytics, marketing: c.marketing, policyVersion: POLICY_VERSION }).catch(() => {});
}

// Banner open/close (footer "cookie settings" link re-opens it).
const bannerListeners = new Set<(open: boolean) => void>();
export const onBannerRequest = (l: (open: boolean) => void) => { bannerListeners.add(l); return () => { bannerListeners.delete(l); }; };
export const openConsentBanner = () => bannerListeners.forEach((l) => l(true));

/** test helper */
export function __resetConsent() { cache = undefined; required = true; listeners.clear(); }

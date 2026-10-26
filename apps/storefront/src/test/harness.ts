import { vi } from "vitest";

/** Fresh tracking modules + clean DOM/storage + stubbed fetch for each test. */
export async function freshTracking(cfg = { ga4MeasurementId: "G-TEST123", metaPixelId: "1234567890" }) {
  vi.resetModules();
  localStorage.clear(); sessionStorage.clear();
  document.head.querySelectorAll("script").forEach((s) => s.remove());
  delete (window as { dataLayer?: unknown }).dataLayer; delete (window as { gtag?: unknown }).gtag;
  delete (window as { fbq?: unknown }).fbq; delete (window as { _fbq?: unknown })._fbq;
  const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetchMock);
  const m = await import("../tracking");
  m.configureTracking(cfg);
  const scripts = () => [...document.head.querySelectorAll("script")].map((s) => s.src);
  return { ...m, fetchMock, scripts };
}

/** dataLayer `event` commands (gtag pushes `arguments` objects). */
export const gaEvents = () =>
  ((window as { dataLayer?: ArrayLike<unknown>[] }).dataLayer ?? [])
    .map((a) => Array.from(a))
    .filter((a) => a[0] === "event") as [string, string, Record<string, unknown>][];
export const fbqCalls = () => ((window as { fbq?: { queue: unknown[][] } }).fbq?.queue ?? []).filter((a) => a[0] === "track");

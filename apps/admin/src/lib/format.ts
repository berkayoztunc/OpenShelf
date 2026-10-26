import { hasKey, intlTag, plural, getLocale, tNow } from "../i18n";

/** Money is always formatted for the store currency in Turkish number format (₺3.494,00), regardless of UI language. */
export function money(minor: number | null | undefined, currency = "TRY", locale = "tr-TR"): string {
  if (minor === null || minor === undefined || Number.isNaN(minor)) return "-";
  try { return new Intl.NumberFormat(locale, { style: "currency", currency }).format(minor / 100); }
  catch { return `${(minor / 100).toFixed(2)} ${currency}`; }
}
export const toMinor = (major: string | number): number => Math.round(Number(String(major).replace(",", ".")) * 100) || 0;
export const toMajor = (minor: number | null | undefined): string => (minor === null || minor === undefined ? "" : (minor / 100).toFixed(2));
export function dateTime(s?: string | null): string {
  if (!s) return "-";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleString(intlTag(), { dateStyle: "medium", timeStyle: "short" });
}
export function dateOnly(s?: string | null): string {
  if (!s) return "-";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString(intlTag(), { dateStyle: "medium" });
}
/** Fallback prettifier for unknown codes (`some_code` -> `Some code`). Prefer `enumLabel` for known groups. */
export const label = (s: string) => s.replace(/[_-]/g, " ").replace(/^\w/, (c) => c.toUpperCase());
/**
 * Human text for a code value shown in the UI (`enum.<group>.<value>` in the dictionaries).
 * Groups: status, payment, invoice, outbox, email, shipment, notification, role, source, invoiceType, channel,
 * notificationEvent, provider, providerRole, category, productStatus, couponType, level.
 */
export function enumLabel(group: string, value: string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "-";
  const key = `enum.${group}.${value}`;
  return hasKey(key) ? tNow(key) : label(value);
}
/** Order/payment/etc. status text. Pass the group when it is not an order status. */
export const statusLabel = (value: string, group = "status") => enumLabel(group, value);
/** Accepts number or {total|amount|revenue} object, returns minor-unit number. */
export function pickAmount(v: unknown): number {
  if (typeof v === "number") return v;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    for (const k of ["total", "amount", "revenue", "sum"]) if (typeof o[k] === "number") return o[k] as number;
  }
  return 0;
}
/** "az önce", "5 dk önce", "3 sa önce", "2 gün önce"; falls back to a date for older values. */
export function timeAgo(s?: string | null, now = Date.now()): string {
  if (!s) return tNow("common.time.never");
  const t = new Date(s).getTime();
  if (Number.isNaN(t)) return s;
  const sec = Math.max(0, Math.round((now - t) / 1000));
  const loc = getLocale();
  if (sec < 45) return tNow("common.time.justNow");
  if (sec < 3600) return plural(loc, "common.time.minAgo", Math.round(sec / 60));
  if (sec < 86400) return plural(loc, "common.time.hourAgo", Math.round(sec / 3600));
  if (sec < 7 * 86400) return plural(loc, "common.time.dayAgo", Math.round(sec / 86400));
  return dateOnly(s);
}

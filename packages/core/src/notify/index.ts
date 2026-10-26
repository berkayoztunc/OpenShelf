import { sql } from "drizzle-orm";
import {
  isE164, pickTemplate, smsCountryAllowed, renderEmailHtml, renderEmailText, renderSms, renderSubject, toE164,
  type NotificationChannel, type NotificationEvent, type NotificationLang, type SettingsOf, type OrderStatus, type TemplateVars,
} from "@openshelf/shared";
import { raw, nowSec, type Db } from "../types";

export const NOTIFY_JOB_PREFIX = "notify.";
export const notifyJobKind = (event: NotificationEvent) => `${NOTIFY_JOB_PREFIX}${event}`;
export const notifyDedupeKey = (event: NotificationEvent, orderId: string) => `notify.${event}:${orderId}`;

/** Which notification (if any) an order transition triggers. Pre-payment cancellations stay silent. */
export function eventForTransition(from: OrderStatus, to: OrderStatus): NotificationEvent | null {
  if (to === "shipped") return "order_shipped";
  if (to === "delivered") return "order_delivered";
  if (to === "refunded") return "order_refunded";
  if (to === "cancelled" && (from === "paid" || from === "fulfilling")) return "order_cancelled";
  return null;
}

/** Batchable idempotent enqueue (dedupe key), only materialised while the order is actually in `status`. */
export function notifyEnqueueStmt(db: Db, event: NotificationEvent, orderId: string, status: OrderStatus, now: Date) {
  const t = nowSec(now);
  return raw(db, sql`INSERT OR IGNORE INTO outbox_jobs (id, kind, payload, dedupe_key, status, attempts, max_attempts, next_run_at, created_at, updated_at)
    SELECT ${crypto.randomUUID()}, ${notifyJobKind(event)}, ${JSON.stringify({ orderId })}, ${notifyDedupeKey(event, orderId)}, 'pending', 0, 8, ${t}, ${t}, ${t}
    WHERE EXISTS (SELECT 1 FROM orders WHERE id = ${orderId} AND status = ${status})`);
}

export function formatMoney(minor: number, currency: string, lang: NotificationLang): string {
  try { return new Intl.NumberFormat(lang === "tr" ? "tr-TR" : "en-US", { style: "currency", currency }).format(minor / 100); }
  catch { return `${(minor / 100).toFixed(2)} ${currency}`; }
}

export interface NotifyOrder {
  id: string; number: string; email: string; currency: string; total: number; trackingToken: string;
  shippingAddress: unknown;
}
export interface PlanInput {
  event: NotificationEvent; order: NotifyOrder; settings: SettingsOf<"notifications">; storeName: string; defaultLocale: NotificationLang;
  storefrontOrigin: string; trackingNumber?: string | null; trackingUrl?: string | null; amountMinor?: number; lang?: NotificationLang;
}
export interface ChannelPlan { channel: NotificationChannel; enabled: boolean; to: string | null; skip?: "no_recipient" | "invalid_recipient" | "country_not_allowed" }
export interface MessagePlan {
  lang: NotificationLang; vars: TemplateVars;
  sms: ChannelPlan & { text: string; senderId: string };
  email: ChannelPlan & { subject: string; html: string; text: string; from: string; fromName: string };
}

const ANON = /@anonymized\.invalid$/i;
const EMAIL = /^[^\s@<>",;]+@[^\s@<>",;]+\.[^\s@<>",;]+$/;

/**
 * Recipients are ONLY the order's own contact (or the configured admin address for admin events).
 * There is no free-form recipient input anywhere in this path.
 */
export function planMessages(i: PlanInput): MessagePlan {
  const lang = i.lang ?? i.defaultLocale;
  const admin = i.event === "admin_new_order";
  const addr = (i.order.shippingAddress ?? {}) as { name?: string; surname?: string; phone?: string };
  const customerName = [addr.name, addr.surname].filter(Boolean).join(" ").trim() || (lang === "tr" ? "Müşterimiz" : "Customer");
  const orderUrl = `${i.storefrontOrigin.replace(/\/+$/, "")}/order/${encodeURIComponent(i.order.number)}?t=${encodeURIComponent(i.order.trackingToken)}`;
  const vars: TemplateVars = {
    orderNumber: i.order.number, customerName, total: formatMoney(i.amountMinor ?? i.order.total, i.order.currency, lang),
    trackingNumber: i.trackingNumber ?? "-", trackingUrl: i.trackingUrl || orderUrl, storeName: i.storeName, orderUrl,
  };
  const tplSms = pickTemplate(i.settings.templates[lang], lang, i.event);
  const tplEmail = tplSms;

  const rawEmail = admin ? i.settings.adminEmail : (ANON.test(i.order.email) ? "" : i.order.email);
  const emailTo = rawEmail && EMAIL.test(rawEmail) ? rawEmail : null;
  const phone = admin ? (i.settings.adminPhone || null) : toE164(addr.phone);
  const phoneOk = !!phone && isE164(phone);
  const countryBlocked = phoneOk && !admin && !smsCountryAllowed(phone!, i.settings.smsAllowedCountries ?? ["+90"]);
  const smsTo = phoneOk && !countryBlocked ? phone : null;

  const sms: MessagePlan["sms"] = {
    channel: "sms", enabled: i.settings.events[i.event].sms, to: smsTo, senderId: i.settings.smsSenderId,
    text: renderSms(tplSms.body, vars), ...(smsTo ? {} : countryBlocked ? { skip: "country_not_allowed" as const } : { skip: (admin ? (i.settings.adminPhone ? "invalid_recipient" : "no_recipient") : (addr.phone ? "invalid_recipient" : "no_recipient")) as "no_recipient" }),
  };
  const email: MessagePlan["email"] = {
    channel: "email", enabled: i.settings.events[i.event].email, to: emailTo, from: i.settings.fromEmail, fromName: i.settings.fromName || i.storeName,
    subject: renderSubject(tplEmail.subject, vars), html: renderEmailHtml(tplEmail.body, vars, i.storeName), text: renderEmailText(tplEmail.body, vars),
    ...(emailTo ? {} : { skip: (rawEmail ? "invalid_recipient" : "no_recipient") as "no_recipient" }),
  };
  return { lang, vars, sms, email };
}

/** Mask an address/number for the (admin-visible) notification log. */
export function maskRecipient(to: string): string {
  if (to.includes("@")) { const [u, d] = to.split("@"); return `${(u ?? "").slice(0, 1)}***@${d ?? ""}`; }
  return to.length > 6 ? `${to.slice(0, 3)}***${to.slice(-3)}` : "***";
}

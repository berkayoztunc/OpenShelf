import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { orders } from "@openshelf/db";
import type { EmailProvider, SmsProvider } from "@openshelf/integration-sdk";
import { NOTIFICATION_EVENTS, SAMPLE_SUMMARY_INPUT, SAMPLE_VARS, escapeHtml, isE164, renderEmailHtml, stripHeaderChars, type NotificationEvent } from "@openshelf/shared";
import { planMessages } from "@openshelf/core";
import { recallOrigin } from "../lib/origins";
import type { AppEnv } from "../env";
import { ApiError, body, notFound } from "../lib/http";
import { audit } from "../lib/audit";
import { requireRole } from "../middleware/auth";
import { enforceRateLimit } from "../middleware/security";
import { getAdapter } from "../lib/integrations";
import { getSettings } from "../lib/settings";
import { scrub } from "../lib/log";
import { EMAIL_PROVIDER_IDS, SMS_PROVIDER_IDS } from "../integrations/registry";
import { listOrderNotifications } from "../lib/notify";

export const TestNotificationBody = z.object({
  channel: z.enum(["sms", "email"]),
  to: z.string().min(3).max(120),
  lang: z.enum(["tr", "en"]).default("tr"),
  /** E-mail only: render a real template (or every template with "all") against a sample order. */
  event: z.enum([...NOTIFICATION_EVENTS, "all"]).optional(),
});

export const adminNotifications = new Hono<AppEnv>();

/** Test send: clearly marked, owner/admin only, strictly rate limited (SMS costs money; this is an abuse surface). */
adminNotifications.post("/notifications/test", requireRole("admin"), async (c) => {
  const b = await body(c, TestNotificationBody);
  const admin = c.get("admin")!;
  await enforceRateLimit(c, "notif-test", 5, 3600, admin.id);
  await enforceRateLimit(c, "notif-test-ip", 10, 3600);
  const db = c.get("db");
  const [notif, general] = await Promise.all([getSettings(db, "notifications"), getSettings(db, "general")]);
  const mark = b.lang === "tr" ? "[TEST] OpenShelf bildirim testi" : "[TEST] OpenShelf notification test";
  const text = `${mark} - ${general.storeName}`;
  if (b.channel === "sms") {
    if (!isE164(b.to)) throw new ApiError(400, "invalid_recipient", "Phone must be E.164, e.g. +905301234567");
  } else if (!/^[^\s@<>",;]+@[^\s@<>",;]+\.[^\s@<>",;]+$/.test(b.to)) throw new ApiError(400, "invalid_recipient", "Invalid e-mail address");

  const ids = b.channel === "sms" ? SMS_PROVIDER_IDS : EMAIL_PROVIDER_IDS;
  let found: { adapter: unknown; secrets: Record<string, string>; id: string } | null = null;
  for (const id of ids) { const a = await getAdapter(c.env, db, id); if (a) { found = { adapter: a.adapter, secrets: a.secrets, id }; break; } }
  if (!found) throw new ApiError(503, "no_provider", `No enabled ${b.channel === "sms" ? "SMS" : "e-mail"} provider`);
  if (b.channel === "email" && b.event) {
    const branding = await getSettings(db, "branding");
    const origin = (c.env.STOREFRONT_ORIGIN || (await recallOrigin(c.env.DB)) || new URL(c.req.url).origin).replace(/\/+$/, "");
    const events: NotificationEvent[] = b.event === "all" ? [...NOTIFICATION_EVENTS] : [b.event];
    const sample = SAMPLE_VARS[b.lang];
    const results: { event: string; ok: boolean; detail?: string }[] = [];
    for (const event of events) {
      const plan = planMessages({
        event, lang: b.lang, settings: notif, storeName: general.storeName, defaultLocale: general.defaultLocale, storefrontOrigin: origin,
        order: { id: "test", number: sample.orderNumber, email: b.to, currency: "TRY", total: SAMPLE_SUMMARY_INPUT.total, trackingToken: "test", shippingAddress: SAMPLE_SUMMARY_INPUT.shippingAddress },
        trackingNumber: SAMPLE_SUMMARY_INPUT.trackingNumber, trackingUrl: sample.trackingUrl,
        amountMinor: event === "order_refunded" ? SAMPLE_SUMMARY_INPUT.total : undefined,
        summary: {
          ...SAMPLE_SUMMARY_INPUT,
          refunded: event === "order_refunded" ? SAMPLE_SUMMARY_INPUT.total : null,
          payment: { provider: "iyzico", status: event === "order_refunded" ? "refunded" : "succeeded" },
          ...(event === "order_shipped" || event === "order_delivered" ? {} : { carrier: null, trackingNumber: null }),
        },
        branding: { primaryColor: branding.primaryColor, logoUrl: branding.logoMediaId ? `${origin}/media/${branding.logoMediaId}` : null },
        footer: { address: general.address, email: general.contactEmail, phone: general.contactPhone },
        adminOrderUrl: `${origin}/admin/orders`,
      });
      let r: { ok: boolean; detail?: string };
      try {
        r = await (found.adapter as EmailProvider).send({ to: b.to, from: notif.fromEmail, fromName: notif.fromName || general.storeName, subject: stripHeaderChars(`[TEST] ${plan.email.subject}`), html: plan.email.html, text: `[TEST]\n${plan.email.text}` });
      } catch (e) { r = { ok: false, detail: e instanceof Error ? e.message : "error" }; }
      results.push({ event, ok: r.ok, ...(r.ok ? {} : { detail: scrub(r.detail ?? "", Object.values(found.secrets)) }) });
    }
    await audit(c, "notification.test", "notification", "email", { provider: found.id, event: b.event, ok: results.every((r) => r.ok) });
    if (!results.some((r) => r.ok)) throw new ApiError(502, "send_failed", "Provider rejected the test message", { detail: results[0]?.detail ?? "" });
    return c.json({ ok: true, provider: found.id, results });
  }

  let res: { ok: boolean; detail?: string };
  try {
    res = b.channel === "sms"
      ? await (found.adapter as SmsProvider).send({ to: b.to, text, senderId: notif.smsSenderId || undefined })
      : await (found.adapter as EmailProvider).send({ to: b.to, from: notif.fromEmail, fromName: notif.fromName || general.storeName, subject: stripHeaderChars(mark), html: renderEmailHtml(escapeHtml(text), {}, general.storeName), text });
  } catch (e) { res = { ok: false, detail: scrub(e instanceof Error ? e.message : "error", Object.values(found.secrets)) }; }
  await audit(c, "notification.test", "notification", b.channel, { provider: found.id, ok: res.ok });
  if (!res.ok) throw new ApiError(502, "send_failed", "Provider rejected the test message", { detail: scrub(res.detail ?? "", Object.values(found.secrets)) });
  return c.json({ ok: true, provider: found.id });
});

adminNotifications.get("/orders/:id/notifications", requireRole("staff"), async (c) => {
  const db = c.get("db"); const id = c.req.param("id");
  const [o] = await db.select({ id: orders.id }).from(orders).where(eq(orders.id, id)).limit(1);
  if (!o) throw notFound("Order");
  return c.json({ items: await listOrderNotifications(db, id) });
});

import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { orders } from "@openshelf/db";
import type { EmailProvider, SmsProvider } from "@openshelf/integration-sdk";
import { escapeHtml, isE164, renderEmailHtml, stripHeaderChars } from "@openshelf/shared";
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

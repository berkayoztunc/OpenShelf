import { desc, eq } from "drizzle-orm";
import { notificationLog, orders, refunds, shipments } from "@openshelf/db";
import { maskRecipient, notifyJobKind, planMessages, type NotifyOrder } from "@openshelf/core";
import type { EmailProvider, SmsProvider } from "@openshelf/integration-sdk";
import { NOTIFICATION_EVENTS, type NotificationChannel, type NotificationEvent, type ProviderId } from "@openshelf/shared";
import type { Db } from "../env";
import type { JobContext, JobHandler } from "../outbox";
import { EMAIL_PROVIDER_IDS, SMS_PROVIDER_IDS } from "../integrations/registry";
import { recallOrigin } from "./origins";
import { getSettings } from "./settings";
import { log, scrub } from "./log";
import { isMockModeFresh } from "./integrations";
import { sha256Hex } from "./crypto";
import { hit } from "../middleware/security";

const STALE_PENDING_SEC = 300;

type Outcome = "sent" | "skipped" | "failed" | "permanent_failed" | "noop";
const permanent = (d?: string) => !!d && d.startsWith("permanent:");

/** Insert-or-claim the (order,event,channel) row. Returns true when THIS run owns the send. */
async function claim(d1: D1Database, orderId: string, event: string, channel: string, nowSec: number, cap?: { recipient: string; limit: number }): Promise<{ own: boolean; status?: string; error?: string | null }> {
  const ins = await d1.prepare(`INSERT OR IGNORE INTO notification_log (order_id, event, channel, status, created_at) VALUES (?1, ?2, ?3, 'pending', ?4)`)
    .bind(orderId, event, channel, nowSec).run();
  if (ins.meta.changes) {
    // Per-recipient daily cap: counted once per (order,event,channel) on first claim (retries do not count again).
    if (cap && cap.limit > 0) {
      const { count } = await hit(d1, `notify-cap:${channel}:${await sha256Hex(cap.recipient.toLowerCase())}`, 86400, nowSec * 1000);
      if (count > cap.limit) {
        await d1.prepare(`UPDATE notification_log SET status = 'skipped', error = 'daily_cap' WHERE order_id = ?1 AND event = ?2 AND channel = ?3`).bind(orderId, event, channel).run();
        return { own: false, status: "skipped", error: "daily_cap" };
      }
    }
    return { own: true };
  }
  const row = await d1.prepare(`SELECT status, error FROM notification_log WHERE order_id = ?1 AND event = ?2 AND channel = ?3`).bind(orderId, event, channel).first<{ status: string; error: string | null }>();
  if (!row) return { own: false };
  if (row.status === "sent" || row.status === "skipped") return { own: false, status: row.status };
  if (row.status === "failed" && permanent(row.error ?? undefined)) return { own: false, status: "failed", error: row.error };
  // failed (transient) -> retry; stale pending (crashed run) -> take over
  const take = await d1.prepare(
    `UPDATE notification_log SET status = 'pending', created_at = ?4
     WHERE order_id = ?1 AND event = ?2 AND channel = ?3 AND (status = 'failed' OR (status = 'pending' AND created_at <= ?4 - ?5))`)
    .bind(orderId, event, channel, nowSec, STALE_PENDING_SEC).run();
  return take.meta.changes ? { own: true } : { own: false, status: "pending" };
}
async function finish(d1: D1Database, orderId: string, event: string, channel: string, f: { status: "sent" | "failed" | "skipped"; to?: string | null; provider?: string | null; error?: string | null }) {
  await d1.prepare(`UPDATE notification_log SET status = ?4, "to" = ?5, provider = ?6, error = ?7 WHERE order_id = ?1 AND event = ?2 AND channel = ?3`)
    .bind(orderId, event, channel, f.status, f.to ?? null, f.provider ?? null, f.error ? f.error.slice(0, 300) : null).run();
}

async function findProvider<T>(ctx: JobContext, ids: ProviderId[]): Promise<{ id: ProviderId; adapter: T } | null> {
  for (const id of ids) {
    const a = await ctx.getAdapter(id).catch(() => null);
    if (a) return { id, adapter: a as unknown as T };
  }
  return null;
}

export async function sendOrderNotification(event: NotificationEvent, orderId: string, ctx: JobContext): Promise<void> {
  const db = ctx.db; const d1 = ctx.env.DB; const t = Math.floor(ctx.now.getTime() / 1000);
  const [o] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!o) return;
  const [notif, general] = await Promise.all([getSettings(db, "notifications"), getSettings(db, "general")]);
  const flags = notif.events[event];
  if (!flags.sms && !flags.email) return;

  let tracking: { trackingNumber?: string | null } = {};
  if (event === "order_shipped") {
    const ships = await db.select().from(shipments).where(eq(shipments.orderId, orderId)).orderBy(desc(shipments.createdAt));
    tracking = { trackingNumber: ships.find((s) => s.trackingNumber)?.trackingNumber ?? null };
  }
  let amountMinor: number | undefined;
  if (event === "order_refunded") {
    const rs = await db.select().from(refunds).where(eq(refunds.orderId, orderId));
    const sum = rs.filter((r) => r.status === "succeeded").reduce((s, r) => s + r.amount, 0);
    if (sum > 0) amountMinor = sum;
  }
  const order: NotifyOrder = { id: o.id, number: o.number, email: o.email, currency: o.currency, total: o.total, trackingToken: o.trackingToken, shippingAddress: o.shippingAddress };
  const plan = planMessages({
    event, order, settings: notif, storeName: general.storeName, defaultLocale: general.defaultLocale,
    storefrontOrigin: ctx.env.STOREFRONT_ORIGIN || (await recallOrigin(d1)) || "", trackingNumber: tracking.trackingNumber, amountMinor,
  });

  const results: { channel: NotificationChannel; outcome: Outcome; detail?: string }[] = [];
  const channels: NotificationChannel[] = ["sms", "email"];
  for (const channel of channels) {
    const cp = channel === "sms" ? plan.sms : plan.email;
    if (!cp.enabled) continue; // channel switched off: nothing is sent or recorded
    const limit = event === "admin_new_order" || !cp.to ? 0 : channel === "sms" ? notif.smsDailyCapPerPhone : notif.emailDailyCapPerAddress;
    const c = await claim(d1, orderId, event, channel, t, cp.to && limit ? { recipient: cp.to, limit } : undefined);
    if (!c.own) {
      if (c.status === "pending") results.push({ channel, outcome: "failed", detail: "in_progress" });
      continue; // already sent/skipped/permanently failed => idempotent no-op
    }
    try {
      const mockBefore = await isMockModeFresh(db); // uncached: a mock "send" must never be recorded as sent once mock is off
      const provider = channel === "sms"
        ? await findProvider<SmsProvider>(ctx, SMS_PROVIDER_IDS)
        : await findProvider<EmailProvider>(ctx, EMAIL_PROVIDER_IDS);
      if (!provider) { await finish(d1, orderId, event, channel, { status: "skipped", error: "no_provider" }); continue; }
      if (!cp.to) { await finish(d1, orderId, event, channel, { status: "skipped", provider: provider.id, error: cp.skip ?? "no_recipient" }); continue; }
      const res = channel === "sms"
        ? await (provider.adapter as SmsProvider).send({ to: cp.to, text: plan.sms.text, senderId: plan.sms.senderId || undefined })
        : await (provider.adapter as EmailProvider).send({ to: cp.to, from: plan.email.from, fromName: plan.email.fromName, subject: plan.email.subject, html: plan.email.html, text: plan.email.text });
      if (res.ok && mockBefore && !(await isMockModeFresh(db))) {
        await finish(d1, orderId, event, channel, { status: "failed", to: maskRecipient(cp.to), provider: provider.id, error: "mock_mode_changed" });
        results.push({ channel, outcome: "failed", detail: "mock_mode_changed" });
        continue;
      }
      if (res.ok) { await finish(d1, orderId, event, channel, { status: "sent", to: maskRecipient(cp.to), provider: provider.id }); results.push({ channel, outcome: "sent" }); continue; }
      const detail = scrub(res.detail ?? "send failed", []);
      await finish(d1, orderId, event, channel, { status: "failed", to: maskRecipient(cp.to), provider: provider.id, error: detail });
      results.push({ channel, outcome: permanent(detail) ? "permanent_failed" : "failed", detail });
    } catch (e) {
      const detail = (e instanceof Error ? e.message : "error").slice(0, 200);
      await finish(d1, orderId, event, channel, { status: "failed", to: cp.to ? maskRecipient(cp.to) : null, error: detail }).catch(() => {});
      results.push({ channel, outcome: "failed", detail });
    }
  }
  const failed = results.filter((r) => r.outcome === "failed");
  for (const r of results) if (r.outcome === "permanent_failed") log("warn", "notification permanently failed", { orderId, event, channel: r.channel, detail: r.detail });
  if (failed.length) throw new Error(`notify ${event} failed for: ${failed.map((f) => `${f.channel}(${f.detail ?? ""})`).join(", ")}`);
}

/** Outbox handlers: kind `notify.<event>`, payload { orderId }. Register once at module load (see index.ts). */
export const notificationJobHandlers: Record<string, JobHandler> = Object.fromEntries(
  NOTIFICATION_EVENTS.map((event) => [notifyJobKind(event), (async (job, ctx) => {
    const orderId = (job.payload as { orderId?: unknown } | null)?.orderId;
    if (typeof orderId !== "string" || !orderId) throw new Error("notify job: missing orderId");
    await sendOrderNotification(event, orderId, ctx);
  }) as JobHandler]),
);

export async function listOrderNotifications(db: Db, orderId: string) {
  const rows = await db.select().from(notificationLog).where(eq(notificationLog.orderId, orderId)).orderBy(desc(notificationLog.id));
  return rows.map((r) => ({ id: r.id, event: r.event, channel: r.channel, to: r.to, provider: r.provider, status: r.status, error: r.error, at: r.at }));
}

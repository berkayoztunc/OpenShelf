import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import { campaignRecipients, campaigns, customerConsents } from "@openshelf/db";
import { enqueueJob } from "@openshelf/core";
import type { EmailProvider, SmsProvider } from "@openshelf/integration-sdk";
import { cleanSmsText, stripHeaderChars, toE164 } from "@openshelf/shared";
import type { Db, Env } from "../env";
import type { JobHandler } from "../outbox";
import { EMAIL_PROVIDER_IDS, SMS_PROVIDER_IDS } from "../integrations/registry";
import { getSettings } from "./settings";
import { renderComposed } from "./compose";
import { scrub } from "./log";

export const MAX_RECIPIENTS = 5000;
export const SEND_BATCH = 40;
const PAID = "('paid','fulfilling','shipped','delivered')";

export const CampaignFilters = z.object({
  /** at least N paid orders */
  minOrders: z.number().int().min(0).max(1000).optional(),
  /** ordered within the last N days */
  orderedWithinDays: z.number().int().min(1).max(3650).optional(),
  city: z.string().trim().max(80).optional(),
}).default({});
export type CampaignFilters = z.infer<typeof CampaignFilters>;

export const CampaignBody = z.object({
  name: z.string().trim().min(1).max(120),
  channel: z.enum(["email", "sms"]),
  subject: z.string().max(200).optional().default(""),
  body: z.string().trim().min(1).max(20000),
  filters: CampaignFilters,
}).superRefine((v, ctx) => {
  if (v.channel === "email" && !v.subject.trim()) ctx.addIssue({ code: "custom", path: ["subject"], message: "Subject is required for e-mail" });
  if (v.channel === "sms" && v.body.length > 1000) ctx.addIssue({ code: "custom", path: ["body"], message: "SMS text is too long (max 1000 characters)" });
});

export interface Audience { id: string; name: string | null; to: string }

/**
 * Customers who gave MARKETING consent (their latest consent record says yes; an unsubscribe is a newer "no"), are not anonymised,
 * have a usable address/phone, and match the filters. Never includes anyone without explicit consent.
 */
export async function loadAudience(db: Db, channel: "email" | "sms", f: CampaignFilters, limit = MAX_RECIPIENTS + 1): Promise<Audience[]> {
  const where = [
    sql`c.anonymized_at IS NULL`,
    sql`EXISTS (SELECT 1 FROM customer_consents cc WHERE cc.customer_id = c.id AND cc.marketing = 1 AND cc.id = (SELECT MAX(id) FROM customer_consents WHERE customer_id = c.id))`,
    channel === "email" ? sql`c.email LIKE '%_@_%._%' AND c.email NOT LIKE '%.invalid'` : sql`c.phone IS NOT NULL AND c.phone <> ''`,
  ];
  if (f.minOrders) where.push(sql`(SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.id AND o.status IN ${sql.raw(PAID)}) >= ${f.minOrders}`);
  if (f.orderedWithinDays) where.push(sql`EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.id AND o.status IN ${sql.raw(PAID)} AND o.created_at >= unixepoch() - ${f.orderedWithinDays * 86400})`);
  if (f.city) where.push(sql`EXISTS (SELECT 1 FROM addresses a WHERE a.customer_id = c.id)`); // matched in JS below: SQLite lower() is ASCII-only (İzmir/izmir)
  const rows = (await db.all(sql`SELECT c.id AS id, c.name AS name, c.email AS email, c.phone AS phone, (SELECT group_concat(a.city, '|') FROM addresses a WHERE a.customer_id = c.id) AS cities FROM customers c WHERE ${sql.join(where, sql` AND `)} ORDER BY c.created_at LIMIT ${f.city ? 50000 : limit}`)) as
    { id: string; name: string | null; email: string; phone: string | null; cities: string | null }[];
  const want = f.city?.toLocaleLowerCase("tr");
  const out: Audience[] = [];
  for (const r of rows) {
    if (want && !(r.cities ?? "").split("|").some((x) => x.toLocaleLowerCase("tr") === want)) continue;
    if (out.length >= limit) break;
    const to = channel === "email" ? r.email : toE164(r.phone);
    if (to) out.push({ id: r.id, name: r.name, to });
  }
  return out;
}

export async function hasMarketingConsent(db: Db, customerId: string): Promise<boolean> {
  const rows = (await db.all(sql`SELECT marketing FROM customer_consents WHERE customer_id = ${customerId} ORDER BY id DESC LIMIT 1`)) as { marketing: number }[];
  return rows[0]?.marketing === 1;
}

/* ---------- unsubscribe (signed link, no login) ---------- */
async function hmacHex(key: string, msg: string): Promise<string> {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return [...new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(msg)))].map((b) => b.toString(16).padStart(2, "0")).join("");
}
export const unsubToken = (env: Pick<Env, "APP_ENCRYPTION_KEY">, customerId: string) => hmacHex(env.APP_ENCRYPTION_KEY ?? "", `unsubscribe:${customerId}`);
export async function verifyUnsubToken(env: Pick<Env, "APP_ENCRYPTION_KEY">, customerId: string, token: string): Promise<boolean> {
  const exp = await unsubToken(env, customerId);
  if (exp.length !== token.length) return false;
  let r = 0; for (let i = 0; i < exp.length; i++) r |= exp.charCodeAt(i) ^ token.charCodeAt(i);
  return r === 0;
}
export const unsubUrl = async (env: Pick<Env, "APP_ENCRYPTION_KEY">, origin: string, customerId: string) => `${origin}/unsubscribe/${customerId}/${await unsubToken(env, customerId)}`;

/** Records a newer "no marketing" consent: that customer drops out of every audience immediately. */
export async function unsubscribeCustomer(db: Db, customerId: string, ip: string | null) {
  await db.insert(customerConsents).values({ customerId, analytics: false, marketing: false, policyVersion: "unsubscribe", ip });
}

/* ---------- rendering (preview, test and real send share it) ---------- */
export interface Rendered { subject: string; html?: string; text: string }
export function renderCampaign(c: { channel: string; subject: string | null; body: string }, who: { name?: string | null }, store: { storeName: string; contactEmail?: string }, unsub: string): Rendered {
  const fill = (s: string) => s.replace(/\{\{\s*storeName\s*\}\}/g, store.storeName).replace(/\{\{\s*name\s*\}\}/g, (who.name ?? "").trim());
  const text = fill(c.body);
  if (c.channel === "sms") return { subject: "", text: `${cleanSmsText(text)}\nÇık/Opt-out: ${unsub}` };
  const r = renderComposed(`${text}\n\nAbonelikten çık / Unsubscribe: ${unsub}`, { storeName: store.storeName, contactEmail: store.contactEmail });
  return { subject: stripHeaderChars(fill(c.subject ?? "")).slice(0, 200), html: r.html, text: r.text };
}

async function recount(db: Db, id: string) {
  const rows = (await db.all(sql`SELECT status, COUNT(*) AS n FROM campaign_recipients WHERE campaign_id = ${id} GROUP BY status`)) as { status: string; n: number }[];
  const n = (s: string) => rows.find((r) => r.status === s)?.n ?? 0;
  const sent = n("sent"), failed = n("failed"), skipped = n("skipped"), pending = n("pending");
  await db.update(campaigns).set({ sent, failed, skipped }).where(eq(campaigns.id, id));
  return { sent, failed, skipped, pending };
}

/** payload: { campaignId, origin, n }. Sends one batch, then queues the next; finalises when nothing is pending. Opt-outs made meanwhile are honoured. */
export const campaignSendJob: JobHandler = async (job, ctx) => {
  const p = job.payload as { campaignId: string; origin: string; n?: number };
  const db = ctx.db;
  const [camp] = await db.select().from(campaigns).where(eq(campaigns.id, p.campaignId)).limit(1);
  if (!camp || camp.status !== "sending") return; // cancelled / deleted / already finished
  const pending = await db.select().from(campaignRecipients).where(sql`${campaignRecipients.campaignId} = ${camp.id} AND ${campaignRecipients.status} = 'pending'`).limit(SEND_BATCH);
  if (pending.length === 0) {
    const c = await recount(db, camp.id);
    await db.update(campaigns).set({ status: "done", finishedAt: new Date() }).where(eq(campaigns.id, camp.id));
    await ctx.log("info", "campaign.send done", { campaignId: camp.id, ...c });
    return;
  }
  const ids = camp.channel === "sms" ? SMS_PROVIDER_IDS : EMAIL_PROVIDER_IDS;
  let found: { adapter: unknown; id: string } | null = null;
  for (const id of ids) { const a = await ctx.getAdapter(id); if (a) { found = { adapter: a, id }; break; } }
  if (!found) {
    await db.update(campaigns).set({ status: "failed", finishedAt: new Date() }).where(eq(campaigns.id, camp.id));
    await ctx.log("error", "campaign.send: no enabled provider", { campaignId: camp.id, channel: camp.channel });
    return;
  }
  const [general, notif] = await Promise.all([getSettings(db, "general"), getSettings(db, "notifications")]);
  for (const r of pending) {
    if (!(await hasMarketingConsent(db, r.customerId))) {
      await db.update(campaignRecipients).set({ status: "skipped", error: "opted_out" }).where(eq(campaignRecipients.id, r.id));
      continue;
    }
    const out = renderCampaign(camp, { name: r.name }, { storeName: general.storeName, contactEmail: general.contactEmail }, await unsubUrl(ctx.env, p.origin, r.customerId));
    try {
      const res = camp.channel === "sms"
        ? await (found.adapter as SmsProvider).send({ to: r.to, text: out.text, senderId: notif.smsSenderId || undefined })
        : await (found.adapter as EmailProvider).send({ to: r.to, from: notif.fromEmail || general.contactEmail || "", fromName: notif.fromName || general.storeName, subject: out.subject, html: out.html ?? "", text: out.text });
      await db.update(campaignRecipients).set(res.ok ? { status: "sent", sentAt: new Date() } : { status: "failed", error: scrub(res.detail ?? "send failed", []).slice(0, 300) }).where(eq(campaignRecipients.id, r.id));
    } catch (e) {
      await db.update(campaignRecipients).set({ status: "failed", error: (e instanceof Error ? e.message : "send failed").slice(0, 300) }).where(eq(campaignRecipients.id, r.id));
    }
  }
  const c = await recount(db, camp.id);
  if (c.pending > 0) {
    const n = (p.n ?? 0) + 1;
    await enqueueJob(db, { kind: "campaign.send", payload: { campaignId: camp.id, origin: p.origin, n }, dedupeKey: `campaign.send:${camp.id}:${n}` }, ctx.now);
  } else {
    await db.update(campaigns).set({ status: "done", finishedAt: new Date() }).where(eq(campaigns.id, camp.id));
    await ctx.log("info", "campaign.send done", { campaignId: camp.id, ...c });
  }
};


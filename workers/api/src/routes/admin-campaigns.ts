import { Hono } from "hono";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { campaignRecipients, campaigns, outboundSms } from "@openshelf/db";
import { enqueueJob, maskRecipient } from "@openshelf/core";
import type { EmailProvider, SmsProvider } from "@openshelf/integration-sdk";
import { cleanSmsText, isE164, toE164 } from "@openshelf/shared";
import type { AppEnv } from "../env";
import { ApiError, body, notFound, paged, paging } from "../lib/http";
import { audit } from "../lib/audit";
import { requireRole } from "../middleware/auth";
import { enforceRateLimit, hit } from "../middleware/security";
import { getAdapter, isIntegrationEnabled } from "../lib/integrations";
import { getSettings } from "../lib/settings";
import { scrub } from "../lib/log";
import { EMAIL_PROVIDER_IDS, SMS_PROVIDER_IDS } from "../integrations/registry";
import { CampaignBody, CampaignFilters, MAX_RECIPIENTS, loadAudience, renderCampaign, unsubUrl } from "../lib/campaigns";

export const adminCampaigns = new Hono<AppEnv>();
adminCampaigns.use("/campaigns/*", requireRole("admin"));
adminCampaigns.use("/campaigns", requireRole("admin"));
adminCampaigns.use("/sms/*", requireRole("admin"));
adminCampaigns.use("/sms", requireRole("admin"));

const SMS_LIMITS = { perAdminHour: 30, totalDay: 300 } as const;
const AudienceBody = z.object({ channel: z.enum(["email", "sms"]), filters: CampaignFilters });
const TestBody = z.object({ to: z.string().min(3).max(120) });
const SmsBody = z.object({ to: z.string().min(3).max(40), text: z.string().trim().min(1).max(1000) });
const EMAIL_RE = /^[^\s@<>",;]+@[^\s@<>",;]+\.[^\s@<>",;]+$/;

async function provider<T>(c: { env: AppEnv["Bindings"] }, db: AppEnv["Variables"]["db"], ids: readonly string[]) {
  for (const id of ids) {
    if (!(await isIntegrationEnabled(c.env, db, id as never))) continue;
    const a = await getAdapter<never>(c.env, db, id as never);
    if (a) return { id, adapter: a.adapter as T, secrets: a.secrets };
  }
  return null;
}
const origin = (c: { req: { url: string } }) => new URL(c.req.url).origin;
const loadCampaign = async (db: AppEnv["Variables"]["db"], id: string) => {
  const [r] = await db.select().from(campaigns).where(eq(campaigns.id, id)).limit(1);
  if (!r) throw notFound("Campaign");
  return r;
};

/* ---------------- audience ---------------- */
adminCampaigns.post("/campaigns/audience", async (c) => {
  const b = await body(c, AudienceBody);
  const rows = await loadAudience(c.get("db"), b.channel, b.filters);
  return c.json({ count: Math.min(rows.length, MAX_RECIPIENTS), truncated: rows.length > MAX_RECIPIENTS, max: MAX_RECIPIENTS, sample: rows.slice(0, 5).map((r) => ({ name: r.name, to: maskRecipient(r.to) })) });
});

/* ---------------- CRUD ---------------- */
adminCampaigns.get("/campaigns", async (c) => {
  const db = c.get("db"); const p = paging(c);
  const rows = await db.select().from(campaigns).orderBy(desc(campaigns.createdAt)).limit(p.pageSize).offset(p.offset);
  const [t] = await db.select({ n: sql<number>`count(*)` }).from(campaigns);
  return c.json(paged(rows.map(({ body: _b, ...r }) => r), t?.n ?? 0, p));
});

adminCampaigns.get("/campaigns/:id", async (c) => {
  const db = c.get("db"); const camp = await loadCampaign(db, c.req.param("id"));
  const [pending] = await db.select({ n: sql<number>`count(*)` }).from(campaignRecipients).where(and(eq(campaignRecipients.campaignId, camp.id), eq(campaignRecipients.status, "pending")));
  const problems = await db.select({ id: campaignRecipients.id, to: campaignRecipients.to, status: campaignRecipients.status, error: campaignRecipients.error })
    .from(campaignRecipients).where(and(eq(campaignRecipients.campaignId, camp.id), sql`${campaignRecipients.status} IN ('failed','skipped')`)).limit(20);
  return c.json({ ...camp, pending: pending?.n ?? 0, problems: problems.map((r) => ({ ...r, to: maskRecipient(r.to) })) });
});

adminCampaigns.post("/campaigns", async (c) => {
  const b = await body(c, CampaignBody); const db = c.get("db"); const id = crypto.randomUUID();
  await db.insert(campaigns).values({ id, name: b.name, channel: b.channel, subject: b.channel === "email" ? b.subject : null, body: b.body, filters: b.filters, createdBy: c.get("admin")!.id });
  await audit(c, "campaign.create", "campaign", id, { channel: b.channel });
  return c.json({ id }, 201);
});

adminCampaigns.put("/campaigns/:id", async (c) => {
  const b = await body(c, CampaignBody); const db = c.get("db"); const camp = await loadCampaign(db, c.req.param("id"));
  if (camp.status !== "draft") throw new ApiError(409, "invalid_state", "Only drafts can be edited");
  await db.update(campaigns).set({ name: b.name, channel: b.channel, subject: b.channel === "email" ? b.subject : null, body: b.body, filters: b.filters }).where(eq(campaigns.id, camp.id));
  return c.json({ id: camp.id });
});

adminCampaigns.delete("/campaigns/:id", async (c) => {
  const db = c.get("db"); const camp = await loadCampaign(db, c.req.param("id"));
  if (camp.status === "sending") throw new ApiError(409, "invalid_state", "Cancel the campaign before deleting it");
  await db.batch([db.delete(campaignRecipients).where(eq(campaignRecipients.campaignId, camp.id)), db.delete(campaigns).where(eq(campaigns.id, camp.id))]);
  await audit(c, "campaign.delete", "campaign", camp.id);
  return c.body(null, 204);
});

/* ---------------- preview / test ---------------- */
async function render(c: Parameters<typeof origin>[0] & { env: AppEnv["Bindings"]; get(k: "db"): AppEnv["Variables"]["db"] }, camp: typeof campaigns.$inferSelect, name: string | null) {
  const db = c.get("db"); const general = await getSettings(db, "general");
  return renderCampaign(camp, { name }, { storeName: general.storeName, contactEmail: general.contactEmail }, await unsubUrl(c.env, origin(c), "preview"));
}
adminCampaigns.post("/campaigns/:id/preview", async (c) => {
  const camp = await loadCampaign(c.get("db"), c.req.param("id"));
  return c.json(await render(c, camp, "Ayşe"));
});

adminCampaigns.post("/campaigns/:id/test", async (c) => {
  const b = await body(c, TestBody); const db = c.get("db"); const admin = c.get("admin")!;
  const camp = await loadCampaign(db, c.req.param("id"));
  await enforceRateLimit(c, "campaign-test", 10, 3600, admin.id);
  const sms = camp.channel === "sms";
  const to = sms ? toE164(b.to) : b.to.trim();
  if (!to || (sms ? !isE164(to) : !EMAIL_RE.test(to))) throw new ApiError(400, "invalid_recipient", sms ? "Phone must be E.164, e.g. +905301234567" : "Invalid e-mail address");
  const found = await provider<SmsProvider & EmailProvider>(c, db, sms ? SMS_PROVIDER_IDS : EMAIL_PROVIDER_IDS);
  if (!found) throw new ApiError(409, "no_provider", `No enabled ${sms ? "SMS" : "e-mail"} provider`);
  const [general, notif] = await Promise.all([getSettings(db, "general"), getSettings(db, "notifications")]);
  const out = await render(c, camp, "Test");
  let res: { ok: boolean; detail?: string };
  try {
    res = sms ? await found.adapter.send({ to, text: `[TEST] ${out.text}`, senderId: notif.smsSenderId || undefined })
      : await found.adapter.send({ to, from: notif.fromEmail || general.contactEmail || "", fromName: notif.fromName || general.storeName, subject: `[TEST] ${out.subject}`, html: out.html ?? "", text: out.text });
  } catch (e) { res = { ok: false, detail: scrub(e instanceof Error ? e.message : "error", Object.values(found.secrets)) }; }
  await audit(c, "campaign.test", "campaign", camp.id, { provider: found.id, ok: res.ok, to: maskRecipient(to) });
  if (!res.ok) throw new ApiError(502, "send_failed", "Provider rejected the test message", { detail: scrub(res.detail ?? "", Object.values(found.secrets)) });
  return c.json({ ok: true, provider: found.id });
});

/* ---------------- send / cancel ---------------- */
adminCampaigns.post("/campaigns/:id/send", async (c) => {
  const db = c.get("db"); const camp = await loadCampaign(db, c.req.param("id"));
  if (camp.status !== "draft") throw new ApiError(409, "invalid_state", "Only drafts can be sent");
  const found = await provider(c, db, camp.channel === "sms" ? SMS_PROVIDER_IDS : EMAIL_PROVIDER_IDS);
  if (!found) throw new ApiError(409, "no_provider", `No enabled ${camp.channel === "sms" ? "SMS" : "e-mail"} provider. Enable one in Integrations (or turn on Mock Mode).`);
  const rows = await loadAudience(db, camp.channel as "email" | "sms", camp.filters);
  if (rows.length === 0) throw new ApiError(409, "empty_audience", "No customers with marketing consent match this audience");
  if (rows.length > MAX_RECIPIENTS) throw new ApiError(409, "audience_too_large", `Audience exceeds ${MAX_RECIPIENTS} recipients: narrow the filters`);
  // claim the draft first (single UPDATE) so a double click cannot queue two sends
  const claim = await c.env.DB.prepare(`UPDATE campaigns SET status = 'sending', total = ?2, started_at = unixepoch() WHERE id = ?1 AND status = 'draft'`).bind(camp.id, rows.length).run();
  if (!claim.meta.changes) throw new ApiError(409, "invalid_state", "Campaign is already being sent");
  const stmts = [];
  for (let i = 0; i < rows.length; i += 14) {
    stmts.push(db.insert(campaignRecipients).values(rows.slice(i, i + 14).map((r) => ({ id: crypto.randomUUID(), campaignId: camp.id, customerId: r.id, to: r.to, name: r.name }))).onConflictDoNothing());
  }
  for (let i = 0; i < stmts.length; i += 40) await db.batch(stmts.slice(i, i + 40) as unknown as [any, ...any[]]);
  await enqueueJob(db, { kind: "campaign.send", payload: { campaignId: camp.id, origin: origin(c), n: 0 }, dedupeKey: `campaign.send:${camp.id}:0` });
  await audit(c, "campaign.send", "campaign", camp.id, { channel: camp.channel, recipients: rows.length, provider: found.id });
  return c.json({ id: camp.id, status: "sending", total: rows.length }, 202);
});

adminCampaigns.post("/campaigns/:id/cancel", async (c) => {
  const db = c.get("db"); const camp = await loadCampaign(db, c.req.param("id"));
  if (camp.status !== "sending") throw new ApiError(409, "invalid_state", "Only a running campaign can be cancelled");
  await db.batch([
    db.update(campaigns).set({ status: "cancelled", finishedAt: new Date() }).where(eq(campaigns.id, camp.id)),
    db.update(campaignRecipients).set({ status: "skipped", error: "cancelled" }).where(and(eq(campaignRecipients.campaignId, camp.id), eq(campaignRecipients.status, "pending"))),
  ]);
  const rows = (await db.all(sql`SELECT status, COUNT(*) AS n FROM campaign_recipients WHERE campaign_id = ${camp.id} GROUP BY status`)) as { status: string; n: number }[];
  const n = (s: string) => rows.find((r) => r.status === s)?.n ?? 0;
  await db.update(campaigns).set({ sent: n("sent"), failed: n("failed"), skipped: n("skipped") }).where(eq(campaigns.id, camp.id));
  await audit(c, "campaign.cancel", "campaign", camp.id);
  return c.json({ id: camp.id, status: "cancelled" });
});

/* ---------------- single SMS ---------------- */
/** Direct SMS to one number (costs money: rate limited, logged). Transactional/support use; campaigns need consent, this is a manual one-off. */
adminCampaigns.post("/sms/send", async (c) => {
  const b = await body(c, SmsBody); const db = c.get("db"); const admin = c.get("admin")!;
  const to = toE164(b.to);
  if (!to) throw new ApiError(400, "invalid_recipient", "Phone must be E.164, e.g. +905301234567");
  const found = await provider<SmsProvider>(c, db, SMS_PROVIDER_IDS);
  if (!found) throw new ApiError(409, "no_provider", "No SMS provider is enabled. Enable Netgsm/Twilio in Integrations (or turn on Mock Mode).");
  for (const [key, win, limit, code, msg] of [
    [`sms-send:admin:${admin.id}`, 3600, SMS_LIMITS.perAdminHour, "rate_limited_admin", "Hourly SMS limit reached for your account (30/hour)"],
    [`sms-send:total`, 86400, SMS_LIMITS.totalDay, "rate_limited_total", "Daily store-wide SMS limit reached (300/day)"],
  ] as const) {
    const r = await hit(c.env.DB, key, win);
    if (r.count > limit) throw new ApiError(429, code, msg, undefined, { "Retry-After": String(r.resetIn) });
  }
  const notif = await getSettings(db, "notifications");
  const id = crypto.randomUUID(); const text = cleanSmsText(b.text);
  await db.insert(outboundSms).values({ id, to, text, status: "queued", createdBy: admin.id });
  let res: { ok: boolean; providerMessageId?: string; detail?: string };
  try { res = await found.adapter.send({ to, text, senderId: notif.smsSenderId || undefined }); }
  catch (e) { res = { ok: false, detail: e instanceof Error ? e.message : "send failed" }; }
  const detail = scrub(res.detail ?? "send failed", Object.values(found.secrets)).slice(0, 300);
  await db.update(outboundSms).set(res.ok ? { status: "sent", provider: found.id, providerMessageId: res.providerMessageId ?? null, sentAt: new Date() } : { status: "failed", provider: found.id, error: detail }).where(eq(outboundSms.id, id));
  await audit(c, "sms.send", "outbound_sms", id, { ok: res.ok, to: maskRecipient(to), provider: found.id });
  if (!res.ok) throw new ApiError(502, "send_failed", `Provider rejected the message: ${detail}`, { id });
  return c.json({ id, status: "sent", provider: found.id }, 201);
});

adminCampaigns.get("/sms", async (c) => {
  const db = c.get("db"); const p = paging(c);
  const rows = await db.select().from(outboundSms).orderBy(desc(outboundSms.createdAt)).limit(p.pageSize).offset(p.offset);
  const [t] = await db.select({ n: sql<number>`count(*)` }).from(outboundSms);
  return c.json(paged(rows.map((r) => ({ ...r, to: maskRecipient(r.to) })), t?.n ?? 0, p));
});


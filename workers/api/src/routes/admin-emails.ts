import { Hono } from "hono";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { manualInvoices, outboundEmails } from "@openshelf/db";
import { maskRecipient } from "@openshelf/core";
import type { EmailProvider } from "@openshelf/integration-sdk";
import { ComposeEmailBody, NOTIFICATION_EVENTS, TEMPLATE_VARS, pickTemplate, stripHeaderChars } from "@openshelf/shared";
import type { AppEnv } from "../env";
import { ApiError, body, likeEscape, notFound, paged, paging } from "../lib/http";
import { audit } from "../lib/audit";
import { requireRole } from "../middleware/auth";
import { hit } from "../middleware/security";
import { getAdapter, isIntegrationEnabled } from "../lib/integrations";
import { getSettings } from "../lib/settings";
import { scrub } from "../lib/log";
import { sha256Hex } from "../lib/crypto";
import { EMAIL_PROVIDER_IDS } from "../integrations/registry";
import { renderComposed } from "../lib/compose";

export const adminEmails = new Hono<AppEnv>();

export const EMAIL_LIMITS = { perAdminHour: 30, totalDay: 100, perRecipientDay: 5 } as const;
const STATUSES = ["queued", "sent", "failed"];
const PreviewBody = z.object({ subject: z.string().max(200).default(""), body: z.string().max(20000).default(""), manualInvoiceId: z.string().optional() });

async function prepare(c: { get(k: "db"): AppEnv["Variables"]["db"] }, input: { subject: string; body: string; manualInvoiceId?: string }) {
  const db = c.get("db");
  const [general, notif] = await Promise.all([getSettings(db, "general"), getSettings(db, "notifications")]);
  const fill = (s: string) => s.replace(/\{\{\s*storeName\s*\}\}/g, general.storeName);
  const subject = stripHeaderChars(fill(input.subject)).slice(0, 200);
  const text = fill(input.body);
  const unresolved = [...new Set([...`${subject}\n${text}`.matchAll(/\{\{\s*([a-zA-Z]+)\s*\}\}/g)].map((m) => m[1]!))];
  let invoiceUrl: string | null = null; let invoiceNumber: string | null = null;
  if (input.manualInvoiceId) {
    const [inv] = await db.select().from(manualInvoices).where(eq(manualInvoices.id, input.manualInvoiceId)).limit(1);
    if (!inv) throw new ApiError(400, "validation_error", "Linked manual invoice not found", [{ path: "manualInvoiceId", message: "Not found" }]);
    if (inv.status === "issued" && inv.pdfUrl) { invoiceUrl = inv.pdfUrl; invoiceNumber = inv.number; }
  }
  const { html, text: plain } = renderComposed(text, { storeName: general.storeName, contactEmail: general.contactEmail, invoiceUrl, invoiceNumber });
  return {
    subject, html, text: plain, unresolved,
    // From is NEVER user-supplied: notification settings, falling back to the store contact address.
    from: notif.fromEmail || general.contactEmail || "", fromName: notif.fromName || general.storeName,
  };
}

async function emailAdapter(c: Parameters<typeof getAdapter>[0], db: AppEnv["Variables"]["db"]) {
  for (const id of EMAIL_PROVIDER_IDS) {
    if (!(await isIntegrationEnabled(c, db, id))) continue;
    const a = await getAdapter<EmailProvider>(c, db, id);
    if (a) return { id, ...a };
  }
  return null;
}

async function enforceEmailLimits(c: { env: { DB: D1Database } }, adminId: string, to: string) {
  const d1 = c.env.DB;
  const rcpt = await sha256Hex(to.toLowerCase());
  const checks: [string, number, number, string, string][] = [
    [`email-compose:admin:${adminId}`, 3600, EMAIL_LIMITS.perAdminHour, "rate_limited_admin", "Hourly e-mail limit reached for your account (30/hour)"],
    [`email-compose:total`, 86400, EMAIL_LIMITS.totalDay, "rate_limited_total", "Daily store-wide e-mail limit reached (100/day)"],
    [`email-compose:rcpt:${rcpt}`, 86400, EMAIL_LIMITS.perRecipientDay, "rate_limited_recipient", "Daily limit reached for this recipient (5/day)"],
  ];
  for (const [key, win, limit, code, msg] of checks) {
    const r = await hit(d1, key, win);
    if (r.count > limit) throw new ApiError(429, code, msg, undefined, { "Retry-After": String(r.resetIn) });
  }
}

/** Sends an already-persisted row (status must be 'queued' and owned by this call) and records the outcome. */
async function deliver(c: Parameters<typeof audit>[0], row: typeof outboundEmails.$inferSelect, found: NonNullable<Awaited<ReturnType<typeof emailAdapter>>>, from: { email: string; name: string }) {
  const db = c.get("db");
  const secrets = Object.values(found.secrets);
  let res: { ok: boolean; providerMessageId?: string; detail?: string };
  try {
    res = await found.adapter.send({
      to: row.to, from: from.email, fromName: from.name, subject: row.subject, html: row.bodyHtml, text: row.bodyText,
      ...(row.cc ? { cc: row.cc } : {}), ...(row.replyTo ? { replyTo: row.replyTo } : {}),
    });
  } catch (e) { res = { ok: false, detail: e instanceof Error ? e.message : "send failed" }; }
  if (res.ok) {
    await db.update(outboundEmails).set({ status: "sent", provider: found.id, providerMessageId: res.providerMessageId ?? null, error: null, sentAt: new Date() }).where(eq(outboundEmails.id, row.id));
    await audit(c, "email.compose.send", "outbound_email", row.id, { ok: true, to: maskRecipient(row.to), provider: found.id });
    return { ok: true as const };
  }
  const detail = scrub(res.detail ?? "send failed", secrets).slice(0, 300);
  await db.update(outboundEmails).set({ status: "failed", provider: found.id, error: detail }).where(eq(outboundEmails.id, row.id));
  await audit(c, "email.compose.send", "outbound_email", row.id, { ok: false, to: maskRecipient(row.to), provider: found.id, error: detail });
  return { ok: false as const, detail };
}

adminEmails.get("/emails/templates", requireRole("staff"), async (c) => {
  const notif = await getSettings(c.get("db"), "notifications");
  const items = (["tr", "en"] as const).flatMap((lang) => NOTIFICATION_EVENTS.map((event) => ({
    id: `${event}:${lang}`, event, lang, ...pickTemplate(notif.templates[lang], lang, event), isDefault: !notif.templates[lang]?.[event]?.subject?.trim() && !notif.templates[lang]?.[event]?.body?.trim(),
  })));
  return c.json({
    items, variables: TEMPLATE_VARS,
    note: "Only {{storeName}} is substituted when composing; replace the other placeholders by hand. Unresolved placeholders are rejected on send.",
  });
});

adminEmails.post("/emails/preview", requireRole("staff"), async (c) => {
  const b = await body(c, PreviewBody);
  const p = await prepare(c, b);
  return c.json({ subject: p.subject, html: p.html, text: p.text, from: p.from, fromName: p.fromName, warnings: p.unresolved.map((v) => ({ code: "unresolved_placeholder", message: `Placeholder {{${v}}} is not replaced` })) });
});

adminEmails.get("/emails", requireRole("staff"), async (c) => {
  const db = c.get("db"); const p = paging(c);
  const conds = [];
  const status = c.req.query("status"); const q = c.req.query("q")?.trim();
  if (status) { if (!STATUSES.includes(status)) throw new ApiError(400, "validation_error", "Unknown status"); conds.push(eq(outboundEmails.status, status)); }
  if (q) { const l = `%${likeEscape(q)}%`; conds.push(sql`(${outboundEmails.to} LIKE ${l} ESCAPE '\\' OR ${outboundEmails.subject} LIKE ${l} ESCAPE '\\')`); }
  const where = conds.length ? and(...conds) : undefined;
  const rows = await db.select({
    id: outboundEmails.id, to: outboundEmails.to, cc: outboundEmails.cc, subject: outboundEmails.subject, status: outboundEmails.status, provider: outboundEmails.provider,
    error: outboundEmails.error, orderId: outboundEmails.orderId, customerId: outboundEmails.customerId, manualInvoiceId: outboundEmails.manualInvoiceId,
    createdBy: outboundEmails.createdBy, createdAt: outboundEmails.createdAt, sentAt: outboundEmails.sentAt,
  }).from(outboundEmails).where(where).orderBy(desc(outboundEmails.createdAt)).limit(p.pageSize).offset(p.offset);
  const [t] = await db.select({ n: sql<number>`count(*)` }).from(outboundEmails).where(where);
  return c.json(paged(rows, t?.n ?? 0, p));
});

adminEmails.get("/emails/:id", requireRole("staff"), async (c) => {
  const [r] = await c.get("db").select().from(outboundEmails).where(eq(outboundEmails.id, c.req.param("id"))).limit(1);
  if (!r) throw notFound("E-mail");
  return c.json(r);
});

adminEmails.post("/emails", requireRole("admin"), async (c) => {
  const b = await body(c, ComposeEmailBody); const db = c.get("db"); const admin = c.get("admin")!;
  const p = await prepare(c, b);
  if (p.unresolved.length) throw new ApiError(400, "unresolved_placeholders", `Replace these placeholders first: ${p.unresolved.map((v) => `{{${v}}}`).join(", ")}`);
  const found = await emailAdapter(c.env, db);
  if (!found) throw new ApiError(409, "no_email_provider", "No e-mail provider is enabled. Enable Cloudflare Email in Integrations (or turn on Mock Mode).");
  await enforceEmailLimits(c, admin.id, b.to);
  const id = crypto.randomUUID();
  await db.insert(outboundEmails).values({
    id, to: b.to, cc: b.cc || null, replyTo: b.replyTo || null, subject: p.subject, bodyText: p.text, bodyHtml: p.html, status: "queued",
    orderId: b.orderId ?? null, customerId: b.customerId ?? null, manualInvoiceId: b.manualInvoiceId ?? null, createdBy: admin.id,
  });
  const [row] = await db.select().from(outboundEmails).where(eq(outboundEmails.id, id)).limit(1);
  const r = await deliver(c, row!, found, { email: p.from, name: p.fromName });
  if (!r.ok) throw new ApiError(502, "send_failed", `Provider rejected the message: ${r.detail}`, { id, detail: r.detail });
  const [done] = await db.select().from(outboundEmails).where(eq(outboundEmails.id, id)).limit(1);
  return c.json({ id, status: done!.status, provider: done!.provider, sentAt: done!.sentAt }, 201);
});

adminEmails.post("/emails/:id/resend", requireRole("admin"), async (c) => {
  const id = c.req.param("id"); const db = c.get("db"); const admin = c.get("admin")!;
  const [row] = await db.select().from(outboundEmails).where(eq(outboundEmails.id, id)).limit(1);
  if (!row) throw notFound("E-mail");
  if (row.status !== "failed") throw new ApiError(409, "invalid_state", "Only failed e-mails can be resent");
  const found = await emailAdapter(c.env, db);
  if (!found) throw new ApiError(409, "no_email_provider", "No e-mail provider is enabled");
  await enforceEmailLimits(c, admin.id, row.to);
  const claim = await c.env.DB.prepare(`UPDATE outbound_emails SET status = 'queued', error = NULL WHERE id = ?1 AND status = 'failed'`).bind(id).run();
  if (!claim.meta.changes) throw new ApiError(409, "invalid_state", "E-mail is already being resent");
  const [general, notif] = await Promise.all([getSettings(db, "general"), getSettings(db, "notifications")]);
  const r = await deliver(c, { ...row, status: "queued" }, found, { email: notif.fromEmail || general.contactEmail || "", name: notif.fromName || general.storeName });
  if (!r.ok) throw new ApiError(502, "send_failed", `Provider rejected the message: ${r.detail}`, { id, detail: r.detail });
  return c.json({ id, status: "sent" });
});

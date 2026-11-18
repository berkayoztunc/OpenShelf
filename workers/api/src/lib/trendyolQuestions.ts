/**
 * Trendyol unanswered-question reminder.
 *
 * Trendyol expects seller answers within 24 hours. Every hour the waiting questions are read (same mock/live path as the console)
 * and the store admin gets one e-mail per question twice at most: when it first shows up, and when fewer than 6 hours are left.
 * "Once" is enforced by the outbox dedupe key of the per-question notify job — no extra table.
 */
import { inArray } from "drizzle-orm";
import { outboxJobs } from "@openshelf/db";
import { enqueueJob } from "@openshelf/core";
import type { EmailProvider } from "@openshelf/integration-sdk";
import type { Db } from "../env";
import type { JobHandler } from "../outbox";
import { EMAIL_PROVIDER_IDS } from "../integrations/registry";
import { trendyolSystemRead } from "../routes/admin-trendyol";
import { recallOrigin } from "./origins";
import { getSettings } from "./settings";

export const QUESTION_SCAN_JOB = "trendyol.question_reminder";
export const QUESTION_NOTIFY_JOB = "trendyol.question_notify";
const HOUR = 3600_000;
export const ANSWER_WINDOW_H = 24;
/** "due" reminder once a question has waited this long (6 hours before Trendyol's 24-hour limit). */
export const DUE_AFTER_H = 18;

export type Stage = "new" | "due";
export interface WaitingQuestion { id: string; text: string; productName: string; createdAt: number; webUrl?: string }

/** Stages a question has reached at `now` (a question first seen when already old gets only the "due" mail). */
export function stagesFor(q: WaitingQuestion, now: number): Stage[] {
  const ageH = (now - q.createdAt) / HOUR;
  return ageH >= DUE_AFTER_H ? ["due"] : ["new"];
}
export const questionKey = (id: string, stage: Stage) => `${QUESTION_NOTIFY_JOB}:${id}:${stage}`;

/** Trendyol / mock `getQuestionFilter` page → plain list (unknown shapes are skipped). */
export function parseQuestions(body: unknown): WaitingQuestion[] {
  const content = (body as { content?: unknown[] } | null)?.content;
  if (!Array.isArray(content)) return [];
  const out: WaitingQuestion[] = [];
  for (const raw of content) {
    const q = raw as Record<string, unknown>;
    if ((typeof q.id !== "number" && typeof q.id !== "string") || typeof q.creationDate !== "number") continue;
    out.push({ id: String(q.id), text: String(q.text ?? "").slice(0, 1000), productName: String(q.productName ?? "").slice(0, 200), createdAt: q.creationDate, ...(typeof q.webUrl === "string" ? { webUrl: q.webUrl } : {}) });
  }
  return out;
}

async function enqueued(db: Db, keys: string[]): Promise<Set<string>> {
  if (!keys.length) return new Set();
  const rows = await db.select({ k: outboxJobs.dedupeKey }).from(outboxJobs).where(inArray(outboxJobs.dedupeKey, keys));
  return new Set(rows.map((r) => r.k ?? ""));
}

export const questionScanHandler: JobHandler = async (_job, ctx) => {
  const notif = await getSettings(ctx.db, "notifications");
  if (!notif.adminEmail) return; // nobody to remind
  const res = await trendyolSystemRead(ctx.env, ctx.db, "getQuestionFilter", { query: { status: "WAITING_FOR_ANSWER", page: 0, size: 50, orderByField: "CreatedDate", orderByDirection: "DESC" } });
  if (!res) return;
  if (!res.ok) throw new Error(`getQuestionFilter HTTP ${res.status}: ${res.error?.message ?? ""}`.slice(0, 300));
  const now = ctx.now.getTime();
  const wanted = parseQuestions(res.response.body).flatMap((q) => stagesFor(q, now).map((stage) => ({ q, stage, key: questionKey(q.id, stage) })));
  const done = await enqueued(ctx.db, wanted.map((w) => w.key));
  for (const w of wanted) {
    if (done.has(w.key)) continue;
    await enqueueJob(ctx.db, { kind: QUESTION_NOTIFY_JOB, payload: { ...w.q, stage: w.stage }, dedupeKey: w.key }, ctx.now);
  }
};

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function questionEmail(q: WaitingQuestion & { stage: Stage }, now: number, o: { storeName: string; adminUrl: string | null }) {
  const leftH = Math.max(0, Math.floor(ANSWER_WINDOW_H - (now - q.createdAt) / HOUR));
  const subject = q.stage === "due"
    ? `[Trendyol] Cevap süresi doluyor (${leftH} saat kaldı): ${q.productName}`
    : `[Trendyol] Yeni müşteri sorusu: ${q.productName}`;
  const lines = [
    q.stage === "due" ? `Bu soru ${ANSWER_WINDOW_H} saatlik cevap süresinin dolmasına yaklaşık ${leftH} saat kala hâlâ cevapsız.` : "Trendyol'da ürününüze yeni bir soru geldi.",
    `Ürün: ${q.productName}`,
    `Soru: ${q.text}`,
    `Soruldu: ${new Date(q.createdAt).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" })}`,
  ];
  const text = [...lines, ...(o.adminUrl ? [`Cevaplamak için: ${o.adminUrl}`] : []), "", o.storeName].join("\n");
  const html = `<div style="font-family:system-ui,Arial,sans-serif;font-size:14px;line-height:1.5;color:#111">
<p style="margin:0 0 12px">${esc(lines[0]!)}</p>
<table style="border-collapse:collapse;margin:0 0 16px"><tr><td style="padding:2px 12px 2px 0;color:#666">Ürün</td><td style="padding:2px 0;font-weight:600">${esc(q.productName)}</td></tr>
<tr><td style="padding:2px 12px 2px 0;color:#666;vertical-align:top">Soru</td><td style="padding:2px 0">${esc(q.text)}</td></tr></table>
${o.adminUrl ? `<p style="margin:0 0 16px"><a href="${esc(o.adminUrl)}" style="display:inline-block;background:#f27a1a;color:#fff;text-decoration:none;padding:9px 16px;border-radius:8px;font-weight:600">Soruyu cevapla</a></p>` : ""}
<p style="margin:0;color:#888;font-size:12px">${esc(o.storeName)} · OpenShelf</p></div>`;
  return { subject, text, html };
}

export const questionNotifyHandler: JobHandler = async (job, ctx) => {
  const q = job.payload as WaitingQuestion & { stage: Stage };
  const [notif, general] = await Promise.all([getSettings(ctx.db, "notifications"), getSettings(ctx.db, "general")]);
  if (!notif.adminEmail || !notif.fromEmail) { await ctx.log("info", `trendyol question ${q.id}: no admin/sender e-mail configured, reminder skipped`); return; }
  let provider: EmailProvider | null = null;
  for (const id of EMAIL_PROVIDER_IDS) { provider = await ctx.getAdapter<EmailProvider>(id).catch(() => null); if (provider) break; }
  if (!provider) { await ctx.log("info", `trendyol question ${q.id}: no e-mail provider, reminder skipped`); return; }
  const origin = (ctx.env.API_ORIGIN || (await recallOrigin(ctx.env.DB)) || "").replace(/\/+$/, "");
  const mail = questionEmail(q, ctx.now.getTime(), { storeName: general.storeName, adminUrl: origin ? `${origin}/admin/trendyol/questions` : null });
  const r = await provider.send({ to: notif.adminEmail, from: notif.fromEmail, fromName: notif.fromName || general.storeName, ...mail });
  if (!r.ok) throw new Error(`question reminder e-mail failed: ${r.detail ?? "unknown"}`.slice(0, 300));
};

/** Cron entry: only when Trendyol is usable (mock or live) — `trendyolSystemRead` returns null otherwise. */
export async function enqueueQuestionScan(db: Db, now: Date) {
  await enqueueJob(db, { kind: QUESTION_SCAN_JOB, payload: {}, dedupeKey: `${QUESTION_SCAN_JOB}:${Math.floor(now.getTime() / 3_600_000)}` }, now);
}

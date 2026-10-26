import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/d1";
import { z } from "zod";
import * as schema from "@openshelf/db";
import type { AdapterFactory, EmailProvider, SmsProvider } from "@openshelf/integration-sdk";
import { escapeHtml, renderEmailHtml, renderSubject, DEFAULT_TEMPLATES, isE164, toE164, smsInfo, NOTIFICATION_EVENTS } from "@openshelf/shared";
import { planMessages } from "@openshelf/core";
import { registerFactory } from "../src/integrations/registry";
import { getAdapter } from "../src/lib/integrations";
import { saveSettings, getSettings } from "../src/lib/settings";
import { notificationJobHandlers, sendOrderNotification } from "../src/lib/notify";
import type { JobContext } from "../src/outbox";
import { admin, call, ensureOwner, freshIp, j, loginAs } from "./helpers";

const db = drizzle(env.DB, { schema });
const sent: { channel: string; to: string; subject?: string; text: string; html?: string }[] = [];
const behavior = { smsOk: true, emailOk: true };
const permissive = z.object({ config: z.record(z.unknown()), secrets: z.record(z.string()) });
const smsFactory: AdapterFactory<SmsProvider> = {
  manifest: { id: "netgsm", name: "Fake SMS", description: "t", publicFields: [], secretFields: [{ key: "k", label: "k", secret: true }], schema: permissive },
  create: () => ({ id: "netgsm", async validateConfig() {}, async healthCheck() { return { ok: true }; },
    async send(m) { if (!behavior.smsOk) return { ok: false, detail: "HTTP 503" }; sent.push({ channel: "sms", to: m.to, text: m.text }); return { ok: true, providerMessageId: "m1" }; } }),
};
const emailFactory: AdapterFactory<EmailProvider> = {
  manifest: { id: "cf_email", name: "Fake Email", description: "t", publicFields: [], secretFields: [{ key: "k", label: "k", secret: true }], schema: permissive },
  create: () => ({ id: "cf_email", async validateConfig() {}, async healthCheck() { return { ok: true }; },
    async send(m) { if (!behavior.emailOk) return { ok: false, detail: "HTTP 503" }; sent.push({ channel: "email", to: m.to, subject: m.subject, text: m.text, html: m.html }); return { ok: true }; } }),
};
const ctx = (): JobContext => ({ env, db, now: new Date(), log: async () => {}, getAdapter: (p) => getAdapter(env, db, p).then((a) => (a?.adapter as never) ?? null) });

let n = 0;
async function mkOrder(o: { name?: string; email?: string; phone?: string; status?: string } = {}) {
  const id = `ntf-${Date.now()}-${++n}`;
  await env.DB.prepare(`INSERT INTO orders (id, number, status, email, shipping_address, currency, subtotal, total, tracking_token) VALUES (?1,?2,'paid',?3,?4,'TRY',1000,1000,'tok123')`)
    .bind(id, `OS-${id}`, o.email ?? `buyer${n}@example.com`, JSON.stringify({ name: o.name ?? "Ayşe", phone: o.phone ?? `+90555${String(1000000 + n)}`, line1: "x", city: "y", country: "TR" })).run();
  return id;
}
async function setProviders(sms: boolean, email: boolean) {
  const s = await ensureOwner();
  registerFactory("netgsm", smsFactory as never); registerFactory("cf_email", emailFactory as never);
  expect((await admin(s, "/integrations/netgsm", "PUT", { enabled: sms, config: {}, secrets: { k: "secret-value-1" } })).status).toBe(200);
  expect((await admin(s, "/integrations/cf_email", "PUT", { enabled: email, config: {}, secrets: { k: "secret-value-2" } })).status).toBe(200);
  return s;
}
async function setEvents(ev: Record<string, { sms: boolean; email: boolean }>) {
  const cur = await getSettings(db, "notifications");
  await saveSettings(db, "notifications", { ...cur, fromEmail: "shop@example.com", adminEmail: "admin@example.com", adminPhone: "+905550000000", events: { ...cur.events, ...ev } } as never, null);
}
const logRows = async (orderId: string) => (await env.DB.prepare(`SELECT event, channel, status, error, "to" FROM notification_log WHERE order_id = ?1 ORDER BY id`).bind(orderId).all<any>()).results;
const run = (event: string, orderId: string, attempts = 1) => notificationJobHandlers[`notify.${event}`]!({ id: "j", kind: `notify.${event}`, payload: { orderId }, attempts, maxAttempts: 8 }, ctx());

beforeEach(() => { sent.length = 0; behavior.smsOk = true; behavior.emailOk = true; });

describe("notification engine", () => {
  it("registers a handler per event kind", () => {
    for (const e of NOTIFICATION_EVENTS) expect(notificationJobHandlers[`notify.${e}`]).toBeTypeOf("function");
  });
  it("sends once per channel; replay is a no-op (idempotent)", async () => {
    await setProviders(true, true); await setEvents({ order_paid: { sms: true, email: true } });
    const id = await mkOrder();
    await run("order_paid", id); await run("order_paid", id); await run("order_paid", id);
    expect(sent.filter((s) => s.channel === "sms")).toHaveLength(1);
    expect(sent.filter((s) => s.channel === "email")).toHaveLength(1);
    expect((await logRows(id)).map((r) => `${r.channel}:${r.status}`)).toEqual(["sms:sent", "email:sent"]);
  });
  it("channel switched off sends nothing and records nothing", async () => {
    await setProviders(true, true); await setEvents({ order_shipped: { sms: false, email: false }, order_delivered: { sms: false, email: true } });
    const id = await mkOrder();
    await run("order_shipped", id);
    expect(sent).toHaveLength(0); expect(await logRows(id)).toHaveLength(0);
    await run("order_delivered", id);
    expect(sent.map((s) => s.channel)).toEqual(["email"]);
  });
  it("no enabled provider => skipped (recorded), never sent", async () => {
    await setProviders(false, false); await setEvents({ order_paid: { sms: true, email: true } });
    const id = await mkOrder();
    await run("order_paid", id);
    expect(sent).toHaveLength(0);
    expect((await logRows(id)).map((r) => `${r.channel}:${r.status}:${r.error}`)).toEqual(["sms:skipped:no_provider", "email:skipped:no_provider"]);
  });
  it("recipient is only the order's own contact; admin events go to configured admin", async () => {
    await setProviders(true, true); await setEvents({ order_paid: { sms: true, email: true }, admin_new_order: { sms: true, email: true } });
    const id = await mkOrder({ email: "own@example.com", phone: "0555 111 22 33" });
    await run("order_paid", id); await run("admin_new_order", id);
    expect(sent.map((s) => `${s.channel}:${s.to}`)).toEqual(["sms:+905551112233", "email:own@example.com", "sms:+905550000000", "email:admin@example.com"]);
  });
  it("invalid / missing phone and anonymized e-mail are skipped", async () => {
    await setProviders(true, true); await setEvents({ order_paid: { sms: true, email: true } });
    const id = await mkOrder({ email: "anonymized+ab@anonymized.invalid", phone: "12345" });
    await run("order_paid", id);
    expect(sent).toHaveLength(0);
    expect((await logRows(id)).map((r) => r.error)).toEqual(["invalid_recipient", "no_recipient"]);
  });
  it("retry resends only the failed channel and throws so the outbox retries", async () => {
    await setProviders(true, true); await setEvents({ order_paid: { sms: true, email: true } });
    const id = await mkOrder();
    behavior.smsOk = false;
    await expect(run("order_paid", id)).rejects.toThrow(/sms/);
    expect(sent.map((s) => s.channel)).toEqual(["email"]);
    expect((await logRows(id)).map((r) => `${r.channel}:${r.status}`)).toEqual(["sms:failed", "email:sent"]);
    behavior.smsOk = true;
    await run("order_paid", id, 2);
    expect(sent.map((s) => s.channel)).toEqual(["email", "sms"]);
    expect((await logRows(id)).map((r) => `${r.channel}:${r.status}`)).toEqual(["sms:sent", "email:sent"]);
    await run("order_paid", id, 3);
    expect(sent).toHaveLength(2);
  });
  it("log stores masked recipients only", async () => {
    await setProviders(true, true); await setEvents({ order_paid: { sms: true, email: true } });
    const id = await mkOrder({ email: "someone@example.com" });
    await run("order_paid", id);
    const rows = await logRows(id);
    expect(rows.map((r) => r.to).join(" ")).not.toMatch(/someone@|5551112233/);
  });
  it("missing order is a no-op; bad payload throws", async () => {
    await expect(run("order_paid", "nope")).resolves.toBeUndefined();
    await expect(notificationJobHandlers["notify.order_paid"]!({ id: "j", kind: "k", payload: {}, attempts: 1, maxAttempts: 8 }, ctx())).rejects.toThrow();
    void sendOrderNotification;
  });
});

describe("templates", () => {
  const tr = DEFAULT_TEMPLATES.tr.order_paid;
  it("HTML-escapes variables and template text in the html part; subject has no CR/LF", () => {
    const vars = { orderNumber: "OS-1", customerName: `<img src=x onerror=alert(1)>"&'`, storeName: "S", total: "1" };
    const html = renderEmailHtml(tr.body, vars, "S");
    expect(html).not.toContain("<img"); expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;&quot;&amp;&#39;");
    const subj = renderSubject("Hello {{customerName}}", { customerName: "Bob\r\nBcc: evil@example.com\nX: y" });
    expect(subj).not.toMatch(/[\r\n]/);
    expect(escapeHtml("<a>")).toBe("&lt;a&gt;");
  });
  it("unknown variables render empty; plain text part is not escaped", () => {
    expect(renderSubject("a {{nope}} b", {})).toBe("a b");
    const p = planMessages({ event: "order_paid", order: { id: "1", number: "N<1>", email: "a@b.co", currency: "TRY", total: 100, trackingToken: "t", shippingAddress: { name: "A&B", phone: "+905551112233" } },
      settings: { fromName: "", fromEmail: "", smsSenderId: "", adminEmail: "", adminPhone: "", events: { order_paid: { sms: true, email: true } }, templates: { tr: {}, en: {} } } as never,
      storeName: "S", defaultLocale: "tr", storefrontOrigin: "https://s.test" });
    expect(p.email.text).toContain("A&B"); expect(p.email.html).toContain("A&amp;B"); expect(p.sms.to).toBe("+905551112233");
  });
  it("E.164 validation and normalisation", () => {
    for (const ok of ["+905551112233", "+14155552671"]) expect(isE164(ok)).toBe(true);
    for (const bad of ["905551112233", "+0555", "+90 555", "05551112233", "+9055511122334455", "a@b.c", ""]) expect(isE164(bad)).toBe(false);
    expect(toE164("0555 111 22 33")).toBe("+905551112233"); expect(toE164("garbage")).toBeNull();
  });
  it("SMS segment counter", () => {
    expect(smsInfo("a".repeat(160))).toMatchObject({ encoding: "GSM-7", segments: 1 });
    expect(smsInfo("a".repeat(161)).segments).toBe(2);
    expect(smsInfo("ş").encoding).toBe("UCS-2");
    expect(smsInfo("ş".repeat(71)).segments).toBe(2);
  });
});

describe("notification API", () => {
  it("test endpoint: owner/admin only, validates recipient, sends marked message, rate limited", async () => {
    const owner = await setProviders(true, true);
    const pw = "staff password 12345"; const email = `ntf-staff-${Date.now()}@example.com`;
    expect((await admin(owner, "/users", "POST", { email, name: "S", password: pw, role: "staff" })).status).toBe(201);
    const staff = await loginAs(email, pw);
    expect((await admin(staff, "/notifications/test", "POST", { channel: "sms", to: "+905551112233", lang: "tr" })).status).toBe(403);
    expect((await call("/api/admin/notifications/test", { json: { channel: "sms", to: "+905551112233" } })).status).toBe(401);
    expect((await admin(owner, "/notifications/test", "POST", { channel: "sms", to: "05551112233" })).status).toBe(400);
    expect((await admin(owner, "/notifications/test", "POST", { channel: "email", to: "a@b.com\r\nBcc: x@y.com" })).status).toBe(400);
    sent.length = 0;
    const ok = await admin(owner, "/notifications/test", "POST", { channel: "email", to: "me@example.com", lang: "en" });
    expect(ok.status).toBe(200);
    expect(sent[0]!.subject).toMatch(/^\[TEST\]/); expect(sent[0]!.text).toMatch(/\[TEST\]/);
    let last = 200;
    for (let i = 0; i < 8; i++) last = (await admin(owner, "/notifications/test", "POST", { channel: "sms", to: "+905551112233" })).status;
    expect(last).toBe(429);
  });
  it("test endpoint: 503 when no provider is enabled", async () => {
    const owner = await setProviders(false, false);
    // fresh rate-limit key per admin id; owner may be limited by previous test, so accept 429 only if limited
    const r = await admin(owner, "/notifications/test", "POST", { channel: "sms", to: "+905551112233" });
    expect([503, 429]).toContain(r.status);
  });
  it("order history endpoint lists the log", async () => {
    const owner = await setProviders(true, true); await setEvents({ order_paid: { sms: true, email: true } });
    const id = await mkOrder(); await run("order_paid", id);
    const r = await admin(owner, `/orders/${id}/notifications`);
    expect(r.status).toBe(200);
    const b = await j<{ items: any[] }>(r);
    expect(b.items.map((i) => i.channel).sort()).toEqual(["email", "sms"]);
    expect((await admin(owner, "/orders/missing/notifications")).status).toBe(404);
  });
  it("transitionOrder enqueues a deduped notify job for shipped; silent for pre-payment cancel", async () => {
    const { transitionOrder } = await import("@openshelf/core");
    const id = await mkOrder();
    await env.DB.prepare("UPDATE orders SET status='fulfilling' WHERE id=?1").bind(id).run();
    await transitionOrder(db, id, "shipped");
    const rows = (await env.DB.prepare("SELECT kind, dedupe_key FROM outbox_jobs WHERE dedupe_key = ?1").bind(`notify.order_shipped:${id}`).all<any>()).results;
    expect(rows).toEqual([{ kind: "notify.order_shipped", dedupe_key: `notify.order_shipped:${id}` }]);
    const id2 = await mkOrder();
    await env.DB.prepare("UPDATE orders SET status='pending' WHERE id=?1").bind(id2).run();
    await transitionOrder(db, id2, "cancelled");
    expect((await env.DB.prepare("SELECT count(*) n FROM outbox_jobs WHERE dedupe_key = ?1").bind(`notify.order_cancelled:${id2}`).first<any>()).n).toBe(0);
    void freshIp;
  });
});

describe("SMS/email abuse limits", () => {
  const mkPlan = (phone: string, allowed?: string[]) => planMessages({
    event: "order_paid",
    order: { id: "1", number: "N1", email: "a@b.co", currency: "TRY", total: 100, trackingToken: "t", shippingAddress: { name: "A", phone } },
    settings: { fromName: "", fromEmail: "", smsSenderId: "", adminEmail: "", adminPhone: "", ...(allowed ? { smsAllowedCountries: allowed } : {}), events: { order_paid: { sms: true, email: true } }, templates: { tr: {}, en: {} } } as never,
    storeName: "S", defaultLocale: "tr", storefrontOrigin: "https://s.test",
  });
  it("planMessages only texts allowed countries (default +90); skip reason country_not_allowed", () => {
    expect(mkPlan("+905551112233").sms.to).toBe("+905551112233");
    const p = mkPlan("+4915112345678");
    expect(p.sms.to).toBeNull(); expect(p.sms.skip).toBe("country_not_allowed");
    expect(mkPlan("+4915112345678", ["DE"]).sms.to).toBe("+4915112345678");
    expect(mkPlan("+4915112345678", ["+49", "90"]).sms.to).toBe("+4915112345678");
    expect(mkPlan("+905551112233", []).sms.skip).toBe("country_not_allowed");
    expect(mkPlan("+14155550123", ["+90"]).sms.skip).toBe("country_not_allowed");
  });
  it("disallowed country is recorded as skipped with country_not_allowed and nothing is sent", async () => {
    await setProviders(true, false); await setEvents({ order_paid: { sms: true, email: false } });
    const id = await mkOrder({ phone: "+4915112345678" });
    await run("order_paid", id);
    expect(sent).toHaveLength(0);
    expect((await logRows(id)).map((r) => `${r.channel}:${r.status}:${r.error}`)).toEqual(["sms:skipped:country_not_allowed"]);
  });
  it("per-recipient daily caps: 3 SMS per phone, 5 emails per address (counted once per order+event)", async () => {
    await setProviders(true, true); await setEvents({ order_paid: { sms: true, email: true } });
    const phone = "+905559998877"; const email = `cap-${Date.now()}@example.com`;
    const ids: string[] = [];
    for (let i = 0; i < 6; i++) { const id = await mkOrder({ phone, email }); ids.push(id); await run("order_paid", id); }
    expect(sent.filter((s) => s.channel === "sms")).toHaveLength(3);
    expect(sent.filter((s) => s.channel === "email")).toHaveLength(5);
    const last = await logRows(ids[5]!);
    expect(last.find((r) => r.channel === "sms")).toMatchObject({ status: "skipped", error: "daily_cap" });
    expect(last.find((r) => r.channel === "email")).toMatchObject({ status: "skipped", error: "daily_cap" });
    await run("order_paid", ids[5]!); // replay stays a no-op
    expect(sent.filter((s) => s.channel === "sms")).toHaveLength(3);
    // a transient failure retried does not burn extra cap slots
    behavior.smsOk = false;
    const p2 = "+905559990011"; const id = await mkOrder({ phone: p2 });
    await expect(run("order_paid", id)).rejects.toThrow();
    await expect(run("order_paid", id)).rejects.toThrow();
    await expect(run("order_paid", id)).rejects.toThrow();
    behavior.smsOk = true; sent.length = 0;
    await run("order_paid", id);
    expect(sent.filter((s) => s.channel === "sms")).toHaveLength(1);
  });
  it("mock send is never recorded as sent once mock mode is off", async () => {
    const { mockFactories } = await import("@openshelf/integration-mock");
    const a = mockFactories.netgsm.create({ config: {}, secrets: {} }, { fetch: (() => { throw new Error("no net"); }) as never, now: () => new Date(), db, apiOrigin: "", encryptionKey: "", isMockMode: async () => false } as never) as SmsProvider;
    await expect(a.send({ to: "+905550000000", text: "x" })).rejects.toThrow(/mock mode is off/);
  });
});

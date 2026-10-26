import { env } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import type { AdapterFactory, EmailMessage, EmailProvider } from "@openshelf/integration-sdk";
import { registerFactory } from "../src/integrations/registry";
import { saveSettings, getSettings } from "../src/lib/settings";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "@openshelf/db";
import { renderComposed, textToHtml } from "../src/lib/compose";
import { admin, ensureOwner, j, loginAs, type Session } from "./helpers";

const db = drizzle(env.DB, { schema });
const permissive = z.object({ config: z.record(z.unknown()), secrets: z.record(z.string()) });
const sent: EmailMessage[] = [];
const beh = { ok: true, detail: "HTTP 403 code 10001 only verified destinations key=secret-value-2" };
const emailFactory: AdapterFactory<EmailProvider> = {
  manifest: { id: "cf_email", name: "Fake Email", description: "t", publicFields: [], secretFields: [{ key: "k", label: "k", secret: true }], schema: permissive },
  create: () => ({ id: "cf_email", async validateConfig() {}, async healthCheck() { return { ok: true }; },
    async send(m) { if (!beh.ok) return { ok: false, detail: beh.detail }; sent.push(m); return { ok: true, providerMessageId: "m1" }; } }),
};

let owner: Session; let staff: Session; let n = 0;
const rcpt = () => `rcpt${Date.now()}${++n}@example.com`;
const send = (o: Record<string, unknown> = {}) => admin(owner, "/emails", "POST", { to: rcpt(), subject: "Hello", body: "Plain body", ...o });
const resetRealState = async () => {
  await env.DB.exec("UPDATE integration_configs SET enabled = 0 WHERE provider = 'iyzico'");
  await env.DB.exec("UPDATE orders SET status = 'delivered' WHERE status IN ('paid','fulfilling','shipped') AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.order_id = orders.id AND p.is_mock = 1)");
};
const clearLimits = () => env.DB.exec("DELETE FROM rate_limits WHERE key LIKE 'email-compose:%'");

beforeAll(async () => {
  owner = await ensureOwner();
  await admin(owner, "/settings/system", "PUT", { mockMode: false });
  await admin(owner, "/users", "POST", { email: "staff-mail@example.com", name: "Staff", password: "staff password 12345", role: "staff" });
  staff = await loginAs("staff-mail@example.com", "staff password 12345");
  registerFactory("cf_email", emailFactory as never);
  const cur = await getSettings(db, "notifications");
  await saveSettings(db, "notifications", { ...cur, fromEmail: "shop@example.com", fromName: "Shop Name" } as never, null);
});
beforeEach(async () => {
  sent.length = 0; beh.ok = true; await clearLimits();
  registerFactory("cf_email", emailFactory as never);
  expect((await admin(owner, "/integrations/cf_email", "PUT", { enabled: true, config: {}, secrets: { k: "secret-value-2" } })).status).toBe(200);
});

describe("renderer", () => {
  it("escapes hostile input, links only https, supports **bold**", () => {
    const h = textToHtml(`<script>alert(1)</script> & "q"\n\n**bold** https://ok.example/a?b=1&c=2. http://nope.example javascript:alert(1) https://x.test/"onmouseover="x`);
    expect(h).not.toContain("<script");
    expect(h).toContain("&lt;script&gt;");
    expect(h).toContain("<strong>bold</strong>");
    expect(h).toContain(`<a href="https://ok.example/a?b=1&amp;c=2" rel="noopener noreferrer nofollow" target="_blank">`);
    expect(h).not.toContain(`href="http://`); expect(h).not.toContain(`href="javascript`);
    expect(h).not.toMatch(/<a [^>]*onmouseover/);
    expect(h).toContain("<p");
  });
  it("branded layout has store name and contact footer, escaped", () => {
    const { html, text } = renderComposed("hi", { storeName: "A<b>", contactEmail: "c@x.com" });
    expect(html).toContain("A&lt;b&gt;"); expect(html).toContain("c@x.com"); expect(text).toContain("c@x.com");
  });
});

describe("compose send", () => {
  it("sends with From from settings (never user-supplied), persists row, audits masked recipient", async () => {
    const to = rcpt();
    const r = await admin(owner, "/emails", "POST", { to, subject: "Hi", body: "Body <b>x</b>", from: "evil@attacker.com", fromName: "Evil", replyTo: "reply@example.com", cc: "cc@example.com" });
    expect(r.status).toBe(201);
    const out = await j<any>(r);
    expect(out.status).toBe("sent");
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to, from: "shop@example.com", fromName: "Shop Name", cc: "cc@example.com", replyTo: "reply@example.com" });
    const row = await j<any>(await admin(owner, `/emails/${out.id}`));
    expect(row).toMatchObject({ status: "sent", provider: "cf_email", to });
    expect(row.bodyHtml).toBe(sent[0]!.html); // preview == sent: html persisted is the html delivered
    expect(row.bodyHtml).toContain("&lt;b&gt;x&lt;/b&gt;");
    const a = await env.DB.prepare("SELECT meta FROM audit_logs WHERE action = 'email.compose.send' AND entity_id = ?1").bind(out.id).first<{ meta: string }>();
    expect(a!.meta).not.toContain(to); expect(a!.meta).toContain("***@example.com");
  });
  it("preview html/text equals what is sent", async () => {
    const input = { subject: "Order {{storeName}}", body: "Line1\n\nSee https://example.com/x **now**" };
    const p = await j<any>(await admin(owner, "/emails/preview", "POST", input));
    expect((await send(input)).status).toBe(201);
    expect(sent[0]!.html).toBe(p.html); expect(sent[0]!.text).toBe(p.text); expect(sent[0]!.subject).toBe(p.subject);
  });
  it("rejects header injection and bad addresses", async () => {
    for (const o of [
      { subject: "Hi\r\nBcc: x@evil.com" }, { subject: "Hi\nX: y" },
      { to: "a@example.com\r\nBcc: b@evil.com" }, { to: "a@example.com,b@evil.com" }, { to: "Name <a@example.com>" },
      { cc: "a@example.com\nBcc: b@evil.com" }, { replyTo: "a@example.com\r\nX: 1" }, { to: "not-an-email" },
    ]) expect((await send(o)).status, JSON.stringify(o)).toBe(400);
    expect(sent).toHaveLength(0);
  });
  it("hostile body is escaped in the sent html", async () => {
    await send({ body: `<script>alert('x')</script><img src=x onerror=alert(1)>` });
    expect(sent[0]!.html).not.toContain("<script"); expect(sent[0]!.html).not.toContain("<img");
    expect(sent[0]!.html).toContain("&lt;script&gt;");
  });
  it("rejects unresolved placeholders; substitutes {{storeName}}", async () => {
    expect((await send({ body: "Hi {{customerName}}" })).status).toBe(400);
    expect((await send({ body: "Welcome to {{storeName}}" })).status).toBe(201);
  });
  it("no provider -> 409 and nothing persisted", async () => {
    await admin(owner, "/integrations/cf_email", "PUT", { enabled: false, config: {}, secrets: {} });
    const to = rcpt();
    const r = await send({ to });
    expect(r.status).toBe(409); expect((await j<any>(r)).error.code).toBe("no_email_provider");
    expect(await env.DB.prepare(`SELECT 1 FROM outbound_emails WHERE "to" = ?1`).bind(to).first()).toBeNull();
  });
  it("appends the invoice link when the linked manual invoice is issued", async () => {
    const id = "minv-mail-1";
    await env.DB.prepare(`INSERT OR REPLACE INTO manual_invoices (id, status, customer, lines, pdf_url, number, total) VALUES (?1,'issued','{}','[]','https://pdf.test/i.pdf','N-1',100)`).bind(id).run();
    expect((await send({ manualInvoiceId: id })).status).toBe(201);
    expect(sent[0]!.text).toContain("Invoice N-1: https://pdf.test/i.pdf");
    expect(sent[0]!.html).toContain(`href="https://pdf.test/i.pdf"`);
    expect((await send({ manualInvoiceId: "nope" })).status).toBe(400);
  });
});

describe("failure, resend, list", () => {
  it("failed send persists a failed row with scrubbed provider error (502); resend only for failed", async () => {
    beh.ok = false;
    const to = rcpt();
    const r = await send({ to });
    expect(r.status).toBe(502);
    const txt = JSON.stringify(await j(r));
    expect(txt).toContain("only verified destinations"); expect(txt).not.toContain("secret-value-2");
    const row = await env.DB.prepare(`SELECT * FROM outbound_emails WHERE "to" = ?1`).bind(to).first<any>();
    expect(row.status).toBe("failed"); expect(row.error).not.toContain("secret-value-2"); expect(row.body_html).toContain("<p");
    beh.ok = true;
    const rs = await admin(owner, `/emails/${row.id}/resend`, "POST");
    expect(rs.status).toBe(200);
    expect(sent).toHaveLength(1);
    expect((await j<any>(await admin(owner, `/emails/${row.id}`))).status).toBe("sent");
    expect((await admin(owner, `/emails/${row.id}/resend`, "POST")).status).toBe(409);
    expect(sent).toHaveLength(1);
  });
  it("list filters by status and q; detail 404", async () => {
    const to = rcpt(); await send({ to });
    const l = await j<any>(await admin(owner, `/emails?status=sent&q=${encodeURIComponent(to)}`));
    expect(l.items).toHaveLength(1); expect(l.items[0].bodyHtml).toBeUndefined();
    expect((await admin(owner, "/emails?status=zzz")).status).toBe(400);
    expect((await admin(owner, "/emails/none")).status).toBe(404);
  });
  it("templates endpoint returns TR/EN templates and variables", async () => {
    const t = await j<any>(await admin(owner, "/emails/templates"));
    expect(t.variables).toContain("orderNumber");
    expect(t.items.some((x: any) => x.lang === "tr" && x.event === "order_shipped" && x.subject && x.body)).toBe(true);
    expect(t.items.some((x: any) => x.lang === "en")).toBe(true);
  });
});

describe("authz and rate limits", () => {
  it("staff can read/preview but not send or resend (403)", async () => {
    expect((await admin(staff, "/emails", "POST", { to: rcpt(), subject: "x", body: "y" })).status).toBe(403);
    expect((await admin(staff, "/emails/abc/resend", "POST")).status).toBe(403);
    expect((await admin(staff, "/emails")).status).toBe(200);
    expect((await admin(staff, "/emails/preview", "POST", { subject: "s", body: "b" })).status).toBe(200);
    expect(sent).toHaveLength(0);
  });
  it("5 per recipient per day", async () => {
    const to = rcpt();
    for (let i = 0; i < 5; i++) expect((await send({ to })).status).toBe(201);
    const r = await send({ to });
    expect(r.status).toBe(429); expect((await j<any>(r)).error.code).toBe("rate_limited_recipient");
    expect((await send({ to: to.toUpperCase() })).status).toBe(429); // case-insensitive
    expect((await send()).status).toBe(201); // other recipients unaffected
  });
  it("30 per hour per admin", async () => {
    for (let i = 0; i < 30; i++) expect((await send()).status).toBe(201);
    const r = await send();
    expect(r.status).toBe(429); expect((await j<any>(r)).error.code).toBe("rate_limited_admin");
  });
  it("100 per day in total", async () => {
    await env.DB.prepare("INSERT OR REPLACE INTO rate_limits (key, count, window_start) VALUES ('email-compose:total', 100, ?1)").bind(Math.floor(Date.now() / 1000)).run();
    const r = await send();
    expect(r.status).toBe(429); expect((await j<any>(r)).error.code).toBe("rate_limited_total");
  });
});

describe("mock mode", () => {
  it("records the message in mock_messages and marks the row sent", async () => {
    await admin(owner, "/integrations/cf_email", "PUT", { enabled: false, config: {}, secrets: {} });
    await resetRealState();
    expect((await admin(owner, "/settings/system", "PUT", { mockMode: true })).status).toBe(200);
    try {
      const to = rcpt();
      const r = await send({ to, subject: "Mock hello" });
      expect(r.status).toBe(201);
      const m = await env.DB.prepare("SELECT * FROM mock_messages WHERE channel = 'email' AND \"to\" = ?1").bind(to).first<any>();
      expect(m.subject).toBe("Mock hello");
      const msgs = await j<any>(await admin(owner, "/mock/messages?channel=email"));
      expect(msgs.items.some((x: any) => x.to === to)).toBe(true);
    } finally { await admin(owner, "/settings/system", "PUT", { mockMode: false }); }
  });
});

import { env } from "cloudflare:test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runOutbox } from "../src/outbox";
import { clearSettingsCache } from "../src/lib/settings";
import { unsubToken } from "../src/lib/campaigns";
import { admin, call, ensureOwner, j, loginAs, type Session } from "./helpers";

let owner: Session; let staff: Session;
const setMock = (on: boolean) => env.DB.prepare(`INSERT INTO store_settings ("group", value, updated_at) VALUES ('system', ?1, unixepoch()) ON CONFLICT("group") DO UPDATE SET value = ?1`).bind(JSON.stringify({ mockMode: on })).run().then(clearSettingsCache);
const customer = async (id: string, o: { email?: string; phone?: string | null; marketing?: boolean | null; city?: string } = {}) => {
  await env.DB.prepare("INSERT INTO customers (id, email, name, phone, created_at) VALUES (?1, ?2, ?3, ?4, unixepoch())").bind(id, o.email ?? `${id}@example.com`, `Ad ${id}`, o.phone === undefined ? "05301234567" : o.phone).run();
  if (o.marketing !== null) await env.DB.prepare("INSERT INTO customer_consents (customer_id, analytics, marketing) VALUES (?1, 0, ?2)").bind(id, o.marketing === false ? 0 : 1).run();
  if (o.city) await env.DB.prepare("INSERT INTO addresses (id, customer_id, name, line1, city) VALUES (?1, ?1, 'x', 'y', ?2)").bind(id, o.city).run();
};
const mk = async (extra: Record<string, unknown> = {}) => (await j<any>(await admin(owner, "/campaigns", "POST", { name: "Kampanya", channel: "email", subject: "Merhaba {{name}}", body: "İndirim var {{name}}! {{storeName}}", filters: {}, ...extra }))).id as string;
const drain = async () => { for (let i = 0; i < 8; i++) await runOutbox(env, { limit: 50, now: new Date(Date.now() + (i + 1) * 120_000) }); };

beforeAll(async () => {
  owner = await ensureOwner();
  const email = `staff-camp-${Date.now()}@example.com`;
  expect((await admin(owner, "/users", "POST", { email, name: "S", password: "staff password 12345", role: "staff" })).status).toBe(201);
  staff = await loginAs(email, "staff password 12345");
  await setMock(true);
  await env.DB.exec("DELETE FROM customer_consents; DELETE FROM addresses; DELETE FROM customers;");
  await customer("c-yes1", { city: "İzmir" });
  await customer("c-yes2", { phone: "+905551112233" });
  await customer("c-no", { marketing: false });
  await customer("c-none", { marketing: null });
  await customer("c-nophone", { phone: null });
  await customer("c-invalid", { email: "x@mock.invalid" });
});
afterAll(async () => { await setMock(false); });

describe("campaign audience (consent is mandatory)", () => {
  it("staff gets 403", async () => { expect((await admin(staff, "/campaigns")).status).toBe(403); });
  it("email: only customers whose latest consent is marketing=yes, with a usable address", async () => {
    const r = await j<any>(await admin(owner, "/campaigns/audience", "POST", { channel: "email", filters: {} }));
    expect(r.count).toBe(3); // c-yes1, c-yes2, c-nophone (c-invalid has a .invalid address; c-no / c-none have no consent)
    expect(r.sample[0].to).toContain("***"); // masked
  });
  it("sms: needs a normalisable phone; city filter narrows", async () => {
    expect((await j<any>(await admin(owner, "/campaigns/audience", "POST", { channel: "sms", filters: {} }))).count).toBe(3); // c-yes1, c-yes2, c-invalid (valid phone; its e-mail is irrelevant for SMS)
    expect((await j<any>(await admin(owner, "/campaigns/audience", "POST", { channel: "sms", filters: { city: "izmir" } }))).count).toBe(1);
  });
  it("validation: e-mail needs a subject", async () => {
    expect((await admin(owner, "/campaigns", "POST", { name: "x", channel: "email", subject: "", body: "b" })).status).toBe(400);
  });
});

describe("campaign send + unsubscribe", () => {
  it("sends in the background, personalises, then reports done; an unsubscribed customer is skipped on the next campaign", async () => {
    const id = await mk();
    const prev = await j<any>(await admin(owner, `/campaigns/${id}/preview`, "POST", {}));
    expect(prev.subject).toBe("Merhaba Ayşe");
    expect(prev.html).toContain("Unsubscribe");
    const s = await admin(owner, `/campaigns/${id}/send`, "POST", {});
    expect(s.status).toBe(202);
    expect((await admin(owner, `/campaigns/${id}/send`, "POST", {})).status).toBe(409); // no double send
    await drain();
    const d = await j<any>(await admin(owner, `/campaigns/${id}`));
    expect(d).toMatchObject({ status: "done", total: 3, sent: 3, failed: 0, pending: 0 });
    // unsubscribe c-yes1 via the signed link
    const tok = await unsubToken(env, "c-yes1");
    expect((await call("/unsubscribe/c-yes1/badtoken")).status).toBe(200); // generic page, no state change
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM customer_consents WHERE customer_id='c-yes1' AND marketing=0").first<any>()).n).toBe(0);
    expect((await call(`/unsubscribe/c-yes1/${tok}`, { method: "POST" })).status).toBe(200);
    const again = await j<any>(await admin(owner, "/campaigns/audience", "POST", { channel: "email", filters: {} }));
    expect(again.count).toBe(2);
  });

  it("cancel stops a running campaign and skips the pending recipients", async () => {
    const id = await mk({ name: "iptal" });
    expect((await admin(owner, `/campaigns/${id}/send`, "POST", {})).status).toBe(202);
    expect((await admin(owner, `/campaigns/${id}/cancel`, "POST", {})).status).toBe(200);
    await drain();
    const d = await j<any>(await admin(owner, `/campaigns/${id}`));
    expect(d.status).toBe("cancelled"); expect(d.sent).toBe(0); expect(d.skipped).toBe(d.total);
  });

  it("sms test send and single sms use the provider, log masked recipients", async () => {
    const id = await mk({ name: "sms", channel: "sms", subject: "", body: "Merhaba {{name}}" });
    expect((await admin(owner, `/campaigns/${id}/test`, "POST", { to: "05301234567" })).status).toBe(200);
    expect((await admin(owner, `/campaigns/${id}/test`, "POST", { to: "abc" })).status).toBe(400);
    expect((await admin(owner, "/sms/send", "POST", { to: "+905301234567", text: "Selam" })).status).toBe(201);
    expect((await admin(owner, "/sms/send", "POST", { to: "123", text: "Selam" })).status).toBe(400);
    const l = await j<any>(await admin(owner, "/sms"));
    expect(l.items[0]).toMatchObject({ status: "sent" }); expect(l.items[0].to).not.toBe("+905301234567");
  });

  it("without any provider (mock off, nothing enabled) sending is refused", async () => {
    await setMock(false);
    const id = await mk({ name: "noprov" });
    const r = await admin(owner, `/campaigns/${id}/send`, "POST", {});
    expect(r.status).toBe(409); expect((await j<any>(r)).error.code).toBe("no_provider");
    await setMock(true);
  });
});

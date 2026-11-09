import { env } from "cloudflare:test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "@openshelf/db";
import { clearSettingsCache } from "../src/lib/settings";
import { campaignSendJob, hasMarketingConsent, loadAudience, renderCampaign, verifyUnsubToken, unsubToken } from "../src/lib/campaigns";
import { admin, call, ensureOwner, j, loginAs, type Session } from "./helpers";

let owner: Session; let staff: Session;
const db = () => drizzle(env.DB, { schema }) as never;
const setMock = (on: boolean) => env.DB.prepare(`INSERT INTO store_settings ("group", value, updated_at) VALUES ('system', ?1, unixepoch()) ON CONFLICT("group") DO UPDATE SET value = ?1`).bind(JSON.stringify({ mockMode: on })).run().then(clearSettingsCache);
const cust = (id: string, marketing: boolean[] = [true], phone = "05301234567") => env.DB.batch([
  env.DB.prepare("INSERT INTO customers (id, email, name, phone, created_at) VALUES (?1, ?2, ?3, ?4, unixepoch())").bind(id, `${id}@example.com`, id, phone),
  ...marketing.map((m) => env.DB.prepare("INSERT INTO customer_consents (customer_id, analytics, marketing) VALUES (?1, 0, ?2)").bind(id, m ? 1 : 0)),
]);
const order = (id: string, customerId: string, status: string, ageDays = 0) => env.DB.prepare(
  "INSERT INTO orders (id, number, source, status, customer_id, email, shipping_address, currency, subtotal, total, tracking_token, created_at, updated_at) VALUES (?1, ?1, 'website', ?2, ?3, 'a@example.invalid', '{}', 'TRY', 1, 1, ?1, unixepoch() - ?4, unixepoch())").bind(id, status, customerId, ageDays * 86400).run();

beforeAll(async () => {
  owner = await ensureOwner();
  const email = `staff-cx-${Date.now()}@example.com`;
  await admin(owner, "/users", "POST", { email, name: "S", password: "staff password 12345", role: "staff" });
  staff = await loginAs(email, "staff password 12345");
  await setMock(true);
  await env.DB.exec("DELETE FROM campaign_recipients; DELETE FROM campaigns; DELETE FROM orders WHERE id LIKE 'f-o%'; DELETE FROM customer_consents; DELETE FROM addresses; DELETE FROM customers;");
});
afterAll(async () => { await setMock(false); });

describe("consent semantics", () => {
  it("latest consent wins: yes then no = excluded, no then yes = included", async () => {
    await cust("k-yn", [true, false]); await cust("k-ny", [false, true]);
    expect(await hasMarketingConsent(db(), "k-yn")).toBe(false);
    expect(await hasMarketingConsent(db(), "k-ny")).toBe(true);
    expect(await hasMarketingConsent(db(), "k-missing")).toBe(false);
    const ids = (await loadAudience(db(), "email", {})).map((a) => a.id);
    expect(ids).toContain("k-ny"); expect(ids).not.toContain("k-yn");
  });
  it("anonymised customers are never included", async () => {
    await cust("k-anon");
    await env.DB.prepare("UPDATE customers SET anonymized_at = unixepoch() WHERE id = 'k-anon'").run();
    expect((await loadAudience(db(), "email", {})).map((a) => a.id)).not.toContain("k-anon");
  });
  it("filters: minOrders counts only paid orders, orderedWithinDays respects age, city is Turkish-case-insensitive", async () => {
    await cust("f-two"); await cust("f-old"); await cust("f-unpaid");
    await order("f-o1", "f-two", "paid", 1); await order("f-o2", "f-two", "delivered", 2);
    await order("f-o3", "f-old", "paid", 400);
    await order("f-o4", "f-unpaid", "pending", 1); await order("f-o5", "f-unpaid", "cancelled", 1);
    const ids = async (f: object) => (await loadAudience(db(), "email", f)).map((a) => a.id);
    expect(await ids({ minOrders: 2 })).toEqual(["f-two"]);
    expect((await ids({ minOrders: 1 })).sort()).toEqual(["f-old", "f-two"]);
    expect(await ids({ orderedWithinDays: 30 })).toEqual(["f-two"]);
    await env.DB.prepare("INSERT INTO addresses (id, customer_id, name, line1, city) VALUES ('a-ist', 'f-two', 'x', 'y', 'İstanbul')").run();
    expect(await ids({ city: "istanbul" })).toEqual(["f-two"]);
    expect(await ids({ city: "ISTANBUL" })).toEqual([]); // plain-ASCII uppercase is a different word in Turkish casing
    expect(await ids({ city: "Ankara" })).toEqual([]);
  });
});

describe("rendering + unsubscribe token", () => {
  it("personalises, appends the unsubscribe link, escapes HTML in the body", () => {
    const r = renderCampaign({ channel: "email", subject: "Selam {{name}}", body: "Merhaba {{name}} <script>x</script> {{storeName}}" }, { name: "Ayşe" }, { storeName: "Dükkan" }, "https://x.test/unsubscribe/c/t");
    expect(r.subject).toBe("Selam Ayşe");
    expect(r.html).toContain("Ayşe"); expect(r.html).not.toContain("<script>"); expect(r.html).toContain("https://x.test/unsubscribe/c/t");
    const s = renderCampaign({ channel: "sms", subject: null, body: "Hi {{name}}" }, { name: "A" }, { storeName: "S" }, "https://x.test/u");
    expect(s.text).toBe("Hi A\nÇık/Opt-out: https://x.test/u"); expect(s.html).toBeUndefined();
  });
  it("strips header injection from the subject", () => {
    const r = renderCampaign({ channel: "email", subject: "a\r\nBcc: evil@x.test", body: "b" }, {}, { storeName: "S" }, "u");
    expect(r.subject).not.toMatch(/[\r\n]/);
  });
  it("token only verifies for its own customer", async () => {
    const t = await unsubToken(env, "c1");
    expect(await verifyUnsubToken(env, "c1", t)).toBe(true);
    expect(await verifyUnsubToken(env, "c2", t)).toBe(false);
    expect(await verifyUnsubToken(env, "c1", t.slice(0, -1) + (t.endsWith("0") ? "1" : "0"))).toBe(false);
    expect(await verifyUnsubToken(env, "c1", "")).toBe(false);
  });
  it("unsubscribe page: GET shows a form and changes nothing; invalid token is generic; POST records a newer 'no'", async () => {
    await cust("u-1");
    const tok = await unsubToken(env, "u-1");
    const g = await call(`/unsubscribe/u-1/${tok}`);
    expect(g.status).toBe(200); expect(await g.text()).toContain("<form");
    expect(await hasMarketingConsent(db(), "u-1")).toBe(true);
    const bad = await call("/unsubscribe/u-1/nope", { method: "POST" });
    expect(bad.status).toBe(200); expect(await hasMarketingConsent(db(), "u-1")).toBe(true);
    expect((await call(`/unsubscribe/u-1/${tok}`, { method: "POST" })).status).toBe(200);
    expect(await hasMarketingConsent(db(), "u-1")).toBe(false);
  });
});

describe("campaign job + routes", () => {
  const ctxFor = (adapter: unknown, log: string[] = []) => ({ db: db(), env, now: new Date(), log: async (_l: string, m: string) => { log.push(m); }, getAdapter: async () => adapter }) as never;
  const draft = async (channel = "email") => (await j<any>(await admin(owner, "/campaigns", "POST", { name: "t", channel, subject: "S", body: "B {{name}}", filters: { city: "Nowhere-City" } }))).id as string;
  const seedRecipients = async (cid: string, ids: string[]) => {
    await env.DB.prepare("UPDATE campaigns SET status = 'sending', total = ?2 WHERE id = ?1").bind(cid, ids.length).run();
    for (const id of ids) await env.DB.prepare("INSERT INTO campaign_recipients (id, campaign_id, customer_id, \"to\", name) VALUES (?1, ?2, ?3, ?4, ?3)").bind(`r-${cid}-${id}`, cid, id, `${id}@example.com`).run();
  };
  const job = (cid: string) => ({ id: "j", kind: "campaign.send", payload: { campaignId: cid, origin: "https://x.test", n: 0 }, attempts: 1 }) as never;

  it("provider failure/throw marks only that recipient failed; opted-out recipient is skipped; sent ones counted", async () => {
    await cust("j-ok"); await cust("j-fail"); await cust("j-throw"); await cust("j-out", [true, false]);
    const cid = await draft(); await seedRecipients(cid, ["j-ok", "j-fail", "j-throw", "j-out"]);
    const adapter = { send: async (m: { to: string }) => { if (m.to.startsWith("j-throw")) throw new Error("network down"); return m.to.startsWith("j-fail") ? { ok: false, detail: "rejected" } : { ok: true }; } };
    await campaignSendJob(job(cid), ctxFor(adapter));
    const d = await j<any>(await admin(owner, `/campaigns/${cid}`));
    expect(d).toMatchObject({ status: "done", sent: 1, failed: 2, skipped: 1, pending: 0 });
    const byTo = Object.fromEntries(d.problems.map((p: any) => [p.status + ":" + p.error, 1]));
    expect(Object.keys(byTo).sort()).toEqual(["failed:network down", "failed:rejected", "skipped:opted_out"]);
  });
  it("no provider fails the campaign instead of looping", async () => {
    await cust("j-np");
    const cid = await draft(); await seedRecipients(cid, ["j-np"]);
    const logs: string[] = [];
    await campaignSendJob(job(cid), ctxFor(null, logs));
    expect((await j<any>(await admin(owner, `/campaigns/${cid}`))).status).toBe("failed");
    expect(logs[0]).toContain("no enabled provider");
  });
  it("job ignores campaigns that are not 'sending' (cancelled/draft/missing)", async () => {
    const cid = await draft(); // still draft
    let sends = 0;
    await campaignSendJob(job(cid), ctxFor({ send: async () => { sends++; return { ok: true }; } }));
    await campaignSendJob(job("does-not-exist"), ctxFor({ send: async () => { sends++; return { ok: true }; } }));
    expect(sends).toBe(0);
  });
  it("a big batch chains the next job (40 per run)", async () => {
    const ids = Array.from({ length: 45 }, (_, i) => `big-${i}`);
    for (const id of ids) await cust(id);
    const cid = await draft(); await seedRecipients(cid, ids);
    let sent = 0;
    await campaignSendJob(job(cid), ctxFor({ send: async () => { sent++; return { ok: true }; } }));
    expect(sent).toBe(40);
    const next = await env.DB.prepare("SELECT dedupe_key FROM outbox_jobs WHERE dedupe_key = ?1").bind(`campaign.send:${cid}:1`).first();
    expect(next).not.toBeNull();
    await campaignSendJob({ id: "j2", kind: "campaign.send", payload: { campaignId: cid, origin: "https://x.test", n: 1 }, attempts: 1 } as never, ctxFor({ send: async () => { sent++; return { ok: true }; } }));
    expect(sent).toBe(45);
    expect((await j<any>(await admin(owner, `/campaigns/${cid}`))).status).toBe("done");
  });

  it("edit only while draft; delete refused while sending; cancel only while sending; empty audience refused", async () => {
    const cid = await draft();
    expect((await admin(owner, `/campaigns/${cid}`, "PUT", { name: "n2", channel: "email", subject: "s", body: "b", filters: { city: "Nowhere-City" } })).status).toBe(200);
    expect((await admin(owner, `/campaigns/${cid}/cancel`, "POST", {})).status).toBe(409);
    const empty = await admin(owner, `/campaigns/${cid}/send`, "POST", {}); // city filter matches nobody
    expect(empty.status).toBe(409); expect((await j<any>(empty)).error.code).toBe("empty_audience");
    await env.DB.prepare("UPDATE campaigns SET status = 'sending' WHERE id = ?1").bind(cid).run();
    expect((await admin(owner, `/campaigns/${cid}`, "PUT", { name: "n3", channel: "email", subject: "s", body: "b", filters: {} })).status).toBe(409);
    expect((await admin(owner, `/campaigns/${cid}`, "DELETE")).status).toBe(409);
    await env.DB.prepare("UPDATE campaigns SET status = 'done' WHERE id = ?1").bind(cid).run();
    expect((await admin(owner, `/campaigns/${cid}`, "DELETE")).status).toBe(204);
    expect((await admin(owner, `/campaigns/${cid}`)).status).toBe(404);
  });
  it("validation + access: bad filters rejected, SMS body length capped, staff blocked from sms and campaign actions", async () => {
    expect((await admin(owner, "/campaigns", "POST", { name: "x", channel: "email", subject: "s", body: "b", filters: { minOrders: -1 } })).status).toBe(400);
    expect((await admin(owner, "/campaigns", "POST", { name: "x", channel: "sms", body: "a".repeat(1001) })).status).toBe(400);
    expect((await admin(staff, "/sms", "GET")).status).toBe(403);
    expect((await admin(staff, "/sms/send", "POST", { to: "+905301234567", text: "x" })).status).toBe(403);
    expect((await admin(staff, "/campaigns/audience", "POST", { channel: "email", filters: {} })).status).toBe(403);
  });
});

describe("trendyol description cleanup endpoint", () => {
  it("cleans stored HTML descriptions, leaves plain ones, is idempotent, owner/admin only", async () => {
    await env.DB.exec("DELETE FROM product_variants; DELETE FROM products;");
    const ins = (id: string, d: string) => env.DB.prepare("INSERT INTO products (id, slug, name_tr, description_tr, status, created_at, updated_at) VALUES (?1, ?1, 'n', ?2, 'draft', unixepoch(), unixepoch())").bind(id, d).run();
    await ins("p-html", "<p>Merhaba<br>dünya</p><ul><li>bir</li><li>iki</li></ul>"); await ins("p-plain", "Düz metin 5 < 6"); await ins("p-ent", "A&nbsp;&amp;&nbsp;B");
    expect((await admin(staff, "/trendyol/import/clean-descriptions", "POST", {})).status).toBe(403);
    expect((await j<any>(await admin(owner, "/trendyol/import/clean-descriptions", "POST", {}))).cleaned).toBe(2);
    const get = async (id: string) => (await env.DB.prepare("SELECT description_tr AS d FROM products WHERE id = ?1").bind(id).first<{ d: string }>())!.d;
    expect(await get("p-html")).toBe("Merhaba\ndünya\n\n• bir\n• iki"); expect(await get("p-plain")).toBe("Düz metin 5 < 6"); expect(await get("p-ent")).toBe("A & B");
    expect((await j<any>(await admin(owner, "/trendyol/import/clean-descriptions", "POST", {}))).cleaned).toBe(0);
  });
});

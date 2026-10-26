import { describe, it, expect, vi } from "vitest";
import { factory, manifest } from "../src";
const now = () => new Date("2026-01-01T00:00:00Z");
const ACC = "0123456789abcdef0123456789abcdef";
const creds = { config: { accountId: ACC }, secrets: { apiToken: "t".repeat(40) } };
const mk = (f: any) => factory.create(creds, { fetch: f, now });
const json = (b: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(b), { status }));
const msg = { to: "cust@example.com", from: "orders@shop.com", fromName: "Shop", subject: "Hi", html: "<p>x</p>", text: "x" };

describe("cloudflare email", () => {
  it("posts JSON with bearer token to the account send endpoint", async () => {
    const f = json({ success: true, errors: [], result: { delivered: ["cust@example.com"], permanent_bounces: [], queued: [] } });
    const r = await mk(f).send(msg);
    expect(r.ok).toBe(true);
    const [url, init] = f.mock.calls[0] as any;
    expect(url).toBe(`https://api.cloudflare.com/client/v4/accounts/${ACC}/email/sending/send`);
    expect(init.headers.authorization).toBe("Bearer " + "t".repeat(40));
    expect(JSON.parse(init.body)).toEqual({ to: "cust@example.com", from: "Shop <orders@shop.com>", subject: "Hi", html: "<p>x</p>", text: "x" });
  });
  it("strips CR/LF from subject and display name (header injection)", async () => {
    const f = json({ success: true, result: { delivered: [], queued: ["a"], permanent_bounces: [] } });
    await mk(f).send({ ...msg, subject: "Hi\r\nBcc: evil@x.com", fromName: "Shop\r\nBcc: e@x.com" });
    const b = JSON.parse((f.mock.calls[0] as any)[1].body);
    expect(b.subject).not.toMatch(/[\r\n]/); expect(b.from).not.toMatch(/[\r\n]/);
  });
  it("rejects recipients with injection characters or multiple addresses", async () => {
    const f = json({});
    for (const to of ["a@b.com\r\nBcc: x@y.com", "a@b.com,c@d.com", "Name <a@b.com>", "nope"]) expect((await mk(f).send({ ...msg, to })).detail).toBe("permanent:invalid_recipient");
    expect((await mk(f).send({ ...msg, from: "bad" })).detail).toBe("permanent:invalid_sender");
    expect(f).not.toHaveBeenCalled();
  });
  it("surfaces API errors; 4xx permanent, 5xx retryable; bounce permanent", async () => {
    expect((await mk(json({ success: false, errors: [{ code: 10001, message: "email.sending.error.invalid_request_schema" }] }, 400)).send(msg)).detail).toMatch(/^permanent:HTTP 400 code 10001/);
    expect((await mk(json({ success: false, errors: [] }, 503)).send(msg)).detail).toBe("HTTP 503");
    expect((await mk(json({ success: true, result: { permanent_bounces: ["cust@example.com"], delivered: [], queued: [] } })).send(msg)).detail).toBe("permanent:bounced");
  });
  it("healthCheck verifies the token on the allowlisted host", async () => {
    const f = json({ success: true, result: { status: "active" } });
    expect((await mk(f).healthCheck()).ok).toBe(true);
    expect((f.mock.calls[0] as any)[0]).toContain("api.cloudflare.com");
    expect(await mk(json({}, 403)).healthCheck()).toEqual({ ok: false, detail: "token rejected" });
  });
  it("manifest warns about Beta / Workers Paid / verified destinations / onboarded domain", () => {
    const help = manifest.publicFields.map((f) => f.help ?? "").join(" ");
    expect(help).toMatch(/Beta/); expect(help).toMatch(/Workers Paid/); expect(help).toMatch(/Free plan/); expect(help).toMatch(/verified destination/); expect(help).toMatch(/onboarded/);
  });
});

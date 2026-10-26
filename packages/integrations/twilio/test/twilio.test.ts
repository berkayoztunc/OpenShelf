import { describe, it, expect, vi } from "vitest";
import { factory } from "../src";
const now = () => new Date("2026-01-01T00:00:00Z");
const SID = "AC" + "a".repeat(32);
const creds = { config: { accountSid: SID, from: "+15551234567" }, secrets: { authToken: "tok-secret-12345" } };
const mk = (f: any, c: any = creds) => factory.create(c, { fetch: f, now });
const json = (b: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(b), { status }));

describe("twilio", () => {
  it("posts form-encoded to Messages.json with basic auth and From", async () => {
    const f = json({ sid: "SM1", status: "queued" }, 201);
    const r = await mk(f).send({ to: "+905301234567", text: "Hi & bye" });
    expect(r).toEqual({ ok: true, providerMessageId: "SM1" });
    const [url, init] = f.mock.calls[0] as any;
    expect(url).toBe(`https://api.twilio.com/2010-04-01/Accounts/${SID}/Messages.json`);
    expect(init.headers.authorization).toBe("Basic " + btoa(`${SID}:tok-secret-12345`));
    expect(init.headers["content-type"]).toBe("application/x-www-form-urlencoded");
    const p = new URLSearchParams(init.body);
    expect(p.get("To")).toBe("+905301234567"); expect(p.get("Body")).toBe("Hi & bye"); expect(p.get("From")).toBe("+15551234567"); expect(p.has("MessagingServiceSid")).toBe(false);
  });
  it("uses MessagingServiceSid when configured", async () => {
    const f = json({ sid: "SM2" }, 201);
    await mk(f, { config: { accountSid: SID, messagingServiceSid: "MG" + "b".repeat(32) }, secrets: creds.secrets }).send({ to: "+905301234567", text: "x" });
    const p = new URLSearchParams((f.mock.calls[0] as any)[1].body);
    expect(p.get("MessagingServiceSid")).toBe("MG" + "b".repeat(32)); expect(p.has("From")).toBe(false);
  });
  it("requires From or Messaging Service", () => {
    expect(factory.manifest.schema.safeParse({ config: { accountSid: SID }, secrets: creds.secrets }).success).toBe(false);
    expect(factory.manifest.schema.safeParse(creds).success).toBe(true);
  });
  it("rejects bad recipients offline; 4xx permanent, 5xx/429 retryable", async () => {
    const f = json({});
    expect((await mk(f).send({ to: "0530", text: "x" })).detail).toBe("permanent:invalid_recipient");
    expect(f).not.toHaveBeenCalled();
    expect((await mk(json({ code: 21211 }, 400)).send({ to: "+905301234567", text: "x" })).detail).toBe("permanent:HTTP 400 code 21211");
    expect((await mk(json({}, 429)).send({ to: "+905301234567", text: "x" })).detail).toBe("HTTP 429");
    expect((await mk(json({}, 500)).send({ to: "+905301234567", text: "x" })).detail).toBe("HTTP 500");
  });
  it("healthCheck fetches the account", async () => {
    const f = json({ status: "active" });
    expect((await mk(f).healthCheck()).ok).toBe(true);
    expect((f.mock.calls[0] as any)[0]).toBe(`https://api.twilio.com/2010-04-01/Accounts/${SID}.json`);
    expect(await mk(json({ status: "suspended" })).healthCheck()).toMatchObject({ ok: false });
    expect(await mk(json({}, 401)).healthCheck()).toEqual({ ok: false, detail: "invalid credentials" });
  });
});

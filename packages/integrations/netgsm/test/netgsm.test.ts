import { describe, it, expect, vi } from "vitest";
import { factory, toNetgsmNumber } from "../src";
const now = () => new Date("2026-01-01T00:00:00Z");
const creds = { config: { msgheader: "MAGAZAM" }, secrets: { usercode: "8501234567", password: "pw-secret-1" } };
const mk = (f: any, c: any = creds) => factory.create(c, { fetch: f, now });
const json = (b: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(b), { status }));

describe("netgsm", () => {
  it("sends REST v2 with basic auth, TR encoding, local number", async () => {
    const f = json({ code: "00", jobid: "123", description: "queued" });
    const r = await mk(f).send({ to: "+905301234567", text: "Merhaba şğüı" });
    expect(r).toEqual({ ok: true, providerMessageId: "123" });
    const [url, init] = f.mock.calls[0] as any;
    expect(url).toBe("https://api.netgsm.com.tr/sms/rest/v2/send");
    expect(init.headers.authorization).toBe("Basic " + btoa("8501234567:pw-secret-1"));
    const b = JSON.parse(init.body);
    expect(b).toMatchObject({ msgheader: "MAGAZAM", encoding: "TR", messages: [{ no: "5301234567", msg: "Merhaba şğüı" }] });
  });
  it("sender id override and international numbers", async () => {
    const f = json({ code: "00", jobid: "1" });
    await mk(f).send({ to: "+14155552671", text: "x", senderId: "OTHER" });
    const b = JSON.parse((f.mock.calls[0] as any)[1].body);
    expect(b.msgheader).toBe("OTHER"); expect(b.messages[0].no).toBe("0014155552671");
  });
  it("rejects non-E.164 recipients without calling the network", async () => {
    const f = json({});
    for (const to of ["05301234567", "+0123", "5301234567", "+90 530 123 45 67", "a@b.c"]) expect((await mk(f).send({ to, text: "x" })).detail).toBe("permanent:invalid_recipient");
    expect(f).not.toHaveBeenCalled();
    expect(() => toNetgsmNumber("123")).toThrow();
  });
  it("maps provider error codes; auth/header errors are permanent, limit is retryable", async () => {
    expect((await mk(json({ code: "30" }, 200)).send({ to: "+905301234567", text: "x" })).detail).toMatch(/^permanent:code 30/);
    expect((await mk(json({ code: "40" }, 200)).send({ to: "+905301234567", text: "x" })).detail).toMatch(/^permanent:code 40/);
    const lim = await mk(json({ code: "80" }, 200)).send({ to: "+905301234567", text: "x" });
    expect(lim.ok).toBe(false); expect(lim.detail).not.toMatch(/^permanent/);
    expect((await mk(json({}, 503)).send({ to: "+905301234567", text: "x" })).detail).toBe("HTTP 503");
  });
  it("requires a valid msgheader", async () => {
    const f = json({ code: "00" });
    expect((await mk(f, { config: {}, secrets: creds.secrets }).send({ to: "+905301234567", text: "x" })).detail).toBe("permanent:invalid_msgheader");
  });
  it("healthCheck uses balance endpoint on the allowlisted host and never leaks secrets", async () => {
    const f = json({ code: "00", balance: "15" });
    const h = await mk(f).healthCheck();
    expect(h).toEqual({ ok: true, detail: "balance: 15" });
    expect((f.mock.calls[0] as any)[0]).toContain("api.netgsm.com.tr");
    const bad = await mk(json({ code: "30" })).healthCheck();
    expect(bad.ok).toBe(false); expect(JSON.stringify(bad)).not.toContain("pw-secret");
  });
  it("manifest validates", () => {
    expect(factory.manifest.schema.safeParse(creds).success).toBe(true);
    expect(factory.manifest.schema.safeParse({ config: {}, secrets: {} }).success).toBe(false);
  });
});

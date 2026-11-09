import { describe, expect, it, vi } from "vitest";
import { GELIVER_OPERATIONS, GeliverConsoleError, buildGeliverRequest, getGeliverOperation, runGeliverCall, factory } from "../src";

const op = (id: string) => getGeliverOperation(id)!;
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s });

describe("catalog", () => {
  it("has unique ids, valid methods and every placeholder declared as a path param", () => {
    expect(new Set(GELIVER_OPERATIONS.map((o) => o.id)).size).toBe(GELIVER_OPERATIONS.length);
    for (const o of GELIVER_OPERATIONS) {
      const ph = [...o.path.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
      expect(o.params.filter((p) => p.in === "path").map((p) => p.name).sort(), o.id).toEqual(ph.sort());
      if (o.risk === "read") expect(o.method, o.id).toBe("GET");
      if (o.method === "DELETE") expect(o.risk, o.id).toBe("destructive");
    }
  });
});

describe("buildGeliverRequest", () => {
  it("fills + encodes path params and serializes known query params only", () => {
    const r = buildGeliverRequest(op("getShipment"), { path: { id: "a/b c" }, query: {} });
    expect(r.url).toBe("https://api.geliver.io/api/v1/shipments/a%2Fb%20c");
    const q = buildGeliverRequest(op("listShipments"), { path: {}, query: { limit: 5, page: 2, orderNumber: "" } });
    expect(q.url).toBe("https://api.geliver.io/api/v1/shipments?limit=5&page=2");
  });
  it("rejects missing path/required query params and unknown query params", () => {
    expect(() => buildGeliverRequest(op("getShipment"), { path: {}, query: {} })).toThrow(GeliverConsoleError);
    expect(() => buildGeliverRequest(op("priceList"), { path: {}, query: { length: 1 } })).toThrow(/Missing query parameter/);
    expect(() => buildGeliverRequest(op("listShipments"), { path: {}, query: { evil: "1" } })).toThrow(/Unknown query parameter/);
  });
  it("validates JSON string bodies and size", () => {
    expect(() => buildGeliverRequest(op("createWebhook"), { path: {}, query: {}, body: "{nope" })).toThrow(/valid JSON/);
    expect(() => buildGeliverRequest(op("createWebhook"), { path: {}, query: {}, body: { x: "a".repeat(1024 * 1024 + 1) } })).toThrow(/too large/);
  });
});

describe("runGeliverCall", () => {
  it("sends bearer auth, returns parsed body and never echoes the token", async () => {
    const f = vi.fn(async (_u: string, _i?: RequestInit) => json({ result: true, data: [] }));
    const r = await runGeliverCall({ fetch: f }, "SECRET-TOKEN-123", op("listAddresses"), { path: {}, query: { isRecipientAddress: false } });
    expect(f.mock.calls[0]![1]!.headers).toMatchObject({ Authorization: "Bearer SECRET-TOKEN-123" });
    expect(r).toMatchObject({ ok: true, status: 200, mock: false, operationId: "listAddresses" });
    expect(JSON.stringify(r)).not.toContain("SECRET-TOKEN-123");
  });
  it("maps envelope errors (result:false) and HTTP errors", async () => {
    const a = await runGeliverCall({ fetch: async () => json({ result: false, additionalMessage: "bad address", code: "E1" }) }, "t", op("listAddresses"), { path: {}, query: {} });
    expect(a).toMatchObject({ ok: false, error: { message: "bad address", code: "E1" } });
    const b = await runGeliverCall({ fetch: async () => json({ message: "nope" }, 401) }, "t", op("listAddresses"), { path: {}, query: {} });
    expect(b).toMatchObject({ ok: false, status: 401, error: { message: "nope" } });
  });
  it("turns network failures into an error result instead of throwing", async () => {
    const r = await runGeliverCall({ fetch: async () => { throw new Error("offline"); } }, "t", op("listAddresses"), { path: {}, query: {} });
    expect(r).toMatchObject({ ok: false, status: 0, error: { message: "offline" } });
  });
  it("adapter.consoleCall uses the adapter token", async () => {
    const f = vi.fn(async (_u: string, _i?: RequestInit) => json({ result: true }));
    const a: any = factory.create({ config: { test: true, senderAddressId: "S1" }, secrets: { apiToken: "tok-12345678" } }, { fetch: f as any, now: () => new Date() });
    await a.consoleCall(op("listCities"), { path: {}, query: { countryCode: "TR" } });
    expect(f.mock.calls[0]![0]).toBe("https://api.geliver.io/api/v1/cities?countryCode=TR");
    expect(a.testMode).toBe(true); expect(a.senderAddressId).toBe("S1");
  });
});

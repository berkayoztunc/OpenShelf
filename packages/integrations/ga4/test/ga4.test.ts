import { describe, it, expect, vi } from "vitest";
import { factory, jobHandlers, purchaseEventId, buildGa4Payload, uuidv5 } from "../src";
import { marketingEvents } from "@openshelf/db";
import { makeDb, seedOrder } from "./db";

const creds = { config: { measurementId: "G-ABCD1234" }, secrets: { apiSecret: "s3cr3t-value" } };
const now = () => new Date("2026-01-01T00:00:00Z");
const sink = (f: any) => factory.create(creds, { fetch: f, now });
const okFetch = () => vi.fn(async () => new Response(null, { status: 204 }));
const mkCtx = (db: any, adapter: any) => ({ db, env: {}, getAdapter: async () => adapter, log: vi.fn(async () => {}) });
const job = { id: "j1", kind: "marketing.purchase.ga4", payload: { orderId: "ord_1" }, attempts: 0 };

describe("ga4 sink", () => {
  it("builds MP payload with item_id = variant id and transaction_id", async () => {
    const f = okFetch();
    const id = purchaseEventId("ord_1");
    const r = await sink(f).send(
      { event_id: id, name: "purchase", currency: "TRY", value: 199.9, transaction_id: "OS-1", items: [{ id: "var_1", name: "Kupa", price: 99.95, quantity: 2 }] },
      { gaClientId: "123.456" },
    );
    expect(r.ok).toBe(true);
    const [url, init] = f.mock.calls[0] as any;
    expect(url).toBe("https://www.google-analytics.com/mp/collect?measurement_id=G-ABCD1234&api_secret=s3cr3t-value");
    const b = JSON.parse(init.body);
    expect(b.client_id).toBe("123.456");
    expect(b.events[0].name).toBe("purchase");
    expect(b.events[0].params).toMatchObject({ transaction_id: "OS-1", currency: "TRY", value: 199.9, event_id: id });
    expect(b.events[0].params.items[0]).toMatchObject({ item_id: "var_1", price: 99.95, quantity: 2 });
  });
  it("missing client id is permanent failure", async () => {
    const r = await sink(okFetch()).send({ event_id: purchaseEventId("a"), name: "purchase" }, {});
    expect(r).toEqual({ ok: false, detail: "permanent:missing_client_id" });
  });
  it("healthCheck uses debug endpoint and surfaces validation messages", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ validationMessages: [{ validationCode: "VALUE_INVALID" }] }), { status: 200 }));
    const h = await sink(f).healthCheck();
    expect((f.mock.calls[0] as any)[0]).toContain("/debug/mp/collect");
    expect(h).toEqual({ ok: false, detail: "VALUE_INVALID" });
    const ok = await sink(vi.fn(async () => new Response(JSON.stringify({ validationMessages: [] })))).healthCheck();
    expect(ok.ok).toBe(true);
  });
  it("same purchase event id as meta package algorithm", () => {
    expect(uuidv5("python.org", "6ba7b810-9dad-11d1-80b4-00c04fd430c8")).toBe("886313e1-3b8a-5372-9b90-0c9aee199e5d");
    expect(buildGa4Payload({ event_id: purchaseEventId("x"), name: "page_view" }, "c", 0).events[0]!.params.event_id).toBe(purchaseEventId("x"));
  });
});

describe("marketing.purchase.ga4 handler", () => {
  const handler = jobHandlers["marketing.purchase.ga4"]!;
  it("skips without analytics consent", async () => {
    const { db, raw } = makeDb(); seedOrder(raw, { consent: { necessary: true, analytics: false, marketing: true } });
    const f = okFetch();
    await handler(job, mkCtx(db, sink(f)));
    expect(f).not.toHaveBeenCalled();
    expect((await db.select().from(marketingEvents))[0]).toMatchObject({ status: "skipped_no_consent", destination: "ga4_mp" });
  });
  it("sends once, replay-safe, uses order attribution client id", async () => {
    const { db, raw } = makeDb(); seedOrder(raw);
    const f = okFetch(); const ctx = mkCtx(db, sink(f));
    await handler(job, ctx); await handler(job, ctx);
    expect(f).toHaveBeenCalledTimes(1);
    const b = JSON.parse((f.mock.calls[0] as any)[1].body);
    expect(b.client_id).toBe("123.456");
    expect(b.events[0].params.items[0].item_id).toBe("var_1");
    expect(await db.select().from(marketingEvents)).toHaveLength(1);
  });
  it("throws on 5xx", async () => {
    const { db, raw } = makeDb(); seedOrder(raw);
    const f = vi.fn(async () => new Response("", { status: 503 }));
    await expect(handler(job, mkCtx(db, sink(f)))).rejects.toThrow();
  });
});

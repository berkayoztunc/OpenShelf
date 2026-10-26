import { describe, it, expect, vi } from "vitest";
import { createHash } from "node:crypto";
import { factory, jobHandlers, purchaseEventId, sha256Hex, normalizePhone, buildMetaFeed, buildCapiEvent, uuidv5 } from "../src";
import { buildPurchaseEvent } from "../src/marketing";
import { marketingEvents } from "@openshelf/db";
import { makeDb, seedOrder } from "./db";

const creds = { config: { pixelId: "1234567890", testEventCode: "TEST123" }, secrets: { accessToken: "EAAB" + "x".repeat(30) } };
const now = () => new Date("2026-01-01T00:00:00Z");
function sink(fetchImpl: any) { return factory.create(creds, { fetch: fetchImpl, now }); }
const okFetch = () => vi.fn(async () => new Response(JSON.stringify({ events_received: 1 }), { status: 200 }));
const mkCtx = (db: any, adapter: any) => ({
  db, env: {}, getAdapter: async () => adapter, log: vi.fn(async () => {}),
});
const job = { id: "j1", kind: "marketing.purchase.meta", payload: { orderId: "ord_1" }, attempts: 0 };

describe("hashing", () => {
  it("sha256 known answer", async () => {
    expect(await sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(await sha256Hex("test@example.com")).toBe(createHash("sha256").update("test@example.com").digest("hex"));
  });
  it("normalizes phone TR formats", () => {
    expect(normalizePhone("0532 123 45 67")).toBe("905321234567");
    expect(normalizePhone("+90 (532) 123-45-67")).toBe("905321234567");
  });
  it("uuidv5 known answer (RFC DNS namespace)", () => {
    expect(uuidv5("python.org", "6ba7b810-9dad-11d1-80b4-00c04fd430c8")).toBe("886313e1-3b8a-5372-9b90-0c9aee199e5d");
  });
});

describe("CAPI sink", () => {
  it("sends hashed user data, event_id, variant content ids, test_event_code", async () => {
    const f = okFetch();
    const eventId = purchaseEventId("ord_1");
    const r = await sink(f).send(
      { event_id: eventId, name: "purchase", currency: "try", value: 199.9, transaction_id: "OS-1", items: [{ id: "var_1", name: "Kupa", price: 99.95, quantity: 2 }] },
      { email: " Test@Example.com ", phone: "0532 123 45 67", externalId: "cus_1", ip: "1.2.3.4", userAgent: "UA", fbc: "fb.1.1.a", fbp: "fb.1.2.b", sourceUrl: "https://shop.example/x" },
    );
    expect(r.ok).toBe(true);
    const [url, init] = f.mock.calls[0] as any;
    expect(url).toBe("https://graph.facebook.com/v21.0/1234567890/events");
    expect(init.headers.authorization).toMatch(/^Bearer /);
    expect(url).not.toContain("EAAB");
    const body = JSON.parse(init.body);
    expect(body.test_event_code).toBe("TEST123");
    const d = body.data[0];
    expect(d.event_name).toBe("Purchase");
    expect(d.event_id).toBe(eventId);
    expect(d.action_source).toBe("website");
    expect(d.event_source_url).toBe("https://shop.example/x");
    expect(d.event_time).toBe(1767225600);
    expect(d.user_data.em).toEqual([await sha256Hex("test@example.com")]);
    expect(d.user_data.ph).toEqual([await sha256Hex("905321234567")]);
    expect(d.user_data.client_ip_address).toBe("1.2.3.4");
    expect(d.custom_data).toMatchObject({ currency: "TRY", value: 199.9, content_ids: ["var_1"], order_id: "OS-1" });
    expect(JSON.stringify(body)).not.toContain("Test@Example.com");
  });
  it("browser and server share the same purchase event_id", () => {
    expect(purchaseEventId("ord_1")).toBe(purchaseEventId("ord_1"));
    expect(purchaseEventId("ord_1")).not.toBe(purchaseEventId("ord_2"));
    expect(purchaseEventId("ord_1")).toMatch(/^[0-9a-f-]{36}$/);
    expect(buildPurchaseEvent({ id: "ord_1", currency: "TRY", total: 100, number: "n" }, []).event_id).toBe(purchaseEventId("ord_1"));
  });
  it("unmapped events are no-ops; 4xx permanent", async () => {
    const f = okFetch();
    expect((await sink(f).send({ event_id: purchaseEventId("a"), name: "refund" }, {})).detail).toBe("unmapped_event");
    expect(f).not.toHaveBeenCalled();
    const bad = vi.fn(async () => new Response(JSON.stringify({ error: { message: "Invalid token" } }), { status: 400 }));
    const r = await sink(bad).send({ event_id: purchaseEventId("a"), name: "purchase" }, {});
    expect(r.ok).toBe(false); expect(r.detail).toMatch(/^permanent:/);
  });
  it("rejects invalid config via manifest schema", () => {
    expect(factory.manifest.schema.safeParse({ config: { pixelId: "abc" }, secrets: { accessToken: "x" } }).success).toBe(false);
  });
  it("buildCapiEvent maps names", async () => {
    expect((await buildCapiEvent({ event_id: purchaseEventId("a"), name: "add_to_cart" }, {}, 0))?.event_name).toBe("AddToCart");
  });
});

describe("marketing.purchase.meta handler", () => {
  const handler = jobHandlers["marketing.purchase.meta"]!;
  it("skips without marketing consent and records skipped_no_consent", async () => {
    const { db, raw } = makeDb(); seedOrder(raw, { consent: { necessary: true, analytics: true, marketing: false } });
    const f = okFetch();
    await handler(job, mkCtx(db, sink(f)));
    expect(f).not.toHaveBeenCalled();
    const rows = await db.select().from(marketingEvents);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "skipped_no_consent", destination: "meta_capi", name: "purchase", eventId: purchaseEventId("ord_1") });
  });
  it("sends once; replay is a no-op", async () => {
    const { db, raw } = makeDb(); seedOrder(raw);
    const f = okFetch();
    const ctx = mkCtx(db, sink(f));
    await handler(job, ctx); await handler(job, ctx);
    expect(f).toHaveBeenCalledTimes(1);
    const body = JSON.parse((f.mock.calls[0] as any)[1].body);
    expect(body.data[0].event_id).toBe(purchaseEventId("ord_1"));
    expect(body.data[0].custom_data.content_ids).toEqual(["var_1"]);
    expect(body.data[0].custom_data.value).toBe(199.9);
    const rows = await db.select().from(marketingEvents);
    expect(rows).toHaveLength(1); expect(rows[0]!.status).toBe("sent");
  });
  it("throws on retryable failure, then succeeds on retry (single row)", async () => {
    const { db, raw } = makeDb(); seedOrder(raw);
    const f = vi.fn().mockResolvedValueOnce(new Response("{}", { status: 500 })).mockResolvedValueOnce(new Response("{}", { status: 200 }));
    const ctx = mkCtx(db, sink(f));
    await expect(handler(job, ctx)).rejects.toThrow(/failed/);
    expect((await db.select().from(marketingEvents))[0]!.status).toBe("failed");
    await handler(job, ctx);
    const rows = await db.select().from(marketingEvents);
    expect(rows).toHaveLength(1); expect(rows[0]!.status).toBe("sent");
  });
});

describe("meta feed", () => {
  const products = [
    { id: "var_1", title: 'Kupa "Mavi" & <Büyük>', description: "Açıklama, virgüllü", availableStock: 3, price: 19990, link: "https://shop.example/p/kupa", imageLink: "https://shop.example/m/1", brand: "Acme", itemGroupId: "prod_1" },
    { id: "var_2", title: "Tabak", description: "", availableStock: 0, price: 5, currency: "TRY", link: "https://shop.example/p/tabak", imageLink: "https://shop.example/m/2" },
  ];
  it("xml + csv formats", () => {
    const { xml, csv } = buildMetaFeed(products);
    expect(xml).toContain('xmlns:g="http://base.google.com/ns/1.0"');
    expect(xml).toContain("<g:price>199.90 TRY</g:price>");
    expect(xml).toContain("<g:availability>out of stock</g:availability>");
    expect(xml).toContain("Kupa &quot;Mavi&quot; &amp; &lt;Büyük&gt;");
    expect(xml).toContain("<g:price>0.05 TRY</g:price>");
    const lines = csv.trim().split("\n");
    expect(lines[0]).toBe("id,title,description,availability,condition,price,link,image_link,brand,item_group_id");
    expect(lines[1]).toContain('"Kupa ""Mavi"" & <Büyük>","Açıklama, virgüllü",in stock,new,199.90 TRY');
  });
});

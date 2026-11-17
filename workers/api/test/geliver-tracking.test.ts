import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import type { AdapterFactory, ShippingProvider, TrackingStatus } from "@openshelf/integration-sdk";
import { manifest as geliverManifest } from "@openshelf/integration-geliver";
import { registerFactory } from "../src/integrations/registry";
import { runOutbox } from "../src/outbox";
import { shipmentIdFromWebhook, stepsTo, targetFor } from "../src/lib/shipmentTracking";
import { admin, call, ensureOwner, j, type Session } from "./helpers";

const tracking = new Map<string, TrackingStatus>();
const fakeGeliver: AdapterFactory<ShippingProvider & { webhookToken(): Promise<string> }> = {
  manifest: geliverManifest,
  create: () => ({
    id: "geliver", validateConfig: async () => {}, healthCheck: async () => ({ ok: true }),
    quote: async () => [], createShipment: async () => { throw new Error("not used"); }, cancel: async () => ({ ok: true }),
    track: async (id: string) => { const t = tracking.get(id); if (!t) throw new Error(`unknown shipment ${id}`); return t; },
    webhookToken: async () => "tok-secret-123",
  }) as never,
};

const ADDR = '{"name":"Ayşe","phone":"5551112233","line1":"Atatürk Cad. 1","city":"Izmir","district":"Konak"}';
const order = (id: string, status: string) => env.DB.prepare(
  `INSERT INTO orders (id, number, source, status, email, shipping_address, currency, subtotal, total, tracking_token, created_at, updated_at)
   VALUES (?1, ?2, 'website', ?3, ?1 || '@example.invalid', ?4, 'TRY', 1000, 1000, ?1, unixepoch(), unixepoch())`).bind(id, `GT-${id}`, status, ADDR).run();
const shipment = (id: string, orderId: string, providerId: string, status: string) => env.DB.prepare(
  "INSERT INTO shipments (id, order_id, provider, provider_shipment_id, carrier, tracking_number, status, created_at) VALUES (?1, ?2, 'geliver', ?3, 'SURAT', 'TRK-' || ?1, ?4, unixepoch())",
).bind(id, orderId, providerId, status).run();
const statusOf = async (id: string) => (await env.DB.prepare("SELECT status FROM orders WHERE id = ?1").bind(id).first<{ status: string }>())!.status;
const jobs = async (kind: string) => (await env.DB.prepare("SELECT dedupe_key AS k, payload FROM outbox_jobs WHERE kind = ?1").bind(kind).all<{ k: string; payload: string }>()).results;

let owner: Session;
beforeAll(async () => {
  owner = await ensureOwner();
  registerFactory("geliver", fakeGeliver as never);
  const r = await admin(owner, "/integrations/geliver", "PUT", { enabled: true, config: { test: true, senderAddressId: "addr-1" }, secrets: { apiToken: "geliver-token-123" } });
  expect(r.status).toBe(200);
});

describe("tracking rules", () => {
  it("maps carrier states and walks the order path forward only", () => {
    expect(targetFor("in_transit")).toBe("shipped");
    expect(targetFor("delivered")).toBe("delivered");
    expect(targetFor("returned")).toBeNull();
    expect(stepsTo("paid", "shipped")).toEqual(["fulfilling", "shipped"]);
    expect(stepsTo("paid", "delivered")).toEqual(["fulfilling", "shipped", "delivered"]);
    expect(stepsTo("delivered", "shipped")).toEqual([]);
    expect(stepsTo("cancelled" as never, "shipped")).toEqual([]);
  });
  it("reads the shipment id from webhook payload variants and rejects junk", () => {
    expect(shipmentIdFromWebhook({ event: "TRACK_UPDATED", data: { shipment: { id: "abc-1" } } })).toBe("abc-1");
    expect(shipmentIdFromWebhook({ data: { id: "abc-2" } })).toBe("abc-2");
    expect(shipmentIdFromWebhook({ shipmentID: "abc-3" })).toBe("abc-3");
    expect(shipmentIdFromWebhook({ data: { id: "x'; DROP TABLE" } })).toBeNull();
    expect(shipmentIdFromWebhook(null)).toBeNull();
  });
});

describe("Geliver tracking sweep", () => {
  it("moves paid orders to shipped and shipped ones to delivered, saves the tracking link, queues the customer notifications", async () => {
    await order("gt-a", "paid"); await shipment("gs-a", "gt-a", "shp-a", "created");
    await order("gt-b", "shipped"); await shipment("gs-b", "gt-b", "shp-b", "in_transit");
    await order("gt-c", "fulfilling"); await shipment("gs-c", "gt-c", "shp-c", "created");
    tracking.set("shp-a", { status: "in_transit", events: [{ at: "2026-11-18T10:00:00Z", detail: "Transfer merkezinde" }], trackingUrl: "https://kargo.example/track/A" });
    tracking.set("shp-b", { status: "delivered", events: [{ at: "2026-11-18T11:00:00Z", detail: "Teslim edildi" }] });
    tracking.set("shp-c", { status: "created", events: [] }); // not picked up yet: nothing moves

    const run = await admin(owner, "/geliver/tracking/run", "POST");
    expect(run.status).toBe(200);
    await runOutbox(env, { limit: 50 });

    expect(await statusOf("gt-a")).toBe("shipped");
    expect(await statusOf("gt-b")).toBe("delivered");
    expect(await statusOf("gt-c")).toBe("fulfilling");
    const sa = await env.DB.prepare("SELECT status, tracking_url FROM shipments WHERE id = 'gs-a'").first<any>();
    expect(sa).toMatchObject({ status: "in_transit", tracking_url: "https://kargo.example/track/A" });
    const ev = await env.DB.prepare("SELECT status, detail FROM shipment_events WHERE shipment_id = 'gs-b'").all<any>();
    expect(ev.results).toEqual([{ status: "delivered", detail: "Teslim edildi" }]);
    expect((await jobs("notify.order_shipped")).map((x) => x.k)).toContain("notify.order_shipped:gt-a");
    expect((await jobs("notify.order_delivered")).map((x) => x.k)).toContain("notify.order_delivered:gt-b");

    // a second sweep is a no-op: delivered shipments are no longer polled, the shipped one does not re-notify
    await admin(owner, "/geliver/tracking/run", "POST");
    await runOutbox(env, { limit: 50, now: new Date(Date.now() + 61_000) });
    expect((await jobs("notify.order_shipped")).filter((x) => x.k === "notify.order_shipped:gt-a")).toHaveLength(1);
  });
});

describe("operator-started jobs", () => {
  it("run right after the admin request instead of waiting for the 15-minute tick", async () => {
    await order("gt-d", "paid"); await shipment("gs-d", "gt-d", "shp-d", "created");
    tracking.set("shp-d", { status: "in_transit", events: [] });
    (env as { INLINE_OUTBOX?: string }).INLINE_OUTBOX = "true";
    try { expect((await admin(owner, "/geliver/tracking/run", "POST")).status).toBe(200); }
    finally { (env as { INLINE_OUTBOX?: string }).INLINE_OUTBOX = "false"; }
    expect(await statusOf("gt-d")).toBe("shipped"); // no runOutbox call here
  });
});

describe("Geliver webhook", () => {
  it("exposes the secret webhook URL to admins, rejects a wrong token and queues a targeted re-check", async () => {
    const info = await j<any>(await admin(owner, "/geliver/tracking"));
    expect(info.enabled).toBe(true);
    expect(info.webhookUrl).toMatch(/\/webhooks\/geliver\/tok-secret-123$/);

    const bad = await call("/webhooks/geliver/wrong-token", { method: "POST", json: { data: { shipment: { id: "shp-z" } } }, origin: null });
    expect(bad.status).toBe(401);

    const ok = await call("/webhooks/geliver/tok-secret-123", { method: "POST", json: { event: "TRACK_UPDATED", data: { shipment: { id: "shp-z" } } }, origin: null });
    expect(ok.status).toBe(200);
    const queued = (await jobs("shipment.track")).filter((x) => x.k.startsWith("shipment.track:wh:shp-z:"));
    expect(queued).toHaveLength(1);
    expect(JSON.parse(queued[0]!.payload)).toEqual({ providerShipmentId: "shp-z" });
  });
});

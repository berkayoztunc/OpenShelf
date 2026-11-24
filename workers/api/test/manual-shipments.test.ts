import { env } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { AdapterFactory, ShipmentInput, ShippingProvider, TrackingStatus } from "@openshelf/integration-sdk";
import { manifest as geliverManifest } from "@openshelf/integration-geliver";
import { registerFactory } from "../src/integrations/registry";
import { runOutbox } from "../src/outbox";
import { admin, ensureOwner, j, loginAs, type Session } from "./helpers";

const created: { input: ShipmentInput; serviceId: string }[] = [];
const cancelled: string[] = [];
const tracking = new Map<string, TrackingStatus>();
const beh = { fail: false, cancelOk: true };
const fake: AdapterFactory<ShippingProvider> = {
  manifest: geliverManifest,
  create: () => ({
    id: "geliver", validateConfig: async () => {}, healthCheck: async () => ({ ok: true }),
    quote: async () => [{ carrier: "SURAT", serviceId: "SURAT_STD", price: 9000, currency: "TRY" }, { carrier: "YURTICI", serviceId: "YURTICI_STD", price: 7500, currency: "TRY" }, { carrier: "YURTICI", serviceId: "YURTICI_STD", price: 7500, currency: "TRY" }],
    createShipment: async (input: ShipmentInput, serviceId: string) => {
      if (beh.fail) throw new Error("E1001 invalid district");
      created.push({ input, serviceId });
      return { providerShipmentId: `shp-${created.length}`, carrier: "YURTICI", trackingNumber: undefined, labelUrl: "https://labels.example/l.pdf" };
    },
    cancel: async (id: string) => { cancelled.push(id); return { ok: beh.cancelOk }; },
    track: async (id: string) => { const t = tracking.get(id); if (!t) throw new Error(`unknown ${id}`); return t; },
  }) as never,
};

const recipient = { name: "Ayşe", surname: "Yılmaz", phone: "5551112233", email: "", line1: "Atatürk Cad. 1 D:2", city: "İzmir", district: "Konak", zip: "35210" };
const body = (o: Record<string, unknown> = {}) => ({ recipient, weightKg: 0.8, serviceId: "YURTICI_STD", contents: "Hediye: makrome anahtarlık", note: "VIP", ...o });

let owner: Session; let staff: Session;
beforeAll(async () => {
  owner = await ensureOwner();
  registerFactory("geliver", fake as never);
  expect((await admin(owner, "/integrations/geliver", "PUT", { enabled: true, config: { test: false, senderAddressId: "addr-1" }, secrets: { apiToken: "geliver-token-123" } })).status).toBe(200);
  await admin(owner, "/users", "POST", { email: "staff-ship@example.com", name: "Staff", password: "staff password 12345", role: "staff" });
  staff = await loginAs("staff-ship@example.com", "staff password 12345");
});
beforeEach(() => { beh.fail = false; beh.cancelOk = true; });

describe("manual shipments", () => {
  it("quotes: deduplicated, cheapest first", async () => {
    const r = await j<any>(await admin(owner, "/manual-shipments/quotes", "POST", { recipient, weightKg: 1 }));
    expect(r.items.map((x: any) => x.serviceId)).toEqual(["YURTICI_STD", "SURAT_STD"]);
    expect((await admin(owner, "/manual-shipments/quotes", "POST", { recipient: { ...recipient, phone: "1" }, weightKg: 1 })).status).toBe(400);
  });

  it("buys a label with a reference and the contents, lists, reads, audits", async () => {
    const r = await admin(owner, "/manual-shipments", "POST", body());
    expect(r.status).toBe(201);
    const s = await j<any>(r);
    expect(s).toMatchObject({ status: "created", carrier: "YURTICI", labelUrl: "https://labels.example/l.pdf", providerShipmentId: expect.stringMatching(/^shp-/), weightKg: 0.8, contents: "Hediye: makrome anahtarlık" });
    expect(s.reference).toMatch(/^MK-[2-9A-Z]{6}$/);
    const sent = created.at(-1)!;
    expect(sent.serviceId).toBe("YURTICI_STD");
    expect(sent.input).toMatchObject({ orderId: s.reference, contents: "Hediye: makrome anahtarlık", recipient: { name: "Ayşe Yılmaz", phone: "5551112233", address: "Atatürk Cad. 1 D:2", city: "İzmir", district: "Konak", zip: "35210" }, parcels: [{ weightKg: 0.8 }] });
    expect(sent.input.recipient.email).toBeUndefined();
    const list = await j<any>(await admin(owner, `/manual-shipments?q=${s.reference}`));
    expect(list.items.map((x: any) => x.id)).toEqual([s.id]);
    const one = await j<any>(await admin(owner, `/manual-shipments/${s.id}`));
    expect(one.events[0]).toMatchObject({ status: "created" });
    const a = await env.DB.prepare("SELECT meta FROM audit_logs WHERE action = 'manual_shipment.create' AND entity_id = ?1").bind(s.id).first<{ meta: string }>();
    expect(a?.meta).not.toContain("5551112233");
  });

  it("a provider error leaves nothing behind and shows the carrier's reason", async () => {
    beh.fail = true;
    const before = (await env.DB.prepare("SELECT COUNT(*) n FROM manual_shipments").first<{ n: number }>())!.n;
    const r = await admin(owner, "/manual-shipments", "POST", body());
    expect(r.status).toBe(502);
    expect((await j<any>(r)).error.message).toContain("E1001 invalid district");
    expect((await env.DB.prepare("SELECT COUNT(*) n FROM manual_shipments").first<{ n: number }>())!.n).toBe(before);
  });

  it("staff may look and quote but not buy or cancel", async () => {
    expect((await admin(staff, "/manual-shipments")).status).toBe(200);
    expect((await admin(staff, "/manual-shipments/quotes", "POST", { recipient, weightKg: 1 })).status).toBe(200);
    expect((await admin(staff, "/manual-shipments", "POST", body())).status).toBe(403);
  });

  it("cancel only before pick-up; provider refusal keeps it", async () => {
    const s = await j<any>(await admin(owner, "/manual-shipments", "POST", body()));
    beh.cancelOk = false;
    expect((await admin(owner, `/manual-shipments/${s.id}/cancel`, "POST")).status).toBe(502);
    beh.cancelOk = true;
    const r = await j<any>(await admin(owner, `/manual-shipments/${s.id}/cancel`, "POST"));
    expect(r.status).toBe("cancelled");
    expect(cancelled.at(-1)).toBe(s.providerShipmentId);
    expect((await admin(owner, `/manual-shipments/${s.id}/cancel`, "POST")).status).toBe(409);
  });

  it("tracking: refresh now and the hourly sweep update the shipment, no order involved", async () => {
    const s = await j<any>(await admin(owner, "/manual-shipments", "POST", body()));
    tracking.set(s.providerShipmentId, { status: "in_transit", events: [{ at: "2026-11-25T10:00:00Z", detail: "Yolda" }], trackingNumber: "TRK99", trackingUrl: "https://kargo.example/TRK99" });
    const r = await j<any>(await admin(owner, `/manual-shipments/${s.id}/refresh`, "POST"));
    expect(r).toMatchObject({ status: "in_transit", trackingNumber: "TRK99", trackingUrl: "https://kargo.example/TRK99" });
    tracking.set(s.providerShipmentId, { status: "delivered", events: [{ at: "2026-11-26T10:00:00Z", detail: "Teslim edildi" }] });
    expect((await admin(owner, "/geliver/tracking/run", "POST")).status).toBe(200);
    await runOutbox(env, { limit: 50 });
    const after = await j<any>(await admin(owner, `/manual-shipments/${s.id}`));
    expect(after.status).toBe("delivered");
    expect(after.events.map((e: any) => e.status)).toEqual(["delivered", "in_transit", "created"]);
  });

  it("recipients: customers' saved addresses and earlier orders", async () => {
    await env.DB.prepare("INSERT OR IGNORE INTO customers (id, email, name, surname, phone, created_at) VALUES ('ms-c1', 'zeynep.ms@example.com', 'Zeynep', 'Kaya', '5329998877', unixepoch())").run();
    await env.DB.prepare("INSERT OR IGNORE INTO addresses (id, customer_id, name, phone, line1, city, district) VALUES ('ms-a1', 'ms-c1', 'Zeynep Kaya', '5329998877', 'Bağdat Cad. 5', 'İstanbul', 'Kadıköy')").run();
    await env.DB.prepare(`INSERT OR IGNORE INTO orders (id, number, source, status, email, shipping_address, currency, subtotal, total, tracking_token, created_at, updated_at)
      VALUES ('ms-o1', 'OS-MSZEYNEP', 'website', 'delivered', 'zeynep.ms@example.com', '{"name":"Zeynep","surname":"Kaya","phone":"5329998877","line1":"İş Adresi Sok. 3","city":"Ankara","district":"Çankaya"}', 'TRY', 1, 1, 'ms-o1', unixepoch(), unixepoch())`).run();
    const r = await j<any>(await admin(owner, "/manual-shipments/recipients?q=zeynep"));
    expect(r.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: "customer", customerId: "ms-c1", recipient: expect.objectContaining({ line1: "Bağdat Cad. 5", city: "İstanbul", district: "Kadıköy", phone: "5329998877" }) }),
      expect.objectContaining({ source: "order", orderId: "ms-o1", recipient: expect.objectContaining({ name: "Zeynep", surname: "Kaya", line1: "İş Adresi Sok. 3", city: "Ankara" }) }),
    ]));
    expect((await j<any>(await admin(owner, "/manual-shipments/recipients?q=z"))).items).toEqual([]);
  });

  it("no shipping provider -> 503", async () => {
    await admin(owner, "/integrations/geliver", "PUT", { enabled: false, config: { test: false, senderAddressId: "addr-1" }, secrets: { apiToken: "geliver-token-123" } });
    try { expect((await admin(owner, "/manual-shipments/quotes", "POST", { recipient, weightKg: 1 })).status).toBe(503); }
    finally { await admin(owner, "/integrations/geliver", "PUT", { enabled: true, config: { test: false, senderAddressId: "addr-1" }, secrets: { apiToken: "geliver-token-123" } }); }
  });
});

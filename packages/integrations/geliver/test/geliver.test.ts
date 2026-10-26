import { describe, expect, it } from "vitest";
import { factory, createShipmentHandler, GeliverAdapter } from "../src/index";
import type { ShipmentRepo } from "../src/index";

const cfg = { test: true, senderAddressId: "S1" };
const secrets = { apiToken: "tok-12345678" };
const calls: { url: string; init: any }[] = [];
const mk = (routes: (u: string, init: any) => any) =>
  factory.create({ config: cfg, secrets }, { now: () => new Date(), fetch: async (u: string, init: any) => { calls.push({ url: u, init }); return new Response(JSON.stringify(routes(u, init)), { status: 200 }); } }) as GeliverAdapter;
const input = { orderId: "o1", recipient: { name: "A B", phone: "+905051234567", address: "Addr", city: "34", district: "Kadikoy" }, parcels: [{ weightKg: 2 }] };

describe("geliver", () => {
  it("validates config", () => {
    expect(() => factory.create({ config: {}, secrets }, { now: () => new Date(), fetch: fetch as any })).toThrow();
    expect(() => factory.create({ config: cfg, secrets: {} }, { now: () => new Date(), fetch: fetch as any })).toThrow();
  });
  it("quote flattens offers, bearer auth, host allowlisted", async () => {
    const a = mk(() => ({ result: true, priceList: [{ desi: "1", offers: [{ totalAmount: "115.76", currency: "TL", providerCode: "SURAT", providerServiceCode: "SURAT_STANDART" }] }] }));
    const q = await a.quote(input);
    expect(q).toEqual([{ carrier: "SURAT", serviceId: "SURAT_STANDART", price: 11576, currency: "TRY" }]);
    const c = calls.at(-1)!; expect(c.url.startsWith("https://api.geliver.io/api/v1/priceList?")).toBe(true);
    expect(c.init.headers.Authorization).toBe("Bearer tok-12345678");
  });
  it("createShipment posts one-step transaction", async () => {
    const a = mk(() => ({ result: true, data: { shipment: { id: "sh1", labelURL: "https://l/x.pdf", providerCode: "SURAT" } } }));
    const r = await a.createShipment(input, "SURAT_STANDART");
    expect(r).toMatchObject({ providerShipmentId: "sh1", labelUrl: "https://l/x.pdf", carrier: "SURAT" });
    const body = JSON.parse(calls.at(-1)!.init.body);
    expect(body.providerServiceCode).toBe("SURAT_STANDART"); expect(body.shipment.recipientAddress.cityCode).toBe("34"); expect(body.shipment.test).toBe(true);
  });
  it("track/cancel/error", async () => {
    const a = mk((u, i) => i.method === "DELETE" ? { result: false, code: "E1051", additionalMessage: "nf" } : { result: true, data: { trackingStatus: { trackingStatusCode: "TRANSIT", statusDate: "2026", statusDetails: "x" } } });
    expect((await a.track("sh1")).status).toBe("in_transit");
    expect(await a.cancel("sh1")).toEqual({ ok: false });
  });
  it("shipment.create handler is idempotent", async () => {
    const saved: any[] = []; let exists = false;
    const repo: ShipmentRepo = {
      loadOrder: async () => ({ input, currency: "TRY", total: 1000 }),
      findShipment: async () => (exists ? { id: "x" } : null),
      saveShipment: async (_o, r) => { saved.push(r); exists = true; },
    };
    let created = 0;
    const adapter = { quote: async () => [{ carrier: "A", serviceId: "B", price: 5, currency: "TRY" }, { carrier: "C", serviceId: "CHEAP", price: 1, currency: "TRY" }], createShipment: async (_i: any, s: string) => { created++; return { providerShipmentId: "p-" + s }; } };
    const h = createShipmentHandler(() => repo);
    const ctx = { db: {}, env: {}, getAdapter: async () => adapter, log: async () => {} };
    await h({ id: "j", kind: "shipment.create", payload: { orderId: "o1" }, attempts: 0 }, ctx);
    await h({ id: "j", kind: "shipment.create", payload: { orderId: "o1" }, attempts: 1 }, ctx);
    expect(created).toBe(1); expect(saved[0].providerShipmentId).toBe("p-CHEAP");
  });
});

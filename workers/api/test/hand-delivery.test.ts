import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { admin, ensureOwner, j, type Session } from "./helpers";

const ADDR = '{"name":"Ayşe","phone":"5551112233","line1":"Atatürk Cad. 1","city":"Izmir","district":"Konak"}';
const order = (id: string, status: string, source = "website") => env.DB.prepare(
  `INSERT INTO orders (id, number, source, status, email, shipping_address, currency, subtotal, total, tracking_token, created_at, updated_at)
   VALUES (?1, ?2, ?4, ?3, ?1 || '@example.invalid', ?5, 'TRY', 1000, 1000, ?1, unixepoch(), unixepoch())`).bind(id, `HD-${id}`, status, source, ADDR).run();
const statusOf = async (id: string) => (await env.DB.prepare("SELECT status FROM orders WHERE id = ?1").bind(id).first<{ status: string }>())!.status;
const jobKeys = async (id: string) => (await env.DB.prepare("SELECT dedupe_key AS k FROM outbox_jobs WHERE dedupe_key LIKE ?1").bind(`notify.%:${id}`).all<{ k: string }>()).results.map((r) => r.k).sort();

let owner: Session;
beforeAll(async () => { owner = await ensureOwner(); });

describe("hand delivery", () => {
  it("walks a paid website order to delivered, records a 'hand' shipment, sends only the delivered message", async () => {
    await order("hd-a", "paid");
    const r = await admin(owner, "/orders/hd-a/hand-delivery", "POST", { note: "Mağazada teslim aldı" });
    expect(r.status).toBe(201);
    expect(await statusOf("hd-a")).toBe("delivered");
    const s = await env.DB.prepare("SELECT provider, carrier, tracking_number AS t, status FROM shipments WHERE order_id = 'hd-a'").first<any>();
    expect(s).toMatchObject({ provider: "hand", carrier: "Elden teslimat", t: null, status: "delivered" });
    const ev = await env.DB.prepare("SELECT e.detail FROM shipment_events e JOIN shipments s ON s.id = e.shipment_id WHERE s.order_id = 'hd-a'").first<any>();
    expect(ev.detail).toBe("Mağazada teslim aldı");
    expect(await jobKeys("hd-a")).toEqual(["notify.order_delivered:hd-a"]); // no "shipped, here is your tracking link"
    // the order page shows it, and doing it twice is refused
    const detail = await j<any>(await admin(owner, "/orders/hd-a"));
    expect(detail.shipments.map((x: any) => x.provider)).toEqual(["hand"]);
    expect((await admin(owner, "/orders/hd-a/hand-delivery", "POST", {})).status).toBe(409);
  });

  it("can stay silent, and blocks carrier shipments afterwards", async () => {
    await order("hd-b", "fulfilling");
    expect((await admin(owner, "/orders/hd-b/hand-delivery", "POST", { notify: false })).status).toBe(201);
    expect(await statusOf("hd-b")).toBe("delivered");
    expect(await jobKeys("hd-b")).toEqual([]);
  });

  it("refuses marketplace orders, unpaid orders and orders with a live carrier shipment", async () => {
    await order("hd-ty", "paid", "trendyol");
    const ty = await admin(owner, "/orders/hd-ty/hand-delivery", "POST", {});
    expect(ty.status).toBe(409); expect((await j<any>(ty)).error.code).toBe("channel_managed");

    await order("hd-un", "awaiting_payment");
    expect((await j<any>(await admin(owner, "/orders/hd-un/hand-delivery", "POST", {}))).error.code).toBe("invalid_order_state");

    await order("hd-c", "fulfilling");
    await env.DB.prepare("INSERT INTO shipments (id, order_id, provider, carrier, tracking_number, status) VALUES ('hd-c-s','hd-c','geliver','SURAT','T1','created')").run();
    const c = await admin(owner, "/orders/hd-c/hand-delivery", "POST", {});
    expect(c.status).toBe(409); expect((await j<any>(c)).error.code).toBe("carrier_shipment_exists");
    // once that shipment is cancelled, handing over is allowed
    await env.DB.prepare("UPDATE shipments SET status = 'cancelled' WHERE id = 'hd-c-s'").run();
    expect((await admin(owner, "/orders/hd-c/hand-delivery", "POST", {})).status).toBe(201);
  });
});

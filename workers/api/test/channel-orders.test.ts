import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { admin, ensureOwner, j, type Session } from "./helpers";

let owner: Session;
const insertOrder = (id: string, source: string) => env.DB.prepare(
  `INSERT INTO orders (id, number, source, external_order_id, status, email, shipping_address, currency, subtotal, total, tracking_token, created_at, updated_at)
   VALUES (?1, ?2, ?3, ?4, 'paid', 'b@example.invalid', '{"name":"A","phone":"1","line1":"x","city":"y"}', 'TRY', 100, 100, ?1, unixepoch(), unixepoch())`,
).bind(id, `N-${id}`, source, source === "website" ? null : id).run();

beforeAll(async () => { owner = await ensureOwner(); });

describe("channel-managed orders", () => {
  it("rejects manual shipment and invoice for Trendyol orders with 409 channel_managed", async () => {
    await insertOrder("ch-ty-1", "trendyol");
    for (const path of ["shipment", "invoice"]) {
      const r = await admin(owner, `/orders/ch-ty-1/${path}`, "POST", path === "shipment" ? { serviceId: "x" } : {});
      expect(r.status).toBe(409);
      expect((await j<any>(r)).error.code).toBe("channel_managed");
    }
  });

  it("does not block website orders with the channel guard", async () => {
    await insertOrder("ch-web-1", "website");
    const r = await admin(owner, "/orders/ch-web-1/invoice", "POST", {});
    expect((await j<any>(r)).error?.code).not.toBe("channel_managed");
  });

  it("GET /trendyol/health aggregates mirrored orders and cargo coverage", async () => {
    await env.DB.prepare("INSERT OR IGNORE INTO shipments (id, order_id, provider, carrier, tracking_number, status) VALUES ('ch-sh-1','ch-ty-1','trendyol','TEX','T1','created')").run();
    await insertOrder("ch-ty-2", "trendyol");
    const h = await j<any>(await admin(owner, "/trendyol/health"));
    expect(h.orders.total).toBeGreaterThanOrEqual(2);
    expect(h.orders.withoutCargo).toBeGreaterThanOrEqual(1);
    expect(h.stock.truth).toBe("local");
    expect(Array.isArray(h.errors)).toBe(true);
  });
});

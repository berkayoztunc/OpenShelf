import { env } from "cloudflare:test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin, ensureOwner, j, type Session } from "./helpers";

let owner: Session;
let base: any; // numbers before this file inserts anything: other test files share the DB, so assertions are deltas
const now = () => Math.floor(Date.now() / 1000);
const order = (id: string, total: number, ageSec: number, o: { status?: string; source?: string; city?: string } = {}) => env.DB.prepare(
  `INSERT INTO orders (id, number, source, status, email, shipping_address, currency, subtotal, total, tracking_token, created_at, updated_at)
   VALUES (?1, ?1, ?2, ?3, 'x@example.invalid', ?4, 'TRY', ?5, ?5, ?1, ?6, ?6)`,
).bind(id, o.source ?? "website", o.status ?? "paid", JSON.stringify({ name: "A", city: o.city ?? "Izmir" }), total, now() - ageSec).run();
const H = 3600, D = 86400;

beforeAll(async () => {
  owner = await ensureOwner();
  base = await j<any>(await admin(owner, "/dashboard/insights?days=7"));
  await env.DB.prepare("INSERT INTO products (id, slug, name_tr, status, created_at, updated_at) VALUES ('di-p1','di-p1','Insight Vazo','active',unixepoch(),unixepoch())").run();
  await env.DB.prepare("INSERT INTO product_variants (id, product_id, sku, position, active) VALUES ('di-v1','di-p1','DI-1',0,1)").run();
  await env.DB.prepare("INSERT INTO inventory (variant_id, total, reserved, safety_stock) VALUES ('di-v1', 0, 0, 0)").run();
  await order("di-1", 10000, 1 * H); await order("di-2", 5000, 2 * D, { source: "trendyol", city: "Ankara" }); await order("di-3", 99900, 1 * H, { status: "pending" });
  await order("di-4", 7000, 1 * H, { status: "cancelled" }); await order("di-5", 4000, 10 * D); // previous period (7d window)
  await order("di-6", 88800, 1 * H); await env.DB.prepare("INSERT INTO payments (id, order_id, provider, status, amount, currency, is_mock) VALUES ('di-pay6','di-6','mock','succeeded',88800,'TRY',1)").run();
  await env.DB.prepare("INSERT INTO order_items (id, order_id, variant_id, sku, name, quantity, unit_price) VALUES ('di-i1','di-1','di-v1','DI-1','Insight Vazo',3,3000),('di-i2','di-2','di-v1','DI-1','Insight Vazo',1,5000),('di-i3','di-5','di-v1','DI-1','Insight Vazo',2,2000)").run();
});
afterAll(async () => {
  for (const q of ["DELETE FROM order_items WHERE id LIKE 'di-i%'", "DELETE FROM payments WHERE id LIKE 'di-pay%'", "DELETE FROM orders WHERE id LIKE 'di-%'", "DELETE FROM inventory WHERE variant_id = 'di-v1'", "DELETE FROM product_variants WHERE id = 'di-v1'", "DELETE FROM products WHERE id = 'di-p1'"]) await env.DB.prepare(q).run();
});

const d = (a: number, b: number) => a - b;
describe("GET /dashboard/insights", () => {
  it("counts paid-or-later real orders only, with previous-period comparison", async () => {
    const r = await j<any>(await admin(owner, "/dashboard/insights?days=7"));
    // pending, cancelled and mock-paid orders are excluded: only di-1 (100.00) and di-2 (50.00) count now, di-5 (40.00) before
    expect(d(r.kpis.revenue.cur, base.kpis.revenue.cur)).toBe(15000); expect(d(r.kpis.revenue.prev, base.kpis.revenue.prev)).toBe(4000);
    expect(d(r.kpis.orders.cur, base.kpis.orders.cur)).toBe(2); expect(d(r.kpis.orders.prev, base.kpis.orders.prev)).toBe(1);
    expect(d(r.kpis.units.cur, base.kpis.units.cur)).toBe(4); expect(d(r.kpis.units.prev, base.kpis.units.prev)).toBe(2);
    expect(r.series).toHaveLength(7); expect(r.previous).toHaveLength(7);
    const sum = (a: any[]) => a.reduce((n, x) => n + x.revenue, 0);
    expect(sum(r.series)).toBe(r.kpis.revenue.cur); expect(sum(r.previous)).toBe(r.kpis.revenue.prev);   // chart and KPI agree
    expect(r.kpis.aov.cur).toBe(Math.round(r.kpis.revenue.cur / r.kpis.orders.cur));
    expect(r.range).toMatchObject({ days: 7 }); expect(r.series[6].date).toBe(r.range.to);
  });
  it("splits channels and lists top products and cities", async () => {
    const r = await j<any>(await admin(owner, "/dashboard/insights?days=7"));
    expect(d(r.channels.website.revenue, base.channels.website.revenue)).toBe(10000); expect(d(r.channels.website.orders, base.channels.website.orders)).toBe(1);
    expect(d(r.channels.trendyol.revenue, base.channels.trendyol.revenue)).toBe(5000); expect(d(r.channels.trendyol.orders, base.channels.trendyol.orders)).toBe(1);
    expect(r.topProducts.find((p: any) => p.productId === "di-p1")).toMatchObject({ name: "Insight Vazo", units: 4, revenue: 14000 });
    expect(r.topCities.map((c: any) => c.city)).toEqual(expect.arrayContaining(["Izmir"]));
  });
  it("builds the work queue", async () => {
    const r = await j<any>(await admin(owner, "/dashboard/insights"));
    expect(r.attention.toShip).toBeGreaterThanOrEqual(2);      // di-1 (+ di-6) paid website orders without shipment
    expect(r.attention.awaitingPayment).toBeGreaterThanOrEqual(1);
    expect(r.attention.toInvoice).toBeGreaterThanOrEqual(2);
    expect(r.attention.outOfStock).toBeGreaterThanOrEqual(1);  // di-v1 has no stock
    expect(r.attention.noImage).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(r.activity)).toBe(true);
  });
  it("validates the range", async () => {
    expect((await admin(owner, "/dashboard/insights?days=5")).status).toBe(400);
    expect((await admin(owner, "/dashboard/insights?days=90")).status).toBe(200);
  });
});

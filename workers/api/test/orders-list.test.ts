import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { admin, ensureOwner, j, type Session } from "./helpers";

let owner: Session;
const ADDR = '{"name":"Ayşe","surname":"Yılmaz","phone":"5551112233","line1":"Atatürk Cad. 1","city":"Izmir","district":"Konak"}';
const order = (id: string, status: string, total: number, createdAt: string) => env.DB.prepare(
  `INSERT INTO orders (id, number, source, status, email, shipping_address, currency, subtotal, total, tracking_token, created_at, updated_at)
   VALUES (?1, ?2, 'website', ?3, ?1 || '@example.invalid', ?5, 'TRY', ?4, ?4, ?1, strftime('%s', ?6), strftime('%s', ?6))`,
).bind(id, `OL-${id}`, status, total, ADDR, createdAt).run();
const item = (orderId: string, sku: string, name: string, qty: number) => env.DB.prepare(
  "INSERT INTO order_items (id, order_id, sku, name, quantity, unit_price) VALUES (?1, ?2, ?3, ?4, ?5, 1000)",
).bind(`${orderId}-${sku}`, orderId, sku, name, qty).run();
const list = async (qs = "") => (await j<any>(await admin(owner, `/orders?pageSize=100&q=OL-${qs ? "&" + qs : ""}`))).items as any[];
const ids = (rows: any[]) => rows.map((r) => r.id).sort();

beforeAll(async () => {
  owner = await ensureOwner();
  await order("ol-a", "paid", 5000, "2026-03-01 10:00:00");
  await order("ol-b", "shipped", 12000, "2026-03-05 10:00:00");
  await order("ol-c", "pending", 800, "2026-03-09 10:00:00");
  await item("ol-a", "VAZ-1", "Seramik Vazo", 2); await item("ol-a", "KEN-9", "Keten Örtü", 1);
  await item("ol-b", "TAB-3", "Ahşap Tabak", 4);
  await env.DB.prepare("INSERT INTO payments (id, order_id, provider, status, amount, currency) VALUES ('ol-p-a','ol-a','iyzico','succeeded',5000,'TRY'),('ol-p-b','ol-b','iyzico','succeeded',12000,'TRY')").run();
  await env.DB.prepare("INSERT INTO shipments (id, order_id, provider, carrier, tracking_number, status) VALUES ('ol-s-b','ol-b','geliver','Yurtiçi','TRK123','in_transit')").run();
  await env.DB.prepare("INSERT INTO invoices (id, order_id, type, provider, number, status) VALUES ('ol-i-b','ol-b','e_arsiv','efaturam','EA-1','issued')").run();
});

describe("GET /orders list summary", () => {
  it("returns process summary fields for each order", async () => {
    const rows = await list();
    const a = rows.find((r) => r.id === "ol-a"); const b = rows.find((r) => r.id === "ol-b");
    expect(a).toMatchObject({ customerName: "Ayşe Yılmaz", city: "Izmir", itemCount: 3, lineCount: 2, payment: { status: "succeeded" }, shipment: null, invoice: null });
    expect(a.lines.map((l: any) => l.name)).toContain("Seramik Vazo");
    expect(b).toMatchObject({ itemCount: 4, shipment: { status: "in_transit", carrier: "Yurtiçi", trackingNumber: "TRK123" }, invoice: { status: "issued", number: "EA-1" } });
    expect(rows.find((r) => r.id === "ol-c")).toMatchObject({ payment: null, shipment: null, invoice: null });
  });

  it("filters by process state (payment / shipping / invoice, including none)", async () => {
    expect(ids(await list("payment=succeeded"))).toEqual(["ol-a", "ol-b"]);
    expect(ids(await list("payment=none"))).toEqual(["ol-c"]);
    expect(ids(await list("shipping=none"))).toEqual(["ol-a", "ol-c"]);
    expect(ids(await list("shipping=in_transit"))).toEqual(["ol-b"]);
    expect(ids(await list("invoice=none"))).toEqual(["ol-a", "ol-c"]);
    expect(ids(await list("payment=succeeded&shipping=none&invoice=none"))).toEqual(["ol-a"]);
  });

  it("filters by comma-separated status, date range and amount range", async () => {
    expect(ids(await list("status=paid,pending"))).toEqual(["ol-a", "ol-c"]);
    expect(ids(await list("from=2026-03-04&to=2026-03-09"))).toEqual(["ol-b", "ol-c"]);
    expect(ids(await list("minTotal=1000&maxTotal=6000"))).toEqual(["ol-a"]);
  });

  it("searches by customer name, product SKU/name and tracking number", async () => {
    const find = async (q: string) => ids((await j<any>(await admin(owner, `/orders?pageSize=100&q=${encodeURIComponent(q)}`))).items.filter((r: any) => r.id.startsWith("ol-")));
    expect(await find("Yılmaz")).toEqual(["ol-a", "ol-b", "ol-c"]);
    expect(await find("VAZ-1")).toEqual(["ol-a"]);
    expect(await find("Ahşap")).toEqual(["ol-b"]);
    expect(await find("TRK123")).toEqual(["ol-b"]);
  });

  it("rejects unknown filter values with 400", async () => {
    for (const qs of ["payment=bogus", "shipping=bogus", "invoice=bogus", "status=paid,bogus", "from=nope", "minTotal=-1"]) {
      expect((await admin(owner, `/orders?${qs}`)).status).toBe(400);
    }
  });

  it("GET /orders/counts groups by status and ignores the status filter", async () => {
    const r = await j<any>(await admin(owner, "/orders/counts?q=OL-&status=paid"));
    expect(r.byStatus).toMatchObject({ paid: 1, shipped: 1, pending: 1 });
    expect(r.total).toBe(3);
  });
});

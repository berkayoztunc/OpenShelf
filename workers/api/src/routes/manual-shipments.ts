/**
 * Shipments that are not tied to an order: gifts, extra or replacement items. The recipient comes from a customer, an earlier order or
 * is typed in; the label is bought from the shipping provider (Geliver) like an order shipment. Tracking runs in the same
 * `shipment.track` sweep as order shipments (see lib/shipmentTracking.ts), but never touches any order.
 */
import { Hono } from "hono";
import type { Context } from "hono";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { addresses, customers, manualShipments, orders, shipmentEvents } from "@openshelf/db";
import type { ShipmentInput, ShippingProvider, TrackingStatus } from "@openshelf/integration-sdk";
import { ManualShipmentBody, ManualShipmentQuoteBody, type ManualShipmentRecipient } from "@openshelf/shared";
import type { AppEnv } from "../env";
import { ApiError, body, likeEscape, notFound, paged, paging } from "../lib/http";
import { audit } from "../lib/audit";
import { requireRole } from "../middleware/auth";
import { hit } from "../middleware/security";
import { getAdapter, logIntegrationEvent } from "../lib/integrations";
import { SHIPPING_PROVIDER_IDS } from "../integrations/registry";
import { applyManualTracking } from "../lib/shipmentTracking";

export const adminManualShipments = new Hono<AppEnv>();

export const MANUAL_SHIPMENT_STATUSES = ["created", "in_transit", "delivered", "returned", "cancelled"];
/** Labels bought per admin per hour (real money; protects against loops and double clicks). */
const CREATE_LIMIT = 30;
type Db = AppEnv["Variables"]["db"];
type Row = typeof manualShipments.$inferSelect;

/** Short human reference, also sent as the provider's order number: MK-XXXXXX (no 0/O/1/I). */
export function newReference(): string {
  const abc = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"; const b = crypto.getRandomValues(new Uint8Array(6));
  return `MK-${[...b].map((x) => abc[x % abc.length]).join("")}`;
}

async function shippingAdapter(c: Context<AppEnv>) {
  for (const p of SHIPPING_PROVIDER_IDS) {
    const a = await getAdapter<ShippingProvider>(c.env, c.get("db"), p);
    if (a) return { pid: p, adapter: a.adapter };
  }
  throw new ApiError(503, "shipping_unavailable", "No shipping provider enabled");
}

const toInput = (reference: string, b: ManualShipmentQuoteBody & { contents?: string }): ShipmentInput => {
  const r = b.recipient;
  return {
    orderId: reference, ...(b.contents ? { contents: b.contents } : {}),
    recipient: { name: [r.name, r.surname].filter(Boolean).join(" "), phone: r.phone, ...(r.email ? { email: r.email } : {}), address: [r.line1, r.line2].filter(Boolean).join(" "), city: r.city, ...(r.district ? { district: r.district } : {}), ...(r.zip ? { zip: r.zip } : {}) },
    parcels: [{ weightKg: b.weightKg, ...(b.desi ? { desi: b.desi } : {}) }],
  };
};

const view = (r: Row) => ({ ...r, weightKg: r.weightGrams / 1000 });
const providerError = async (db: Db, pid: string, what: string, e: unknown) => {
  const reason = e instanceof Error ? e.message : String(e);
  await logIntegrationEvent(db, pid, "error", `${what}: ${reason}`.slice(0, 500)).catch(() => {});
  return new ApiError(502, "shipping_provider_error", `${what}: ${reason}`.slice(0, 300));
};

// ---------- address sources: customers (saved addresses) and earlier orders ----------
type Source = { source: "customer" | "order"; label: string; detail: string; customerId?: string; orderId?: string; recipient: ManualShipmentRecipient };
adminManualShipments.get("/manual-shipments/recipients", requireRole("staff"), async (c) => {
  const db = c.get("db"); const q = c.req.query("q")?.trim() ?? "";
  if (q.length < 2) return c.json({ items: [] });
  const l = `%${likeEscape(q)}%`;
  const custs = await db.select().from(customers)
    .where(and(sql`(${customers.email} LIKE ${l} ESCAPE '\\' OR ${customers.name} LIKE ${l} ESCAPE '\\' OR ${customers.surname} LIKE ${l} ESCAPE '\\' OR ${customers.phone} LIKE ${l} ESCAPE '\\')`, sql`${customers.anonymizedAt} IS NULL`))
    .orderBy(desc(customers.createdAt)).limit(8);
  const addrs = custs.length ? await db.select().from(addresses).where(inArray(addresses.customerId, custs.map((x) => x.id))) : [];
  const ords = await db.select({ id: orders.id, number: orders.number, email: orders.email, customerId: orders.customerId, a: orders.shippingAddress, createdAt: orders.createdAt }).from(orders)
    .where(sql`(${orders.number} LIKE ${l} ESCAPE '\\' OR ${orders.email} LIKE ${l} ESCAPE '\\' OR json_extract(${orders.shippingAddress}, '$.name') LIKE ${l} ESCAPE '\\'
      OR json_extract(${orders.shippingAddress}, '$.surname') LIKE ${l} ESCAPE '\\' OR json_extract(${orders.shippingAddress}, '$.phone') LIKE ${l} ESCAPE '\\')`)
    .orderBy(desc(orders.createdAt)).limit(8);
  const items: Source[] = [];
  const line = (r: ManualShipmentRecipient) => [r.line1, r.district, r.city].filter(Boolean).join(", ");
  for (const cu of custs) {
    for (const a of addrs.filter((x) => x.customerId === cu.id)) {
      const r: ManualShipmentRecipient = { name: a.name, phone: a.phone || cu.phone || "", ...(cu.email ? { email: cu.email } : {}), line1: a.line1, ...(a.line2 ? { line2: a.line2 } : {}), city: a.city, ...(a.district ? { district: a.district } : {}), ...(a.zip ? { zip: a.zip } : {}) };
      items.push({ source: "customer", customerId: cu.id, label: [cu.name, cu.surname].filter(Boolean).join(" ") || cu.email, detail: line(r), recipient: r });
    }
  }
  for (const o of ords) {
    const a = (o.a ?? {}) as Partial<Record<"name" | "surname" | "phone" | "line1" | "line2" | "city" | "district" | "zip", string>>;
    if (!a.line1 || !a.city) continue;
    const r: ManualShipmentRecipient = { name: a.name ?? "", ...(a.surname ? { surname: a.surname } : {}), phone: a.phone ?? "", ...(o.email ? { email: o.email } : {}), line1: a.line1, ...(a.line2 ? { line2: a.line2 } : {}), city: a.city, ...(a.district ? { district: a.district } : {}), ...(a.zip ? { zip: a.zip } : {}) };
    items.push({ source: "order", orderId: o.id, ...(o.customerId ? { customerId: o.customerId } : {}), label: `${o.number} · ${[a.name, a.surname].filter(Boolean).join(" ")}`, detail: line(r), recipient: r });
  }
  return c.json({ items: items.slice(0, 15) });
});

// ---------- list / read ----------
adminManualShipments.get("/manual-shipments", requireRole("staff"), async (c) => {
  const db = c.get("db"); const p = paging(c);
  const conds = [];
  const status = c.req.query("status"); const q = c.req.query("q")?.trim();
  if (status) { if (!MANUAL_SHIPMENT_STATUSES.includes(status)) throw new ApiError(400, "validation_error", "Unknown status"); conds.push(eq(manualShipments.status, status)); }
  else conds.push(sql`${manualShipments.status} <> 'creating'`);
  if (q) { const l = `%${likeEscape(q)}%`; conds.push(sql`(${manualShipments.reference} LIKE ${l} ESCAPE '\\' OR ${manualShipments.trackingNumber} LIKE ${l} ESCAPE '\\' OR ${manualShipments.recipient} LIKE ${l} ESCAPE '\\' OR ${manualShipments.contents} LIKE ${l} ESCAPE '\\')`); }
  const where = and(...conds);
  const rows = await db.select().from(manualShipments).where(where).orderBy(desc(manualShipments.createdAt)).limit(p.pageSize).offset(p.offset);
  const [t] = await db.select({ n: sql<number>`count(*)` }).from(manualShipments).where(where);
  return c.json(paged(rows.map(view), t?.n ?? 0, p));
});

adminManualShipments.get("/manual-shipments/:id", requireRole("staff"), async (c) => {
  const db = c.get("db");
  const [r] = await db.select().from(manualShipments).where(eq(manualShipments.id, c.req.param("id"))).limit(1);
  if (!r || r.status === "creating") throw notFound("Shipment");
  const events = await db.select().from(shipmentEvents).where(eq(shipmentEvents.shipmentId, r.id)).orderBy(desc(shipmentEvents.at), desc(shipmentEvents.id)).limit(50);
  return c.json({ ...view(r), events });
});

// ---------- offers / buy label ----------
adminManualShipments.post("/manual-shipments/quotes", requireRole("staff"), async (c) => {
  const b = await body(c, ManualShipmentQuoteBody);
  const { pid, adapter } = await shippingAdapter(c);
  let quotes;
  try { quotes = await adapter.quote(toInput("MK-QUOTE", b)); }
  catch (e) { throw await providerError(c.get("db"), pid, "Could not load shipping offers", e); }
  const seen = new Set<string>();
  const items = quotes.filter((q) => q.serviceId && !seen.has(q.serviceId) && seen.add(q.serviceId)).sort((x, y) => x.price - y.price);
  return c.json({ provider: pid, weightKg: b.weightKg, testMode: (adapter as { testMode?: boolean }).testMode === true, items });
});

adminManualShipments.post("/manual-shipments", requireRole("admin"), async (c) => {
  const b = await body(c, ManualShipmentBody); const db = c.get("db"); const adminId = c.get("admin")!.id;
  const rl = await hit(c.env.DB, `manual_shipment.create:${adminId}`, 3600);
  if (rl.count > CREATE_LIMIT) throw new ApiError(429, "rate_limited", "Too many shipments created; try again later");
  const { pid, adapter } = await shippingAdapter(c);
  // the row is reserved first (status "creating") so a crash between the label purchase and the save leaves a trace in the DB
  const id = crypto.randomUUID(); const reference = newReference();
  await db.insert(manualShipments).values({
    id, reference, status: "creating", recipient: b.recipient, contents: b.contents, note: b.note || null, customerId: b.customerId ?? null, orderId: b.orderId ?? null,
    weightGrams: Math.round(b.weightKg * 1000), desi: b.desi ?? null, provider: pid, serviceId: b.serviceId, createdBy: adminId,
  });
  let res;
  try { res = await adapter.createShipment(toInput(reference, b), b.serviceId); }
  catch (e) {
    await db.delete(manualShipments).where(eq(manualShipments.id, id));
    throw await providerError(db, pid, `Manual shipment ${reference} failed`, e);
  }
  await db.update(manualShipments).set({ status: "created", providerShipmentId: res.providerShipmentId, carrier: res.carrier ?? null, trackingNumber: res.trackingNumber ?? null, labelUrl: res.labelUrl ?? null, updatedAt: new Date() }).where(eq(manualShipments.id, id));
  await db.insert(shipmentEvents).values({ shipmentId: id, status: "created", detail: `Label bought (${b.serviceId})` });
  await audit(c, "manual_shipment.create", "manual_shipment", id, { reference, serviceId: b.serviceId, carrier: res.carrier ?? null });
  const [r] = await db.select().from(manualShipments).where(eq(manualShipments.id, id)).limit(1);
  return c.json(view(r!), 201);
});

// ---------- tracking / cancel ----------
async function loadOpen(db: Db, id: string) {
  const [r] = await db.select().from(manualShipments).where(eq(manualShipments.id, id)).limit(1);
  if (!r || r.status === "creating") throw notFound("Shipment");
  return r;
}

adminManualShipments.post("/manual-shipments/:id/refresh", requireRole("staff"), async (c) => {
  const db = c.get("db"); const r = await loadOpen(db, c.req.param("id"));
  if (!r.providerShipmentId) throw new ApiError(409, "invalid_state", "This shipment has no provider id");
  const { pid, adapter } = await shippingAdapter(c);
  let st: TrackingStatus;
  try { st = await adapter.track(r.providerShipmentId); }
  catch (e) { throw await providerError(db, pid, `Tracking ${r.reference} failed`, e); }
  await applyManualTracking(db, r, st);
  return c.json(view((await db.select().from(manualShipments).where(eq(manualShipments.id, r.id)).limit(1))[0]!));
});

adminManualShipments.post("/manual-shipments/:id/cancel", requireRole("admin"), async (c) => {
  const db = c.get("db"); const r = await loadOpen(db, c.req.param("id"));
  if (r.status !== "created") throw new ApiError(409, "invalid_state", "Only a shipment the carrier has not picked up yet can be cancelled");
  const { adapter } = await shippingAdapter(c);
  const ok = r.providerShipmentId ? (await adapter.cancel(r.providerShipmentId)).ok : true;
  if (!ok) throw new ApiError(502, "cancel_failed", "The shipping provider refused to cancel this shipment");
  await db.update(manualShipments).set({ status: "cancelled", updatedAt: new Date() }).where(eq(manualShipments.id, r.id));
  await db.insert(shipmentEvents).values({ shipmentId: r.id, status: "cancelled", detail: "Cancelled from the admin" });
  await audit(c, "manual_shipment.cancel", "manual_shipment", r.id, { reference: r.reference });
  return c.json(view({ ...r, status: "cancelled" }));
});

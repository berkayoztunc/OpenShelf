import { Hono } from "hono";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { addresses, auditLogs, customerConsents, customers, integrationConfigs, inventory, invoices, orderItems, orders, paymentEvents, payments, productVariants, products, refunds, shipments, utmAttributions } from "@openshelf/db";
import { InvalidTransitionError, enqueueJob, transitionOrder } from "@openshelf/core";
import type { PaymentProvider, ShippingProvider } from "@openshelf/integration-sdk";
import { ORDER_STATUSES, OrderStatusBody, RefundBody, ShipmentBody, type OrderStatus } from "@openshelf/shared";
import type { AppEnv } from "../env";
import { ApiError, body, likeEscape, notFound, paged, paging } from "../lib/http";
import { audit } from "../lib/audit";
import { requireRole } from "../middleware/auth";
import { getAdapter, isIntegrationEnabled, isMockModeFresh } from "../lib/integrations";
import { getSettings } from "../lib/settings";
import { INVOICING_PROVIDER_IDS, SHIPPING_PROVIDER_IDS } from "../integrations/registry";
import { availableOf } from "../lib/catalog";

export const adminOrders = new Hono<AppEnv>();

adminOrders.get("/orders", requireRole("staff"), async (c) => {
  const p = paging(c); const db = c.get("db");
  const conds = [];
  const status = c.req.query("status"); const source = c.req.query("source"); const q = c.req.query("q")?.trim();
  if (status) { if (!(ORDER_STATUSES as readonly string[]).includes(status)) throw new ApiError(400, "validation_error", "Unknown status"); conds.push(eq(orders.status, status)); }
  if (source) conds.push(eq(orders.source, source));
  if (q) { const l = `%${likeEscape(q)}%`; conds.push(sql`(${orders.number} LIKE ${l} ESCAPE '\\' OR ${orders.email} LIKE ${l} ESCAPE '\\')`); }
  const where = conds.length ? and(...conds) : undefined;
  const rows = await db.select().from(orders).where(where).orderBy(desc(orders.createdAt)).limit(p.pageSize).offset(p.offset);
  const [t] = await db.select({ n: sql<number>`count(*)` }).from(orders).where(where);
  const ids = rows.map((r) => r.id);
  const mockIds = new Set(ids.length ? (await db.select({ o: payments.orderId }).from(payments).where(and(inArray(payments.orderId, ids), eq(payments.isMock, true)))).map((r) => r.o) : []);
  return c.json(paged(rows.map(({ trackingToken: _t, ...o }) => ({ ...o, isMock: mockIds.has(o.id) })), t?.n ?? 0, p));
});

adminOrders.get("/orders/:id", requireRole("staff"), async (c) => {
  const db = c.get("db"); const id = c.req.param("id");
  const [o] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  if (!o) throw notFound("Order");
  const [items, pays, ships, invs, refs] = await Promise.all([
    db.select().from(orderItems).where(eq(orderItems.orderId, id)),
    db.select().from(payments).where(eq(payments.orderId, id)),
    db.select().from(shipments).where(eq(shipments.orderId, id)),
    db.select().from(invoices).where(eq(invoices.orderId, id)),
    db.select().from(refunds).where(eq(refunds.orderId, id)),
  ]);
  const payIds = pays.map((x) => x.id);
  const pe = payIds.length ? await db.select().from(paymentEvents).where(inArray(paymentEvents.paymentId, payIds)) : [];
  const au = await db.select().from(auditLogs).where(and(eq(auditLogs.entity, "order"), eq(auditLogs.entityId, id))).orderBy(desc(auditLogs.id)).limit(100);
  const events = [
    ...pe.map((e) => ({ at: e.at, type: `payment.${e.type}`, detail: e.payload })),
    ...au.map((e) => ({ at: e.at, type: e.action, detail: e.meta, adminId: e.adminId })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());
  const { trackingToken: _t, ...order } = o;
  return c.json({ ...order, isMock: pays.some((x) => x.isMock), items, payments: pays, shipments: ships, invoices: invs, refunds: refs, events });
});

adminOrders.post("/orders/:id/status", requireRole("staff"), async (c) => {
  const id = c.req.param("id"); const { status } = await body(c, OrderStatusBody);
  if (status === "paid" || status === "refunded") throw new ApiError(400, "use_payment_flow", `Status ${status} is set by the payment/refund flow`);
  try {
    const { from } = await transitionOrder(c.get("db"), id, status as OrderStatus);
    await audit(c, "order.status", "order", id, { from, to: status });
    return c.json({ id, status });
  } catch (e) {
    if (e instanceof InvalidTransitionError) throw new ApiError(409, "invalid_transition", e.message, { from: e.from, to: e.to });
    if (e instanceof Error && e.message === "order_not_found") throw notFound("Order");
    throw e;
  }
});

adminOrders.post("/orders/:id/refund", requireRole("admin"), async (c) => {
  const id = c.req.param("id"); const b = await body(c, RefundBody); const db = c.get("db");
  const [o] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  if (!o) throw notFound("Order");
  const [pay] = await db.select().from(payments).where(and(eq(payments.orderId, id), eq(payments.status, "succeeded"))).limit(1);
  if (!pay || !pay.providerTxId) throw new ApiError(409, "no_payment", "Order has no successful payment to refund");
  const mockNow = await isMockModeFresh(db);
  if (pay.isMock !== mockNow) {
    throw new ApiError(409, "mock_mismatch", pay.isMock
      ? "This payment was made in MOCK mode (no real money moved); it cannot be refunded while mock mode is off. Turn mock mode on to refund it."
      : "This is a REAL payment; it cannot be refunded while mock mode is on (the mock adapter would pretend to refund). Turn mock mode off first.");
  }
  const a = await getAdapter<PaymentProvider>(c.env, db, pay.provider as never);
  if (!a?.adapter.refund) throw new ApiError(501, "refund_unsupported", "Payment provider does not support refunds");
  const refundId = crypto.randomUUID();
  // Single conditional INSERT...SELECT: the cap check and the pending row are one atomic statement (no TOCTOU between concurrent refunds).
  const ins = await c.env.DB.prepare(
    `INSERT INTO refunds (id, payment_id, order_id, amount, reason, status, created_by, created_at)
     SELECT ?1, ?2, ?3, ?4, ?5, 'pending', ?6, unixepoch()
     WHERE COALESCE((SELECT SUM(amount) FROM refunds WHERE payment_id = ?2 AND status <> 'failed'), 0) + ?4 <= (SELECT amount FROM payments WHERE id = ?2)`)
    .bind(refundId, pay.id, id, b.amount, b.reason ?? null, c.get("admin")!.id).run();
  if (!ins.meta.changes) throw new ApiError(400, "refund_exceeds_payment", "Refund exceeds paid amount");
  const r = await a.adapter.refund({ providerTxId: pay.providerTxId, amount: b.amount, currency: pay.currency, reason: b.reason, ip: c.get("ip") }).catch((e: unknown) => ({ ok: false, detail: e instanceof Error ? e.message : "error" }) as { ok: boolean; refundId?: string; detail?: string });
  await db.update(refunds).set({ status: r.ok ? "succeeded" : "failed", providerRefundId: r.refundId ?? null }).where(eq(refunds.id, refundId));
  if (!r.ok) { await audit(c, "order.refund_failed", "order", id, { amount: b.amount }); throw new ApiError(502, "refund_failed", "Provider rejected the refund", { detail: r.detail }); }
  const [total] = await db.select({ s: sql<number>`COALESCE(SUM(amount),0)` }).from(refunds).where(and(eq(refunds.paymentId, pay.id), eq(refunds.status, "succeeded")));
  const full = (total?.s ?? 0) >= pay.amount;
  if (full) {
    await db.update(payments).set({ status: "refunded", updatedAt: new Date() }).where(eq(payments.id, pay.id));
    await transitionOrder(db, id, "refunded").catch(() => {});
  }
  await audit(c, "order.refund", "order", id, { amount: b.amount, full });
  return c.json({ id: refundId, ok: true, full });
});

adminOrders.post("/orders/:id/shipment", requireRole("staff"), async (c) => {
  const id = c.req.param("id"); const b = await body(c, ShipmentBody); const db = c.get("db");
  const [o] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  if (!o) throw notFound("Order");
  if (!["paid", "fulfilling"].includes(o.status)) throw new ApiError(409, "invalid_order_state", "Order must be paid before shipping");
  let a = null; let pid = "geliver";
  for (const p of SHIPPING_PROVIDER_IDS) { a = await getAdapter<ShippingProvider>(c.env, db, p); if (a) { pid = p; break; } }
  if (!a) throw new ApiError(503, "shipping_unavailable", "No shipping provider enabled");
  const addr = o.shippingAddress as { name: string; surname?: string; phone: string; line1: string; line2?: string; city: string; district?: string; zip?: string };
  const items = await db.select({ q: orderItems.quantity, w: productVariants.weightGrams }).from(orderItems).leftJoin(productVariants, eq(productVariants.id, orderItems.variantId)).where(eq(orderItems.orderId, id));
  const grams = items.reduce((s, i) => s + (i.w ?? 500) * i.q, 0);
  const res = await a.adapter.createShipment({ orderId: id, recipient: { name: [addr.name, addr.surname].filter(Boolean).join(" "), phone: addr.phone, email: o.email, address: [addr.line1, addr.line2].filter(Boolean).join(" "), city: addr.city, district: addr.district, zip: addr.zip }, parcels: [{ weightKg: Math.max(0.1, grams / 1000) }] }, b.serviceId);
  const sid = crypto.randomUUID();
  await db.insert(shipments).values({ id: sid, orderId: id, provider: pid, providerShipmentId: res.providerShipmentId, carrier: res.carrier ?? null, trackingNumber: res.trackingNumber ?? null, labelUrl: res.labelUrl ?? null, status: "created" });
  if (o.status === "paid") await transitionOrder(db, id, "fulfilling").catch(() => {});
  await audit(c, "order.shipment", "order", id, { shipmentId: sid, serviceId: b.serviceId });
  return c.json({ id: sid, ...res }, 201);
});

adminOrders.post("/orders/:id/invoice", requireRole("staff"), async (c) => {
  const id = c.req.param("id"); const db = c.get("db");
  const [o] = await db.select({ status: orders.status }).from(orders).where(eq(orders.id, id)).limit(1);
  if (!o) throw notFound("Order");
  if (["pending", "awaiting_payment", "cancelled"].includes(o.status)) throw new ApiError(409, "invalid_order_state", "Order is not paid");
  let on = false;
  for (const p of INVOICING_PROVIDER_IDS) if (await isIntegrationEnabled(c.env, db, p)) { on = true; break; }
  if (!on) throw new ApiError(503, "invoicing_unavailable", "No invoicing provider enabled");
  await enqueueJob(db, { kind: "invoice.issue", payload: { orderId: id }, dedupeKey: `invoice.issue:${id}` });
  await audit(c, "order.invoice", "order", id);
  return c.json({ queued: true }, 202);
});

// ---------- customers ----------
adminOrders.get("/customers", requireRole("staff"), async (c) => {
  const p = paging(c); const db = c.get("db"); const q = c.req.query("q")?.trim();
  const where = q ? sql`(${customers.email} LIKE ${`%${likeEscape(q)}%`} ESCAPE '\\' OR ${customers.name} LIKE ${`%${likeEscape(q)}%`} ESCAPE '\\')` : undefined;
  const rows = await db.select().from(customers).where(where).orderBy(desc(customers.createdAt)).limit(p.pageSize).offset(p.offset);
  const [t] = await db.select({ n: sql<number>`count(*)` }).from(customers).where(where);
  return c.json(paged(rows, t?.n ?? 0, p));
});
adminOrders.get("/customers/:id", requireRole("staff"), async (c) => {
  const db = c.get("db"); const id = c.req.param("id");
  const [cu] = await db.select().from(customers).where(eq(customers.id, id)).limit(1);
  if (!cu) throw notFound("Customer");
  const os = await db.select({ id: orders.id, number: orders.number, status: orders.status, total: orders.total, currency: orders.currency, createdAt: orders.createdAt }).from(orders).where(eq(orders.customerId, id)).orderBy(desc(orders.createdAt)).limit(100);
  const adds = await db.select().from(addresses).where(eq(addresses.customerId, id));
  return c.json({ ...cu, orders: os, addresses: adds });
});
/** KVKK: irreversible anonymization of personal data; order financial records are retained. */
adminOrders.post("/customers/:id/anonymize", requireRole("admin"), async (c) => {
  const db = c.get("db"); const id = c.req.param("id");
  const [cu] = await db.select().from(customers).where(eq(customers.id, id)).limit(1);
  if (!cu) throw notFound("Customer");
  const anon = `anonymized+${id.slice(0, 8)}@anonymized.invalid`;
  const os = await db.select({ id: orders.id }).from(orders).where(eq(orders.customerId, id));
  const oids = os.map((o) => o.id);
  const stmts: unknown[] = [
    db.update(customers).set({ email: anon, name: null, surname: null, phone: null, anonymizedAt: new Date() }).where(eq(customers.id, id)),
    db.delete(addresses).where(eq(addresses.customerId, id)),
    db.delete(customerConsents).where(eq(customerConsents.customerId, id)),
    db.update(orders).set({ email: anon, shippingAddress: { anonymized: true }, billingAddress: null, clientIp: null, userAgent: null, attribution: null, notes: null }).where(eq(orders.customerId, id)),
  ];
  if (oids.length) stmts.push(db.delete(utmAttributions).where(inArray(utmAttributions.orderId, oids)));
  await db.batch(stmts as never);
  await audit(c, "customer.anonymize", "customer", id, { orders: oids.length });
  return c.json({ ok: true });
});

// ---------- dashboard ----------
function startOfDay(now: Date, tz: string): Date {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(now);
    const g = (t: string) => Number(parts.find((p) => p.type === t)!.value);
    const sinceMidnightMs = ((g("hour") * 60 + g("minute")) * 60 + g("second")) * 1000 + now.getMilliseconds();
    return new Date(now.getTime() - sinceMidnightMs);
  } catch { const d = new Date(now); d.setUTCHours(0, 0, 0, 0); return d; }
}
adminOrders.get("/dashboard", requireRole("staff"), async (c) => {
  const db = c.get("db"); const now = new Date();
  const general = await getSettings(db, "general");
  const today = startOfDay(now, general.timezone);
  const week = new Date(today.getTime() - 6 * 86400_000);
  const isMockOrder = sql`EXISTS (SELECT 1 FROM payments p WHERE p.order_id = ${orders.id} AND p.is_mock = 1)`;
  // Revenue excludes orders paid through the mock provider (no real money); they are reported separately.
  const sales = async (since: Date, mock = false) => {
    const [r] = await db.select({ total: sql<number>`COALESCE(SUM(${orders.total}),0)`, count: sql<number>`count(*)` }).from(orders)
      .where(and(sql`${orders.createdAt} >= ${Math.floor(since.getTime() / 1000)}`, inArray(orders.status, ["paid", "fulfilling", "shipped", "delivered"]), mock ? isMockOrder : sql`NOT ${isMockOrder}`));
    return { total: r?.total ?? 0, count: r?.count ?? 0 };
  };
  const byStatus = await db.select({ s: orders.status, n: sql<number>`count(*)` }).from(orders).groupBy(orders.status);
  const ordersByStatus = Object.fromEntries(ORDER_STATUSES.map((s) => [s, 0])) as Record<string, number>;
  for (const r of byStatus) ordersByStatus[r.s] = r.n;
  const low = await db.select({ variantId: inventory.variantId, sku: productVariants.sku, name: products.nameTr, total: inventory.total, reserved: inventory.reserved, safetyStock: inventory.safetyStock })
    .from(inventory).innerJoin(productVariants, eq(productVariants.id, inventory.variantId)).innerJoin(products, eq(products.id, productVariants.productId))
    .where(and(eq(productVariants.active, true), sql`${inventory.total} - ${inventory.reserved} - ${inventory.safetyStock} <= 5`)).orderBy(sql`${inventory.total} - ${inventory.reserved} - ${inventory.safetyStock}`).limit(20);
  const cfgs = await db.select().from(integrationConfigs);
  const drift = await db.all<{ variant_id: string; sku: string; reserved: number; expected: number; total: number }>(sql`
    SELECT i.variant_id, v.sku, i.reserved, i.total,
      COALESCE((SELECT SUM(r.quantity) FROM inventory_reservations r WHERE r.variant_id = i.variant_id AND r.status = 'active'), 0) AS expected
    FROM inventory i JOIN product_variants v ON v.id = i.variant_id
    WHERE i.reserved != COALESCE((SELECT SUM(r.quantity) FROM inventory_reservations r WHERE r.variant_id = i.variant_id AND r.status = 'active'), 0) OR i.total < 0 OR i.reserved < 0 LIMIT 50`);
  return c.json({
    salesToday: await sales(today), salesWeek: await sales(week), mockSalesWeek: await sales(week, true), mockMode: await isMockModeFresh(db),
    originNotice: c.get("derivedWorkersDev") === true ? "derived_origins_workers_dev" : null, ordersByStatus,
    lowStock: low.map((l) => ({ ...l, available: availableOf(l) })),
    integrationHealth: cfgs.map((r) => ({ provider: r.provider, enabled: r.enabled, ok: r.lastHealthOk, detail: r.lastHealthDetail, at: r.lastHealthAt })),
    stockDrift: drift.map((d) => ({ variantId: d.variant_id, sku: d.sku, reserved: d.reserved, expectedReserved: d.expected, total: d.total })),
  });
});

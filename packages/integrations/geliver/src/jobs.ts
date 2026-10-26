import { and, eq } from "drizzle-orm";
import { orders, orderItems, shipments, shipmentEvents } from "@openshelf/db";
import type { ShipmentInput, ShippingProvider } from "@openshelf/integration-sdk";

export type JobHandler = (
  job: { id: string; kind: string; payload: any; attempts: number },
  ctx: { db: any; env: any; getAdapter: (id: string) => Promise<any>; log: (level: string, msg: string, meta?: any) => Promise<void> },
) => Promise<void>;

export interface ShipmentRepo {
  loadOrder(orderId: string): Promise<{ input: ShipmentInput; currency: string; total: number } | null>;
  findShipment(orderId: string): Promise<{ id: string } | null>;
  saveShipment(orderId: string, r: { providerShipmentId: string; carrier?: string; trackingNumber?: string; labelUrl?: string }): Promise<void>;
}

/** Order shipping address JSON is assumed to follow addresses columns: name, phone, line1, line2, city, district, zip. */
export function drizzleShipmentRepo(db: any): ShipmentRepo {
  return {
    async loadOrder(orderId) {
      const [o] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
      if (!o) return null;
      const items = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
      const a = (o.shippingAddress ?? {}) as Record<string, string | undefined>;
      void items;
      return {
        currency: o.currency, total: o.total,
        input: {
          orderId,
          recipient: { name: a.name ?? "", phone: a.phone ?? "", email: o.email, address: [a.line1, a.line2].filter(Boolean).join(" "), city: a.city ?? "", district: a.district, zip: a.zip },
          parcels: [{ weightKg: 1 }],
        },
      };
    },
    async findShipment(orderId) {
      const [s] = await db.select({ id: shipments.id }).from(shipments).where(and(eq(shipments.orderId, orderId), eq(shipments.provider, "geliver"))).limit(1);
      return s ?? null;
    },
    async saveShipment(orderId, r) {
      const [row] = await db.insert(shipments).values({
        id: crypto.randomUUID(), orderId, provider: "geliver", providerShipmentId: r.providerShipmentId, carrier: r.carrier, trackingNumber: r.trackingNumber, labelUrl: r.labelUrl, status: "created",
      }).returning({ id: shipments.id });
      if (row) await db.insert(shipmentEvents).values({ shipmentId: row.id, status: "created", detail: "label purchased via geliver" });
    },
  };
}

/** payload: { orderId: string; serviceId?: string }. Idempotent per order (skips when a geliver shipment exists). */
export function createShipmentHandler(repoFor: (db: any) => ShipmentRepo = drizzleShipmentRepo): JobHandler {
  return async (job, ctx) => {
    const orderId = job.payload?.orderId as string | undefined;
    if (!orderId) throw new Error("shipment.create: payload.orderId missing");
    const repo = repoFor(ctx.db);
    if (await repo.findShipment(orderId)) { await ctx.log("info", "shipment.create skipped (exists)", { orderId }); return; }
    const data = await repo.loadOrder(orderId);
    if (!data) throw new Error(`shipment.create: order ${orderId} not found`);
    const adapter = (await ctx.getAdapter("geliver")) as ShippingProvider;
    let serviceId = job.payload?.serviceId as string | undefined;
    if (!serviceId) {
      const quotes = await adapter.quote(data.input);
      const cheapest = [...quotes].sort((a, b) => a.price - b.price)[0];
      if (!cheapest) throw new Error("shipment.create: no quotes");
      serviceId = cheapest.serviceId;
    }
    const res = await adapter.createShipment(data.input, serviceId);
    await repo.saveShipment(orderId, res);
    await ctx.log("info", "shipment created", { orderId, providerShipmentId: res.providerShipmentId });
  };
}

export const jobHandlers: Record<string, JobHandler> = { "shipment.create": createShipmentHandler() };

import { and, asc, eq } from "drizzle-orm";
import { orders, orderItems, invoices, invoiceEvents, payments, shipments, storeSettings } from "@openshelf/db";
import type { InvoiceInput, InvoicingProvider } from "@openshelf/integration-sdk";
import { orderInvoiceLines } from "@openshelf/shared";

export type JobHandler = (
  job: { id: string; kind: string; payload: any; attempts: number },
  ctx: { db: any; env: any; getAdapter: (id: string) => Promise<any>; log: (level: string, msg: string, meta?: any) => Promise<void> },
) => Promise<void>;

export type InvoiceRow = { id: string; status: string };
export interface InvoiceRepo {
  /** Order channel ("website" | "trendyol" ...). Marketplace orders are shipped/invoiced by the marketplace. */
  sourceOf?(orderId: string): Promise<string | undefined>;
  loadOrder(orderId: string): Promise<InvoiceInput | null>;
  /** INSERT ... ON CONFLICT(order_id,type) DO NOTHING, then return the (possibly pre-existing) row. */
  claim(orderId: string, type: "e_fatura" | "e_arsiv"): Promise<InvoiceRow>;
  markIssued(id: string, r: { providerInvoiceId: string; number?: string; pdfUrl?: string }): Promise<void>;
  event(id: string, type: string, detail?: string): Promise<void>;
}

/** Payment providers by the name printed as "ödeme aracısı". */
const PAYMENT_AGENTS: Record<string, string> = { iyzico: "iyzico", paytr: "PayTR", stripe: "Stripe" };
/** Shipments that do not go through a carrier (no carrier on the invoice). */
const NO_CARRIER = new Set(["hand"]);

/**
 * Internet sale details of a website order: the succeeded payment (date, provider) and the first shipment (date, carrier),
 * plus the address the store runs on. Undefined when the order has no succeeded payment (then it was not paid online).
 */
export async function loadOnlineSale(db: any, orderId: string): Promise<InvoiceInput["onlineSale"]> {
  const pays = await db.select({ provider: payments.provider, status: payments.status, at: payments.updatedAt, created: payments.createdAt }).from(payments).where(eq(payments.orderId, orderId));
  const pay = pays.find((p: any) => p.status === "succeeded" || p.status === "refunded");
  if (!pay) return undefined;
  const [ship] = await db.select({ provider: shipments.provider, carrier: shipments.carrier, at: shipments.createdAt }).from(shipments).where(eq(shipments.orderId, orderId)).orderBy(asc(shipments.createdAt)).limit(1);
  const [origin] = await db.select({ value: storeSettings.value }).from(storeSettings).where(eq(storeSettings.group, "_runtime_origin")).limit(1);
  const iso = (d: unknown) => (d instanceof Date ? d : new Date(typeof d === "number" ? d * 1000 : String(d))).toISOString();
  const url = typeof origin?.value === "string" ? origin.value : undefined;
  return {
    ...(url && /^https:\/\//.test(url) ? { siteOrigin: url.replace(/\/+$/, "") } : {}),
    paymentDate: iso(pay.at ?? pay.created), paymentMeans: "CREDIT_CARD",
    ...(PAYMENT_AGENTS[pay.provider] ? { paymentAgentName: PAYMENT_AGENTS[pay.provider] } : {}),
    ...(ship && !NO_CARRIER.has(ship.provider) ? { shipment: { sentAt: iso(ship.at), ...(ship.carrier ? { carrier: ship.carrier } : {}) } } : {}),
  };
}

/**
 * Assumptions: order.billingAddress ?? shippingAddress JSON follows addresses columns (name,line1,line2,city,taxId,taxOffice,isCompany);
 * order_items.unitPrice is minor units (KDV-inclusive or exclusive: derived from the order's totals); taxRate is a percent (e.g. 20).
 */
export function drizzleInvoiceRepo(db: any): InvoiceRepo {
  return {
    async sourceOf(orderId) { const [o] = await db.select({ source: orders.source }).from(orders).where(eq(orders.id, orderId)).limit(1); return o?.source; },
    async loadOrder(orderId) {
      const [o] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
      if (!o) return null;
      const items = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
      const a = ((o.billingAddress ?? o.shippingAddress) ?? {}) as Record<string, any>;
      // KDV-inclusive lines that add up to exactly what the customer paid, whether the store priced its items with or without KDV
      const lines: InvoiceInput["lines"] = orderInvoiceLines(o, items.map((i: any) => ({ name: i.name, quantity: i.quantity, unitPrice: i.unitPrice, taxRate: i.taxRate })));
      return {
        orderId, orderNumber: o.number, issuedAt: new Date().toISOString(), currency: o.currency, lines, onlineSale: await loadOnlineSale(db, orderId),
        customer: {
          name: a.isCompany ? (a.name ?? "") : [a.name, a.surname].filter(Boolean).join(" "), email: o.email, taxId: a.taxId ?? undefined, taxOffice: a.taxOffice ?? undefined,
          address: [a.line1, a.line2].filter(Boolean).join(" "), city: a.city ?? "", district: a.district || undefined, postalCode: a.zip || undefined, phone: a.phone || undefined,
          isCompany: !!a.isCompany,
        },
      };
    },
    async claim(orderId, type) {
      await db.insert(invoices).values({ id: crypto.randomUUID(), orderId, type, provider: "efaturam", status: "pending" }).onConflictDoNothing();
      const [row] = await db.select({ id: invoices.id, status: invoices.status }).from(invoices).where(and(eq(invoices.orderId, orderId), eq(invoices.type, type))).limit(1);
      return row;
    },
    async markIssued(id, r) {
      await db.update(invoices).set({ status: "issued", providerInvoiceId: r.providerInvoiceId, number: r.number, pdfUrl: r.pdfUrl }).where(eq(invoices.id, id));
    },
    async event(id, type, detail) { await db.insert(invoiceEvents).values({ invoiceId: id, type, detail }); },
  };
}

/** payload: { orderId }. Idempotent on unique (order_id,type) + provider idempotency key `${orderId}:${type}`. Throws on failure so outbox retries. */
export function invoiceIssueHandler(repoFor: (db: any) => InvoiceRepo = drizzleInvoiceRepo): JobHandler {
  return async (job, ctx) => {
    const orderId = job.payload?.orderId as string | undefined;
    if (!orderId) throw new Error("invoice.issue: payload.orderId missing");
    const repo = repoFor(ctx.db);
    const src = await repo.sourceOf?.(orderId);
    if (src && src !== "website") { await ctx.log("info", "invoice.issue skipped (channel-managed order)", { orderId, source: src }); return; }
    const input = await repo.loadOrder(orderId);
    if (!input) throw new Error(`invoice.issue: order ${orderId} not found`);
    const adapter = (await ctx.getAdapter("efaturam")) as InvoicingProvider & { resolveInvoiceType(i: InvoiceInput): Promise<"e_fatura" | "e_arsiv"> };
    const type = await adapter.resolveInvoiceType(input);
    const row = await repo.claim(orderId, type);
    if (row.status === "issued") { await ctx.log("info", "invoice.issue skipped (already issued)", { orderId, type }); return; }
    try {
      const res = await adapter.issue(input, `${orderId}:${type}`);
      await repo.markIssued(row.id, res);
      await repo.event(row.id, "issued", res.number);
    } catch (e) {
      await repo.event(row.id, "failed", (e as Error).message.slice(0, 500));
      throw e;
    }
  };
}

export const jobHandlers: Record<string, JobHandler> = { "invoice.issue": invoiceIssueHandler() };

import { and, eq } from "drizzle-orm";
import { orders, orderItems, invoices, invoiceEvents } from "@openshelf/db";
import type { InvoiceInput, InvoicingProvider } from "@openshelf/integration-sdk";

export type JobHandler = (
  job: { id: string; kind: string; payload: any; attempts: number },
  ctx: { db: any; env: any; getAdapter: (id: string) => Promise<any>; log: (level: string, msg: string, meta?: any) => Promise<void> },
) => Promise<void>;

export type InvoiceRow = { id: string; status: string };
export interface InvoiceRepo {
  loadOrder(orderId: string): Promise<InvoiceInput | null>;
  /** INSERT ... ON CONFLICT(order_id,type) DO NOTHING, then return the (possibly pre-existing) row. */
  claim(orderId: string, type: "e_fatura" | "e_arsiv"): Promise<InvoiceRow>;
  markIssued(id: string, r: { providerInvoiceId: string; number?: string; pdfUrl?: string }): Promise<void>;
  event(id: string, type: string, detail?: string): Promise<void>;
}

/**
 * Assumptions: order.billingAddress ?? shippingAddress JSON follows addresses columns (name,line1,line2,city,taxId,taxOffice,isCompany);
 * order_items.unitPrice is minor units, KDV-inclusive; taxRate is a percent (e.g. 20).
 */
export function drizzleInvoiceRepo(db: any): InvoiceRepo {
  return {
    async loadOrder(orderId) {
      const [o] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
      if (!o) return null;
      const items = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
      const a = ((o.billingAddress ?? o.shippingAddress) ?? {}) as Record<string, any>;
      const lines: InvoiceInput["lines"] = items.map((i: any) => ({ name: i.name, quantity: i.quantity, unitPrice: i.unitPrice, taxRate: i.taxRate }));
      const rate = lines[0]?.taxRate ?? 20;
      if (o.shippingTotal > 0) lines.push({ name: "Kargo", quantity: 1, unitPrice: o.shippingTotal, taxRate: rate });
      if (o.discountTotal > 0) lines.push({ name: "İndirim", quantity: 1, unitPrice: -o.discountTotal, taxRate: rate });
      return {
        orderId, orderNumber: o.number, issuedAt: new Date().toISOString(), currency: o.currency, lines,
        customer: { name: a.name ?? "", email: o.email, taxId: a.taxId ?? undefined, taxOffice: a.taxOffice ?? undefined, address: [a.line1, a.line2].filter(Boolean).join(" "), city: a.city ?? "", isCompany: !!a.isCompany },
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

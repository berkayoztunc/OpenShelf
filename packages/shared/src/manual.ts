import { z } from "zod";

const minor = z.number().int().min(0).max(1_000_000_000);
export const ManualInvoiceLine = z.object({
  variantId: z.string().optional(),            // set when picked from the catalog (informational)
  sku: z.string().max(80).optional(),
  name: z.string().min(1).max(200),
  quantity: z.number().positive().max(100000),
  unitPrice: minor,                            // minor units, editable per line
  taxRate: z.number().min(0).max(100).default(20),
  discount: minor.default(0),                  // absolute line discount, minor units
});
export type ManualInvoiceLine = z.infer<typeof ManualInvoiceLine>;

export const ManualInvoiceCustomer = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().optional().or(z.literal("")),
  taxId: z.string().regex(/^\d{10,11}$/, "VKN (10) or TCKN (11)").optional().or(z.literal("")),
  taxOffice: z.string().max(120).optional().or(z.literal("")),
  address: z.string().min(3).max(400),
  city: z.string().min(2).max(80),
  district: z.string().max(100).optional().or(z.literal("")),   // ilçe; e-Arşiv wants it (taken from the linked order when empty)
  postalCode: z.string().max(20).optional().or(z.literal("")),
  phone: z.string().max(30).optional().or(z.literal("")),
  isCompany: z.boolean().default(false),
});

export const ManualInvoiceBody = z.object({
  customer: ManualInvoiceCustomer,
  lines: z.array(ManualInvoiceLine).min(1).max(100),
  pricesIncludeTax: z.boolean().default(true),
  currency: z.string().length(3).default("TRY"),
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes: z.string().max(1000).optional().or(z.literal("")),
  orderId: z.string().optional(),
});
export type ManualInvoiceBody = z.infer<typeof ManualInvoiceBody>;

/** Shared money math so UI preview == server totals. All values minor units; rounding half-up per line. */
export function computeInvoiceTotals(lines: ManualInvoiceLine[], pricesIncludeTax: boolean) {
  let net = 0, tax = 0;
  const out = lines.map((l) => {
    const gross = Math.round(l.unitPrice * l.quantity) - l.discount;
    const lineNet = pricesIncludeTax ? Math.round(gross / (1 + l.taxRate / 100)) : gross;
    const lineTax = pricesIncludeTax ? gross - lineNet : Math.round(gross * l.taxRate / 100);
    net += lineNet; tax += lineTax;
    return { net: lineNet, tax: lineTax, total: lineNet + lineTax };
  });
  return { lines: out, net, tax, total: net + tax };
}

/**
 * Were the item prices of this order KDV-INCLUSIVE? Orders do not store the store setting that applied when they were placed, but the
 * totals give it away: inclusive orders total exactly `subtotal - discount + shipping`; exclusive ones add the item KDV on top.
 * Reading it from the order keeps old orders right even after the store setting is changed.
 */
export function orderPricesIncludeTax(o: { subtotal: number; discountTotal: number; shippingTotal: number; total: number }): boolean {
  return Math.abs(o.total - (o.subtotal - o.discountTotal + o.shippingTotal)) <= 1;
}

export interface OrderInvoiceLine { name: string; quantity: number; unitPrice: number; taxRate: number }
/**
 * The lines an invoice provider needs for an order, as KDV-INCLUSIVE minor units that add up to EXACTLY what the customer paid:
 *  - items: inclusive prices as they are, or (exclusive orders) price x (1 + KDV) per line
 *  - shipping: its own line, always inclusive (the order charges it as a final amount), at the first item's KDV rate
 *  - discount: a negative line equal to whatever makes items + shipping equal the order total, so no kuruş is lost to rounding
 */
export function orderInvoiceLines(
  o: { subtotal: number; discountTotal: number; shippingTotal: number; total: number },
  items: { name: string; quantity: number; unitPrice: number; taxRate: number }[],
  labels: { shipping: string; discount: string } = { shipping: "Kargo", discount: "İndirim" },
): OrderInvoiceLine[] {
  const incl = orderPricesIncludeTax(o);
  const lines: OrderInvoiceLine[] = items.map((i) => {
    const gross = incl ? i.unitPrice * i.quantity : Math.round(i.unitPrice * i.quantity * (1 + i.taxRate / 100));
    if (incl || (Number.isInteger(i.quantity) && i.quantity > 0 && gross % i.quantity === 0)) return { name: i.name, quantity: i.quantity, unitPrice: incl ? i.unitPrice : gross / i.quantity, taxRate: i.taxRate };
    return { name: i.quantity === 1 ? i.name : `${i.name} (${i.quantity} x)`.slice(0, 200), quantity: 1, unitPrice: gross, taxRate: i.taxRate };
  });
  const itemsGross = lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
  const rate = items[0]?.taxRate ?? 20;
  if (o.shippingTotal > 0) lines.push({ name: labels.shipping, quantity: 1, unitPrice: o.shippingTotal, taxRate: rate });
  const discount = itemsGross + Math.max(0, o.shippingTotal) - o.total;
  if (discount > 0) lines.push({ name: labels.discount, quantity: 1, unitPrice: -discount, taxRate: rate });
  return lines;
}

const emailAddr = z.string().email().max(254).refine((v) => !/[\r\n<>",;]/.test(v), "invalid address");
export const ComposeEmailBody = z.object({
  to: emailAddr,
  cc: emailAddr.optional().or(z.literal("")),
  replyTo: emailAddr.optional().or(z.literal("")),
  subject: z.string().min(1).max(200).refine((v) => !/[\r\n]/.test(v), "no line breaks in subject"),
  body: z.string().min(1).max(20000),          // plain text / light markdown; HTML is generated server-side (escaped)
  orderId: z.string().optional(),
  customerId: z.string().optional(),
  manualInvoiceId: z.string().optional(),      // appends the invoice PDF link when issued
});
export type ComposeEmailBody = z.infer<typeof ComposeEmailBody>;

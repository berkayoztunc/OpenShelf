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

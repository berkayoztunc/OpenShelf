import { toMajor } from "./format";
import { tNow } from "../i18n";
import { emptyLine } from "./invoices";
import type { InvoiceForm, LineForm } from "./invoices";

/** Raw GET /api/admin/orders/:id shape (the admin `OrderDetail` adapter drops billing address, notes and tax rates). */
export interface RawAddress { name?: string; surname?: string; phone?: string; line1?: string; line2?: string; city?: string; district?: string; zip?: string; country?: string; taxId?: string; taxOffice?: string; isCompany?: boolean; identityNumber?: string }
export interface RawOrder {
  id: string; number: string; source: string; status: string; email?: string; createdAt: string | number; currency: string;
  shippingAddress?: RawAddress; billingAddress?: RawAddress | null; notes?: string | null;
  subtotal: number; discountTotal: number; shippingTotal: number; taxTotal: number; total: number; couponCode?: string | null;
  items: { id: string; sku: string; name: string; quantity: number; unitPrice: number; taxRate?: number; variantId?: string | null }[];
  payments: { id: string; provider: string; status: string; amount: number; isMock?: boolean }[];
  shipments: { id: string; carrier?: string | null; trackingNumber?: string | null; status: string; labelUrl?: string | null }[];
  invoices: { id: string; type: string; number?: string | null; status: string; pdfUrl?: string | null; createdAt?: string | number }[];
}

export const fullName = (a?: RawAddress | null) => [a?.name, a?.surname].filter(Boolean).join(" ");
export const streetOf = (a?: RawAddress | null) => [a?.line1, a?.line2].filter(Boolean).join(" ");

/** Spread the order-level discount over item lines proportionally (remainder on the last item); shipping is not discounted. */
export interface OrderLine { name: string; sku?: string | undefined; variantId?: string | undefined; quantity: number; unitPrice: number; taxRate: number; discount: number }
export function orderInvoiceLines(o: RawOrder, defaultRate: number): OrderLine[] {
  const rate = (r?: number) => (r && r > 0 ? r : defaultRate);
  const lines: OrderLine[] = o.items.map((i) => ({ name: i.name, sku: i.sku, variantId: i.variantId ?? undefined, quantity: i.quantity, unitPrice: i.unitPrice, taxRate: rate(i.taxRate), discount: 0 }));
  const gross = lines.map((l) => l.unitPrice * l.quantity);
  const sum = gross.reduce((a, b) => a + b, 0);
  if (o.discountTotal > 0 && sum > 0) {
    let left = Math.min(o.discountTotal, sum);
    lines.forEach((l, i) => { const d = i === lines.length - 1 ? left : Math.min(left, Math.round((o.discountTotal * gross[i]!) / sum)); l.discount = d; left -= d; });
  }
  if (o.shippingTotal > 0) lines.push({ name: tNow("print.shippingLine"), sku: undefined, variantId: undefined, quantity: 1, unitPrice: o.shippingTotal, taxRate: defaultRate, discount: 0 });
  return lines;
}

/** Prefill a manual invoice from an order: billing (or shipping) address as customer + items (+ shipping) as lines, linked by orderId. */
export function orderToForm(o: RawOrder, defaultRate: number): InvoiceForm {
  const a = o.billingAddress ?? o.shippingAddress ?? {};
  const lines: LineForm[] = orderInvoiceLines(o, defaultRate).map((l) => emptyLine({
    variantId: l.variantId, sku: l.sku, name: l.name, quantity: String(l.quantity), price: toMajor(l.unitPrice), taxRate: String(l.taxRate), discount: toMajor(l.discount),
  }));
  return {
    customer: {
      name: a.isCompany && a.name && !a.surname ? a.name : fullName(a) || o.email || "", email: o.email ?? "", phone: a.phone, address: [a.line1, a.line2, a.district].filter(Boolean).join(" "), city: a.city ?? "",
      taxId: a.taxId ?? "", taxOffice: a.taxOffice ?? "", isCompany: !!a.isCompany,
    },
    lines, pricesIncludeTax: true, currency: o.currency, issueDate: "", notes: tNow("invoices.fromOrderNote", { number: o.number }), orderId: o.id,
  };
}

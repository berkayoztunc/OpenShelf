import { computeInvoiceTotals } from "@openshelf/shared";
import type { ManualInvoiceBody, ManualInvoiceLine } from "@openshelf/shared";
import { ApiError } from "./api";
import { toMajor } from "./format";
import { hasKey, tNow } from "../i18n";

export type InvoiceStatus = "draft" | "issuing" | "issued" | "failed" | "cancelling" | "cancelled";
export const INVOICE_STATUSES: InvoiceStatus[] = ["draft", "issued", "failed", "cancelled"];

export interface LineForm { key: string; variantId?: string; sku?: string; name: string; quantity: string; price: string; taxRate: string; discount: string }
export interface CustomerForm { name: string; email: string; phone?: string; taxId: string; taxOffice: string; address: string; city: string; isCompany: boolean }
export interface InvoiceForm { customer: CustomerForm; lines: LineForm[]; pricesIncludeTax: boolean; currency: string; issueDate: string; notes: string; orderId?: string }

export interface InvoiceRow {
  id: string; status: InvoiceStatus; type: "e_fatura" | "e_arsiv" | null; number: string | null; customerName: string; total: number; taxTotal: number; currency: string;
  orderId: string | null; pdfUrl: string | null; createdAt: string; issuedAt: string | null;
}
export interface InvoiceFull extends Omit<InvoiceRow, "customerName"> {
  customer: { name: string; email?: string; taxId?: string; taxOffice?: string; address: string; city: string; isCompany: boolean };
  lines: ManualInvoiceLine[]; pricesIncludeTax: boolean; issueDate: string | null; notes: string | null; provider: string | null; error: string | null;
  computed: { lines: { net: number; tax: number; total: number }[]; net: number; tax: number; total: number };
}
export interface InvoicePreview {
  lines: { name: string; quantity: number; unitPrice: number; taxRate: number; discount: number; net: number; tax: number; total: number }[];
  net: number; taxTotal: number; total: number; currency: string; pricesIncludeTax: boolean; type: "e_fatura" | "e_arsiv"; typeSource: "provider" | "rule";
  warnings: { code: string; message: string; line?: number }[];
}

let n = 0;
export const newKey = () => `l${Date.now().toString(36)}${(n++).toString(36)}`;
export const emptyLine = (p: Partial<LineForm> = {}): LineForm => ({ key: newKey(), name: "", quantity: "1", price: "0.00", taxRate: "20", discount: "0.00", ...p });
export const emptyCustomer = (): CustomerForm => ({ name: "", email: "", taxId: "", taxOffice: "", address: "", city: "", isCompany: false });
export const emptyForm = (defaults: { currency?: string; pricesIncludeTax?: boolean } = {}): InvoiceForm => ({
  customer: emptyCustomer(), lines: [], pricesIncludeTax: defaults.pricesIncludeTax ?? true, currency: defaults.currency ?? "TRY", issueDate: "", notes: "",
});

/** Lenient decimal parse that accepts "12,50". */
export const num = (s: string): number => { const v = Number(String(s).trim().replace(",", ".")); return Number.isFinite(v) ? v : 0; };
const minor = (s: string): number => Math.max(0, Math.round(num(s) * 100));

export function lineToApi(l: LineForm): ManualInvoiceLine {
  return {
    ...(l.variantId ? { variantId: l.variantId } : {}), ...(l.sku ? { sku: l.sku } : {}),
    name: l.name.trim(), quantity: num(l.quantity), unitPrice: minor(l.price), taxRate: Math.min(100, Math.max(0, num(l.taxRate))), discount: minor(l.discount),
  };
}
export function formToBody(f: InvoiceForm): ManualInvoiceBody {
  const c = f.customer;
  return {
    customer: { name: c.name.trim(), email: c.email.trim(), taxId: c.taxId.trim(), taxOffice: c.taxOffice.trim(), address: c.address.trim(), city: c.city.trim(), isCompany: c.isCompany },
    lines: f.lines.map(lineToApi), pricesIncludeTax: f.pricesIncludeTax, currency: f.currency.toUpperCase(),
    ...(f.issueDate ? { issueDate: f.issueDate } : {}), notes: f.notes.trim(), ...(f.orderId ? { orderId: f.orderId } : {}),
  };
}
export function invoiceToForm(inv: InvoiceFull): InvoiceForm {
  return {
    customer: { name: inv.customer.name, email: inv.customer.email ?? "", taxId: inv.customer.taxId ?? "", taxOffice: inv.customer.taxOffice ?? "", address: inv.customer.address, city: inv.customer.city, isCompany: !!inv.customer.isCompany },
    lines: inv.lines.map((l) => emptyLine({ variantId: l.variantId, sku: l.sku, name: l.name, quantity: String(l.quantity), price: toMajor(l.unitPrice), taxRate: String(l.taxRate), discount: toMajor(l.discount ?? 0) })),
    pricesIncludeTax: inv.pricesIncludeTax, currency: inv.currency, issueDate: inv.issueDate ?? "", notes: inv.notes ?? "", orderId: inv.orderId ?? undefined,
  };
}

/** Live totals — same function the server uses, so UI == server. */
export function totalsOf(f: InvoiceForm) {
  const lines = f.lines.map(lineToApi);
  const t = computeInvoiceTotals(lines, f.pricesIncludeTax);
  const byRate = new Map<number, { rate: number; net: number; tax: number }>();
  lines.forEach((l, i) => {
    const r = byRate.get(l.taxRate) ?? { rate: l.taxRate, net: 0, tax: 0 };
    r.net += t.lines[i]!.net; r.tax += t.lines[i]!.tax; byRate.set(l.taxRate, r);
  });
  return { ...t, discount: lines.reduce((s, l) => s + l.discount, 0), byRate: [...byRate.values()].sort((a, b) => a.rate - b.rate) };
}

export type FormErrors = Record<string, string>;
export function validateForm(f: InvoiceForm): FormErrors {
  const e: FormErrors = {}; const c = f.customer;
  if (!c.name.trim()) e["customer.name"] = tNow("invoices.validation.name");
  if (c.address.trim().length < 3) e["customer.address"] = tNow("invoices.validation.address");
  if (c.city.trim().length < 2) e["customer.city"] = tNow("invoices.validation.city");
  if (c.email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c.email.trim())) e["customer.email"] = tNow("invoices.validation.email");
  if (c.taxId.trim() && !/^\d{10,11}$/.test(c.taxId.trim())) e["customer.taxId"] = tNow("invoices.validation.taxId");
  if (f.lines.length === 0) e.lines = tNow("invoices.validation.lines");
  f.lines.forEach((l, i) => {
    if (!l.name.trim()) e[`line.${i}.name`] = tNow("invoices.validation.lineName");
    if (!(num(l.quantity) > 0)) e[`line.${i}.quantity`] = tNow("invoices.validation.lineQty");
    if (num(l.taxRate) < 0 || num(l.taxRate) > 100) e[`line.${i}.taxRate`] = tNow("invoices.validation.lineKdv");
  });
  if (!/^[A-Za-z]{3}$/.test(f.currency)) e.currency = tNow("invoices.validation.currency");
  return e;
}

/** Server warning text: the translated `invoices.warning.<code>` when we have one, otherwise the server's own message. */
export function warningText(w: { code: string; message: string; line?: number }): string {
  const key = `invoices.warning.${w.code}`;
  return hasKey(key) ? tNow(key) : w.message;
}

export interface Described { message: string; link?: { to: string; label: string }; tone: "danger" | "warning" }
/** Maps issue/cancel API errors to user-facing messages (kept pure for testing). */
export function describeInvoiceError(e: unknown): Described {
  if (!(e instanceof ApiError)) return { tone: "danger", message: e instanceof Error ? e.message : tNow("invoices.error.generic") };
  const m = (code: string) => tNow(`invoices.error.${code}`, { message: e.message });
  switch (e.code) {
    case "no_invoicing_provider": return { tone: "warning", message: m(e.code), link: { to: "/integrations", label: tNow("invoices.error.openIntegrations") } };
    case "issue_in_progress": case "already_issued": case "rate_limited": return { tone: "warning", message: m(e.code) };
    case "issue_failed": case "cancel_failed": case "zero_total": case "not_editable": case "invalid_state": return { tone: "danger", message: m(e.code) };
    default: return { tone: "danger", message: e.message };
  }
}

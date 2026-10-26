import { computeInvoiceTotals, type ManualInvoiceBody, type ManualInvoiceLine } from "@openshelf/shared";
import type { InvoiceInput } from "@openshelf/integration-sdk";

export type InvoiceType = "e_fatura" | "e_arsiv";
export interface InvoiceWarning { code: string; message: string; line?: number }

/** Same rule as the efaturam adapter (without the taxpayer lookup): e_fatura only for a company with a 10-digit VKN. */
export function ruleInvoiceType(c: { isCompany: boolean; taxId?: string | null }): InvoiceType {
  const vkn = (c.taxId ?? "").replace(/\s/g, "");
  return c.isCompany && /^\d{10}$/.test(vkn) ? "e_fatura" : "e_arsiv";
}

/**
 * Line mapping to the provider's InvoiceInput (whose unitPrice is KDV-INCLUSIVE minor units, like order_items):
 *  - gross = computeInvoiceTotals line total (net + tax); this already folds in the per-line discount and handles both
 *    pricesIncludeTax=true (unitPrice is gross) and false (tax is added on top), so the provider's inclusive total equals ours.
 *  - integer quantity that divides gross evenly -> { quantity, unitPrice: gross / quantity }
 *  - otherwise (fractional quantity / uneven split) -> single line { quantity: 1, unitPrice: gross, name: "<name> (<qty> x)" } so no cent is lost to rounding.
 */
export function toInvoiceLines(lines: ManualInvoiceLine[], pricesIncludeTax: boolean): InvoiceInput["lines"] {
  const calc = computeInvoiceTotals(lines, pricesIncludeTax).lines;
  return lines.map((l, i) => {
    const gross = calc[i]!.total;
    if (Number.isInteger(l.quantity) && l.quantity > 0 && gross % l.quantity === 0) return { name: l.name, quantity: l.quantity, unitPrice: gross / l.quantity, taxRate: l.taxRate };
    return { name: l.quantity === 1 ? l.name : `${l.name} (${l.quantity} x)`.slice(0, 200), quantity: 1, unitPrice: gross, taxRate: l.taxRate };
  });
}

export function buildPreview(b: Pick<ManualInvoiceBody, "customer" | "lines" | "pricesIncludeTax" | "currency" | "notes">) {
  const t = computeInvoiceTotals(b.lines, b.pricesIncludeTax);
  const warnings: InvoiceWarning[] = [];
  const c = b.customer;
  const taxId = (c.taxId ?? "").trim();
  if (c.isCompany && !taxId) warnings.push({ code: "company_tax_id_missing", message: "Company invoice without a tax number (VKN); it will be issued as e-Arsiv." });
  if (c.isCompany && taxId && taxId.length !== 10) warnings.push({ code: "company_tax_id_not_vkn", message: "Company tax number is not a 10-digit VKN; it will be issued as e-Arsiv." });
  if (c.isCompany && !(c.taxOffice ?? "").trim()) warnings.push({ code: "tax_office_missing", message: "Tax office is empty for a company." });
  if (!c.isCompany && taxId && taxId.length === 10) warnings.push({ code: "vkn_on_individual", message: "A 10-digit VKN is set but the customer is not marked as a company." });
  if (t.total === 0) warnings.push({ code: "zero_total", message: "Invoice total is 0; it cannot be issued." });
  if (!(c.email ?? "").trim()) warnings.push({ code: "customer_email_missing", message: "Customer has no e-mail address." });
  b.lines.forEach((l, i) => {
    if (l.taxRate === 0 && !(b.notes ?? "").trim()) warnings.push({ code: "zero_tax_without_note", message: "Tax rate is 0% and no exemption note is set.", line: i });
    if (t.lines[i]!.total < 0) warnings.push({ code: "negative_line", message: "Line discount exceeds the line amount.", line: i });
    if (l.unitPrice === 0) warnings.push({ code: "zero_price", message: "Line unit price is 0.", line: i });
  });
  return {
    lines: b.lines.map((l, i) => ({ name: l.name, quantity: l.quantity, unitPrice: l.unitPrice, taxRate: l.taxRate, discount: l.discount, ...t.lines[i]! })),
    net: t.net, taxTotal: t.tax, total: t.total, currency: b.currency, pricesIncludeTax: b.pricesIncludeTax, warnings,
  };
}

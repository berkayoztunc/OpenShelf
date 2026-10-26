// Trendyol e-Faturam web-service documentation is delivered privately with the activation e-mails
// (no public API reference was found). EVERYTHING in this file is therefore UNVERIFIED and isolated here.
// Adjust paths / field names / auth to the documentation supplied with your e-Faturam credentials.
export const DEFAULT_BASE_URL = "https://efaturam.trendyol.com/api"; // UNVERIFIED: base URL
export const ALLOWED_HOST_SUFFIXES: readonly string[] = ["trendyol.com"]; // SSRF allowlist: trendyol.com and subdomains

export const paths = {
  issue: "/invoices", // UNVERIFIED: POST, idempotency via `Idempotency-Key` header
  cancel: (id: string) => `/invoices/${encodeURIComponent(id)}/cancel`, // UNVERIFIED: POST
  ping: "/ping", // UNVERIFIED: GET, used for healthCheck
  taxpayer: (taxId: string) => `/taxpayers/${encodeURIComponent(taxId)}`, // UNVERIFIED: GET -> { eInvoiceUser: boolean }
};

// UNVERIFIED: auth scheme (HTTP Basic username:password assumed).
export const authHeader = (u: string, p: string) => "Basic " + btoa(`${u}:${p}`);

// UNVERIFIED request/response mapping.
export interface IssueRequest {
  type: "e_fatura" | "e_arsiv"; orderNumber: string; issueDate: string; currency: string; seriesPrefix?: string;
  customer: { name: string; email?: string; taxId?: string; taxOffice?: string; address: string; city: string };
  lines: { name: string; quantity: number; unitPrice: string; vatRate: number }[];
}
export interface IssueResponse { id?: string; invoiceId?: string; number?: string; invoiceNumber?: string; pdfUrl?: string; pdf?: string; status?: string }

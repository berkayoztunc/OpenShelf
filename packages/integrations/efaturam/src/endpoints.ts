/**
 * Trendyol e-Faturam gateway, taken from the public docs (developers.trendyolefaturam.com, checked 2026-11):
 *  - production gateway apigateway.trendyolecozum.com, test gateway stage-apigateway.trendyolefaturam.com
 *    (the test gateway needs IP whitelisting, production does not)
 *  - POST /api/auth/signin { email, password } answers with the JWT in the `x-access-token` response header;
 *    every other request sends it back as `Authorization: Bearer <jwt>` (verified live 2026-11: the `x-access-token` request header is rejected with 401)
 *  - all amounts are integers in kuruş
 * Not exercised against a live account yet: anything marked UNVERIFIED below is an assumption.
 */
export const PROD_BASE_URL = "https://apigateway.trendyolecozum.com";
export const STAGE_BASE_URL = "https://stage-apigateway.trendyolefaturam.com";
export const DEFAULT_BASE_URL = PROD_BASE_URL;
/** SSRF allowlist: exact gateway hosts only. */
export const ALLOWED_HOSTS: readonly string[] = ["apigateway.trendyolecozum.com", "stage-apigateway.trendyolefaturam.com"];

/** Sign-in response header that carries the JWT. */
export const TOKEN_HEADER = "x-access-token";
/** Request auth header for everything after sign-in. */
export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

export const paths = {
  signIn: "/api/auth/signin",
  eArchive: "/api/invoice/documents/earchive",
  eInvoice: "/api/invoice/documents/outgoing-einvoice",
  eArchiveCancel: "/api/invoice/documents/earchive/cancel",
  eArchiveStatus: (uuid: string) => `/api/invoice/documents/earchive/status/${encodeURIComponent(uuid)}`,
  eInvoiceStatus: (uuid: string) => `/api/invoice/documents/outgoing-einvoice/status/${encodeURIComponent(uuid)}`,
  taxpayer: (taxId: string) => `/api/invoice/taxpayers/${encodeURIComponent(taxId)}`,
  permanentUrl: "/api/invoice/documents/download/permanent-url",
};

/** Document statuses that mean the invoice did not go through (29 = document error, 405 = failed). */
export const FAILED_STATUSES: readonly string[] = ["29", "405"];

export const KDV = { taxType: "KDV", taxCode: "0015", name: "KDV" } as const;
export const UNIT_PIECE = "C62";
/**
 * Carriers we know the legal title and VKN of, keyed by the carrier code a shipment stores (Geliver providerCode or a
 * marketplace carrier name, upper-cased, letters only). Only values seen on a real GİB document are listed; any other
 * carrier uses the default carrier from the integration settings.
 */
export const KNOWN_CARRIERS: Record<string, { taxId: string; name: string }> = {
  YURTICI: { taxId: "9860008925", name: "YURTİÇİ KARGO SERVİSİ A.Ş." }, // from a Trendyol e-Arşiv, 2026-11
};
/** GİB placeholder TCKN for a consumer who gave no identity number. */
export const ANONYMOUS_TCKN = "11111111111";

export interface TaxSubtotal { taxableAmount: number; taxAmount: number; taxType: string; percent: number; taxCode: string; name: string }
export interface CreateInvoiceRequest {
  autoInvoiceId: true; companyId: number; userId: number; source: "WEB"; localReferenceId: string; prefix?: string; targetAlias?: string; issuedAt: string;
  recipientInfo: {
    taxId: string; name: string; surname?: string; city: string; district: string; address?: string; postalCode?: string; phone?: string;
    taxOffice?: string; email?: string; countryCode: "TR";
  };
  currencyInfo: { currency: string };
  xsltCode?: string;
  /** internet sale: where and how it was paid */
  paymentInfo?: { purchaseUrl?: string; paymentAgentName?: string; paymentType?: string; paymentDate: string; paymentMeans: string };
  /** internet sale: when and with which carrier the goods were sent */
  deliveryInfo?: { carrierTaxId?: string; carrierName?: string; sentAt: string };
  notes?: string[];
  invoiceInfo: { invoiceType: "EARSIVFATURA" | "TEMELFATURA"; invoiceTypeCode: "SATIS"; invoiceUuid: string };
  invoiceLines: { unitCode: string; quantity: number; itemName: string; unitPriceAmount: number; totalAmount: number; taxableAmount: number; taxAmount: number; taxPercent: number; taxName: string; taxCode: string; totalDiscountAmount: number; totalTax: { totalTaxAmount: number; subTotalTaxes: TaxSubtotal[] } }[];
  totalTax: { totalTaxAmount: number; subTotalTaxes: TaxSubtotal[] };
  invoiceTotal: { lineExtensionAmount: number; taxExclusiveAmount: number; taxInclusiveAmount: number; payableAmount: number; allowanceTotalAmount: number };
  orderInfo: { orderId: string; orderDate: string };
}
export interface CreateInvoiceResponse { invoiceUuid?: string; invoiceId?: string; status?: string }
export interface TaxPayer { alias?: string; aliasType?: string; deletedAt?: string | null }

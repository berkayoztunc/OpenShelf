import type { EfaturamOperation, OpParam } from "@openshelf/shared";
import { paths } from "./endpoints";

const t = (tr: string, en: string) => ({ tr, en });
const pathParam = (name: string, tr: string, en: string, o: Partial<OpParam> = {}): OpParam => ({ name, in: "path", type: "string", required: true, description: t(tr, en), ...o });
const ETTN = "96a8b0f1-7e10-4a44-8d78-eb961539bb4b";
const uuidParam = pathParam("invoiceUuid", "Faturanın ETTN (UUID) numarası.", "The invoice ETTN (UUID).", { example: ETTN });
const companyParam = pathParam("companyId", "Firma ID. Boş bırakırsanız oturumdaki firma kullanılır.", "Company id. Left empty, the signed-in company is used.", { required: false, type: "integer" });
const AUTOFILL_NOTE = t("companyId ve userId alanlarını boş bırakırsanız oturum açılan hesabın değerleri eklenir.", "Leave companyId and userId out and the signed-in account's values are added.");
const AMOUNT_NOTE = t("Tutarlar kuruş cinsindendir (114,55 TL = 11455). ", "Amounts are in kuruş (114.55 TL = 11455). ");

/** One 120.00 TL (KDV %20 dahil) line: 100.00 matrah + 20.00 KDV. */
const LINES = {
  invoiceLines: [{ unitCode: "C62", quantity: 1, itemName: "Test ürün", unitPriceAmount: 10000, totalAmount: 10000, taxableAmount: 10000, taxAmount: 2000, taxPercent: 20, taxName: "KDV", taxCode: "0015", totalDiscountAmount: 0 }],
  totalTax: { totalTaxAmount: 2000, subTotalTaxes: [{ taxableAmount: 10000, taxAmount: 2000, taxType: "KDV", percent: 20, taxCode: "0015", name: "KDV" }] },
  invoiceTotal: { lineExtensionAmount: 10000, taxExclusiveAmount: 10000, taxInclusiveAmount: 12000, payableAmount: 12000, allowanceTotalAmount: 0 },
};

/**
 * e-Faturam gateway operations used by the admin console. Source: the public API reference (developers.trendyolefaturam.com,
 * "API Kullanıcıları" section). Partner-only calls, despatch advices (irsaliye) and the file-upload variants are left out.
 */
export const EFATURAM_OPERATIONS: EfaturamOperation[] = [
  {
    id: "getTaxPayersByTaxId", group: "taxpayers", method: "GET", path: "/api/invoice/taxpayers/{taxId}", risk: "read",
    title: t("Mükellef sorgula", "Look up a taxpayer"), summary: t("VKN / TCKN e-Fatura mükellefi mi, hangi etiketleri (alias) var.", "Whether a tax number is an e-Fatura user, and its aliases."),
    params: [
      pathParam("taxId", "VKN (10 hane) ya da TCKN (11 hane).", "VKN (10 digits) or TCKN (11 digits).", { example: "1234567890" }),
      { name: "showDeleted", in: "query", type: "boolean", description: t("Silinmiş etiketleri de göster.", "Include deleted aliases.") },
    ],
    body: { kind: "none" },
    notes: t("Mükellef değilse 404 döner; bu durumda e-Arşiv kesilir.", "Answers 404 when the number is not an e-Fatura user; an e-Arşiv is issued then."),
  },
  {
    id: "createEArchive", group: "earchive", method: "POST", path: paths.eArchive, risk: "write", billed: true, autofill: ["companyId", "userId"],
    title: t("e-Arşiv fatura oluştur", "Create an e-Arşiv invoice"), summary: t("e-Fatura mükellefi olmayan alıcıya e-Arşiv fatura keser.", "Issues an e-Arşiv invoice to a recipient who is not an e-Fatura user."),
    params: [],
    body: {
      kind: "json",
      example: {
        autoInvoiceId: true, source: "WEB", localReferenceId: "TEST-1001", issuedAt: "2026-01-10T09:00:00Z",
        recipientInfo: { taxId: "11111111111", name: "Ayşe", surname: "Yılmaz", city: "İstanbul", district: "Kadıköy", address: "Atatürk Mah. 1. Sok. No:1", email: "ayse@example.com", countryCode: "TR" },
        invoiceInfo: { invoiceType: "EARSIVFATURA", invoiceTypeCode: "SATIS" },
        ...LINES,
      },
    },
    notes: t(AMOUNT_NOTE.tr + "Canlı ortamda bu çağrı GERÇEK bir fatura keser ve kontör harcar. " + AUTOFILL_NOTE.tr, AMOUNT_NOTE.en + "On the live gateway this issues a REAL invoice and spends credit. " + AUTOFILL_NOTE.en),
  },
  {
    id: "getEArchiveStatus", group: "earchive", method: "GET", path: "/api/invoice/documents/earchive/status/{invoiceUuid}", risk: "read",
    title: t("e-Arşiv durumu", "e-Arşiv status"), summary: t("Oluşturulan e-Arşiv faturanın durum kodunu ve GİB raporlama durumunu döndürür.", "Returns the status code and the GİB reporting state of an e-Arşiv invoice."),
    params: [uuidParam], body: { kind: "none" },
  },
  {
    id: "cancelEArchive", group: "earchive", method: "POST", path: paths.eArchiveCancel, risk: "destructive", autofill: ["companyId"],
    title: t("e-Arşiv iptal et", "Cancel an e-Arşiv invoice"), summary: t("e-Arşiv faturayı iptal eder. Geri alınamaz.", "Cancels an e-Arşiv invoice. Cannot be undone."),
    params: [], body: { kind: "json", example: { invoiceUuid: ETTN } },
    notes: AUTOFILL_NOTE,
  },
  {
    id: "createOutgoingEInvoice", group: "einvoice", method: "POST", path: paths.eInvoice, risk: "write", billed: true, autofill: ["companyId", "userId"],
    title: t("e-Fatura oluştur", "Create an e-Fatura"), summary: t("e-Fatura mükellefi olan alıcıya e-Fatura keser.", "Issues an e-Fatura to a recipient who is an e-Fatura user."),
    params: [],
    body: {
      kind: "json",
      example: {
        autoInvoiceId: true, source: "WEB", localReferenceId: "TEST-1002", issuedAt: "2026-01-10T09:00:00Z", targetAlias: "urn:mail:defaultpk@example.com",
        recipientInfo: { taxId: "1234567890", name: "Örnek Ticaret A.Ş.", taxOffice: "Kadıköy", city: "İstanbul", district: "Kadıköy", address: "Atatürk Mah. 1. Sok. No:1", countryCode: "TR" },
        invoiceInfo: { invoiceType: "TEMELFATURA", invoiceTypeCode: "SATIS" },
        ...LINES,
      },
    },
    notes: t(AMOUNT_NOTE.tr + "Canlı ortamda bu çağrı GERÇEK bir fatura keser ve kontör harcar; e-Fatura API'den iptal edilemez. " + AUTOFILL_NOTE.tr, AMOUNT_NOTE.en + "On the live gateway this issues a REAL invoice and spends credit; an e-Fatura cannot be cancelled through the API. " + AUTOFILL_NOTE.en),
  },
  {
    id: "getOutgoingEInvoiceStatus", group: "einvoice", method: "GET", path: "/api/invoice/documents/outgoing-einvoice/status/{invoiceUuid}", risk: "read",
    title: t("e-Fatura durumu", "e-Fatura status"), summary: t("Giden e-Faturanın durum kodunu ve GİB durum kodunu döndürür.", "Returns the status code and the GİB status code of an outgoing e-Fatura."),
    params: [uuidParam], body: { kind: "none" },
  },
  {
    id: "reSendOutgoingEInvoice", group: "einvoice", method: "POST", path: "/api/invoice/documents/outgoing-einvoice/resend", risk: "write", autofill: ["companyId"],
    title: t("e-Faturayı yeniden gönder", "Resend an e-Fatura"), summary: t("GİB tarafında hata alan e-Faturayı yeniden gönderir; gerekirse yeni alıcı etiketiyle.", "Resends an e-Fatura that failed at GİB, optionally with a new recipient alias."),
    params: [], body: { kind: "json", example: { invoiceUuid: ETTN, newTargetAlias: "urn:mail:defaultpk@example.com" } },
    notes: AUTOFILL_NOTE,
  },
  {
    id: "getReceivedReply", group: "einvoice", method: "GET", path: "/api/invoice/documents/received-reply/{companyId}/{invoiceUuid}", risk: "read", autofill: ["companyId"],
    title: t("Alıcının yanıtı", "Recipient's reply"), summary: t("Kestiğiniz ticari e-Faturaya alıcının verdiği yanıtı (kabul / ret) döndürür.", "Returns the recipient's reply (accepted / rejected) to a commercial e-Fatura you issued."),
    params: [companyParam, uuidParam], body: { kind: "none" },
  },
  {
    id: "searchIncomingEInvoice", group: "incoming", method: "POST", path: "/api/invoice/documents/incoming-einvoice/search", risk: "read", autofill: ["companyId"],
    title: t("Gelen e-Faturaları ara", "Search incoming e-Fatura"), summary: t("Size kesilen e-Faturaları tarih, gönderici ve duruma göre arar.", "Searches the e-Fatura invoices issued to you by date, sender and status."),
    params: [], body: { kind: "json", example: { startDate: "2026-01-01", endDate: "2026-01-31", pagination: { page: 0, size: 20 } } },
    notes: t("Yalnızca okur; hiçbir şeyi değiştirmez. " + AUTOFILL_NOTE.tr, "Read only; it changes nothing. " + AUTOFILL_NOTE.en),
  },
  {
    id: "replyIncomingEInvoice", group: "incoming", method: "POST", path: "/api/invoice/documents/sent-reply", risk: "write", autofill: ["companyId"],
    title: t("Gelen e-Faturayı yanıtla", "Reply to an incoming e-Fatura"), summary: t("Gelen ticari e-Faturayı kabul eder ya da reddeder.", "Accepts or rejects an incoming commercial e-Fatura."),
    params: [], body: { kind: "json", example: { invoiceUuid: ETTN, responseType: "APPROVED", note: "Kabul edildi" } },
    notes: t("responseType: APPROVED ya da DENIED. Yanıt hukuki sonuç doğurur ve ikinci kez verilemez. " + AUTOFILL_NOTE.tr, "responseType: APPROVED or DENIED. The reply is legally binding and cannot be given twice. " + AUTOFILL_NOTE.en),
  },
  {
    id: "getSentReply", group: "incoming", method: "GET", path: "/api/invoice/documents/sent-reply/{companyId}/{invoiceUuid}", risk: "read", autofill: ["companyId"],
    title: t("Verdiğiniz yanıt", "Your reply"), summary: t("Gelen bir e-Faturaya verdiğiniz yanıtı döndürür.", "Returns the reply you gave to an incoming e-Fatura."),
    params: [companyParam, uuidParam], body: { kind: "none" },
  },
  {
    id: "getTemporaryDocumentDownloadUrl", group: "documents", method: "POST", path: "/api/invoice/documents/download", risk: "read", autofill: ["companyId"],
    title: t("Geçici indirme bağlantısı", "Temporary download link"), summary: t("Belgenin PDF / XML / HTML hali için kısa ömürlü bağlantı üretir.", "Creates a short-lived link to the document as PDF / XML / HTML."),
    params: [], body: { kind: "json", example: { documentType: "EARCHIVE", fileExtension: "pdf", invoiceUuid: ETTN } },
    notes: t("documentType: EARCHIVE, EINVOICE, INCOMING_EINVOICE, SENT_REPLY, RECEIVED_REPLY. fileExtension: pdf, xml, html. " + AUTOFILL_NOTE.tr, "documentType: EARCHIVE, EINVOICE, INCOMING_EINVOICE, SENT_REPLY, RECEIVED_REPLY. fileExtension: pdf, xml, html. " + AUTOFILL_NOTE.en),
  },
  {
    id: "getPermanentDocumentDownloadUrl", group: "documents", method: "POST", path: paths.permanentUrl, risk: "read", autofill: ["companyId"],
    title: t("Kalıcı indirme bağlantısı", "Permanent download link"), summary: t("Belge için süresi dolmayan bağlantı üretir (müşteriye gönderilen bağlantı).", "Creates a link that does not expire (the one sent to the customer)."),
    params: [], body: { kind: "json", example: { documentType: "EARCHIVE", fileExtension: "pdf", invoiceUuid: ETTN } },
    notes: AUTOFILL_NOTE,
  },
];

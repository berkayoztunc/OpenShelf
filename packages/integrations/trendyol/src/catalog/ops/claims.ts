import type { OpParam, TrendyolOperation, Text } from "@openshelf/shared";

/**
 * Group 3: returned orders (claims), customer questions, invoices, seller information, accounting & finance,
 * Trendyol Express compensation, webhooks. Source: https://developers.trendyol.com/v2.0 (Turkey), llms.txt sections
 * "Returned Orders Integration", "Customer Question Integration", "Invoice Integration", "Supplier Information",
 * "Domestic Current Account Statement", "Cargo Invoice Details", "Trendyol Express Integration", "Trendyol Webhook API".
 * Hosts: every operation lives on apigw.trendyol.com (stage: stageapigw.trendyol.com). Finance paths use the prefix
 * `/integration/finance/che`, webhooks `/integration/webhook`; everything else `/integration/...`.
 */
const T = (tr: string, en: string): Text => ({ tr, en });
const ref = (id: string) => `https://developers.trendyol.com/v2.0/reference/${id.toLowerCase()}`;
const ts = (name: string, tr: string, en: string, extra: Partial<OpParam> = {}): OpParam => ({ name, in: "query", type: "timestamp_ms", description: T(tr, en), ...extra });
const page = (tr = "Sayfa numarası (0'dan başlar).", en = "Page number (starts at 0)."): OpParam => ({ name: "page", in: "query", type: "integer", default: 0, description: T(tr, en), example: 0 });
const size = (def: number, max: number | string, tr?: string, en?: string, extra: Partial<OpParam> = {}): OpParam => ({
  name: "size", in: "query", type: "integer", default: def, description: T(tr ?? `Sayfa başına kayıt sayısı (varsayılan ${def}, en fazla ${max}).`, en ?? `Page size (default ${def}, max ${max}).`), example: def, ...extra,
});

const MIN: Record<string, Text> = {
  claims: T("Returned Orders Integration: getClaims 1000 istek/dk; onay ve red 5 istek/dk; denetim kaydı 1000 istek/dk. Genel limit 50 istek / 10 sn.", "Returned Orders Integration: getClaims 1000 req/min; approve and reject 5 req/min; audit 1000 req/min. General limit 50 req / 10 s."),
};
const CLAIM_STATUSES = ["Created", "WaitingInAction", "WaitingFraudCheck", "Accepted", "Unresolved", "Rejected", "Cancelled", "InAnalysis"];
const WEBHOOK_STATUSES = ["CREATED", "PICKING", "INVOICED", "SHIPPED", "CANCELLED", "DELIVERED", "UNDELIVERED", "RETURNED", "UNSUPPLIED", "AWAITING", "UNPACKED", "AT_COLLECTION_POINT", "VERIFIED"];
const webhookBodyFields = [
  { path: "url", type: "string", required: true, description: T("Webhook adresi. Adres 'Trendyol', 'Dolap' veya 'localhost' içeremez.", "Webhook URL. The address must not contain 'Trendyol', 'Dolap' or 'localhost'.") },
  { path: "authenticationType", type: "BASIC_AUTHENTICATION | API_KEY", required: true, description: T("Kimlik doğrulama yöntemi.", "Authentication method.") },
  { path: "username", type: "string", description: T("BASIC_AUTHENTICATION için zorunlu.", "Required for BASIC_AUTHENTICATION.") },
  { path: "password", type: "string", description: T("BASIC_AUTHENTICATION için zorunlu.", "Required for BASIC_AUTHENTICATION.") },
  { path: "apiKey", type: "string", description: T("API_KEY için zorunlu; Trendyol bunu 'x-api-key' başlığıyla gönderir.", "Required for API_KEY; Trendyol sends it in the 'x-api-key' header.") },
  { path: "subscribedStatuses", type: "string[]", description: T("Bildirim istenen paket durumları. Boş gönderilirse tüm durumlar atanır.", "Package statuses to be notified about. If empty, all statuses are assigned.") },
];
const webhookExample = { url: "https://testwebhook.com", username: "user", password: "password", authenticationType: "API_KEY", apiKey: "123456", subscribedStatuses: ["CREATED", "PICKING"] };
const webhookIdParam: OpParam = { name: "Id", in: "path", type: "string", required: true, description: T("Webhook kimliği (createWebhook yanıtındaki id).", "Webhook ID (the id returned by createWebhook)."), example: "2ba10e5d-5176-416b-9770-5d9c85a81a5e" };
const webhookLimitNote = T(
  "Webhook uç noktası 'Trendyol', 'Dolap' veya 'localhost' içeremez. Satıcı başına en fazla 15 webhook (pasifler dahil). Hata durumunda Trendyol webhook'u pasife alır ve e-posta gönderir.",
  "The webhook endpoint must not contain 'Trendyol', 'Dolap' or 'localhost'. Max 15 webhooks per seller (inactive ones count). On repeated errors Trendyol deactivates the webhook and sends e-mails.",
);
const webhookRate = T("Genel limit: 50 istek / 10 sn.", "General limit: 50 req / 10 s.");

export const operations: TrendyolOperation[] = [
  /* ───────────────────────── Returned Orders (claims) ───────────────────────── */
  {
    id: "getClaims", group: "claims", area: "returns",
    title: T("İade siparişlerini getir", "Get returned orders"),
    summary: T("Trendyol sistemindeki iade (claim) paketlerini durum, tarih ve sipariş numarasına göre listeler.", "Lists the return (claim) packages in Trendyol by status, date and order number."),
    method: "GET", path: "/integration/order/sellers/{sellerId}/claims",
    params: [
      { name: "claimIds", in: "query", type: "array", arrayStyle: "comma", description: T("Belirli iade paketlerini kimliğiyle getirir. Verilirse diğer tüm filtreler yok sayılır.", "Fetch specific claim packages by ID. When given, all other filters are ignored."), example: "f9da2317-876b-4b86-b8f7-0535c3b65731" },
      { name: "claimItemStatus", in: "query", type: "string", enum: CLAIM_STATUSES, description: T("İade kalemi durumu. Yeni iadeler için 'Created' ile sorgulayın.", "Claim item status. Query with 'Created' to find new returns."), example: "WaitingInAction" },
      { name: "orderNumber", in: "query", type: "string", description: T("İade paketinin sipariş numarası.", "Order number of the claim package."), example: "65745805" },
      ts("startDate", "Başlangıç tarihi (milisaniye). İadenin lastModifiedDate alanına göre çalışır.", "Start date (ms). Applies to the claim's lastModifiedDate."),
      ts("endDate", "Bitiş tarihi (milisaniye). İadenin lastModifiedDate alanına göre çalışır.", "End date (ms). Applies to the claim's lastModifiedDate."),
      page(), size(50, 200),
    ],
    body: { kind: "none" }, risk: "read",
    table: { listPath: "content", columns: [
      { key: "orderNumber", label: T("Sipariş no", "Order no") },
      { key: "id", label: T("İade kimliği", "Claim ID") },
      { key: "items.0.claimItems.0.claimItemStatus.name", label: T("Durum", "Status") },
      { key: "customerFirstName", label: T("Müşteri adı", "Customer first name") },
      { key: "customerLastName", label: T("Müşteri soyadı", "Customer last name") },
      { key: "items.0.orderLine.productName", label: T("Ürün", "Product") },
      { key: "items.0.claimItems.0.customerClaimItemReason.name", label: T("İade nedeni", "Reason") },
      { key: "claimDate", label: T("İade tarihi", "Claim date") },
    ] },
    pagination: { pageParam: "page", sizeParam: "size", maxSize: 200, firstPage: 0 },
    rateLimit: MIN.claims, docsUrl: ref("getClaims"),
    notes: T(
      "Sonuçlar lastModifiedDate sırasıyla gelir. claimDate GMT milisaniyedir; satıcı paneliyle eşleştirmek için GMT+3 uygulayın. Değişim paketleri replacementOutboundpackageinfo, red paketleri rejectedpackageinfo alanındadır; müşteri nedeni 2013 ile iade edilenlerde dontShipBack true döner. Beklemede iadeler 48 saat içinde işlem görmezse sistem otomatik onaylar (autoAccepted). Müşteri iade nedenleri (customerClaimItemReason): 251 Modelini beğenmedim, 301 Kusurlu ürün gönderildi, 351 Yanlış ürün gönderildi, 401 Vazgeçtim, 451 Diğer, 501 Bedeni küçük geldi, 551 Bedeni büyük geldi, 651 Ürün belirtilen özelliklere sahip değil, 701 Yanlış sipariş verdim, 1651 Kalitesini beğenmedim, 2030 Daha iyi bir fiyat mevcut, 2042 Beğenmedim, 2043 Ürünümün parçası/aksesuarı eksik gönderildi. Trendyol tarafı nedenleri: 51 Sebep Yok, 101 Depo Kayıp, 151 Çapraz Hatalı, 201 Müşteri İade Kayıp, 751 Diğer - Fraud Kaynaklı, 1701 Kargo Teslimatı Gecikmesi, 2000 Cezalı Onay, 2001 Cezasız Onay, 2002 Teknik Servis Desteği Gerekiyor, 2003 Kullanılmış Ürün Sebepli Red, 2004 Hijyenik Sebepli Red, 2005 Analiz sonucu üretimden kaynaklı sorun yok, 2006 Analiz Değişim, 2007 Analiz Tamirat, 2008 Üründe adet/aksesuar eksiği, 2009 Firmaya ait olmayan ürün, 2010 Tekrar Sevk, 2011 Satıcı Tarafından Aksiyona Çekilen, 2012 İade Süresi Geçmiş, 2013 Ürün Müşteride, 2014 Analize Gönder, 2015 Teslim edilemeyen gönderi, 2017 Tazmin, 2058 Gönderi Sevk Edilemedi, 2065 Müşteri onayı tamamlanmayan gönderi, 2067 Müşteri talebiyle iptal edilen gönderi. (Return Reasons rehberi bir API değildir; yalnızca doküman tablosudur.)",
      "Results come ordered by lastModifiedDate. claimDate is GMT milliseconds; add GMT+3 to match the seller panel. Exchange packages are in replacementOutboundpackageinfo, rejection packages in rejectedpackageinfo; claims returned with reason 2013 come back with dontShipBack true. Claims left in WaitingInAction for 48 hours are auto-accepted (autoAccepted). Customer reasons (customerClaimItemReason): 251 Dislike model, 301 Defective product sent, 351 Wrong product sent, 401 Changed my mind, 451 Other, 501 Size too small, 551 Size too large, 651 Product does not match description, 701 Ordered by mistake, 1651 Dislike quality, 2030 Better price available, 2042 Dislike, 2043 Part/accessory missing. Trendyol-side reasons: 51 No reason, 101 Warehouse lost, 151 Cross error, 201 Customer return lost, 751 Other - fraud, 1701 Cargo delivery delay, 2000 Penalized approval, 2001 Non-penalized approval, 2002 Needs technical service, 2003 Rejected: used product, 2004 Rejected: hygiene, 2005 Analysis: no manufacturing issue, 2006 Analysis: replacement, 2007 Analysis: repair, 2008 Missing quantity/accessory, 2009 Product not the company's, 2010 Re-dispatch, 2011 Actioned by seller, 2012 Return period expired, 2013 Product with customer, 2014 Send to analysis, 2015 Undeliverable shipment, 2017 Compensation, 2058 Shipment could not be dispatched, 2065 Customer approval not completed, 2067 Cancelled at customer request. (The 'Return Reasons' guide is not an API; it is a documentation table only.)",
    ),
  },
  {
    id: "createClaim", group: "claims", area: "returns",
    title: T("İade talebi oluştur", "Create a return request"),
    summary: T("İade kodu olmadan depoya ulaşan sipariş paketleri için 'Created' durumunda bir iade paketi oluşturur.", "Creates a return package (status Created) for order packages that arrive without a return code."),
    method: "POST", path: "/integration/order/sellers/{sellerId}/claims/create",
    params: [],
    body: {
      kind: "json",
      example: { claimItems: [{ barcode: "8680000000011", customerNote: "İade kodu olmadan gelen paket", quantity: 1, reasonId: 401 }], customerId: 888888888, excludeListing: true, forcePackageCreation: true, orderNumber: "10987654321", shipmentCompanyId: 4 },
      fields: [
        { path: "orderNumber", type: "string", required: true, description: T("Sipariş numarası.", "Order number.") },
        { path: "customerId", type: "integer", required: true, description: T("Siparişi veren müşterinin Trendyol kimliği (getShipmentPackages yanıtından).", "Trendyol ID of the customer who placed the order (from getShipmentPackages).") },
        { path: "shipmentCompanyId", type: "integer", required: true, description: T("Çalıştığınız kargo firmasının kimliği.", "ID of the cargo company you work with.") },
        { path: "excludeListing", type: "boolean", description: T("Listelemeden çıkar.", "Exclude from listing.") },
        { path: "forcePackageCreation", type: "boolean", description: T("Paket oluşturmayı zorla.", "Force package creation.") },
        { path: "claimItems[].barcode", type: "string", required: true, description: T("Siparişteki ürünün barkodu.", "Barcode of the product in the order.") },
        { path: "claimItems[].quantity", type: "integer", required: true, description: T("İade edilecek adet.", "Quantity to return.") },
        { path: "claimItems[].reasonId", type: "integer", required: true, description: T("Müşteri iade nedeni kimliği; şimdilik 401 (Vazgeçtim) kullanılabilir.", "Customer return reason ID; for now 401 (Changed my mind) can be used.") },
        { path: "claimItems[].customerNote", type: "string", description: T("Müşteri notu; örn. 'İade kodu olmadan iade'.", "Customer note, e.g. 'Return without return code'.") },
      ],
    },
    risk: "write", rateLimit: T("Genel limit: 50 istek / 10 sn.", "General limit: 50 req / 10 s."), docsUrl: ref("createClaim"),
    notes: T("Bu servisi yalnızca ONAYLAYACAĞINIZ iade talepleri için kullanın: oluşturulan iade 'Created' durumundadır. Oluşan paketi getClaims ile alabilirsiniz. Yanıt: claimId, cargoTrackingNumber, claimItemIds.",
      "Use this service only for returns you intend to APPROVE: the created return starts in status Created. Fetch the package with getClaims. Response: claimId, cargoTrackingNumber, claimItemIds."),
  },
  {
    id: "approveClaimLineItems", group: "claims", area: "returns",
    title: T("İade kalemlerini onayla", "Approve returned items"),
    summary: T("Deponuza ulaşan iade ürünlerini onaylar (WaitingInAction durumundaki kalemler).", "Approves returned items that reached your warehouse (items in WaitingInAction)."),
    method: "PUT", path: "/integration/order/sellers/{sellerId}/claims/{claimId}/items/approve",
    params: [{ name: "claimId", in: "path", type: "string", required: true, description: T("İade (claim) kimliği (getClaims yanıtındaki id).", "Claim ID (the id in the getClaims response)."), example: "f9da2317-876b-4b86-b8f7-0535c3b65731" }],
    body: {
      kind: "json",
      example: { claimLineItemIdList: ["b71461e3-d1a0-4c1d-9a6d-18ecbcb5158c"], params: {} },
      fields: [
        { path: "claimLineItemIdList", type: "string[]", required: true, description: T("Onaylanacak iade kalemi kimlikleri (claimItems[].id).", "Claim item IDs to approve (claimItems[].id).") },
        { path: "params", type: "object", description: T("Ek parametreler (boş nesne).", "Additional parameters (empty object).") },
      ],
    },
    risk: "destructive", rateLimit: T("5 istek/dk.", "5 req/min."), docsUrl: ref("approveClaimLineItems"),
    notes: T("Geri alınamaz: onay iade ödemesini müşteriye tetikler. Yalnızca 'WaitingInAction' durumundaki kalemler onaylanabilir. Onaylanan iadeler bazı kurallara göre sahtekarlık kontrolüne düşebilir ve 'Accepted' olmadan önce 'WaitingFraudCheck' durumunda görünür. claimId ve claimLineItemIdList değerlerini getClaims'ten alın.",
      "Irreversible: approval triggers the customer's refund. Only items in 'WaitingInAction' can be approved. Approved returns may go through a fraud check and appear as 'WaitingFraudCheck' before 'Accepted'. Get claimId and claimLineItemIdList from getClaims."),
  },
  {
    id: "createClaimIssue", group: "claims", area: "returns",
    title: T("İade için red talebi oluştur", "Create a rejection request for a return"),
    summary: T("Deponuza gelen iade kalemleri için gerekçe ve ek dosyalarla red talebi oluşturur.", "Creates a rejection request, with reason and attachments, for returned items in your warehouse."),
    method: "POST", path: "/integration/order/sellers/{sellerId}/claims/{claimId}/issue",
    params: [
      { name: "claimId", in: "path", type: "string", required: true, description: T("İade (claim) kimliği.", "Claim ID."), example: "f9da2317-876b-4b86-b8f7-0535c3b65731" },
      { name: "claimIssueReasonId", in: "query", type: "integer", required: true, description: T("Red nedeni kimliği (getClaimIssueReasons).", "Rejection reason ID (getClaimIssueReasons)."), example: 201 },
      { name: "claimItemIdList", in: "query", type: "string", required: true, description: T("Virgülle ayrılmış iade kalemi kimlikleri.", "Comma-separated claim item IDs."), example: "b71461e3-d1a0-4c1d-9a6d-18ecbcb5158c" },
      { name: "description", in: "query", type: "string", required: true, description: T("Serbest metin açıklama, en fazla 500 karakter.", "Free-text description, at most 500 characters."), example: "Gelen ürün sipariş edilen üründen farklı." },
    ],
    body: {
      kind: "multipart", example: {},
      file: { field: "files", accept: ["application/pdf", "image/jpeg", "image/png", "image/tiff", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "video/mp4", "video/quicktime"] },
      fields: [{ path: "files", type: "file", description: T("Kanıt dosyaları (jpeg/jpg, png, pdf, tiff, doc, docx, mp4, quicktime); dosya başına en fazla 5 MB. 1651, 451 ve 2101 dışındaki tüm nedenlerde dosya zorunludur.", "Evidence files (jpeg/jpg, png, pdf, tiff, doc, docx, mp4, quicktime); max 5 MB each. A file is mandatory for every reason except 1651, 451 and 2101.") }],
    },
    risk: "write", rateLimit: T("5 istek/dk.", "5 req/min."), docsUrl: ref("createClaimIssue"),
    notes: T("Yalnızca 'WaitingInAction' durumundaki iadeler için red talebi açılabilir. Red talebi Trendyol incelemesine gider (kalem 'Unresolved' olur); onaylanırsa ürün müşteriye geri gönderilir, sonucu getClaims ile izleyin (rejectedpackageinfo). Neden 1651, WaitingInAction'a düştükten sonraki ilk 24 saatte seçilemez. 2101 nedeniyle reddedilen iade DEĞİŞİM olarak onaylanır (müşteri talebi yoksa kullanmayın). UNVERIFIED: referans sayfası claimIssueReasonId/claimItemIdList/description alanlarını form-data olarak, rehber ise sorgu dizesinde gösteriyor; bu konsol sorgu dizesi kullanır (mock her ikisini de kabul eder).",
      "Rejection requests can only be created for returns in 'WaitingInAction'. The request goes to Trendyol review (item becomes 'Unresolved'); if accepted the product is shipped back to the customer, track it via getClaims (rejectedpackageinfo). Reason 1651 cannot be chosen within the first 24 hours after the claim entered WaitingInAction. A return rejected with 2101 is approved as an EXCHANGE (do not use without a customer request). UNVERIFIED: the reference page lists claimIssueReasonId/claimItemIdList/description as form-data fields while the guide shows them in the query string; this console sends them as query string (the mock accepts both)."),
  },
  {
    id: "getClaimIssueReasons", group: "claims", area: "returns",
    title: T("Red nedenlerini getir", "Get claim issue reasons"),
    summary: T("createClaimIssue için kullanılacak claimIssueReasonId değerlerini listeler.", "Lists the claimIssueReasonId values to use with createClaimIssue."),
    method: "GET", path: "/integration/order/claim-issue-reasons",
    params: [], body: { kind: "none" }, risk: "read",
    table: { listPath: "", columns: [{ key: "id", label: T("Kimlik", "ID") }, { key: "name", label: T("Neden", "Reason") }] },
    rateLimit: T("Genel limit: 50 istek / 10 sn.", "General limit: 50 req / 10 s."), docsUrl: ref("getClaimIssueReasons"),
    notes: T("Bu uç noktanın yolunda sellerId yoktur. Dönen nedenler Türkiye ve Global pazaryeri için ortaktır. 1651 nedeni WaitingInAction'dan sonraki ilk 24 saatte seçilemez.",
      "This endpoint's path has no sellerId. The reasons are shared by the Turkey and Global marketplaces. Reason 1651 cannot be selected within the first 24 hours after WaitingInAction."),
  },
  {
    id: "getClaimItemAudits", group: "claims", area: "returns",
    title: T("İade kalemi denetim kaydı", "Get claim item audit trail"),
    summary: T("Bir iade kaleminin durum geçmişini, güncelleme tarihini ve işlemi yapan kullanıcıyı gösterir.", "Shows the status history of a claim item, the update date and who performed the action."),
    method: "GET", path: "/integration/order/sellers/{sellerId}/claims/items/{claimItemsId}/audit",
    params: [{ name: "claimItemsId", in: "path", type: "string", required: true, description: T("İade kalemi kimliği (claimItems[].id).", "Claim item ID (claimItems[].id)."), example: "f369b0a2-1461-4c9c-b3cc-12824d65e5e6" }],
    body: { kind: "none" }, risk: "read",
    table: { listPath: "", columns: [
      { key: "date", label: T("Tarih", "Date") }, { key: "previousStatus", label: T("Önceki durum", "Previous status") }, { key: "newStatus", label: T("Yeni durum", "New status") },
      { key: "userInfoDocument.executorApp", label: T("İşlemi yapan uygulama", "Executor app") }, { key: "userInfoDocument.executorUser", label: T("Kullanıcı", "User") },
    ] },
    rateLimit: T("1000 istek/dk.", "1000 req/min."), docsUrl: ref("getClaimItemAudits"),
    notes: T("Entegrasyonla yapılan işlemlerde executorApp 'SellerIntegrationApi', satıcı panelinden yapılanlarda 'Seller Center Orders BFF' görünür; başka kayıtlar sizin dışınızdaki işlemlerdir.",
      "Actions done through the integration show executorApp 'SellerIntegrationApi', actions from the seller panel show 'Seller Center Orders BFF'; any other entries are actions not taken by you."),
  },
  {
    id: "updateTestClaimToWaitingInAction", group: "claims", area: "returns", envs: ["stage"],
    title: T("Test iadesini WaitingInAction yap (stage)", "Move test return to WaitingInAction (stage)"),
    summary: T("Stage ortamındaki test siparişleri için oluşturulan iadeyi test senaryoları için WaitingInAction durumuna alır.", "Moves a return created for a stage test order to WaitingInAction so you can test approve/reject scenarios."),
    method: "PUT", path: "/integration/test/order/sellers/{sellerId}/claims/waiting-in-action",
    params: [],
    body: {
      kind: "json", example: { shipmentPackageId: 56526451 },
      fields: [{ path: "shipmentPackageId", type: "integer", required: true, description: T("getClaims yanıtındaki orderShipmentPackageId değeri.", "The orderShipmentPackageId value returned by getClaims.") }],
    },
    risk: "write", rateLimit: T("Genel limit: 50 istek / 10 sn.", "General limit: 50 req / 10 s."), docsUrl: ref("updateTestClaimToWaitingInAction"),
    notes: T("Yalnızca stage ortamında vardır (stageapigw.trendyol.com).", "Exists on the stage environment only (stageapigw.trendyol.com)."),
  },

  /* ───────────────────────── Customer questions ───────────────────────── */
  {
    id: "getQuestionFilter", group: "questions", area: "questions",
    title: T("Müşteri sorularını filtrele", "Filter customer questions"),
    summary: T("Satıcıya gelen müşteri sorularını barkod, durum ve tarihe göre sayfalayarak listeler.", "Lists questions received by the seller, filtered by barcode, status and date, with pagination."),
    method: "GET", path: "/integration/qna/sellers/{sellerId}/questions/filter",
    params: [
      { name: "barcode", in: "query", type: "string", description: T("Belirli bir ürünün sorularını getirmek için ürün barkodu.", "Product barcode to get the questions of a specific product."), example: "8680000000011" },
      { name: "status", in: "query", type: "string", enum: ["WAITING_FOR_ANSWER", "ANSWERED", "REJECTED", "REPORTED"], description: T("Sorunun durumu.", "Status of the question."), example: "WAITING_FOR_ANSWER" },
      ts("startDate", "Başlangıç tarihi (epoch milisaniye).", "Start date (epoch ms)."), ts("endDate", "Bitiş tarihi (epoch milisaniye).", "End date (epoch ms)."),
      { name: "orderByField", in: "query", type: "string", enum: ["CreatedDate", "LastModifiedDate"], default: "CreatedDate", description: T("Sıralama alanı.", "Field to sort by.") },
      { name: "orderByDirection", in: "query", type: "string", enum: ["ASC", "DESC"], default: "DESC", description: T("Sıralama yönü.", "Sort direction.") },
      page(), size(10, 200),
    ],
    body: { kind: "none" }, risk: "read",
    table: { listPath: "content", columns: [
      { key: "id", label: T("Soru no", "Question ID") }, { key: "text", label: T("Soru", "Question") }, { key: "status", label: T("Durum", "Status") },
      { key: "productName", label: T("Ürün", "Product") }, { key: "userName", label: T("Müşteri", "Customer") }, { key: "creationDate", label: T("Tarih", "Date") },
    ] },
    pagination: { pageParam: "page", sizeParam: "size", maxSize: 200, firstPage: 0 },
    rateLimit: T("1000 istek/dk.", "1000 req/min."), docsUrl: ref("getQuestionFilter"),
    notes: T("Tarih verilmezse son 1 haftanın soruları gelir; startDate ve endDate birlikte verilirse aralık en fazla 2 hafta olabilir. Durumlar: WAITING_FOR_ANSWER (cevap bekliyor), ANSWERED, REPORTED (satıcı bildirdi), REJECTED (cevap reddedildi), UNANSWERED (süre doldu). Rehberde size varsayılanı 20/en fazla 50, referans sayfasında 10/200 yazar; burada referans kullanılır.",
      "Without dates you get the last week's questions; if startDate and endDate are both sent, the interval can be at most 2 weeks. Statuses: WAITING_FOR_ANSWER, ANSWERED, REPORTED (reported by seller), REJECTED (answer rejected), UNANSWERED (time expired). The guide states size default 20/max 50, the reference 10/200; the reference is used here."),
  },
  {
    id: "getQuestion", group: "questions", area: "questions",
    title: T("Soru detayını getir", "Get question detail"),
    summary: T("Kimliği verilen tek bir müşteri sorusunun tüm ayrıntılarını getirir.", "Retrieves all details of a single customer question by its ID."),
    method: "GET", path: "/integration/qna/sellers/{sellerId}/questions/{id}",
    params: [{ name: "id", in: "path", type: "integer", required: true, description: T("Detayı istenen sorunun kimliği.", "ID of the question to retrieve."), example: 1000101 }],
    body: { kind: "none" }, risk: "read", rateLimit: T("1000 istek/dk.", "1000 req/min."), docsUrl: ref("getQuestion"),
    notes: T("Cevaplanmış sorularda answer, reddedilmiş cevaplarda rejectedAnswer/rejectedDate/reason, bildirilmiş sorularda reportReason/reportedDate dolar.",
      "Answered questions fill answer, rejected answers fill rejectedAnswer/rejectedDate/reason, reported questions fill reportReason/reportedDate."),
  },
  {
    id: "answerQuestion", group: "questions", area: "questions",
    title: T("Soruyu cevapla", "Answer a question"),
    summary: T("Müşteri sorusuna cevap verir; cevap değerlendirildikten sonra yayınlanır.", "Answers a customer question; the answer is published after evaluation."),
    method: "POST", path: "/integration/qna/sellers/{sellerId}/questions/{id}/answers",
    params: [{ name: "id", in: "path", type: "integer", required: true, description: T("Cevaplanacak sorunun kimliği.", "ID of the question to answer."), example: 1000101 }],
    body: {
      kind: "json", example: { text: "Merhaba, ürünümüz %100 pamuktur. Yıkama talimatı etiket üzerinde yer almaktadır." },
      fields: [{ path: "text", type: "string (10-2000)", required: true, description: T("Cevap metni; en az 10, en fazla 2000 karakter.", "Answer text; min 10, max 2000 characters.") }],
    },
    risk: "write", rateLimit: T("500 istek/dk.", "500 req/min."), docsUrl: ref("answerQuestion"),
    notes: T("Yalnızca WAITING_FOR_ANSWER durumundaki sorular cevaplanabilir; cevaplanmış soru tekrar cevaplanamaz (geri alınamaz). Cevap yasaklı kelime kontrolünden geçer: yasaklı kelime varsa cevap reddedilir ve soru WAITING_FOR_ANSWER'a döner; belirli sayıda denemeden sonra soru UNANSWERED olur. Soru, 3 iş günü içinde cevaplanmazsa kapanır. Hatalar: 'Question already answered', 'Time limit exceeded', 'Forbidden word limit exceeded', 'Response too short', 'Response too long', 'Empty response'.",
      "Only questions in WAITING_FOR_ANSWER can be answered; an answered question cannot be re-answered (irreversible). Answers are checked for forbidden words: if found, the answer is rejected and the question returns to WAITING_FOR_ANSWER; after a certain number of attempts it becomes UNANSWERED. A question not answered within 3 business days is closed. Errors: 'Question already answered', 'Time limit exceeded', 'Forbidden word limit exceeded', 'Response too short', 'Response too long', 'Empty response'."),
  },
  {
    id: "createQuestion", group: "questions", area: "questions", envs: ["stage"],
    title: T("Test müşteri sorusu oluştur (stage)", "Create a customer question (stage)"),
    summary: T("Stage ortamında belirli bir ürün için yeni bir müşteri sorusu oluşturur.", "Creates a new customer question for a given product in the stage environment."),
    method: "POST", path: "/integration/qna/sellers/{sellerId}/questions",
    params: [],
    body: {
      kind: "json", example: { text: "Bu ürünün kumaşı pamuklu mu?", contentId: 2397814, userId: 4147346, userFullName: "Test User", showUserName: false, channelId: 1 },
      fields: [
        { path: "text", type: "string", required: true, description: T("Soru metni, boş olamaz.", "Question text, must not be empty.") },
        { path: "contentId", type: "integer", required: true, description: T("Sorunun sorulacağı ürünün content ID değeri.", "Content ID of the product the question is asked for.") },
        { path: "userId", type: "integer", required: true, description: T("Soruyu soran kullanıcının kimliği (örnekteki 4147346 kullanılabilir).", "ID of the user asking (the 4147346 from the sample can be used).") },
        { path: "showUserName", type: "boolean", required: true, description: T("Müşteri adının gösterilip gösterilmeyeceği.", "Whether the customer's name is displayed.") },
        { path: "userFullName", type: "string", description: T("Soran kullanıcının adı soyadı (isteğe bağlı).", "Full name of the user (optional).") },
        { path: "channelId", type: "integer", description: T("Kanal kimliği; 1 gönderebilirsiniz (isteğe bağlı).", "Channel ID; you can send 1 (optional).") },
      ],
    },
    risk: "write", rateLimit: T("Genel limit: 50 istek / 10 sn.", "General limit: 50 req / 10 s."), docsUrl: "https://developers.trendyol.com/v2.0/docs/creating-customer-questions-in-stage-environment",
    notes: T("Yalnızca stage ortamında vardır. Rehber sayfasında operationId verilmediği için 'createQuestion' adı UNVERIFIED'dır; yol ve gövde rehberden alınmıştır. Oluşan soru yayınlanmadan önce değerlendirilir; yanıt {questionId}.",
      "Stage only. The guide gives no operationId, so the name 'createQuestion' is UNVERIFIED; path and body come from the guide. The created question is evaluated before it is published; response {questionId}."),
  },

  /* ───────────────────────── Invoice integration ───────────────────────── */
  {
    id: "sendInvoiceLink", group: "invoices", area: "orders",
    title: T("Fatura linki gönder", "Send customer invoice link"),
    summary: T("Siparişin fatura linkini Trendyol'a iletir; Trendyol müşteriye bu linki içeren e-fatura e-postası gönderir.", "Sends the order's invoice link to Trendyol; Trendyol e-mails the customer the link."),
    method: "POST", path: "/integration/sellers/{sellerId}/seller-invoice-links",
    params: [],
    body: {
      kind: "json", example: { invoiceLink: "https://developers.trendyolefaturam.com/invoice-example.pdf", shipmentPackageId: 435346, invoiceDateTime: 1678788898, invoiceNumber: "TY41234567890123" },
      fields: [
        { path: "invoiceLink", type: "string (uri)", required: true, description: T("e-Fatura/e-Arşiv linki; yasal olarak 8 yıl erişilebilir olmalıdır.", "e-Invoice / e-Archive link; must stay accessible for 8 years (legal).") },
        { path: "shipmentPackageId", type: "integer", required: true, description: T("Trendyol sipariş paketi kimliği.", "Trendyol order package ID.") },
        { path: "invoiceNumber", type: "string (16)", description: T("16 karakter: ilk 3 harf/rakam, son 13 rakam. Mikro ihracat paketlerinde zorunlu.", "16 chars: first 3 alphanumeric, last 13 digits. Required for micro export packages.") },
        { path: "invoiceDateTime", type: "integer", description: T("Unix zamanı, saniye (10 hane) veya milisaniye (13 hane); 0'dan büyük. Mikro ihracatta zorunlu.", "Unix time, seconds (10 digits) or ms (13 digits); > 0. Required for micro export.") },
      ],
    },
    risk: "write", rateLimit: T("Genel limit: 50 istek / 10 sn.", "General limit: 50 req / 10 s."), docsUrl: ref("sendInvoiceLink"),
    notes: T("YASAL ZORUNLULUK: link 8 yıl erişilebilir kalmalıdır. Siparişteki şifreli e-posta adresine PDF ekleyemiyorsanız bu servisi kullanmalısınız. 4 Ağustos 2023'ten itibaren invoiceNumber ve invoiceDateTime gönderilmelidir. Hatalı beslenen fatura deleteInvoiceLink ile silinip yeniden gönderilebilir. 409: pakete zaten fatura girilmiş veya link başka pakete girilmiş. Başarılı yanıt 201.",
      "LEGAL: the link must be accessible for 8 years. If you cannot attach the PDF to the order's encrypted e-mail address you must use this service. Since 4 Aug 2023 send invoiceNumber and invoiceDateTime. A wrongly fed invoice can be removed with deleteInvoiceLink and re-sent. 409: the package already has an invoice or the link was fed to another package. Success is 201."),
  },
  {
    id: "deleteInvoiceLink", group: "invoices", area: "orders",
    title: T("Fatura linkini sil", "Delete customer invoice link"),
    summary: T("Daha önce hatalı gönderilen fatura linkini siler; ardından sendInvoiceLink ile yeniden gönderebilirsiniz.", "Deletes a previously mis-fed invoice link so it can be fed again with sendInvoiceLink."),
    method: "POST", path: "/integration/sellers/{sellerId}/seller-invoice-links/delete",
    params: [],
    body: {
      kind: "json", example: { serviceSourceId: 88787, channelId: 1, customerId: 888888888 },
      fields: [
        { path: "serviceSourceId", type: "integer", required: true, description: T("shipmentPackageId değeri.", "The shipmentPackageId value.") },
        { path: "channelId", type: "integer", required: true, description: T("Her zaman 1 gönderilmelidir.", "Must always be 1.") },
        { path: "customerId", type: "integer", required: true, description: T("Müşteri kimliği; getShipmentPackages yanıtından alınır.", "Customer ID; taken from getShipmentPackages.") },
      ],
    },
    risk: "destructive", rateLimit: T("Genel limit: 50 istek / 10 sn.", "General limit: 50 req / 10 s."), docsUrl: ref("deleteInvoiceLink"),
    notes: T("Müşteriye giden fatura bağlantısını kaldırır; yenisini göndermezseniz sipariş faturasız kalır. Başarılı yanıt 202 (kabul edildi); link yoksa 404.",
      "Removes the invoice link the customer received; unless you send a new one the order stays without an invoice. Success is 202 (accepted); 404 when the link is not found."),
  },
  {
    id: "uploadInvoiceFile", group: "invoices", area: "orders",
    title: T("Fatura dosyası yükle", "Send customer invoice file"),
    summary: T("Sipariş paketi için fatura dosyasını (PDF, JPEG, PNG) form-data ile yükler.", "Uploads the invoice file (PDF, JPEG, PNG) for an order package as form-data."),
    method: "POST", path: "/integration/sellers/{sellerId}/seller-invoice-file",
    params: [],
    body: {
      kind: "multipart", example: { shipmentPackageId: 435346, invoiceDateTime: 1678788898, invoiceNumber: "TY41234567890123" },
      file: { field: "file", accept: ["application/pdf", "image/jpeg", "image/png"] },
      fields: [
        { path: "shipmentPackageId", type: "integer", required: true, description: T("Sipariş paketi kimliği (form-data, metin).", "Order package ID (form-data, text).") },
        { path: "file", type: "file", required: true, description: T("Fatura dosyası: PDF, JPEG veya PNG; en fazla 10 MB.", "Invoice file: PDF, JPEG or PNG; max 10 MB.") },
        { path: "invoiceNumber", type: "string (16)", description: T("16 karakterli fatura numarası; mikro ihracatta zorunlu.", "16-character invoice number; required for micro export.") },
        { path: "invoiceDateTime", type: "integer", description: T("Unix zamanı (saniye veya milisaniye); mikro ihracatta zorunlu, gelecek tarihli olamaz.", "Unix time (seconds or ms); required for micro export, cannot be in the future.") },
      ],
    },
    risk: "write", rateLimit: T("Genel limit: 50 istek / 10 sn.", "General limit: 50 req / 10 s."), docsUrl: ref("uploadInvoiceFile"),
    notes: T("JSON gövde yoktur; alanlar form-data olarak gönderilir. TR siparişleri için shipmentPackageId + file yeterlidir; mikro ihracatta invoiceDateTime ve invoiceNumber de zorunludur. Gelecek tarihli fatura eklenemez. Hatalar: paket başka satıcıya ait (403), paket bulunamadı (404), pakete zaten fatura gönderilmiş (409), desteklenmeyen dosya türü / dosya yok / 10 MB aşımı (400).",
      "No JSON body; fields go as form-data. For TR orders shipmentPackageId + file is enough; micro export also requires invoiceDateTime and invoiceNumber. Future-dated invoices are rejected. Errors: package belongs to another seller (403), package not found (404), invoice already sent (409), unsupported file type / no file / over 10 MB (400)."),
  },

  /* ───────────────────────── Seller information ───────────────────────── */
  {
    id: "getSuppliersAddresses", group: "seller", area: "tools",
    title: T("Satıcı adreslerini getir", "Get seller addresses"),
    summary: T("Ürün oluştururken kullanılacak sevkiyat, iade ve fatura adresi ile kargo bilgilerini kimlikleriyle birlikte döndürür.", "Returns shipment, return and invoice addresses (with IDs) to be used when creating products."),
    method: "GET", path: "/integration/sellers/{sellerId}/addresses",
    params: [{ name: "storeFrontCode", in: "header", type: "string", default: "TR", description: T("Satıcının faaliyet gösterdiği ülke kodu (varsayılan TR).", "Country code the seller operates in (default TR)."), example: "TR" }],
    body: { kind: "none" }, risk: "read",
    table: { listPath: "supplierAddresses", columns: [
      { key: "id", label: T("Adres no", "Address ID") }, { key: "addressType", label: T("Tür", "Type") }, { key: "city", label: T("İl", "City") },
      { key: "district", label: T("İlçe", "District") }, { key: "fullAddress", label: T("Adres", "Address") }, { key: "isDefault", label: T("Varsayılan", "Default") },
    ] },
    rateLimit: T("Genel limit: 50 istek / 10 sn.", "General limit: 50 req / 10 s."), docsUrl: ref("getSuppliersAddresses"),
    notes: T("'Satıcı başvuru süreci' tamamlanmadıysa bu servisi kullanmayın. Dönen adres id'leri createProduct v2 isteğindeki shipmentAddressId / returningAddressId / invoiceAddressId alanlarına yazılır.",
      "Do not use this service if the 'seller application process' is not completed. The returned address IDs go into shipmentAddressId / returningAddressId / invoiceAddressId of createProduct v2."),
  },

  /* ───────────────────────── Accounting & finance ───────────────────────── */
  {
    id: "getSettlements", group: "finance", area: "finance",
    title: T("Cari hesap ekstresi: satışlar, iadeler, indirimler", "Get settlements (sales, returns, discounts)"),
    summary: T("Satış, iade, indirim, kupon ve provizyon hareketlerini listeler (Cari Hesap Ekstresi).", "Lists sales, returns, discounts, coupons and provision transactions (current account statement)."),
    method: "GET", path: "/integration/finance/che/sellers/{sellerId}/settlements",
    params: [
      { name: "transactionType", in: "query", type: "string", required: true, enum: ["Sale", "Return", "Discount", "DiscountCancel", "Coupon", "CouponCancel", "ProvisionPositive", "ProvisionNegative", "ManuelRefund", "ManualRefundCancel", "TYDiscount", "TYDiscountCancel", "TYCoupon", "TYCouponCancel", "SellerRevenuePositive", "SellerRevenueNegative", "CommissionPositive", "CommissionNegative", "SellerRevenuePositiveCancel", "SellerRevenueNegativeCancel", "CommissionPositiveCancel", "CommissionNegativeCancel"], description: T("Finansal işlem türü (bir istekte yalnızca 1 tür).", "Type of financial transaction (only 1 type per request)."), example: "Sale" },
      ts("startDate", "Başlangıç tarihi (milisaniye). Zorunlu; bitişle arası en fazla 15 gün.", "Start date (ms). Required; at most 15 days before endDate.", { required: true }),
      ts("endDate", "Bitiş tarihi (milisaniye). Zorunlu.", "End date (ms). Required.", { required: true }),
      { name: "paymentOrderId", in: "query", type: "integer", description: T("Ödeme emri kimliği; siparişleri ödemelerle eşleştirir (rehberde belgelenmiştir).", "Payment order ID; matches orders to payments (documented in the guide)."), example: 5001 },
      page(), size(500, "1000", "Sayfa başına kayıt: 500 veya 1000 (varsayılan 500).", "Page size: 500 or 1000 (default 500).", { enum: ["500", "1000"] }),
    ],
    body: { kind: "none" }, risk: "read",
    table: { listPath: "content", columns: [
      { key: "transactionType", label: T("İşlem türü", "Transaction type") }, { key: "orderNumber", label: T("Sipariş no", "Order no") }, { key: "debt", label: T("Borç", "Debt") },
      { key: "credit", label: T("Alacak", "Credit") }, { key: "commissionAmount", label: T("Komisyon", "Commission") }, { key: "sellerRevenue", label: T("Satıcı hakedişi", "Seller revenue") }, { key: "transactionDate", label: T("Tarih", "Date") },
    ] },
    pagination: { pageParam: "page", sizeParam: "size", maxSize: 1000, firstPage: 0 },
    rateLimit: T("100 istek/dk.", "100 req/min."), docsUrl: ref("getSettlements"),
    notes: T("Başlangıç ve bitiş tarihi zorunludur ve aralık 15 günden uzun olamaz. Finansal kayıtlar sipariş teslim edildikten sonra oluşur. İşlem türü, SellerRevenuePositive ve CommissionNegative birlikte değerlendirilmelidir (SellerRevenueNegative+CommissionPositive, ...Cancel çiftleri de aynı şekilde). paymentOrderId ödemeden sonra oluşur; ödeme emri genelde her Çarşamba vadesi gelen siparişler için açılır. Market satıcıları mağaza bilgisi (storeId/storeName) alır, pazaryeri satıcılarında null döner. affiliate: TRENDYOLTR veya TRENDYOLAZJV. Rehberdeki 'transactionTypes' (birden çok tür) parametresi referans sayfasında yoktur (UNVERIFIED), burada yalnızca transactionType desteklenir. Yol öneki /integration/finance/che'dir (host yine apigw.trendyol.com).",
      "Start and end date are required and the interval cannot exceed 15 days. Financial records are created after the order is delivered. Transaction type, SellerRevenuePositive and CommissionNegative must be evaluated together (likewise SellerRevenueNegative+CommissionPositive and the ...Cancel pairs). paymentOrderId is created after payment; a payment order is normally opened every Wednesday for orders due that week. Market sellers get store info (storeId/storeName), marketplace sellers get null. affiliate: TRENDYOLTR or TRENDYOLAZJV. The guide's 'transactionTypes' (multiple types) parameter is not in the reference page (UNVERIFIED); only transactionType is supported here. Path prefix is /integration/finance/che (host is still apigw.trendyol.com)."),
  },
  {
    id: "getOtherFinancials", group: "finance", area: "finance",
    title: T("Cari hesap ekstresi: diğer finansal hareketler", "Get other financials"),
    summary: T("Tedarikçi finansmanı, transferler, ödemeler (hakediş), faturalar ve komisyon mutabakat faturalarını listeler.", "Lists supplier financing, transfers, payments (earnings), invoices and commission reconciliation invoices."),
    method: "GET", path: "/integration/finance/che/sellers/{sellerId}/otherfinancials",
    params: [
      { name: "transactionType", in: "query", type: "string", required: true, enum: ["Stoppage", "CashAdvance", "WireTransfer", "IncomingTransfer", "ReturnInvoice", "CommissionAgreementInvoice", "PaymentOrder", "DeductionInvoices", "FinancialItem"], description: T("Finansal işlem türü.", "Type of financial transaction."), example: "PaymentOrder" },
      ts("startDate", "Başlangıç tarihi (milisaniye). Zorunlu; bitişle arası en fazla 15 gün.", "Start date (ms). Required; at most 15 days before endDate.", { required: true }),
      ts("endDate", "Bitiş tarihi (milisaniye). Zorunlu.", "End date (ms). Required.", { required: true }),
      page(), size(500, "1000", "Sayfa başına kayıt: 500 veya 1000 (varsayılan 500).", "Page size: 500 or 1000 (default 500).", { enum: ["500", "1000"] }),
    ],
    body: { kind: "none" }, risk: "read",
    table: { listPath: "content", columns: [
      { key: "transactionType", label: T("İşlem türü", "Transaction type") }, { key: "id", label: T("Kayıt no", "ID") }, { key: "description", label: T("Açıklama", "Description") },
      { key: "debt", label: T("Borç", "Debt") }, { key: "credit", label: T("Alacak", "Credit") }, { key: "paymentOrderId", label: T("Ödeme emri", "Payment order") }, { key: "transactionDate", label: T("Tarih", "Date") },
    ] },
    pagination: { pageParam: "page", sizeParam: "size", maxSize: 1000, firstPage: 0 },
    rateLimit: T("100 istek/dk.", "100 req/min."), docsUrl: ref("getOtherFinancials"),
    notes: T("Başlangıç/bitiş zorunlu, aralık en fazla 15 gün. Kargo faturası seri numarasını bulmak için transactionType=DeductionInvoices ile sorgulayıp işlem türü 'Kargo Faturası' olan kayıtların id değerini kullanın (getCargoInvoiceItems). Yol öneki /integration/finance/che.",
      "Start/end required, interval at most 15 days. To find a cargo invoice serial number, query transactionType=DeductionInvoices and use the id of records whose transaction type is 'Kargo Faturası' (getCargoInvoiceItems). Path prefix /integration/finance/che."),
  },
  {
    id: "getCargoInvoiceItems", group: "cargoInvoice", area: "finance",
    title: T("Kargo fatura detayları", "Get cargo invoice details"),
    summary: T("Trendyol'un satıcıya kestiği kargo faturasının kalemlerini (gönderi/iade kargo bedelleri) listeler.", "Lists the line items (shipment/return cargo fees) of a cargo invoice issued by Trendyol to the seller."),
    method: "GET", path: "/integration/finance/che/sellers/{sellerId}/cargo-invoice/{invoiceSerialNumber}/items",
    params: [{ name: "invoiceSerialNumber", in: "path", type: "string", required: true, description: T("Kargo fatura seri numarası (DeductionInvoices kaydının id değeri).", "Cargo invoice serial number (the id of the DeductionInvoices record)."), example: "DDF2026000123456" }, page(), size(500, "1000")],
    body: { kind: "none" }, risk: "read",
    table: { listPath: "content", columns: [
      { key: "orderNumber", label: T("Sipariş no", "Order no") }, { key: "shipmentPackageType", label: T("Kalem türü", "Item type") }, { key: "parcelUniqueId", label: T("Koli no", "Parcel ID") },
      { key: "amount", label: T("Tutar", "Amount") }, { key: "desi", label: T("Desi", "Desi") },
    ] },
    pagination: { pageParam: "page", sizeParam: "size", maxSize: 1000, firstPage: 0 },
    rateLimit: T("100 istek/dk.", "100 req/min."), docsUrl: ref("getCargoInvoiceItems"),
    notes: T("Seri numarasını bulmak için getOtherFinancials'ı transactionType=DeductionInvoices ile çağırın; işlem türü 'Kargo Faturası' veya 'Kargo Fatura' olan kayıtların Id değeri invoiceSerialNumber'dır. Yol öneki /integration/finance/che. Referans size için en yüksek değer belirtmez; 1000 UNVERIFIED varsayımıdır.",
      "To find the serial number call getOtherFinancials with transactionType=DeductionInvoices; the Id of records whose transaction type is 'Kargo Faturası' or 'Kargo Fatura' is the invoiceSerialNumber. Path prefix /integration/finance/che. The reference states no max for size; 1000 is an UNVERIFIED assumption."),
  },

  /* ───────────────────────── Trendyol Express ───────────────────────── */
  {
    id: "getCompensationTickets", group: "express", area: "finance",
    title: T("Trendyol Express tazmin talepleri", "List Trendyol Express compensation tickets"),
    summary: T("Kargo firması TEX olan sipariş paketleri için açılan tazmin taleplerini listeler.", "Lists compensation tickets for order packages shipped with Trendyol Express (TEX)."),
    method: "GET", path: "/integration/tex/compensation/sellers/{sellerId}/tickets",
    params: [ts("startDate", "Başlangıç tarihi (milisaniye, GMT+3).", "Start date (ms, GMT+3)."), ts("endDate", "Bitiş tarihi (milisaniye, GMT+3).", "End date (ms, GMT+3)."), page(), size(10, 100, "Sayfa başına kayıt (varsayılan 10, en fazla 100).", "Page size (default 10, max 100).")],
    body: { kind: "none" }, risk: "read",
    table: { listPath: "data", columns: [
      { key: "orderNumber", label: T("Sipariş no", "Order no") }, { key: "deliveryNumber", label: T("Teslimat no", "Delivery no") }, { key: "compensateReason", label: T("Neden", "Reason") },
      { key: "currentState", label: T("Durum", "State") }, { key: "stateMessage", label: T("Durum mesajı", "State message") }, { key: "createDate", label: T("Tarih", "Date") },
    ] },
    pagination: { pageParam: "page", sizeParam: "size", maxSize: 100, firstPage: 0 },
    rateLimit: T("Genel limit: 50 istek / 10 sn.", "General limit: 50 req / 10 s."), docsUrl: ref("getCompensationTickets"),
    notes: T("Kayıtlar createDate'e göre azalan sıralanır. Onaylanan tazmin tutarı en geç 15 iş günü içinde Finans > Fatura Listeleme > 'Trendyol'a Kesmem Gereken Faturalar' sayfasına aktarılır. currentState değerleri: Empty/NotCompensationCase/MarkCompensationCancel (reddedildi), MarkInCompensation/OpenedForRefund/CreateCompensationTicket (inceleniyor), StartCompensationFinanceProgress/StartCompensationInApprovalProgress/CompensationApproved/FinalizeCompensation (onaylandı), Found... (kargo bulundu). Referans size için 'en fazla 100' der (şema maksimumu 200); 100 kullanılır.",
      "Records are ordered by createDate descending. The approved amount is moved to Finance > Invoice Listing > 'Invoices I Need to Issue to Trendyol' within 15 business days at most. currentState values: Empty/NotCompensationCase/MarkCompensationCancel (rejected), MarkInCompensation/OpenedForRefund/CreateCompensationTicket (in review), StartCompensationFinanceProgress/StartCompensationInApprovalProgress/CompensationApproved/FinalizeCompensation (approved), Found... (shipment found). The reference says size 'max 100' (schema maximum 200); 100 is used."),
  },

  /* ───────────────────────── Webhooks ───────────────────────── */
  {
    id: "createWebhook", group: "webhooks", area: "tools",
    title: T("Webhook oluştur", "Create webhook"),
    summary: T("Sipariş paketi durum değişiklikleri için bir webhook tanımlar.", "Sets up a webhook for order package status changes."),
    method: "POST", path: "/integration/webhook/sellers/{sellerId}/webhooks",
    params: [], body: { kind: "json", example: webhookExample, fields: webhookBodyFields },
    risk: "write", rateLimit: webhookRate, docsUrl: ref("createWebhook"),
    notes: T(`${webhookLimitNote.tr} Dönen id güncelleme ve silme işlemlerinde kullanılır. API_KEY'de apiKey zorunlu (username/password gerekmez), BASIC_AUTHENTICATION'da username ve password zorunlu. Yeni bir durum eklenirse boş subscribedStatuses ile tanımlı webhook'lar da otomatik alır.`,
      `${webhookLimitNote.en} The returned id is used for update and delete. API_KEY requires apiKey (username/password not needed); BASIC_AUTHENTICATION requires username and password. If a new status is added, webhooks defined with empty subscribedStatuses get it automatically.`),
  },
  {
    id: "getWebhooks", group: "webhooks", area: "tools",
    title: T("Webhook'ları listele", "List webhooks"),
    summary: T("Daha önce oluşturduğunuz webhook tanımlarını listeler.", "Lists the webhooks you created before."),
    method: "GET", path: "/integration/webhook/sellers/{sellerId}/webhooks",
    params: [], body: { kind: "none" }, risk: "read",
    table: { listPath: "", columns: [
      { key: "id", label: T("Kimlik", "ID") }, { key: "url", label: T("Adres", "URL") }, { key: "status", label: T("Durum", "Status") },
      { key: "authenticationType", label: T("Kimlik doğrulama", "Auth type") }, { key: "subscribedStatuses", label: T("Durumlar", "Statuses") }, { key: "createdDate", label: T("Oluşturma", "Created") },
    ] },
    rateLimit: webhookRate, docsUrl: ref("getWebhooks"),
    notes: T("Parola ve apiKey yanıtta dönmez. status: ACTIVE veya PASSIVE. Tarihler GMT+3 zaman damgasıdır.", "Password and apiKey are never returned. status: ACTIVE or PASSIVE. Dates are GMT+3 timestamps."),
  },
  {
    id: "updateWebhook", group: "webhooks", area: "tools",
    title: T("Webhook güncelle", "Update webhook"),
    summary: T("Daha önce oluşturduğunuz bir webhook'u günceller.", "Updates a webhook you created before."),
    method: "PUT", path: "/integration/webhook/sellers/{sellerId}/webhooks/{Id}",
    params: [webhookIdParam], body: { kind: "json", example: webhookExample, fields: webhookBodyFields },
    risk: "write", rateLimit: webhookRate, docsUrl: ref("updateWebhook"),
    notes: T(`${webhookLimitNote.tr} Yanıt 200 OK'tir.`, `${webhookLimitNote.en} The response is 200 OK.`),
  },
  {
    id: "deleteWebhook", group: "webhooks", area: "tools",
    title: T("Webhook sil", "Delete webhook"),
    summary: T("Daha önce oluşturduğunuz bir webhook'u siler.", "Deletes a webhook you created before."),
    method: "DELETE", path: "/integration/webhook/sellers/{sellerId}/webhooks/{Id}",
    params: [webhookIdParam], body: { kind: "none" }, risk: "destructive", rateLimit: webhookRate, docsUrl: ref("deleteWebhook"),
    notes: T("Geri alınamaz; sipariş bildirimleri anında durur. Silinen webhook 15'lik kotadan düşer. Bulunamazsa 404.", "Irreversible; order notifications stop immediately. A deleted webhook frees a slot of the 15-webhook quota. 404 when not found."),
  },
  {
    id: "activateWebhook", group: "webhooks", area: "tools",
    title: T("Webhook'u aktifleştir", "Activate webhook"),
    summary: T("Pasif durumdaki bir webhook'u aktif hale getirir.", "Sets a passive webhook to active."),
    method: "PUT", path: "/integration/webhook/sellers/{sellerId}/webhooks/{Id}/activate",
    params: [webhookIdParam], body: { kind: "none" }, risk: "write", rateLimit: webhookRate, docsUrl: ref("activateWebhook"),
    notes: T("Hata nedeniyle Trendyol tarafından pasife alınan webhook'u, sorunu giderdikten sonra buradan tekrar açabilirsiniz.", "A webhook deactivated by Trendyol after errors can be re-activated here once you fixed the problem."),
  },
  {
    id: "deactivateWebhook", group: "webhooks", area: "tools",
    title: T("Webhook'u pasifleştir", "Deactivate webhook"),
    summary: T("Aktif durumdaki bir webhook'u pasif hale getirir.", "Sets an active webhook to passive."),
    method: "PUT", path: "/integration/webhook/sellers/{sellerId}/webhooks/{Id}/deactivate",
    params: [webhookIdParam], body: { kind: "none" }, risk: "write", rateLimit: webhookRate, docsUrl: ref("deactivateWebhook"),
    notes: T("Pasif webhook bildirim almaz ama 15'lik webhook kotasına dahildir. activateWebhook ile tekrar açılabilir.", "A passive webhook receives no notifications but still counts toward the 15-webhook quota. It can be re-enabled with activateWebhook."),
  },
];

export { WEBHOOK_STATUSES };

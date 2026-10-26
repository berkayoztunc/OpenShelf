import type { BodyField, OpParam, OpTable, Text, TrendyolOperation } from "@openshelf/shared";

/**
 * Order Integration + Split + Shipping Alternative Delivery + Address Information + Common Label + Test Order API.
 * Source: official docs v2.0 (reference pages + guides), fetched 2026-10-26. Paths are the part after the host.
 */
const t = (tr: string, en: string): Text => ({ tr, en });
const ref = (slug: string) => `https://developers.trendyol.com/v2.0/reference/${slug}`;
const RATE = t("Endpoint başına 10 sn'de 50 istek; aşılırsa 429 (too.many.requests).", "50 requests / 10 s per endpoint; exceeding returns 429 (too.many.requests).");
const MP = "/integration/order/sellers/{sellerId}/shipment-packages";

const packageId: OpParam = {
  name: "packageId", in: "path", type: "integer", required: true, example: 3330111111,
  description: t("Paket kimliği (getShipmentPackages yanıtındaki shipmentPackageId).", "Package id (shipmentPackageId returned by getShipmentPackages)."),
};
const cargoTrackingNumber: OpParam = {
  name: "cargoTrackingNumber", in: "path", type: "string", required: true, example: "7280027504111111",
  description: t("Kargo takip numarası (paketin cargoTrackingNumber değeri).", "Cargo tracking number (the package's cargoTrackingNumber)."),
};
const f = (path: string, type: string, description: Text, required = false): BodyField => ({ path, type, required, description });
const STATUSES = ["Awaiting", "Created", "Picking", "Invoiced", "Shipped", "Cancelled", "Delivered", "UnDelivered", "Returned", "AtCollectionPoint", "UnSupplied", "UnPacked", "Verified"];
const pkgColumns: OpTable["columns"] = [
  { key: "orderNumber", label: t("Sipariş no", "Order no.") },
  { key: "shipmentPackageId", label: t("Paket no", "Package id") },
  { key: "status", label: t("Durum", "Status") },
  { key: "customerFirstName", label: t("Müşteri adı", "Customer first name") },
  { key: "customerLastName", label: t("Müşteri soyadı", "Customer last name") },
  { key: "packageTotalPrice", label: t("Tutar (TRY)", "Total (TRY)") },
  { key: "cargoProviderName", label: t("Kargo", "Cargo provider") },
  { key: "cargoTrackingNumber", label: t("Takip no", "Tracking no.") },
  { key: "orderDate", label: t("Sipariş tarihi", "Order date") },
];
const idName: OpTable = { listPath: "", columns: [{ key: "id", label: t("Kimlik", "Id") }, { key: "name", label: t("Ad", "Name") }] };
const STAGE_NOTE = t(
  "Yalnızca STAGE ortamında çalışır (test satıcı hesabı, Basic Auth ve istekte sellerID header'ı gerekir; Trendyol tarafında IP beyaz listesi şart).",
  "STAGE only (test seller account, Basic Auth and a sellerID header are required; Trendyol-side IP whitelisting needed).",
);
const NO_BODY = { kind: "none" as const };

export const operations: TrendyolOperation[] = [
  // ───────────── Order Integration ─────────────
  {
    id: "getShipmentPackages", group: "orders", area: "orders",
    title: t("Sipariş paketlerini getir", "Get order packages"),
    summary: t("Müşterilerin verdiği siparişlere ait sevkiyat paketlerini durum, tarih ve numaraya göre listeler.", "Lists the shipment packages of customer orders, filtered by status, date and number."),
    method: "GET", path: "/integration/order/sellers/{sellerId}/v2/orders",
    params: [
      { name: "startDate", in: "query", type: "timestamp_ms", description: t("Bu tarihten sonraki paketler (Unix ms). startDate+endDate aralığı en fazla 2 hafta olabilir.", "Packages from this date (Unix ms). The startDate/endDate range may be at most 2 weeks."), example: 1761955200000 },
      { name: "endDate", in: "query", type: "timestamp_ms", description: t("Bu tarihe kadar olan paketler (Unix ms).", "Packages up to this date (Unix ms)."), example: 1762560000000 },
      { name: "page", in: "query", type: "integer", default: 0, description: t("Sayfa numarası (0'dan başlar). En fazla 10.000 kayda erişilir (page 0–49, size 200).", "Page number (zero-based). Only the first 10,000 records are reachable (page 0–49 at size 200)."), example: 0 },
      { name: "size", in: "query", type: "integer", default: 200, description: t("Sayfa boyutu, en fazla 200.", "Page size, maximum 200."), example: 50 },
      { name: "orderNumber", in: "query", type: "string", description: t("Yalnızca bu sipariş numarasının paketlerini getirir.", "Only packages of this order number."), example: "10751234567" },
      { name: "status", in: "query", type: "array", arrayStyle: "comma", enum: STATUSES, description: t("Paket durumu; virgülle birden fazla gönderilebilir (ör. Created,Picking). İptaller için Cancelled,UnSupplied; bölünenler için UnPacked.", "Package status; several may be comma separated (e.g. Created,Picking). Use Cancelled,UnSupplied for cancellations and UnPacked for split packages."), example: "Created,Picking" },
      { name: "orderByField", in: "query", type: "string", enum: ["PackageLastModifiedDate", "CreatedDate"], default: "PackageLastModifiedDate", description: t("Sıralama alanı: son güncelleme veya sipariş oluşturma tarihi.", "Sort field: last modification or order creation date."), example: "PackageLastModifiedDate" },
      { name: "orderByDirection", in: "query", type: "string", enum: ["ASC", "DESC"], description: t("ASC eskiden yeniye, DESC yeniden eskiye.", "ASC old to new, DESC new to old."), example: "DESC" },
      { name: "shipmentPackageIds", in: "query", type: "array", arrayStyle: "comma", description: t("Paket kimliklerine göre filtre (en fazla 50).", "Filter by package ids (max 50)."), example: "3330111111" },
      { name: "barcode", in: "query", type: "string", description: t("Ürün barkoduna göre filtre (kılavuzda geçer, OpenAPI şemasında yok).", "Filter by product barcode (mentioned in the guide, absent from the OpenAPI schema)."), example: "8680000000011" },
    ],
    body: NO_BODY, risk: "read",
    table: { listPath: "content", columns: pkgColumns },
    pagination: { pageParam: "page", sizeParam: "size", maxSize: 200, firstPage: 0 },
    rateLimit: t("Dakikada en fazla 1000 istek (yoğun kullanımda 429 sıklaşabilir).", "At most 1000 requests per minute (429 may become more frequent under heavy use)."),
    docsUrl: ref("getshipmentpackages"),
    notes: t(
      "Order V2 (/v2/orders) 15 Ekim 2026 itibarıyla zorunlu; eski /orders uç noktası kullanımdan kalktı. Parametresiz çağrı yalnızca son 1 haftayı döner; startDate+endDate aralığı en fazla 2 hafta, erişilebilir veri son 1 ay, en fazla 10.000 paket (shipmentPackageId bazında). Daha fazlası için getShipmentPackagesStream kullanın. Akış: Created → Picking → Invoiced → Shipped → Delivered. Awaiting durumundaki siparişlerle yalnızca stok işlemi yapın. Paket kısmen iptal edilirse yeni shipmentPackageId ve takip no üretilir, orderNumber aynı kalır. orderDate GMT+3 ms damgasıdır, createdDate GMT'dir. Cevap alanları (lines[].lineId, packageHistories, lastModifiedDate…) kılavuz örneğinden alınmıştır; OpenAPI şeması bazı alanları farklı adlandırır (id/packageHistory).",
      "Order V2 (/v2/orders) is mandatory from 15 Oct 2026; the legacy /orders endpoint is deprecated. A call without parameters returns only the last 1 week; the startDate+endDate range is at most 2 weeks, reachable data is the last 1 month, at most 10,000 packages (counted per shipmentPackageId). Use getShipmentPackagesStream for more. Flow: Created → Picking → Invoiced → Shipped → Delivered. Only do inventory work with Awaiting orders. A partially cancelled package gets a new shipmentPackageId and tracking number, orderNumber stays. orderDate is a GMT+3 ms stamp, createdDate is GMT. Response fields (lines[].lineId, packageHistories, lastModifiedDate…) follow the guide sample; the OpenAPI schema names some fields differently (id/packageHistory).",
    ),
  },
  {
    id: "getShipmentPackagesStream", group: "orders", area: "orders",
    title: t("Sipariş paketlerini akışla getir (cursor)", "Get shipment packages via stream (cursor)"),
    summary: t("Büyük veri taraması ve periyodik senkron için cursor tabanlı paket listesi; sıralama son değişikliğe göre yeniden eskiye sabittir.", "Cursor-based package list for large scans and periodic sync; fixed order by last modified date, newest first."),
    method: "GET", path: "/integration/order/sellers/{sellerId}/orders/stream",
    params: [
      { name: "size", in: "query", type: "integer", default: 50, description: t("İstek başına paket sayısı (varsayılan 50, en fazla 200).", "Packages per request (default 50, max 200)."), example: 50 },
      { name: "nextCursor", in: "query", type: "string", description: t("Bir önceki yanıttaki nextCursor, olduğu gibi gönderin. İlk istekte GÖNDERMEYİN; filtreleri değiştirirseniz 400 alırsınız.", "nextCursor from the previous response, sent as-is. Do NOT send it in the first request; changing filters gives 400.") },
      { name: "packageItemStatuses", in: "query", type: "array", arrayStyle: "comma", enum: STATUSES.filter((s) => s !== "Verified"), description: t("Paket kalemi durumları, virgülle ayrılmış.", "Package item statuses, comma separated."), example: "Created,Picking" },
      { name: "lastModifiedStartDate", in: "query", type: "timestamp_ms", description: t("Bu tarihten sonra değişen paketler (Unix ms).", "Packages modified after this date (Unix ms)."), example: 1761955200000 },
      { name: "lastModifiedEndDate", in: "query", type: "timestamp_ms", description: t("Bu tarihten önce değişen paketler (Unix ms).", "Packages modified before this date (Unix ms)."), example: 1762560000000 },
    ],
    body: NO_BODY, risk: "read",
    table: { listPath: "content", columns: pkgColumns },
    rateLimit: t("En az 5 sn arayla istek önerilir; 429 dönebilir.", "Requests at least 5 s apart recommended; 429 may occur."),
    docsUrl: ref("getshipmentpackagesstream"),
    notes: t(
      "Yanıt getShipmentPackages ile aynıdır ama page/totalPages/totalElements yerine size, hasMore ve nextCursor döner (hasMore=false iken nextCursor boştur). nextCursor opaktır, değiştirmeyin; filtre değişirse yeni akış başlatın (aksi halde 400). Son 3 aya erişilir, tarih aralığı en fazla 2 hafta; tarih verilmezse son 2 hafta alınır.",
      "Same response as getShipmentPackages but with size, hasMore and nextCursor instead of page/totalPages/totalElements (nextCursor is empty when hasMore=false). nextCursor is opaque, never modify it; start a new stream when filters change (else 400). Last 3 months are reachable, the date range is at most 2 weeks; without dates the last 2 weeks are used.",
    ),
  },
  {
    id: "updatePackage", group: "orders", area: "orders",
    title: t("Paketi bildir (Picking / Invoiced)", "Notify packages (Picking / Invoiced)"),
    summary: t("Siparişi hazırlanıyor (Picking) veya faturalandı (Invoiced) olarak Trendyol'a bildirir.", "Notifies Trendyol that the package is being picked (Picking) or invoiced (Invoiced)."),
    method: "PUT", path: `${MP}/{packageId}`,
    params: [packageId],
    body: {
      kind: "json",
      example: { lines: [{ lineId: 4765111111, quantity: 1 }], params: {}, status: "Picking" },
      fields: [
        f("status", "string (Picking|Invoiced)", t("Yeni paket durumu. Önce Picking, sonra Invoiced bildirin.", "New package status. Notify Picking first, then Invoiced."), true),
        f("lines[].lineId", "integer", t("Sipariş satırı kimliği.", "Order line id."), true),
        f("lines[].quantity", "integer", t("Satırdaki adet.", "Quantity of the line."), true),
        f("params.invoiceNumber", "string", t("Invoiced durumunda fatura numarası (ör. EME2018000025208).", "Invoice number for Invoiced (e.g. EME2018000025208).")),
      ],
    },
    risk: "write", rateLimit: RATE, docsUrl: ref("updatepackagestatus"),
    notes: t(
      "Yalnızca Picking ve Invoiced bildirilebilir; diğer durumlara sistem otomatik geçirir. Sıra: Created → Picking → Invoiced → Shipped → Delivered. Invoiced örneği: {\"lines\":[{\"lineId\":4765111111,\"quantity\":1}],\"params\":{\"invoiceNumber\":\"EME2018000025208\"},\"status\":\"Invoiced\"}. Fatura bildirimi, müşteri kaynaklı iptallerin Trendyol Müşteri Hizmetleri'ne ulaşmasını önleyen referanstır. Resmi OpenAPI operationId'si updatePackageStatus'tur.",
      "Only Picking and Invoiced can be notified; the system moves the package to other statuses automatically. Order: Created → Picking → Invoiced → Shipped → Delivered. Invoiced example: {\"lines\":[{\"lineId\":4765111111,\"quantity\":1}],\"params\":{\"invoiceNumber\":\"EME2018000025208\"},\"status\":\"Invoiced\"}. The invoice notification is the reference that keeps customer-initiated cancellations from reaching Trendyol Customer Care. The official OpenAPI operationId is updatePackageStatus.",
    ),
  },
  {
    id: "cancelOrderPackageItem", group: "orders", area: "orders",
    title: t("Paket kalemini iptal et", "Cancel order package item"),
    summary: t("Paketteki bir veya daha fazla kalemi gerekçe kodu ile iptal eder (tedarik edilemedi).", "Cancels one or more items of a package with a reason id (unsupplied)."),
    method: "PUT", path: `${MP}/{packageId}/items/unsupplied`,
    params: [packageId],
    body: {
      kind: "json",
      example: { lines: [{ lineId: 4765111111, quantity: 1 }], reasonId: 500 },
      fields: [
        f("lines[].lineId", "integer", t("İptal edilecek sipariş satırı.", "Order line to cancel."), true),
        f("lines[].quantity", "integer", t("İptal edilecek adet.", "Quantity to cancel."), true),
        f("reasonId", "integer (500|501|502|504|505|506)", t("İptal gerekçesi: 500 Stok Yok, 501 Hatalı Ürün, 502 Yanlış Fiyat, 504 Entegrasyon Sorunu, 505 Toplu Alım, 506 Mücbir Sebep.", "Reason: 500 Stock Out, 501 Defective Product, 502 Incorrect Price, 504 Integration Problem, 505 Bulk purchase, 506 Force Majeure."), true),
      ],
    },
    risk: "destructive", rateLimit: RATE, docsUrl: ref("cancelorderpackageitem"),
    notes: t(
      "Geri alınamaz. Tüm kalemler iptal edilirse paket Cancelled olur; kısmi iptalde mevcut shipmentPackageId geçersiz olur (Cancelled), aynı orderNumber altında yeni shipmentPackageId ve cargoTrackingNumber üretilir; yeni paketi getShipmentPackages ile çekin. Resmi operationId cancelOrderPackageItem (başlıkta updatePackage).",
      "Irreversible. Cancelling every item makes the package Cancelled; on partial cancellation the current shipmentPackageId becomes invalid (Cancelled) and a new shipmentPackageId and cargoTrackingNumber are generated under the same orderNumber; fetch the new package with getShipmentPackages.",
    ),
  },
  {
    id: "updateBoxInfo", group: "orders", area: "orders",
    title: t("Desi ve koli adedini bildir", "Notify deci and box quantity"),
    summary: t("UPS Kargo ve CEVA Lojistik paketleri için desi ve koli adedini besler.", "Feeds deci and box quantity for UPS Cargo and CEVA Logistics packages."),
    method: "PUT", path: `${MP}/{packageId}/box-info`,
    params: [packageId],
    body: {
      kind: "json", example: { deci: 4.4, boxQuantity: 2 },
      fields: [f("deci", "number", t("Desi değeri.", "Deci value."), true), f("boxQuantity", "integer", t("Koli adedi.", "Box quantity."), true)],
    },
    risk: "write", rateLimit: RATE, docsUrl: ref("updateboxinfo"),
    notes: t("Yalnızca UPS Kargo ve CEVA Lojistik paketleri içindir.", "Only for UPS Cargo and CEVA Logistics packages."),
  },
  {
    id: "deliveredByService", group: "orders", area: "orders",
    title: t("Servise teslim edildi", "Delivery by service"),
    summary: t("Ürünleri yetkili servise teslim eden satıcıların paketi 'servis tarafından teslim' olarak işaretlemesi içindir.", "For sellers who hand products to the authorized service: marks the package as delivered by service."),
    method: "PUT", path: `${MP}/{packageId}/delivered-by-service`,
    params: [packageId], body: NO_BODY, risk: "write", rateLimit: RATE, docsUrl: ref("deliveredbyservice"),
    notes: t("Gövde yoktur. Hangi paket durumlarında kabul edildiği dokümanda belirtilmemiştir (UNVERIFIED).", "No body. The package statuses it accepts are not specified in the docs (UNVERIFIED)."),
  },
  {
    id: "changeCargoProvider", group: "orders", area: "orders",
    title: t("Kargo firmasını değiştir", "Change cargo provider"),
    summary: t("Paketin kargo firmasını değiştirir.", "Changes the cargo provider of a package."),
    method: "PUT", path: `${MP}/{packageId}/cargo-providers`,
    params: [packageId],
    body: {
      kind: "json", example: { cargoProvider: "ARASMP" },
      fields: [f("cargoProvider", "string", t("Kargo kodu: YKMP, ARASMP, SURATMP, HOROZMP, DHLECOMMP, PTTMP, CEVAMP, TEXMP, UPSMP, KOLAYGELSINMP, CEVATEDARIK.", "Cargo code: YKMP, ARASMP, SURATMP, HOROZMP, DHLECOMMP, PTTMP, CEVAMP, TEXMP, UPSMP, KOLAYGELSINMP, CEVATEDARIK."), true)],
    },
    risk: "write", rateLimit: RATE, docsUrl: ref("changecargoprovider"),
    notes: t(
      "Bir paket için 5 dakikada yalnızca bir kez yapılabilir. Değişiklikten sonra paketi getShipmentPackages ile kontrol edin. TEX kargoda limit yoksa TEXMP ile değişiklik yapamazsınız. CEVATEDARIK yalnızca OpenAPI enum'unda geçer, kılavuz listesinde yoktur.",
      "Allowed once every 5 minutes per package. Check the package with getShipmentPackages afterwards. If TEX cargo has no limit you cannot switch with TEXMP. CEVATEDARIK appears only in the OpenAPI enum, not in the guide list.",
    ),
  },
  {
    id: "updateWarehouse", group: "orders", area: "orders",
    title: t("Depo bilgisini güncelle", "Update warehouse information"),
    summary: t("Picking paketlerinde dönen warehouseId alanını günceller.", "Updates the warehouseId returned for picking order packages."),
    method: "PUT", path: `${MP}/{packageId}/warehouse`,
    params: [packageId],
    body: { kind: "json", example: { warehouseId: 372389 }, fields: [f("warehouseId", "integer", t("Depo kimliği.", "Warehouse id."), true)] },
    risk: "write", rateLimit: RATE, docsUrl: ref("updatewarehouse"),
    notes: t("Paket Created, Picking veya Invoiced durumunda olmalıdır; aksi halde 400.", "The package must be Created, Picking or Invoiced; otherwise 400."),
  },
  {
    id: "extendAgreedDeliveryDate", group: "orders", area: "orders",
    title: t("Ek tedarik süresi tanımla", "Additional supply time definition"),
    summary: t("Sipariş paketi için 1, 2 veya 3 gün ek tedarik süresi tanımlar (agreedDeliveryDate uzatma).", "Defines 1, 2 or 3 extra days of supply time for a package (extends agreedDeliveryDate)."),
    method: "PUT", path: `${MP}/{packageId}/extended-agreed-delivery-date`,
    params: [packageId],
    body: { kind: "json", example: { extendedDayCount: 1 }, fields: [f("extendedDayCount", "integer (1|2|3)", t("Uzatılacak gün sayısı.", "Number of days to extend."), true)] },
    risk: "write", rateLimit: RATE, docsUrl: ref("extendagreeddeliverydate"),
    notes: t("Yalnızca paketin agreedDeliveryDateExtendible alanı true ise uzatılabilir. Resmi operationId extendAgreedDeliveryDate.", "Only possible when the package's agreedDeliveryDateExtendible is true. Official operationId is extendAgreedDeliveryDate."),
  },
  {
    id: "updateLaborCosts", group: "orders", area: "orders",
    title: t("İşçilik maliyetini güncelle", "Update labor cost"),
    summary: t("Paket satırları için birim başına işçilik maliyetini besler.", "Feeds the per-item labor cost for package lines."),
    method: "PUT", path: `${MP}/{packageId}/labor-costs`,
    params: [packageId],
    body: {
      kind: "json", example: [{ orderLineId: 3653527482, laborCostPerItem: 32.12 }, { orderLineId: 3653527483, laborCostPerItem: 78.65 }],
      fields: [f("[].orderLineId", "integer", t("Sipariş satırı kimliği.", "Order line id."), true), f("[].laborCostPerItem", "number", t("Tek ürün için işçilik maliyeti.", "Labor cost per single item."), true)],
    },
    risk: "write", rateLimit: RATE, docsUrl: ref("updatelaborcosts"),
    notes: t("Gövde bir JSON dizisidir (nesne değil).", "The body is a JSON array (not an object)."),
  },

  // ───────────── Split Order Package ─────────────
  {
    id: "splitMultiPackageByQuantity", group: "split", area: "orders",
    title: t("Çok barkodlu paketi adede göre böl", "Split multi-barcode package by quantity"),
    summary: t("Paketteki ürünleri orderLineId ve adet ile gruplara ayırıp yeni paketler oluşturur.", "Splits the products of a package into groups by orderLineId and quantity, creating new packages."),
    method: "POST", path: `${MP}/{packageId}/split-packages`,
    params: [packageId],
    body: {
      kind: "json",
      example: { splitPackages: [{ packageDetails: [{ orderLineId: 12345, quantities: 2 }, { orderLineId: 123456, quantities: 1 }] }, { packageDetails: [{ orderLineId: 123, quantities: 1 }, { orderLineId: 1234, quantities: 1 }] }] },
      fields: [f("splitPackages[].packageDetails[].orderLineId", "integer", t("Sipariş satırı.", "Order line."), true), f("splitPackages[].packageDetails[].quantities", "integer", t("Bu pakete giden adet.", "Quantity going into this package."), true)],
    },
    risk: "write", rateLimit: RATE, docsUrl: ref("splitmultipackagesbyquantity"),
    notes: t(
      "Yeni paketler asenkron oluşur; getShipmentPackages ile tekrar çekin. İstekte yer almayan ürünler ayrı yeni pakete düşer. Mevcut paket UnPacked olur. Resmi OpenAPI operationId'si splitMultiPackagesByQuantity'dir.",
      "New packages are created asynchronously; fetch them again with getShipmentPackages. Products omitted from the request land in a separate new package. The current package becomes UnPacked. The official OpenAPI operationId is splitMultiPackagesByQuantity.",
    ),
  },
  {
    id: "splitShipmentPackage", group: "split", area: "orders",
    title: t("Paketi böl", "Split shipment package"),
    summary: t("Seçilen sipariş satırlarını yeni bir pakete ayırır.", "Moves the selected order lines into a new package."),
    method: "POST", path: `${MP}/{packageId}/split`,
    params: [packageId],
    body: { kind: "json", example: { orderLineIds: [123456789] }, fields: [f("orderLineIds[]", "integer", t("Yeni pakete alınacak satırlar.", "Lines to move into the new package."), true)] },
    risk: "write", rateLimit: RATE, docsUrl: ref("splitshipmentpackage"),
    notes: t("Mevcut paket UnPacked olur; aynı orderNumber altında yeni shipmentPackageId ve cargoTrackingNumber üretilir (asenkron). Yanıt: {newPackageId}.", "The current package becomes UnPacked; new shipmentPackageId and cargoTrackingNumber are generated under the same orderNumber (asynchronously). Response: {newPackageId}."),
  },
  {
    id: "splitShipmentPackageByQuantity", group: "split", area: "orders",
    title: t("Paketi barkod adedine göre böl", "Split packages based on barcode"),
    summary: t("Bir satırın adedini verilen miktarlara bölerek her miktar için yeni paket oluşturur.", "Splits a line's quantity into the given amounts, one new package per amount."),
    method: "POST", path: `${MP}/{packageId}/quantity-split`,
    params: [packageId],
    body: {
      kind: "json", example: { quantitySplit: [{ orderLineId: 4765111111, quantities: [1, 1] }] },
      fields: [f("quantitySplit[].orderLineId", "integer", t("Bölünecek satır.", "Line to split."), true), f("quantitySplit[].quantities[]", "integer", t("Her yeni paketteki adet.", "Quantity in each new package."), true)],
    },
    risk: "write", rateLimit: RATE, docsUrl: ref("splitshipmentpackagebyquantity"),
    notes: t("Yanıt: {newPackageIds:[…]}. Yeni paketler asenkron oluşur; örnek gövde dokümanda yoktur, şema üzerinden hazırlanmıştır.", "Response: {newPackageIds:[…]}. New packages appear asynchronously; the docs show no sample body, this one is built from the schema."),
  },
  {
    id: "multiSplitShipmentPackage", group: "split", area: "orders",
    title: t("Paketi çoklu böl", "Split multiple packages"),
    summary: t("Satırları gruplara ayırarak her grup için yeni bir paket oluşturur.", "Splits lines into groups, creating one new package per group."),
    method: "POST", path: `${MP}/{packageId}/multi-split`,
    params: [packageId],
    body: { kind: "json", example: { splitGroups: [{ orderLineIds: [3, 5, 6] }, { orderLineIds: [7, 8, 9] }] }, fields: [f("splitGroups[].orderLineIds[]", "integer", t("Aynı yeni pakete girecek satırlar.", "Lines going into the same new package."), true)] },
    risk: "write", rateLimit: RATE, docsUrl: ref("multisplitshipmentpackage"),
    notes: t("Yanıt: {results:[{newPackageId}]}. Yeni paketler asenkron oluşur.", "Response: {results:[{newPackageId}]}. New packages are created asynchronously."),
  },

  // ───────────── Shipping Alternative Delivery ─────────────
  {
    id: "processAlternativeDelivery", group: "shipping", area: "orders",
    title: t("Kargo linki ile gönderim", "Shipping with cargo link"),
    summary: t("Paketi gönderdikten sonra kargo takip linkini veya telefon numarasını besler; sipariş otomatik Shipped olur.", "After dispatching, feed the cargo tracking link or phone number; the order automatically becomes Shipped."),
    method: "PUT", path: `${MP}/{packageId}/alternative-delivery`,
    params: [packageId],
    body: {
      kind: "json", example: { isPhoneNumber: false, trackingInfo: "https://tracking.example.com/?id=7280027504111111", params: {}, boxQuantity: 1, deci: 1.4 },
      fields: [
        f("isPhoneNumber", "boolean", t("false ise trackingInfo kargo linki, true ise telefon numarasıdır.", "false: trackingInfo is a cargo link; true: a phone number."), true),
        f("trackingInfo", "string", t("Kargo takip linki veya telefon numarası.", "Cargo tracking link or phone number."), true),
        f("params", "object", t("Ek parametreler (genellikle boş).", "Extra parameters (usually empty).")),
        f("boxQuantity", "integer", t("Koli adedi (opsiyonel).", "Box quantity (optional).")),
        f("deci", "number", t("Desi (opsiyonel).", "Deci (optional).")),
      ],
    },
    risk: "write", rateLimit: RATE, docsUrl: ref("processalternativedelivery"),
    notes: t("Başarılı istek sonrası paket Shipped durumuna geçer.", "After a successful request the package switches to Shipped."),
  },
  {
    id: "processAlternativeDeliveryDigital", group: "shipping", area: "orders",
    title: t("Dijital ürün teslimi (alternatif teslimat)", "Digital product delivery with alternative delivery"),
    summary: t("Dijital kodu müşteriye SMS ve e-posta ile otomatik gönderir.", "Automatically sends the digital code to the customer by SMS and e-mail."),
    method: "PUT", path: `${MP}/{packageId}/alternative-delivery-digital`,
    params: [packageId],
    body: {
      kind: "json", example: { isPhoneNumber: true, trackingInfo: "5555555555", params: { digitalCode: "AX4567fasdf" } },
      fields: [
        f("isPhoneNumber", "boolean", t("Dijital teslimde true olmalıdır.", "Must be true for digital delivery."), true),
        f("trackingInfo", "string", t("Müşteri iletişim telefonu.", "Customer contact phone number."), true),
        f("params.digitalCode", "string (6-120)", t("Dijital kod, 6–120 karakter.", "Digital code, 6–120 characters."), true),
      ],
    },
    risk: "write", rateLimit: RATE, docsUrl: ref("processalternativedeliverydigital"),
    notes: t("Bilgiler müşteriye SMS ve e-posta ile iletilir (geri alınamaz). Resmi operationId processAlternativeDeliveryDigital'dir (başlıkta processAlternativeDelivery yazar). Başarı sonrası paketin hangi duruma geçtiği dokümanda belirtilmemiştir (UNVERIFIED; mock Shipped yapar).", "The information is sent to the customer by SMS and e-mail (irreversible). Official operationId is processAlternativeDeliveryDigital (the page title says processAlternativeDelivery). The resulting package status is not documented (UNVERIFIED; the mock sets Shipped)."),
  },
  {
    id: "manualDeliverByPackageId", group: "shipping", area: "orders",
    title: t("Manuel teslim (paket no ile)", "Manual delivery by package id"),
    summary: t("Paketin teslim edildiğini paket kimliği ile manuel bildirir.", "Manually notifies that the package was delivered, by package id."),
    method: "PUT", path: `${MP}/{packageId}/manual-invoice-delivery`,
    params: [packageId], body: NO_BODY, risk: "destructive", rateLimit: RATE, docsUrl: ref("manualdeliverbypackageid"),
    notes: t("Geri alınamaz. Gövde yoktur; paket Shipped olmalıdır (kılavuzda açık değil, UNVERIFIED).", "Irreversible. No body; the package should be Shipped (not explicit in the docs, UNVERIFIED)."),
  },
  {
    id: "manualDeliverByTrackingNumber", group: "shipping", area: "orders",
    title: t("Manuel teslim (takip no ile)", "Manual delivery by tracking number"),
    summary: t("Paketin teslim edildiğini kargo takip numarası ile manuel bildirir.", "Manually notifies that the package was delivered, by cargo tracking number."),
    method: "PUT", path: "/integration/order/sellers/{sellerId}/shipment-packages/manual-invoice-delivery-by-tracking-number/{cargoTrackingNumber}",
    params: [cargoTrackingNumber], body: NO_BODY, risk: "destructive", rateLimit: RATE, docsUrl: ref("manualdeliverbytrackingnumber"),
    notes: t("Geri alınamaz. Gövde yoktur.", "Irreversible. No body."),
  },
  {
    id: "manualReturnByTrackingNumber", group: "shipping", area: "orders",
    title: t("Manuel iade (takip no ile)", "Manual return by tracking number"),
    summary: t("Shipped durumunda müşteriye ulaşmayıp depoya dönen paketi takip numarası ile iade olarak işaretler.", "Marks a Shipped package that came back to your warehouse undelivered as returned, by tracking number."),
    method: "PUT", path: "/integration/order/sellers/{sellerId}/shipment-packages/manual-return-by-tracking-number/{cargoTrackingNumber}",
    params: [cargoTrackingNumber], body: NO_BODY, risk: "destructive", rateLimit: RATE, docsUrl: ref("manualreturnbytrackingnumber"),
    notes: t("Geri alınamaz. Yalnızca Shipped durumunda depoya dönen ve Delivered'a geçemeyen siparişler içindir.", "Irreversible. Only for orders that were Shipped, returned to your warehouse and cannot become Delivered."),
  },
  {
    id: "manualReturnByPackageId", group: "shipping", area: "orders",
    title: t("Manuel iade (paket no ile)", "Manual return by package id"),
    summary: t("Shipped durumunda müşteriye ulaşmayıp depoya dönen paketi paket kimliği ile iade olarak işaretler.", "Marks a Shipped package that came back to your warehouse undelivered as returned, by package id."),
    method: "PUT", path: `${MP}/{packageId}/manual-return`,
    params: [packageId], body: NO_BODY, risk: "destructive", rateLimit: RATE, docsUrl: ref("manualreturnbypackageid"),
    notes: t("Geri alınamaz. Yalnızca Shipped durumunda depoya dönen ve Delivered'a geçemeyen siparişler içindir.", "Irreversible. Only for orders that were Shipped, returned to your warehouse and cannot become Delivered."),
  },

  // ───────────── Address Information ─────────────
  {
    id: "getCountries", group: "address", area: "tools",
    title: t("Ülke listesi", "Country information"), summary: t("Trendyol'un desteklediği ülkelerin kimlik, kod ve adlarını getirir.", "Returns id, code and name of the countries Trendyol supports."),
    method: "GET", path: "/integration/member/countries", params: [], body: NO_BODY, risk: "read", rateLimit: RATE, docsUrl: ref("getcountries"),
    table: { listPath: "", columns: [{ key: "id", label: t("Kimlik", "Id") }, { key: "code", label: t("Kod", "Code") }, { key: "name", label: t("Ad", "Name") }] },
  },
  {
    id: "getCitiesByCountry", group: "address", area: "tools",
    title: t("Şehirler (Körfez ve CEE ülkeleri)", "Cities for GULF and CEE countries"), summary: t("Körfez ve Orta-Doğu Avrupa ülkeleri için şehir listesini getirir.", "Returns the city list for GULF and CEE countries."),
    method: "GET", path: "/integration/member/countries/{CountryCode}/cities",
    params: [{ name: "CountryCode", in: "path", type: "string", required: true, example: "AE", description: t("getCountries'ten gelen ülke kodu.", "Country code from getCountries.") }],
    body: NO_BODY, risk: "read", rateLimit: RATE, docsUrl: ref("getcitiesbycountry"), table: idName,
  },
  {
    id: "getDistrictsByCity", group: "address", area: "tools",
    title: t("İlçeler (Körfez ülkeleri)", "Districts for GULF countries"), summary: t("Körfez ülkeleri için bir şehrin ilçelerini getirir.", "Returns the districts of a city for GULF countries."),
    method: "GET", path: "/integration/member/countries/{CountryCode}/cities/{cityId}/districts",
    params: [
      { name: "CountryCode", in: "path", type: "string", required: true, example: "AE", description: t("Ülke kodu.", "Country code.") },
      { name: "cityId", in: "path", type: "integer", required: true, example: 1, description: t("Şehir listesinden gelen şehir kimliği.", "City id from the cities endpoint.") },
    ],
    body: NO_BODY, risk: "read", rateLimit: RATE, docsUrl: ref("getdistrictsbycity"), table: idName,
  },
  {
    id: "getAzerbaijanCities", group: "address", area: "tools",
    title: t("Şehirler (Azerbaycan)", "Cities for Azerbaijan"), summary: t("Azerbaycan şehirlerini getirir.", "Returns the cities of Azerbaijan."),
    method: "GET", path: "/integration/member/countries/domestic/AZ/cities", params: [], body: NO_BODY, risk: "read", rateLimit: RATE, docsUrl: ref("getazerbaijancities"), table: idName,
  },
  {
    id: "getAzerbaijanDistricts", group: "address", area: "tools",
    title: t("İlçeler (Azerbaycan)", "Districts for Azerbaijan"), summary: t("Azerbaycan'da bir şehrin ilçelerini getirir.", "Returns the districts of an Azerbaijan city."),
    method: "GET", path: "/integration/member/countries/domestic/AZ/cities/{cityCode}/districts",
    params: [{ name: "cityCode", in: "path", type: "integer", required: true, example: 1, description: t("Azerbaycan şehir listesinden şehir kodu.", "City code from the Azerbaijan cities endpoint.") }],
    body: NO_BODY, risk: "read", rateLimit: RATE, docsUrl: ref("getazerbaijandistricts"), table: idName,
  },
  {
    id: "getTurkeyCities", group: "address", area: "tools",
    title: t("İller (Türkiye)", "Cities for Turkey"), summary: t("Türkiye'nin 81 ilini kimlikleriyle getirir; sipariş adreslerindeki cityCode ile eşleşir.", "Returns Turkey's 81 provinces with ids; matches cityCode in order addresses."),
    method: "GET", path: "/integration/member/countries/domestic/TR/cities", params: [], body: NO_BODY, risk: "read", rateLimit: RATE, docsUrl: ref("getturkeycities"), table: idName,
  },
  {
    id: "getTurkeyDistricts", group: "address", area: "tools",
    title: t("İlçeler (Türkiye)", "Districts for Turkey"), summary: t("Bir ilin ilçelerini getirir.", "Returns the districts of a province."),
    method: "GET", path: "/integration/member/countries/domestic/TR/cities/{CityCode}/districts",
    params: [{ name: "CityCode", in: "path", type: "integer", required: true, example: 34, description: t("getTurkeyCities'ten il kodu (ör. 34 İstanbul).", "Province code from getTurkeyCities (e.g. 34 Istanbul).") }],
    body: NO_BODY, risk: "read", rateLimit: RATE, docsUrl: ref("getturkeydistricts"), table: idName,
  },
  {
    id: "getTurkeyNeighborhoods", group: "address", area: "tools",
    title: t("Mahalleler (Türkiye)", "Neighborhoods for Turkey"), summary: t("Bir ilçenin mahallelerini getirir.", "Returns the neighborhoods of a district."),
    method: "GET", path: "/integration/member/countries/domestic/TR/cities/{CityCode}/districts/{DistrictCode}/neighborhoods",
    params: [
      { name: "CityCode", in: "path", type: "integer", required: true, example: 34, description: t("İl kodu.", "Province code.") },
      { name: "DistrictCode", in: "path", type: "integer", required: true, example: 54, description: t("getTurkeyDistricts'ten ilçe kodu.", "District code from getTurkeyDistricts.") },
    ],
    body: NO_BODY, risk: "read", rateLimit: RATE, docsUrl: ref("getturkeyneighborhoods"), table: idName,
  },

  // ───────────── Common Label ─────────────
  {
    id: "createCommonLabel", group: "labels", area: "orders",
    title: t("Ortak etiket barkodu oluştur", "Create common label barcode"),
    summary: t("TEX ve Aras Kargo ile Trendyol ödemeli gönderilerde, kargo numarası için ortak etiket barkodu talep eder.", "Requests a common label barcode for a cargo number on Trendyol-pays shipments with TEX and Aras Cargo."),
    method: "POST", path: "/integration/sellers/{sellerId}/common-label/{cargoTrackingNumber}",
    params: [cargoTrackingNumber],
    body: {
      kind: "json", example: { format: "ZPL", boxQuantity: 5, volumetricHeight: 3.5 },
      fields: [f("format", "string (ZPL)", t("Barkod formatı; şu an yalnızca ZPL.", "Barcode format; only ZPL for now."), true), f("boxQuantity", "integer", t("Koli adedi.", "Box quantity.")), f("volumetricHeight", "number", t("Hacimsel yükseklik.", "Volumetric height."))],
    },
    risk: "write", rateLimit: RATE, docsUrl: ref("createcommonlabel"),
    notes: t("Talep, paketi PICKING veya INVOICED yaptıktan sonra önerilir. Barkod ZPL olarak getCommonLabel ile alınır. Başarılı yanıtta gövde yoktur. Hata gövdesi: {error:{status,errors:[{code,type,title}]}}.", "Recommended after the package is PICKING or INVOICED. The barcode is retrieved as ZPL with getCommonLabel. Success has no response body. Error body: {error:{status,errors:[{code,type,title}]}}."),
  },
  {
    id: "getCommonLabel", group: "labels", area: "orders",
    title: t("Ortak etiket barkodunu getir", "Get common label barcode"),
    summary: t("createCommonLabel ile talep edilen barkodu ZPL olarak getirir.", "Retrieves the barcode requested with createCommonLabel as ZPL."),
    method: "GET", path: "/integration/sellers/{sellerId}/common-label/{cargoTrackingNumber}",
    params: [cargoTrackingNumber], body: NO_BODY, risk: "read", rateLimit: RATE, docsUrl: ref("getcommonlabel"),
    table: { listPath: "data", columns: [{ key: "format", label: t("Format", "Format") }, { key: "label", label: t("Etiket (ZPL)", "Label (ZPL)") }] },
    notes: t("Birden fazla koli için birden fazla etiket, tek koli için tek ZPL döner.", "Multiple labels are returned for multiple boxes, a single ZPL for a single box."),
  },

  // ───────────── Test Order API (STAGE) ─────────────
  {
    id: "createTestOrder", group: "test", area: "tools", envs: ["stage"],
    title: t("Test siparişi oluştur", "Create test order"), summary: t("STAGE ortamında istediğiniz senaryoda test siparişi oluşturur; dönen orderNumber ile işlem yaparsınız.", "Creates a test order in the requested scenario on STAGE; use the returned orderNumber for your tests."),
    method: "POST", path: "/integration/test/order/orders/core", params: [],
    body: {
      kind: "json",
      example: {
        customer: { customerFirstName: "Ayşe", customerLastName: "Yılmaz" },
        invoiceAddress: { addressText: "Test Mah. Deneme Sok. No:1", city: "İzmir", company: "", district: "Bornova", invoiceFirstName: "Ayşe", invoiceLastName: "Yılmaz", latitude: "38.4622", longitude: "27.2186", neighborhood: "", phone: "5301234567", postalCode: "", email: "pf+j2jm8x99@trendyolmail.com", invoiceTaxNumber: "", invoiceTaxOffice: "" },
        lines: [{ barcode: "8680000000011", quantity: 2, discountPercentage: 10 }],
        seller: { sellerId: 2738 },
        shippingAddress: { addressText: "Test Mah. Deneme Sok. No:1", city: "İzmir", company: "", district: "Bornova", latitude: "38.4622", longitude: "27.2186", neighborhood: "", phone: "5301234567", postalCode: "", shippingFirstName: "Ayşe", shippingLastName: "Yılmaz", email: "pf+j2jm8x99@trendyolmail.com" },
        commercial: false,
      },
      fields: [
        f("customer.customerFirstName", "string", t("Müşteri adı.", "Customer first name."), true), f("customer.customerLastName", "string", t("Müşteri soyadı.", "Customer last name."), true),
        f("invoiceAddress.*", "object", t("Fatura adresi (addressText, city, district, invoiceFirstName, invoiceLastName, phone, email zorunlu).", "Invoice address (addressText, city, district, invoiceFirstName, invoiceLastName, phone, email required)."), true),
        f("shippingAddress.*", "object", t("Teslimat adresi (addressText, city, district, shippingFirstName, shippingLastName, phone, email zorunlu).", "Shipping address (addressText, city, district, shippingFirstName, shippingLastName, phone, email required)."), true),
        f("lines[].barcode", "string", t("Ürün barkodu.", "Product barcode."), true), f("lines[].quantity", "integer", t("Adet.", "Quantity."), true),
        f("lines[].discountPercentage", "number", t("İndirim yüzdesi.", "Discount percentage.")), f("lines[].trendyolDiscountPercentage", "number", t("Trendyol indirim yüzdesi (kılavuzda).", "Trendyol discount percentage (guide).")),
        f("seller.sellerId", "integer", t("Satıcı kimliği.", "Seller id."), true),
        f("commercial", "boolean", t("true ise invoiceAddress'te company, invoiceTaxNumber, invoiceTaxOffice dolu olmalı.", "If true, company, invoiceTaxNumber and invoiceTaxOffice must be filled in invoiceAddress.")),
        f("microRegion", "string", t("Mikro ihracat bölgesi: AZ veya GULF.", "Micro export region: AZ or GULF.")),
      ],
    },
    risk: "write", rateLimit: RATE, docsUrl: ref("createtestorder"),
    notes: t(`${STAGE_NOTE.tr} Telefon 10 haneli ve yalnızca rakam olmalıdır (5301234567).`, `${STAGE_NOTE.en} Phone must be 10 digits, numbers only (5301234567).`),
  },
  {
    id: "updateTestOrderStatus", group: "test", area: "tools", envs: ["stage"],
    title: t("Test siparişi durumunu güncelle", "Update test order status"), summary: t("STAGE'deki test siparişlerinin durumunu Shipped, AtCollectionPoint, Delivered, UnDelivered veya Returned yapar.", "Moves STAGE test orders to Shipped, AtCollectionPoint, Delivered, UnDelivered or Returned."),
    method: "PUT", path: "/integration/test/order/sellers/{sellerId}/shipment-packages/{packageId}/status",
    params: [packageId],
    body: {
      kind: "json", example: { lines: [{ lineId: 4944785, quantity: 1 }], params: {}, status: "Delivered" },
      fields: [f("status", "string", t("Shipped | AtCollectionPoint | Delivered | UnDelivered | Returned.", "Shipped | AtCollectionPoint | Delivered | UnDelivered | Returned."), true), f("lines[].lineId", "integer", t("Satır kimliği.", "Line id."), true), f("lines[].quantity", "integer", t("Adet.", "Quantity."), true), f("params", "object", t("Ek parametreler (string değerler).", "Additional parameters (string values)."))],
    },
    risk: "write", rateLimit: RATE, docsUrl: ref("updatetestorderstatus"),
    notes: t(`${STAGE_NOTE.tr} Durumlar sırayla ilerler; Delivered olmuş paket tekrar AtCollectionPoint veya Shipped'a çekilemez. Yanıt: "200 OK".`, `${STAGE_NOTE.en} Statuses progress sequentially; a Delivered package cannot go back to AtCollectionPoint or Shipped. Response: "200 OK".`),
  },
];

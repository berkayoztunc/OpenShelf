import type { OpParam, Text, TrendyolOperation } from "@openshelf/shared";

/**
 * Product Integration V2 — products, updates, inventory & price, batch results, video and warranty services (docs v2.0, Turkey).
 * V1 product APIs (Product Integration V1) were switched off on 10 Aug 2026 and are intentionally NOT part of this catalog.
 * Paths: https://developers.trendyol.com/v2.0/docs/product-v2-api-endpoint (host `https://apigw.trendyol.com`).
 * `getUpdateAudits` is also the "Product QC Approval Status Check Service" (same endpoint). The origin value list is a static
 * table (country codes for the `origin` field), not an HTTP operation, so it is not part of the catalog; the docs contain no
 * "categories requiring SGR definition" service.
 */
const t = (tr: string, en: string): Text => ({ tr, en });
const ref = (id: string) => `https://developers.trendyol.com/v2.0/reference/${id.toLowerCase()}`;

const RL_READ: Text = t(
  "Product Integration Read grubu: 50.000 ürün limitinde 1000 istek/dk (limitsiz hesapta 2000); gruptaki tüm servisler ortak sayılır.",
  "Product Integration Read group: 1000 req/min at the 50,000-listing tier (2000 for unlimited accounts); counted jointly across the whole group.",
);
const RL_WRITE: Text = t(
  "Product Integration Write grubu: 50.000 ürün limitinde 200 istek/dk (limitsiz hesapta 600); ürün oluşturma, güncelleme, silme, arşiv, kilit açma ve buybox birlikte sayılır.",
  "Product Integration Write group: 200 req/min at the 50,000-listing tier (600 for unlimited accounts); product create, update, delete, archive, unlock and buybox are counted jointly.",
);
const RL_INV: Text = t(
  "Inventory & Price Write grubu: 50.000 ürün limitinde 350 istek/dk (limitsiz hesapta 2000). Ayrıca aynı barkod için fiyat güncellemesi en fazla 30 istek/dk; aşılırsa o barkod Batch sonucunda hata alır.",
  "Inventory & Price Write group: 350 req/min at the 50,000-listing tier (2000 for unlimited accounts). Additionally price updates are limited to 30 req/min per barcode; beyond that the barcode fails in the Batch result.",
);
const BATCH_NOTE: Text = t(
  "İşlem asenkrondur: dönen batchRequestId ile getBatchRequestResult servisini sorgulayıp ürün başına SUCCESS/FAILED durumunu kontrol edin.",
  "The operation is asynchronous: poll getBatchRequestResult with the returned batchRequestId and check each item's SUCCESS/FAILED status.",
);

const pageP = (d: string, firstPage = 0): OpParam => ({ name: "page", in: "query", type: "integer", default: firstPage, example: firstPage, description: t(`Sayfa numarası (${d}).`, `Page number (${d}).`) });
const sizeP = (max: number, def: number): OpParam => ({ name: "size", in: "query", type: "integer", default: def, example: def, description: t(`Sayfa başına kayıt sayısı (en fazla ${max}).`, `Items per page (max ${max}).`) });
const P = (name: string, type: OpParam["type"], tr: string, en: string, extra: Partial<OpParam> = {}): OpParam => ({ name, in: "query", type, description: t(tr, en), ...extra });
const nextPageToken = P("nextPageToken", "string", "10.000'den fazla kayıt olduğunda bir sonraki sayfa için yanıttaki token.", "Next-page token from the previous response when there are more than 10,000 records.");
const brandIds = P("brandIds", "array", "Verilen marka ID'lerine göre filtreler.", "Filters by the given brand IDs.", { arrayStyle: "comma", example: "9001" });
const storefront: OpParam = { name: "storefrontcode", in: "header", type: "string", example: "TR", description: t("Ülke kodu. Gönderilmezse ya da TR ise Türkiye mağazası kullanılır.", "Country code. If omitted or TR, the Türkiye storefront is used.") };
const acceptLanguage: OpParam = {
  name: "Accept-Language", in: "header", type: "string", example: "tr",
  description: t("Yanıt dili. TR mağazasında her zaman Türkçe; diğerlerinde tr, en, ro, ar, el (varsayılan en).", "Response language. Always Turkish on the TR storefront; otherwise tr, en, ro, ar, el (default en)."),
};
const itemsField = (max: number, what: string, whatEn: string) => ({ path: "items", type: "array", required: true, description: t(`${what} (tek istekte en fazla ${max}).`, `${whatEn} (max ${max} per request).`) });
const barcodeField = (path = "items[].barcode") => ({ path, type: "string", required: true, description: t("Ürün barkodu (en fazla 40 karakter; yalnızca . - _ özel karakterleri).", "Product barcode (max 40 chars; only . - _ special characters).") });

const filterCols = (extra: { key: string; label: Text }[] = []) => [
  { key: "barcode", label: t("Barkod", "Barcode") }, { key: "title", label: t("Başlık", "Title") }, ...extra,
];

export const operations: TrendyolOperation[] = [
  // ---------------------------------------------------------------- products
  {
    id: "createProducts", group: "products", area: "products",
    title: t("Ürün oluştur (V2)", "Create products (V2)"),
    summary: t(
      "Ürünleri Trendyol'a aktarır. Tek ve toplu gönderimi destekler; işlem asenkrondur ve sonuç batchRequestId ile kontrol edilir.",
      "Uploads products to Trendyol. Supports single and bulk submissions; the operation is asynchronous and the result is checked with the batchRequestId.",
    ),
    method: "POST", path: "/integration/product/sellers/{sellerId}/v2/products",
    params: [],
    body: {
      kind: "json",
      example: {
        items: [{
          barcode: "8680000000061", title: "Seramik Vazo - Mat Beyaz 25 cm", productMainId: "SERAMIK-VAZO-25", brandId: 9001, categoryId: 411,
          quantity: 25, stockCode: "OS-SERAMIK-VAZO-25-BYZ", origin: "TR", dimensionalWeight: 2, listPrice: 549.9, salePrice: 479.9, vatRate: 20,
          description: "<p>El yapımı mat beyaz seramik vazo. Yükseklik 25 cm.</p>", lotNumber: "PartiNo:011220",
          cargoProviders: ["YKMP"], shipmentAddressId: 0, returningAddressId: 0, deliveryOption: { deliveryDuration: 1 },
          images: [{ url: "https://cdn.dsmcdn.com/mock/openshelf/1.jpg" }, { url: "https://cdn.dsmcdn.com/mock/openshelf/2.jpg" }],
          attributes: [{ attributeId: 47, attributeValueId: 1002 }, { attributeId: 1201, attributeValueId: 5001 }, { attributeId: 293, customAttributeValue: "Tek Ebat" }],
        }],
      },
      fields: [
        itemsField(1000, "Aktarılacak ürünler", "Products to upload"),
        barcodeField(),
        { path: "items[].title", type: "string", required: true, description: t("Ürün adı (en fazla 100 karakter).", "Product name (max 100 chars).") },
        { path: "items[].productMainId", type: "string", required: true, description: t("Satıcının model kodu; varyantlama bu değere göre yapılır (en fazla 40).", "Seller model code; variants are grouped by it (max 40).") },
        { path: "items[].brandId", type: "integer", required: true, description: t("getBrands'ten alınan marka ID'si.", "Brand ID from getBrands.") },
        { path: "items[].categoryId", type: "integer", required: true, description: t("getCategoryTree'den alınan yaprak kategori ID'si.", "Leaf category ID from getCategoryTree.") },
        { path: "items[].quantity", type: "integer", required: true, description: t("Satılabilir stok adedi.", "Sellable stock quantity.") },
        { path: "items[].stockCode", type: "string", description: t("Satıcı sistemindeki benzersiz stok kodu (en fazla 100). OpenAPI zorunlu, rehber isteğe bağlı diyor.", "Unique stock code in your system (max 100). OpenAPI marks it required, the guide optional.") },
        { path: "items[].dimensionalWeight", type: "number", description: t("Desi değeri (ondalıklı). OpenAPI zorunlu, rehber isteğe bağlı diyor.", "Dimensional weight (decimal). OpenAPI marks it required, the guide optional.") },
        { path: "items[].origin", type: "string", description: t("Menşei: 2 harfli ülke kodu (Origin Value List).", "Country of origin: 2-letter code (Origin Value List).") },
        { path: "items[].description", type: "string", required: true, description: t("HTML ürün açıklaması (en fazla 30.000 karakter).", "HTML product description (max 30,000 chars).") },
        { path: "items[].listPrice", type: "number", required: true, description: t("Liste (PSF) fiyatı; salePrice'tan düşük olamaz.", "List price (PSF); cannot be lower than salePrice.") },
        { path: "items[].salePrice", type: "number", required: true, description: t("Satış (TSF) fiyatı.", "Sale price (TSF).") },
        { path: "items[].vatRate", type: "integer", required: true, description: t("KDV oranı: 0, 1, 10, 20 gibi.", "VAT rate such as 0, 1, 10, 20.") },
        { path: "items[].images[].url", type: "string", required: true, description: t("https görsel adresi; barkod başına en fazla 8 görsel (1200x1800 px, 96 dpi).", "https image URL; max 8 images per barcode (1200x1800 px, 96 dpi).") },
        { path: "items[].attributes[]", type: "object", required: true, description: t("Kategori özellikleri: attributeId + attributeValueId (veya serbest metin için customAttributeValue).", "Category attributes: attributeId + attributeValueId (or customAttributeValue for free text).") },
        { path: "items[].deliveryOption.deliveryDuration", type: "integer", description: t("Kargoya veriliş süresi: 0 = bugün, 1 = en geç yarın (Ağustos 2026 yapısı).", "Handling time: 0 = ships today, 1 = ships by tomorrow (August 2026 structure).") },
        { path: "items[].cargoProviders", type: "string[]", description: t("Barkod bazlı kargo firması kodu (getCargoProviders).", "Barcode-level cargo provider code (getCargoProviders).") },
        { path: "items[].lotNumber", type: "string", description: t("Parti/Lot/SKT bilgisi (en fazla 100 karakter).", "Batch/Lot/expiry info (max 100 chars).") },
      ],
    },
    risk: "write", rateLimit: RL_WRITE, docsUrl: ref("createProducts"),
    notes: t(
      "Onay akışı: başarılı istekten sonra ürünler onay sürecine girer; onaydaki veya reddedilen ürünler yayına çıkmaz — filterUnapprovedProducts ile durumu izleyin. Varyantlar aynı productMainId ile ayrı item olarak gönderilir, yalnızca attributes farklı olur. Docs tutarsızlığı: OpenAPI attributeValueIds/attributeValue, rehber attributeValueId/customAttributeValue kullanıyor; currencyType V2 isteğinde yoktur. " + BATCH_NOTE.tr,
      "Approval flow: after a successful request products enter approval; pending or rejected products do not go live — track them with filterUnapprovedProducts. Variants are sent as separate items sharing productMainId, differing only in attributes. Docs inconsistency: OpenAPI uses attributeValueIds/attributeValue while the guide uses attributeValueId/customAttributeValue; currencyType is not part of the V2 request. " + BATCH_NOTE.en,
    ),
  },
  {
    id: "getProductBase", group: "products", area: "products",
    title: t("Ürün temel durumu (barkod)", "Product basic status (barcode)"),
    summary: t("Mağazanızdaki bir ürünün temel durum bilgisini (onay, arşiv, listingId, contentId) döndürür.", "Returns the basic status of a product in your store (approval, archive, listingId, contentId)."),
    method: "GET", path: "/integration/product/sellers/{sellerId}/product/{barcode}",
    params: [{ name: "barcode", in: "path", type: "string", required: true, example: "8680000000011", description: t("Ürün barkodu.", "Product barcode.") }],
    body: { kind: "none" }, risk: "read", rateLimit: RL_READ, docsUrl: ref("getProductBase"),
  },
  {
    id: "filterUnapprovedProducts", group: "products", area: "products",
    title: t("Onaysız ürünleri listele", "List unapproved products"),
    summary: t(
      "Onaysız (taslak) ürünleri listeler: onay bekleyen ve reddedilen ürünleri içerir. Reddedilenlerde rejectReasonDetails dolu gelir.",
      "Lists unapproved (draft) products: both those pending approval and rejected ones. Rejected items carry rejectReasonDetails.",
    ),
    method: "GET", path: "/integration/product/sellers/{sellerId}/products/unapproved",
    params: [
      P("barcode", "string", "Tek barkod ile filtreler.", "Filter by a single barcode.", { example: "8680000000061" }),
      P("barcodes", "array", "Birden fazla barkod ile filtreler (rehbere göre en fazla 50).", "Filter by several barcodes (max 50 per the guide).", { arrayStyle: "comma" }),
      P("startDate", "timestamp_ms", "Başlangıç tarihi (epoch ms).", "Start date (epoch ms)."),
      P("endDate", "timestamp_ms", "Bitiş tarihi (epoch ms).", "End date (epoch ms)."),
      P("dateQueryType", "string", "Tarih filtresinin uygulanacağı alan: CREATED_DATE (createDateTime) veya LAST_MODIFIED_DATE (lastUpdateDate).", "Field the date filter applies to: CREATED_DATE (createDateTime) or LAST_MODIFIED_DATE (lastUpdateDate).", { enum: ["CREATED_DATE", "LAST_MODIFIED_DATE"] }),
      pageP("page x size en fazla 10.000", 0), sizeP(1000, 50),
      P("supplierId", "integer", "Tedarikçi (satıcı) ID'si.", "Supplier ID."),
      P("stockCode", "string", "Stok koduna göre filtreler.", "Filter by stock code."),
      P("productMainId", "string", "Ana ürün kodu (model kodu) ile filtreler.", "Filter by main product code (model code)."),
      P("origin", "string", "Menşei ülke kodu (rehberde belirtilir, OpenAPI'de yoktur).", "Country of origin (mentioned in the guide, absent from OpenAPI)."),
      brandIds,
      P("status", "string", "Onay durumu: rejected veya pendingApproval.", "Approval status: rejected or pendingApproval.", { enum: ["rejected", "pendingApproval"] }),
      nextPageToken,
    ],
    body: { kind: "none" }, risk: "read",
    table: { listPath: "content", columns: filterCols([{ key: "status", label: t("Durum", "Status") }, { key: "brand.name", label: t("Marka", "Brand") }, { key: "category.name", label: t("Kategori", "Category") }, { key: "quantity", label: t("Stok", "Stock") }, { key: "salePrice", label: t("Satış fiyatı", "Sale price") }]) },
    pagination: { pageParam: "page", sizeParam: "size", maxSize: 1000, firstPage: 0 },
    rateLimit: RL_READ, docsUrl: ref("filterUnapprovedProducts"),
    notes: t(
      "page x size en fazla 10.000 olabilir; daha fazla kayıt için yanıttaki nextPageToken ile size'ı birlikte gönderin. pendingApproval ve docNeeded=true ise onay için gereken belgeyi satıcı panelinden yüklemelisiniz.",
      "page x size can be at most 10,000; for more records send size with the nextPageToken from the previous response. If status is pendingApproval and docNeeded=true, upload the required document in the seller panel.",
    ),
  },
  {
    id: "filterApprovedProducts", group: "products", area: "products",
    title: t("Onaylı ürünleri listele", "List approved products"),
    summary: t(
      "Onaylı ürünleri içerik (content) bazlı listeler; her içeriğin variants dizisi barkod/fiyat/stok/kilit/arşiv bilgilerini taşır.",
      "Lists approved products content-based; each content has a variants array with barcode, price, stock, lock and archive info.",
    ),
    method: "GET", path: "/integration/product/sellers/{sellerId}/products/approved",
    params: [
      P("barcode", "string", "Tek barkod ile filtreler.", "Filter by a single barcode.", { example: "8680000000011" }),
      P("barcodes", "array", "Birden fazla barkod (rehbere göre en fazla 50).", "Several barcodes (max 50 per the guide).", { arrayStyle: "comma" }),
      P("contentId", "integer", "Tek içerik ID'si ile filtreler (rehberde belirtilir).", "Filter by a single content ID (mentioned in the guide)."),
      P("startDate", "timestamp_ms", "Başlangıç tarihi (epoch ms).", "Start date (epoch ms)."),
      P("endDate", "timestamp_ms", "Bitiş tarihi (epoch ms).", "End date (epoch ms)."),
      P("dateQueryType", "string", "Tarih filtresi alanı: VARIANT_CREATED_DATE (sellerCreatedDate), VARIANT_MODIFIED_DATE (sellerModifiedDate), CONTENT_MODIFIED_DATE (lastModifiedDate).", "Date filter field: VARIANT_CREATED_DATE (sellerCreatedDate), VARIANT_MODIFIED_DATE (sellerModifiedDate), CONTENT_MODIFIED_DATE (lastModifiedDate).", { enum: ["VARIANT_CREATED_DATE", "VARIANT_MODIFIED_DATE", "CONTENT_MODIFIED_DATE"] }),
      pageP("page x size en fazla 10.000", 0), sizeP(100, 50),
      P("supplierId", "integer", "Tedarikçi (satıcı) ID'si.", "Supplier ID."),
      P("stockCode", "string", "Stok koduna göre filtreler.", "Filter by stock code."),
      P("productMainId", "string", "Ana ürün kodu ile filtreler.", "Filter by main product code."),
      P("origin", "string", "Menşei ülke kodu (rehberde belirtilir).", "Country of origin (mentioned in the guide)."),
      brandIds,
      P("status", "string", "Durum filtresi: archived, blacklisted, locked, onSale (rehber ayrıca notOnSale der).", "Status filter: archived, blacklisted, locked, onSale (the guide also lists notOnSale).", { enum: ["archived", "blacklisted", "locked", "onSale", "notOnSale"] }),
      P("orderByDirection", "string", "sellerCreatedDate'e göre sıralama (rehber: ASC/DESC).", "Sort by sellerCreatedDate (guide: ASC/DESC).", { enum: ["asc", "desc"] }),
      nextPageToken,
    ],
    body: { kind: "none" }, risk: "read",
    table: { listPath: "content", columns: [{ key: "contentId", label: t("İçerik ID", "Content ID") }, { key: "productMainId", label: t("Ana ürün kodu", "Main product ID") }, { key: "title", label: t("Başlık", "Title") }, { key: "brand.name", label: t("Marka", "Brand") }, { key: "category.name", label: t("Kategori", "Category") }, { key: "variants.length", label: t("Varyant", "Variants") }] },
    pagination: { pageParam: "page", sizeParam: "size", maxSize: 100, firstPage: 0 },
    rateLimit: RL_READ, docsUrl: ref("filterApprovedProducts"),
    notes: t(
      "page x size en fazla 10.000; 10.000'den fazla içerik için nextPageToken kullanın. Docs tutarsızlığı: OpenAPI'de status değerleri archived/blacklisted/locked/onSale, rehberde ek olarak notOnSale; yanıtta OpenAPI deliveryOptions, rehber deliveryOption yazıyor.",
      "page x size max 10,000; use nextPageToken beyond 10,000 contents. Docs inconsistency: OpenAPI status values are archived/blacklisted/locked/onSale, the guide adds notOnSale; the response shows deliveryOptions in OpenAPI vs deliveryOption in the guide.",
    ),
  },
  {
    id: "filterApprovedProductsInventoryAndPrice", group: "products", area: "products",
    title: t("Onaylı ürünlerin stok ve fiyatı", "Approved products stock and price"),
    summary: t(
      "Yalnızca onaylı ürünlerin stok ve fiyat bilgisini döndürür. stockLastModifiedDate yalnızca stok güncellemesi yapılmışsa dolu gelir, aksi halde null.",
      "Returns only stock and price of approved products. stockLastModifiedDate is filled only if a stock update has been made, otherwise null.",
    ),
    method: "GET", path: "/integration/product/sellers/{sellerId}/products/approved/inventory-and-price",
    params: [
      P("barcode", "string", "Tek barkod sorgusu.", "Single barcode query.", { example: "8680000000011" }),
      P("barcodes", "array", "Çoklu barkod sorgusu (en fazla 50).", "Multiple barcode query (max 50).", { arrayStyle: "comma" }),
      P("contentId", "integer", "Tek içerik ID'si sorgusu.", "Single content ID query."),
      P("stockCode", "string", "Stok koduna göre filtreler.", "Filter by stock code."),
      P("productMainId", "string", "Ana ürün koduna göre filtreler.", "Filter by main product code."),
      P("status", "string", "Durum filtresi.", "Status filter.", { enum: ["archived", "blacklisted", "locked", "onSale", "notOnSale"] }),
      pageP("page x size en fazla 10.000", 0), sizeP(100, 50),
      P("orderByDirection", "string", "sellerCreatedDate alanına göre sıralama: asc eskiden yeniye, desc yeniden eskiye.", "Sort by sellerCreatedDate: asc oldest to newest, desc newest to oldest.", { enum: ["asc", "desc"] }),
      nextPageToken,
    ],
    body: { kind: "none" }, risk: "read",
    table: { listPath: "content", columns: [{ key: "contentId", label: t("İçerik ID", "Content ID") }, { key: "productMainId", label: t("Ana ürün kodu", "Main product ID") }, { key: "variants.length", label: t("Varyant", "Variants") }] },
    pagination: { pageParam: "page", sizeParam: "size", maxSize: 100, firstPage: 0 },
    rateLimit: RL_READ, docsUrl: ref("filterApprovedProductsInventoryAndPrice"),
    notes: t("page x size en fazla 10.000; daha fazlası için nextPageToken kullanın. Varyantlar content[].variants[] altındadır (barcode, salePrice, listPrice, quantity).", "page x size max 10,000; use nextPageToken beyond that. Variants live under content[].variants[] (barcode, salePrice, listPrice, quantity)."),
  },
  {
    id: "deleteProducts", group: "products", area: "products",
    title: t("Ürün sil", "Delete products"),
    summary: t(
      "Ürünleri Trendyol sisteminden siler. Onay bekleyen ürünler ve 1 günden uzun süredir arşivde olan, Trendyol tarafından satışa kapatılmamış onaylı ürünler silinebilir.",
      "Removes products from Trendyol. Products pending approval and approved products archived for more than one day and not suspended by Trendyol can be deleted.",
    ),
    method: "DELETE", path: "/integration/product/sellers/{sellerId}/products",
    params: [],
    body: {
      kind: "json", example: { items: [{ barcode: "8680000000061" }, { barcode: "8680000000062" }] },
      fields: [itemsField(1000, "Silinecek ürünler", "Products to delete"), barcodeField()],
    },
    risk: "destructive", rateLimit: RL_WRITE, docsUrl: ref("deleteProducts"),
    notes: t(
      "Geri alınamaz. Sadece onaysız veya 1 günden uzun arşivde duran ürünler silinir; diğer barkodlar batch sonucunda FAILED döner. " + BATCH_NOTE.tr,
      "Irreversible. Only unapproved products or those archived for over one day are deleted; other barcodes come back FAILED in the batch result. " + BATCH_NOTE.en,
    ),
  },
  {
    id: "archiveProducts", group: "products", area: "products",
    title: t("Ürün arşivle / arşivden çıkar", "Archive / unarchive products"),
    summary: t(
      "Ürünleri arşivler ya da arşivden çıkarır. Arşivlenen ürünler Trendyol'da görünmez olur ama silinmez; arşivden çıkarılanlar yeniden aktif olur.",
      "Archives or unarchives products. Archived products become invisible on Trendyol but are not deleted; unarchived ones become active again.",
    ),
    method: "PUT", path: "/integration/product/sellers/{sellerId}/products/archive-state",
    params: [],
    body: {
      kind: "json", example: { items: [{ barcode: "8680000000051", archived: true }, { barcode: "8680000000021", archived: false }] },
      fields: [itemsField(1000, "Arşiv durumu değişecek ürünler", "Products to change archive state for"), barcodeField(), { path: "items[].archived", type: "boolean", required: true, description: t("true: arşivle, false: arşivden çıkar.", "true: archive, false: remove from archive.") }],
    },
    risk: "write", rateLimit: RL_WRITE, docsUrl: ref("archiveProducts"),
    notes: t("Ürünlerin Trendyol'da mevcut olması gerekir. Arşiv durumunu filtre servislerindeki archived alanından izleyebilirsiniz. " + BATCH_NOTE.tr, "Products must already exist in Trendyol. Check the archived field of the filter services to follow the state. " + BATCH_NOTE.en),
  },
  {
    id: "getBuyboxInformation", group: "products", area: "products",
    title: t("Buybox bilgisi", "Buybox information"),
    summary: t(
      "Barkodların buybox sırasını, buybox fiyatını ve birden fazla satıcı olup olmadığını döndürür. En fazla 10 barkod gönderilebilir.",
      "Returns buybox rank, buybox price and whether several sellers exist per barcode. A maximum of 10 barcodes can be sent.",
    ),
    method: "POST", path: "/integration/product/sellers/{sellerId}/products/buybox-information",
    params: [],
    body: { kind: "json", example: { barcodes: ["8680000000011", "8680000000021", "8680000000031"] }, fields: [{ path: "barcodes", type: "string[]", required: true, description: t("Sorgulanacak barkodlar (en fazla 10).", "Barcodes to query (max 10).") }] },
    risk: "read",
    table: { listPath: "buyboxInfo", columns: [{ key: "barcode", label: t("Barkod", "Barcode") }, { key: "buyboxOrder", label: t("Buybox sırası", "Buybox rank") }, { key: "buyboxPrice", label: t("Buybox fiyatı", "Buybox price") }, { key: "hasMultipleSeller", label: t("Birden çok satıcı", "Multiple sellers") }, { key: "secondBuyboxPrice", label: t("2. fiyat", "2nd price") }, { key: "thirdBuyboxPrice", label: t("3. fiyat", "3rd price") }] },
    rateLimit: t("Servis limiti 1000 istek/dk (OpenAPI); limit tablosunda Product Integration Write grubuna dahildir (50.000 ürün limitinde 200 istek/dk).", "Service limit 1000 req/min (OpenAPI); the limits table counts it in the Product Integration Write group (200 req/min at the 50,000-listing tier)."),
    docsUrl: ref("getBuyboxInformation"),
    notes: t("POST olmasına rağmen yalnızca okuma yapar. secondBuyboxPrice/thirdBuyboxPrice yalnızca rehber örneğinde yer alır.", "Despite being a POST it only reads. secondBuyboxPrice/thirdBuyboxPrice appear only in the guide example."),
  },
  {
    id: "unlockProducts", group: "products", area: "products",
    title: t("Ürün kilidini aç", "Unlock products"),
    summary: t(
      "Düşük/yüksek fiyat, kritik fiyat hatası veya tedarik edilememe nedeniyle satışa kapatılan kilitli ürünlerin kilidini açar.",
      "Unlocks products suspended from sale because of low/high pricing, critical price errors or inability to supply.",
    ),
    method: "PUT", path: "/integration/product/sellers/{sellerId}/products/unlock",
    params: [],
    body: { kind: "json", example: { items: [{ barcode: "8680000000041" }] }, fields: [itemsField(1000, "Kilidi açılacak ürünler", "Products to unlock"), barcodeField()] },
    risk: "write", rateLimit: RL_WRITE, docsUrl: ref("unlockProducts"),
    notes: t("Hatalı barkodda 400 (invalid.barcode), bulunamayan üründe 404 (product.not.found) döner. " + BATCH_NOTE.tr, "An invalid barcode returns 400 (invalid.barcode), an unknown product 404 (product.not.found). " + BATCH_NOTE.en),
  },
  // ---------------------------------------------------------------- video & warranty
  {
    id: "createVideo", group: "video", area: "products",
    title: t("Ürün videosu yükle", "Upload product video"),
    summary: t(
      "Verilen URL'den ürün videosu oluşturma sürecini başlatır; video arka planda indirilir ve işlenir. Dönen videoId ile liste servisinden durumu izleyin.",
      "Starts creating a product video from the given URL; it is downloaded and processed in the background. Track it with the returned videoId via the list service.",
    ),
    method: "POST", path: "/integration/video/sellers/{sellerId}/videos", envs: ["production"],
    params: [],
    body: {
      kind: "json",
      example: { title: "Seramik Vazo Tanıtım Videosu", description: "Yeni sezon el yapımı seramik vazo tanıtımı", videoUrl: "https://cdn.example.com/openshelf/seramik-vazo.mp4", productContentIds: ["100000", "100001"], videoContentType: "PRODUCT_PROMOTION" },
      fields: [
        { path: "title", type: "string", required: true, description: t("Video başlığı, 3-50 karakter.", "Video title, 3-50 characters.") },
        { path: "description", type: "string", description: t("Açıklama, en fazla 500 karakter.", "Description, max 500 characters.") },
        { path: "videoUrl", type: "string", required: true, description: t("İndirilecek video adresi; http:// veya https:// ile başlamalı.", "URL of the video to download; must start with http:// or https://.") },
        { path: "productContentIds", type: "string[]", required: true, description: t("İlişkilendirilecek içerik ID'leri: bir içerik en fazla 1 videoya, bir video en fazla 100 içeriğe bağlanır.", "Content IDs to associate: a content can have at most 1 video and a video up to 100 contents.") },
        { path: "videoContentType", type: "string", description: t("PRODUCT_PROMOTION (varsayılan), ASSEMBLY_AND_INSTALLATION, PACKAGING, STORE_PROMOTION, ADVERTISEMENT, PRODUCT_USAGE_AND_EXPERIENCE.", "PRODUCT_PROMOTION (default), ASSEMBLY_AND_INSTALLATION, PACKAGING, STORE_PROMOTION, ADVERTISEMENT, PRODUCT_USAGE_AND_EXPERIENCE.") },
      ],
    },
    risk: "write", rateLimit: t("Video oluşturma: 200 istek/dk.", "Create video: 200 req/min."), docsUrl: "https://developers.trendyol.com/v2.0/docs/video",
    notes: t(
      "Dosya kuralları: .mp4/.mov, en fazla 500 MB, 8-120 sn. Aynı içerik için yalnızca 1 aktif video olabilir; video isApproved=true olana kadar müşteriye gösterilmez. Rehberde operationId yoktur, 'createVideo' bu katalogda türetilmiş bir kimliktir; yalnızca prod URL'si belgelenmiştir.",
      "File rules: .mp4/.mov, max 500 MB, 8-120 s. Only 1 active video per content; the video is not shown to customers until isApproved=true. The docs give no operationId, 'createVideo' is derived in this catalog; only the production URL is documented.",
    ),
  },
  {
    id: "getVideos", group: "video", area: "products",
    title: t("Videoları listele / sorgula", "List / query videos"),
    summary: t("Satıcının entegrasyonla yüklediği videoları listeler; id ya da durum filtresiyle sorgulanabilir.", "Lists the seller's integration videos; can be filtered by id or status."),
    method: "GET", path: "/integration/video/sellers/{sellerId}/videos", envs: ["production"],
    params: [
      P("id", "string", "Belirli bir video ID'si ile sorgular.", "Query by a specific video ID."),
      P("sellerIntegrationStatus", "string", "Entegrasyon durumuna göre filtreler.", "Filter by integration status.", { enum: ["IN_PROGRESS", "SUCCESS", "FAILED"] }),
      pageP("0'dan başlar", 0), sizeP(100, 10),
    ],
    body: { kind: "none" }, risk: "read",
    table: { listPath: "data", columns: [{ key: "id", label: t("Video ID", "Video ID") }, { key: "title", label: t("Başlık", "Title") }, { key: "status", label: t("Durum", "Status") }, { key: "isApproved", label: t("Onaylı", "Approved") }, { key: "errorCode", label: t("Hata kodu", "Error code") }] },
    pagination: { pageParam: "page", sizeParam: "size", maxSize: 100, firstPage: 0 },
    rateLimit: t("Video listeleme: 1000 istek/dk.", "List videos: 1000 req/min."), docsUrl: "https://developers.trendyol.com/v2.0/docs/video",
    notes: t(
      "UNVERIFIED: size üst sınırı belgelenmemiş (100 varsayıldı); 'getVideos' türetilmiş bir kimliktir. status=SUCCESS ve isApproved=true olduğunda video yayındadır.",
      "UNVERIFIED: the maximum size is not documented (100 assumed); 'getVideos' is a derived id. The video is live when status=SUCCESS and isApproved=true.",
    ),
  },
  {
    id: "createWarrantyDocument", group: "warranty", area: "products",
    title: t("Garanti belgesi gönder", "Send warranty document"),
    summary: t(
      "Siparişinizdeki ürün için garanti belgesini (PDF) gönderir. Başarılı istekten sonra müşteri uygulamasında 'Garanti Belgesini Görüntüle' butonu aktif olur.",
      "Sends the warranty certificate (PDF) for a product in your order. After success the 'View Warranty Certificate' button becomes active in the customer app.",
    ),
    method: "POST", path: "/integration/sellers/{sellerId}/warranty-documents",
    params: [],
    body: {
      kind: "multipart",
      example: { shipmentPackageId: "3100000001", lineId: "4100000001" },
      fields: [
        { path: "shipmentPackageId", type: "string", required: true, description: t("Sipariş paket numarası (form-data metin).", "Order package number (form-data text).") },
        { path: "lineId", type: "string", required: true, description: t("Garanti belgesi gönderilen ürünün lineId değeri (paket servisinden alınır).", "lineId of the product the certificate is for (from the order package service).") },
        { path: "file", type: "file", required: true, description: t("Garanti belgesi PDF dosyası.", "Warranty certificate as a PDF file.") },
      ],
      file: { field: "file", accept: ["application/pdf"] },
    },
    risk: "write",
    docsUrl: "https://developers.trendyol.com/v2.0/docs/warranty-documents-service",
    notes: t(
      "JSON gövde yoktur; form-data gönderilir. Gönderilen belgeyi satıcı panelinden veya entegrasyondan görüntüleyemezsiniz. UNVERIFIED: yanıt gövdesi ve hız limiti belgelenmemiş; 'createWarrantyDocument' türetilmiş bir kimliktir.",
      "No JSON body; sent as form-data. You cannot view the sent certificate from the seller panel or integration. UNVERIFIED: response body and rate limit are not documented; 'createWarrantyDocument' is a derived id.",
    ),
  },
  // ---------------------------------------------------------------- updates
  {
    id: "updateUnapprovedProducts", group: "updates", area: "products",
    title: t("Onaysız ürünleri güncelle", "Update unapproved products"),
    summary: t("Onaysız (onay bekleyen/reddedilen) ürünlerin bilgilerini günceller. Tek istekte en fazla 1000 ürün.", "Updates unapproved (pending/rejected) products. At most 1,000 items per request."),
    method: "POST", path: "/integration/product/sellers/{sellerId}/products/unapproved-bulk-update",
    params: [],
    body: {
      kind: "json",
      example: { items: [{
        barcode: "8680000000061", title: "Seramik Vazo - Mat Beyaz 30 cm", description: "<p>Güncellenmiş açıklama: mat beyaz el yapımı vazo.</p>", productMainId: "SERAMIK-VAZO-25", brandId: 9001, categoryId: 411,
        stockCode: "OS-SERAMIK-VAZO-25-BYZ", origin: "TR", dimensionalWeight: 2, vatRate: 20, deliveryOption: { deliveryDuration: 1 }, locationBasedDelivery: "DISABLED",
        lotNumber: "PartiNo:011220", cargoProviders: ["YKMP"], shipmentAddressId: 0, returningAddressId: 0,
        images: [{ url: "https://cdn.dsmcdn.com/mock/openshelf/1.jpg" }],
        attributes: [{ attributeId: 47, attributeValueId: 1002 }, { attributeId: 293, customAttributeValue: "Tek Ebat" }],
      }] },
      fields: [itemsField(1000, "Güncellenecek onaysız ürünler", "Unapproved products to update"), barcodeField(), { path: "items[].title", type: "string", description: t("Ürün adı (en fazla 100).", "Product name (max 100).") }, { path: "items[].description", type: "string", description: t("HTML açıklama (en fazla 30.000).", "HTML description (max 30,000).") }, { path: "items[].attributes[]", type: "object", description: t("Tüm özellikleri gönderin: attributeId + attributeValueId / customAttributeValue.", "Send the full attribute list: attributeId + attributeValueId / customAttributeValue.") }],
    },
    risk: "write", rateLimit: RL_WRITE, docsUrl: ref("updateUnapprovedProducts"),
    notes: t("Bir alanı null göndermek mevcut değeri tamamen siler; değişmesini istemediğiniz alanı gövdeden çıkarın. Kategori/özellik listelerini güncel tutun. " + BATCH_NOTE.tr, "Sending a field as null deletes its current value entirely; omit fields you do not want changed. Keep category/attribute lists current. " + BATCH_NOTE.en),
  },
  {
    id: "updateContentBulk", group: "updates", area: "products",
    title: t("Onaylı ürün içeriğini güncelle", "Update approved product content"),
    summary: t(
      "Onaylı ürünlerin içerik bilgisini (başlık, açıklama, görseller, özellikler) günceller. Özellik değerleri dışında kısmi güncelleme desteklenir. En fazla 1000 öğe.",
      "Updates the content (title, description, images, attributes) of approved products. Partial updates are supported except for attribute values. Max 1,000 items.",
    ),
    method: "POST", path: "/integration/product/sellers/{sellerId}/products/content-bulk-update",
    params: [],
    body: {
      kind: "json",
      example: { items: [{ contentId: 100000, title: "Seramik Vazo - S (El Yapımı)", description: "<p>Güncel ürün açıklaması.</p>", images: [{ url: "https://cdn.dsmcdn.com/mock/openshelf/1.jpg" }], attributes: [{ attributeId: 47, attributeValueId: 1001 }, { attributeId: 1201, attributeValueId: 5001 }] }] },
      fields: [itemsField(1000, "Güncellenecek içerikler", "Contents to update"), { path: "items[].contentId", type: "integer", required: true, description: t("Ürün içerik ID'si (onaylı ürün filtresinden).", "Product content ID (from the approved filter).") }, { path: "items[].title", type: "string", description: t("Yeni başlık (en fazla 100).", "New title (max 100).") }, { path: "items[].description", type: "string", description: t("Yeni açıklama.", "New description.") }, { path: "items[].images[].url", type: "string", description: t("Görsel adresleri (https).", "Image URLs (https).") }, { path: "items[].attributes[]", type: "object", description: t("Özellik güncellenecekse ürünün TÜM özellikleri gönderilmelidir.", "If any attribute is updated, ALL attributes of the product must be sent.") }],
    },
    risk: "write", rateLimit: RL_WRITE, docsUrl: ref("updateContentBulk"),
    notes: t(
      "barcode, productMainId, brandId, categoryId ile slicer/varianter özellik değerleri onaylı üründe değiştirilemez. null göndermek mevcut değeri siler. Sonuç ayrıca getUpdateAudits (QC onay durumu) ile kontrol edilir. " + BATCH_NOTE.tr,
      "barcode, productMainId, brandId, categoryId and slicer/varianter attribute values cannot be changed on approved products. Sending null deletes the value. The review result is also available via getUpdateAudits (QC approval status). " + BATCH_NOTE.en,
    ),
  },
  {
    id: "updateVariantBulk", group: "updates", area: "products",
    title: t("Onaylı ürün varyantını güncelle", "Update approved product variant"),
    summary: t(
      "Onaylı ürünlerin varyant bilgisini günceller: barkod dışındaki tüm alanlar değişebilir. Gönderdiğiniz alanlar kısmi olarak güncellenir. En fazla 1000 öğe.",
      "Updates variant data of approved products: every field except the barcode can change. Only the fields you send are updated. Max 1,000 items.",
    ),
    method: "POST", path: "/integration/product/sellers/{sellerId}/products/variant-bulk-update",
    params: [],
    body: {
      kind: "json",
      example: { items: [{ barcode: "8680000000011", channels: ["CORE"], stockCode: "DEMO-SERAMIK-VAZO-1", origin: "TR", vatRate: 20, shipmentAddressId: 0, returningAddressId: 0, dimensionalWeight: 2.5, lotNumber: "PartiNo:011220", cargoProviders: ["YKMP"], locationBasedDelivery: "DISABLED" }] },
      fields: [itemsField(1000, "Güncellenecek varyantlar", "Variants to update"), barcodeField(), { path: "items[].channels", type: "string[]", description: t("CORE ve/veya LUXE. Boş dizi hata verir; yalnızca belirli kanalda yayına alma/kaldırma için gönderin.", "CORE and/or LUXE. An empty array is an error; send only to publish/unpublish in a specific channel.") }, { path: "items[].locationBasedDelivery", type: "string", description: t("ENABLED, DISABLED veya null.", "ENABLED, DISABLED or null.") }],
    },
    risk: "write", rateLimit: RL_WRITE, docsUrl: ref("updateVariantBulk"),
    notes: t(
      "Docs tutarsızlığı: OpenAPI 'kısmi güncelleme desteklenmez' derken rehber barkod + değişen alanla kısmi güncellemeyi destekler. null göndermek mevcut değeri siler. " + BATCH_NOTE.tr,
      "Docs inconsistency: OpenAPI says partial updates are not supported while the guide supports partial updates with barcode plus changed fields. Sending null deletes the value. " + BATCH_NOTE.en,
    ),
  },
  {
    id: "updateDeliveryInfoBulk", group: "updates", area: "products",
    title: t("Teslimat bilgisini güncelle", "Update delivery information"),
    summary: t("Onaylı ürünlerin teslimat (kargoya veriliş süresi) bilgisini günceller. Barkod dışındaki alanlar değişebilir. En fazla 1000 öğe.", "Updates delivery information (handling time) of approved products. Every field except the barcode can change. Max 1,000 items."),
    method: "POST", path: "/integration/product/sellers/{sellerId}/products/delivery-info-bulk-update",
    params: [],
    body: {
      kind: "json", example: { items: [{ barcode: "8680000000011", deliveryOptions: { deliveryDuration: 0 } }] },
      fields: [itemsField(1000, "Güncellenecek ürünler", "Products to update"), barcodeField(), { path: "items[].deliveryOptions.deliveryDuration", type: "integer", required: true, description: t("0: bugün kargoda, 1: en geç yarın kargoda.", "0: ships today, 1: ships by tomorrow at the latest.") }],
    },
    risk: "write", rateLimit: RL_WRITE, docsUrl: ref("updateDeliveryInfoBulk"),
    notes: t("Ağustos 2026 itibarıyla fastDeliveryType alanına bağımlılık kalktı; işlem yalnızca deliveryDuration ile yönetilir, fastDeliveryType gönderilse de işlenmez. " + BATCH_NOTE.tr, "As of August 2026 the dependency on fastDeliveryType was removed; only deliveryDuration is used and fastDeliveryType is ignored if sent. " + BATCH_NOTE.en),
  },
  {
    id: "getUpdateAudits", group: "updates", area: "products",
    title: t("Güncelleme sonucu / QC onay durumu", "Update result / QC approval status"),
    summary: t(
      "Ürün bilgisi güncelleme servislerine gönderdiğiniz başarılı isteklerin inceleme (QC) adımı sonucunu döndürür. Reddedilen güncellemelerin nedenleri rejectReasons alanında gelir.",
      "Returns the review (QC) step result for successful requests sent to the product update services. Reasons for rejected updates are in rejectReasons.",
    ),
    method: "GET", path: "/integration/product/sellers/{sellerId}/products/{contentId}/update-audits",
    params: [
      { name: "contentId", in: "path", type: "integer", required: true, example: 100000, description: t("Ürün içerik ID'si.", "Product content ID.") },
      pageP("ilk sayfa indeksi belgelenmemiş", 0), sizeP(100, 100),
      P("status", "string", "Güncelleme durumu filtresi: SUCCESS, FAIL, RUNNING.", "Update status filter: SUCCESS, FAIL, RUNNING.", { enum: ["SUCCESS", "FAIL", "RUNNING"] }),
      storefront, acceptLanguage,
    ],
    body: { kind: "none" }, risk: "read",
    table: { listPath: "content", columns: [{ key: "barcode", label: t("Barkod", "Barcode") }, { key: "contentId", label: t("İçerik ID", "Content ID") }, { key: "batchRequestId", label: t("Batch ID", "Batch ID") }, { key: "requestDate", label: t("İstek tarihi", "Request date") }, { key: "updates.length", label: t("Güncelleme sayısı", "Updates") }] },
    pagination: { pageParam: "page", sizeParam: "size", maxSize: 100, firstPage: 0 },
    rateLimit: RL_READ, docsUrl: ref("getUpdateAudits"),
    notes: t(
      "Bu endpoint aynı zamanda 'Product QC Approval Status Check Service' sayfasında belgelenen servistir. updates[].type TITLE | DESCRIPTION | MEDIA | ATTRIBUTE olabilir ve alanlar türe göre değişir. UNVERIFIED: ilk sayfa indeksi (rehber örneği page=1 gösterirken OpenAPI sıfır tabanlı bir alan belirtmez) ve size üst sınırı.",
      "This endpoint is also the service documented on the 'Product QC Approval Status Check Service' page. updates[].type is TITLE | DESCRIPTION | MEDIA | ATTRIBUTE and the fields vary by type. UNVERIFIED: the first-page index (the guide example shows page=1; OpenAPI does not say) and the maximum size.",
    ),
  },
  // ---------------------------------------------------------------- inventory
  {
    id: "updatePriceAndInventory", group: "inventory", area: "products",
    title: t("Stok ve fiyat güncelle", "Update stock and price"),
    summary: t(
      "Trendyol'a aktarılmış ve onaylanmış ürünlerin fiyat ve stok bilgisini aynı anda günceller. Yalnızca stok veya yalnızca fiyat güncellerken diğer alanı göndermeniz gerekmez.",
      "Updates price and stock of products transferred to and approved by Trendyol at the same time. When updating only stock or only price, the other field is not required.",
    ),
    method: "POST", path: "/integration/inventory/sellers/{sellerId}/products/price-and-inventory",
    params: [],
    body: {
      kind: "json",
      example: { items: [{ barcode: "8680000000011", quantity: 25, salePrice: 399.9, listPrice: 449 }, { barcode: "8680000000021", quantity: 60, salePrice: 269, listPrice: 299 }] },
      fields: [
        itemsField(1000, "Güncellenecek barkodlar", "Barcodes to update"), barcodeField(),
        { path: "items[].quantity", type: "integer", description: t("Satılabilir stok; ürün başına en fazla 20.000.", "Sellable stock; max 20,000 per product.") },
        { path: "items[].salePrice", type: "number", description: t("Satış fiyatı (TRY); listPrice'tan büyük olamaz.", "Sale price (TRY); cannot exceed listPrice.") },
        { path: "items[].listPrice", type: "number", description: t("Liste (üstü çizili) fiyat.", "List (strikethrough) price.") },
      ],
    },
    risk: "write", rateLimit: RL_INV, docsUrl: ref("updatePriceAndInventory"),
    notes: t(
      "Gövdede değişiklik yapmadan aynı isteği tekrar gönderirseniz 15 dakika boyunca hata alırsınız (\"15 dakika boyunca aynı isteği tekrarlı olarak atamazsınız!\"): yalnızca değişen stok/fiyatları gönderin. Batch sonucunda batch status dönmez; her öğenin status alanına bakın. Not: endpoints.ts'teki eski yol (/product/sellers/{id}/products/price-and-inventory) bu servis için geçerli değildir; doğrusu /inventory/sellers/{sellerId}/...",
      "Re-sending the identical request within 15 minutes errors (\"15 dakika boyunca aynı isteği tekrarlı olarak atamazsınız!\"): send only changed stock/prices. The batch result carries no batch status; check each item's status. Note: the old path in endpoints.ts (/product/sellers/{id}/products/price-and-inventory) is not valid for this service; the correct one starts with /inventory/sellers/{sellerId}/...",
    ),
  },
  // ---------------------------------------------------------------- batch
  {
    id: "getBatchRequestResult", group: "batch", area: "products",
    title: t("Toplu işlem sonucu", "Batch request result"),
    summary: t(
      "batchRequestId ile asenkron işlemlerin (ürün oluşturma, güncelleme, stok/fiyat, arşiv, silme, kilit açma) sonucunu döndürür. Tamamlanıp tamamlanmadığı status alanından anlaşılır.",
      "Returns the result of asynchronous operations (create, update, stock/price, archive, delete, unlock) by batchRequestId. The status field shows whether it has completed.",
    ),
    method: "GET", path: "/integration/product/sellers/{sellerId}/products/batch-requests/{batchRequestId}",
    params: [{ name: "batchRequestId", in: "path", type: "string", required: true, example: "c0bd29e1-003d-455a-9d74-3a00d868ce9d-1678194595", description: t("Asenkron işlemin döndürdüğü batchRequestId.", "batchRequestId returned by the asynchronous operation.") }],
    body: { kind: "none" }, risk: "read",
    table: { listPath: "items", columns: [{ key: "status", label: t("Durum", "Status") }, { key: "requestItem.barcode", label: t("Barkod", "Barcode") }, { key: "failureReasons", label: t("Hata nedenleri", "Failure reasons") }] },
    rateLimit: RL_READ, docsUrl: ref("getBatchRequestResult"),
    notes: t(
      "Sonuçlar tamamlandıktan sonra 4 saate kadar görüntülenebilir. İşlem durumu status (IN_PROGRESS | COMPLETED), öğe durumu items[].status (SUCCESS | FAILED) ile gelir; stok/fiyat güncellemelerinde batch status dönmez, öğe durumlarını kontrol edin. IN_PROGRESS iken birkaç saniye bekleyip yeniden sorgulayın (polling).",
      "Results can be viewed up to 4 hours after completion. Batch state is status (IN_PROGRESS | COMPLETED), item state is items[].status (SUCCESS | FAILED); stock/price updates carry no batch status, so check item states. While IN_PROGRESS, wait a few seconds and poll again.",
    ),
  },
];

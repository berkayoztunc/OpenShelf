import type { OpParam, Text, TrendyolOperation } from "@openshelf/shared";

/**
 * Product Integration V2 — brands, categories, attributes and lookup services (docs v2.0, Turkey).
 * V1 product APIs (Product Integration V1) were switched off on 10 Aug 2026 and are intentionally NOT part of this catalog.
 * Paths are taken from https://developers.trendyol.com/v2.0/docs/product-v2-api-endpoint (host `https://apigw.trendyol.com`).
 */
const t = (tr: string, en: string): Text => ({ tr, en });
const ref = (id: string) => `https://developers.trendyol.com/v2.0/reference/${id.toLowerCase()}`;

const RL_READ: Text = t(
  "Product Integration Read grubu: 50.000 ürün limitinde 1000 istek/dk (limitsiz hesapta 2000); gruptaki tüm servisler ortak sayılır.",
  "Product Integration Read group: 1000 req/min at the 50,000-listing tier (2000 for unlimited accounts); counted jointly across the whole group.",
);
const RL_WRITE: Text = t(
  "Product Integration Write grubu: 50.000 ürün limitinde 200 istek/dk (limitsiz hesapta 600); ürün oluşturma, güncelleme, silme, arşiv vb. ortak sayılır.",
  "Product Integration Write group: 200 req/min at the 50,000-listing tier (600 for unlimited accounts); product create, update, delete, archive etc. are counted jointly.",
);

const storefront: OpParam = {
  name: "storefrontcode", in: "header", type: "string", example: "TR",
  description: t("Ülke kodu. Gönderilmezse ya da TR gönderilirse Türkiye mağazası kullanılır.", "Country code. If omitted or TR, the Türkiye storefront is used."),
};
const acceptLanguage: OpParam = {
  name: "Accept-Language", in: "header", type: "string", example: "tr",
  description: t(
    "Yanıt dili. TR mağazasında yanıt her zaman Türkçedir; diğer mağazalarda tr, en, ro, ar, el desteklenir (varsayılan en).",
    "Response language. On the TR storefront the response is always Turkish; other storefronts support tr, en, ro, ar, el (default en).",
  ),
};

export const operations: TrendyolOperation[] = [
  {
    id: "getBrands", group: "brands", area: "catalog",
    title: t("Marka listesi", "Brand list"),
    summary: t(
      "createProducts isteğinde göndereceğiniz brandId değerini bu servisle alırsınız. Sayfa başına çok sayıda marka döner.",
      "Retrieves the brandId values you send in createProducts requests. Returns many brands per page.",
    ),
    method: "GET", path: "/integration/product/brands",
    params: [
      { name: "page", in: "query", type: "integer", default: 0, example: 0, description: t("Alınacak marka sayfasının numarası (0'dan başlar).", "Page number of brands to retrieve (starts at 0).") },
      { name: "size", in: "query", type: "integer", default: 1000, example: 1000, description: t("Tek yanıttaki marka sayısı.", "Number of brands per response.") },
    ],
    body: { kind: "none" }, risk: "read",
    table: { listPath: "brands", columns: [{ key: "id", label: t("Marka ID", "Brand ID") }, { key: "name", label: t("Marka adı", "Brand name") }] },
    pagination: { pageParam: "page", sizeParam: "size", maxSize: 1000, firstPage: 0 },
    rateLimit: RL_READ, docsUrl: ref("getBrands"),
    notes: t(
      "Docs: sayfa başına 'en az 1000' marka alınabilir (muhtemelen 'en fazla' demek istiyor); varsayılan olarak 1000 kullanın.",
      "Docs say 'a minimum of 1000' brands per page (likely meant maximum); use 1000 as the page size.",
    ),
  },
  {
    id: "getBrandsByName", group: "brands", area: "catalog",
    title: t("Marka ara (isme göre)", "Brand search by name"),
    summary: t("Marka adına göre arama yapar. Arama büyük/küçük harfe duyarlıdır.", "Searches brands by name. The search is case-sensitive."),
    method: "GET", path: "/integration/product/brands/by-name",
    params: [{ name: "name", in: "query", type: "string", required: true, example: "TRENDYOLMİLLA", description: t("Aranacak marka adı (büyük/küçük harfe duyarlı).", "Brand name to search for (case-sensitive).") }],
    body: { kind: "none" }, risk: "read",
    table: { listPath: "", columns: [{ key: "id", label: t("Marka ID", "Brand ID") }, { key: "name", label: t("Marka adı", "Brand name") }] },
    rateLimit: RL_READ, docsUrl: ref("getBrandsByName"),
  },
  {
    id: "createBrand", group: "brands", area: "catalog",
    title: t("Marka oluştur", "Create brand"),
    summary: t(
      "Trendyol marka listesinde olmayan bir markayı oluşturur. İstek JSON değil form-data olarak gönderilir: 'name' metin, 'images' dosya alanı (1 ila 3 görsel).",
      "Creates a brand that is not in the Trendyol brand list. Sent as form-data, not JSON: 'name' as text and 'images' as files (1 to 3 images).",
    ),
    method: "POST", path: "/integration/product/sellers/{sellerId}/brands",
    params: [{ name: "storeFrontCode", in: "header", type: "string", required: true, example: "TR", description: t("Markanın oluşturulacağı ülke kodu (Türkiye için TR).", "Country code the brand is created for (TR for Türkiye).") }],
    body: {
      kind: "multipart",
      example: { name: "Atölye Seramik" },
      fields: [
        { path: "name", type: "string", required: true, description: t("Oluşturulacak markanın adı (form-data metin alanı).", "Name of the brand to create (form-data text field).") },
        { path: "images", type: "file[]", required: true, description: t("Marka görselleri: en az 1, en fazla 3 dosya.", "Brand images: minimum 1, maximum 3 files.") },
      ],
      file: { field: "images", accept: ["image/jpeg", "image/png"] },
    },
    risk: "write", rateLimit: RL_WRITE, docsUrl: ref("createBrand"),
    notes: t(
      "Başarılı yanıt 201 ve {brandId} döner. Marka oluşturma servisi Write grubunun limitine dahildir.",
      "A successful call returns 201 with {brandId}. Brand creation counts against the Write group limit.",
    ),
  },
  {
    id: "getCategoryTree", group: "categories", area: "catalog",
    title: t("Kategori ağacı", "Category tree"),
    summary: t(
      "createProducts isteğinde göndereceğiniz categoryId değerini bu servisle alırsınız. Mutlaka en alt seviye (yaprak) kategori ID'si kullanılmalıdır.",
      "Retrieves the categoryId values you send in createProducts requests. The lowest-level (leaf) category ID must be used.",
    ),
    method: "GET", path: "/integration/product/product-categories",
    params: [
      { name: "name", in: "query", type: "string", example: "Mum", description: t("Kategori adı filtresi: adında bu kelime geçen tüm seviyelerdeki kategorileri döndürür.", "Category name filter: returns categories at every level whose name contains the keyword.") },
      storefront, acceptLanguage,
    ],
    body: { kind: "none" }, risk: "read",
    table: { listPath: "", columns: [{ key: "id", label: t("Kategori ID", "Category ID") }, { key: "name", label: t("Kategori adı", "Category name") }, { key: "parentId", label: t("Üst kategori", "Parent ID") }] },
    rateLimit: RL_READ, docsUrl: ref("getCategoryTree"),
    notes: t(
      "Kategori ağacı periyodik güncellenir; haftalık olarak yeniden çekmeniz önerilir. Yalnızca yaprak kategoriye ürün aktarılabilir.",
      "The category tree is updated periodically; refetch it weekly. Products can only be created in leaf categories.",
    ),
  },
  {
    id: "getCategoryAttributes", group: "categories", area: "catalog",
    title: t("Kategori özellikleri", "Category attributes"),
    summary: t(
      "Ürün oluşturma isteğinde göndereceğiniz özellik (attribute) bilgilerini döndürür. allowMultipleAttributeValues alanı birden fazla değer seçilip seçilemeyeceğini gösterir.",
      "Returns the attributes to send in product creation requests. allowMultipleAttributeValues tells whether several values are allowed.",
    ),
    method: "GET", path: "/integration/product/categories/{categoryId}/attributes",
    params: [
      { name: "categoryId", in: "path", type: "integer", required: true, example: 411, description: t("Trendyol kategori ID'si (yaprak kategori olmalı).", "Trendyol category ID (must be a leaf category).") },
      { name: "required", in: "query", type: "boolean", example: true, description: t("true: yalnızca zorunlu özellikler; false: yalnızca zorunlu olmayanlar; gönderilmezse hepsi.", "true: only required attributes; false: only non-required; omitted: all.") },
      storefront, acceptLanguage,
    ],
    body: { kind: "none" }, risk: "read",
    table: {
      listPath: "categoryAttributes",
      columns: [
        { key: "attribute.id", label: t("Özellik ID", "Attribute ID") }, { key: "attribute.name", label: t("Özellik", "Attribute") },
        { key: "required", label: t("Zorunlu", "Required") }, { key: "varianter", label: t("Varyant", "Varianter") },
        { key: "slicer", label: t("Slicer", "Slicer") }, { key: "allowCustom", label: t("Özel değer", "Custom value") },
        { key: "allowMultipleAttributeValues", label: t("Çoklu değer", "Multi value") },
      ],
    },
    rateLimit: RL_READ, docsUrl: ref("getCategoryAttributes"),
    notes: t(
      "slicer=true özellikler ürünü ayrı içeriklere böler (ör. renk); varianter=true özellikler aynı içerik altında varyant oluşturur (ör. beden). Haftalık güncellemeniz önerilir.",
      "slicer=true attributes split a product into separate contents (e.g. colour); varianter=true attributes create variants inside one content (e.g. size). Refresh weekly.",
    ),
  },
  {
    id: "getCategoryAttributeValues", group: "categories", area: "catalog",
    title: t("Kategori özellik değerleri", "Category attribute values"),
    summary: t("Bir kategorideki özelliğin alabileceği değerleri (attributeValueId) sayfalı olarak döndürür.", "Returns the values (attributeValueId) an attribute can take in a category, paged."),
    method: "GET", path: "/integration/product/categories/{categoryId}/attributes/{attributeId}/values",
    params: [
      { name: "categoryId", in: "path", type: "integer", required: true, example: 411, description: t("Trendyol kategori ID'si.", "Trendyol category ID.") },
      { name: "attributeId", in: "path", type: "integer", required: true, example: 47, description: t("Özellik ID'si.", "Attribute ID.") },
      { name: "page", in: "query", type: "integer", default: 0, example: 0, description: t("Sayfa numarası (en fazla 1000).", "Page number (max 1000).") },
      { name: "size", in: "query", type: "integer", default: 1000, example: 1000, description: t("Sayfa başına en fazla kayıt (en fazla 1000).", "Maximum items per page (max 1000).") },
      storefront, acceptLanguage,
    ],
    body: { kind: "none" }, risk: "read",
    table: { listPath: "content", columns: [{ key: "attributeValueId", label: t("Değer ID", "Value ID") }, { key: "attributeValueName", label: t("Değer", "Value") }] },
    pagination: { pageParam: "page", sizeParam: "size", maxSize: 1000, firstPage: 0 },
    rateLimit: RL_READ, docsUrl: ref("getCategoryAttributeValues"),
    notes: t(
      "Docs tutarsızlığı: OpenAPI yanıtta attributeValueName, rehber örneği attributeValue yazıyor; burada OpenAPI alanı kullanıldı.",
      "Docs inconsistency: the OpenAPI response uses attributeValueName while the guide example shows attributeValue; the OpenAPI field is used here.",
    ),
  },
  {
    id: "getCargoProviders", group: "lookup", area: "catalog",
    title: t("Kargo firmaları", "Cargo providers"),
    summary: t(
      "Kullanılabilir kargo firmalarını listeler. Dönen code değerlerini ürün oluşturma/güncelleme isteklerindeki cargoProviders alanında gönderebilirsiniz.",
      "Lists the available cargo providers. Send the returned code values in the cargoProviders field of product create/update requests.",
    ),
    method: "GET", path: "/integration/product/lookup/cargo-providers",
    params: [{ ...storefront, description: t("Ülke kodu. Liste mağazaya göre değişir; gönderilmezse TR kullanılır.", "Country code. The list varies by storefront; TR is used when omitted.") }],
    body: { kind: "none" }, risk: "read",
    table: { listPath: "", columns: [{ key: "code", label: t("Kod", "Code") }, { key: "name", label: t("Kargo firması", "Cargo provider") }] },
    rateLimit: RL_READ, docsUrl: ref("getCargoProviders"),
  },
];

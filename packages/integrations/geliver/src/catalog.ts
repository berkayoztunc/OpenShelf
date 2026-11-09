import type { GeliverOperation, OpParam } from "@openshelf/shared";

const t = (tr: string, en: string) => ({ tr, en });
const P = (name: string, type: OpParam["type"], tr: string, en: string, o: Partial<OpParam> = {}): OpParam => ({ name, in: "query", type, description: t(tr, en), ...o });
const idParam = (name: string, tr: string, en: string): OpParam => ({ name, in: "path", type: "string", required: true, description: t(tr, en) });
const page: OpParam[] = [P("limit", "integer", "Sayfa başına kayıt.", "Rows per page.", { example: 10 }), P("page", "integer", "Sayfa numarası (1'den başlar).", "Page number (starts at 1).", { example: 1 })];

const RECIPIENT = { name: "Ayşe Yılmaz", email: "ayse@example.com", phone: "+905051234567", address1: "Atatürk Mah. 1. Sok. No:1", countryCode: "TR", cityCode: "34", cityName: "İstanbul", districtName: "Kadıköy", zip: "34000" };

/**
 * Geliver API operations used by the admin console. Source: docs.geliver.io + the official SDKs (base https://api.geliver.io/api/v1, Bearer token).
 * Paths marked in `notes` as unverified come from the SDKs only; try them in Test mode first.
 */
export const GELIVER_OPERATIONS: GeliverOperation[] = [
  {
    id: "priceList", group: "offers", method: "GET", path: "/priceList", risk: "read",
    title: t("Fiyat listesi", "Price list"), summary: t("Koli ölçüsü ve ağırlığına göre kargo firması tekliflerini döndürür.", "Returns carrier offers for a parcel size and weight."),
    params: [
      P("paramType", "string", "Ölçü tipi.", "Parameter type.", { enum: ["parcel", "documents"], default: "parcel" }),
      P("length", "number", "Uzunluk (cm).", "Length (cm).", { required: true, example: 10 }), P("width", "number", "Genişlik (cm).", "Width (cm).", { required: true, example: 10 }),
      P("height", "number", "Yükseklik (cm).", "Height (cm).", { required: true, example: 10 }), P("weight", "number", "Ağırlık (kg).", "Weight (kg).", { required: true, example: 1 }),
    ],
    body: { kind: "none" },
  },
  {
    id: "listShipments", group: "shipments", method: "GET", path: "/shipments", risk: "read",
    title: t("Gönderileri listele", "List shipments"), summary: t("Gönderileri filtreleyerek sayfalı listeler.", "Lists shipments with filters and pagination."),
    params: [
      ...page, P("statusFilter", "string", "Durum filtresi.", "Status filter."), P("orderNumber", "string", "Sipariş numarası.", "Order number."),
      P("startDate", "string", "Başlangıç tarihi.", "Start date."), P("endDate", "string", "Bitiş tarihi.", "End date."), P("isReturned", "boolean", "Yalnızca iadeler.", "Returned shipments only."),
      P("providerServiceCode", "string", "Kargo servis kodu.", "Carrier service code."), P("storeIdentifier", "string", "Mağaza tanımlayıcısı.", "Store identifier."),
    ],
    body: { kind: "none" },
    notes: t("Yanıt: data[], totalRows, totalPages.", "Response: data[], totalRows, totalPages."),
  },
  {
    id: "getShipment", group: "shipments", method: "GET", path: "/shipments/{id}", risk: "read",
    title: t("Gönderi detayı / takip", "Shipment details / tracking"), summary: t("Tek gönderinin durumunu, takip bilgisini ve etiket adresini döndürür.", "Returns one shipment with status, tracking and label URL."),
    params: [idParam("id", "Geliver gönderi ID'si.", "Geliver shipment ID.")], body: { kind: "none" },
  },
  {
    id: "createShipment", group: "shipments", method: "POST", path: "/shipments", risk: "write",
    title: t("Gönderi oluştur", "Create shipment"), summary: t("Gönderi kaydı açar ve teklifleri döndürür; etiket almak için teklifi kabul etmeniz gerekir.", "Creates a shipment and returns offers; accept an offer to buy the label."),
    params: [],
    body: {
      kind: "json",
      example: { test: true, senderAddressID: "SENDER_ADDRESS_ID", recipientAddress: RECIPIENT, length: "10", width: "10", height: "10", distanceUnit: "cm", weight: "1", massUnit: "kg", order: { sourceCode: "API", sourceIdentifier: "https://magazam.com", orderNumber: "WEB-12345", totalAmount: "150", totalAmountCurrency: "TL" } },
      fields: [
        { path: "test", type: "boolean", description: t("true: ücretsiz test gönderisi.", "true: free test shipment.") },
        { path: "senderAddressID", type: "string", required: true, description: t("Gönderici adres ID'si.", "Sender address ID.") },
        { path: "recipientAddress", type: "object", required: true, description: t("Alıcı adresi (telefon zorunlu) ya da recipientAddressID.", "Recipient address (phone required) or recipientAddressID.") },
        { path: "length/width/height/weight", type: "string", required: true, description: t("cm ve kg, metin olarak.", "cm and kg, as strings.") },
      ],
    },
    notes: t("Test modunda (test:true) ücretsizdir. Canlıda etiket ücreti teklif kabulünde (acceptOffer) tahsil edilir.", "Free with test:true. In live mode the label fee is charged when the offer is accepted (acceptOffer)."),
  },
  {
    id: "acceptOffer", group: "offers", method: "POST", path: "/transactions", risk: "write", billed: true,
    title: t("Teklifi kabul et (etiket al)", "Accept offer (buy label)"), summary: t("Seçilen teklifi satın alır; barkod, etiket ve takip numarası üretir.", "Buys the chosen offer and produces barcode, label and tracking number."),
    params: [], body: { kind: "json", example: { offerID: "OFFER_ID" }, fields: [{ path: "offerID", type: "string", required: true, description: t("createShipment yanıtındaki offers[].id.", "offers[].id from the createShipment response.") }] },
    notes: t("Canlı modda bakiyenizden/kargo hesabınızdan ücret düşer.", "In live mode this charges your balance / carrier account."),
  },
  {
    id: "cancelShipment", group: "shipments", method: "DELETE", path: "/shipments/{id}", risk: "destructive",
    title: t("Gönderiyi iptal et", "Cancel shipment"), summary: t("Henüz kargoya verilmemiş gönderiyi iptal eder.", "Cancels a shipment that has not been handed to the carrier."),
    params: [idParam("id", "Geliver gönderi ID'si.", "Geliver shipment ID.")], body: { kind: "none" },
  },
  {
    id: "listAddresses", group: "addresses", method: "GET", path: "/addresses", risk: "read",
    title: t("Adresleri listele", "List addresses"), summary: t("Kayıtlı gönderici/alıcı adreslerini listeler.", "Lists saved sender/recipient addresses."),
    params: [P("isRecipientAddress", "boolean", "true: alıcı, false: gönderici adresleri.", "true: recipient, false: sender addresses.", { example: false }), ...page], body: { kind: "none" },
  },
  {
    id: "getAddress", group: "addresses", method: "GET", path: "/addresses/{id}", risk: "read",
    title: t("Adres detayı", "Address details"), summary: t("Tek adresi döndürür (healthCheck bunu gönderici adresiyle çağırır).", "Returns one address (the health check calls this with your sender address)."),
    params: [idParam("id", "Adres ID'si.", "Address ID.")], body: { kind: "none" },
  },
  {
    id: "createAddress", group: "addresses", method: "POST", path: "/addresses", risk: "write",
    title: t("Adres oluştur", "Create address"), summary: t("Gönderici veya alıcı adresi kaydeder.", "Saves a sender or recipient address."),
    params: [], body: { kind: "json", example: { ...RECIPIENT, name: "Mağaza Deposu", isRecipientAddress: false, shortName: "Depo" } },
  },
  {
    id: "deleteAddress", group: "addresses", method: "DELETE", path: "/addresses/{id}", risk: "destructive",
    title: t("Adres sil", "Delete address"), summary: t("Kayıtlı adresi siler.", "Deletes a saved address."),
    params: [idParam("id", "Adres ID'si.", "Address ID.")], body: { kind: "none" },
  },
  {
    id: "listParcelTemplates", group: "account", method: "GET", path: "/parceltemplates", risk: "read",
    title: t("Koli şablonları", "Parcel templates"), summary: t("Kayıtlı koli ölçü şablonlarını listeler.", "Lists saved parcel size templates."), params: [...page], body: { kind: "none" },
  },
  {
    id: "listProviderAccounts", group: "account", method: "GET", path: "/provideraccounts", risk: "read",
    title: t("Kargo hesapları", "Provider accounts"), summary: t("Bağlı kargo firması hesaplarınızı listeler.", "Lists your connected carrier accounts."), params: [...page], body: { kind: "none" },
  },
  {
    id: "getBalance", group: "account", method: "GET", path: "/organizations/{organizationId}/balance", risk: "read",
    title: t("Bakiye", "Balance"), summary: t("Organizasyon bakiyesini döndürür.", "Returns the organization balance."),
    params: [idParam("organizationId", "Geliver organizasyon ID'si.", "Geliver organization ID.")], body: { kind: "none" },
  },
  {
    id: "listWebhooks", group: "webhooks", method: "GET", path: "/webhooks", risk: "read",
    title: t("Webhook'lar", "Webhooks"), summary: t("Kayıtlı webhook adreslerini listeler.", "Lists registered webhook URLs."), params: [...page], body: { kind: "none" },
    notes: t("Yol resmi SDK'dan alındı; doğrulanmadı.", "Path taken from the official SDK; unverified."),
  },
  {
    id: "createWebhook", group: "webhooks", method: "POST", path: "/webhooks", risk: "write",
    title: t("Webhook ekle", "Create webhook"), summary: t("Takip güncellemeleri için webhook adresi kaydeder.", "Registers a webhook URL for tracking updates."),
    params: [], body: { kind: "json", example: { url: "https://magazam.com/webhooks/geliver" } },
    notes: t("Geliver webhook imzası belgelenmemiştir; OpenShelf şu an webhook doğrulaması yapmaz.", "Geliver webhooks have no documented signature; OpenShelf does not verify webhooks yet."),
  },
  {
    id: "listCities", group: "geo", method: "GET", path: "/cities", risk: "read",
    title: t("İller", "Cities"), summary: t("Ülke koduna göre il listesi.", "City list for a country code."),
    params: [P("countryCode", "string", "Ülke kodu.", "Country code.", { required: true, default: "TR" })], body: { kind: "none" },
  },
  {
    id: "listDistricts", group: "geo", method: "GET", path: "/districts", risk: "read",
    title: t("İlçeler", "Districts"), summary: t("İl koduna göre ilçe listesi.", "District list for a city code."),
    params: [P("countryCode", "string", "Ülke kodu.", "Country code.", { required: true, default: "TR" }), P("cityCode", "string", "İl plaka kodu.", "City code.", { required: true, example: "34" })], body: { kind: "none" },
  },
];
export const getGeliverOperation = (id: string) => GELIVER_OPERATIONS.find((o) => o.id === id);

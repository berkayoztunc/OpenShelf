import type { GeliverCallResult, GeliverOperation } from "@openshelf/shared";
import { buildGeliverRequest } from "@openshelf/integration-geliver";

/** FNV-1a: deterministic short ids so repeated mock calls look stable. */
const h = (s: string) => { let x = 0x811c9dc5; for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 0x01000193); } return (x >>> 0).toString(16).padStart(8, "0"); };

const f2 = (n: number) => n.toFixed(2);
/** One offer in the real Geliver shape (amounts are strings). */
const offer = (id: string, providerCode: string, amount: number, eta: string, rating: number, o: { accepted?: boolean; pickup?: boolean } = {}) => {
  const vat = amount * 0.2;
  return {
    id, createdAt: "2026-01-10T09:00:01+03:00", updatedAt: "2026-01-10T09:00:02+03:00", amount: f2(amount), currency: "TL", amountVat: f2(vat), amountTax: "0",
    totalAmount: f2(amount + vat), totalAmountLocal: f2(amount + vat), discountRate: "0", bonusBalance: f2(amount * 0.025), providerCode, providerServiceCode: `${providerCode}_STANDART`,
    averageEstimatedTimeHumanReadible: eta, durationTerms: "", rating, isAccepted: !!o.accepted, isGlobal: true, isC2C: true, hasPickupSupport: !!o.pickup, integrationType: "C2C",
  };
};
const offerList = (kg: number, acceptedId?: string) => [
  offer(`mock-offer-${h(`surat${kg}`)}`, "SURAT", 89 + kg * 12.5, "1 gün 18 saat", 90.9),
  offer(`mock-offer-${h(`hepsijet${kg}`)}`, "HEPSIJET", 91 + kg * 11, "1 gün 14 saat", 95, { pickup: true }),
  offer(`mock-offer-${h(`ptt${kg}`)}`, "PTT", 98 + kg * 14, "2 gün 21 saat", 43.4),
  offer(`mock-offer-${h(`yurtici${kg}`)}`, "YURTICI", 160 + kg * 10, "1 gün 6 saat", 96.1),
].map((o) => ({ ...o, isAccepted: o.id === acceptedId }));
/** `offers` on a shipment is an OBJECT { cheapest, fastest, list[] } (not an array). */
const offersObject = (kg: number, acceptedId?: string) => {
  const list = offerList(kg, acceptedId);
  const byPrice = [...list].sort((a, b) => Number(a.totalAmount) - Number(b.totalAmount));
  return { cheapest: byPrice[0], fastest: list.find((o) => o.providerCode === "YURTICI") ?? list[0], list, percentageCompleted: 100, totalOffersRequested: list.length, totalOffersCompleted: list.length, allowOfferFallback: false };
};
const ADDRESS = (id: string, name: string, recipient: boolean) => ({
  id, createdAt: "2026-01-10T09:00:00+03:00", shortName: recipient ? "" : "Ana adres", name, email: recipient ? "alici@example.invalid" : "magaza@example.invalid", phone: "+905000000000",
  address1: recipient ? "Örnek Mah. 1. Sok. No:1 D:2" : "Örnek Cad. No:10 Depo", address2: "", cityCode: recipient ? "16" : "34", cityName: recipient ? "Bursa" : "İstanbul",
  zip: recipient ? "16000" : "34000", districtName: recipient ? "Nilüfer" : "Kadıköy", countryCode: "TR", countryName: "Türkiye", isRecipientAddress: recipient, isActive: true,
});
/** A shipment in the real Geliver shape. `accepted` = offer id once a label was bought. */
const shipment = (id: string, o: { status?: string; sub?: string; accepted?: boolean; kg?: number; orderNumber?: string } = {}) => {
  const kg = o.kg ?? 1;
  const offers = offersObject(kg, o.accepted ? offerList(kg)[1]!.id : undefined);
  const acc = o.accepted ? offers.list[1]! : undefined;
  const code = o.status ?? "TRANSIT";
  return {
    id, createdAt: "2026-01-10T09:00:00+03:00", updatedAt: "2026-01-10T12:30:00+03:00", test: true,
    amount: acc?.amount, currency: "TL", amountVat: acc?.amountVat, amountTax: "0", totalAmount: acc?.totalAmount, bonusBalance: acc?.bonusBalance, discountRate: "0",
    length: "10", width: "10", height: "10", desi: "1", weight: String(kg), massUnit: "kg", distanceUnit: "cm",
    ...(acc ? {
      trackingNumber: `MOCK${h(id).toUpperCase()}`, barcode: `BC${h(id)}`, trackingUrl: `https://example.invalid/track/${id}`,
      labelFileType: "PROVIDER_PDF", labelURL: `https://example.invalid/mock-label/${id}.pdf`, responsiveLabelURL: `https://example.invalid/mock-responsive-label/${id}`,
      trackingStatus: { trackingStatusCode: code, trackingSubStatusCode: o.sub ?? "package_accepted", statusDetails: "Mock: Gönderi alındı, transfer merkezinde", statusDate: "2026-01-10T12:15:00+03:00", locationName: "İstanbul Aktarma Merkezi" },
      packageAcceptedAt: "2026-01-10T12:15:00+03:00",
    } : {}),
    order: { id: `mock-order-${h(id)}`, sourceCode: "API", orderNumber: o.orderNumber ?? "", notes: "", totalAmount: "0" },
    senderAddressID: "mock-addr-1", senderAddress: ADDRESS("mock-addr-1", "Mağaza Deposu", false),
    recipientAddress: ADDRESS(`mock-rcpt-${h(id)}`, "Test Alıcı", true),
    statusCode: acc ? (code === "PRE_TRANSIT" ? "ACTIVE" : "SHIPPED") : "ACTIVE", offers, acceptedOfferID: acc?.id, acceptedOffer: acc,
    providerCode: acc?.providerCode, providerServiceCode: acc?.providerServiceCode, hasError: false, isReturned: false, isReturn: false, productPaymentOnDelivery: false,
    cancelDate: "0001-01-01T00:00:00Z", shipmentDate: null,
  };
};

/** Offline Geliver: deterministic fake responses, zero network. Validates input exactly like a live call would. */
export function runGeliverMock(op: GeliverOperation, call: { path: Record<string, string | number>; query: Record<string, string | number | boolean>; body?: unknown }): GeliverCallResult {
  const req = buildGeliverRequest(op, call); // same validation as live
  const body = (typeof call.body === "string" ? JSON.parse(call.body) : call.body) as Record<string, any> | undefined;
  let data: unknown = [];
  let extra: Record<string, unknown> = {};
  switch (op.id) {
    case "priceList": extra = { priceList: [{ desi: "1", offers: offerList(Number(call.query.weight ?? 1)) }] }; data = undefined; break;
    case "listShipments": data = [shipment("mock-shp-1001", { accepted: true, orderNumber: "WEB-1001" }), shipment("mock-shp-1002", { accepted: true, status: "DELIVERED", sub: "delivered", orderNumber: "WEB-1002" }), shipment("mock-shp-1003", { orderNumber: "WEB-1003" })]; extra = { totalRows: 3, totalPages: 1, limit: Number(call.query.limit ?? 10), page: Number(call.query.page ?? 1) }; break;
    case "getShipment": data = shipment(String(call.path.id), { accepted: !String(call.path.id).startsWith("mock-shp-1003") }); break;
    case "createShipment": data = shipment(`mock-shp-${h(JSON.stringify(body ?? {}))}`, { kg: Number(body?.weight ?? 1), orderNumber: String(body?.order?.orderNumber ?? "") }); break;
    case "acceptOffer": data = { id: `mock-trx-${h(String(body?.offerID))}`, isPayed: true, shipment: shipment(`mock-shp-${h(String(body?.offerID))}`, { accepted: true, status: "PRE_TRANSIT", sub: "label_created" }) }; break;
    case "cancelShipment": data = { id: String(call.path.id), statusCode: "CANCELED" }; break;
    case "listAddresses": data = [{ id: "mock-addr-1", name: "Mağaza Deposu", isRecipientAddress: false, cityName: "İstanbul", districtName: "Kadıköy" }]; break;
    case "getAddress": data = { id: String(call.path.id), name: "Mağaza Deposu", cityName: "İstanbul" }; break;
    case "createAddress": data = { id: `mock-addr-${h(JSON.stringify(body ?? {}))}`, ...(body ?? {}) }; break;
    case "deleteAddress": data = { id: String(call.path.id), deleted: true }; break;
    case "getBalance": data = { balance: "1250.00", currency: "TL" }; break;
    case "listProviderAccounts": data = [{ id: "mock-pa-1", providerCode: "SURAT", active: true }]; break;
    case "listCities": data = [{ cityCode: "34", name: "İstanbul" }, { cityCode: "06", name: "Ankara" }]; break;
    case "listDistricts": data = [{ name: "Kadıköy" }, { name: "Üsküdar" }]; break;
    case "createWebhook": data = { id: `mock-wh-${h(String(body?.url))}`, url: body?.url }; break;
    default: data = [];
  }
  return {
    ok: true, status: 200, durationMs: 0, mock: true, operationId: op.id, risk: op.risk,
    request: { method: req.method, url: req.url, query: req.query, ...(req.body !== undefined ? { body: JSON.parse(req.body) } : {}) },
    response: { body: { result: true, ...(data === undefined ? {} : { data }), ...extra } },
  };
}

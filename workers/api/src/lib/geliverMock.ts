import type { GeliverCallResult, GeliverOperation } from "@openshelf/shared";
import { buildGeliverRequest } from "@openshelf/integration-geliver";

/** FNV-1a: deterministic short ids so repeated mock calls look stable. */
const h = (s: string) => { let x = 0x811c9dc5; for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 0x01000193); } return (x >>> 0).toString(16).padStart(8, "0"); };

const offersFor = (kg: number) => [
  { id: `mock-offer-${h(`surat${kg}`)}`, providerCode: "SURAT", providerServiceCode: "SURAT_STANDART", totalAmount: (89 + kg * 12.5).toFixed(2), currency: "TL" },
  { id: `mock-offer-${h(`yurtici${kg}`)}`, providerCode: "YURTICI", providerServiceCode: "YURTICI_STANDART", totalAmount: (94 + kg * 11).toFixed(2), currency: "TL" },
  { id: `mock-offer-${h(`ptt${kg}`)}`, providerCode: "PTT", providerServiceCode: "PTT_STANDART", totalAmount: (79 + kg * 14).toFixed(2), currency: "TL" },
];
const shipment = (id: string, status = "TRANSIT") => ({
  id, statusCode: "ACTIVE", test: true, providerCode: "SURAT", trackingNumber: `MOCK${h(id).toUpperCase()}`, barcode: `BC${h(id)}`,
  labelURL: `https://example.invalid/mock-label/${id}.pdf`, trackingUrl: `https://example.invalid/track/${id}`,
  trackingStatus: { trackingStatusCode: status, statusDate: "2026-01-10T09:00:00Z", statusDetails: "Mock: transfer merkezinde" },
});

/** Offline Geliver: deterministic fake responses, zero network. Validates input exactly like a live call would. */
export function runGeliverMock(op: GeliverOperation, call: { path: Record<string, string | number>; query: Record<string, string | number | boolean>; body?: unknown }): GeliverCallResult {
  const req = buildGeliverRequest(op, call); // same validation as live
  const body = (typeof call.body === "string" ? JSON.parse(call.body) : call.body) as Record<string, any> | undefined;
  let data: unknown = [];
  let extra: Record<string, unknown> = {};
  switch (op.id) {
    case "priceList": extra = { priceList: [{ desi: "1", offers: offersFor(Number(call.query.weight ?? 1)) }] }; data = undefined; break;
    case "listShipments": data = [shipment("mock-shp-1001"), shipment("mock-shp-1002", "DELIVERED")]; extra = { totalRows: 2, totalPages: 1, limit: Number(call.query.limit ?? 10), page: Number(call.query.page ?? 1) }; break;
    case "getShipment": data = shipment(String(call.path.id)); break;
    case "createShipment": data = { id: `mock-shp-${h(JSON.stringify(body ?? {}))}`, test: true, offers: offersFor(Number(body?.weight ?? 1)) }; break;
    case "acceptOffer": data = { id: `mock-trx-${h(String(body?.offerID))}`, isPayed: true, shipment: shipment(`mock-shp-${h(String(body?.offerID))}`, "PRE_TRANSIT") }; break;
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

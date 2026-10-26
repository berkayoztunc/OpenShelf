import type { MockHandler, MockRequest, MockResponse, MockState } from "@openshelf/shared";
import { loadList, loadProducts, pageOf, saveList, type MockProduct } from "./state";

/**
 * Offline, stateful simulation of the Trendyol order APIs (orders, split, alternative delivery, labels, address
 * lookups and the STAGE test-order API). Shipment packages live in `ty:orders` (real getShipmentPackages shape);
 * created common labels live in `ty:labels`. Keys starting with `_` are internal and never leave the mock.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Rec = Record<string, any>;
const KEY = "ty:orders";
const LABELS_KEY = "ty:labels";
const DAY = 86_400_000;
const HOUR = 3_600_000;

// ───────────── reference data ─────────────
const CARGO: Record<string, { id: number; name: string }> = {
  YKMP: { id: 4, name: "Yurtiçi Kargo Marketplace" }, ARASMP: { id: 5, name: "Aras Kargo Marketplace" }, SURATMP: { id: 6, name: "Sürat Kargo Marketplace" },
  HOROZMP: { id: 7, name: "Horoz Kargo Marketplace" }, DHLECOMMP: { id: 8, name: "DHL eCommerce Marketplace" }, PTTMP: { id: 9, name: "PTT Kargo Marketplace" },
  CEVAMP: { id: 10, name: "CEVA Marketplace" }, TEXMP: { id: 11, name: "Trendyol Express Marketplace" }, UPSMP: { id: 12, name: "UPS Kargo Marketplace" },
  KOLAYGELSINMP: { id: 13, name: "Kolay Gelsin Marketplace" }, CEVATEDARIK: { id: 14, name: "CEVA Tedarik Marketplace" },
};
const CANCEL_REASONS: Record<number, string> = { 500: "Stok Yok", 501: "Hatalı Ürün", 502: "Yanlış Fiyat", 504: "Entegrasyon Sorunu", 505: "Toplu Alım", 506: "Mücbir Sebep" };
const STATUS_ENUM = ["Awaiting", "Created", "Picking", "Invoiced", "Shipped", "Cancelled", "Delivered", "UnDelivered", "Returned", "AtCollectionPoint", "UnSupplied", "UnPacked", "Verified"];
const OPEN = ["Created", "Picking", "Invoiced"];

const CITY_NAMES = "Adana,Adıyaman,Afyonkarahisar,Ağrı,Amasya,Ankara,Antalya,Artvin,Aydın,Balıkesir,Bilecik,Bingöl,Bitlis,Bolu,Burdur,Bursa,Çanakkale,Çankırı,Çorum,Denizli,Diyarbakır,Edirne,Elazığ,Erzincan,Erzurum,Eskişehir,Gaziantep,Giresun,Gümüşhane,Hakkâri,Hatay,Isparta,Mersin,İstanbul,İzmir,Kars,Kastamonu,Kayseri,Kırklareli,Kırşehir,Kocaeli,Konya,Kütahya,Malatya,Manisa,Kahramanmaraş,Mardin,Muğla,Muş,Nevşehir,Niğde,Ordu,Rize,Sakarya,Samsun,Siirt,Sinop,Sivas,Tekirdağ,Tokat,Trabzon,Tunceli,Şanlıurfa,Uşak,Van,Yozgat,Zonguldak,Aksaray,Bayburt,Karaman,Kırıkkale,Batman,Şırnak,Bartın,Ardahan,Iğdır,Yalova,Karabük,Kilis,Osmaniye,Düzce".split(",");
export const TR_CITIES = CITY_NAMES.map((name, i) => ({ id: i + 1, name }));
type Nb = { id: number; name: string };
type Dist = { id: number; name: string; neighborhoods: Nb[] };
/** District/neighborhood ids are mock-only (the docs show no sample data); city ids follow the plate code (cityCode 34 = İstanbul in the docs sample). */
export const TR_DISTRICTS: Record<number, Dist[]> = {
  34: [
    { id: 1740, name: "Kadıköy", neighborhoods: [{ id: 21101, name: "Caferağa Mahallesi" }, { id: 21102, name: "Moda Mahallesi" }, { id: 21103, name: "Fenerbahçe Mahallesi" }] },
    { id: 1731, name: "Beşiktaş", neighborhoods: [{ id: 21111, name: "Levent Mahallesi" }, { id: 21112, name: "Etiler Mahallesi" }] },
    { id: 54, name: "Sarıyer", neighborhoods: [{ id: 21121, name: "Maslak Mahallesi" }, { id: 21122, name: "Tarabya Mahallesi" }] },
    { id: 1750, name: "Üsküdar", neighborhoods: [{ id: 21131, name: "Acıbadem Mahallesi" }, { id: 21132, name: "Kuzguncuk Mahallesi" }] },
    { id: 1748, name: "Şişli", neighborhoods: [{ id: 21141, name: "Mecidiyeköy Mahallesi" }, { id: 21142, name: "Nişantaşı Mahallesi" }] },
    { id: 1730, name: "Bakırköy", neighborhoods: [{ id: 21151, name: "Yeşilköy Mahallesi" }, { id: 21152, name: "Zeytinlik Mahallesi" }] },
  ],
  6: [
    { id: 1204, name: "Çankaya", neighborhoods: [{ id: 22101, name: "Kızılay Mahallesi" }, { id: 22102, name: "Çayyolu Mahallesi" }, { id: 22103, name: "Bahçelievler Mahallesi" }] },
    { id: 1210, name: "Keçiören", neighborhoods: [{ id: 22111, name: "Etlik Mahallesi" }, { id: 22112, name: "Kuşcağız Mahallesi" }] },
    { id: 1220, name: "Yenimahalle", neighborhoods: [{ id: 22121, name: "Batıkent Mahallesi" }, { id: 22122, name: "Demetevler Mahallesi" }] },
    { id: 1213, name: "Mamak", neighborhoods: [{ id: 22131, name: "Tuzluçayır Mahallesi" }] },
  ],
  35: [
    { id: 1801, name: "Konak", neighborhoods: [{ id: 23101, name: "Alsancak Mahallesi" }, { id: 23102, name: "Kemeraltı Mahallesi" }] },
    { id: 1802, name: "Bornova", neighborhoods: [{ id: 23111, name: "Erzene Mahallesi" }, { id: 23112, name: "Kazımdirik Mahallesi" }] },
    { id: 1803, name: "Karşıyaka", neighborhoods: [{ id: 23121, name: "Bostanlı Mahallesi" }, { id: 23122, name: "Mavişehir Mahallesi" }] },
    { id: 1804, name: "Buca", neighborhoods: [{ id: 23131, name: "Şirinyer Mahallesi" }] },
  ],
};
const COUNTRIES = [
  { id: 1, code: "TR", name: "Türkiye" }, { id: 2, code: "AZ", name: "Azerbaycan" }, { id: 3, code: "SA", name: "Suudi Arabistan" }, { id: 4, code: "AE", name: "Birleşik Arap Emirlikleri" },
  { id: 5, code: "KW", name: "Kuveyt" }, { id: 6, code: "QA", name: "Katar" }, { id: 7, code: "BH", name: "Bahreyn" }, { id: 8, code: "OM", name: "Umman" },
  { id: 9, code: "DE", name: "Almanya" }, { id: 10, code: "RO", name: "Romanya" }, { id: 11, code: "CZ", name: "Çekya" }, { id: 12, code: "SK", name: "Slovakya" },
  { id: 13, code: "HU", name: "Macaristan" }, { id: 14, code: "BG", name: "Bulgaristan" }, { id: 15, code: "PL", name: "Polonya" },
];
const COUNTRY_CITIES: Record<string, Nb[]> = {
  AE: [{ id: 1, name: "Dubai" }, { id: 2, name: "Abu Dhabi" }, { id: 3, name: "Sharjah" }], SA: [{ id: 1, name: "Riyadh" }, { id: 2, name: "Jeddah" }, { id: 3, name: "Dammam" }],
  KW: [{ id: 1, name: "Kuwait City" }], QA: [{ id: 1, name: "Doha" }], BH: [{ id: 1, name: "Manama" }], OM: [{ id: 1, name: "Muscat" }],
  DE: [{ id: 1, name: "Berlin" }, { id: 2, name: "München" }], RO: [{ id: 1, name: "București" }, { id: 2, name: "Cluj-Napoca" }], CZ: [{ id: 1, name: "Praha" }, { id: 2, name: "Brno" }],
  SK: [{ id: 1, name: "Bratislava" }], HU: [{ id: 1, name: "Budapest" }], BG: [{ id: 1, name: "Sofia" }], PL: [{ id: 1, name: "Warszawa" }],
};
const GULF_DISTRICTS: Record<string, Record<number, Nb[]>> = {
  AE: { 1: [{ id: 101, name: "Deira" }, { id: 102, name: "Bur Dubai" }, { id: 103, name: "Jumeirah" }], 2: [{ id: 201, name: "Al Reem Island" }, { id: 202, name: "Khalifa City" }] },
  SA: { 1: [{ id: 301, name: "Al Olaya" }, { id: 302, name: "Al Malaz" }] },
};
const AZ_CITIES: Nb[] = [{ id: 1, name: "Bakı" }, { id: 2, name: "Gəncə" }, { id: 3, name: "Sumqayıt" }, { id: 4, name: "Lənkəran" }, { id: 5, name: "Mingəçevir" }];
const AZ_DISTRICTS: Record<number, Nb[]> = { 1: [{ id: 11, name: "Nəsimi" }, { id: 12, name: "Yasamal" }, { id: 13, name: "Nərimanov" }, { id: 14, name: "Xətai" }], 2: [{ id: 21, name: "Kəpəz" }, { id: 22, name: "Nizami" }] };

const CUSTOMERS = [
  { first: "Ayşe", last: "Yılmaz", city: 34, district: "Kadıköy", nb: 0, addr: "Moda Cd. No:12 D:4", phone: "5321112233" },
  { first: "Mehmet", last: "Kaya", city: 6, district: "Çankaya", nb: 0, addr: "Atatürk Blv. No:88 D:7", phone: "5334445566" },
  { first: "Elif", last: "Demir", city: 35, district: "Bornova", nb: 0, addr: "Erzene Mah. 148 Sk. No:5", phone: "5357778899" },
  { first: "Mustafa", last: "Çelik", city: 34, district: "Şişli", nb: 1, addr: "Abdi İpekçi Cd. No:41 D:2", phone: "5421230987" },
  { first: "Zeynep", last: "Arslan", city: 6, district: "Yenimahalle", nb: 0, addr: "Batıkent Blv. 1530 Sk. No:3", phone: "5063216549" },
  { first: "Burak", last: "Şahin", city: 35, district: "Karşıyaka", nb: 1, addr: "Mavişehir Sahil Yolu No:22 D:9", phone: "5389876543" },
  { first: "Fatma", last: "Aydın", city: 34, district: "Üsküdar", nb: 0, addr: "Acıbadem Cd. No:17 D:1", phone: "5551239876" },
  { first: "Emre", last: "Koç", city: 34, district: "Sarıyer", nb: 0, addr: "Büyükdere Cd. No:101 K:5", phone: "5302345678" },
];

// ───────────── helpers ─────────────
const r2 = (n: number) => Math.round(n * 100) / 100;
const ok = (body: unknown = ""): MockResponse => ({ status: 200, body });
const fail = (status: number, message: string): MockResponse => ({
  status, body: { error: status === 404 ? "Not Found" : status === 429 ? "too.many.requests" : "Bad Request", message },
});
const labelFail = (status: number, type: string, title: string): MockResponse => ({ status, body: { error: { status, errors: [{ code: 1001, type, title }] } } });
const bodyOf = (req: MockRequest): Rec => (req.body && typeof req.body === "object" && !Array.isArray(req.body) ? (req.body as Rec) : {});
const list = (v: unknown): string[] => (v === undefined || v === null || v === "" ? [] : (Array.isArray(v) ? v : [v]).flatMap((x) => String(x).split(",")).map((s) => s.trim()).filter(Boolean));
const numOf = (v: unknown): number | undefined => (v === undefined || v === null || v === "" ? undefined : Number(v));
const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);
const clean = <T,>(p: T): T => JSON.parse(JSON.stringify(p, (k, v) => (k.startsWith("_") ? undefined : v)));
const num = (req: MockRequest, name: string) => Number(req.path[name]);

function recompute(p: Rec) {
  const lines: Rec[] = p.lines;
  const gross = r2(lines.reduce((s, l) => s + l.lineGrossAmount, 0));
  const seller = r2(lines.reduce((s, l) => s + l.lineSellerDiscount, 0));
  const ty = r2(lines.reduce((s, l) => s + l.lineTyDiscount, 0));
  p.packageGrossAmount = gross; p.packageSellerDiscount = seller; p.packageTyDiscount = ty;
  p.packageTotalDiscount = r2(seller + ty); p.packageTotalPrice = r2(gross - seller - ty);
}
function touch(p: Rec, now: number, status?: string) {
  p.lastModifiedDate = now;
  if (!status) return;
  p.status = status; p.shipmentPackageStatus = status;
  p.packageHistories.push({ createdDate: now, status });
  for (const l of p.lines) if (!["Cancelled", "UnSupplied"].includes(l.orderLineItemStatusName)) l.orderLineItemStatusName = status;
}
const trackingLink = (n: number) => `https://tracking.trendyol.com/?id=${n}`;

function buildLine(p: MockProduct, quantity: number, lineId: number, sellerId: number, status: string, discountPct = 0, tyPct = 0): Rec {
  const unit = p.listPrice; const gross = r2(unit * quantity);
  const campaign = r2((p.listPrice - p.salePrice) * quantity);
  const extra = r2((p.salePrice * quantity * discountPct) / 100);
  const tyExtra = r2((p.salePrice * quantity * tyPct) / 100);
  const seller = r2(campaign + Math.max(0, extra - tyExtra));
  return {
    quantity, salesCampaignId: 11, productSize: "Tek Ebat", stockCode: p.stockCode, productName: p.title, contentId: p.productContentId, productOrigin: "TR", sellerId,
    lineGrossAmount: gross, lineTotalDiscount: r2(seller + tyExtra), lineSellerDiscount: seller, lineTyDiscount: tyExtra, discountDetails: [],
    currencyCode: "TRY", productColor: "Bej", lineId, vatRate: 20, barcode: p.barcode, orderLineItemStatusName: status, lineUnitPrice: unit,
    fastDeliveryOptions: [], productCategoryId: p.categoryId, commission: 13, businessUnit: p.categoryName, cancelledBy: "", cancelReason: "", cancelReasonCode: 0,
  };
}
function address(c: { first: string; last: string; city: number; district: string; nb: number; addr: string; phone: string }, id: number, cityName?: string): Rec {
  const d = TR_DISTRICTS[c.city]?.find((x) => x.name === c.district);
  const n = d?.neighborhoods[c.nb] ?? d?.neighborhoods[0];
  const city = cityName ?? TR_CITIES[c.city - 1]?.name ?? "";
  return {
    id, firstName: c.first, lastName: c.last, company: "", address1: c.addr, address2: "", city, cityCode: c.city, district: c.district, districtId: d?.id ?? 0,
    addressLines: { addressLine1: c.addr, addressLine2: "" }, postalCode: "", countryCode: "TR", neighborhoodId: n?.id ?? 0, neighborhood: n?.name ?? "", phone: c.phone,
    fullAddress: `${c.addr} ${n?.name ?? ""} ${c.district}/${city}`.replace(/\s+/g, " ").trim(), fullName: `${c.first} ${c.last}`,
  };
}
interface BuildOpts {
  products: MockProduct[]; picks: Array<{ pi: number; qty: number; lineId: number; discountPct?: number; tyPct?: number }>; status: string; orderDate: number; now: number;
  sellerId: number; packageId: number; orderNumber: string; tracking: number; cargo: string; customerId: number; shipAddr: Rec; invAddr: Rec; email: string;
  first: string; last: string; history?: string[]; commercial?: boolean; invoiceAddrExtra?: Rec;
}
function buildPackage(o: BuildOpts): Rec {
  const lineStatus = o.status;
  const lines = o.picks.map((k) => buildLine(o.products[k.pi % o.products.length]!, k.qty, k.lineId, o.sellerId, lineStatus, k.discountPct, k.tyPct));
  const path = o.history ?? ["Created"];
  const histories = path.map((s, i) => ({ createdDate: Math.min(o.now, o.orderDate + i * 4 * HOUR), status: s }));
  const last = histories[histories.length - 1]!.createdDate;
  const cargo = CARGO[o.cargo]!;
  const p: Rec = {
    shipmentAddress: o.shipAddr, orderNumber: o.orderNumber, paymentMethod: "Kredi Kartı", orderCountryCode: "TR", discountDisplays: [], taxNumber: null,
    invoiceAddress: { ...o.invAddr, ...(o.invoiceAddrExtra ?? {}) }, customerFirstName: o.first, customerEmail: o.email, customerId: o.customerId, supplierId: o.sellerId,
    customerLastName: o.last, channelId: 1, shipmentPackageId: o.packageId, cargoTrackingNumber: o.tracking, cargoTrackingLink: trackingLink(o.tracking),
    cargoSenderNumber: String(210090000000 + (o.packageId % 1000000)), sellerDeliveryMethod: null, sellerOtpCode: null, cargoProviderName: cargo.name, cargoProviderId: cargo.id, lines,
    orderDate: o.orderDate, identityNumber: "11111111111", currencyCode: "TRY", packageHistories: histories, shipmentPackageStatus: o.status, status: o.status,
    whoPays: 1, deliveryType: "normal", timeSlotId: 0, estimatedDeliveryStartDate: o.orderDate + 3 * DAY, estimatedDeliveryEndDate: o.orderDate + 5 * DAY,
    deliveryAddressType: "Shipment", agreedDeliveryDate: o.orderDate + 2 * DAY, agreedDeliveryDateExtendible: OPEN.includes(o.status), fastDelivery: false,
    originShipmentDate: o.orderDate, lastModifiedDate: last, commercial: !!o.commercial, fastDeliveryType: "", deliveredByService: false, warehouseId: 372389,
    micro: false, giftBoxRequested: false, "3pByTrendyol": false, containsDangerousProduct: false, cargoDeci: 2, boxQuantity: 1, deci: 1.5, isCod: false,
    createdBy: "order-creation", originPackageIds: null, shipmentNumber: 606400000 + (o.packageId % 100000), _cargoCode: o.cargo,
  };
  recompute(p);
  return p;
}
const PATHS: Record<string, string[]> = {
  Created: ["Created"], Picking: ["Created", "Picking"], Invoiced: ["Created", "Picking", "Invoiced"], Shipped: ["Created", "Picking", "Invoiced", "Shipped"],
  Delivered: ["Created", "Picking", "Invoiced", "Shipped", "Delivered"], Cancelled: ["Created", "Cancelled"], UnSupplied: ["Created", "UnSupplied"],
  Returned: ["Created", "Picking", "Invoiced", "Shipped", "Returned"],
};
const SEED_SPEC: Array<[status: string, days: number, cust: number, picks: Array<[number, number]>, cargo: string]> = [
  ["Created", 0.3, 0, [[0, 1], [2, 2]], "YKMP"], ["Created", 0.8, 1, [[3, 1]], "ARASMP"], ["Created", 1.5, 2, [[1, 2], [4, 1]], "TEXMP"],
  ["Picking", 2, 3, [[2, 1]], "ARASMP"], ["Picking", 3, 4, [[0, 2], [3, 1]], "YKMP"], ["Invoiced", 4, 5, [[4, 1]], "TEXMP"], ["Invoiced", 5, 6, [[1, 1], [2, 1]], "ARASMP"],
  ["Shipped", 7, 7, [[3, 2]], "YKMP"], ["Shipped", 9, 0, [[0, 1]], "TEXMP"], ["Delivered", 12, 1, [[2, 3]], "ARASMP"], ["Delivered", 15, 2, [[3, 1], [1, 1]], "YKMP"],
  ["Cancelled", 6, 3, [[5, 1]], "YKMP"], ["UnSupplied", 8, 4, [[4, 1]], "SURATMP"], ["Returned", 18, 5, [[0, 1], [3, 1]], "ARASMP"],
];
function seedPackages(products: MockProduct[], now: number, sellerId: number): Rec[] {
  return SEED_SPEC.map(([status, days, ci, picks, cargo], i) => {
    const c = CUSTOMERS[ci]!;
    const ship = address(c, 11100000 + i * 2), inv = address(c, 11100001 + i * 2);
    const p = buildPackage({
      products, picks: picks.map(([pi, qty], k) => ({ pi, qty, lineId: 4765111100 + i * 10 + k })), status, orderDate: Math.round(now - days * DAY), now, sellerId,
      packageId: 3330111101 + i, orderNumber: String(10751234500 + i * 13), tracking: 7280027500000000 + 111 * (i + 1), cargo, customerId: 888888800 + ci,
      shipAddr: ship, invAddr: inv, email: `${c.first}.${c.last}@example.com`.toLowerCase().replace(/[çğıöşü]/g, (m) => ({ ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u" })[m]!),
      first: c.first, last: c.last, history: PATHS[status],
    });
    if (status === "Cancelled" || status === "UnSupplied") for (const l of p.lines) { l.cancelledBy = status === "Cancelled" ? "Customer" : "Seller"; l.cancelReason = status === "Cancelled" ? "Müşteri iptali" : "Stok Yok"; l.cancelReasonCode = status === "Cancelled" ? 0 : 500; }
    return p;
  });
}
async function load(state: MockState, sellerId: string): Promise<Rec[]> {
  const products = await loadProducts(state);
  return loadList<Rec>(state, KEY, () => seedPackages(products, state.now(), Number(sellerId) || 0));
}
const nextPkgId = async (s: MockState) => 3340000000 + (await s.nextId("ty:pkg"));
const nextLineId = async (s: MockState) => 4770000000 + (await s.nextId("ty:line"));
const nextTracking = async (s: MockState) => 7280027600000000 + (await s.nextId("ty:track"));

type Ctx = { pkg: Rec; all: Rec[]; now: number; state: MockState; req: MockRequest };
async function mutate(req: MockRequest, state: MockState, fn: (c: Ctx) => MockResponse | Promise<MockResponse>, by: "id" | "tracking" = "id"): Promise<MockResponse> {
  const all = await load(state, req.sellerId);
  const pkg = by === "id" ? all.find((p) => p.shipmentPackageId === num(req, "packageId")) : all.find((p) => String(p.cargoTrackingNumber) === String(req.path.cargoTrackingNumber));
  if (!pkg) return fail(by === "id" ? 404 : 400, by === "id" ? `Shipment package ${req.path.packageId} not found` : `No package found for cargo tracking number ${req.path.cargoTrackingNumber}`);
  const res = await fn({ pkg, all, now: state.now(), state, req });
  if (res.status < 300) await saveList(state, KEY, all);
  return res;
}
const statusErr = (pkg: Rec, to: string) => fail(400, `Package status ${pkg.status} cannot be updated to ${to}`);

interface Pick { lineId: number; qty?: number }
/** Moves `picks` out of `pool` into a new line list; partial quantities create a new lineId for the taken part. */
async function takeLines(pool: Rec[], picks: Pick[], state: MockState): Promise<{ taken: Rec[]; error?: string }> {
  const taken: Rec[] = [];
  for (const pk of picks) {
    const idx = pool.findIndex((l) => l.lineId === pk.lineId);
    if (idx < 0) return { taken, error: `Order line ${pk.lineId} not found in package` };
    const line = pool[idx]!; const qty = pk.qty ?? line.quantity;
    if (!isInt(qty) || qty < 1 || qty > line.quantity) return { taken, error: `Invalid quantity ${qty} for order line ${pk.lineId} (available ${line.quantity})` };
    if (qty === line.quantity) { taken.push(line); pool.splice(idx, 1); continue; }
    const f = qty / line.quantity; const part: Rec = { ...line, quantity: qty, lineId: await nextLineId(state) };
    for (const k of ["lineGrossAmount", "lineTotalDiscount", "lineSellerDiscount", "lineTyDiscount"]) { part[k] = r2(line[k] * f); line[k] = r2(line[k] - part[k]); }
    line.quantity -= qty; taken.push(part);
  }
  return { taken };
}
async function spawn(c: Ctx, lines: Rec[], createdBy: string, status: string): Promise<Rec> {
  const np: Rec = JSON.parse(JSON.stringify(c.pkg));
  const id = await nextPkgId(c.state); const tn = await nextTracking(c.state);
  Object.assign(np, {
    shipmentPackageId: id, cargoTrackingNumber: tn, cargoTrackingLink: trackingLink(tn), shipmentNumber: 606400000 + (id % 100000), lines, createdBy,
    originPackageIds: [c.pkg.shipmentPackageId], packageHistories: [{ createdDate: c.now, status }], lastModifiedDate: c.now, status, shipmentPackageStatus: status,
    agreedDeliveryDateExtendible: OPEN.includes(status), deliveredByService: false,
  });
  for (const l of lines) if (!["Cancelled", "UnSupplied"].includes(l.orderLineItemStatusName)) l.orderLineItemStatusName = status;
  recompute(np); c.all.push(np);
  return np;
}
/** Shared split engine: each group becomes a new Created package, leftovers form one more; the source becomes UnPacked. */
async function splitInto(c: Ctx, groups: Pick[][]): Promise<{ error: MockResponse } | { ids: number[] }> {
  if (!["Created", "Picking"].includes(c.pkg.status)) return { error: fail(400, `Package in status ${c.pkg.status} cannot be split (must be Created or Picking)`) };
  if (!groups.length || groups.some((g) => !g.length)) return { error: fail(400, "Every split group must contain at least one order line") };
  const pool: Rec[] = JSON.parse(JSON.stringify(c.pkg.lines));
  const takenGroups: Rec[][] = [];
  for (const g of groups) {
    const r = await takeLines(pool, g, c.state);
    if (r.error) return { error: fail(400, r.error) };
    takenGroups.push(r.taken);
  }
  if (takenGroups.length === 1 && !pool.length) return { error: fail(400, "The package cannot be split into a single identical package") };
  const ids: number[] = [];
  for (const g of takenGroups) ids.push((await spawn(c, g, "split", "Created")).shipmentPackageId);
  if (pool.length) await spawn(c, pool, "split", "Created");
  c.pkg.lines = c.pkg.lines.map((l: Rec) => ({ ...l, orderLineItemStatusName: "UnPacked" }));
  touch(c.pkg, c.now, "UnPacked");
  return { ids };
}

// ───────────── list endpoints ─────────────
const WEEK = 7 * DAY;
function dateWindow(start: number | undefined, end: number | undefined, now: number): [number, number] | string {
  const e = end ?? now; const s = start ?? e - WEEK;
  if (s > e) return "startDate must be before endDate";
  if (e - s > 2 * WEEK) return "The date range between startDate and endDate cannot exceed 2 weeks";
  return [s, e];
}
const getShipmentPackages: MockHandler = async (req, state) => {
  const q = req.query; const now = state.now();
  const size = numOf(q.size) ?? 200; const page = numOf(q.page) ?? 0;
  if (!isInt(size) || size < 1 || size > 200) return fail(400, "size must be between 1 and 200");
  if (!isInt(page) || page < 0) return fail(400, "page must be a non-negative integer");
  if ((page + 1) * size > 10000 && page * size >= 10000) return fail(400, "Maximum accessible record count is 10000 (maxQueryWindowResult); use getShipmentPackagesStream or narrow the date range");
  const statuses = list(q.status); const bad = statuses.find((s) => !STATUS_ENUM.includes(s));
  if (bad) return fail(400, `Invalid status: ${bad}`);
  const orderBy = String(q.orderByField ?? "PackageLastModifiedDate");
  if (!["PackageLastModifiedDate", "CreatedDate"].includes(orderBy)) return fail(400, "orderByField must be PackageLastModifiedDate or CreatedDate");
  const dir = String(q.orderByDirection ?? "DESC").toUpperCase();
  if (!["ASC", "DESC"].includes(dir)) return fail(400, "orderByDirection must be ASC or DESC");
  const win = dateWindow(numOf(q.startDate), numOf(q.endDate), now);
  const ids = list(q.shipmentPackageIds).map(Number);
  if (ids.length > 50) return fail(400, "shipmentPackageIds accepts at most 50 ids");
  if (typeof win === "string") return fail(400, win);
  const field = orderBy === "CreatedDate" ? "orderDate" : "lastModifiedDate";
  const explicitIds = ids.length > 0 || q.orderNumber;
  let rows = await load(state, req.sellerId);
  rows = rows.filter((p) => (explicitIds ? true : p[field] >= win[0] && p[field] <= win[1]) && (!q.startDate || p[field] >= Number(q.startDate)) && (!q.endDate || p[field] <= Number(q.endDate))
    && (!q.orderNumber || p.orderNumber === String(q.orderNumber)) && (!statuses.length || statuses.includes(p.status))
    && (!ids.length || ids.includes(p.shipmentPackageId)) && (!q.barcode || p.lines.some((l: Rec) => l.barcode === String(q.barcode))));
  rows = [...rows].sort((a, b) => (dir === "ASC" ? a[field] - b[field] : b[field] - a[field]));
  return ok(clean(pageOf(rows, page, size)));
};
const getShipmentPackagesStream: MockHandler = async (req, state) => {
  const q = req.query; const now = state.now();
  const size = numOf(q.size) ?? 50;
  if (!isInt(size) || size < 1 || size > 200) return fail(400, "size must be between 1 and 200");
  const statuses = list(q.packageItemStatuses); const bad = statuses.find((s) => !STATUS_ENUM.includes(s));
  if (bad) return fail(400, `Invalid packageItemStatuses value: ${bad}`);
  const start = numOf(q.lastModifiedStartDate), end = numOf(q.lastModifiedEndDate);
  const win = dateWindow(start, end, now);
  if (typeof win === "string") return fail(400, win.replace("startDate", "lastModifiedStartDate").replace("endDate", "lastModifiedEndDate"));
  const filterKey = JSON.stringify({ s: statuses, a: start ?? null, b: end ?? null });
  let offset = 0;
  if (q.nextCursor !== undefined && q.nextCursor !== "") {
    try {
      const c = JSON.parse(atob(String(q.nextCursor)));
      if (c.f !== filterKey) return fail(400, "nextCursor does not match the filters of the original request; start a new stream");
      offset = Number(c.o);
      if (!Number.isInteger(offset) || offset < 0) throw new Error("bad offset");
    } catch { return fail(400, "Invalid nextCursor value"); }
  }
  const rows = (await load(state, req.sellerId))
    .filter((p) => p.lastModifiedDate >= win[0] && p.lastModifiedDate <= win[1] && (!statuses.length || statuses.includes(p.status)))
    .sort((a, b) => b.lastModifiedDate - a.lastModifiedDate);
  const content = rows.slice(offset, offset + size); const hasMore = offset + size < rows.length;
  return ok(clean({ content, size: content.length, hasMore, nextCursor: hasMore ? btoa(JSON.stringify({ o: offset + size, f: filterKey })) : "" }));
};

// ───────────── package mutations ─────────────
const updatePackage: MockHandler = (req, state) => mutate(req, state, ({ pkg, now }) => {
  const b = bodyOf(req); const to = b.status;
  if (to !== "Picking" && to !== "Invoiced") return fail(400, "status must be Picking or Invoiced");
  const need = to === "Picking" ? "Created" : "Picking";
  if (pkg.status !== need) return fail(400, `Package status ${pkg.status} cannot be updated to ${to}${to === "Invoiced" && pkg.status === "Created" ? " (notify Picking first)" : ""}`);
  if (b.lines !== undefined) {
    if (!Array.isArray(b.lines)) return fail(400, "lines must be an array");
    for (const l of b.lines) {
      const line = pkg.lines.find((x: Rec) => x.lineId === l?.lineId);
      if (!line) return fail(400, `Order line ${l?.lineId} not found in package`);
      if (!isInt(l.quantity) || l.quantity < 1 || l.quantity > line.quantity) return fail(400, `Invalid quantity for order line ${l.lineId}`);
    }
  }
  if (to === "Invoiced" && b.params?.invoiceNumber !== undefined) pkg.invoiceNumber = String(b.params.invoiceNumber);
  touch(pkg, now, to);
  return ok();
});
const cancelOrderPackageItem: MockHandler = (req, state) => mutate(req, state, async (c) => {
  const b = bodyOf(req); const { pkg } = c;
  if (!OPEN.includes(pkg.status)) return fail(400, `Items of a package in status ${pkg.status} cannot be cancelled`);
  if (!isInt(b.reasonId) || !(b.reasonId in CANCEL_REASONS)) return fail(400, "reasonId must be one of 500, 501, 502, 504, 505, 506");
  if (!Array.isArray(b.lines) || !b.lines.length) return fail(400, "lines must be a non-empty array");
  const pool: Rec[] = JSON.parse(JSON.stringify(pkg.lines));
  const r = await takeLines(pool, b.lines.map((l: Rec) => ({ lineId: l?.lineId, qty: l?.quantity })), c.state);
  if (r.error) return fail(400, r.error);
  const prev = pkg.status;
  for (const l of r.taken) Object.assign(l, { orderLineItemStatusName: "Cancelled", cancelledBy: "Seller", cancelReason: CANCEL_REASONS[b.reasonId], cancelReasonCode: b.reasonId });
  if (pool.length) {
    // partial: the old package becomes invalid (Cancelled) and the remaining items move to a new package
    await spawn(c, pool, "cancel", prev);
  }
  pkg.lines = r.taken; recompute(pkg);
  touch(pkg, c.now, "Cancelled");
  return ok();
});
const updateBoxInfo: MockHandler = (req, state) => mutate(req, state, ({ pkg, now }) => {
  const b = bodyOf(req);
  if (typeof b.deci !== "number" || !(b.deci > 0)) return fail(400, "deci must be a positive number");
  if (!isInt(b.boxQuantity) || b.boxQuantity < 1) return fail(400, "boxQuantity must be a positive integer");
  pkg.deci = b.deci; pkg.boxQuantity = b.boxQuantity; touch(pkg, now);
  return ok();
});
const deliveredByService: MockHandler = (req, state) => mutate(req, state, ({ pkg, now }) => {
  if (!["Picking", "Invoiced", "Shipped"].includes(pkg.status)) return fail(400, `Package in status ${pkg.status} cannot be marked as delivered by service`);
  pkg.deliveredByService = true;
  if (pkg.status === "Shipped") touch(pkg, now, "Delivered"); else touch(pkg, now);
  return ok();
});
const changeCargoProvider: MockHandler = (req, state) => mutate(req, state, async ({ pkg, now, state: st }) => {
  const code = bodyOf(req).cargoProvider;
  if (typeof code !== "string" || !CARGO[code]) return fail(400, `cargoProvider must be one of ${Object.keys(CARGO).join(", ")}`);
  if (!OPEN.includes(pkg.status)) return fail(400, `Cargo provider of a package in status ${pkg.status} cannot be changed`);
  if (pkg._cargoChangedAt && now - pkg._cargoChangedAt < 5 * 60_000) return fail(400, "The cargo provider can only be changed once every 5 minutes for a package");
  if (pkg._cargoCode === code) return fail(400, "The package already uses this cargo provider");
  const tn = await nextTracking(st);
  Object.assign(pkg, { cargoProviderName: CARGO[code]!.name, cargoProviderId: CARGO[code]!.id, _cargoCode: code, _cargoChangedAt: now, cargoTrackingNumber: tn, cargoTrackingLink: trackingLink(tn) });
  touch(pkg, now);
  return ok();
});
const updateWarehouse: MockHandler = (req, state) => mutate(req, state, ({ pkg, now }) => {
  const id = bodyOf(req).warehouseId;
  if (!isInt(id) || id < 1) return fail(400, "warehouseId must be a positive integer");
  if (!OPEN.includes(pkg.status)) return fail(400, "Package status not suitable for update - must be Created, Invoiced, or Picking");
  pkg.warehouseId = id; touch(pkg, now);
  return ok();
});
const extendAgreedDeliveryDate: MockHandler = (req, state) => mutate(req, state, ({ pkg, now }) => {
  const d = bodyOf(req).extendedDayCount;
  if (![1, 2, 3].includes(d)) return fail(400, "extendedDayCount must be 1, 2 or 3");
  if (!OPEN.includes(pkg.status) || !pkg.agreedDeliveryDateExtendible) return fail(400, "The agreed delivery date of this package cannot be extended");
  pkg.extendedAgreedDeliveryDate = pkg.agreedDeliveryDate + d * DAY; pkg.agreedDeliveryDateExtendible = false; touch(pkg, now);
  return ok();
});
const updateLaborCosts: MockHandler = (req, state) => mutate(req, state, ({ pkg, now }) => {
  const b = req.body;
  if (!Array.isArray(b) || !b.length) return fail(400, "Body must be a non-empty array of {orderLineId, laborCostPerItem}");
  for (const e of b) {
    if (!pkg.lines.some((l: Rec) => l.lineId === e?.orderLineId)) return fail(400, `Order line ${e?.orderLineId} not found in package`);
    if (typeof e.laborCostPerItem !== "number" || e.laborCostPerItem < 0) return fail(400, "laborCostPerItem must be a non-negative number");
  }
  for (const e of b) pkg.lines.find((l: Rec) => l.lineId === e.orderLineId).laborCostPerItem = e.laborCostPerItem;
  touch(pkg, now);
  return ok();
});

// split
const splitMultiPackageByQuantity: MockHandler = (req, state) => mutate(req, state, async (c) => {
  const sp = bodyOf(req).splitPackages;
  if (!Array.isArray(sp)) return fail(400, "splitPackages must be an array");
  const groups = sp.map((g: Rec) => (Array.isArray(g?.packageDetails) ? g.packageDetails.map((d: Rec) => ({ lineId: d?.orderLineId, qty: d?.quantities })) : []));
  const r = await splitInto(c, groups);
  return "error" in r ? r.error : ok();
});
const splitShipmentPackage: MockHandler = (req, state) => mutate(req, state, async (c) => {
  const ids = bodyOf(req).orderLineIds;
  if (!Array.isArray(ids) || !ids.length) return fail(400, "orderLineIds must be a non-empty array");
  const r = await splitInto(c, [ids.map((lineId: number) => ({ lineId }))]);
  return "error" in r ? r.error : ok({ newPackageId: r.ids[0] });
});
const splitShipmentPackageByQuantity: MockHandler = (req, state) => mutate(req, state, async (c) => {
  const qs = bodyOf(req).quantitySplit;
  if (!Array.isArray(qs) || !qs.length) return fail(400, "quantitySplit must be a non-empty array");
  const groups: Pick[][] = [];
  for (const e of qs) {
    if (!Array.isArray(e?.quantities) || !e.quantities.length) return fail(400, "quantities must be a non-empty array");
    for (const q of e.quantities) groups.push([{ lineId: e.orderLineId, qty: q }]);
  }
  const r = await splitInto(c, groups);
  return "error" in r ? r.error : ok({ newPackageIds: r.ids });
});
const multiSplitShipmentPackage: MockHandler = (req, state) => mutate(req, state, async (c) => {
  const sg = bodyOf(req).splitGroups;
  if (!Array.isArray(sg) || !sg.length) return fail(400, "splitGroups must be a non-empty array");
  const r = await splitInto(c, sg.map((g: Rec) => (Array.isArray(g?.orderLineIds) ? g.orderLineIds.map((lineId: number) => ({ lineId })) : [])));
  return "error" in r ? r.error : ok({ results: r.ids.map((newPackageId) => ({ newPackageId })) });
});

// alternative delivery / manual
const processAlternativeDelivery: MockHandler = (req, state) => mutate(req, state, ({ pkg, now }) => {
  const b = bodyOf(req);
  if (typeof b.isPhoneNumber !== "boolean") return fail(400, "isPhoneNumber must be a boolean");
  if (typeof b.trackingInfo !== "string" || !b.trackingInfo.trim()) return fail(400, "trackingInfo is required");
  if (!b.isPhoneNumber && !/^https?:\/\//i.test(b.trackingInfo)) return fail(400, "trackingInfo must be a cargo tracking link when isPhoneNumber is false");
  if (b.isPhoneNumber && !/^\+?\d{10,15}$/.test(b.trackingInfo)) return fail(400, "trackingInfo must be a phone number when isPhoneNumber is true");
  if (!OPEN.includes(pkg.status)) return statusErr(pkg, "Shipped");
  if (b.boxQuantity !== undefined) pkg.boxQuantity = b.boxQuantity;
  if (b.deci !== undefined) pkg.deci = b.deci;
  if (!b.isPhoneNumber) pkg.cargoTrackingLink = b.trackingInfo;
  touch(pkg, now, "Shipped");
  return ok();
});
const processAlternativeDeliveryDigital: MockHandler = (req, state) => mutate(req, state, ({ pkg, now }) => {
  const b = bodyOf(req); const code = b.params?.digitalCode;
  if (b.isPhoneNumber !== true) return fail(400, "isPhoneNumber must be true for digital product delivery");
  if (typeof b.trackingInfo !== "string" || !/^\+?\d{10,15}$/.test(b.trackingInfo)) return fail(400, "trackingInfo must be the customer's phone number");
  if (typeof code !== "string" || code.length < 6 || code.length > 120) return fail(400, "Digital code must be between 6-120 characters");
  if (!OPEN.includes(pkg.status)) return statusErr(pkg, "Shipped");
  touch(pkg, now, "Shipped");
  return ok();
});
const manualDeliver: MockHandler = (req, state) => mutate(req, state, ({ pkg, now }) => (pkg.status === "Shipped" ? (touch(pkg, now, "Delivered"), ok()) : statusErr(pkg, "Delivered")), "id");
const manualDeliverByTracking: MockHandler = (req, state) => mutate(req, state, ({ pkg, now }) => (pkg.status === "Shipped" ? (touch(pkg, now, "Delivered"), ok()) : statusErr(pkg, "Delivered")), "tracking");
const manualReturn: MockHandler = (req, state) => mutate(req, state, ({ pkg, now }) => (pkg.status === "Shipped" ? (touch(pkg, now, "Returned"), ok()) : statusErr(pkg, "Returned")), "id");
const manualReturnByTracking: MockHandler = (req, state) => mutate(req, state, ({ pkg, now }) => (pkg.status === "Shipped" ? (touch(pkg, now, "Returned"), ok()) : statusErr(pkg, "Returned")), "tracking");

// ───────────── address ─────────────
const getCountries: MockHandler = () => ok(COUNTRIES);
const getCitiesByCountry: MockHandler = (req) => {
  const cities = COUNTRY_CITIES[String(req.path.CountryCode).toUpperCase()];
  return cities ? ok(cities) : fail(404, `Country ${req.path.CountryCode} not found or has no GULF/CEE city list (use the domestic endpoints for TR and AZ)`);
};
const getDistrictsByCity: MockHandler = (req) => {
  const cc = String(req.path.CountryCode).toUpperCase();
  if (!COUNTRY_CITIES[cc]) return fail(404, `Country ${req.path.CountryCode} not found`);
  if (!COUNTRY_CITIES[cc]!.some((c) => c.id === Number(req.path.cityId))) return fail(404, `City ${req.path.cityId} not found`);
  return ok(GULF_DISTRICTS[cc]?.[Number(req.path.cityId)] ?? []);
};
const getAzerbaijanCities: MockHandler = () => ok(AZ_CITIES);
const getAzerbaijanDistricts: MockHandler = (req) => (AZ_CITIES.some((c) => c.id === Number(req.path.cityCode)) ? ok(AZ_DISTRICTS[Number(req.path.cityCode)] ?? []) : fail(404, `City ${req.path.cityCode} not found`));
const getTurkeyCities: MockHandler = () => ok(TR_CITIES);
const getTurkeyDistricts: MockHandler = (req) => {
  const c = Number(req.path.CityCode);
  if (!TR_CITIES.some((x) => x.id === c)) return fail(404, `City ${req.path.CityCode} not found`);
  return ok((TR_DISTRICTS[c] ?? []).map(({ id, name }) => ({ id, name })));
};
const getTurkeyNeighborhoods: MockHandler = (req) => {
  const c = Number(req.path.CityCode);
  if (!TR_CITIES.some((x) => x.id === c)) return fail(404, `City ${req.path.CityCode} not found`);
  const d = (TR_DISTRICTS[c] ?? []).find((x) => x.id === Number(req.path.DistrictCode));
  if (!d && TR_DISTRICTS[c]) return fail(404, `District ${req.path.DistrictCode} not found`);
  return ok(d?.neighborhoods ?? []);
};

// ───────────── common label ─────────────
const BAD_TRACKING = "Please check the cargo tracking number you provided";
const createCommonLabel: MockHandler = async (req, state) => {
  const tn = String(req.path.cargoTrackingNumber); const b = bodyOf(req);
  const pkg = (await load(state, req.sellerId)).find((p) => String(p.cargoTrackingNumber) === tn);
  if (!pkg) return labelFail(404, "NotFoundException", "Shipment not found for the cargo tracking number");
  if (!["TEXMP", "ARASMP"].includes(pkg._cargoCode)) return labelFail(400, "BadRequestException", BAD_TRACKING);
  if (b.format !== undefined && b.format !== "ZPL") return labelFail(400, "BadRequestException", "Only ZPL format is available");
  const boxQuantity = b.boxQuantity ?? 1;
  if (!isInt(boxQuantity) || boxQuantity < 1 || boxQuantity > 50) return labelFail(400, "BadRequestException", "boxQuantity must be between 1 and 50");
  const labels = (await state.get<Record<string, Rec>>(LABELS_KEY)) ?? {};
  labels[tn] = { format: "ZPL", boxQuantity, volumetricHeight: b.volumetricHeight ?? null, createdAt: state.now() };
  await state.set(LABELS_KEY, labels);
  return ok();
};
const getCommonLabel: MockHandler = async (req, state) => {
  const tn = String(req.path.cargoTrackingNumber);
  const rec = ((await state.get<Record<string, Rec>>(LABELS_KEY)) ?? {})[tn];
  if (!rec) return labelFail(400, "BadRequestException", BAD_TRACKING);
  const data = Array.from({ length: rec.boxQuantity }, (_, i) => ({
    label: `^XA^CI28^PW800^LL1200^FO60,60^A0N,40,40^FDTrendyol Ortak Etiket^FS^FO60,140^BY3^BCN,160,Y,N,N^FD${tn}^FS^FO60,360^A0N,36,36^FDKoli ${i + 1}/${rec.boxQuantity}^FS^XZ`, format: "ZPL",
  }));
  return ok({ data });
};

// ───────────── test order API (STAGE) ─────────────
const norm = (s: string) => s.toLocaleLowerCase("tr").replace(/\s+/g, "");
const createTestOrder: MockHandler = async (req, state) => {
  const b = bodyOf(req);
  const miss = (o: unknown, keys: string[], where: string) => keys.find((k) => !(o as Rec)?.[k] || typeof (o as Rec)[k] !== "string") && `${where} requires ${keys.join(", ")}`;
  const m = miss(b.customer, ["customerFirstName", "customerLastName"], "customer") ?? miss(b.invoiceAddress, ["addressText", "city", "district", "invoiceFirstName", "invoiceLastName", "phone", "email"], "invoiceAddress")
    ?? miss(b.shippingAddress, ["addressText", "city", "district", "shippingFirstName", "shippingLastName", "phone", "email"], "shippingAddress");
  if (m) return fail(400, m);
  if (!isInt(b.seller?.sellerId)) return fail(400, "seller.sellerId is required");
  if (!Array.isArray(b.lines) || !b.lines.length) return fail(400, "lines must be a non-empty array");
  if (!/^\d{10}$/.test(String(b.shippingAddress.phone))) return fail(400, "phone must contain 10 digits and only numbers");
  if (b.commercial && !(b.invoiceAddress.company && b.invoiceAddress.invoiceTaxNumber && b.invoiceAddress.invoiceTaxOffice)) return fail(400, "company, invoiceTaxNumber and invoiceTaxOffice are required for corporate invoice");
  const products = await loadProducts(state);
  const picks: BuildOpts["picks"] = [];
  for (const l of b.lines) {
    const pi = products.findIndex((p) => p.barcode === l?.barcode);
    if (pi < 0) return fail(400, `Product with barcode ${l?.barcode} not found for this seller`);
    if (!isInt(l.quantity) || l.quantity < 1) return fail(400, "quantity must be a positive integer");
    picks.push({ pi, qty: l.quantity, lineId: await nextLineId(state), discountPct: l.discountPercentage ?? 0, tyPct: l.trendyolDiscountPercentage ?? 0 });
  }
  const mk = (a: Rec, first: string, last: string, id: number) => {
    const city = TR_CITIES.find((c) => norm(c.name) === norm(String(a.city)));
    const dist = city ? TR_DISTRICTS[city.id]?.find((d) => norm(d.name) === norm(String(a.district))) : undefined;
    const nb = dist?.neighborhoods.find((n) => norm(n.name).startsWith(norm(String(a.neighborhood ?? ""))) && a.neighborhood);
    return { ...address({ first, last, city: city?.id ?? 0, district: String(a.district), nb: 0, addr: String(a.addressText), phone: String(a.phone) }, id, String(a.city)),
      company: a.company ?? "", postalCode: a.postalCode ?? "", neighborhood: a.neighborhood ?? "", neighborhoodId: nb?.id ?? 0, latitude: a.latitude, longitude: a.longitude };
  };
  const n = await state.nextId("ty:order"); const pid = await nextPkgId(state); const now = state.now();
  const inv: Rec = mk(b.invoiceAddress, b.invoiceAddress.invoiceFirstName, b.invoiceAddress.invoiceLastName, 12000000 + n * 2 + 1);
  if (b.commercial) { inv.company = b.invoiceAddress.company; inv.taxNumber = b.invoiceAddress.invoiceTaxNumber; inv.taxOffice = b.invoiceAddress.invoiceTaxOffice; }
  const orderNumber = String(10751300000 + n);
  const pkg = buildPackage({
    products, picks, status: "Created", orderDate: now, now, sellerId: Number(req.sellerId) || b.seller.sellerId, packageId: pid, orderNumber, tracking: await nextTracking(state),
    cargo: "TEXMP", customerId: 889000000 + n, shipAddr: mk(b.shippingAddress, b.shippingAddress.shippingFirstName, b.shippingAddress.shippingLastName, 12000000 + n * 2),
    invAddr: inv, email: String(b.shippingAddress.email), first: b.customer.customerFirstName, last: b.customer.customerLastName, commercial: !!b.commercial,
  });
  pkg._test = true; if (b.microRegion) pkg.micro = true;
  const all = await load(state, req.sellerId); all.push(pkg); await saveList(state, KEY, all);
  return ok({ orderNumber });
};
const TEST_FLOW: Record<string, string[]> = {
  Created: ["Shipped"], Picking: ["Shipped"], Invoiced: ["Shipped"], Shipped: ["AtCollectionPoint", "Delivered", "UnDelivered"],
  AtCollectionPoint: ["Delivered", "UnDelivered"], UnDelivered: ["Returned"], Delivered: ["Returned"],
};
const updateTestOrderStatus: MockHandler = (req, state) => mutate(req, state, ({ pkg, now }) => {
  const b = bodyOf(req); const to = b.status;
  if (!["Shipped", "AtCollectionPoint", "Delivered", "UnDelivered", "Returned"].includes(to)) return fail(400, "status must be Shipped, AtCollectionPoint, Delivered, UnDelivered or Returned");
  if (!Array.isArray(b.lines) || !b.lines.length) return fail(400, "lines must be a non-empty array");
  for (const l of b.lines) if (!pkg.lines.some((x: Rec) => x.lineId === l?.lineId)) return fail(400, `Order line ${l?.lineId} not found in package`);
  if (!(TEST_FLOW[pkg.status] ?? []).includes(to)) return fail(400, `Package status ${pkg.status} cannot be updated to ${to} (statuses progress sequentially)`);
  touch(pkg, now, to);
  return ok("200 OK");
});

export const mockHandlers: Record<string, MockHandler> = {
  getShipmentPackages, getShipmentPackagesStream, updatePackage, cancelOrderPackageItem, updateBoxInfo, deliveredByService, changeCargoProvider, updateWarehouse,
  extendAgreedDeliveryDate, updateLaborCosts, splitMultiPackageByQuantity, splitShipmentPackage, splitShipmentPackageByQuantity, multiSplitShipmentPackage,
  processAlternativeDelivery, processAlternativeDeliveryDigital, manualDeliverByPackageId: manualDeliver, manualDeliverByTrackingNumber: manualDeliverByTracking,
  manualReturnByTrackingNumber: manualReturnByTracking, manualReturnByPackageId: manualReturn,
  getCountries, getCitiesByCountry, getDistrictsByCity, getAzerbaijanCities, getAzerbaijanDistricts, getTurkeyCities, getTurkeyDistricts, getTurkeyNeighborhoods,
  createCommonLabel, getCommonLabel, createTestOrder, updateTestOrderStatus,
};

import type { MockHandler, MockRequest, MockResponse, MockState } from "@openshelf/shared";
import { loadProducts, saveProducts, type MockProduct } from "./state";
import { ATTRS, attrById, categoryAttributeList, fail, hash, isLeaf, loadBrands, loadCategories, ok, qInt, qList, qStr } from "./catalog";

/**
 * Offline handlers for Product Integration V2 (products, updates, inventory/price, batches, video, warranty).
 * State keys: `ty:products` (MockProduct list), `ty:batches` (batchRequestId -> batch), `ty:extras` (per-barcode extra fields),
 * `ty:pending` (barcode -> waiting for approval), `ty:audits` (update audits / QC), `ty:videos`, `ty:lastreq` (15-min duplicate
 * stock/price guard), `ty:pricehits` (per-barcode price update counter), `ty:content` (content id counter via nextId).
 */
const APPROVE_AFTER_MS = 5000;
const FOUR_HOURS = 4 * 3600_000;
const BARCODE_RE = /^[0-9A-Za-zÇĞİıÖŞÜçğöşü._-]+$/;

interface Extra {
  dimensionalWeight?: number | null; origin?: string; lotNumber?: string; deliveryDuration?: number; shipmentAddressId?: number; returningAddressId?: number;
  locationBasedDelivery?: string | null; cargoProviders?: string[]; channels?: string[]; approvedDate?: number; archivedDate?: number | null;
  lockReason?: string | null; lockDate?: number | null; rejectReasons?: { rejectReason: string; rejectReasonDetail: string }[];
  lastPriceChangeDate?: number; lastStockChangeDate?: number; stockModified?: boolean;
}
interface BatchItem { requestItem: unknown; status: "SUCCESS" | "FAILED" | "IN_PROGRESS"; failureReasons: string[]; batchRequestLogId?: string }
interface Batch { batchRequestId: string; type: string; creationDate: number; lastModification: number; items: BatchItem[]; polled?: boolean }
interface Audit { barcode: string; contentId: number; batchRequestId: string; requestDate: string; updates: Record<string, unknown>[] }
interface Video { id: string; title: string; description?: string; videoUrl: string; productContentIds: string[]; videoContentType: string; createdAt: number; failCode?: string }

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const uuid = () => (globalThis.crypto?.randomUUID?.() ?? `00000000-0000-4000-8000-${Date.now().toString(16).padStart(12, "0")}`);
const sid = (req: MockRequest) => Number(req.sellerId) || 0;

// ---------- state helpers ----------
const loadMap = async <T,>(s: MockState, key: string): Promise<Record<string, T>> => (await s.get<Record<string, T>>(key)) ?? {};
const newBatch = async (s: MockState, type: string, items: BatchItem[]): Promise<string> => {
  const batches = await loadMap<Batch>(s, "ty:batches");
  const now = s.now();
  for (const [k, b] of Object.entries(batches)) if (b.lastModification < now - FOUR_HOURS) delete batches[k];
  const id = `${uuid()}-${Math.floor(now / 1000)}`;
  batches[id] = { batchRequestId: id, type, creationDate: now, lastModification: now, items };
  await s.set("ty:batches", batches);
  return id;
};

/** Approves pending products once their batch was polled or APPROVE_AFTER_MS passed. Returns the current product list. */
export async function settle(state: MockState): Promise<MockProduct[]> {
  const list = await loadProducts(state);
  const pending = await loadMap<{ batchId: string; at: number }>(state, "ty:pending");
  const keys = Object.keys(pending);
  if (!keys.length) return list;
  const batches = await loadMap<Batch>(state, "ty:batches");
  const extras = await loadMap<Extra>(state, "ty:extras");
  const now = state.now();
  let changed = false;
  for (const bc of keys) {
    const p = pending[bc]!;
    if (!(batches[p.batchId]?.polled || now - p.at >= APPROVE_AFTER_MS)) continue;
    const prod = list.find((x) => x.barcode === bc);
    delete pending[bc]; changed = true;
    if (!prod) continue;
    prod.approved = true; prod.onSale = prod.quantity > 0 && !prod.archived && !prod.locked;
    extras[bc] = { ...extras[bc], approvedDate: now };
  }
  if (changed) { await saveProducts(state, list); await state.set("ty:pending", pending); await state.set("ty:extras", extras); }
  return list;
}
const variantIdOf = (p: MockProduct) => 70_000_000 + (hash(p.barcode) % 1_000_000);

// ---------- validation helpers ----------
const itemsOf = (body: unknown, max = 1000): { items: Obj[] } | MockResponse => {
  const items = isObj(body) ? body.items : undefined;
  if (!Array.isArray(items) || !items.length) return fail(400, [{ key: "items", message: "items alanı zorunludur ve en az 1 öğe içermelidir" }]);
  if (items.length > max) return fail(400, [{ key: "items", message: `Tek istekte en fazla ${max} öğe gönderebilirsiniz` }]);
  return { items: items.map((i) => (isObj(i) ? i : {})) };
};
const isResp = (v: unknown): v is MockResponse => isObj(v) && typeof (v as Obj).status === "number" && "body" in v;
const badBarcodes = (items: Obj[]) => items.map((i, n) => ({ n, b: i.barcode })).filter(({ b }) => typeof b !== "string" || !b || b.length > 40 || !BARCODE_RE.test(b));
const batchOk = async (state: MockState, type: string, items: BatchItem[]) => ok({ batchRequestId: await newBatch(state, type, items) });
const okItem = (requestItem: unknown): BatchItem => ({ requestItem, status: "SUCCESS", failureReasons: [] });
const failItem = (requestItem: unknown, ...reasons: string[]): BatchItem => ({ requestItem, status: "FAILED", failureReasons: reasons });

function validateCreateItem(i: Obj, n: number): { key: string; message: string }[] {
  const e: { key: string; message: string }[] = [];
  const req = (f: string, cond: boolean, msg = `${f} alanı zorunludur`) => { if (!cond) e.push({ key: `items[${n}].${f}`, message: msg }); };
  const str = (f: string) => typeof i[f] === "string" && (i[f] as string).trim() !== "";
  const num = (f: string) => typeof i[f] === "number" && Number.isFinite(i[f] as number);
  req("barcode", str("barcode"));
  if (str("barcode")) {
    const b = i.barcode as string;
    if (b.length > 40) e.push({ key: `items[${n}].barcode`, message: "barcode en fazla 40 karakter olabilir" });
    else if (!BARCODE_RE.test(b)) e.push({ key: `items[${n}].barcode`, message: "barcode yalnızca . - _ özel karakterlerini içerebilir" });
  }
  req("title", str("title")); if (str("title") && (i.title as string).length > 100) e.push({ key: `items[${n}].title`, message: "title en fazla 100 karakter olabilir" });
  req("productMainId", str("productMainId")); if (str("productMainId") && (i.productMainId as string).length > 40) e.push({ key: `items[${n}].productMainId`, message: "productMainId en fazla 40 karakter olabilir" });
  req("brandId", Number.isInteger(i.brandId)); req("categoryId", Number.isInteger(i.categoryId));
  req("quantity", Number.isInteger(i.quantity) && (i.quantity as number) >= 0, "quantity 0 veya daha büyük bir tam sayı olmalıdır");
  if (i.stockCode != null && (typeof i.stockCode !== "string" || i.stockCode.length > 100)) e.push({ key: `items[${n}].stockCode`, message: "stockCode en fazla 100 karakterlik metin olmalıdır" });
  req("description", str("description")); if (str("description") && (i.description as string).length > 30000) e.push({ key: `items[${n}].description`, message: "description en fazla 30.000 karakter olabilir" });
  req("listPrice", num("listPrice") && (i.listPrice as number) > 0, "listPrice 0'dan büyük olmalıdır"); req("salePrice", num("salePrice") && (i.salePrice as number) > 0, "salePrice 0'dan büyük olmalıdır");
  if (num("listPrice") && num("salePrice") && (i.listPrice as number) < (i.salePrice as number)) e.push({ key: `items[${n}].listPrice`, message: "listPrice, salePrice değerinden düşük olamaz" });
  req("vatRate", Number.isInteger(i.vatRate) && [0, 1, 10, 20].includes(i.vatRate as number), "vatRate 0, 1, 10 veya 20 olmalıdır");
  const imgs = i.images;
  if (!Array.isArray(imgs) || !imgs.length) e.push({ key: `items[${n}].images`, message: "images alanı zorunludur" });
  else if (imgs.length > 8) e.push({ key: `items[${n}].images`, message: "Bir barkod için en fazla 8 görsel eklenebilir" });
  else if (imgs.some((x) => !isObj(x) || typeof x.url !== "string" || !x.url.startsWith("https://"))) e.push({ key: `items[${n}].images`, message: "Görsel adresleri https:// ile başlamalıdır" });
  if (!Array.isArray(i.attributes)) e.push({ key: `items[${n}].attributes`, message: "attributes alanı zorunludur" });
  return e;
}

/** Maps request attributes to MockProduct attributes; returns failure reasons (batch-level) when invalid. */
function mapAttributes(categoryId: number, raw: unknown, checkRequired: boolean): { attrs: MockProduct["attributes"]; reasons: string[] } {
  const reasons: string[] = [];
  const attrs: MockProduct["attributes"] = [];
  const allowed = categoryAttributeList(categoryId);
  for (const a of Array.isArray(raw) ? raw : []) {
    if (!isObj(a) || !Number.isInteger(a.attributeId)) { reasons.push("Geçersiz özellik: attributeId zorunludur"); continue; }
    const id = a.attributeId as number;
    const def = allowed.find((x) => x.def.id === id)?.def;
    if (!def) { reasons.push(`Kategoriye ait olmayan özellik: attributeId=${id}`); continue; }
    const valueId = (a.attributeValueId ?? (Array.isArray(a.attributeValueIds) ? a.attributeValueIds[0] : undefined)) as number | undefined;
    const custom = (a.customAttributeValue ?? a.attributeValue) as string | undefined;
    if (valueId != null) {
      const v = def.values.find(([vid]) => vid === valueId);
      if (!v) reasons.push(`Geçersiz özellik değeri: attributeId=${id}, attributeValueId=${valueId}`);
      else attrs.push({ attributeId: id, attributeName: def.name, attributeValueId: v[0], attributeValue: v[1] });
    } else if (custom) {
      if (!def.allowCustom && !def.values.some(([, n]) => n === custom)) reasons.push(`Bu özellik için serbest değer girilemez: ${def.name}`);
      else attrs.push({ attributeId: id, attributeName: def.name, attributeValue: custom });
    } else reasons.push(`Özellik değeri eksik: ${def.name}`);
  }
  if (checkRequired) for (const { def, required } of allowed) if (required && !attrs.some((x) => x.attributeId === def.id)) reasons.push(`Zorunlu özellik eksik: ${def.name}`);
  return { attrs, reasons };
}

// ---------- createProducts ----------
const createProducts: MockHandler = async (req, state) => {
  const r = itemsOf(req.body); if (isResp(r)) return r;
  const errors: { key: string; message: string }[] = [];
  const seen = new Map<string, number>();
  r.items.forEach((i, n) => {
    errors.push(...validateCreateItem(i, n));
    if (typeof i.barcode === "string") { if (seen.has(i.barcode)) errors.push({ key: `items[${n}].barcode`, message: `Aynı istekte tekrar eden barkod: ${i.barcode}` }); seen.set(i.barcode, n); }
  });
  if (errors.length) return fail(400, errors);

  const list = await settle(state);
  const [brands, cats] = [await loadBrands(state), await loadCategories(state)];
  const extras = await loadMap<Extra>(state, "ty:extras");
  const pending = await loadMap<{ batchId: string; at: number }>(state, "ty:pending");
  const now = state.now();
  const results: { item: Obj; reasons: string[]; prod?: MockProduct }[] = [];
  const contentIds = new Map<string, number>(list.map((p) => [p.productMainId, p.productContentId]));
  for (const i of r.items) {
    const reasons: string[] = [];
    const brand = brands.find((b) => b.id === i.brandId);
    if (!brand) reasons.push(`Geçersiz marka bilgisi: brandId=${i.brandId}`);
    const cat = cats.find((c) => c.id === i.categoryId);
    if (!cat || !isLeaf(cats, cat.id)) reasons.push(`Geçersiz kategori: ${i.categoryId} alt kategori içeriyor ya da bulunamadı (yaprak kategori kullanın)`);
    if (list.some((p) => p.barcode === i.barcode)) reasons.push(`Bu barkod ile kayıtlı ürün zaten mevcut: ${i.barcode}`);
    const mapped = cat ? mapAttributes(cat.id, i.attributes, true) : { attrs: [], reasons: [] };
    reasons.push(...mapped.reasons);
    if (reasons.length || !brand || !cat) { results.push({ item: i, reasons }); continue; }
    const mainId = i.productMainId as string;
    if (!contentIds.has(mainId)) contentIds.set(mainId, 200000 + (await state.nextId("ty:content")));
    const prod: MockProduct = {
      barcode: i.barcode as string, stockCode: (i.stockCode as string) ?? (i.barcode as string), productMainId: mainId, productContentId: contentIds.get(mainId)!,
      title: i.title as string, description: i.description as string, brandId: brand.id, brand: brand.name, categoryId: cat.id, categoryName: cat.name,
      vatRate: i.vatRate as number, quantity: i.quantity as number, salePrice: i.salePrice as number, listPrice: i.listPrice as number, currencyType: "TRY",
      images: (i.images as Obj[]).map((x) => x.url as string), attributes: mapped.attrs, approved: false, archived: false, locked: false, onSale: false, blacklisted: false,
      createDateTime: now, lastUpdateDate: now,
    };
    const rejected = /sahte|replika/i.test(prod.title);
    const dw = isObj(i.deliveryOption) ? (i.deliveryOption.deliveryDuration as number | undefined) : (i.deliveryDuration as number | undefined);
    extras[prod.barcode] = {
      dimensionalWeight: (i.dimensionalWeight as number) ?? null, origin: i.origin as string | undefined, lotNumber: i.lotNumber as string | undefined, deliveryDuration: dw,
      shipmentAddressId: i.shipmentAddressId as number | undefined, returningAddressId: i.returningAddressId as number | undefined, cargoProviders: i.cargoProviders as string[] | undefined,
      channels: ["CORE"], lastPriceChangeDate: now, lastStockChangeDate: now,
      ...(rejected ? { rejectReasons: [{ rejectReason: "Hatalı Marka Bilgisi", rejectReasonDetail: "Ürün başlığındaki ifade, ürünün asıl markası ile uyuşmamaktadır. Lütfen ürün bilgilerinizi kontrol ediniz." }] } : {}),
    };
    list.push(prod);
    results.push({ item: i, reasons, prod });
  }
  const batchId = await newBatch(state, "ProductV2OnBoarding", results.map(({ item, reasons }) => (reasons.length ? failItem({ barcode: item.barcode, product: item }, ...reasons) : okItem({ barcode: item.barcode, product: item }))));
  for (const { prod } of results) if (prod && !extras[prod.barcode]?.rejectReasons) pending[prod.barcode] = { batchId, at: now };
  await saveProducts(state, list); await state.set("ty:extras", extras); await state.set("ty:pending", pending);
  return ok({ batchRequestId: batchId });
};

// ---------- filters ----------
const pageToken = (offset: number) => btoa(JSON.stringify({ o: offset }));
const tokenOffset = (t: string | undefined): number | undefined => { if (!t) return undefined; try { const o = JSON.parse(atob(t)).o; return Number.isInteger(o) ? o : undefined; } catch { return undefined; } };

function paging(req: MockRequest, maxSize: number, defSize: number): { page: number; size: number; offset: number } | MockResponse {
  const size = qInt(req.query, "size", defSize);
  let page = qInt(req.query, "page", 0);
  if (!(size >= 1) || size > maxSize) return fail(400, [{ key: "size", message: `size 1 ile ${maxSize} arasında olmalıdır` }]);
  if (!(page >= 0)) return fail(400, [{ key: "page", message: "page 0 veya daha büyük olmalıdır" }]);
  const tok = tokenOffset(qStr(req.query, "nextPageToken"));
  if (tok !== undefined) page = Math.floor(tok / size);
  else if (page * size > 10000) return fail(400, [{ key: "page", message: "page x size en fazla 10.000 olabilir; daha fazlası için nextPageToken kullanın" }]);
  return { page, size, offset: page * size };
}
const wrap = <T,>(all: T[], pg: { page: number; size: number; offset: number }) => ({
  totalElements: all.length, totalPages: Math.max(1, Math.ceil(all.length / pg.size)), page: pg.page, size: pg.size,
  ...(pg.offset + pg.size < all.length ? { nextPageToken: pageToken(pg.offset + pg.size) } : {}),
  content: all.slice(pg.offset, pg.offset + pg.size),
});
function commonFilter(req: MockRequest, list: MockProduct[], dateField: (t: string | undefined) => keyof MockProduct): MockProduct[] | MockResponse {
  const q = req.query;
  const barcodes = [...qList(q, "barcode"), ...qList(q, "barcodes")];
  if (qList(q, "barcodes").length > 50) return fail(400, [{ key: "barcodes", message: "En fazla 50 barkod sorgulanabilir" }]);
  const start = qInt(q, "startDate", NaN), end = qInt(q, "endDate", NaN);
  const df = dateField(qStr(q, "dateQueryType"));
  const brandIds = qList(q, "brandIds").map(Number);
  const sup = qStr(q, "supplierId");
  if (sup && Number(sup) !== sid(req)) return [];
  return list.filter((p) =>
    (!barcodes.length || barcodes.includes(p.barcode)) && (!qStr(q, "stockCode") || p.stockCode === qStr(q, "stockCode")) &&
    (!qStr(q, "productMainId") || p.productMainId === qStr(q, "productMainId")) && (!brandIds.length || brandIds.includes(p.brandId)) &&
    (Number.isNaN(start) || (p[df] as number) >= start) && (Number.isNaN(end) || (p[df] as number) <= end));
}

const unapprovedItem = (p: MockProduct, x: Extra | undefined, sellerId: number) => ({
  supplierId: sellerId, productMainId: p.productMainId, status: x?.rejectReasons?.length ? "rejected" : "pendingApproval",
  createDateTime: p.createDateTime, lastUpdateDate: p.lastUpdateDate, lastPriceChangeDate: x?.lastPriceChangeDate ?? p.createDateTime, lastStockChangeDate: x?.lastStockChangeDate ?? p.createDateTime,
  brand: { id: p.brandId, name: p.brand }, category: { id: p.categoryId, name: p.categoryName }, barcode: p.barcode, title: p.title, description: p.description,
  quantity: p.quantity, listPrice: p.listPrice, salePrice: p.salePrice, ...(x?.cargoProviders ? { cargoProviders: x.cargoProviders } : {}), docNeeded: false, vatRate: p.vatRate,
  dimensionalWeight: x?.dimensionalWeight ?? null, stockCode: p.stockCode, origin: x?.origin ?? null, media: p.images.map((url) => ({ url })), attributes: p.attributes,
  ...(x?.rejectReasons?.length ? { rejectReasonDetails: x.rejectReasons } : {}), locationBasedDelivery: x?.locationBasedDelivery ?? "DISABLED", lotNumber: x?.lotNumber ?? null,
});

const filterUnapprovedProducts: MockHandler = async (req, state) => {
  const pg = paging(req, 1000, 50); if (isResp(pg)) return pg;
  const list = (await settle(state)).filter((p) => !p.approved);
  const f = commonFilter(req, list, (t) => (t === "LAST_MODIFIED_DATE" ? "lastUpdateDate" : "createDateTime")); if (isResp(f)) return f;
  const extras = await loadMap<Extra>(state, "ty:extras");
  const status = qStr(req.query, "status");
  const rows = f.map((p) => unapprovedItem(p, extras[p.barcode], sid(req))).filter((i) => !status || i.status === status).sort((a, b) => b.createDateTime - a.createDateTime);
  return ok(wrap(rows, pg));
};

function buildContents(list: MockProduct[], extras: Record<string, Extra>, sellerId: number) {
  const groups = new Map<number, MockProduct[]>();
  for (const p of list) groups.set(p.productContentId, [...(groups.get(p.productContentId) ?? []), p]);
  return [...groups.entries()].map(([contentId, ps]) => {
    const first = ps[0]!;
    const flat = (p: MockProduct, wantSize: boolean) => p.attributes.filter((a) => (a.attributeId === ATTRS.beden!.id) === wantSize);
    return {
      contentId, productMainId: first.productMainId, brand: { id: first.brandId, name: first.brand }, category: { id: first.categoryId, name: first.categoryName },
      creationDate: Math.min(...ps.map((p) => p.createDateTime)), lastModifiedDate: Math.max(...ps.map((p) => p.lastUpdateDate)), lastModifiedBy: "api@openshelf.local",
      title: first.title, description: first.description, images: first.images.map((url) => ({ url })), attributes: flat(first, false),
      variants: ps.map((p) => {
        const x = extras[p.barcode];
        return {
          variantId: variantIdOf(p), supplierId: sellerId, barcode: p.barcode, commission: 8.5, attributes: flat(p, true),
          productUrl: `https://www.trendyol.com/openshelf/urun-p-${contentId}?merchantId=${sellerId}`, onSale: p.onSale, channels: x?.channels ?? ["CORE"],
          deliveryOption: { deliveryDuration: x?.deliveryDuration ?? 1 }, stock: { quantity: p.quantity, lastModifiedDate: x?.lastStockChangeDate ?? p.lastUpdateDate },
          price: { salePrice: p.salePrice, listPrice: p.listPrice, priceSeenByCustomer: p.salePrice }, stockCode: p.stockCode, origin: x?.origin ?? null, vatRate: p.vatRate,
          sellerCreatedDate: p.createDateTime, sellerModifiedDate: p.lastUpdateDate, locked: p.locked, lockReason: p.locked ? (x?.lockReason ?? "Fiyat hatası şüphesi") : null,
          lockDate: p.locked ? (x?.lockDate ?? p.lastUpdateDate) : null, archived: p.archived, archivedDate: p.archived ? (x?.archivedDate ?? p.lastUpdateDate) : null,
          docNeeded: false, hasViolation: false, blacklisted: p.blacklisted, ...(x?.cargoProviders ? { cargoProviders: x.cargoProviders } : {}),
        };
      }),
    };
  });
}
const statusOk = (p: MockProduct, s: string | undefined) => !s || (s === "archived" ? p.archived : s === "blacklisted" ? p.blacklisted : s === "locked" ? p.locked : s === "onSale" ? p.onSale : s === "notOnSale" ? !p.onSale : true);
const approvedDate = (t: string | undefined): keyof MockProduct => (t === "VARIANT_CREATED_DATE" ? "createDateTime" : "lastUpdateDate");

const filterApprovedProducts: MockHandler = async (req, state) => {
  const pg = paging(req, 100, 50); if (isResp(pg)) return pg;
  const list = (await settle(state)).filter((p) => p.approved && statusOk(p, qStr(req.query, "status")));
  const f = commonFilter(req, list, approvedDate); if (isResp(f)) return f;
  const cid = qStr(req.query, "contentId");
  const rows = buildContents(f.filter((p) => !cid || String(p.productContentId) === cid), await loadMap<Extra>(state, "ty:extras"), sid(req));
  const dir = qStr(req.query, "orderByDirection")?.toLowerCase();
  if (dir) rows.sort((a, b) => (dir === "asc" ? a.creationDate - b.creationDate : b.creationDate - a.creationDate));
  return ok(wrap(rows, pg));
};

const filterApprovedProductsInventoryAndPrice: MockHandler = async (req, state) => {
  const pg = paging(req, 100, 50); if (isResp(pg)) return pg;
  const list = (await settle(state)).filter((p) => p.approved && statusOk(p, qStr(req.query, "status")));
  const f = commonFilter(req, list, approvedDate); if (isResp(f)) return f;
  const cid = qStr(req.query, "contentId");
  const extras = await loadMap<Extra>(state, "ty:extras");
  const rows = buildContents(f.filter((p) => !cid || String(p.productContentId) === cid), extras, sid(req)).map((c) => ({
    contentId: c.contentId, productMainId: c.productMainId,
    variants: c.variants.map((v) => ({ variantId: v.variantId, barcode: v.barcode, salePrice: v.price.salePrice, listPrice: v.price.listPrice, quantity: v.stock.quantity, stockCode: v.stockCode, stockLastModifiedDate: extras[v.barcode]?.stockModified ? v.stock.lastModifiedDate : null })),
  }));
  const dir = qStr(req.query, "orderByDirection")?.toLowerCase();
  if (dir === "desc") rows.reverse();
  return ok(wrap(rows, pg));
};

const getProductBase: MockHandler = async (req, state) => {
  const bc = String(req.path.barcode ?? "");
  const p = (await settle(state)).find((x) => x.barcode === bc);
  if (!p) return fail(404, [{ key: "product.not.found", message: "Ürün sistemde bulunamadı" }]);
  const x = (await loadMap<Extra>(state, "ty:extras"))[bc];
  return ok({ barcode: p.barcode, approved: p.approved, approvedDate: p.approved ? (x?.approvedDate ?? p.createDateTime) : null, archived: p.archived, listingId: p.approved ? hash(bc).toString(16).padStart(8, "0").repeat(4) : null, contentId: p.productContentId });
};

// ---------- batch ops on existing barcodes ----------
const getBatchRequestResult: MockHandler = async (req, state) => {
  const id = String(req.path.batchRequestId ?? "");
  const batches = await loadMap<Batch>(state, "ty:batches");
  const b = batches[id];
  if (!b || b.lastModification < state.now() - FOUR_HOURS) return fail(404, [{ key: "batch.request.not.found", message: "Batch isteği bulunamadı veya sonuç süresi (4 saat) doldu" }]);
  b.polled = true; await state.set("ty:batches", batches);
  await settle(state);
  const failed = b.items.filter((i) => i.status === "FAILED").length;
  return ok({
    batchRequestId: b.batchRequestId, items: b.items,
    ...(b.type === "ProductInventoryUpdate" ? {} : { status: "COMPLETED" }),
    creationDate: b.creationDate, lastModification: b.lastModification, sourceType: "API", itemCount: b.items.length, failedItemCount: failed, batchRequestType: b.type,
  });
};

const deleteProducts: MockHandler = async (req, state) => {
  const r = itemsOf(req.body); if (isResp(r)) return r;
  const bad = badBarcodes(r.items);
  if (bad.length) return fail(400, bad.map(({ n }) => ({ key: "invalid.barcode", message: `Barkod formatı geçersiz (items[${n}])` })));
  const list = await settle(state);
  const extras = await loadMap<Extra>(state, "ty:extras");
  const pending = await loadMap<{ batchId: string; at: number }>(state, "ty:pending");
  const now = state.now(), gone = new Set<string>(), items: BatchItem[] = [];
  for (const i of r.items) {
    const bc = i.barcode as string, p = list.find((x) => x.barcode === bc), ri = { barcode: bc };
    if (!p) items.push(failItem(ri, "Ürün sistemde bulunamadı"));
    else if (!p.approved) { gone.add(bc); items.push(okItem(ri)); }
    else if (p.archived && now - (extras[bc]?.archivedDate ?? p.lastUpdateDate) >= 86_400_000 && !p.blacklisted) { gone.add(bc); items.push(okItem(ri)); }
    else items.push(failItem(ri, p.archived ? "Ürün 1 günden kısa süredir arşivde; silinebilmesi için en az 1 gün arşivde kalmalıdır" : "Onaylı ürün silinemez: önce arşivleyin ve 1 gün bekleyin"));
  }
  for (const bc of gone) { delete extras[bc]; delete pending[bc]; }
  await saveProducts(state, list.filter((p) => !gone.has(p.barcode))); await state.set("ty:extras", extras); await state.set("ty:pending", pending);
  return batchOk(state, "ProductDeletion", items);
};

const archiveProducts: MockHandler = async (req, state) => {
  const r = itemsOf(req.body); if (isResp(r)) return r;
  const bad = badBarcodes(r.items);
  if (bad.length) return fail(400, bad.map(({ n }) => ({ key: "invalid.barcode", message: `Barkod formatı geçersiz (items[${n}])` })));
  const nonBool = r.items.map((i, n) => ({ n, a: i.archived })).filter(({ a }) => typeof a !== "boolean");
  if (nonBool.length) return fail(400, nonBool.map(({ n }) => ({ key: `items[${n}].archived`, message: "archived alanı true veya false olmalıdır" })));
  const list = await settle(state);
  const missing = r.items.filter((i) => !list.some((p) => p.barcode === i.barcode));
  if (missing.length) return fail(404, missing.map((i) => ({ key: "product.not.found", message: `Ürün sistemde bulunamadı: ${i.barcode}` })));
  const extras = await loadMap<Extra>(state, "ty:extras");
  const now = state.now(), items: BatchItem[] = [];
  for (const i of r.items) {
    const p = list.find((x) => x.barcode === i.barcode)!, ri = { archived: i.archived, supplierId: sid(req), barcode: p.barcode };
    if (!p.approved) { items.push({ ...failItem(ri, "Onay bekleyen ürünler arşivlenemez"), batchRequestLogId: uuid() }); continue; }
    p.archived = i.archived as boolean; p.lastUpdateDate = now;
    p.onSale = !p.archived && p.quantity > 0 && !p.locked;
    extras[p.barcode] = { ...extras[p.barcode], archivedDate: p.archived ? now : null };
    items.push({ ...okItem(ri), batchRequestLogId: uuid() });
  }
  await saveProducts(state, list); await state.set("ty:extras", extras);
  return batchOk(state, "ProductArchiveUpdate", items);
};

const unlockProducts: MockHandler = async (req, state) => {
  const r = itemsOf(req.body); if (isResp(r)) return r;
  const bad = badBarcodes(r.items);
  if (bad.length) return fail(400, bad.map(({ n }) => ({ key: "invalid.barcode", message: `Barkod formatı geçersiz (items[${n}])` })));
  const list = await settle(state);
  const missing = r.items.filter((i) => !list.some((p) => p.barcode === i.barcode));
  if (missing.length) return fail(404, missing.map((i) => ({ key: "product.not.found", message: `Ürün sistemde bulunamadı: ${i.barcode}` })));
  const extras = await loadMap<Extra>(state, "ty:extras");
  const items: BatchItem[] = [];
  for (const i of r.items) {
    const p = list.find((x) => x.barcode === i.barcode)!, ri = { barcode: p.barcode };
    if (!p.locked) { items.push(failItem(ri, "Ürün kilitli değil")); continue; }
    p.locked = false; p.lastUpdateDate = state.now(); p.onSale = p.approved && !p.archived && p.quantity > 0;
    extras[p.barcode] = { ...extras[p.barcode], lockReason: null, lockDate: null };
    items.push(okItem(ri));
  }
  await saveProducts(state, list); await state.set("ty:extras", extras);
  return batchOk(state, "ProductUnlockUpdate", items);
};

const getBuyboxInformation: MockHandler = async (req, state) => {
  const codes = isObj(req.body) && Array.isArray(req.body.barcodes) ? (req.body.barcodes as unknown[]).filter((b): b is string => typeof b === "string") : [];
  if (!codes.length) return fail(400, [{ key: "barcodes", message: "barcodes alanı zorunludur" }]);
  if (codes.length > 10) return fail(400, [{ key: "barcodes", message: "En fazla 10 barkod sorgulanabilir" }]);
  const list = await settle(state);
  const buyboxInfo = codes.map((bc) => list.find((p) => p.barcode === bc && p.approved)).filter((p): p is MockProduct => !!p).map((p) => {
    const h = hash(p.barcode), order = 1 + (h % 4), r2 = (n: number) => Math.round(n * 100) / 100;
    const buyboxPrice = order === 1 ? p.salePrice : r2(p.salePrice * (0.9 + (h % 7) / 100));
    return { barcode: p.barcode, buyboxOrder: order, buyboxPrice, hasMultipleSeller: order > 1 || h % 2 === 0, secondBuyboxPrice: r2(Math.max(buyboxPrice, p.salePrice) * 1.04), thirdBuyboxPrice: r2(Math.max(buyboxPrice, p.salePrice) * 1.09) };
  });
  return ok({ buyboxInfo });
};

// ---------- stock & price ----------
const updatePriceAndInventory: MockHandler = async (req, state) => {
  const r = itemsOf(req.body); if (isResp(r)) return r;
  const bad = badBarcodes(r.items);
  if (bad.length) return fail(400, bad.map(({ n }) => ({ key: `items[${n}].barcode`, message: "barcode zorunludur ve geçerli formatta olmalıdır" })));
  const now = state.now();
  const sig = JSON.stringify(r.items), last = await loadMap<number>(state, "ty:lastreq");
  for (const [k, at] of Object.entries(last)) if (now - at >= 15 * 60_000) delete last[k];
  if (last[sig] !== undefined) return fail(400, [{ key: "duplicate.request", message: "15 dakika boyunca aynı isteği tekrarlı olarak atamazsınız!" }]);
  last[sig] = now; await state.set("ty:lastreq", last);
  const list = await settle(state);
  const extras = await loadMap<Extra>(state, "ty:extras");
  const hits = await loadMap<number[]>(state, "ty:pricehits");
  const items: BatchItem[] = [];
  for (const i of r.items) {
    const bc = i.barcode as string, p = list.find((x) => x.barcode === bc && x.approved);
    const ri = { updateRequestDate: new Date(now).toISOString(), ...(i.quantity !== undefined ? { quantity: i.quantity } : {}), ...(i.salePrice !== undefined ? { salePrice: i.salePrice } : {}), barcode: bc, ...(i.listPrice !== undefined ? { listPrice: i.listPrice } : {}) };
    const reasons: string[] = [];
    if (!p) reasons.push("Barkod bulunamadı veya ürün henüz onaylanmadı");
    if (i.quantity !== undefined && (!Number.isInteger(i.quantity) || (i.quantity as number) < 0)) reasons.push("quantity 0 veya daha büyük bir tam sayı olmalıdır");
    else if (typeof i.quantity === "number" && i.quantity > 20000) reasons.push("Stok miktarı en fazla 20000 olabilir");
    for (const f of ["salePrice", "listPrice"]) if (i[f] !== undefined && (typeof i[f] !== "number" || (i[f] as number) <= 0)) reasons.push(`${f} 0'dan büyük olmalıdır`);
    const sale = (typeof i.salePrice === "number" ? i.salePrice : p?.salePrice) ?? 0, list0 = (typeof i.listPrice === "number" ? i.listPrice : p?.listPrice) ?? 0;
    if (p && (i.salePrice !== undefined || i.listPrice !== undefined) && sale > list0) reasons.push("salePrice, listPrice değerinden büyük olamaz");
    if (p && (i.salePrice !== undefined || i.listPrice !== undefined)) {
      const recent = (hits[bc] ?? []).filter((at) => now - at < 60_000);
      if (recent.length >= 30) reasons.push("Aynı barkod için dakikada en fazla 30 fiyat güncellemesi yapılabilir");
      else hits[bc] = [...recent, now];
    }
    if (reasons.length || !p) { items.push(failItem(ri, ...reasons)); continue; }
    const x = (extras[bc] ??= {});
    if (typeof i.quantity === "number") { p.quantity = i.quantity; x.lastStockChangeDate = now; x.stockModified = true; }
    if (typeof i.salePrice === "number") { p.salePrice = i.salePrice; x.lastPriceChangeDate = now; }
    if (typeof i.listPrice === "number") { p.listPrice = i.listPrice; x.lastPriceChangeDate = now; }
    p.lastUpdateDate = now; p.onSale = p.quantity > 0 && !p.archived && !p.locked;
    items.push(okItem(ri));
  }
  await saveProducts(state, list); await state.set("ty:extras", extras); await state.set("ty:pricehits", hits);
  return batchOk(state, "ProductInventoryUpdate", items);
};

// ---------- updates ----------
function applyCommon(p: MockProduct, x: Extra, i: Obj, reasons: string[]): void {
  if (typeof i.stockCode === "string") p.stockCode = i.stockCode;
  if (typeof i.vatRate === "number") { if ([0, 1, 10, 20].includes(i.vatRate)) p.vatRate = i.vatRate; else reasons.push("vatRate 0, 1, 10 veya 20 olmalıdır"); }
  for (const f of ["shipmentAddressId", "returningAddressId", "dimensionalWeight"] as const) if (typeof i[f] === "number") (x as Obj)[f] = i[f];
  for (const f of ["lotNumber", "origin"] as const) if (typeof i[f] === "string") (x as Obj)[f] = i[f];
  if ("locationBasedDelivery" in i) { if (i.locationBasedDelivery === null || i.locationBasedDelivery === "ENABLED" || i.locationBasedDelivery === "DISABLED") x.locationBasedDelivery = i.locationBasedDelivery as string | null; else reasons.push("locationBasedDelivery ENABLED, DISABLED veya null olmalıdır"); }
  if (Array.isArray(i.cargoProviders)) x.cargoProviders = i.cargoProviders as string[];
}

const updateUnapprovedProducts: MockHandler = async (req, state) => {
  const r = itemsOf(req.body); if (isResp(r)) return r;
  const bad = badBarcodes(r.items);
  if (bad.length) return fail(400, bad.map(({ n }) => ({ key: `items[${n}].barcode`, message: "barcode zorunludur ve geçerli formatta olmalıdır" })));
  const list = await settle(state);
  const [brands, cats] = [await loadBrands(state), await loadCategories(state)];
  const extras = await loadMap<Extra>(state, "ty:extras");
  const items: BatchItem[] = [];
  for (const i of r.items) {
    const p = list.find((x) => x.barcode === i.barcode), ri = { barcode: i.barcode, product: i };
    if (!p) { items.push(failItem(ri, "Ürün sistemde bulunamadı")); continue; }
    if (p.approved) { items.push(failItem(ri, "Onaylı ürünler bu servis ile güncellenemez; updateContentBulk / updateVariantBulk kullanın")); continue; }
    const reasons: string[] = [], x = (extras[p.barcode] ??= {});
    if (typeof i.title === "string") { if (i.title.length > 100) reasons.push("title en fazla 100 karakter olabilir"); else p.title = i.title; }
    if (typeof i.description === "string") { if (i.description.length > 30000) reasons.push("description en fazla 30.000 karakter olabilir"); else p.description = i.description; }
    if (typeof i.productMainId === "string") p.productMainId = i.productMainId;
    if (i.brandId !== undefined) { const b = brands.find((y) => y.id === i.brandId); if (b) { p.brandId = b.id; p.brand = b.name; } else reasons.push(`Geçersiz marka bilgisi: brandId=${i.brandId}`); }
    if (i.categoryId !== undefined) { const c = cats.find((y) => y.id === i.categoryId); if (c && isLeaf(cats, c.id)) { p.categoryId = c.id; p.categoryName = c.name; } else reasons.push(`Geçersiz kategori: ${i.categoryId}`); }
    if (Array.isArray(i.images)) { const urls = (i.images as Obj[]).map((y) => y.url); if (urls.length && urls.length <= 8 && urls.every((u) => typeof u === "string" && u.startsWith("https://"))) p.images = urls as string[]; else reasons.push("Görseller https:// ile başlamalı ve en fazla 8 adet olmalıdır"); }
    if (Array.isArray(i.attributes)) { const m = mapAttributes(p.categoryId, i.attributes, true); if (m.reasons.length) reasons.push(...m.reasons); else p.attributes = m.attrs; }
    if (isObj(i.deliveryOption) && typeof i.deliveryOption.deliveryDuration === "number") x.deliveryDuration = i.deliveryOption.deliveryDuration;
    applyCommon(p, x, i, reasons);
    if (reasons.length) items.push(failItem(ri, ...reasons)); else { p.lastUpdateDate = state.now(); items.push(okItem(ri)); }
  }
  await saveProducts(state, list); await state.set("ty:extras", extras);
  return batchOk(state, "ProductV2Update", items);
};

const pushAudits = async (state: MockState, audits: Audit[]) => { if (audits.length) { const all = (await state.get<Audit[]>("ty:audits")) ?? []; await state.set("ty:audits", [...audits, ...all].slice(0, 500)); } };

const updateContentBulk: MockHandler = async (req, state) => {
  const r = itemsOf(req.body); if (isResp(r)) return r;
  const noId = r.items.map((i, n) => ({ n, c: i.contentId })).filter(({ c }) => !Number.isInteger(c));
  if (noId.length) return fail(400, noId.map(({ n }) => ({ key: `items[${n}].contentId`, message: "contentId zorunludur" })));
  const list = await settle(state);
  const nowIso = new Date(state.now()).toISOString();
  const items: BatchItem[] = [], audits: Audit[] = [];
  const batchId = `${uuid()}-${Math.floor(state.now() / 1000)}`;
  for (const i of r.items) {
    const ps = list.filter((p) => p.productContentId === i.contentId && p.approved), ri = { supplierId: sid(req), updateRequest: i };
    if (!ps.length) { items.push(failItem(ri, "İçerik bulunamadı veya onaylı değil")); continue; }
    const reasons: string[] = [];
    if (typeof i.title === "string" && (i.title.length > 100 || !i.title.trim())) reasons.push("title boş olamaz ve en fazla 100 karakter olabilir");
    if (typeof i.description === "string" && (i.description.length > 30000 || !i.description.trim())) reasons.push("description boş olamaz ve en fazla 30.000 karakter olabilir");
    let urls: string[] | undefined;
    if (Array.isArray(i.images)) { urls = (i.images as Obj[]).map((y) => y.url as string); if (!urls.length || urls.length > 8 || urls.some((u) => typeof u !== "string" || !u.startsWith("https://"))) reasons.push("Görseller https:// ile başlamalı ve en fazla 8 adet olmalıdır"); }
    const mapped = Array.isArray(i.attributes) ? mapAttributes(ps[0]!.categoryId, i.attributes, true) : undefined;
    if (mapped) reasons.push(...mapped.reasons);
    if (reasons.length) { items.push(failItem(ri, ...reasons)); continue; }
    const first = ps[0]!, updates: Record<string, unknown>[] = [];
    const rec = (type: string, changed: boolean, extra: Record<string, unknown>) => updates.push(changed
      ? { type, status: "SUCCESS", completedDate: nowIso, ...extra }
      : { type, status: "FAIL", completedDate: nowIso, rejectReasons: [{ type: "CHANGES_NOT_FOUND", reason: "No Changes Detected", detail: "The product information you submitted is identical to the existing data already defined in the system. Since no changes were detected, the update was not applied.", parameters: {} }], ...extra });
    if (typeof i.title === "string") { const ch = i.title !== first.title; rec("TITLE", ch, { changedTitle: i.title, existingTitle: first.title }); if (ch) ps.forEach((p) => (p.title = i.title as string)); }
    if (typeof i.description === "string") { const ch = i.description !== first.description; rec("DESCRIPTION", ch, { changedDescription: i.description, existingDescription: first.description }); if (ch) ps.forEach((p) => (p.description = i.description as string)); }
    if (urls) { const ch = JSON.stringify(urls) !== JSON.stringify(first.images); rec("MEDIA", ch, { changedMedias: urls.map((url, order) => ({ url, order: order + 1 })), existingMedias: first.images.map((url, order) => ({ url, order: order + 1 })) }); if (ch) ps.forEach((p) => (p.images = urls!)); }
    if (mapped) { const ch = JSON.stringify(mapped.attrs) !== JSON.stringify(first.attributes); rec("ATTRIBUTE", ch, { changedAttributes: mapped.attrs, existingAttributes: first.attributes }); if (ch) ps.forEach((p) => (p.attributes = mapped.attrs)); }
    ps.forEach((p) => (p.lastUpdateDate = state.now()));
    audits.push({ barcode: first.barcode, contentId: first.productContentId, batchRequestId: batchId, requestDate: nowIso, updates });
    items.push(okItem(ri));
  }
  await saveProducts(state, list); await pushAudits(state, audits);
  const batches = await loadMap<Batch>(state, "ty:batches");
  const now = state.now();
  batches[batchId] = { batchRequestId: batchId, type: "ApprovedProductContentUpdate", creationDate: now, lastModification: now, items };
  await state.set("ty:batches", batches);
  return ok({ batchRequestId: batchId });
};

const updateVariantBulk: MockHandler = async (req, state) => {
  const r = itemsOf(req.body); if (isResp(r)) return r;
  const bad = badBarcodes(r.items);
  if (bad.length) return fail(400, bad.map(({ n }) => ({ key: `items[${n}].barcode`, message: "barcode zorunludur ve geçerli formatta olmalıdır" })));
  const list = await settle(state);
  const extras = await loadMap<Extra>(state, "ty:extras");
  const items: BatchItem[] = [];
  for (const i of r.items) {
    const p = list.find((x) => x.barcode === i.barcode && x.approved), ri = { supplierId: sid(req), updateRequest: i };
    if (!p) { items.push(failItem(ri, "Onaylı ürün bulunamadı")); continue; }
    const reasons: string[] = [], x = (extras[p.barcode] ??= {});
    if (i.channels !== undefined) {
      if (!Array.isArray(i.channels) || !i.channels.length || i.channels.some((c) => c !== "CORE" && c !== "LUXE")) reasons.push("channels boş olamaz ve yalnızca CORE / LUXE içerebilir");
      else x.channels = i.channels as string[];
    }
    applyCommon(p, x, i, reasons);
    if (reasons.length) items.push(failItem(ri, ...reasons)); else { p.lastUpdateDate = state.now(); items.push(okItem(ri)); }
  }
  await saveProducts(state, list); await state.set("ty:extras", extras);
  return batchOk(state, "ApprovedProductVariantUpdate", items);
};

const updateDeliveryInfoBulk: MockHandler = async (req, state) => {
  const r = itemsOf(req.body); if (isResp(r)) return r;
  const bad = badBarcodes(r.items);
  if (bad.length) return fail(400, bad.map(({ n }) => ({ key: `items[${n}].barcode`, message: "barcode zorunludur ve geçerli formatta olmalıdır" })));
  const list = await settle(state);
  const extras = await loadMap<Extra>(state, "ty:extras");
  const items: BatchItem[] = [];
  for (const i of r.items) {
    const p = list.find((x) => x.barcode === i.barcode && x.approved);
    const ri = { supplierId: sid(req), barcode: i.barcode, storeFrontCode: "TR", storeFrontId: 1, request: i };
    const dd = isObj(i.deliveryOptions) ? i.deliveryOptions.deliveryDuration : undefined;
    if (!p) items.push(failItem(ri, "Onaylı ürün bulunamadı"));
    else if (!Number.isInteger(dd) || (dd as number) < 0) items.push(failItem(ri, "deliveryOptions.deliveryDuration 0 veya daha büyük bir tam sayı olmalıdır (0: bugün, 1: en geç yarın)"));
    else { extras[p.barcode] = { ...extras[p.barcode], deliveryDuration: dd as number }; p.lastUpdateDate = state.now(); items.push(okItem(ri)); }
  }
  await saveProducts(state, list); await state.set("ty:extras", extras);
  return batchOk(state, "ProductDeliveryOptionUpdate", items);
};

const getUpdateAudits: MockHandler = async (req, state) => {
  const cid = Number(req.path.contentId);
  if (!Number.isInteger(cid)) return fail(400, [{ key: "contentId", message: "contentId geçerli bir sayı olmalıdır" }]);
  const page = qInt(req.query, "page", 0), size = qInt(req.query, "size", 100);
  if (!(page >= 0) || !(size >= 1) || size > 100) return fail(400, [{ key: "size", message: "size 1 ile 100 arasında, page 0 veya daha büyük olmalıdır" }]);
  const status = qStr(req.query, "status");
  const all = ((await state.get<Audit[]>("ty:audits")) ?? []).filter((a) => a.contentId === cid && (!status || a.updates.some((u) => u.status === status)));
  return ok({ page, size, totalPage: Math.max(1, Math.ceil(all.length / size)), content: all.slice(page * size, page * size + size) });
};

// ---------- video & warranty ----------
const createVideo: MockHandler = async (req, state) => {
  const b = isObj(req.body) ? req.body : {};
  const e: { key: string; message: string }[] = [];
  const title = typeof b.title === "string" ? b.title : "";
  if (!title) e.push({ key: "seller.integration.title.required", message: "Title is required." });
  else if (title.length < 3 || title.length > 50) e.push({ key: "seller.integration.title.length", message: "Title must be between 3 and 50 characters." });
  if (typeof b.description === "string" && b.description.length > 500) e.push({ key: "seller.integration.description.length", message: "Description must be a maximum of 500 characters." });
  const url = typeof b.videoUrl === "string" ? b.videoUrl : "";
  if (!url) e.push({ key: "seller.integration.video.url.required", message: "Video URL is required." });
  else if (!/^https?:\/\//.test(url)) e.push({ key: "seller.integration.video.url.invalid", message: "Video URL must start with http:// or https://." });
  const ids = Array.isArray(b.productContentIds) ? b.productContentIds.map(String) : typeof b.productContentIds === "string" && b.productContentIds ? b.productContentIds.split(",").map((s) => s.trim()) : [];
  if (!ids.length) e.push({ key: "seller.integration.product.content.ids.required", message: "At least one product content ID is required." });
  else if (ids.length > 100) e.push({ key: "seller.integration.product.content.ids.max", message: "Product content ID list can contain a maximum of 100 elements." });
  const types = ["PRODUCT_PROMOTION", "ASSEMBLY_AND_INSTALLATION", "PACKAGING", "STORE_PROMOTION", "ADVERTISEMENT", "PRODUCT_USAGE_AND_EXPERIENCE"];
  const vct = typeof b.videoContentType === "string" ? b.videoContentType : "PRODUCT_PROMOTION";
  if (!types.includes(vct)) e.push({ key: "seller.integration.body.required", message: "Required fields are missing." });
  if (e.length) return fail(400, e);
  const videos = (await state.get<Video[]>("ty:videos")) ?? [];
  const ext = url.split("?")[0]!.toLowerCase();
  const v: Video = { id: uuid(), title, description: typeof b.description === "string" ? b.description : undefined, videoUrl: url, productContentIds: ids, videoContentType: vct, createdAt: state.now(), failCode: /\.(mp4|mov)$/.test(ext) ? undefined : "video.content.api.seller.integration.video.format.invalid" };
  // a content has at most one active video: detach older videos
  for (const o of videos) if (!o.failCode) o.productContentIds = o.productContentIds.filter((c) => !ids.includes(c));
  await state.set("ty:videos", [v, ...videos].slice(0, 200));
  return ok({ videoId: v.id });
};

const getVideos: MockHandler = async (req, state) => {
  const page = qInt(req.query, "page", 0), size = qInt(req.query, "size", 10);
  if (!(page >= 0) || !(size >= 1)) return fail(400, [{ key: "seller.integration.body.required", message: "Required fields are missing." }]);
  const st = qStr(req.query, "sellerIntegrationStatus");
  if (st && !["IN_PROGRESS", "SUCCESS", "FAILED"].includes(st)) return fail(400, [{ key: "seller.integration.invalid.status", message: "Invalid sellerIntegrationStatus value. Valid values: IN_PROGRESS, SUCCESS, FAILED." }]);
  const now = state.now();
  const rows = ((await state.get<Video[]>("ty:videos")) ?? []).map((v) => {
    const age = now - v.createdAt;
    const status = age < 5000 ? "IN_PROGRESS" : v.failCode ? "FAILED" : "SUCCESS";
    return { id: v.id, title: v.title, description: v.description ?? "", status, videoUrl: v.videoUrl, productContentIds: v.productContentIds,
      ...(status === "SUCCESS" && age >= 10000 ? { optimizedVideoUrl: `https://video-content.dsmcdn.com/mock/openshelf/${v.id}_hd.mp4` } : status === "SUCCESS" ? { optimizedVideoUrl: null } : {}),
      ...(status === "FAILED" ? { errorCode: v.failCode } : {}), isApproved: status === "SUCCESS" && age >= 10000 };
  }).filter((v) => (!qStr(req.query, "id") || v.id === qStr(req.query, "id")) && (!st || v.status === st));
  return ok({ meta: { page, total: rows.length, totalPage: Math.max(1, Math.ceil(rows.length / size)), size }, data: rows.slice(page * size, page * size + size) });
};

const createWarrantyDocument: MockHandler = (req) => {
  const b = isObj(req.body) ? req.body : {};
  const f = isObj(b.fields) ? b.fields : {};
  const pkg = b.shipmentPackageId ?? f.shipmentPackageId, line = b.lineId ?? f.lineId;
  const e: { key: string; message: string }[] = [];
  if (!pkg) e.push({ key: "shipmentPackageId", message: "shipmentPackageId zorunludur" });
  if (!line) e.push({ key: "lineId", message: "lineId zorunludur" });
  return e.length ? fail(400, e) : ok({});
};

export const mockHandlers: Record<string, MockHandler> = {
  createProducts, getProductBase, filterUnapprovedProducts, filterApprovedProducts, filterApprovedProductsInventoryAndPrice, deleteProducts, archiveProducts,
  getBuyboxInformation, unlockProducts, updateUnapprovedProducts, updateContentBulk, updateVariantBulk, updateDeliveryInfoBulk, getUpdateAudits,
  updatePriceAndInventory, getBatchRequestResult, createVideo, getVideos, createWarrantyDocument,
};
void attrById;

import type { MockHandler, MockRequest, MockResponse, MockState } from "@openshelf/shared";
import { loadList, loadProducts, pageOf, saveList, type MockProduct } from "./state";

/**
 * Stateful offline Trendyol for group 3: claims, questions, invoices, seller info, finance, TEX compensation, webhooks.
 * State keys: ty:claims, ty:claimAudits, ty:questions, ty:invoiceLinks, ty:finance, ty:compensation, ty:webhooks.
 * Webhook secrets (password / apiKey) are NEVER stored: only `hasPassword` / `hasApiKey` flags are kept and echoed masked.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Obj = Record<string, any>;
const DAY = 86_400_000, HOUR = 3_600_000;
const MASK = "********";
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown, d: number) => (v === undefined || v === null || v === "" ? d : Number(v));
const list = (v: unknown): string[] => (Array.isArray(v) ? v.flatMap((x) => String(x).split(",")) : typeof v === "string" && v ? v.split(",") : []).map((s) => s.trim()).filter(Boolean);
const round2 = (n: number) => Math.round(n * 100) / 100;
const pad = (n: number, w: number) => String(n).padStart(w, "0");
const ok = (body: unknown, status = 200): MockResponse => ({ status, body });
/** Trendyol-style error body used by the claims / questions / webhook mocks. */
const tyErr = (status: number, key: string, message: string): MockResponse => ({ status, body: { errors: [{ key, message }] } });
/** Error schema documented for the invoice APIs: { error, message, timestamp, path, status }. */
const apiErr = (req: MockRequest, state: MockState, status: number, error: string, message: string): MockResponse => ({
  status, body: { error, message, timestamp: state.now(), path: req.op.path.replace("{sellerId}", req.sellerId), status },
});
const finErr = (status: number, error: string, message: string): MockResponse => ({ status, body: { error, message } });

/* ═══════════════════════════ Claims ═══════════════════════════ */
const CUSTOMER_REASONS = [
  { externalReasonId: 251, name: "Modelini beğenmedim", code: "DISLIKE_MODEL" }, { externalReasonId: 301, name: "Kusurlu ürün gönderildi", code: "DEFECTIVE" },
  { externalReasonId: 351, name: "Yanlış ürün gönderildi", code: "WRONG_PRODUCT" }, { externalReasonId: 401, name: "Vazgeçtim", code: "CHANGED_MIND" },
  { externalReasonId: 451, name: "Diğer", code: "OTHER" }, { externalReasonId: 501, name: "Bedeni küçük geldi", code: "SIZE_SMALL" },
  { externalReasonId: 551, name: "Bedeni büyük geldi", code: "SIZE_LARGE" }, { externalReasonId: 651, name: "Ürün belirtilen özelliklere sahip değil", code: "NOT_AS_DESCRIBED" },
  { externalReasonId: 701, name: "Yanlış sipariş verdim", code: "ORDERED_BY_MISTAKE" }, { externalReasonId: 1651, name: "Kalitesini beğenmedim", code: "DISLIKE_QUALITY" },
  { externalReasonId: 2030, name: "Daha iyi bir fiyat mevcut", code: "BETTER_PRICE" }, { externalReasonId: 2042, name: "Beğenmedim", code: "DISLIKE" },
  { externalReasonId: 2043, name: "Ürünümün parçası/aksesuarı eksik gönderildi", code: "PART_MISSING" },
];
/** Docs: Claim Issue Reasons guide (Turkey list). 1651 is blocked for 24h after WaitingInAction; 1651/451/2101 need no file. */
export const CLAIM_ISSUE_REASONS = [
  { id: 51, name: "Ürün olağan dışı kullanılmış ve/veya müşteri kaynaklı hasar görmüş" }, { id: 401, name: "İade edilen ürün veya adedi eksik" },
  { id: 151, name: "İade edilen ürünün parçası / aksesuarı eksik" }, { id: 201, name: "Satılan üründen tamamen farklı bir ürün (yanlış) iade edildi" },
  { id: 451, name: "Ürünü analize alacağım" }, { id: 2051, name: "Ürünün koruyucu ambalajı (hijyen bandı, mühür, paket) açılmış" },
  { id: 1951, name: "Kurumsal iade faturası iletilmedi veya hatalı" }, { id: 1651, name: "İade paketi tarafıma teslim edilmedi" },
  { id: 2077, name: "Ürün iade edilemeyen 'Kişiselleştirilmiş (Özel Üretim)' statüsündedir" },
  { id: 2078, name: "Gelen üründe herhangi bir kusur yok. Müşteri memnuniyeti için iadeyi kabul etmek istiyorum" },
  { id: 2079, name: "Ürünü doğru ve sağlam gönderdim. İade edilen ürün eksik, hasarlı veya farklı bir ürün olarak ulaştı" },
  { id: 2101, name: "Sipariş sorusundan gelen değişim talebi (müşterinin talebi yoksa kullanılmamalı)" }, { id: 1801, name: "Üretim kaynaklı sorun bulunmadı" },
  { id: 1851, name: "Ürün değişimi yapıldı" }, { id: 1901, name: "Ürün tamiratı gerçekleştirildi" },
];
const FILE_OPTIONAL_REASONS = new Set([1651, 451, 2101]);

const CK = "ty:claims", AK = "ty:claimAudits";
const claimId = (n: number) => `0e1a7c00-0000-4000-8000-${pad(n, 12)}`;
const itemId = (n: number, k: number) => `1a2b3c4d-0000-4000-8000-${pad(n, 9)}${pad(k, 3)}`;
const reasonOf = (id: number) => CUSTOMER_REASONS.find((r) => r.externalReasonId === id);

function mkClaim(n: number, p: MockProduct, o: { order: string; first: string; last: string; qty: number; reason: number; status: string; ageH: number; auto?: boolean; note?: string }, now: number): { claim: Obj; audits: Obj[] } {
  const claimDate = now - o.ageH * HOUR;
  const r = reasonOf(o.reason)!;
  const reason = { name: r.name, externalReasonId: r.externalReasonId, code: r.code };
  const resolved = ["Accepted", "Rejected", "Cancelled"].includes(o.status);
  const claimItems = Array.from({ length: o.qty }, (_, k) => ({
    id: itemId(n, k + 1), orderLineItemId: 29815490 + n * 10 + k, customerClaimItemReason: reason, trendyolClaimItemReason: reason, claimItemStatus: { name: o.status },
    note: o.status === "Rejected" ? (o.note ?? "") : "", customerNote: o.note ?? "", resolved, autoAccepted: !!o.auto, acceptedBySeller: o.status === "Accepted" && !o.auto, acceptDetail: o.status === "Accepted" ? (o.auto ? "SYSTEM" : "SUPPLIER") : "",
  }));
  const lastModified = o.status === "Created" ? claimDate : claimDate + (o.status === "WaitingInAction" ? HOUR : 3 * HOUR);
  const claim: Obj = {
    id: claimId(n), claimId: claimId(n), orderNumber: o.order, orderDate: claimDate - 6 * DAY, customerFirstName: o.first, customerLastName: o.last, claimDate,
    cargoTrackingNumber: 7260242095704727 + n, cargoTrackingLink: `https://tracking.trendyol.com/?id=${pad(n, 8)}-1111-1111-1111-111111111111`, cargoSenderNumber: `81064592544${pad(n, 2)}`,
    cargoProviderName: n % 2 ? "Yurtiçi Kargo Marketplace" : "Aras Kargo Marketplace", orderShipmentPackageId: 3853350 + n, replacementOutboundpackageinfo: {},
    items: [{
      orderLine: { id: 28717250 + n, productName: p.title, barcode: p.barcode, merchantSku: p.stockCode, productColor: "Bej", productSize: "", price: p.salePrice, vatBaseAmount: round2(p.salePrice / (1 + p.vatRate / 100)), vatRate: p.vatRate, salesCampaignId: 183631, productCategory: p.categoryName },
      claimItems,
    }],
    lastModifiedDate: lastModified, orderOutboundPackageId: 58835100 + n,
  };
  const audits: Obj[] = [];
  const au = (ci: string, prev: string, next: string, date: number, app: string) => audits.push({ claimId: claimId(n), claimItemId: ci, previousStatus: prev, newStatus: next, userInfoDocument: { executorId: "328e8073-d898-11eb-b199-d6f52af37563", executorApp: app, executorUser: 6666666 }, date });
  for (const ci of claimItems) {
    au(ci.id, "", "Created", claimDate, "Seller Center Orders BFF");
    if (o.status !== "Created") au(ci.id, "Created", "WaitingInAction", claimDate + HOUR, "Seller Center Orders BFF");
    if (o.status === "Accepted") au(ci.id, "WaitingInAction", "Accepted", claimDate + 3 * HOUR, o.auto ? "System" : "SellerIntegrationApi");
    if (o.status === "Rejected") { au(ci.id, "WaitingInAction", "Unresolved", claimDate + 2 * HOUR, "SellerIntegrationApi"); au(ci.id, "Unresolved", "Rejected", claimDate + 3 * HOUR, "Seller Center Orders BFF"); }
  }
  return { claim, audits };
}

async function seedClaims(state: MockState): Promise<{ claims: Obj[]; audits: Obj[] }> {
  const products = await loadProducts(state);
  const now = state.now();
  const P = (i: number) => products[i % products.length]!;
  const specs = [
    { order: "1058412301", first: "Ayşe", last: "Yılmaz", qty: 1, reason: 501, status: "WaitingInAction", ageH: 6, note: "Beden küçük geldi, değişim istiyorum." },
    { order: "1058412377", first: "Mehmet", last: "Demir", qty: 2, reason: 301, status: "WaitingInAction", ageH: 72, note: "Vazo kırık geldi." },
    { order: "1058413020", first: "Elif", last: "Kaya", qty: 1, reason: 651, status: "WaitingInAction", ageH: 120, note: "Renk fotoğraftakinden farklı." },
    { order: "1058413544", first: "Burak", last: "Şahin", qty: 1, reason: 401, status: "Created", ageH: 2, note: "Vazgeçtim." },
    { order: "1058413812", first: "Zeynep", last: "Arslan", qty: 1, reason: 2042, status: "Created", ageH: 10, note: "" },
    { order: "1058400190", first: "Can", last: "Öztürk", qty: 1, reason: 351, status: "Accepted", ageH: 240, note: "Yanlış ürün gönderilmiş." },
    { order: "1058399722", first: "Selin", last: "Çelik", qty: 1, reason: 701, status: "Accepted", ageH: 360, auto: true, note: "" },
    { order: "1058398455", first: "Emre", last: "Aydın", qty: 1, reason: 2030, status: "Rejected", ageH: 300, note: "Ürün kullanılmış olarak geldi." },
  ];
  const claims: Obj[] = [], audits: Obj[] = [];
  specs.forEach((s, i) => { const r = mkClaim(i + 1, P(i * 2 + 1), s, now); claims.push(r.claim); audits.push(...r.audits); });
  return { claims, audits };
}
async function loadClaims(state: MockState): Promise<{ claims: Obj[]; audits: Obj[] }> {
  let claims = await state.get<Obj[]>(CK), audits = await state.get<Obj[]>(AK);
  if (!claims || !audits) { const s = await seedClaims(state); claims = s.claims; audits = s.audits; await state.set(CK, claims); await state.set(AK, audits); }
  return { claims, audits };
}
const allItems = (c: Obj): Obj[] => (c.items as Obj[]).flatMap((it) => it.claimItems as Obj[]);
const statusOf = (ci: Obj): string => ci.claimItemStatus?.name;
function transition(claim: Obj, ci: Obj, next: string, audits: Obj[], now: number, app = "SellerIntegrationApi") {
  audits.push({ claimId: claim.id, claimItemId: ci.id, previousStatus: statusOf(ci), newStatus: next, userInfoDocument: { executorId: "41038394-d898-11eb-9b23-caa176587e6c", executorApp: app, executorUser: 6666666 }, date: now });
  ci.claimItemStatus = { name: next };
  ci.resolved = ["Accepted", "Rejected", "Cancelled"].includes(next);
  claim.lastModifiedDate = now;
}

const getClaims: MockHandler = async (req, state) => {
  const { claims } = await loadClaims(state);
  const page = num(req.query.page, 0), size = num(req.query.size, 50);
  if (!Number.isInteger(page) || page < 0) return tyErr(400, "page.invalid", "page must be a non-negative integer");
  if (!Number.isInteger(size) || size < 1 || size > 200) return tyErr(400, "size.invalid", "size must be between 1 and 200");
  const ids = list(req.query.claimIds);
  let rows = claims;
  if (ids.length) rows = claims.filter((c) => ids.includes(c.id));
  else {
    const st = req.query.claimItemStatus ? String(req.query.claimItemStatus) : "";
    if (st && !["Created", "WaitingInAction", "WaitingFraudCheck", "Accepted", "Unresolved", "Rejected", "Cancelled", "InAnalysis"].includes(st)) return tyErr(400, "claimItemStatus.invalid", `Unknown claimItemStatus: ${st}`);
    const on = req.query.orderNumber ? String(req.query.orderNumber) : "", from = num(req.query.startDate, 0), to = num(req.query.endDate, Infinity);
    rows = claims.filter((c) => (!st || allItems(c).some((ci) => statusOf(ci) === st)) && (!on || c.orderNumber === on) && c.lastModifiedDate >= from && c.lastModifiedDate <= to);
  }
  rows = [...rows].sort((a, b) => b.lastModifiedDate - a.lastModifiedDate);
  return ok(pageOf(rows, page, size));
};

const createClaim: MockHandler = async (req, state) => {
  const b = req.body;
  if (!isObj(b)) return tyErr(400, "body.invalid", "Request body is required");
  if (!b.orderNumber || typeof b.orderNumber !== "string") return tyErr(400, "orderNumber.required", "orderNumber is required");
  if (!Number.isFinite(Number(b.customerId))) return tyErr(400, "customerId.required", "customerId is required");
  if (!Number.isFinite(Number(b.shipmentCompanyId))) return tyErr(400, "shipmentCompanyId.required", "shipmentCompanyId is required");
  const items = b.claimItems;
  if (!Array.isArray(items) || !items.length) return tyErr(400, "claimItems.empty", "claimItems must contain at least one item");
  const products = await loadProducts(state);
  const picked: { p: MockProduct; qty: number; reason: (typeof CUSTOMER_REASONS)[number]; note: string }[] = [];
  for (const it of items) {
    if (!isObj(it)) return tyErr(400, "claimItems.invalid", "claimItems[] must be objects");
    const p = products.find((x) => x.barcode === it.barcode);
    if (!p) return tyErr(400, "claimItems.barcode.invalid", `Barcode not found in order ${b.orderNumber}: ${String(it.barcode)}`);
    const qty = Number(it.quantity);
    if (!Number.isInteger(qty) || qty < 1) return tyErr(400, "claimItems.quantity.invalid", "quantity must be a positive integer");
    const reason = reasonOf(Number(it.reasonId));
    if (!reason) return tyErr(400, "claimItems.reasonId.invalid", `Unknown customer return reasonId: ${String(it.reasonId)}`);
    picked.push({ p, qty, reason, note: typeof it.customerNote === "string" ? it.customerNote : "" });
  }
  const { claims, audits } = await loadClaims(state);
  const n = 100 + (await state.nextId("ty:claim"));
  const now = state.now();
  const claim: Obj = {
    id: claimId(n), claimId: claimId(n), orderNumber: b.orderNumber, orderDate: now - 7 * DAY, customerFirstName: "Müşteri", customerLastName: `#${b.customerId}`, claimDate: now,
    cargoTrackingNumber: 7330000000 + n, cargoTrackingLink: `https://tracking.trendyol.com/?id=${pad(n, 8)}`, cargoSenderNumber: `733${pad(n, 9)}`, cargoProviderName: "Aras Kargo Marketplace",
    orderShipmentPackageId: 3853400 + n, replacementOutboundpackageinfo: {}, items: [], lastModifiedDate: now, orderOutboundPackageId: 58835200 + n,
  };
  const claimItemIds: string[] = [];
  let k = 0;
  for (const x of picked) {
    const claimItems = Array.from({ length: x.qty }, () => {
      const id = itemId(n, ++k);
      claimItemIds.push(id);
      const reason = { name: x.reason.name, externalReasonId: x.reason.externalReasonId, code: x.reason.code };
      audits.push({ claimId: claim.id, claimItemId: id, previousStatus: "", newStatus: "Created", userInfoDocument: { executorId: "41038394-d898-11eb-9b23-caa176587e6c", executorApp: "SellerIntegrationApi", executorUser: 6666666 }, date: now });
      return { id, orderLineItemId: 29900000 + n * 10 + k, customerClaimItemReason: reason, trendyolClaimItemReason: reason, claimItemStatus: { name: "Created" }, note: "", customerNote: x.note, resolved: false, autoAccepted: false, acceptedBySeller: false, acceptDetail: "" };
    });
    claim.items.push({ orderLine: { id: 28800000 + n * 10 + claim.items.length, productName: x.p.title, barcode: x.p.barcode, merchantSku: x.p.stockCode, productColor: "Bej", productSize: "", price: x.p.salePrice, vatBaseAmount: round2(x.p.salePrice / (1 + x.p.vatRate / 100)), vatRate: x.p.vatRate, salesCampaignId: 183631, productCategory: x.p.categoryName }, claimItems });
  }
  claims.unshift(claim);
  await saveList(state, CK, claims); await saveList(state, AK, audits);
  return ok({ claimId: claim.id, cargoTrackingNumber: String(claim.cargoTrackingNumber), claimItemIds });
};

const approveClaimLineItems: MockHandler = async (req, state) => {
  const { claims, audits } = await loadClaims(state);
  const claim = claims.find((c) => c.id === String(req.path.claimId));
  if (!claim) return tyErr(400, "claim.notFound", `Claim not found: ${req.path.claimId}`);
  const ids = isObj(req.body) && Array.isArray(req.body.claimLineItemIdList) ? (req.body.claimLineItemIdList as unknown[]).map(String) : [];
  if (!ids.length) return tyErr(400, "claimLineItemIdList.empty", "claimLineItemIdList must contain at least one claim item id");
  const items = allItems(claim);
  const picked: Obj[] = [];
  for (const id of ids) {
    const ci = items.find((x) => x.id === id);
    if (!ci) return tyErr(400, "claimLineItem.notFound", `Claim item ${id} does not belong to claim ${claim.id}`);
    if (statusOf(ci) !== "WaitingInAction") return tyErr(400, "claimLineItem.invalidStatus", `Claim item ${id} is in status ${statusOf(ci)}; only WaitingInAction items can be approved`);
    picked.push(ci);
  }
  const now = state.now();
  for (const ci of picked) { transition(claim, ci, "Accepted", audits, now); ci.acceptedBySeller = true; ci.acceptDetail = "SUPPLIER"; }
  await saveList(state, CK, claims); await saveList(state, AK, audits);
  return ok({});
};

const createClaimIssue: MockHandler = async (req, state) => {
  const b = isObj(req.body) ? req.body : {};
  const q = (k: string) => req.query[k] ?? b[k];
  const { claims, audits } = await loadClaims(state);
  const claim = claims.find((c) => c.id === String(req.path.claimId));
  if (!claim) return tyErr(400, "claim.notFound", `Claim not found: ${req.path.claimId}`);
  const reasonId = Number(q("claimIssueReasonId"));
  const reason = CLAIM_ISSUE_REASONS.find((r) => r.id === reasonId);
  if (!reason) return tyErr(400, "claimIssueReasonId.invalid", `Unknown claimIssueReasonId: ${String(q("claimIssueReasonId"))}`);
  const ids = list(q("claimItemIdList"));
  if (!ids.length) return tyErr(400, "claimItemIdList.empty", "claimItemIdList is required");
  const description = q("description");
  if (typeof description !== "string" || !description.trim()) return tyErr(400, "description.required", "description is required");
  if (description.length > 500) return tyErr(400, "description.tooLong", "description must be at most 500 characters");
  const items = allItems(claim);
  const picked: Obj[] = [];
  for (const id of ids) {
    const ci = items.find((x) => x.id === id);
    if (!ci) return tyErr(400, "claimItem.notFound", `Claim item ${id} does not belong to claim ${claim.id}`);
    if (statusOf(ci) !== "WaitingInAction") return tyErr(400, "claimItem.invalidStatus", `Claim item ${id} is in status ${statusOf(ci)}; a rejection request can only be created for WaitingInAction items`);
    picked.push(ci);
  }
  const now = state.now();
  const waitingSince = (audits.filter((a) => a.claimId === claim.id && a.newStatus === "WaitingInAction").map((a) => a.date as number).sort((a, b) => b - a)[0]) ?? claim.claimDate;
  if (reasonId === 1651 && now - waitingSince < DAY) return tyErr(400, "claimIssueReasonId.tooEarly", "Reason 1651 cannot be selected within the first 24 hours after the claim entered WaitingInAction");
  const hasParts = Object.keys(b).length > 0;
  if (hasParts && !FILE_OPTIONAL_REASONS.has(reasonId) && !(b.files ?? b.file)) return tyErr(400, "files.required", "A file attachment is mandatory for this rejection reason (only 1651, 451 and 2101 do not need one)");
  for (const ci of picked) { transition(claim, ci, "Unresolved", audits, now); ci.note = description; }
  await saveList(state, CK, claims); await saveList(state, AK, audits);
  return ok({});
};

const getClaimIssueReasons: MockHandler = () => ok(CLAIM_ISSUE_REASONS);

const getClaimItemAudits: MockHandler = async (req, state) => {
  const { audits } = await loadClaims(state);
  return ok(audits.filter((a) => a.claimItemId === String(req.path.claimItemsId)).sort((a, b) => a.date - b.date));
};

const updateTestClaimToWaitingInAction: MockHandler = async (req, state) => {
  const pid = isObj(req.body) ? Number(req.body.shipmentPackageId) : NaN;
  if (!Number.isFinite(pid)) return tyErr(400, "shipmentPackageId.required", "shipmentPackageId is required");
  const { claims, audits } = await loadClaims(state);
  const claim = claims.find((c) => c.orderShipmentPackageId === pid);
  if (!claim) return tyErr(400, "claim.notFound", `No return found for shipmentPackageId ${pid}`);
  const created = allItems(claim).filter((ci) => statusOf(ci) === "Created");
  if (!created.length) return tyErr(400, "claim.invalidStatus", "No claim item in status Created");
  const now = state.now();
  for (const ci of created) transition(claim, ci, "WaitingInAction", audits, now, "Seller Center Orders BFF");
  await saveList(state, CK, claims); await saveList(state, AK, audits);
  return ok("Claim updated to WaitingInAction");
};

/* ═══════════════════════════ Questions ═══════════════════════════ */
const QK = "ty:questions";
const slug = (s: string) => s.toLowerCase().replace(/ı/g, "i").replace(/ş/g, "s").replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ö/g, "o").replace(/ç/g, "c").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
function questionFor(id: number, p: { productMainId: string; productName: string; imageUrl: string; contentId: number }, text: string, status: string, createdAt: number, extra: Obj = {}): Obj {
  return {
    id, text, customerId: 4147300 + (id % 100), userName: ["A*** Y***", "M*** D***", "E*** K***", "B*** Ş***", "Z*** A***"][id % 5], showUserName: id % 2 === 0, status, public: status === "ANSWERED",
    productMainId: p.productMainId, productName: p.productName, imageUrl: p.imageUrl, webUrl: `https://www.trendyol.com/openshelf/${slug(p.productName)}-p-${p.contentId}`, creationDate: createdAt, ...extra,
  };
}
const fmtDate = (ms: number) => { const d = new Date(ms + 3 * HOUR); return `${pad(d.getUTCDate(), 2)}.${pad(d.getUTCMonth() + 1, 2)}.${d.getUTCFullYear()}`; };
async function seedQuestions(state: MockState): Promise<Obj[]> {
  const products = await loadProducts(state);
  const now = state.now();
  const pr = (i: number) => { const p = products[i % products.length]!; return { productMainId: p.productMainId, productName: p.title, imageUrl: p.images[0] ?? "", contentId: p.productContentId }; };
  const w = (id: number, i: number, text: string, ageH: number) => questionFor(id, pr(i), text, "WAITING_FOR_ANSWER", now - ageH * HOUR);
  const a = (id: number, i: number, text: string, ageH: number, answer: string): Obj => {
    const answered = now - (ageH - 3) * HOUR;
    return questionFor(id, pr(i), text, "ANSWERED", now - ageH * HOUR, { answer: { text: answer, creationDate: answered, status: "PUBLISHED" }, answeredDateMessage: `Cevabınız ${fmtDate(answered)} tarihinde yayınlandı.` });
  };
  return [
    w(1000101, 0, "Merhaba, vazo su geçirir mi? Çiçek koyabilir miyim?", 3),
    w(1000102, 2, "Yastık kılıfı çıkarılıp yıkanabiliyor mu?", 7),
    w(1000103, 4, "Raf duvara montaj aparatlarıyla birlikte geliyor mu? Maksimum kaç kilo taşır?", 20),
    w(1000104, 3, "Mumların yanma süresi yaklaşık ne kadar?", 30),
    w(1000105, 1, "Büyük boy vazonun yüksekliği kaç cm?", 44),
    a(1000106, 5, "Battaniye makinede yıkanabilir mi?", 52, "Merhaba, battaniyemiz 30 derecede hassas programda makinede yıkanabilir."),
    a(1000107, 0, "Vazonun içi sırlı mı?", 70, "Merhaba, vazonun içi de sırlıdır; su geçirmez."),
    a(1000108, 2, "Krem rengi fotoğraftaki gibi mi, gerçekte daha sarı mı?", 100, "Merhaba, renk fotoğraftakiyle aynıdır; ışığa göre küçük tonlama farkı olabilir."),
    questionFor(1000109, pr(4), "Bu rafı ücretsiz kurulum ile gönderebilir misiniz? Ayrıca whatsapp numaranızı paylaşır mısınız?", "REPORTED", now - 60 * HOUR, { reportReason: "Platform dışı iletişim talebi", reportedDate: now - 58 * HOUR }),
    questionFor(1000110, pr(3), "Mum seti hediye paketi ile gelir mi?", "REJECTED", now - 90 * HOUR, {
      rejectedAnswer: { text: "Evet geliyor, ayrıca bizi arayın.", creationDate: now - 88 * HOUR, status: "REJECTED" }, rejectedDate: now - 87 * HOUR, reason: "Cevapta yasaklı ifade bulundu",
    }),
  ];
}
const loadQuestions = (state: MockState) => loadList<Obj>(state, QK, () => { throw new Error("unreachable"); }).catch(async () => undefined);
async function questions(state: MockState): Promise<Obj[]> {
  let l = await state.get<Obj[]>(QK);
  if (!l) { l = await seedQuestions(state); await state.set(QK, l); }
  return l;
}
void loadQuestions;
const lastModified = (q: Obj) => Math.max(q.creationDate, q.answer?.creationDate ?? 0, q.rejectedDate ?? 0, q.reportedDate ?? 0);

const getQuestionFilter: MockHandler = async (req, state) => {
  const all = await questions(state);
  const now = state.now();
  const page = num(req.query.page, 0), size = num(req.query.size, 10);
  if (!Number.isInteger(page) || page < 0) return tyErr(400, "page.invalid", "page must be a non-negative integer");
  if (!Number.isInteger(size) || size < 1 || size > 200) return tyErr(400, "size.invalid", "size must be between 1 and 200");
  const st = req.query.status ? String(req.query.status) : "";
  if (st && !["WAITING_FOR_ANSWER", "ANSWERED", "REJECTED", "REPORTED"].includes(st)) return tyErr(400, "status.invalid", `Unknown status: ${st}`);
  const hasS = req.query.startDate !== undefined && req.query.startDate !== "", hasE = req.query.endDate !== undefined && req.query.endDate !== "";
  let from = num(req.query.startDate, 0), to = num(req.query.endDate, now);
  if (!hasS && !hasE) from = now - 7 * DAY;
  if (hasS && hasE && to - from > 14 * DAY) return tyErr(400, "dateRange.tooLong", "The interval between startDate and endDate can be at most 2 weeks");
  if (hasS && hasE && to < from) return tyErr(400, "dateRange.invalid", "endDate must be after startDate");
  let mainId = "";
  if (req.query.barcode) { const p = (await loadProducts(state)).find((x) => x.barcode === String(req.query.barcode)); mainId = p ? p.productMainId : "__none__"; }
  const field = req.query.orderByField === "LastModifiedDate" ? "LastModifiedDate" : "CreatedDate";
  const dir = String(req.query.orderByDirection ?? "DESC").toUpperCase() === "ASC" ? 1 : -1;
  const rows = all.filter((q) => (!st || q.status === st) && (!mainId || q.productMainId === mainId) && q.creationDate >= from && q.creationDate <= to)
    .sort((a, b) => dir * ((field === "CreatedDate" ? a.creationDate - b.creationDate : lastModified(a) - lastModified(b))));
  return ok(pageOf(rows, page, size));
};

const getQuestion: MockHandler = async (req, state) => {
  const q = (await questions(state)).find((x) => x.id === Number(req.path.id));
  return q ? ok(q) : tyErr(404, "question.notFound", `Question not found: ${req.path.id}`);
};

const answerQuestion: MockHandler = async (req, state) => {
  const all = await questions(state);
  const q = all.find((x) => x.id === Number(req.path.id));
  if (!q) return tyErr(404, "question.notFound", `Question not found: ${req.path.id}`);
  const text = isObj(req.body) && typeof req.body.text === "string" ? req.body.text : "";
  if (!text.trim()) return tyErr(400, "answer.empty", "Empty response: please enter a response.");
  if (text.length < 10) return tyErr(400, "answer.tooShort", "Response too short: your response must be at least 10 characters long.");
  if (text.length > 2000) return tyErr(400, "answer.tooLong", "Response too long: your response cannot exceed 2000 characters.");
  if (q.status === "ANSWERED") return tyErr(400, "answer.alreadyAnswered", "Question already answered. Answered questions cannot be re-answered.");
  if (q.status === "UNANSWERED") return tyErr(400, "answer.timeLimit", "Time limit exceeded: the question has been closed because you did not respond within the allocated time.");
  if (q.status !== "WAITING_FOR_ANSWER") return tyErr(400, "answer.invalidStatus", `Only questions in WAITING_FOR_ANSWER can be answered (current status: ${q.status})`);
  const now = state.now();
  q.status = "ANSWERED"; q.public = true;
  q.answer = { text, creationDate: now, status: "PUBLISHED" };
  q.answeredDateMessage = `Cevabınız ${fmtDate(now)} tarihinde yayınlandı.`;
  await state.set(QK, all);
  return ok("Your answer has been successfully saved.");
};

const createQuestion: MockHandler = async (req, state) => {
  const b = isObj(req.body) ? req.body : {};
  if (typeof b.text !== "string" || !b.text.trim()) return tyErr(400, "text.required", "Please enter a question text.");
  if (b.contentId === undefined || b.contentId === null || b.contentId === "") return tyErr(400, "contentId.required", "contentId is required.");
  if (b.userId === undefined || b.userId === null || b.userId === "") return tyErr(400, "userId.required", "userId is required.");
  if (typeof b.showUserName !== "boolean") return tyErr(400, "showUserName.required", "showUserName is required.");
  const all = await questions(state);
  const products = await loadProducts(state);
  const p = products.find((x) => x.productContentId === Number(b.contentId));
  const info = p ? { productMainId: p.productMainId, productName: p.title, imageUrl: p.images[0] ?? "", contentId: p.productContentId }
    : { productMainId: `CONTENT-${b.contentId}`, productName: `Ürün #${b.contentId}`, imageUrl: "", contentId: Number(b.contentId) };
  const id = 1000200 + (await state.nextId("ty:question"));
  const q = questionFor(id, info, b.text, "WAITING_FOR_ANSWER", state.now());
  q.customerId = Number(b.userId); q.showUserName = b.showUserName;
  if (typeof b.userFullName === "string" && b.userFullName) q.userName = b.userFullName.split(" ").map((s: string) => `${s.slice(0, 1)}***`).join(" ");
  all.unshift(q);
  await state.set(QK, all);
  return ok({ questionId: id });
};

/* ═══════════════════════════ Invoices ═══════════════════════════ */
const IK = "ty:invoiceLinks";
const INVOICE_NO = /^[A-Za-z0-9]{3}\d{13}$/;
const digits = (n: number) => String(Math.trunc(Math.abs(n))).length;
const loadInvoices = (state: MockState) => loadList<Obj>(state, IK, () => [
  { shipmentPackageId: 435340, invoiceLink: "https://invoices.example.com/openshelf/TY41234567890101.pdf", invoiceDateTime: Math.floor((state.now() - 5 * DAY) / 1000), invoiceNumber: "TY41234567890101", kind: "link", customerId: 167878 },
  { shipmentPackageId: 435341, invoiceLink: "https://invoices.example.com/openshelf/TY41234567890102.pdf", invoiceDateTime: Math.floor((state.now() - 4 * DAY) / 1000), invoiceNumber: "TY41234567890102", kind: "link", customerId: 167879 },
]);

const sendInvoiceLink: MockHandler = async (req, state) => {
  const b = isObj(req.body) ? req.body : null;
  if (!b) return apiErr(req, state, 400, "BAD_REQUEST", "Request body is required");
  if (typeof b.invoiceLink !== "string" || !/^https?:\/\/[^\s]+$/i.test(b.invoiceLink)) return apiErr(req, state, 400, "BAD_REQUEST", "invoiceLink must be a valid URL");
  const pid = Number(b.shipmentPackageId);
  if (!Number.isInteger(pid) || pid <= 0) return apiErr(req, state, 400, "BAD_REQUEST", "shipmentPackageId is required");
  if (b.invoiceNumber !== undefined && b.invoiceNumber !== null && !INVOICE_NO.test(String(b.invoiceNumber))) return apiErr(req, state, 400, "BAD_REQUEST", "invoiceNumber must be 16 characters: 3 alphanumeric followed by 13 digits");
  if (b.invoiceDateTime !== undefined && b.invoiceDateTime !== null) {
    const d = Number(b.invoiceDateTime);
    if (!Number.isFinite(d) || d <= 0 || ![10, 13].includes(digits(d))) return apiErr(req, state, 400, "BAD_REQUEST", "invoiceDateTime must be greater than 0 and 10 digits (seconds) or 13 digits (milliseconds)");
  }
  const all = await loadInvoices(state);
  if (all.some((x) => x.shipmentPackageId === pid)) return apiErr(req, state, 409, "CONFLICT", "An invoice for the submitted ShipmentPackageId has already been fed");
  if (all.some((x) => x.invoiceLink === b.invoiceLink)) return apiErr(req, state, 409, "CONFLICT", "The submitted link has already been fed to another ShipmentPackageId");
  all.push({ shipmentPackageId: pid, invoiceLink: b.invoiceLink, invoiceDateTime: b.invoiceDateTime ?? null, invoiceNumber: b.invoiceNumber ?? null, kind: "link", customerId: null });
  await saveList(state, IK, all);
  return ok({}, 201);
};

const deleteInvoiceLink: MockHandler = async (req, state) => {
  const b = isObj(req.body) ? req.body : null;
  if (!b) return apiErr(req, state, 400, "BAD_REQUEST", "Request body is required");
  const pid = Number(b.serviceSourceId);
  if (!Number.isInteger(pid) || pid <= 0) return apiErr(req, state, 400, "BAD_REQUEST", "serviceSourceId is required");
  if (Number(b.channelId) !== 1) return apiErr(req, state, 400, "BAD_REQUEST", "channelId must always be 1");
  if (!Number.isFinite(Number(b.customerId))) return apiErr(req, state, 400, "BAD_REQUEST", "customerId is required");
  const all = await loadInvoices(state);
  const i = all.findIndex((x) => x.shipmentPackageId === pid && x.kind === "link");
  if (i < 0) return apiErr(req, state, 404, "NOT_FOUND", "Specified invoice link not found");
  all.splice(i, 1);
  await saveList(state, IK, all);
  return ok({}, 202);
};

const uploadInvoiceFile: MockHandler = async (req, state) => {
  const b = isObj(req.body) ? req.body : {};
  const pid = Number(b.shipmentPackageId);
  if (!Number.isInteger(pid) || pid <= 0) return apiErr(req, state, 400, "BAD_REQUEST", "shipmentPackageId is required");
  const f = b.file;
  if (!f) return apiErr(req, state, 400, "BAD_REQUEST", "File not sent. Please select the invoice file and try again");
  const name = typeof f === "string" ? f : isObj(f) && typeof f.name === "string" ? f.name : "";
  const mime = isObj(f) && typeof f.type === "string" ? f.type : "";
  const ext = /\.([A-Za-z0-9]+)$/.exec(name)?.[1]?.toLowerCase() ?? "";
  if ((mime && !["application/pdf", "image/jpeg", "image/png"].includes(mime)) || (!mime && ext && !["pdf", "jpg", "jpeg", "png"].includes(ext)))
    return apiErr(req, state, 400, "BAD_REQUEST", `File type (.${ext || mime}) is not supported. Supported file types: application/pdf, image/jpeg, image/png`);
  if (isObj(f) && Number(f.size) > 10 * 1024 * 1024) return apiErr(req, state, 400, "BAD_REQUEST", "File size cannot exceed 10 MB");
  if (b.invoiceNumber !== undefined && b.invoiceNumber !== null && b.invoiceNumber !== "" && !INVOICE_NO.test(String(b.invoiceNumber))) return apiErr(req, state, 400, "BAD_REQUEST", "invoiceNumber must be 16 characters: 3 alphanumeric followed by 13 digits");
  if (b.invoiceDateTime !== undefined && b.invoiceDateTime !== null && b.invoiceDateTime !== "") {
    const d = Number(b.invoiceDateTime);
    if (!Number.isFinite(d) || d <= 0 || ![10, 13].includes(digits(d))) return apiErr(req, state, 400, "BAD_REQUEST", "invoiceDateTime must be greater than 0 and 10 digits (seconds) or 13 digits (milliseconds)");
    if ((digits(d) === 10 ? d * 1000 : d) > state.now()) return apiErr(req, state, 400, "BAD_REQUEST", "A future-dated invoice cannot be added");
  }
  const all = await loadInvoices(state);
  if (all.some((x) => x.shipmentPackageId === pid)) return apiErr(req, state, 409, "CONFLICT", `The invoice for the package number ${pid} has already been sent`);
  all.push({ shipmentPackageId: pid, invoiceLink: null, fileName: name || "invoice", invoiceDateTime: b.invoiceDateTime ?? null, invoiceNumber: b.invoiceNumber ?? null, kind: "file", customerId: null });
  await saveList(state, IK, all);
  return ok({}, 201);
};

/* ═══════════════════════════ Seller information ═══════════════════════════ */
const getSuppliersAddresses: MockHandler = () => {
  const addr = (id: number, type: "Shipment" | "Invoice" | "Returning", city: string, cityCode: number, district: string, districtId: number, post: string, line: string, isDefault: boolean): Obj => ({
    id, addressType: type, country: "Türkiye", city, cityCode, district, districtId, postCode: post, address: line, isReturningAddress: type === "Returning", fullAddress: `${line} ${district}/${city}`,
    isShipmentAddress: type === "Shipment", isInvoiceAddress: type === "Invoice", isDefault,
  });
  const a = [
    addr(1001, "Shipment", "Kocaeli", 41, "Gebze", 4101, "41400", "Çayırova OSB Mah. Atölye Sk. No:12", true),
    addr(1002, "Invoice", "İstanbul", 34, "Kadıköy", 3401, "34710", "Caferağa Mah. Moda Cd. No:48 D:5", true),
    addr(1003, "Returning", "Bursa", 16, "Nilüfer", 1601, "16110", "Özlüce Mah. Depo Sk. No:7", true),
    addr(1004, "Returning", "İzmir", 35, "Bornova", 3501, "35040", "Kazımdirik Mah. Lojistik Cd. No:3", false),
  ];
  return ok({ supplierAddresses: a, defaultShipmentAddress: a[0], defaultInvoiceAddress: a[1], defaultReturningAddress: { present: true } });
};

/* ═══════════════════════════ Finance ═══════════════════════════ */
interface Finance { settlements: Obj[]; other: Obj[]; cargo: Record<string, Obj[]> }
const FK = "ty:finance";
const TR_LABEL: Record<string, string> = {
  Sale: "Satış", Return: "İade", Discount: "İndirim", Coupon: "Kupon", ProvisionPositive: "Provizyon (+)", CommissionNegative: "Komisyon (-)", CommissionPositive: "Komisyon (+)",
  PaymentOrder: "Ödeme", DeductionInvoices: "Kargo Faturası", Stoppage: "Stopaj", WireTransfer: "Havale/EFT", CashAdvance: "Nakit Avans", IncomingTransfer: "Gelen Transfer",
  ReturnInvoice: "İade Faturası", CommissionAgreementInvoice: "Komisyon Mutabakat Faturası", FinancialItem: "Finansal Kalem",
};
async function buildFinance(state: MockState): Promise<Finance> {
  const products = await loadProducts(state);
  const now = state.now();
  const settlements: Obj[] = [];
  let seq = 90000000;
  const row = (kind: string, o: Obj): Obj => ({
    kind, id: String(++seq), transactionDate: 0, barcode: null, transactionType: TR_LABEL[kind], receiptId: null, description: null, debt: 0, credit: 0, paymentPeriod: null, commissionRate: null, commissionAmount: null,
    commissionInvoiceSerialNumber: null, sellerRevenue: null, orderNumber: null, paymentOrderId: null, paymentDate: null, sellerId: 0, storeId: null, storeName: null, storeAddress: null, country: "Türkiye", orderDate: null, affiliate: "TRENDYOLTR", shipmentPackageId: null, ...o,
  });
  const orders: { order: string; pid: number; dayAgo: number }[] = [];
  for (let i = 0; i < 16; i++) {
    const p = products[i % products.length]!;
    const qty = 1 + (i % 3), dayAgo = 1 + i * 1.7;
    const order = `10${7000000 + i * 37}`;
    const credit = round2(p.salePrice * qty), rate = [15, 18, 12, 20][i % 4]!, commission = round2(credit * rate / 100), revenue = round2(credit - commission);
    const date = Math.round(now - dayAgo * DAY), pid = dayAgo > 10 ? 5000 + Math.floor(dayAgo / 7) : null, pdate = pid ? date + 7 * DAY : null;
    const common = { transactionDate: date, barcode: p.barcode, orderNumber: order, orderDate: date - 3 * DAY, shipmentPackageId: 700000 + i, receiptId: 330000 + i, paymentPeriod: 30, paymentOrderId: pid, paymentDate: pdate };
    orders.push({ order, pid: 700000 + i, dayAgo });
    settlements.push(row("Sale", { ...common, description: `${p.title} x${qty}`, credit, commissionRate: rate, commissionAmount: commission, sellerRevenue: revenue }));
    settlements.push(row("CommissionNegative", { ...common, description: `Komisyon %${rate}`, debt: commission, commissionRate: rate, commissionAmount: commission, sellerRevenue: revenue }));
    if (i % 3 === 0 && dayAgo > 4) {
      const rd = date + 3 * DAY;
      settlements.push(row("Return", { ...common, transactionDate: rd, description: `İade: ${p.title} x${qty}`, debt: credit, commissionRate: rate, commissionAmount: commission, sellerRevenue: revenue }));
      settlements.push(row("CommissionPositive", { ...common, transactionDate: rd, description: `Komisyon iadesi %${rate}`, credit: commission, commissionRate: rate, commissionAmount: commission, sellerRevenue: revenue }));
    }
    if (i % 4 === 1) settlements.push(row("Discount", { ...common, description: "Satıcı kaynaklı indirim", debt: round2(credit * 0.05) }));
    if (i % 5 === 2) settlements.push(row("Coupon", { ...common, description: "Satıcı kuponu", debt: 25 }));
  }
  settlements.push(row("ProvisionPositive", { transactionDate: now - 2 * DAY, description: "Provizyon", credit: 150, orderNumber: "10" + 7000000 }));
  settlements.push(row("ProvisionPositive", { transactionDate: now - 9 * DAY, description: "Provizyon", credit: 90, orderNumber: "10" + 7000111 }));
  settlements.sort((a, b) => b.transactionDate - a.transactionDate);

  // cargo invoices (two) built from the sale orders
  const cargo: Record<string, Obj[]> = {};
  const invs = [{ serial: "DDF2026000123456", dayAgo: 6, from: 0, n: 12 }, { serial: "DDF2026000098765", dayAgo: 20, from: 4, n: 8 }];
  const other: Obj[] = [];
  for (const inv of invs) {
    cargo[inv.serial] = Array.from({ length: inv.n }, (_, k) => {
      const o = orders[(inv.from + k) % orders.length]!;
      const isReturn = k % 4 === 3;
      return { shipmentPackageType: isReturn ? "İade Kargo Bedeli" : "Gönderi Kargo Bedeli", parcelUniqueId: 7260001151141191 + (inv.from + k) * 17, orderNumber: o.order, amount: round2(29.9 + (k % 4) * 2.5), desi: 1 + (k % 4) };
    });
    const total = round2(cargo[inv.serial]!.reduce((s, x) => s + x.amount, 0));
    other.push(row("DeductionInvoices", { id: inv.serial, transactionDate: Math.round(now - inv.dayAgo * DAY), description: "Kargo faturası", debt: total, receiptId: 880000 + inv.dayAgo }));
  }
  // payment orders: net of sales, returns, discounts, coupons that carry the same paymentOrderId
  const byPay = new Map<number, number>();
  for (const s of settlements) {
    if (!s.paymentOrderId) continue;
    const delta = s.kind === "Sale" ? s.sellerRevenue : s.kind === "Return" ? -s.sellerRevenue : s.kind === "Discount" || s.kind === "Coupon" ? -s.debt : 0;
    byPay.set(s.paymentOrderId, round2((byPay.get(s.paymentOrderId) ?? 0) + delta));
  }
  for (const [pid, net] of byPay) other.push(row("PaymentOrder", { id: String(pid), transactionDate: now - Math.max(1, (pid - 4990) * 2) * DAY, description: `Ödeme emri #${pid}`, credit: net > 0 ? net : 0, debt: net < 0 ? -net : 0, paymentOrderId: pid, paymentDate: now - Math.max(1, (pid - 4990) * 2) * DAY }));
  other.push(row("Stoppage", { transactionDate: now - 3 * DAY, description: "Stopaj kesintisi", debt: 42.5 }));
  other.push(row("Stoppage", { transactionDate: now - 12 * DAY, description: "Stopaj kesintisi", debt: 61.8 }));
  other.push(row("WireTransfer", { transactionDate: now - 5 * DAY, description: "Havale/EFT ödemesi", debt: 1500 }));
  other.push(row("IncomingTransfer", { transactionDate: now - 8 * DAY, description: "Gelen transfer", credit: 320 }));
  other.push(row("CommissionAgreementInvoice", { transactionDate: now - 15 * DAY, description: "Komisyon mutabakat faturası", debt: 210.4 }));
  other.push(row("ReturnInvoice", { transactionDate: now - 7 * DAY, description: "İade faturası", debt: 120 }));
  other.push(row("CashAdvance", { transactionDate: now - 18 * DAY, description: "Nakit avans", credit: 1000 }));
  other.push(row("FinancialItem", { transactionDate: now - 10 * DAY, description: "Finansal düzeltme", credit: 15 }));
  other.sort((a, b) => b.transactionDate - a.transactionDate);
  return { settlements, other, cargo };
}
async function loadFinance(state: MockState): Promise<Finance> {
  let f = await state.get<Finance>(FK);
  if (!f) { f = await buildFinance(state); await state.set(FK, f); }
  return f;
}
const outRow = (r: Obj, sellerId: string): Obj => { const { kind: _k, ...rest } = r; void _k; return { ...rest, sellerId: Number(sellerId) || 0 }; };

const SETTLEMENT_TYPES = ["Sale", "Return", "Discount", "DiscountCancel", "Coupon", "CouponCancel", "ProvisionPositive", "ProvisionNegative", "ManuelRefund", "ManualRefundCancel", "TYDiscount", "TYDiscountCancel", "TYCoupon", "TYCouponCancel", "SellerRevenuePositive", "SellerRevenueNegative", "CommissionPositive", "CommissionNegative", "SellerRevenuePositiveCancel", "SellerRevenueNegativeCancel", "CommissionPositiveCancel", "CommissionNegativeCancel"];
const OTHER_TYPES = ["Stoppage", "CashAdvance", "WireTransfer", "IncomingTransfer", "ReturnInvoice", "CommissionAgreementInvoice", "PaymentOrder", "DeductionInvoices", "FinancialItem"];
function financeHandler(pick: (f: Finance) => Obj[], types: string[]): MockHandler {
  return async (req, state) => {
    const type = req.query.transactionType ? String(req.query.transactionType) : "";
    if (!type) return finErr(400, "Bad Request", "transactionType is required");
    if (!types.includes(type)) return finErr(400, "Bad Request", `Unknown transactionType: ${type}`);
    const from = Number(req.query.startDate), to = Number(req.query.endDate);
    if (!req.query.startDate || !req.query.endDate || !Number.isFinite(from) || !Number.isFinite(to)) return finErr(400, "Bad Request", "startDate and endDate are required (timestamps in milliseconds)");
    if (to < from) return finErr(400, "Bad Request", "endDate must be after startDate");
    if (to - from > 15 * DAY) return finErr(400, "Bad Request", "The interval between startDate and endDate cannot be longer than 15 days");
    const page = num(req.query.page, 0), size = num(req.query.size, 500);
    if (!Number.isInteger(page) || page < 0) return finErr(400, "Bad Request", "page must be a non-negative integer");
    if (size !== 500 && size !== 1000) return finErr(400, "Bad Request", "size can take values of 500 or 1000");
    const po = req.query.paymentOrderId ? Number(req.query.paymentOrderId) : null;
    const rows = pick(await loadFinance(state)).filter((r) => r.kind === type && r.transactionDate >= from && r.transactionDate <= to && (po === null || r.paymentOrderId === po)).map((r) => outRow(r, req.sellerId));
    return ok(pageOf(rows, page, size));
  };
}
const getSettlements = financeHandler((f) => f.settlements, SETTLEMENT_TYPES);
const getOtherFinancials = financeHandler((f) => f.other, OTHER_TYPES);

const getCargoInvoiceItems: MockHandler = async (req, state) => {
  const f = await loadFinance(state);
  const items = f.cargo[String(req.path.invoiceSerialNumber)];
  if (!items) return finErr(404, "Not Found", `Cargo invoice not found: ${req.path.invoiceSerialNumber}`);
  const page = num(req.query.page, 0), size = num(req.query.size, 500);
  if (!Number.isInteger(page) || page < 0 || !Number.isInteger(size) || size < 1) return finErr(400, "Bad Request", "page/size are invalid");
  return ok(pageOf(items, page, size));
};

/* ═══════════════════════════ Trendyol Express ═══════════════════════════ */
const getCompensationTickets: MockHandler = async (req, state) => {
  const now = state.now();
  const all = await loadList<Obj>(state, "ty:compensation", () => {
    const t = (n: number, ageD: number, reason: string, st: string, msg: string, items: Obj[], total: number | ""): Obj => ({
      cargoProvider: "TEX", compensateReason: reason, createDate: now - ageD * DAY, currentState: st, deliveryNumber: `733${pad(1000000000000 + n * 7919, 13)}`, itemDetails: items,
      orderNumber: `10${7000000 + n * 37}`, requestedBy: "TEX", stateMessage: msg, totalItemsAmount: total,
    });
    return [
      t(1, 2, "Kayıp", "CreateCompensationTicket", "Tazmin talebiniz inceleniyor", [], ""),
      t(2, 6, "Hasarlı", "MarkInCompensation", "Tazmin talebiniz inceleniyor", [{ amount: 384, itemCode: "8680000000011", count: 1, name: "Seramik Vazo - S" }], 384),
      t(3, 11, "Kayıp", "CompensationApproved", "Tazmin talebiniz onaylandı. Tutar en geç 15 iş günü içinde faturalanacak ürünler sayfasına aktarılacaktır.", [{ amount: 959, itemCode: "8680000000041", count: 1, name: "Ahşap Duvar Rafı - 90 cm" }], 959),
      t(4, 18, "Kayıp", "FoundInCompensation", "Gönderiniz bulundu ve size iade edilecektir.", [], ""),
      t(5, 25, "Hasarlı", "CompensationRejected", "Tazmin talebiniz yapılan inceleme sonucunda reddedilmiştir.", [{ amount: 269, itemCode: "8680000000021", count: 1, name: "Keten Yastık - Krem" }], 269),
      t(6, 33, "Kayıp", "NotCompensationCase", "Tazmin talebiniz yapılan inceleme sonucunda reddedilmiştir.", [], ""),
    ];
  });
  const page = num(req.query.page, 0), size = num(req.query.size, 10);
  if (!Number.isInteger(page) || page < 0) return tyErr(400, "page.invalid", "page must be a non-negative integer");
  if (!Number.isInteger(size) || size < 1 || size > 100) return tyErr(400, "size.invalid", "size must be between 1 and 100");
  const from = num(req.query.startDate, 0), to = num(req.query.endDate, Infinity);
  const rows = all.filter((x) => x.createDate >= from && x.createDate <= to).sort((a, b) => b.createDate - a.createDate);
  return ok({ data: rows.slice(page * size, page * size + size), totalCount: rows.length });
};

/* ═══════════════════════════ Webhooks ═══════════════════════════ */
const WK = "ty:webhooks";
const WEBHOOK_STATUSES = ["CREATED", "PICKING", "INVOICED", "SHIPPED", "CANCELLED", "DELIVERED", "UNDELIVERED", "RETURNED", "UNSUPPLIED", "AWAITING", "UNPACKED", "AT_COLLECTION_POINT", "VERIFIED"];
const loadWebhooks = (state: MockState) => loadList<Obj>(state, WK, () => [
  { id: "5297c986-6e09-4615-9f16-0deff65a0890", createdDate: state.now() - 30 * DAY, lastModifiedDate: state.now() - 20 * DAY, url: "https://testwebhook1.com", username: "test1", authenticationType: "BASIC_AUTHENTICATION", status: "PASSIVE", subscribedStatuses: ["CREATED", "CANCELLED", "SHIPPED", "DELIVERED", "UNPACKED"], hasPassword: true, hasApiKey: false },
  { id: "4f9429b9-ef13-4d7c-94cf-9eee3ce7273a", createdDate: state.now() - 20 * DAY, lastModifiedDate: state.now() - 19 * DAY, url: "https://testwebhook2.com", username: "test2", authenticationType: "API_KEY", status: "PASSIVE", subscribedStatuses: null, hasPassword: false, hasApiKey: true },
  { id: "2ba10e5d-5176-416b-9770-5d9c85a81a5e", createdDate: state.now() - 10 * DAY, lastModifiedDate: null, url: "https://testwebhook3.com", username: "test3", authenticationType: "API_KEY", status: "ACTIVE", subscribedStatuses: ["CREATED", "PICKING"], hasPassword: false, hasApiKey: true },
]);
/** Public (masked) view: never contains a secret, only `********` placeholders when one is set. */
const maskWebhook = (w: Obj): Obj => {
  const { hasPassword, hasApiKey, ...rest } = w;
  return { ...rest, ...(hasPassword ? { password: MASK } : {}), ...(hasApiKey ? { apiKey: MASK } : {}) };
};
/** Validates a create/update body; returns the new stored fields or an error response. */
function webhookFields(b: unknown, prev?: Obj): Obj | MockResponse {
  if (!isObj(b)) return tyErr(400, "body.invalid", "Request body is required");
  const url = typeof b.url === "string" ? b.url.trim() : "";
  if (!url) return tyErr(400, "url.required", "url is required");
  let parsed: URL;
  try { parsed = new URL(url); } catch { return tyErr(400, "url.invalid", "url must be a valid http(s) address"); }
  if (!/^https?:$/.test(parsed.protocol)) return tyErr(400, "url.invalid", "url must be a valid http(s) address");
  if (/trendyol|dolap|localhost/i.test(url)) return tyErr(400, "url.forbidden", "The webhook endpoint must not contain 'Trendyol', 'Dolap' or 'localhost'");
  const auth = b.authenticationType;
  if (auth !== "BASIC_AUTHENTICATION" && auth !== "API_KEY") return tyErr(400, "authenticationType.invalid", "authenticationType must be BASIC_AUTHENTICATION or API_KEY");
  const hasPassword = typeof b.password === "string" && b.password !== "" ? true : !!prev?.hasPassword;
  const hasApiKey = typeof b.apiKey === "string" && b.apiKey !== "" ? true : !!prev?.hasApiKey;
  const username = typeof b.username === "string" && b.username ? b.username : (auth === "BASIC_AUTHENTICATION" ? (prev?.username ?? "") : "");
  if (auth === "API_KEY" && !hasApiKey) return tyErr(400, "apiKey.required", "apiKey is required when authenticationType is API_KEY");
  if (auth === "BASIC_AUTHENTICATION" && (!username || !hasPassword)) return tyErr(400, "credentials.required", "username and password are required when authenticationType is BASIC_AUTHENTICATION");
  let statuses: string[] | null = null;
  if (b.subscribedStatuses !== undefined && b.subscribedStatuses !== null) {
    if (!Array.isArray(b.subscribedStatuses)) return tyErr(400, "subscribedStatuses.invalid", "subscribedStatuses must be an array");
    const bad = (b.subscribedStatuses as unknown[]).find((s) => !WEBHOOK_STATUSES.includes(String(s)));
    if (bad !== undefined) return tyErr(400, "subscribedStatuses.invalid", `Unknown status: ${String(bad)}`);
    statuses = [...new Set((b.subscribedStatuses as unknown[]).map(String))];
  }
  return { url, authenticationType: auth, username, subscribedStatuses: statuses && statuses.length ? statuses : [...WEBHOOK_STATUSES], hasPassword: auth === "BASIC_AUTHENTICATION" ? hasPassword : false, hasApiKey: auth === "API_KEY" ? hasApiKey : false };
}
const isResp = (v: Obj | MockResponse): v is MockResponse => typeof (v as MockResponse).status === "number" && "body" in v;

const createWebhook: MockHandler = async (req, state) => {
  const all = await loadWebhooks(state);
  const f = webhookFields(req.body);
  if (isResp(f)) return f;
  if (all.length >= 15) return tyErr(400, "webhook.limit", "The maximum number of webhooks that can be created for a seller is 15 (deactivated webhooks are included)");
  const n = await state.nextId("ty:webhook");
  const w: Obj = { id: `7e57ab1e-0000-4000-8000-${pad(n, 12)}`, createdDate: state.now(), lastModifiedDate: null, status: "ACTIVE", ...f };
  all.push(w);
  await saveList(state, WK, all);
  return ok({ id: w.id });
};
const getWebhooks: MockHandler = async (_req, state) => ok((await loadWebhooks(state)).map(maskWebhook));
const withWebhook = (fn: (w: Obj, all: Obj[], req: MockRequest, state: MockState) => MockResponse | Promise<MockResponse>): MockHandler => async (req, state) => {
  const all = await loadWebhooks(state);
  const w = all.find((x) => x.id === String(req.path.Id));
  if (!w) return tyErr(404, "webhook.notFound", `Webhook not found: ${req.path.Id}`);
  const res = await fn(w, all, req, state);
  if (res.status < 300) await saveList(state, WK, all);
  return res;
};
const updateWebhook = withWebhook((w, _all, req, state) => {
  const f = webhookFields(req.body, w);
  if (isResp(f)) return f;
  Object.assign(w, f, { lastModifiedDate: state.now() });
  return ok("OK");
});
const deleteWebhook = withWebhook((w, all) => { all.splice(all.indexOf(w), 1); return ok("OK"); });
const activateWebhook = withWebhook((w, _a, _r, state) => { w.status = "ACTIVE"; w.lastModifiedDate = state.now(); return ok("OK"); });
const deactivateWebhook = withWebhook((w, _a, _r, state) => { w.status = "PASSIVE"; w.lastModifiedDate = state.now(); return ok("OK"); });

export const mockHandlers: Record<string, MockHandler> = {
  getClaims, createClaim, approveClaimLineItems, createClaimIssue, getClaimIssueReasons, getClaimItemAudits, updateTestClaimToWaitingInAction,
  getQuestionFilter, getQuestion, answerQuestion, createQuestion,
  sendInvoiceLink, deleteInvoiceLink, uploadInvoiceFile,
  getSuppliersAddresses, getSettlements, getOtherFinancials, getCargoInvoiceItems, getCompensationTickets,
  createWebhook, getWebhooks, updateWebhook, deleteWebhook, activateWebhook, deactivateWebhook,
};

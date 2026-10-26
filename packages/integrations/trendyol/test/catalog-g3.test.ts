import { describe, it, expect } from "vitest";
import type { MockRequest, MockState, TrendyolOperation } from "@openshelf/shared";
import { operations } from "../src/catalog/ops/claims";
import { mockHandlers } from "../src/catalog/mock/claims";

const NOW = Date.UTC(2026, 9, 20, 12, 0, 0);
const DAY = 86_400_000;
function memState(): MockState {
  const m = new Map<string, unknown>(), c = new Map<string, number>();
  return {
    async get<T>(k: string) { const v = m.get(k); return v === undefined ? undefined : (JSON.parse(JSON.stringify(v)) as T); },
    async set(k, v) { m.set(k, JSON.parse(JSON.stringify(v))); },
    async nextId(ns) { const n = (c.get(ns) ?? 0) + 1; c.set(ns, n); return n; },
    now: () => NOW,
  };
}
async function call(state: MockState, id: string, o: { path?: Record<string, string | number>; query?: Record<string, unknown>; body?: unknown } = {}) {
  const op = operations.find((x) => x.id === id) as TrendyolOperation;
  const req: MockRequest = { op, sellerId: "12345", env: "production", path: o.path ?? {}, query: o.query ?? {}, body: o.body };
  const r = await mockHandlers[id]!(req, state);
  return { status: r.status, body: r.body as any };
}

describe("catalog structure (group 3)", () => {
  it("has the expected operations", () => {
    expect(operations.length).toBeGreaterThanOrEqual(25);
    expect(new Set(operations.map((o) => o.id)).size).toBe(operations.length);
  });
  for (const op of operations) {
    describe(op.id, () => {
      it("is well formed", () => {
        expect(op.docsUrl).toMatch(/^https:\/\/developers\.trendyol\.com\/v2\.0\//);
        expect(["GET", "POST", "PUT", "DELETE", "PATCH"]).toContain(op.method);
        expect(op.path.startsWith("/integration/")).toBe(true);
        const declared = new Set(op.params.filter((p) => p.in === "path").map((p) => p.name));
        for (const m of op.path.matchAll(/\{(\w+)\}/g)) expect(m[1] === "sellerId" || declared.has(m[1]!)).toBe(true);
        for (const d of declared) expect(op.path).toContain(`{${d}}`);
        const names = op.params.map((p) => `${p.in}:${p.name}`);
        expect(new Set(names).size).toBe(names.length);
        expect(op.params.find((p) => p.name === "sellerId")).toBeUndefined();
        expect(() => JSON.stringify(op.body.example)).not.toThrow();
        if (op.body.kind === "multipart") expect(op.body.file).toBeTruthy();
        for (const t of [op.title, op.summary, op.notes ?? op.title]) { expect(t.tr.length).toBeGreaterThan(0); expect(t.en.length).toBeGreaterThan(0); }
        expect(["read", "write", "destructive"]).toContain(op.risk);
        if (op.method === "GET") expect(op.risk).toBe("read");
        expect(mockHandlers[op.id]).toBeTypeOf("function");
      });
    });
  }
  it("marks irreversible operations destructive", () => {
    for (const id of ["approveClaimLineItems", "deleteInvoiceLink", "deleteWebhook"]) expect(operations.find((o) => o.id === id)!.risk).toBe("destructive");
  });
});

describe("claims flow", () => {
  it("lists, approves and tracks audit", async () => {
    const s = memState();
    const list = await call(s, "getClaims", { query: { claimItemStatus: "WaitingInAction" } });
    expect(list.status).toBe(200);
    expect(list.body.content.length).toBeGreaterThanOrEqual(3);
    const claim = list.body.content[0];
    const item = claim.items[0].claimItems[0];
    const ok = await call(s, "approveClaimLineItems", { path: { claimId: claim.id }, body: { claimLineItemIdList: [item.id], params: {} } });
    expect(ok.status).toBe(200);
    const after = await call(s, "getClaims", { query: { claimIds: claim.id } });
    expect(after.body.content[0].items[0].claimItems[0].claimItemStatus.name).toBe("Accepted");
    const audit = await call(s, "getClaimItemAudits", { path: { claimItemsId: item.id } });
    expect(audit.body.at(-1).newStatus).toBe("Accepted");
    // approving again is a 400
    const again = await call(s, "approveClaimLineItems", { path: { claimId: claim.id }, body: { claimLineItemIdList: [item.id] } });
    expect(again.status).toBe(400);
    expect(again.body.errors[0].message).toMatch(/WaitingInAction/);
  });
  it("rejects approving non-waiting claims and empty lists", async () => {
    const s = memState();
    const created = (await call(s, "getClaims", { query: { claimItemStatus: "Created" } })).body.content[0];
    const r = await call(s, "approveClaimLineItems", { path: { claimId: created.id }, body: { claimLineItemIdList: [created.items[0].claimItems[0].id] } });
    expect(r.status).toBe(400);
    expect((await call(s, "approveClaimLineItems", { path: { claimId: created.id }, body: { claimLineItemIdList: [] } })).status).toBe(400);
  });
  it("reject needs a valid reason, description and waiting state", async () => {
    const s = memState();
    const waiting = (await call(s, "getClaims", { query: { claimItemStatus: "WaitingInAction", size: 50 } })).body.content.find((c: any) => c.orderNumber === "1058412377");
    const id = waiting.items[0].claimItems[0].id;
    const base = { path: { claimId: waiting.id } };
    expect((await call(s, "createClaimIssue", { ...base, query: { claimIssueReasonId: 99999, claimItemIdList: id, description: "x" } })).status).toBe(400);
    expect((await call(s, "createClaimIssue", { ...base, query: { claimIssueReasonId: 201, claimItemIdList: id, description: "x".repeat(501) } })).status).toBe(400);
    expect((await call(s, "createClaimIssue", { ...base, query: { claimIssueReasonId: 201, claimItemIdList: id, description: "Yanlış ürün" }, body: { note: "no file" } })).status).toBe(400);
    const good = await call(s, "createClaimIssue", { ...base, query: { claimIssueReasonId: 201, claimItemIdList: id, description: "Yanlış ürün geldi" }, body: { files: { name: "kanit.pdf" } } });
    expect(good.status).toBe(200);
    const st = (await call(s, "getClaims", { query: { claimIds: waiting.id } })).body.content[0].items[0].claimItems[0].claimItemStatus.name;
    expect(st).toBe("Unresolved");
    // not waiting any more
    expect((await call(s, "createClaimIssue", { ...base, query: { claimIssueReasonId: 451, claimItemIdList: id, description: "tekrar" } })).status).toBe(400);
    const reasons = await call(s, "getClaimIssueReasons");
    expect(reasons.body.some((r: any) => r.id === 2101)).toBe(true);
  });
  it("blocks reason 1651 within 24h of WaitingInAction", async () => {
    const s = memState();
    const fresh = (await call(s, "getClaims", { query: { claimItemStatus: "WaitingInAction" } })).body.content.find((c: any) => c.orderNumber === "1058412301");
    const r = await call(s, "createClaimIssue", { path: { claimId: fresh.id }, query: { claimIssueReasonId: 1651, claimItemIdList: fresh.items[0].claimItems[0].id, description: "Paket gelmedi" } });
    expect(r.status).toBe(400);
  });
  it("creates a claim for a known barcode and rejects unknown ones", async () => {
    const s = memState();
    const body = { claimItems: [{ barcode: "8680000000011", customerNote: "n", quantity: 2, reasonId: 401 }], customerId: 1, orderNumber: "999", shipmentCompanyId: 4 };
    const r = await call(s, "createClaim", { body });
    expect(r.status).toBe(200);
    expect(r.body.claimItemIds).toHaveLength(2);
    const got = await call(s, "getClaims", { query: { claimIds: r.body.claimId } });
    expect(got.body.content[0].items[0].claimItems[0].claimItemStatus.name).toBe("Created");
    expect((await call(s, "createClaim", { body: { ...body, claimItems: [{ barcode: "nope", quantity: 1, reasonId: 401 }] } })).status).toBe(400);
    // stage helper moves Created -> WaitingInAction
    const pkg = got.body.content[0].orderShipmentPackageId;
    expect((await call(s, "updateTestClaimToWaitingInAction", { body: { shipmentPackageId: pkg } })).status).toBe(200);
    expect((await call(s, "getClaims", { query: { claimIds: r.body.claimId } })).body.content[0].items[0].claimItems[0].claimItemStatus.name).toBe("WaitingInAction");
  });
});

describe("questions flow", () => {
  it("answer -> ANSWERED, validates length and state", async () => {
    const s = memState();
    const waiting = await call(s, "getQuestionFilter", { query: { status: "WAITING_FOR_ANSWER" } });
    expect(waiting.body.content.length).toBe(5);
    const id = waiting.body.content[0].id;
    expect((await call(s, "answerQuestion", { path: { id }, body: { text: "kısa" } })).status).toBe(400);
    expect((await call(s, "answerQuestion", { path: { id }, body: { text: "" } })).status).toBe(400);
    expect((await call(s, "answerQuestion", { path: { id }, body: { text: "a".repeat(2001) } })).status).toBe(400);
    const ok = await call(s, "answerQuestion", { path: { id }, body: { text: "Merhaba, ürünümüz su geçirmez ve sırlıdır." } });
    expect(ok.status).toBe(200);
    expect((await call(s, "getQuestion", { path: { id } })).body.status).toBe("ANSWERED");
    expect((await call(s, "answerQuestion", { path: { id }, body: { text: "Tekrar cevap deneniyor, olmaz." } })).status).toBe(400);
    expect((await call(s, "getQuestionFilter", { query: { status: "WAITING_FOR_ANSWER" } })).body.totalElements).toBe(4);
    expect((await call(s, "getQuestion", { path: { id: 42 } })).status).toBe(404);
  });
  it("filters by barcode and enforces date range", async () => {
    const s = memState();
    const r = await call(s, "getQuestionFilter", { query: { barcode: "8680000000041" } });
    expect(r.body.content.every((q: any) => q.productMainId === "DEMO-AHSAP-RAF")).toBe(true);
    expect((await call(s, "getQuestionFilter", { query: { startDate: NOW - 30 * DAY, endDate: NOW } })).status).toBe(400);
  });
  it("creates a stage question", async () => {
    const s = memState();
    const r = await call(s, "createQuestion", { body: { text: "Pamuklu mu?", contentId: 100000, userId: 4147346, showUserName: false } });
    expect(r.status).toBe(200);
    expect((await call(s, "getQuestion", { path: { id: r.body.questionId } })).body.status).toBe("WAITING_FOR_ANSWER");
    expect((await call(s, "createQuestion", { body: { text: "", contentId: 1, userId: 1, showUserName: true } })).status).toBe(400);
  });
});

describe("invoices", () => {
  it("link lifecycle with conflicts", async () => {
    const s = memState();
    const b = { invoiceLink: "https://x.example.com/inv.pdf", shipmentPackageId: 555, invoiceDateTime: 1678788898, invoiceNumber: "TY41234567890123" };
    expect((await call(s, "sendInvoiceLink", { body: b })).status).toBe(201);
    const dup = await call(s, "sendInvoiceLink", { body: b });
    expect(dup.status).toBe(409);
    expect(dup.body.error).toBe("CONFLICT");
    expect((await call(s, "sendInvoiceLink", { body: { ...b, shipmentPackageId: 556, invoiceNumber: "bad" } })).status).toBe(400);
    expect((await call(s, "deleteInvoiceLink", { body: { serviceSourceId: 555, channelId: 1, customerId: 9 } })).status).toBe(202);
    expect((await call(s, "deleteInvoiceLink", { body: { serviceSourceId: 555, channelId: 1, customerId: 9 } })).status).toBe(404);
    expect((await call(s, "sendInvoiceLink", { body: b })).status).toBe(201);
  });
  it("file upload validations", async () => {
    const s = memState();
    expect((await call(s, "uploadInvoiceFile", { body: { shipmentPackageId: 700 } })).status).toBe(400);
    expect((await call(s, "uploadInvoiceFile", { body: { shipmentPackageId: 700, file: { name: "a.txt", type: "text/plain" } } })).status).toBe(400);
    expect((await call(s, "uploadInvoiceFile", { body: { shipmentPackageId: 700, file: { name: "a.pdf", type: "application/pdf" }, invoiceDateTime: Math.floor(NOW / 1000) + 10 * DAY / 1000 } })).status).toBe(400);
    expect((await call(s, "uploadInvoiceFile", { body: { shipmentPackageId: 700, file: { name: "a.pdf", type: "application/pdf" } } })).status).toBe(201);
    expect((await call(s, "uploadInvoiceFile", { body: { shipmentPackageId: 700, file: { name: "a.pdf", type: "application/pdf" } } })).status).toBe(409);
  });
});

describe("seller + express", () => {
  it("returns typed addresses", async () => {
    const r = await call(memState(), "getSuppliersAddresses");
    expect(r.body.supplierAddresses.map((a: any) => a.addressType)).toEqual(["Shipment", "Invoice", "Returning", "Returning"]);
    expect(r.body.defaultReturningAddress.present).toBe(true);
  });
  it("lists compensation tickets with paging", async () => {
    const s = memState();
    const r = await call(s, "getCompensationTickets", { query: { size: 4 } });
    expect(r.body.totalCount).toBe(6);
    expect(r.body.data).toHaveLength(4);
    expect(r.body.data[0].createDate).toBeGreaterThan(r.body.data[1].createDate);
    expect((await call(s, "getCompensationTickets", { query: { size: 500 } })).status).toBe(400);
  });
});

describe("finance", () => {
  const win = (days: number) => ({ startDate: NOW - days * DAY, endDate: NOW });
  it("filters by type and date, validates window and size", async () => {
    const s = memState();
    const sales = await call(s, "getSettlements", { query: { transactionType: "Sale", ...win(15) } });
    expect(sales.status).toBe(200);
    expect(sales.body.content.length).toBeGreaterThan(4);
    for (const r of sales.body.content) {
      expect(r.transactionType).toBe("Satış");
      expect(r.sellerRevenue).toBeCloseTo(r.credit - r.commissionAmount, 2);
      expect(r.kind).toBeUndefined();
    }
    const old = await call(s, "getSettlements", { query: { transactionType: "Sale", startDate: NOW - 30 * DAY, endDate: NOW - 15 * DAY } });
    expect(old.body.content.length).toBeGreaterThan(0);
    expect((await call(s, "getSettlements", { query: { transactionType: "Sale", ...win(20) } })).status).toBe(400);
    expect((await call(s, "getSettlements", { query: { transactionType: "Sale" } })).status).toBe(400);
    expect((await call(s, "getSettlements", { query: { transactionType: "Nope", ...win(5) } })).status).toBe(400);
    expect((await call(s, "getSettlements", { query: { transactionType: "Sale", ...win(5), size: 100 } })).status).toBe(400);
    const p0 = await call(s, "getSettlements", { query: { transactionType: "CommissionNegative", ...win(15), size: 500 } });
    expect(p0.body.totalElements).toBe(p0.body.content.length);
    expect((await call(s, "getSettlements", { query: { transactionType: "CommissionNegative", ...win(15), page: 5 } })).body.content).toHaveLength(0);
  });
  it("links deduction invoices to cargo invoice items", async () => {
    const s = memState();
    const other = await call(s, "getOtherFinancials", { query: { transactionType: "DeductionInvoices", startDate: NOW - 14 * DAY, endDate: NOW } });
    const row = other.body.content.find((r: any) => r.transactionType === "Kargo Faturası");
    expect(row).toBeTruthy();
    const items = await call(s, "getCargoInvoiceItems", { path: { invoiceSerialNumber: row.id } });
    expect(items.status).toBe(200);
    const total = items.body.content.reduce((a: number, x: any) => a + x.amount, 0);
    expect(total).toBeCloseTo(row.debt, 2);
    expect((await call(s, "getCargoInvoiceItems", { path: { invoiceSerialNumber: "NOPE" } })).status).toBe(404);
    const pay = await call(s, "getOtherFinancials", { query: { transactionType: "PaymentOrder", startDate: NOW - 15 * DAY, endDate: NOW } });
    expect(pay.status).toBe(200);
  });
});

describe("webhooks lifecycle", () => {
  it("create / list / update / deactivate / activate / delete with masked secrets", async () => {
    const s = memState();
    const secret = "S3CRET-PASSWORD-123", key = "API-KEY-SECRET-999";
    const created = await call(s, "createWebhook", { body: { url: "https://hooks.example.com/ty", username: "u", password: secret, authenticationType: "BASIC_AUTHENTICATION" } });
    expect(created.status).toBe(200);
    const id = created.body.id as string;
    let list = await call(s, "getWebhooks");
    expect(list.body).toHaveLength(4);
    const mine = list.body.find((w: any) => w.id === id);
    expect(mine.status).toBe("ACTIVE");
    expect(mine.subscribedStatuses).toHaveLength(13);
    expect(JSON.stringify(list.body)).not.toContain(secret);
    expect(mine.password).toBe("********");
    const upd = await call(s, "updateWebhook", { path: { Id: id }, body: { url: "https://hooks.example.com/ty2", authenticationType: "API_KEY", apiKey: key, subscribedStatuses: ["CREATED"] } });
    expect(upd.status).toBe(200);
    list = await call(s, "getWebhooks");
    expect(JSON.stringify(list.body)).not.toContain(key);
    expect(list.body.find((w: any) => w.id === id)).toMatchObject({ url: "https://hooks.example.com/ty2", authenticationType: "API_KEY", subscribedStatuses: ["CREATED"], apiKey: "********" });
    expect(JSON.stringify(await s.get("ty:webhooks"))).not.toContain(key);
    await call(s, "deactivateWebhook", { path: { Id: id } });
    expect((await call(s, "getWebhooks")).body.find((w: any) => w.id === id).status).toBe("PASSIVE");
    await call(s, "activateWebhook", { path: { Id: id } });
    expect((await call(s, "getWebhooks")).body.find((w: any) => w.id === id).status).toBe("ACTIVE");
    expect((await call(s, "deleteWebhook", { path: { Id: id } })).status).toBe(200);
    expect((await call(s, "deleteWebhook", { path: { Id: id } })).status).toBe(404);
    expect((await call(s, "getWebhooks")).body).toHaveLength(3);
  });
  it("validates url, auth type and quota", async () => {
    const s = memState();
    const bad = (b: object) => call(s, "createWebhook", { body: b }).then((r) => r.status);
    expect(await bad({ url: "https://trendyol-hook.com", authenticationType: "API_KEY", apiKey: "k" })).toBe(400);
    expect(await bad({ url: "http://localhost:3000", authenticationType: "API_KEY", apiKey: "k" })).toBe(400);
    expect(await bad({ url: "https://ok.example.com", authenticationType: "API_KEY" })).toBe(400);
    expect(await bad({ url: "https://ok.example.com", authenticationType: "BASIC_AUTHENTICATION", username: "u" })).toBe(400);
    expect(await bad({ url: "https://ok.example.com", authenticationType: "API_KEY", apiKey: "k", subscribedStatuses: ["WRONG"] })).toBe(400);
    for (let i = 0; i < 12; i++) expect(await bad({ url: `https://ok${i}.example.com`, authenticationType: "API_KEY", apiKey: "k" })).toBe(200);
    expect(await bad({ url: "https://over.example.com", authenticationType: "API_KEY", apiKey: "k" })).toBe(400);
  });
});

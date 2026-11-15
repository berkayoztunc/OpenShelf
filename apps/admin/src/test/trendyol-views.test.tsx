import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { TrendyolCallResult, TrendyolCatalogResponse, TrendyolOperation } from "@openshelf/shared";
// real-shaped operations straight from the catalog data
import { operations as orderOps } from "../../../../packages/integrations/trendyol/src/catalog/ops/orders";
import { operations as claimOps } from "../../../../packages/integrations/trendyol/src/catalog/ops/claims";
import { operations as productOps } from "../../../../packages/integrations/trendyol/src/catalog/ops/products";
import { operations as catalogOps } from "../../../../packages/integrations/trendyol/src/catalog/ops/catalog";
import { mockApi, renderRoutes } from "./helpers";
import { setLocale } from "../i18n";
import Orders from "../pages/trendyol/views/Orders";
import Returns from "../pages/trendyol/views/Returns";
import Questions, { answerProblem } from "../pages/trendyol/views/Questions";
import Finance from "../pages/trendyol/views/Finance";
import Products, { normalizeRows } from "../pages/trendyol/views/Products";
import { toCsv, presetRange, tryMoney } from "../components/trendyol/views/shared";
import { buildBody, emptyForm, validateBody, batchFinished, leaves, absoluteImage } from "../pages/trendyol/views/products/build";

const OPS = [...orderOps, ...claimOps, ...productOps, ...catalogOps] as TrendyolOperation[];
const cat = (mode: TrendyolCatalogResponse["mode"] = "mock", extra: Partial<TrendyolCatalogResponse> = {}): TrendyolCatalogResponse =>
  ({ mode, env: "production", sellerId: "123456", operations: OPS, limits: { maxBodyBytes: 2e6, maxResponseBytes: 2e6 }, ...extra });
const result = (id: string, body: unknown, o: Partial<TrendyolCallResult> = {}): TrendyolCallResult => {
  const op = OPS.find((x) => x.id === id)!;
  return { ok: true, status: 200, durationMs: 5, mock: true, env: "production", operationId: id, risk: op.risk, request: { method: op.method, url: "https://x", query: {} }, response: { headers: {}, body }, ...o };
};
const fail = (id: string, message: string): TrendyolCallResult => result(id, { errors: [{ message }] }, { ok: false, status: 400, error: { message } });

type Call = { operationId: string; path?: Record<string, unknown>; query?: Record<string, unknown>; body?: unknown; confirm?: string };
function setup(handlers: Record<string, (c: Call) => unknown>, mode: TrendyolCatalogResponse["mode"] = "mock", extra: Record<string, (p: string, b?: unknown) => unknown> = {}) {
  const calls: Call[] = [];
  mockApi({
    "GET /api/admin/trendyol/catalog": () => cat(mode),
    "GET /api/admin/orders": () => ({ items: [], total: 0, page: 1, pageSize: 10 }),
    "POST /api/admin/trendyol/call": (_p, body) => {
      const c = body as Call; calls.push(c);
      const h = handlers[c.operationId];
      return h ? h(c) : fail(c.operationId, "no fixture");
    },
    ...extra,
  });
  return calls;
}
const find = (calls: Call[], id: string) => calls.filter((c) => c.operationId === id);

const NOW = Date.now();
const pkg = (n: number, status = "Created") => ({
  orderNumber: `1075000${n}`, shipmentPackageId: 3330000 + n, status, customerFirstName: "Ayşe", customerLastName: "Yılmaz", customerEmail: "a@example.com",
  orderDate: NOW - 3600_000, packageTotalPrice: 922, cargoProviderName: "Yurtiçi Kargo", cargoTrackingNumber: 7280000000 + n, cargoTrackingLink: "https://t.example/1",
  shipmentAddress: { fullAddress: "Moda Cd. 12 Kadıköy/İstanbul", phone: "5321112233" }, invoiceAddress: { fullAddress: "Moda Cd. 12" },
  lines: [{ lineId: 900 + n, quantity: 1, productName: "Seramik Vazo - S", barcode: "8680000000011", stockCode: "S1", lineGrossAmount: 449, lineTotalDiscount: 65 }],
  packageHistories: [{ createdDate: NOW - 3600_000, status: "Created" }],
});
const page = (content: unknown[]) => ({ content, page: 0, size: 50, totalElements: content.length, totalPages: 1 });

beforeEach(() => { sessionStorage.clear(); localStorage.clear(); });

describe("ViewGate", () => {
  it("explains the disabled mode with a CTA instead of firing calls", async () => {
    const calls = setup({}, "disabled");
    mockApi({ "GET /api/admin/trendyol/catalog": () => ({ ...cat("disabled", { reason: "not_configured" }), operations: [] }) });
    renderRoutes({ "/*": <Orders /> }, "/");
    expect(await screen.findByTestId("tdyv-disabled")).toHaveTextContent(/connection is off/i);
    expect(screen.getByRole("link", { name: /connect trendyol/i })).toBeInTheDocument();
    expect(calls).toHaveLength(0);
  });
  it("shows the MOCK indicator", async () => {
    setup({ getShipmentPackages: () => result("getShipmentPackages", page([])) });
    renderRoutes({ "/*": <Orders /> }, "/");
    expect(await screen.findByTestId("tdyv-mode")).toHaveTextContent(/simulation/i);
  });
});

describe("Orders", () => {
  it("shows skeletons, then rows with a dictionary status label and KPI", async () => {
    let release: (v: unknown) => void = () => {};
    const gate = new Promise((r) => { release = r; });
    const calls: Call[] = [];
    mockApi({
      "GET /api/admin/trendyol/catalog": () => cat(),
      "POST /api/admin/trendyol/call": (_p, b) => { calls.push(b as Call); return gate.then(() => result("getShipmentPackages", page([pkg(1), pkg(2, "Picking")]))); },
    });
    renderRoutes({ "/*": <Orders /> }, "/");
    expect(await screen.findByTestId("tdyv-skeleton")).toBeInTheDocument();
    release(null);
    expect(await screen.findByText("10750001")).toBeInTheDocument();
    expect(screen.queryByText("Created")).toBeNull();
    expect(screen.getAllByText("New").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Preparing").length).toBeGreaterThan(0);
    expect(calls[0]!.query!.startDate).toBeTypeOf("number");
    expect(Number(calls[0]!.query!.endDate) - Number(calls[0]!.query!.startDate)).toBeLessThanOrEqual(14 * 864e5);
  });
  it("builds the query: status list, order number, 14-day presets", async () => {
    const calls = setup({ getShipmentPackages: () => result("getShipmentPackages", page([pkg(1)])) });
    renderRoutes({ "/*": <Orders /> }, "/");
    await screen.findByText("10750001");
    await userEvent.click(screen.getByRole("button", { name: "Preparing" }));
    await userEvent.click(screen.getByRole("button", { name: "Invoiced" }));
    await waitFor(() => expect(find(calls, "getShipmentPackages").at(-1)!.query!.status).toEqual(["Picking", "Invoiced"]));
    await userEvent.type(screen.getByLabelText(/^Order number/), "10750001");
    await userEvent.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() => expect(find(calls, "getShipmentPackages").at(-1)!.query!.orderNumber).toBe("10750001"));
    await userEvent.click(screen.getByRole("button", { name: "Last 14 days" }));
    const q = find(calls, "getShipmentPackages").at(-1)!.query!;
    expect(Number(q.endDate) - Number(q.startDate)).toBeLessThanOrEqual(14 * 864e5 + 2000);
  });
  it("does not query when the window exceeds 2 weeks and explains why", async () => {
    const calls = setup({ getShipmentPackages: () => result("getShipmentPackages", page([])) });
    renderRoutes({ "/*": <Orders /> }, "/");
    await screen.findByText(/No orders in this window/);
    const before = calls.length;
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2020-01-01T10:00" } });
    expect(await screen.findByText(/Date range too wide/)).toBeInTheDocument();
    expect(screen.getAllByRole("alert").some((a) => /at most 14 days/.test(a.textContent ?? ""))).toBe(true);
    expect(calls.length).toBe(before);
  });
  it("renders empty and error states with a way forward", async () => {
    const calls = setup({ getShipmentPackages: () => fail("getShipmentPackages", "Trendyol says no") });
    renderRoutes({ "/*": <Orders /> }, "/");
    expect(await screen.findByText("Trendyol says no")).toBeInTheDocument();
    const n = calls.length;
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(calls.length).toBeGreaterThan(n));
  });
  it("mock: marking Preparing sends updatePackage without a confirmation; live asks first", async () => {
    for (const mode of ["mock", "live"] as const) {
      const calls = setup({ getShipmentPackages: () => result("getShipmentPackages", page([pkg(1)])), updatePackage: () => result("updatePackage", "") }, mode);
      const view = renderRoutes({ "/*": <Orders /> }, "/");
      await userEvent.click(await screen.findByRole("button", { name: "Open order 10750001" }));
      const drawer = await screen.findByTestId("tdyv-order-drawer");
      expect(within(drawer).getAllByText(/personal data/i).length).toBeGreaterThan(0);
      await userEvent.click(within(drawer).getByRole("button", { name: /Mark as preparing/ }));
      if (mode === "live") {
        expect(find(calls, "updatePackage")).toHaveLength(0);
        await screen.findByText("updatePackage");
        const dlg = screen.getByText("updatePackage").closest("dialog")!;
        await userEvent.click(within(dlg).getAllByRole("button").at(-1)!);
      }
      await waitFor(() => expect(find(calls, "updatePackage")).toHaveLength(1));
      const c = find(calls, "updatePackage")[0]!;
      expect(c.path).toEqual({ packageId: 3330001 });
      expect(c.body).toEqual({ lines: [{ lineId: 901, quantity: 1 }], params: {}, status: "Picking" });
      expect(c.confirm).toBe(mode === "live" ? "updatePackage" : undefined);
      view.unmount();
    }
  });
  it("invoiced needs the invoice number and sends it in params", async () => {
    const calls = setup({ getShipmentPackages: () => result("getShipmentPackages", page([pkg(1, "Picking")])), updatePackage: () => result("updatePackage", "") });
    renderRoutes({ "/*": <Orders /> }, "/");
    await userEvent.click(await screen.findByRole("button", { name: "Open order 10750001" }));
    const btn = await screen.findByRole("button", { name: "Mark as invoiced" });
    expect(btn).toBeDisabled();
    await userEvent.type(screen.getByLabelText("Invoice number"), "EME2018000025208");
    await userEvent.click(btn);
    await waitFor(() => expect(find(calls, "updatePackage")[0]?.body).toMatchObject({ status: "Invoiced", params: { invoiceNumber: "EME2018000025208" } }));
  });
  it("cancel item is destructive: own confirmation, then cancelOrderPackageItem with the reason", async () => {
    const calls = setup({ getShipmentPackages: () => result("getShipmentPackages", page([pkg(1)])), cancelOrderPackageItem: () => result("cancelOrderPackageItem", "") });
    renderRoutes({ "/*": <Orders /> }, "/");
    await userEvent.click(await screen.findByRole("button", { name: "Open order 10750001" }));
    await userEvent.selectOptions(await screen.findByLabelText("Cancellation reason"), "502");
    await userEvent.click(screen.getByRole("button", { name: "Cancel item" }));
    expect(find(calls, "cancelOrderPackageItem")).toHaveLength(0);
    const dlg = await screen.findByText(/cannot be undone/i);
    await userEvent.click(within(dlg.closest("dialog")!).getByRole("button", { name: "Cancel item" }));
    await waitFor(() => expect(find(calls, "cancelOrderPackageItem")[0]?.body).toEqual({ lines: [{ lineId: 901, quantity: 1 }], reasonId: 502 }));
  });
  it("Turkish: status labels are translated, never raw codes", async () => {
    setLocale("tr");
    setup({ getShipmentPackages: () => result("getShipmentPackages", page([pkg(1, "UnSupplied"), pkg(2, "Created")])) });
    renderRoutes({ "/*": <Orders /> }, "/");
    await screen.findByText("10750001");
    expect(screen.getAllByText("Tedarik edilemedi").length).toBeGreaterThan(0);
    expect(screen.queryByText("UnSupplied")).toBeNull();
    expect(screen.getByText("Son satışlar", { exact: false })).toBeTruthy();
  });
});

const claim = (n: number, status: string) => ({
  id: `claim-${n}`, claimId: `claim-${n}`, orderNumber: `1058${n}`, orderDate: NOW - 9e8, customerFirstName: "Burak", customerLastName: "Şahin", claimDate: NOW - 3e8, cargoProviderName: "Aras", cargoTrackingNumber: 1,
  items: [{ orderLine: { productName: "Seramik Vazo - L", barcode: "8680000000012" }, claimItems: [{ id: `ci-${n}`, customerClaimItemReason: { name: "Vazgeçtim", externalReasonId: 401 }, claimItemStatus: { name: status }, customerNote: "n" }] }], lastModifiedDate: NOW,
});
describe("Returns", () => {
  const fixtures = () => ({
    getClaims: (c: Call) => { const all = [claim(1, "WaitingInAction"), claim(2, "WaitingInAction")]; const ids = c.query?.claimIds as string[] | undefined; return result("getClaims", page(ids?.length ? all.filter((x) => ids.includes(x.id)) : all)); },
    getClaimIssueReasons: () => result("getClaimIssueReasons", [{ id: 451, name: "Analysis" }, { id: 401, name: "Missing item" }]),
    approveClaimLineItems: () => result("approveClaimLineItems", ""), createClaimIssue: () => result("createClaimIssue", {}),
    getClaimItemAudits: () => result("getClaimItemAudits", [{ date: NOW, previousStatus: "", newStatus: "Created", userInfoDocument: { executorApp: "App" } }]),
  });
  it("filters by status and shows labelled rows", async () => {
    const calls = setup(fixtures());
    renderRoutes({ "/*": <Returns /> }, "/");
    expect(await screen.findAllByText("Waiting for your action")).not.toHaveLength(0);
    await userEvent.selectOptions(screen.getByLabelText(/Return status/), "Accepted");
    await waitFor(() => expect(find(calls, "getClaims").at(-1)!.query!.claimItemStatus).toBe("Accepted"));
  });
  it("approve asks first, then calls approveClaimLineItems with the item ids", async () => {
    const calls = setup(fixtures());
    renderRoutes({ "/*": <Returns /> }, "/");
    await userEvent.click(await screen.findByRole("button", { name: "Open the return of order 10581" }));
    const drawer = await screen.findByTestId("tdyv-claim-drawer");
    await userEvent.click(within(drawer).getByRole("button", { name: "Approve" }));
    expect(find(calls, "approveClaimLineItems")).toHaveLength(0);
    await userEvent.click(within((await screen.findByText(/cannot be undone/i)).closest("dialog")!).getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(find(calls, "approveClaimLineItems")[0]).toMatchObject({ path: { claimId: "claim-1" }, body: { claimLineItemIdList: ["ci-1"], params: {} } }));
  });
  it("reject requires a reason, a description and an attachment, then sends them as query + multipart file", async () => {
    const calls = setup(fixtures());
    renderRoutes({ "/*": <Returns /> }, "/");
    await userEvent.click(await screen.findByRole("button", { name: "Open the return of order 10582" }));
    await userEvent.click(within(await screen.findByTestId("tdyv-claim-drawer")).getByRole("button", { name: "Reject" }));
    const form = await screen.findByTestId("tdyv-reject");
    await userEvent.click(screen.getByRole("button", { name: "Send rejection request" }));
    expect(await within(form).findByText("Choose a reason.")).toBeInTheDocument();
    expect(find(calls, "createClaimIssue")).toHaveLength(0);
    await userEvent.selectOptions(within(form).getByLabelText(/Rejection reason/), "451");
    await userEvent.type(within(form).getByLabelText("Description"), "Opened seal");
    await userEvent.upload(within(form).getByLabelText(/Evidence file/), new File(["x"], "proof.png", { type: "image/png" }));
    await new Promise((r) => setTimeout(r, 80));
    await userEvent.click(screen.getByRole("button", { name: "Send rejection request" }));
    await waitFor(() => expect(find(calls, "createClaimIssue")[0]).toMatchObject({ path: { claimId: "claim-2" }, query: { claimIssueReasonId: 451, claimItemIdList: "ci-2", description: "Opened seal" }, body: { file: { name: "proof.png", type: "image/png" } } }));
  });
  it("sending without an attachment is blocked", async () => {
    const calls = setup(fixtures());
    renderRoutes({ "/*": <Returns /> }, "/");
    await userEvent.click(await screen.findByRole("button", { name: "Open the return of order 10582" }));
    await userEvent.click(within(await screen.findByTestId("tdyv-claim-drawer")).getByRole("button", { name: "Reject" }));
    const form = await screen.findByTestId("tdyv-reject");
    await userEvent.selectOptions(within(form).getByLabelText(/Rejection reason/), "401");
    await userEvent.type(within(form).getByLabelText("Description"), "x");
    await userEvent.click(screen.getByRole("button", { name: "Send rejection request" }));
    expect(await within(form).findByText(/must attach a file/i)).toBeInTheDocument();
    expect(find(calls, "createClaimIssue")).toHaveLength(0);
  });
});

const question = (id: number, status = "WAITING_FOR_ANSWER") => ({ id, text: "Su geçirir mi?", status, productName: "Seramik Vazo - S", imageUrl: "", userName: "M*** D***", creationDate: NOW - 7200_000, ...(status === "ANSWERED" ? { answer: { text: "Geçirmez.", creationDate: NOW } } : {}) });
describe("Questions", () => {
  it("length rule helper", () => {
    expect(answerProblem("")).toBe("empty"); expect(answerProblem("short")).toBe("short");
    expect(answerProblem("x".repeat(10))).toBeNull(); expect(answerProblem("x".repeat(2001))).toBe("long");
  });
  it("counter, 10-char minimum, template and answerQuestion body", async () => {
    const calls = setup({ getQuestionFilter: () => result("getQuestionFilter", page([question(7)])), answerQuestion: () => result("answerQuestion", "ok") });
    renderRoutes({ "/*": <Questions /> }, "/");
    await userEvent.click(await screen.findByRole("button", { name: "Answer" }));
    const box = screen.getByLabelText(/Your answer/);
    await userEvent.type(box, "short");
    expect(screen.getByTestId("tdyv-counter")).toHaveTextContent("5 / 2000");
    await userEvent.click(screen.getByRole("button", { name: "Send answer" }));
    expect(await screen.findByText(/too short/i)).toBeInTheDocument();
    expect(find(calls, "answerQuestion")).toHaveLength(0);
    await userEvent.click(screen.getByRole("button", { name: "Template 1" }));
    expect((box as HTMLTextAreaElement).value).toMatch(/^Hello, thank you/);
    await userEvent.click(screen.getByRole("button", { name: "Send answer" }));
    await waitFor(() => expect(find(calls, "answerQuestion")[0]).toMatchObject({ path: { id: 7 }, body: { text: expect.stringMatching(/^Hello, thank you/) } }));
  });
  it("status filter sends the status; answered questions show the answer", async () => {
    const calls = setup({ getQuestionFilter: (c) => result("getQuestionFilter", page([question(8, c.query!.status === "ANSWERED" ? "ANSWERED" : "WAITING_FOR_ANSWER")])) });
    renderRoutes({ "/*": <Questions /> }, "/");
    await screen.findByText("Su geçirir mi?");
    await userEvent.selectOptions(screen.getByLabelText(/Question status/), "ANSWERED");
    expect(await screen.findByText("Geçirmez.")).toBeInTheDocument();
    expect(find(calls, "getQuestionFilter").at(-1)!.query!.status).toBe("ANSWERED");
  });
});

describe("Finance", () => {
  const rowsFx = [
    { transactionDate: NOW, transactionType: "Sale", orderNumber: "1", description: "Vazo; \"x\"", debt: 0, credit: 384, commissionAmount: 57.6, sellerRevenue: 326.4 },
    { transactionDate: NOW, transactionType: "Sale", orderNumber: "2", description: "Yastık", debt: 0, credit: 100, commissionAmount: 10, sellerRevenue: 90 },
  ];
  it("sends transactionType + ms window and shows totals", async () => {
    const calls = setup({ getSettlements: () => result("getSettlements", page(rowsFx)) });
    renderRoutes({ "/*": <Finance /> }, "/");
    await screen.findByText("Vazo; \"x\"");
    const q = find(calls, "getSettlements")[0]!.query!;
    expect(q).toMatchObject({ transactionType: "Sale", size: 500 });
    expect(q.startDate).toBeTypeOf("number");
    const totals = screen.getByTestId("tdyv-totals");
    expect(totals).toHaveTextContent(tryMoney(484)); expect(totals).toHaveTextContent(tryMoney(416.4));
  });
  it("CSV: BOM, `;` in Turkish, `,` in English, quoting", () => {
    const head = ["a", "b"]; const rows = [["x;y", 'q"z'], ["1", 2]];
    const tr = toCsv(head, rows, ";"); const en = toCsv(head, rows, ",");
    expect(tr.charCodeAt(0)).toBe(0xfeff);
    expect(tr).toBe('﻿a;b\r\n"x;y";"q""z"\r\n1;2');
    expect(en).toBe('﻿a,b\r\nx;y,"q""z"\r\n1,2');
  });
  it("export downloads the loaded rows with the locale separator", async () => {
    let captured: Blob | null = null;
    (URL as unknown as { createObjectURL: (b: Blob) => string }).createObjectURL = (b: Blob) => { captured = b; return "blob:x"; };
    (URL as unknown as { revokeObjectURL: () => void }).revokeObjectURL = () => {};
    setLocale("tr");
    setup({ getSettlements: () => result("getSettlements", page(rowsFx)) });
    renderRoutes({ "/*": <Finance /> }, "/");
    await screen.findByText("Yastık");
    await userEvent.click(screen.getByRole("button", { name: "CSV indir" }));
    const buf = await new Promise<ArrayBuffer>((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result as ArrayBuffer); fr.readAsArrayBuffer(captured as unknown as Blob); });
    const text = new TextDecoder("utf-8", { ignoreBOM: true }).decode(buf);
    expect(text.startsWith("﻿")).toBe(true);
    expect(text.split("\r\n")[0]).toContain(";");
    expect(text).toContain("326,4");
  });
  it("rejects a window over 15 days", async () => {
    const calls = setup({ getSettlements: () => result("getSettlements", page([])) });
    renderRoutes({ "/*": <Finance /> }, "/");
    await screen.findByText(/No records in this window/);
    const n = calls.length;
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2020-01-01T10:00" } });
    expect((await screen.findAllByText(/at most 15 days/i)).length).toBeGreaterThan(0);
    expect(calls.length).toBe(n);
  });
});

describe("Products", () => {
  const approved = { content: [{ contentId: 1, productMainId: "M", title: "Seramik Vazo - S", brand: { name: "OpenShelf" }, category: { name: "Ev" }, images: [{ url: "https://i/1.jpg" }], variants: [{ barcode: "8680000000011", stockCode: "S1", onSale: true, stock: { quantity: 18 }, price: { salePrice: 384, listPrice: 449 } }] }], page: 0, size: 50, totalElements: 1, totalPages: 1 };
  it("normalises approved contents into variant rows and unapproved flat rows", () => {
    const rows = normalizeRows("approved", approved.content as never);
    expect(rows[0]).toMatchObject({ barcode: "8680000000011", quantity: 18, salePrice: 384, listPrice: 449, onSale: true, brand: "OpenShelf" });
    const un = normalizeRows("unapproved", [{ barcode: "B", title: "T", status: "pendingApproval", quantity: 3, salePrice: 5, listPrice: 6, brand: { name: "X" } }] as never);
    expect(un[0]).toMatchObject({ approved: false, status: "pendingApproval", quantity: 3 });
  });
  it("lists approved products, filters by barcode/status as query params", async () => {
    const calls = setup({ filterApprovedProducts: () => result("filterApprovedProducts", approved) });
    renderRoutes({ "/*": <Products /> }, "/");
    expect(await screen.findByText("Seramik Vazo - S")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/^Barcode/), "8680000000011");
    await userEvent.selectOptions(screen.getByLabelText(/Sale status/), "onSale");
    await userEvent.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() => expect(find(calls, "filterApprovedProducts").at(-1)!.query).toMatchObject({ barcode: "8680000000011", status: "onSale" }));
  });
  it("inline stock/price edit sends only changed values, then polls the batch until finished and stops", async () => {
    let polls = 0;
    const calls = setup({
      filterApprovedProducts: () => result("filterApprovedProducts", approved),
      updatePriceAndInventory: () => result("updatePriceAndInventory", { batchRequestId: "b-1" }),
      getBatchRequestResult: () => { polls++; return result("getBatchRequestResult", { items: [{ requestItem: { barcode: "8680000000011" }, status: polls < 2 ? "PENDING" : "SUCCESS", failureReasons: [] }] }); },
    });
    renderRoutes({ "/*": <Products /> }, "/");
    await userEvent.click(await screen.findByRole("button", { name: /Edit stock and price of 8680000000011/ }));
    const stock = screen.getByLabelText("Stock");
    await userEvent.clear(stock); await userEvent.type(stock, "25");
    await userEvent.click(screen.getByRole("button", { name: "Send stock and price" }));
    await waitFor(() => expect(find(calls, "updatePriceAndInventory")[0]?.body).toEqual({ items: [{ barcode: "8680000000011", quantity: 25 }] }));
    expect(await screen.findByTestId("tdyv-batch")).toBeInTheDocument();
    expect(await screen.findByText("Succeeded", {}, { timeout: 6000 })).toBeInTheDocument();
    const at = polls;
    await new Promise((r) => setTimeout(r, 2600));
    expect(polls).toBe(at);
  }, 15000);
  it("the 15-minute repeat error is explained, not retried", async () => {
    const calls = setup({
      filterApprovedProducts: () => result("filterApprovedProducts", approved),
      updatePriceAndInventory: () => fail("updatePriceAndInventory", "15 dakika boyunca aynı isteği tekrarlı olarak atamazsınız!"),
    });
    renderRoutes({ "/*": <Products /> }, "/");
    await userEvent.click(await screen.findByRole("button", { name: /Edit stock and price/ }));
    const stock = screen.getByLabelText("Stock");
    await userEvent.clear(stock); await userEvent.type(stock, "30");
    await userEvent.click(screen.getByRole("button", { name: "Send stock and price" }));
    expect(await screen.findByText(/identical stock\/price request repeated within 15 minutes/i)).toBeInTheDocument();
    expect(screen.getByText(/15 dakika boyunca/)).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 300));
    expect(find(calls, "updatePriceAndInventory")).toHaveLength(1);
  });
  it("delete is destructive with its own confirmation (unapproved tab)", async () => {
    const calls = setup({
      filterApprovedProducts: () => result("filterApprovedProducts", approved),
      filterUnapprovedProducts: () => result("filterUnapprovedProducts", { content: [{ barcode: "B-9", title: "Pending one", status: "pendingApproval", quantity: 1, salePrice: 5, listPrice: 6 }], page: 0, size: 50, totalElements: 1, totalPages: 1 }),
      deleteProducts: () => result("deleteProducts", { batchRequestId: "b-2" }),
      getBatchRequestResult: () => result("getBatchRequestResult", { items: [{ requestItem: { barcode: "B-9" }, status: "SUCCESS", failureReasons: [] }] }),
    });
    renderRoutes({ "/*": <Products /> }, "/");
    await userEvent.click(await screen.findByRole("tab", { name: "Pending approval" }));
    await userEvent.click(await screen.findByRole("button", { name: "Delete B-9" }));
    expect(find(calls, "deleteProducts")).toHaveLength(0);
    await userEvent.click(within((await screen.findByText(/permanently deleted/i)).closest("dialog")!).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(find(calls, "deleteProducts")[0]?.body).toEqual({ items: [{ barcode: "B-9" }] }));
  });
  it("batchFinished: COMPLETED or all items SUCCESS/FAILED", () => {
    expect(batchFinished({ items: [{ status: "SUCCESS" }, { status: "FAILED" }] })).toBe(true);
    expect(batchFinished({ items: [{ status: "SUCCESS" }, { status: "PENDING" }] })).toBe(false);
    expect(batchFinished({ status: "IN_PROGRESS", items: [{ status: "SUCCESS" }] })).toBe(false);
    expect(batchFinished({ status: "COMPLETED", items: [] })).toBe(true);
    expect(batchFinished(undefined)).toBe(false);
  });
});

describe("product wizard body", () => {
  const form = () => ({
    ...emptyForm(), barcode: "OS-1", stockCode: "OS-1", productMainId: "VAZO", title: "Seramik Vazo", description: "<p>x</p>", brandId: 9001, categoryId: 411,
    vatRate: "20", listPrice: "549,9", salePrice: "479.9", quantity: "25", images: ["https://cdn.example.com/1.jpg"], cargo: "YKMP", dimensionalWeight: "2",
    attrs: { 47: { ids: [1002], custom: "" }, 1201: { ids: [], custom: "Seramik" } },
  });
  it("builds a V2 body (no currencyType; attributeId + attributeValueId / customAttributeValue)", () => {
    const body = buildBody(form()); const it0 = body.items[0]!;
    expect(it0).toMatchObject({ barcode: "OS-1", brandId: 9001, categoryId: 411, quantity: 25, listPrice: 549.9, salePrice: 479.9, vatRate: 20, cargoProviders: ["YKMP"], deliveryOption: { deliveryDuration: 1 }, images: [{ url: "https://cdn.example.com/1.jpg" }] });
    expect(it0.attributes).toEqual([{ attributeId: 47, attributeValueId: 1002 }, { attributeId: 1201, customAttributeValue: "Seramik" }]);
    expect(it0).not.toHaveProperty("currencyType");
    expect(validateBody(body, [47])).toEqual([]);
  });
  it("validation derives messages from the catalog hints", () => {
    const bad = buildBody({ ...form(), title: "x".repeat(101), salePrice: "900", images: ["http://insecure/1.jpg"], brandId: null, barcode: "bad barcode" });
    const keys = validateBody(bad, [99]).map((p) => p.key.replace("trendyolviews.products.v.", ""));
    expect(keys).toEqual(expect.arrayContaining(["title.long", "price.order", "images.https", "brand.required", "barcode.format", "attr.required"]));
  });
  it("leaves of the category tree and absolute image urls", () => {
    expect(leaves([{ id: 1, name: "A", subCategories: [{ id: 2, name: "B", subCategories: [] }] }, { id: 3, name: "C", subCategories: [] }]).map((l) => l.path)).toEqual(["A › B", "C"]);
    expect(absoluteImage("/media/x", undefined, "https://shop.example.com")).toBe("https://shop.example.com/media/x");
    expect(absoluteImage(undefined, "m1", "https://shop.example.com/")).toBe("https://shop.example.com/media/m1");
  });
  const autoSetup = (defaults: unknown, brandHits = [{ id: 9001, name: "OpenShelf Home" }, { id: 9002, name: "OpenShelf" }]) => setup({
    filterApprovedProducts: () => result("filterApprovedProducts", { content: [], page: 0, size: 50, totalElements: 0, totalPages: 1 }),
    getCargoProviders: () => result("getCargoProviders", [{ code: "YKMP", name: "Yurtiçi" }]),
    getBrandsByName: () => result("getBrandsByName", brandHits),
    getCategoryTree: () => result("getCategoryTree", [{ id: 400, name: "Aksesuar", subCategories: [{ id: 411, name: "Çanta Süsü", subCategories: [] }, { id: 412, name: "Anahtarlık", subCategories: [] }] }]),
    getCategoryAttributes: () => result("getCategoryAttributes", { categoryAttributes: [
      { attribute: { id: 47, name: "Color" }, required: true, varianter: true }, { attribute: { id: 48, name: "Material" }, required: true }] }),
    getCategoryAttributeValues: (c) => result("getCategoryAttributeValues", { content: c.path?.attributeId === 47
      ? [{ attributeValueId: 1001, attributeValueName: "Pembe" }, { attributeValueId: 1002, attributeValueName: "Mavi" }]
      : [{ attributeValueId: 5, attributeValueName: "Deri" }] }),
    createProducts: () => result("createProducts", { batchRequestId: "b-11" }),
    getBatchRequestResult: () => result("getBatchRequestResult", { items: [] }),
  }, "mock", {
    "GET /api/admin/products/p9": () => ({ id: "p9", nameTr: "don't touch my bag charm", slug: "bag-charm", brand: "OpenShelf", categoryId: "c1", descriptionTr: "Çanta süsü", images: [{ url: "https://cdn.example.com/c.jpg" }], variants: [
      { id: "va", sku: "S-1", barcode: "2411198546", title: "Pembe", options: { Renk: "Pembe" }, weightGrams: 1500, prices: { website: 69000, trendyol: null }, stock: { total: 20, reserved: 0, safetyStock: 0 } },
      { id: "vb", sku: "S-2", barcode: "2411198547", title: "Mavi", options: { Renk: "Mavi" }, prices: { website: 69000, trendyol: null }, stock: { total: 20, reserved: 0, safetyStock: 0 } }] }),
    "GET /api/admin/categories": () => ({ items: [{ id: "c1", slug: "canta-susu", nameTr: "Çanta Süsü", parentId: "c0", position: 0 }, { id: "c0", slug: "aksesuar", nameTr: "Aksesuar", parentId: null, position: 0 }] }),
    "GET /api/admin/settings": () => ({ general: { storeName: "Nuad Atelier" } }),
    "GET /api/admin/trendyol/defaults": () => ({ defaults }),
    "PUT /api/admin/trendyol/defaults": () => null,
    "POST /api/admin/trendyol/mappings": () => ({ ok: true }),
    "POST /api/admin/trendyol/sync/verify": () => ({ approved: 0, pending: 2, notListed: 0 }),
  });
  it("wizard fills brand, category and colours by itself from the product, then remembers the choice for the category", async () => {
    const calls = autoSetup(null);
    const put = vi.mocked((await import("../lib/api")).api.put);
    renderRoutes({ "/*": <Products /> }, "/?create=p9");
    await waitFor(() => expect(screen.getByRole("button", { name: "Next" })).toBeEnabled());
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    const banner = await screen.findByTestId("tdyv-autofill");
    // brand: the product says "OpenShelf"; Trendyol returns "OpenShelf Home" and "OpenShelf": only the equal name is taken
    await waitFor(() => expect(banner).toHaveTextContent("Brand: OpenShelf (from the product's brand)"));
    // category: no equal name ambiguity -> "Çanta Süsü" is the one leaf with that name
    await waitFor(() => expect(banner).toHaveTextContent("Category: Aksesuar › Çanta Süsü (from the store category's name)"));
    // colours came from the variant names, nobody touched a select
    await waitFor(() => expect((screen.getByLabelText("Color: Pembe") as HTMLSelectElement).value).toBe("1001"));
    expect((screen.getByLabelText("Color: Mavi") as HTMLSelectElement).value).toBe("1002");
    // desi from the 1.5 kg variant
    await userEvent.selectOptions(await screen.findByLabelText(/^Material/), "5");
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    const body = JSON.parse((await screen.findByLabelText(/Request body/) as HTMLTextAreaElement).value);
    const byId = (x: any, y: any) => x.attributeId - y.attributeId;
    expect(body.items.map((i: any) => [i.brandId, i.categoryId, i.dimensionalWeight, [...i.attributes].sort(byId)])).toEqual([
      [9002, 411, 2, [{ attributeId: 47, attributeValueId: 1001 }, { attributeId: 48, attributeValueId: 5 }]],
      [9002, 411, 2, [{ attributeId: 47, attributeValueId: 1002 }, { attributeId: 48, attributeValueId: 5 }]]]);
    expect(screen.getByText(/No problems/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Send to Trendyol" }));
    await waitFor(() => expect(find(calls, "createProducts")).toHaveLength(1));
    // remembered for the local category; the colour is per variant, so it is NOT remembered
    await waitFor(() => expect(put).toHaveBeenCalledWith("/api/admin/trendyol/defaults", expect.objectContaining({
      localCategoryId: "c1", trendyolCategoryId: 411, categoryPath: "Aksesuar › Çanta Süsü", brandId: 9002, brandName: "OpenShelf", cargo: "YKMP",
      attrs: { 48: { ids: [5], custom: "" } } })));
  });
  it("wizard with remembered choices for the category: brand, category, material and cargo come back without any matching", async () => {
    autoSetup({ trendyolCategoryId: 412, categoryPath: "Aksesuar › Anahtarlık", brandId: 9055, brandName: "Eski Marka", attrs: { "48": { ids: [5], custom: "" } }, cargo: "YKMP", vatRate: "10", dimensionalWeight: "3", deliveryDuration: "2", origin: "TR" }, []);
    renderRoutes({ "/*": <Products /> }, "/?create=p9");
    await waitFor(() => expect(screen.getByRole("button", { name: "Next" })).toBeEnabled());
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    const banner = await screen.findByTestId("tdyv-autofill");
    await waitFor(() => expect(banner).toHaveTextContent("Brand: Eski Marka (what you chose last time in this category)"));
    expect(banner).toHaveTextContent("Category: Aksesuar › Anahtarlık (what you chose last time in this category)");
    await waitFor(() => expect((screen.getByLabelText(/^Material/) as HTMLSelectElement).value).toBe("5"));
  });
  it("wizard that cannot decide only suggests: ambiguous category and a brand with no equal name stay open", async () => {
    autoSetup(null, [{ id: 9001, name: "OpenShelf Home" }]);
    renderRoutes({ "/*": <Products /> }, "/?create=p9");
    await waitFor(() => expect(screen.getByRole("button", { name: "Next" })).toBeEnabled());
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    const brandBox = await screen.findByTestId("tdyv-brand-suggest");
    expect(within(brandBox).getByRole("button", { name: "OpenShelf Home" })).toBeTruthy();
    expect(screen.queryByTestId("tdyv-autofill")?.textContent ?? "").not.toContain("Brand:");
    await userEvent.click(within(brandBox).getByRole("button", { name: "OpenShelf Home" }));
    expect(await screen.findByText("OpenShelf Home", { selector: "span" })).toBeTruthy();
  });
  it("buildBody with variant rows: one item per ticked variant, shared content, own barcode/stock/price and varianter attribute", () => {
    const row = (id: string, o: object) => ({ variantId: id, label: id, include: true, barcode: `BC-${id}`, stockCode: `SK-${id}`, quantity: "5", listPrice: "690", salePrice: "690", attrs: {}, ...o });
    const body = buildBody(form(), [row("a", { attrs: { 47: { ids: [2001], custom: "" } } }), row("b", { quantity: "8", attrs: { 47: { ids: [2002], custom: "" } } }), row("c", { include: false })]);
    expect(body.items.map((i) => [i.barcode, i.stockCode, i.quantity, i.productMainId, i.title])).toEqual([["BC-a", "SK-a", 5, "VAZO", "Seramik Vazo"], ["BC-b", "SK-b", 8, "VAZO", "Seramik Vazo"]]);
    expect(body.items[0]!.attributes).toEqual([{ attributeId: 47, attributeValueId: 2001 }, { attributeId: 1201, customAttributeValue: "Seramik" }]);
    expect(body.items[1]!.attributes).toEqual([{ attributeId: 47, attributeValueId: 2002 }, { attributeId: 1201, customAttributeValue: "Seramik" }]);
    expect(validateBody(body, [47])).toEqual([]);
    const dup = buildBody(form(), [row("a", {}), row("b", { barcode: "BC-a" })]);
    expect(validateBody(dup).map((p) => p.key)).toContain("trendyolviews.products.v.barcode.duplicate");
    // a single-variant product keeps using the shared form
    expect(buildBody(form(), [row("a", {})]).items).toEqual(buildBody(form()).items);
  });
  it("wizard opened from a product (?create=): all variants in one request, colour per variant, variants linked afterwards", async () => {
    const calls = setup({
      filterApprovedProducts: () => result("filterApprovedProducts", { content: [], page: 0, size: 50, totalElements: 0, totalPages: 1 }),
      getCargoProviders: () => result("getCargoProviders", [{ code: "YKMP", name: "Yurtiçi" }]),
      getBrandsByName: () => result("getBrandsByName", [{ id: 9001, name: "OpenShelf" }]),
      getCategoryTree: () => result("getCategoryTree", [{ id: 400, name: "Aksesuar", subCategories: [{ id: 411, name: "Çanta Süsü", subCategories: [] }] }]),
      getCategoryAttributes: () => result("getCategoryAttributes", { categoryAttributes: [{ attribute: { id: 47, name: "Color" }, required: true, varianter: true }] }),
      getCategoryAttributeValues: () => result("getCategoryAttributeValues", { content: [{ attributeValueId: 1001, attributeValueName: "Pink" }, { attributeValueId: 1002, attributeValueName: "Blue" }] }),
      createProducts: () => result("createProducts", { batchRequestId: "b-10" }),
      getBatchRequestResult: () => result("getBatchRequestResult", { items: [] }),
    }, "mock", {
      "GET /api/admin/products/p9": () => ({ id: "p9", nameTr: "don't touch my bag charm", slug: "bag-charm", descriptionTr: "Çanta süsü", taxRate: 20, images: [{ url: "https://cdn.example.com/c.jpg" }], variants: [
        { id: "va", sku: "2411198546", barcode: "2411198546", title: "Pembe", prices: { website: 69000, trendyol: 69000 }, stock: { total: 20, reserved: 1, safetyStock: 0 } },
        { id: "vb", sku: "2411198547", barcode: "2411198547", title: "Mavi", prices: { website: 69000, trendyol: 69000 }, stock: { total: 20, reserved: 0, safetyStock: 0 } }] }),
      "POST /api/admin/trendyol/mappings": () => ({ ok: true }),
      "POST /api/admin/trendyol/sync/verify": () => ({ approved: 0, pending: 2, notListed: 0 }),
    });
    const post = vi.mocked((await import("../lib/api")).api.post);
    renderRoutes({ "/*": <Products /> }, "/?create=p9");
    // no search step: the product is already chosen
    expect(await screen.findByText("don't touch my bag charm")).toBeInTheDocument();
    expect(screen.queryByLabelText("Local product or variant")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Next" })).toBeEnabled());
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    const table = await screen.findByTestId("tdyv-wizard-variants");
    expect((within(table).getByLabelText("Barcode: Pembe") as HTMLInputElement).value).toBe("2411198546");
    expect((within(table).getByLabelText("Stock: Pembe") as HTMLInputElement).value).toBe("19");
    expect((within(table).getByLabelText("Sale price: Mavi") as HTMLInputElement).value).toBe("690.00");
    expect(screen.queryByLabelText(/^Barcode$/)).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/^Brand/), "open");
    await userEvent.click(await screen.findByRole("button", { name: "OpenShelf" }));
    await userEvent.click(await screen.findByRole("button", { name: "Aksesuar › Çanta Süsü" }));
    await userEvent.selectOptions(await screen.findByLabelText("Color: Pembe"), "1001");
    await userEvent.selectOptions(screen.getByLabelText("Color: Mavi"), "1002");
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    const body = JSON.parse((await screen.findByLabelText(/Request body/) as HTMLTextAreaElement).value);
    expect(body.items.map((i: any) => [i.barcode, i.quantity, i.salePrice, i.productMainId, i.title, i.attributes])).toEqual([
      ["2411198546", 19, 690, "BAG-CHARM", "don't touch my bag charm", [{ attributeId: 47, attributeValueId: 1001 }]],
      ["2411198547", 20, 690, "BAG-CHARM", "don't touch my bag charm", [{ attributeId: 47, attributeValueId: 1002 }]]]);
    expect(screen.getByText(/No problems/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Send to Trendyol" }));
    await waitFor(() => expect(find(calls, "createProducts")).toHaveLength(1));
    expect(await screen.findByTestId("tdyv-wizard-linked")).toHaveTextContent("2 variant(s) linked");
    expect(post).toHaveBeenCalledWith("/api/admin/trendyol/mappings", { variantId: "va", barcode: "2411198546" });
    expect(post).toHaveBeenCalledWith("/api/admin/trendyol/mappings", { variantId: "vb", barcode: "2411198547" });
    expect(post).toHaveBeenCalledWith("/api/admin/trendyol/sync/verify", { productIds: ["p9"] });
  });
  it("wizard: pick a local variant, defaults flow into the body, createProducts + mapping", async () => {
    const calls = setup({
      filterApprovedProducts: () => result("filterApprovedProducts", { content: [], page: 0, size: 50, totalElements: 0, totalPages: 1 }),
      getCargoProviders: () => result("getCargoProviders", [{ code: "YKMP", name: "Yurtiçi" }]),
      getBrandsByName: () => result("getBrandsByName", [{ id: 9001, name: "OpenShelf" }]),
      getCategoryTree: () => result("getCategoryTree", [{ id: 400, name: "Ev", subCategories: [{ id: 411, name: "Dekor", subCategories: [] }] }]),
      getCategoryAttributes: () => result("getCategoryAttributes", { categoryAttributes: [{ attribute: { id: 47, name: "Color" }, required: true, allowCustom: true, slicer: true }] }),
      getCategoryAttributeValues: () => result("getCategoryAttributeValues", { content: [{ attributeValueId: 1002, attributeValueName: "White" }] }),
      createProducts: () => result("createProducts", { batchRequestId: "b-9" }),
      getBatchRequestResult: () => result("getBatchRequestResult", { items: [{ requestItem: { barcode: "OS-1" }, status: "SUCCESS", failureReasons: [] }] }),
    }, "mock", {
      "GET /api/admin/catalog-lookup": () => ({ items: [{ variantId: "v1", sku: "OS-1", productName: "Seramik Vazo", variantTitle: "S", unitPrice: 47990, taxRate: 20, stock: 25 }] }),
      "GET /api/admin/products/": () => ({ id: "p1", nameTr: "Seramik Vazo", slug: "seramik-vazo", descriptionTr: "El yapımı", variants: [{ id: "v1", sku: "OS-1", barcode: "OS-1", title: "S", prices: { website: 47990, trendyol: null } }], images: [{ url: "/media/m1" }] }),
      "GET /api/admin/products": () => ({ items: [{ id: "p1", variants: [{ id: "v1" }] }] }),
      "POST /api/admin/trendyol/mappings": () => ({ ok: true }),
    });
    const post = vi.mocked((await import("../lib/api")).api.post);
    renderRoutes({ "/*": <Products /> }, "/");
    await userEvent.click(await screen.findByRole("button", { name: "Add a product to Trendyol" }));
    const input = await screen.findByLabelText("Local product or variant");
    await userEvent.type(input, "vaz");
    await userEvent.click(await screen.findByRole("option", { name: /Seramik Vazo/ }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Next" })).toBeEnabled());
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    // defaults from the local product
    expect((await screen.findByLabelText(/^Barcode/) as HTMLInputElement).value).toBe("OS-1");
    expect((screen.getByLabelText(/^Sale price/) as HTMLInputElement).value).toBe("479.90");
    expect((screen.getByLabelText(/^Stock quantity/) as HTMLInputElement).value).toBe("25");
    expect(screen.getByRole("alert")).toHaveTextContent(/public https/i);
    await userEvent.type(screen.getByLabelText(/^Brand/), "open");
    await userEvent.click(await screen.findByRole("button", { name: "OpenShelf" }));
    await userEvent.click(await screen.findByRole("button", { name: "Ev › Dekor" }));
    await userEvent.selectOptions(await screen.findByLabelText(/Color/), "1002");
    // https image required: replace the local url
    const img = screen.getByLabelText("Image 1 URL");
    await userEvent.clear(img); await userEvent.type(img, "https://cdn.example.com/1.jpg");
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    const ta = await screen.findByLabelText(/Request body/) as HTMLTextAreaElement;
    const body = JSON.parse(ta.value);
    expect(body.items[0]).toMatchObject({ barcode: "OS-1", brandId: 9001, categoryId: 411, salePrice: 479.9, quantity: 25, attributes: [{ attributeId: 47, attributeValueId: 1002 }] });
    expect(screen.getByText(/No problems/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Send to Trendyol" }));
    await waitFor(() => expect(find(calls, "createProducts")).toHaveLength(1));
    expect(find(calls, "createProducts")[0]!.body).toEqual(body);
    expect(await screen.findByTestId("tdyv-batch")).toBeInTheDocument();
    await userEvent.click(await screen.findByRole("button", { name: "Link to a local variant" }));
    await userEvent.click(await screen.findByRole("button", { name: "Link" }));
    await waitFor(() => expect(post).toHaveBeenCalledWith("/api/admin/trendyol/mappings", { variantId: "v1", barcode: "OS-1" }));
  }, 20000);
  it("mappings tab lists and deletes", async () => {
    const del = vi.fn((_p: string) => undefined);
    const api = await import("../lib/api");
    setup({ filterApprovedProducts: () => result("filterApprovedProducts", { content: [], page: 0, size: 50, totalElements: 0, totalPages: 1 }) }, "mock", {
      "GET /api/admin/trendyol/mappings": () => ({ items: [{ variantId: "v1", sku: "OS-1", productName: "Seramik Vazo", variantTitle: "S", barcode: "8680000000011" }] }),
    });
    vi.spyOn(api.api, "del").mockImplementation(((p: string) => { del(p); return Promise.resolve(undefined); }) as never);
    renderRoutes({ "/*": <Products /> }, "/");
    await userEvent.click(await screen.findByRole("tab", { name: "Mappings" }));
    expect(await screen.findByText("8680000000011")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Delete the mapping of OS-1" }));
    await userEvent.click(within((await screen.findByText(/link between OS-1/i)).closest("dialog")!).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(del).toHaveBeenCalledWith("/api/admin/trendyol/mappings?variantId=v1"));
  });
});

describe("helpers", () => {
  it("presetRange: today starts at midnight, d14 spans 14 days", () => {
    const now = new Date(2026, 9, 26, 15, 30).getTime();
    expect(presetRange("today", now).start).toBe(new Date(2026, 9, 26).getTime());
    expect(presetRange("d14", now).end - presetRange("d14", now).start).toBe(14 * 864e5);
  });
});

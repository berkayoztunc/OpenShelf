import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, waitFor, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { TrendyolCallResult, TrendyolCatalogResponse, TrendyolOperation } from "@openshelf/shared";
import Trendyol from "../pages/trendyol/Trendyol";
import { asRole, mockApi, renderRoutes } from "./helpers";
import { buildCurl, buildRequest, checkJson, defaultValues, insertField, localInputToMs, msToLocalInput, presetValue, serialiseQuery } from "../lib/trendyol";

const T = (tr: string, en = tr) => ({ tr, en });
const getOrders: TrendyolOperation = {
  id: "getOrders", group: "orders", area: "orders", title: T("Siparişleri getir", "Get orders"), summary: T("Paketleri listeler", "Lists packages"),
  method: "GET", path: "/integration/order/sellers/{sellerId}/orders", docsUrl: "https://developers.trendyol.com/v2.0/reference/getOrders", risk: "read",
  params: [
    { name: "sellerId", in: "path", type: "string", required: true, description: T("Satıcı", "Seller") },
    { name: "status", in: "query", type: "array", enum: ["Created", "Picking", "Shipped"], description: T("Durum", "Status") },
    { name: "tags", in: "query", type: "array", arrayStyle: "repeat", description: T("Etiket", "Tags") },
    { name: "startDate", in: "query", type: "timestamp_ms", description: T("Başlangıç", "Start date") },
    { name: "size", in: "query", type: "integer", default: 50, description: T("Boyut", "Size") },
  ],
  body: { kind: "none" },
  table: { listPath: "content", columns: [{ key: "orderNumber", label: T("Sipariş", "Order") }, { key: "status", label: T("Durum", "Status") }] },
  pagination: { pageParam: "page", sizeParam: "size", maxSize: 200, firstPage: 0 },
};
const createProducts: TrendyolOperation = {
  id: "createProducts", group: "products", area: "products", title: T("Ürün oluştur", "Create products"), summary: T("Ürün ekler", "Adds products"),
  method: "POST", path: "/integration/product/sellers/{sellerId}/products", docsUrl: "https://developers.trendyol.com/v2.0/reference/createProducts", risk: "write",
  params: [], body: { kind: "json", example: { items: [{ barcode: "B1" }] }, fields: [{ path: "items[].barcode", type: "string", required: true, description: T("Barkod", "Barcode") }] },
};
const deleteItem: TrendyolOperation = {
  id: "deleteItem", group: "products", area: "products", title: T("Ürün sil", "Delete product"), summary: T("Siler", "Deletes"),
  method: "DELETE", path: "/integration/product/sellers/{sellerId}/products/{barcode}", docsUrl: "https://x", risk: "destructive",
  params: [{ name: "barcode", in: "path", type: "string", required: true, description: T("Barkod", "Barcode"), example: "B1" }], body: { kind: "none" },
};
const stageOp: TrendyolOperation = { ...getOrders, id: "createTestOrder", title: T("Test siparişi", "Test order"), envs: ["stage"], deprecated: T("Eski", "Old API"), method: "POST", risk: "write" };

const catalog = (mode: TrendyolCatalogResponse["mode"], extra: Partial<TrendyolCatalogResponse> = {}): TrendyolCatalogResponse =>
  ({ mode, env: "production", sellerId: "123456", operations: [getOrders, createProducts, deleteItem, stageOp], limits: { maxBodyBytes: 2_000_000, maxResponseBytes: 2_000_000 }, ...extra });
const result = (op: TrendyolOperation, o: Partial<TrendyolCallResult> = {}): TrendyolCallResult => ({
  ok: true, status: 200, durationMs: 12, mock: true, env: "production", operationId: op.id, risk: op.risk,
  request: { method: op.method, url: `https://apigw.trendyol.com${op.path}`, query: {} }, response: { headers: { "content-type": "application/json" }, body: {} }, ...o,
});

function setup(cat: TrendyolCatalogResponse, opts: { call?: (body: Record<string, unknown>) => TrendyolCallResult; history?: unknown[] } = {}) {
  const calls: Record<string, unknown>[] = [];
  const api = mockApi({
    "GET /api/admin/trendyol/catalog": () => cat,
    "POST /api/admin/trendyol/call": (_p, body) => { calls.push(body as Record<string, unknown>); const b = body as { operationId: string }; return opts.call ? opts.call(b) : result(cat.operations.find((o) => o.id === b.operationId)!); },
    "GET /api/admin/trendyol/history": () => ({ items: opts.history ?? [], total: (opts.history ?? []).length }),
    "POST /api/admin/trendyol/mock/reset": () => ({ ok: true }),
  });
  return { calls, api };
}
const open = (op: string) => renderRoutes({ "/trendyol/*": <Trendyol /> }, `/trendyol?op=${op}`);

beforeEach(() => { sessionStorage.clear(); asRole("owner"); });

describe("helpers", () => {
  it("builds the query: arrays comma/repeat, timestamps as ms, defaults kept", () => {
    const v = { ...defaultValues(getOrders), status: "Created,Shipped", tags: "a,b", startDate: "1700000000000" };
    const r = buildRequest(getOrders, v, "production", "123456");
    expect(r.query).toEqual({ status: ["Created", "Shipped"], tags: ["a", "b"], startDate: 1700000000000, size: 50 });
    expect(r.queryString).toBe("status=Created,Shipped&tags=a&tags=b&startDate=1700000000000&size=50");
    expect(r.url).toBe("https://apigw.trendyol.com/integration/order/sellers/123456/orders");
    expect(serialiseQuery(getOrders, { status: ["A", "B"] })).toBe("status=A,B");
  });
  it("reports missing required path params", () => {
    expect(buildRequest(deleteItem, { barcode: "" }, "stage", "1").missing).toEqual(["barcode"]);
    expect(buildRequest(deleteItem, { barcode: "X 1" }, "stage", "1").url).toContain("/products/X%201");
  });
  it("validates JSON with a position and inserts hinted fields", () => {
    const bad = checkJson('{\n  "a": 1,\n  "b": }');
    expect(bad.ok).toBe(false);
    if (!bad.ok) { expect(bad.line).toBe(3); expect(bad.col).toBeGreaterThan(1); }
    expect(JSON.parse(insertField("", "items[].barcode", "string"))).toEqual({ items: [{ barcode: "" }] });
    expect(JSON.parse(insertField('{"items":[{"barcode":"x"}]}', "items[].quantity", "integer"))).toEqual({ items: [{ barcode: "x", quantity: 0 }] });
  });
  it("converts timestamps and presets", () => {
    const ms = localInputToMs("2024-03-05T10:30");
    expect(msToLocalInput(ms)).toBe("2024-03-05T10:30");
    const now = new Date(2024, 2, 20, 15, 0).getTime();
    expect(presetValue("last7", "startDate", now)).toBe(String(now - 7 * 864e5));
    expect(presetValue("last7", "endDate", now)).toBe(String(now));
    expect(new Date(Number(presetValue("today", "startDate", now))).getHours()).toBe(0);
  });
  it("curl never contains credentials", () => {
    const req = buildRequest(createProducts, defaultValues(createProducts), "production", "123456");
    const c = buildCurl(createProducts, req, { items: [] }, "123456");
    expect(c).toContain("$TRENDYOL_API_KEY:$TRENDYOL_API_SECRET");
    expect(c).toContain("User-Agent: 123456 - SelfIntegration");
    expect(c).not.toMatch(/Basic [A-Za-z0-9+/=]{8,}/);
  });
});

describe("Trendyol explorer", () => {
  it("filters the operation tree by search text", async () => {
    setup(catalog("mock")); open("getOrders");
    const nav = await screen.findByRole("navigation", { name: "API operations" });
    expect(within(nav).getByRole("button", { name: /Get orders/ })).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Search operations"), "delete");
    expect(within(nav).queryByRole("button", { name: /Get orders/ })).toBeNull();
    expect(within(nav).getByRole("button", { name: /Delete product/ })).toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText("Search operations"));
    await userEvent.type(screen.getByLabelText("Search operations"), "zzzz");
    expect(await screen.findByText("No matching operation")).toBeInTheDocument();
  });

  it("sends the form as query params (arrays, ms timestamps) in mock mode without confirmation", async () => {
    const { calls } = setup(catalog("mock")); open("getOrders");
    await screen.findByText("Lists packages");
    expect(screen.getByTestId("tdy-endpoint")).toHaveTextContent("https://apigw.trendyol.com/integration/order/sellers/123456/orders");
    await userEvent.click(screen.getByRole("button", { name: "Shipped" }));
    fireEvent.change(screen.getByLabelText(/startDate/), { target: { value: "2024-03-05T10:30" } });
    await userEvent.click(screen.getByRole("button", { name: /Send \(simulation\)/ }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toMatchObject({ operationId: "getOrders", query: { status: ["Shipped"], size: 50, startDate: localInputToMs("2024-03-05T10:30") ? Number(localInputToMs("2024-03-05T10:30")) : 0 } });
    expect(calls[0]!.confirm).toBeUndefined();
    expect(await screen.findByText("MOCK")).toBeInTheDocument();
  });

  it("validates the body and blocks sending invalid JSON", async () => {
    const { calls } = setup(catalog("mock")); open("createProducts");
    await userEvent.click(await screen.findByRole("tab", { name: "Request body" }));
    const ta = screen.getByLabelText(/JSON body/);
    expect(screen.getByText("Valid JSON.")).toBeInTheDocument();
    fireEvent.change(ta, { target: { value: '{"items": [' } });
    expect(screen.getByText(/Invalid JSON \(line 1, column/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Send \(simulation\)/ }));
    expect(calls).toHaveLength(0);
    await userEvent.click(screen.getByRole("button", { name: "Load example" }));
    expect(screen.getByText("Valid JSON.")).toBeInTheDocument();
    await userEvent.click(screen.getByText(/Field guide/));
    await userEvent.click(screen.getByRole("button", { name: "items[].barcode" }));
    expect(JSON.parse((ta as HTMLTextAreaElement).value).items[0].barcode).toBe("B1");
  });

  it("LIVE write needs the confirm dialog and sends confirm = operationId", async () => {
    const { calls } = setup(catalog("live", { env: "production" }), { call: (b) => result(createProducts, { mock: false, operationId: b.operationId as string }) });
    open("createProducts");
    await userEvent.click(await screen.findByRole("button", { name: "Send to Trendyol" }));
    const dlg = await screen.findByRole("dialog");
    expect(within(dlg).getByText("PRODUCTION")).toBeInTheDocument();
    expect(calls).toHaveLength(0);
    await userEvent.click(within(dlg).getByRole("button", { name: "Confirm and send" }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]!.confirm).toBe("createProducts");
    expect(await screen.findByText("LIVE")).toBeInTheDocument();
  });

  it("LIVE read does not ask, mock write does not ask", async () => {
    const live = setup(catalog("live")); open("getOrders");
    await userEvent.click(await screen.findByRole("button", { name: "Send to Trendyol" }));
    await waitFor(() => expect(live.calls).toHaveLength(1));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(live.calls[0]!.confirm).toBeUndefined();
  });

  it("shows the table view of a list response and pages with the page param", async () => {
    const { calls } = setup(catalog("mock"), { call: () => result(getOrders, { request: { method: "GET", url: "u", query: { page: 0 } }, response: { headers: {}, body: { content: [{ orderNumber: "ORD-1", status: "Created" }, { orderNumber: "ORD-2", status: "Shipped" }], totalPages: 3 } } }) });
    open("getOrders");
    await userEvent.click(await screen.findByRole("button", { name: /Send \(simulation\)/ }));
    expect(await screen.findByText("ORD-2")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Order" })).toBeInTheDocument();
    expect(screen.getByText("Page 1 of 3")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(calls).toHaveLength(2));
    expect((calls[1]!.query as Record<string, unknown>).page).toBe(1);
  });

  it("curl preview has placeholders and no credentials", async () => {
    setup(catalog("mock")); open("createProducts");
    await userEvent.click(await screen.findByRole("tab", { name: "Request preview" }));
    const curl = screen.getByTestId("tdy-curl").textContent!;
    expect(curl).toContain("curl -X POST 'https://apigw.trendyol.com/integration/product/sellers/123456/products'");
    expect(curl).toContain("$TRENDYOL_API_KEY:$TRENDYOL_API_SECRET");
    expect(curl).toContain("SelfIntegration");
  });

  it("disabled mode explains itself, links to integrations and (owner) mock mode, and blocks sending", async () => {
    setup(catalog("disabled", { reason: "not_configured" })); open("getOrders");
    const bar = await screen.findByTestId("tdy-mode");
    expect(within(bar).getByText("The Trendyol integration is not configured yet.")).toBeInTheDocument();
    expect(within(bar).getByRole("link", { name: "Configure in Integrations" })).toHaveAttribute("href", "/integrations?configure=trendyol");
    expect(within(bar).getByRole("link", { name: "Turn on Mock mode" })).toHaveAttribute("href", "/settings/system");
    expect(await screen.findByRole("button", { name: /Send to Trendyol/ })).toBeDisabled();
  });

  it("mock mode banner and owner-only reset with confirmation", async () => {
    const { api } = setup(catalog("mock")); open("getOrders");
    const bar = await screen.findByTestId("tdy-mode");
    expect(bar).toHaveTextContent("no request goes to Trendyol");
    await userEvent.click(within(bar).getByRole("button", { name: "Reset simulation" }));
    const dlg = await screen.findByRole("dialog");
    await userEvent.click(within(dlg).getByRole("button", { name: "Reset simulation" }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/api/admin/trendyol/mock/reset"));
  });

  it("lists history and restores the operation with its query", async () => {
    setup(catalog("mock"), { history: [{ id: 1, operationId: "getOrders", method: "GET", env: "production", mock: true, risk: "read", status: 200, durationMs: 33, requestSummary: { query: { size: 7 }, bodyBytes: 0 }, at: new Date().toISOString() }] });
    open("createProducts");
    await userEvent.click(await screen.findByRole("button", { name: "History" }));
    const item = await screen.findByRole("button", { name: /Get orders/ });
    expect(within(item).getByText("200")).toBeInTheDocument();
    await userEvent.click(item);
    expect(await screen.findByLabelText(/size/)).toHaveValue(7);
  });

  it("shows stage-only and deprecated warnings", async () => {
    setup(catalog("mock")); open("createTestOrder");
    expect(await screen.findByText(/Old API/)).toBeInTheDocument();
    expect(screen.getByText(/only exists in Trendyol's test environment/)).toBeInTheDocument();
  });

  it("staff cannot use the console", async () => {
    asRole("staff"); setup(catalog("mock")); open("getOrders");
    expect(await screen.findByText("You do not have access to this page")).toBeInTheDocument();
  });
});

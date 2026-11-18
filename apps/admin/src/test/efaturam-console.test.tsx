import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { EfaturamCallResult, EfaturamCatalogResponse, EfaturamDiagnosis, EfaturamOutgoingRow } from "@openshelf/shared";
import { EFATURAM_OPERATIONS } from "../../../../packages/integrations/efaturam/src/catalog";
import { mockApi, renderRoutes } from "./helpers";
import Efaturam from "../pages/Efaturam";
import { httpsUrl, invoiceAliases, rowsOf, statusKey, statusTone } from "../lib/efaturam";

const UUID = "96a8b0f1-7e10-4a44-8d78-eb961539bb4b";
const cat = (mode: EfaturamCatalogResponse["mode"] = "mock", extra: Partial<EfaturamCatalogResponse> = {}): EfaturamCatalogResponse =>
  ({ mode, environment: "live", operations: EFATURAM_OPERATIONS, ...extra });
const res = (id: string, body: unknown, o: Partial<EfaturamCallResult> = {}): EfaturamCallResult => ({
  ok: true, status: 200, durationMs: 7, mock: true, operationId: id, risk: EFATURAM_OPERATIONS.find((x) => x.id === id)!.risk,
  request: { method: "GET", url: "https://apigateway.trendyolecozum.com/api/x", query: {} }, response: { body }, ...o,
});

type Call = { operationId: string; path?: Record<string, unknown>; query?: Record<string, unknown>; body?: any; confirm?: string };
const OK_DIAG: EfaturamDiagnosis = { ok: true, mock: false, environment: "live", steps: [{ id: "signIn", ok: true, status: 200 }, { id: "token", ok: true, detail: "3 parts" }, { id: "account", ok: true }, { id: "apiCall", ok: true, status: 404 }], claims: ["companyId", "exp", "userId"], companyId: 77, userId: 5, expiresAt: "2100-01-01T00:00:00.000Z" };
const out = (o: Partial<EfaturamOutgoingRow>): EfaturamOutgoingRow => ({ source: "order", id: "i1", type: "e_arsiv", status: "issued", invoiceUuid: UUID, number: "ABC2026000000001", pdfUrl: null, orderId: "o1", orderNumber: "1001", customerName: "Ayşe Yılmaz", total: 24000, currency: "TRY", createdAt: "2026-01-02T10:00:00.000Z", ...o });
let diagnosis: EfaturamDiagnosis = OK_DIAG; let outgoing: EfaturamOutgoingRow[] = []; let outgoingQueries: string[] = [];
function setup(handlers: Record<string, (c: Call) => EfaturamCallResult>, mode: EfaturamCatalogResponse["mode"] = "mock", extra: Partial<EfaturamCatalogResponse> = {}) {
  const calls: Call[] = [];
  mockApi({
    "POST /api/admin/efaturam/diagnose": () => diagnosis,
    "GET /api/admin/efaturam/outgoing": (p) => { const q = new URLSearchParams(String(p).split("?")[1] ?? ""); outgoingQueries.push(q.toString()); const items = outgoing.filter((r) => !q.get("q") || JSON.stringify(r).toLowerCase().includes(q.get("q")!.toLowerCase())); return { items, total: items.length, page: Number(q.get("page") ?? 1), pageSize: 20 }; },
    "GET /api/admin/efaturam/catalog": () => cat(mode, extra),
    "POST /api/admin/efaturam/call": (_p, body) => { const c = body as Call; calls.push(c); const h = handlers[c.operationId]; return h ? h(c) : res(c.operationId, null); },
  });
  return calls;
}
const page = () => renderRoutes({ "/*": <Efaturam /> }, "/");
beforeEach(() => { sessionStorage.clear(); localStorage.clear(); diagnosis = OK_DIAG; outgoing = []; outgoingQueries = []; });

describe("e-Faturam console", () => {
  it("shows the mock banner, the live warning, and the disabled state without sending calls", async () => {
    setup({});
    let r = page();
    expect(await screen.findByTestId("ef-mode")).toHaveTextContent(/nothing is sent to e-faturam/i);
    r.unmount();
    setup({}, "live");
    r = page();
    expect(await screen.findByTestId("ef-mode")).toHaveTextContent(/live environment.*real e-faturam account/i);
    r.unmount();
    setup({}, "live", { environment: "test" });
    r = page();
    expect(await screen.findByTestId("ef-mode")).toHaveTextContent(/test environment/i);
    r.unmount();
    const calls = setup({}, "disabled", { reason: "not_configured" });
    page();
    expect(await screen.findByTestId("ef-mode")).toHaveTextContent(/not configured/i);
    expect(screen.getByRole("link", { name: /configure e-faturam/i })).toHaveAttribute("href", expect.stringContaining("configure=efaturam"));
    await userEvent.type(screen.getByLabelText(/vkn or tckn/i), "1234567890");
    expect(screen.getByRole("button", { name: /^look up$/i })).toBeDisabled();
    expect(calls).toHaveLength(0);
  });

  it("taxpayer lookup: user with alias, non-user (404), and a real error", async () => {
    const calls = setup({
      getTaxPayersByTaxId: (c) => c.path!.taxId === "1234567890" ? res("getTaxPayersByTaxId", [{ alias: "urn:mail:pk@acme.com", title: "Acme A.Ş.", aliasType: "INVOICE" }, { alias: "urn:mail:irsaliye@acme.com", aliasType: "DESPATCH_ADVICE" }])
        : c.path!.taxId === "22222222222" ? res("getTaxPayersByTaxId", { title: "Tax payer not found." }, { ok: false, status: 404, error: { message: "Tax payer not found." } })
        : res("getTaxPayersByTaxId", null, { ok: false, status: 403, error: { message: "Blocked before reaching the gateway (IP not allowed)" } }),
    });
    page();
    const input = await screen.findByLabelText(/vkn or tckn/i);
    const go = screen.getByRole("button", { name: /^look up$/i });
    await userEvent.type(input, "123"); expect(go).toBeDisabled(); // not a tax number yet
    await userEvent.clear(input); await userEvent.type(input, "1234567890"); await userEvent.click(go);
    const box = await screen.findByTestId("ef-taxpayer");
    expect(box).toHaveTextContent(/e-fatura user/i); expect(box).toHaveTextContent("Acme A.Ş."); expect(box).toHaveTextContent("urn:mail:pk@acme.com"); expect(box).not.toHaveTextContent("irsaliye");
    await userEvent.clear(input); await userEvent.type(input, "22222222222"); await userEvent.click(go);
    await waitFor(() => expect(screen.getByTestId("ef-taxpayer")).toHaveTextContent(/not an e-fatura user/i));
    await userEvent.clear(input); await userEvent.type(input, "3333333333"); await userEvent.click(go);
    await waitFor(() => expect(screen.getByTestId("ef-taxpayer")).toHaveTextContent(/HTTP 403: Blocked before reaching the gateway/i));
    expect(calls.map((c) => c.path!.taxId)).toEqual(["1234567890", "22222222222", "3333333333"]);
  });

  it("invoice status: badge, PDF link and e-Arşiv cancel (live asks for confirmation)", async () => {
    let cancelled = false;
    const calls = setup({
      getEArchiveStatus: () => res("getEArchiveStatus", { status: cancelled ? "305" : "205", gibStatus: "REPORTED", invoiceUuid: UUID }),
      getPermanentDocumentDownloadUrl: () => res("getPermanentDocumentDownloadUrl", "https://files.example/inv.pdf"),
      cancelEArchive: () => { cancelled = true; return res("cancelEArchive", null); },
    }, "live");
    page();
    const go = await screen.findByRole("button", { name: /check status/i });
    expect(go).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/ettn/i), UUID);
    await userEvent.click(go);
    const box = await screen.findByTestId("ef-doc");
    expect(box).toHaveTextContent(/205 · Approved/); expect(box).toHaveTextContent("GİB: REPORTED");
    expect(calls[0]).toMatchObject({ operationId: "getEArchiveStatus", path: { invoiceUuid: UUID } });
    await userEvent.click(within(box).getByRole("button", { name: /get pdf link/i }));
    expect(await within(box).findByRole("link", { name: /open the pdf/i })).toHaveAttribute("href", "https://files.example/inv.pdf");
    expect(calls[1]).toMatchObject({ operationId: "getPermanentDocumentDownloadUrl", body: { documentType: "EARCHIVE", fileExtension: "pdf", invoiceUuid: UUID } });
    await userEvent.click(within(box).getByRole("button", { name: /cancel the e-arşiv/i }));
    expect(calls).toHaveLength(2); // destructive on live: nothing sent before confirming
    await userEvent.click(await screen.findByRole("button", { name: /yes, send/i }));
    await waitFor(() => expect(screen.getByTestId("ef-doc")).toHaveTextContent(/305 · Cancelled/));
    expect(calls[2]).toMatchObject({ operationId: "cancelEArchive", confirm: "cancelEArchive", body: { invoiceUuid: UUID } });
    expect(screen.getByTestId("ef-doc")).toHaveTextContent(/the invoice was cancelled/i);
    expect(within(screen.getByTestId("ef-doc")).queryByRole("button", { name: /cancel the e-arşiv/i })).toBeNull();
  });

  it("an e-Fatura is checked on its own endpoint and offers no cancel", async () => {
    const calls = setup({ getOutgoingEInvoiceStatus: () => res("getOutgoingEInvoiceStatus", { status: "50", gibStatusCode: 1300, invoiceUuid: UUID }) });
    page();
    await userEvent.selectOptions(await screen.findByLabelText(/document type/i), "e_fatura");
    await userEvent.type(screen.getByLabelText(/ettn/i), UUID);
    await userEvent.click(screen.getByRole("button", { name: /check status/i }));
    const box = await screen.findByTestId("ef-doc");
    expect(box).toHaveTextContent(/50 · Waiting for reply/); expect(box).toHaveTextContent("GİB: 1300");
    expect(within(box).queryByRole("button", { name: /cancel/i })).toBeNull();
    expect(calls[0]!.operationId).toBe("getOutgoingEInvoiceStatus");
  });

  it("incoming e-Fatura: loads a date range, shows rows, amounts and a PDF link", async () => {
    const calls = setup({
      searchIncomingEInvoice: () => res("searchIncomingEInvoice", { content: [
        { invoiceUuid: UUID, invoiceId: "TED2026000000001", scenario: "TICARIFATURA", status: "50", senderTitle: "Örnek Tedarik A.Ş.", senderTaxId: "1234567890", payableAmount: 120050, currency: "TRY", issuedAt: "2026-01-01T10:00:00Z" },
      ], totalCount: 41, totalPageCount: 3, currentPage: 0, pageSize: 20 }),
      getTemporaryDocumentDownloadUrl: () => res("getTemporaryDocumentDownloadUrl", "https://files.example/in.pdf"),
    });
    page();
    await userEvent.click(await screen.findByRole("tab", { name: /incoming e-fatura/i }));
    fireEvent.change(screen.getByLabelText(/^from$/i), { target: { value: "2026-01-01" } });
    fireEvent.change(screen.getByLabelText(/^to$/i), { target: { value: "2026-01-31" } });
    await userEvent.click(screen.getByRole("button", { name: /^load$/i }));
    const table = await screen.findByTestId("ef-incoming");
    expect(calls[0]).toMatchObject({ operationId: "searchIncomingEInvoice", body: { startDate: "2026-01-01", endDate: "2026-01-31", pagination: { page: 0, size: 20 } } });
    expect(table).toHaveTextContent("TED2026000000001"); expect(table).toHaveTextContent("Örnek Tedarik A.Ş."); expect(table).toHaveTextContent(/50 · Waiting for reply/);
    expect(table).toHaveTextContent(/1\.200,50/); expect(table).toHaveTextContent(/41 invoices in total/); expect(table).toHaveTextContent(/page 1 of 3/i);
    await userEvent.click(within(table).getByRole("button", { name: /^pdf$/i }));
    expect(await within(table).findByRole("link", { name: /pdf/i })).toHaveAttribute("href", "https://files.example/in.pdf");
    expect(calls[1]).toMatchObject({ operationId: "getTemporaryDocumentDownloadUrl", body: { documentType: "INCOMING_EINVOICE", invoiceUuid: UUID } });
    await userEvent.click(within(table).getByRole("button", { name: "›" }));
    await waitFor(() => expect(calls[2]).toMatchObject({ body: { pagination: { page: 1 } } }));
  });

  it("explorer: example body is pre-filled, params are sent, invalid JSON is rejected locally, live writes confirm", async () => {
    const calls = setup({ createEArchive: () => res("createEArchive", { invoiceUuid: UUID, invoiceId: "ABC2026000000001" }, { request: { method: "POST", url: "https://apigateway.trendyolecozum.com/api/invoice/documents/earchive", query: {}, body: { companyId: 77 } } }) }, "live");
    page();
    await userEvent.click(await screen.findByRole("tab", { name: /api explorer/i }));
    const select = await screen.findByLabelText(/^operation$/i);
    await userEvent.type(screen.getByLabelText(/^taxId/), "1234567890");
    await userEvent.click(screen.getByRole("button", { name: /send request/i }));
    await waitFor(() => expect(calls[0]).toMatchObject({ operationId: "getTaxPayersByTaxId", path: { taxId: "1234567890" } }));
    expect(calls[0]!.confirm).toBeUndefined(); // read call: no confirmation
    await userEvent.selectOptions(select, "createEArchive");
    expect(screen.getByText(/^issues a real invoice$/i)).toBeInTheDocument(); // the "billed" badge
    const body = screen.getByLabelText(/request body/i) as HTMLTextAreaElement;
    expect(JSON.parse(body.value)).toMatchObject({ invoiceInfo: { invoiceType: "EARSIVFATURA" }, invoiceTotal: { payableAmount: 12000 } });
    fireEvent.change(body, { target: { value: "{not json" } });
    await userEvent.click(screen.getByRole("button", { name: /send request/i }));
    expect(await screen.findByText(/not valid json/i)).toBeInTheDocument();
    fireEvent.change(body, { target: { value: '{"localReferenceId":"T-1"}' } });
    await userEvent.click(screen.getByRole("button", { name: /send request/i }));
    expect(await screen.findByText(/createEArchive issues a REAL invoice.*Continue\?/)).toBeInTheDocument(); // confirmation dialog
    expect(calls).toHaveLength(1);
    await userEvent.click(screen.getByRole("button", { name: /yes, send/i }));
    expect(await screen.findByTestId("ef-response")).toHaveTextContent("HTTP 200");
    expect(calls[1]).toMatchObject({ operationId: "createEArchive", confirm: "createEArchive", body: { localReferenceId: "T-1" } });
  });
});

describe("e-Faturam console: connection diagnosis", () => {
  it("shows every step and the account ids when the connection works", async () => {
    setup({}, "live");
    page();
    await userEvent.click(await screen.findByRole("button", { name: /diagnose the connection/i }));
    const box = await screen.findByTestId("ef-conn");
    expect(box).toHaveAttribute("data-state", "ok");
    expect([...box.querySelectorAll("li")].map((li) => li.getAttribute("data-state"))).toEqual(["ok", "ok", "ok", "ok"]);
    expect(box).toHaveTextContent("companyId 77, userId 5"); expect(box).toHaveTextContent(/the connection works/i);
    expect(box).toHaveTextContent("companyId, exp, userId");
  });
  it("signed in but the API call is refused: names the step, the provider text and the code", async () => {
    diagnosis = { ok: false, mock: false, environment: "live", companyId: 77, userId: 5, steps: [{ id: "signIn", ok: true, status: 200 }, { id: "token", ok: true }, { id: "account", ok: true }, { id: "apiCall", ok: false, status: 401, code: "username-or-password-wrong", detail: "Username or Password is wrong." }] };
    setup({}, "live");
    page();
    await userEvent.click(await screen.findByRole("button", { name: /diagnose the connection/i }));
    const box = await screen.findByTestId("ef-conn");
    expect(box).toHaveAttribute("data-state", "fail");
    expect(box.querySelector('[data-step="apiCall"]')).toHaveTextContent("HTTP 401 Username or Password is wrong. [username-or-password-wrong]");
    expect(box.querySelector('[data-step="signIn"]')).toHaveAttribute("data-state", "ok");
    expect(box).toHaveTextContent(/refuses this account's api call/i);
  });
  it("a rejected sign-in stops there; an IP block is called an IP block", async () => {
    diagnosis = { ok: false, mock: false, environment: "live", steps: [{ id: "signIn", ok: false, status: 401, code: "username-or-password-wrong", detail: "Username or Password is wrong." }] };
    setup({}, "live");
    const r = page();
    await userEvent.click(await screen.findByRole("button", { name: /diagnose the connection/i }));
    let box = await screen.findByTestId("ef-conn");
    expect([...box.querySelectorAll("li")].map((li) => li.getAttribute("data-state"))).toEqual(["fail", "skipped", "skipped", "skipped"]);
    expect(box).toHaveTextContent(/sign-in was rejected/i);
    r.unmount();
    diagnosis = { ok: false, mock: false, environment: "test", steps: [{ id: "signIn", ok: false, status: 403, code: "blocked", detail: "Blocked before reaching the gateway (IP not allowed)" }] };
    setup({}, "live", { environment: "test" });
    page();
    await userEvent.click(await screen.findByRole("button", { name: /diagnose the connection/i }));
    box = await screen.findByTestId("ef-conn");
    expect(box).toHaveTextContent(/this is an ip block/i);
  });
});

describe("e-Faturam console: outgoing invoices", () => {
  it("lists the store's invoices with links, and checks each row at the gateway", async () => {
    outgoing = [
      out({}),
      out({ source: "manual", id: "m1", type: "e_fatura", invoiceUuid: "11111111-2222-4333-8444-555555555555", number: "EFT2026000000007", orderId: null, orderNumber: null, customerName: "Acme A.Ş.", total: 60000, pdfUrl: "https://files.example/m1.pdf" }),
      out({ id: "i3", status: "pending", invoiceUuid: null, number: null, orderNumber: "1003", orderId: "o3" }),
    ];
    const calls = setup({
      getEArchiveStatus: () => res("getEArchiveStatus", { status: "205", invoiceUuid: UUID }),
      getOutgoingEInvoiceStatus: () => res("getOutgoingEInvoiceStatus", null, { ok: false, status: 404, error: { message: "Outgoing e-invoice not found.", code: "outgoing-einvoice-not-found" } }),
      getPermanentDocumentDownloadUrl: () => res("getPermanentDocumentDownloadUrl", "https://files.example/i1.pdf"),
    });
    page();
    await userEvent.click(await screen.findByRole("tab", { name: /outgoing invoices/i }));
    const table = await screen.findByTestId("ef-outgoing");
    const row = (k: string) => table.querySelector(`[data-row="${k}"]`) as HTMLElement;
    expect(row("order:i1")).toHaveTextContent("ABC2026000000001"); expect(row("order:i1")).toHaveTextContent("Ayşe Yılmaz"); expect(row("order:i1")).toHaveTextContent(/240,00/);
    expect(within(row("order:i1")).getByRole("link", { name: "#1001" })).toHaveAttribute("href", expect.stringContaining("/orders/o1"));
    expect(within(row("manual:m1")).getByRole("link", { name: /manual invoice/i })).toHaveAttribute("href", expect.stringContaining("/invoices/m1"));
    expect(within(row("manual:m1")).getByRole("link", { name: /pdf/i })).toHaveAttribute("href", "https://files.example/m1.pdf"); // stored link, no call needed
    expect(row("order:i3")).toHaveTextContent(/pending/i); expect(row("order:i3")).toHaveTextContent(/no ettn/i);
    expect(within(row("order:i3")).queryByRole("button")).toBeNull();

    await userEvent.click(within(row("order:i1")).getByRole("button", { name: /^check$/i }));
    await waitFor(() => expect(row("order:i1")).toHaveTextContent(/205 · Approved/));
    expect(calls[0]).toMatchObject({ operationId: "getEArchiveStatus", path: { invoiceUuid: UUID } });
    await userEvent.click(within(row("order:i1")).getByRole("button", { name: /^pdf$/i }));
    expect(await within(row("order:i1")).findByRole("link", { name: /pdf/i })).toHaveAttribute("href", "https://files.example/i1.pdf");
    expect(calls[1]).toMatchObject({ operationId: "getPermanentDocumentDownloadUrl", body: { documentType: "EARCHIVE", invoiceUuid: UUID } });

    await userEvent.click(screen.getByRole("button", { name: /check this page/i }));
    await waitFor(() => expect(row("manual:m1")).toHaveTextContent("HTTP 404: Outgoing e-invoice not found. [outgoing-einvoice-not-found]"));
    expect(calls.slice(2).map((c) => c.operationId)).toEqual(["getEArchiveStatus", "getOutgoingEInvoiceStatus"]); // rows without an ETTN are skipped
  });
  it("searches, and explains an empty list", async () => {
    outgoing = [out({}), out({ id: "i2", number: "ABC2026000000002", customerName: "Mehmet Kaya", orderNumber: "1002" })];
    setup({});
    const r = page();
    await userEvent.click(await screen.findByRole("tab", { name: /outgoing invoices/i }));
    expect(await screen.findByTestId("ef-outgoing")).toHaveTextContent("Mehmet Kaya");
    await userEvent.type(screen.getByLabelText(/^search$/i), "mehmet");
    await waitFor(() => expect(screen.getByTestId("ef-outgoing")).not.toHaveTextContent("Ayşe Yılmaz"));
    expect(outgoingQueries.some((q) => q.includes("q=mehmet"))).toBe(true);
    await userEvent.clear(screen.getByLabelText(/^search$/i)); await userEvent.type(screen.getByLabelText(/^search$/i), "zzz");
    expect(await screen.findByText(/no invoice matches the search/i)).toBeInTheDocument();
    r.unmount();
    outgoing = []; setup({});
    page();
    await userEvent.click(await screen.findByRole("tab", { name: /outgoing invoices/i }));
    expect(await screen.findByText(/no invoice has been issued through e-faturam yet/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /check this page/i })).toBeDisabled();
  });
});

describe("e-Faturam helpers", () => {
  it("status, rows, aliases, links", () => {
    expect(statusKey("205")).toBe("efaturam.status.205"); expect(statusKey(205)).toBe("efaturam.status.205"); expect(statusKey("999")).toBeUndefined();
    expect([statusTone("205"), statusTone("405"), statusTone("305"), statusTone("50"), statusTone("30")]).toEqual(["success", "danger", "neutral", "warning", "info"]);
    expect(rowsOf(res("searchIncomingEInvoice", { content: [{ a: 1 }], totalCount: 1 }))).toEqual([{ a: 1 }]);
    expect(rowsOf(res("searchIncomingEInvoice", { invoices: [{ a: 2 }], totalCount: 1 }))).toEqual([{ a: 2 }]); // undocumented list key
    expect(rowsOf(res("searchIncomingEInvoice", null))).toEqual([]); expect(rowsOf(null)).toEqual([]);
    expect(invoiceAliases(res("getTaxPayersByTaxId", [{ alias: "a", aliasType: "INVOICE", deletedAt: "2025-01-01" }, { alias: "b", aliasType: "INVOICE" }]))).toEqual([{ alias: "b", title: undefined }]);
    expect(httpsUrl('"https://x.example/a.pdf"')).toBe("https://x.example/a.pdf"); expect(httpsUrl("javascript:alert(1)")).toBeUndefined(); expect(httpsUrl("http://x")).toBeUndefined(); expect(httpsUrl(null)).toBeUndefined();
  });
});

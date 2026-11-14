import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { EfaturamCallResult, EfaturamCatalogResponse } from "@openshelf/shared";
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
function setup(handlers: Record<string, (c: Call) => EfaturamCallResult>, mode: EfaturamCatalogResponse["mode"] = "mock", extra: Partial<EfaturamCatalogResponse> = {}) {
  const calls: Call[] = [];
  mockApi({
    "GET /api/admin/efaturam/catalog": () => cat(mode, extra),
    "POST /api/admin/efaturam/call": (_p, body) => { const c = body as Call; calls.push(c); const h = handlers[c.operationId]; return h ? h(c) : res(c.operationId, null); },
  });
  return calls;
}
const page = () => renderRoutes({ "/*": <Efaturam /> }, "/");
beforeEach(() => { sessionStorage.clear(); localStorage.clear(); });

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

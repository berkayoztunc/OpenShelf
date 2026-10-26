import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { computeInvoiceTotals } from "@openshelf/shared";
import InvoiceEditor from "../pages/InvoiceEditor";
import { ApiError } from "../lib/api";
import { describeInvoiceError, emptyForm, emptyLine, totalsOf } from "../lib/invoices";
import { money } from "../lib/format";
import { setLocale } from "../i18n";
import { asRole, mockApi, renderRoutes, withSettings } from "./helpers";

const routes = { "/invoices/new": <InvoiceEditor />, "/invoices/:id": <InvoiceEditor /> };
const PREVIEW = { lines: [], net: 0, taxTotal: 0, total: 0, currency: "TRY", pricesIncludeTax: true, type: "e_arsiv", typeSource: "rule", warnings: [{ code: "zero_tax_without_note", message: "server text" }] };
const ISSUED = { id: "mi1", status: "issued", type: "e_arsiv", number: "MOCK-1", provider: "efaturam", pdfUrl: null, orderId: null, issuedAt: new Date().toISOString(), createdAt: new Date().toISOString(),
  customer: { name: "Ayse", address: "Moda Cad. 1", city: "Istanbul", isCompany: false }, lines: [{ name: "Item", quantity: 1, unitPrice: 1000, taxRate: 20, discount: 0 }], pricesIncludeTax: true, currency: "TRY", issueDate: null, notes: null, error: null, total: 1000, taxTotal: 167,
  computed: { lines: [], net: 833, tax: 167, total: 1000 } };

beforeEach(() => { asRole("owner"); withSettings(false); });
afterEach(() => vi.restoreAllMocks());

async function fillCustomer(u: ReturnType<typeof userEvent.setup>) {
  await u.type(screen.getByLabelText(/full name/i), "Ayse Demir");
  await u.type(screen.getByLabelText(/^Address/), "Moda Cad. No 1");
  await u.type(screen.getByLabelText(/^City/), "Istanbul");
}
async function addLine(u: ReturnType<typeof userEvent.setup>, name: string, price: string, qty = "1") {
  await u.click(screen.getByRole("button", { name: "Add custom line" }));
  const n = screen.getAllByLabelText(/^Line \d+ name$/).length;
  await u.type(screen.getByLabelText(`Line ${n} name`), name);
  await u.clear(screen.getByLabelText(`Line ${n} unit price`)); await u.type(screen.getByLabelText(`Line ${n} unit price`), price);
  await u.clear(screen.getByLabelText(`Line ${n} quantity`)); await u.type(screen.getByLabelText(`Line ${n} quantity`), qty);
}

describe("manual invoice editor totals", () => {
  it("live summary equals computeInvoiceTotals and reacts to price, quantity and discount edits", async () => {
    mockApi({ "POST /api/admin/manual-invoices/preview": () => PREVIEW });
    const u = userEvent.setup(); renderRoutes(routes, "/invoices/new");
    await addLine(u, "Widget", "100", "3");
    const expected = (price: number, qty: number, discount = 0, rate = 20) => computeInvoiceTotals([{ name: "x", quantity: qty, unitPrice: price, taxRate: rate, discount }], true);
    expect(screen.getByTestId("sum-total")).toHaveTextContent(money(expected(10000, 3).total));
    expect(screen.getByTestId("sum-net")).toHaveTextContent(money(expected(10000, 3).net));
    expect(screen.getByTestId("sum-kdv-20")).toHaveTextContent(money(expected(10000, 3).tax));
    await u.clear(screen.getByLabelText("Line 1 unit price")); await u.type(screen.getByLabelText("Line 1 unit price"), "99,99");
    expect(screen.getByTestId("sum-total")).toHaveTextContent(money(expected(9999, 3).total));
    await u.clear(screen.getByLabelText("Line 1 quantity")); await u.type(screen.getByLabelText("Line 1 quantity"), "2");
    await u.clear(screen.getByLabelText("Line 1 discount")); await u.type(screen.getByLabelText("Line 1 discount"), "10");
    expect(screen.getByTestId("sum-total")).toHaveTextContent(money(expected(9999, 2, 1000).total));
    await u.clear(screen.getByLabelText("Line 1 KDV percent")); await u.type(screen.getByLabelText("Line 1 KDV percent"), "10");
    expect(screen.getByTestId("sum-kdv-10")).toHaveTextContent(money(expected(9999, 2, 1000, 10).tax));
  });

  it("totalsOf groups KDV per rate and matches the shared function", () => {
    const f = emptyForm(); f.lines = [emptyLine({ name: "a", price: "10.00", taxRate: "20" }), emptyLine({ name: "b", price: "5.50", quantity: "2", taxRate: "10" })];
    const t = totalsOf(f);
    expect(t.total).toBe(computeInvoiceTotals([{ name: "a", quantity: 1, unitPrice: 1000, taxRate: 20, discount: 0 }, { name: "b", quantity: 2, unitPrice: 550, taxRate: 10, discount: 0 }], true).total);
    expect(t.byRate.map((r) => r.rate)).toEqual([10, 20]);
  });

  it("adds and removes custom lines, and shows server warnings plus the resolved type", async () => {
    mockApi({ "POST /api/admin/manual-invoices/preview": () => PREVIEW });
    const u = userEvent.setup(); renderRoutes(routes, "/invoices/new");
    await fillCustomer(u);
    await addLine(u, "Shipping", "39,90"); await addLine(u, "Packaging", "5");
    expect(screen.getAllByLabelText(/^Line \d+ name$/)).toHaveLength(2);
    await u.click(screen.getByRole("button", { name: "Remove line 1" }));
    expect(screen.getAllByLabelText(/^Line \d+ name$/)).toHaveLength(1);
    expect(screen.getByLabelText("Line 1 name")).toHaveValue("Packaging");
    expect(await screen.findByText(/Tax rate is 0% and no exemption note is set/, undefined, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.getAllByText("e-Arşiv").length).toBeGreaterThan(0);
  });

  it("prefills a line from the catalog typeahead with editable price", async () => {
    mockApi({
      "GET /api/admin/catalog-lookup": () => ({ items: [{ variantId: "v1", sku: "SKU-1", productName: "Lamp", variantTitle: "Default", unitPrice: 12345, taxRate: 10, stock: 4 }] }),
      "POST /api/admin/manual-invoices/preview": () => PREVIEW,
    });
    const u = userEvent.setup(); renderRoutes(routes, "/invoices/new");
    await u.type(screen.getByLabelText("Add product from catalog"), "lam");
    await u.click(await screen.findByRole("option", { name: /Lamp/ }));
    expect(screen.getByLabelText("Line 1 name")).toHaveValue("Lamp");
    expect(screen.getByLabelText("Line 1 unit price")).toHaveValue("123.45");
    expect(screen.getByLabelText("Line 1 KDV percent")).toHaveValue("10");
    expect(screen.getByText("SKU SKU-1")).toBeInTheDocument();
  });
});

describe("issue flow", () => {
  async function ready(issue: () => unknown) {
    const m = mockApi({
      "POST /api/admin/manual-invoices/preview": () => PREVIEW,
      "POST /api/admin/manual-invoices$": () => ({ id: "mi1" }),
      "PUT /api/admin/manual-invoices/mi1": () => ({ id: "mi1" }),
      "POST /api/admin/manual-invoices/mi1/issue": issue,
      "GET /api/admin/manual-invoices/mi1": () => ISSUED,
    });
    const u = userEvent.setup(); renderRoutes({ ...routes, "/integrations": <p>Integrations hub</p> }, "/invoices/new");
    await fillCustomer(u); await addLine(u, "Service", "100");
    await u.click(screen.getByRole("button", { name: "Issue invoice" }));
    return { m, u };
  }

  it("confirms with customer, type, total and the legal warning, then issues and shows the result", async () => {
    const { m, u } = await ready(() => ISSUED);
    const dlg = await screen.findByRole("dialog");
    expect(within(dlg).getByText("Ayse Demir")).toBeInTheDocument();
    expect(within(dlg).getByText(money(10000))).toBeInTheDocument();
    expect(dlg).toHaveTextContent("legally binding invoice via e-Faturam and cannot be edited afterwards");
    await u.click(within(dlg).getByRole("button", { name: "Issue invoice" }));
    await waitFor(() => expect(m.post).toHaveBeenCalledWith("/api/admin/manual-invoices/mi1/issue"));
    expect(await screen.findByTestId("issued-panel")).toHaveTextContent("MOCK-1");
    expect(screen.getByRole("button", { name: "Cancel invoice" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Print/ })).toBeInTheDocument();
  });

  it("maps 409 no_invoicing_provider to a link to the Integrations hub", async () => {
    const { u } = await ready(() => new ApiError(409, "no_invoicing_provider", "none"));
    await u.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Issue invoice" }));
    const alert = await screen.findByText(/No invoicing provider is enabled/);
    expect(within(alert.closest("[role=alert]") as HTMLElement).getByRole("link", { name: "Open Integrations" })).toHaveAttribute("href", "/integrations");
  });

  it("maps 502 issue_failed to a message with Retry", async () => {
    const { u } = await ready(() => new ApiError(502, "issue_failed", "VKN not registered"));
    await u.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Issue invoice" }));
    expect(await screen.findByText(/VKN not registered/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("describeInvoiceError covers the documented codes", () => {
    expect(describeInvoiceError(new ApiError(409, "issue_in_progress", "x")).message).toMatch(/already being issued/);
    expect(describeInvoiceError(new ApiError(409, "already_issued", "x")).message).toMatch(/already been issued/);
    expect(describeInvoiceError(new ApiError(400, "zero_total", "x")).message).toMatch(/zero/);
    expect(describeInvoiceError(new ApiError(429, "rate_limited", "x")).message).toMatch(/30/);
  });
});

describe("roles", () => {
  it("staff cannot issue or save (disabled with explanation) but can still preview", async () => {
    vi.restoreAllMocks(); asRole("staff"); withSettings(false);
    mockApi({ "POST /api/admin/manual-invoices/preview": () => PREVIEW });
    renderRoutes(routes, "/invoices/new");
    const issue = screen.getByRole("button", { name: "Issue invoice" });
    expect(issue).toBeDisabled();
    expect(issue).toHaveAttribute("title", expect.stringMatching(/owners and admins/));
    expect(screen.getByRole("button", { name: "Save draft" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Preview" })).toBeEnabled();
  });
});

describe("Turkish rendering", () => {
  it("shows Turkish labels, help popovers, translated warnings and the consequence text before issuing", async () => {
    setLocale("tr");
    mockApi({ "POST /api/admin/manual-invoices/preview": () => PREVIEW, "POST /api/admin/manual-invoices$": () => ({ id: "mi1" }), "PUT /api/admin/manual-invoices/mi1": () => ({ id: "mi1" }) });
    const u = userEvent.setup(); renderRoutes(routes, "/invoices/new");
    expect(screen.getByRole("heading", { name: "Yeni manuel fatura" })).toBeInTheDocument();
    expect(screen.getByLabelText(/^Ad soyad/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Taslağı kaydet" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Açıklamayı göster" }).length).toBeGreaterThan(5);
    await u.type(screen.getByLabelText(/^Ad soyad/), "Ayse Demir");
    await u.type(screen.getByLabelText(/^Adres/), "Moda Cad. No 1");
    await u.type(screen.getByLabelText(/^Şehir/), "Istanbul");
    await u.click(screen.getByRole("button", { name: "Özel satır ekle" }));
    await u.type(screen.getByLabelText("1. satır adı"), "Hizmet");
    await u.clear(screen.getByLabelText("1. satır birim fiyatı")); await u.type(screen.getByLabelText("1. satır birim fiyatı"), "100");
    expect(await screen.findByText(/KDV oranı %0 ve muafiyet notu yok/, undefined, { timeout: 3000 })).toBeInTheDocument();
    await u.click(screen.getByRole("button", { name: "Fatura kes" }));
    const dlg = await screen.findByRole("dialog");
    expect(dlg).toHaveTextContent("hukuken bağlayıcı bir fatura oluşturur; sonradan düzenlenemez, yalnızca iptal edilebilir");
    expect(dlg.textContent).not.toMatch(/e_arsiv|e_fatura/);
  });
  it("describeInvoiceError speaks Turkish", () => {
    setLocale("tr");
    expect(describeInvoiceError(new ApiError(409, "already_issued", "x")).message).toMatch(/zaten kesilmiş/);
  });
});

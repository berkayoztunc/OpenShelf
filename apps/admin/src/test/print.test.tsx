import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CODE128_PATTERNS, code128Pattern, code128Values } from "../lib/barcode";
import { mapPool, parseIds } from "../lib/print";
import { InvoiceDoc, LabelDoc, manualInvoiceData, orderInvoiceData, PackingDoc } from "../pages/print/docs";
import PrintPage from "../pages/print/PrintPage";
import type { RawOrder } from "../lib/rawOrder";
import { Code128 } from "../pages/print/Barcode";
import { setLocale } from "../i18n";
import { mockApi, renderRoutes, withSettings, asRole } from "./helpers";

const seller = { name: "Demo Store", address: "Store Street 1", taxId: "1111111111" };
const order = (over: Partial<RawOrder> = {}): RawOrder => ({
  id: "o1", number: "DEMO-1", source: "website", status: "paid", email: "z@example.com", createdAt: "2026-10-20T10:00:00Z", currency: "TRY",
  shippingAddress: { name: "Zeynep", surname: "Kaya", phone: "+905551112233", line1: "Alsancak 5", city: "Izmir", district: "Konak", zip: "35220" },
  billingAddress: { name: "Atlas Ltd", line1: "OSB 22", city: "Istanbul", isCompany: true, taxId: "1234567890", taxOffice: "Esenyurt VD" },
  subtotal: 12000, discountTotal: 0, shippingTotal: 0, taxTotal: 2000, total: 12000,
  items: [{ id: "i1", sku: "SKU-9", name: "Lamp", quantity: 2, unitPrice: 6000, taxRate: 20 }],
  payments: [], shipments: [{ id: "s1", carrier: "Yurtici", trackingNumber: "YK7845120033", status: "created" }], invoices: [], ...over,
});

describe("CODE128 encoder", () => {
  it("table is well formed: 107 patterns, every symbol 11 modules wide (stop 13)", () => {
    expect(CODE128_PATTERNS).toHaveLength(107);
    CODE128_PATTERNS.forEach((p, i) => expect([...p].reduce((a, c) => a + Number(c), 0)).toBe(i === 106 ? 13 : 11));
  });
  it("known answer: 'A' in subset B = start B, 'A'(33), checksum 34, stop", () => {
    expect(code128Values("A")).toEqual([104, 33, 34, 106]);
    expect(code128Pattern("A")).toBe("211214" + "111323" + "131123" + "2331112");
  });
  it("uses subset C for even-length digit strings; checksum is mod 103", () => {
    expect(code128Values("1234")).toEqual([105, 12, 34, (105 + 12 + 68) % 103, 106]);
    expect(code128Values("YK7845120033")[0]).toBe(104);
    expect(() => code128Values("")).toThrow();
    expect(() => code128Values("é")).toThrow();
  });
  it("renders an accessible SVG", () => {
    render(<Code128 value="ABC123" />);
    expect(screen.getByRole("img", { name: "Barcode ABC123" }).querySelectorAll("rect").length).toBeGreaterThan(10);
  });
});

describe("print helpers", () => {
  it("parseIds trims, dedupes and caps at 50", () => {
    expect(parseIds(" a, b ,a,,c ").ids).toEqual(["a", "b", "c"]);
    const many = parseIds(Array.from({ length: 60 }, (_, i) => `id${i}`).join(","));
    expect(many.ids).toHaveLength(50); expect(many.truncated).toBe(true);
  });
  it("mapPool respects the concurrency cap and settles failures", async () => {
    let live = 0, peak = 0;
    const res = await mapPool([1, 2, 3, 4, 5, 6], 2, async (n) => { live++; peak = Math.max(peak, live); await new Promise((r) => setTimeout(r, 5)); live--; if (n === 3) throw new Error("boom"); return n; });
    expect(peak).toBeLessThanOrEqual(2);
    expect(res.map((r) => r.status)).toEqual(["fulfilled", "fulfilled", "rejected", "fulfilled", "fulfilled", "fulfilled"]);
  });
});

describe("documents", () => {
  it("label shows recipient, carrier, tracking barcode and order number", () => {
    render(<LabelDoc order={order()} seller={seller} />);
    expect(screen.getByText("Zeynep Kaya")).toBeInTheDocument();
    expect(screen.getByText("Yurtici")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Barcode YK7845120033" })).toBeInTheDocument();
    expect(screen.getByText("#DEMO-1")).toBeInTheDocument();
  });
  it("packing slip has no prices by default and shows them on request", () => {
    const { rerender } = render(<PackingDoc order={order()} seller={seller} showPrices={false} />);
    expect(screen.getByText("Lamp")).toBeInTheDocument(); expect(screen.getByText("SKU-9")).toBeInTheDocument();
    expect(screen.queryByText(/₺/)).toBeNull(); expect(screen.queryByText(/Unit/)).toBeNull();
    rerender(<PackingDoc order={order()} seller={seller} showPrices />);
    expect(screen.getAllByText(/₺/).length).toBeGreaterThan(0);
  });
  it("invoice copy says 'Not invoiced yet' without an issued invoice, and shows the number with one", () => {
    const { unmount } = render(<InvoiceDoc data={orderInvoiceData(order(), seller, 20)} />);
    expect(screen.getByTestId("invoice-number")).toHaveTextContent("Not invoiced yet");
    expect(document.querySelector(".pr-watermark")).not.toBeNull();
    expect(screen.getByText(/Informational copy/)).toBeInTheDocument();
    unmount();
    render(<InvoiceDoc data={orderInvoiceData(order({ invoices: [{ id: "x", type: "e_fatura", number: "OSF2026000000001", status: "issued", pdfUrl: "https://x.example/a.pdf" }] }), seller, 20)} />);
    expect(screen.getByTestId("invoice-number")).toHaveTextContent("OSF2026000000001");
    expect(document.querySelector(".pr-watermark")).toBeNull();
    expect(screen.getByText("VKN 1234567890")).toBeInTheDocument(); expect(screen.getByText(/Esenyurt VD/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open official PDF" })).toHaveAttribute("href", "https://x.example/a.pdf");
  });
  it("order discount + shipping reconcile to the order total", () => {
    const o = order({ discountTotal: 1000, shippingTotal: 2000, total: 13000 });
    render(<InvoiceDoc data={orderInvoiceData(o, seller, 20)} />);
    expect(screen.getByTestId("invoice-total").textContent).toBe(new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(130));
  });
  it("manual invoice data maps to the same template", () => {
    const d = manualInvoiceData({ id: "m", status: "issued", type: "e_arsiv", number: "N1", customer: { name: "A", address: "Addr 1", city: "Ist", isCompany: false }, lines: [{ name: "Svc", quantity: 1, unitPrice: 1200, taxRate: 20, discount: 0 }], pricesIncludeTax: true, currency: "TRY", issueDate: null, notes: null, provider: "x", error: null, pdfUrl: null, orderId: null, issuedAt: "2026-10-01T00:00:00Z", createdAt: "2026-10-01T00:00:00Z", total: 1200, taxTotal: 200, computed: { lines: [], net: 1000, tax: 200, total: 1200 } }, seller);
    render(<InvoiceDoc data={d} />);
    expect(screen.getByTestId("invoice-number")).toHaveTextContent("N1");
  });
});

describe("print page", () => {
  beforeEach(() => { asRole("owner"); withSettings(false); });
  afterEach(() => vi.restoreAllMocks());
  it("hides the toolbar in print, never auto-prints, and tolerates missing ids", async () => {
    const printSpy = vi.fn(); vi.stubGlobal("print", printSpy);
    mockApi({ "GET /api/admin/orders/o1": () => order(), "GET /api/admin/orders/ghost": () => new Error("Order not found") });
    const u = userEvent.setup();
    renderRoutes({ "/print/:kind": <PrintPage /> }, "/print/label?ids=o1,ghost");
    expect(await screen.findByTestId("label-doc")).toBeInTheDocument();
    expect(screen.getByTestId("print-toolbar").className).toContain("print:hidden");
    expect(await screen.findByRole("alert")).toHaveTextContent(/ghost/);
    expect(printSpy).not.toHaveBeenCalled();
    await u.click(screen.getByRole("button", { name: /Print/ }));
    expect(printSpy).toHaveBeenCalledTimes(1);
    expect(document.querySelectorAll("style").length).toBeGreaterThan(0);
    await waitFor(() => expect(Array.from(document.querySelectorAll("style")).some((s) => s.textContent?.includes("100mm 150mm"))).toBe(true));
    vi.unstubAllGlobals();
  });
  it("packing page toggles prices", async () => {
    mockApi({ "GET /api/admin/orders/o1": () => order() });
    const u = userEvent.setup(); renderRoutes({ "/print/:kind": <PrintPage /> }, "/print/packing?ids=o1");
    await screen.findByTestId("packing-doc");
    expect(screen.queryByText(/₺/)).toBeNull();
    await u.click(screen.getByLabelText("Show prices"));
    expect(screen.getAllByText(/₺/).length).toBeGreaterThan(0);
  });
});

describe("Turkish print documents", () => {
  it("label and invoice put Turkish first and keep the other language", () => {
    setLocale("tr");
    const { unmount } = render(<LabelDoc order={order()} seller={seller} />);
    expect(screen.getByText("Gönderici / Sender")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Barkod YK7845120033" })).toBeInTheDocument();
    unmount();
    render(<InvoiceDoc data={orderInvoiceData(order(), seller, 20)} />);
    expect(screen.getByTestId("invoice-number")).toHaveTextContent("Henüz faturalanmadı");
    expect(screen.getByText("Fatura Kopyası / Invoice copy")).toBeInTheDocument();
    expect(screen.getByText(/Bilgi amaçlı kopyadır/)).toBeInTheDocument();
  });
});

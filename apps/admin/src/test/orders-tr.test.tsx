import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Orders from "../pages/Orders";
import OrderDetail from "../pages/OrderDetail";
import { setLocale } from "../i18n";
import { asRole, mockApi, renderRoutes } from "./helpers";

const LIST = { items: [{ id: "o1", number: "DEMO-1001", source: "website", status: "awaiting_payment", email: "a@b.co", createdAt: Math.floor(Date.now() / 1000), currency: "TRY", total: 349400, customerName: "Ayşe Kaya", isMock: true }], page: 1, pageSize: 20, total: 1 };
const DETAIL = { id: "o1", number: "DEMO-1001", source: "website", status: "paid", email: "a@b.co", createdAt: Math.floor(Date.now() / 1000), currency: "TRY", subtotal: 1000, discountTotal: 0, shippingTotal: 0, taxTotal: 167, total: 1000,
  shippingAddress: { name: "Ayşe", surname: "Kaya", phone: "1", line1: "x", city: "y" }, items: [{ id: "i1", sku: "S1", name: "Vazo", quantity: 1, unitPrice: 1000, taxRate: 20 }],
  payments: [{ id: "p1", provider: "iyzico", status: "succeeded", amount: 1000, isMock: false }], shipments: [], invoices: [], events: [] };

beforeEach(() => { asRole("owner"); setLocale("tr"); });
afterEach(() => vi.restoreAllMocks());

describe("orders in Turkish", () => {
  it("list shows human status and Turkish labels, no raw codes", async () => {
    mockApi({ "GET /api/admin/orders": () => LIST });
    renderRoutes({ "/orders": <Orders /> }, "/orders");
    expect(await screen.findByText("Ödeme bekleniyor", { selector: "span" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Siparişler" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Müşteri" })).toBeInTheDocument();
    expect(screen.getAllByText("Web sitesi").length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toMatch(/awaiting_payment/);
    expect(screen.getAllByRole("button", { name: "Açıklamayı göster" }).length).toBeGreaterThan(0);
  });
  it("detail: Turkish buttons, human statuses, cancel confirmation explains consequences", async () => {
    mockApi({ "GET /api/admin/orders/o1/notifications": () => ({ items: [] }), "GET /api/admin/orders/o1": () => DETAIL });
    const u = userEvent.setup(); renderRoutes({ "/orders/:id": <OrderDetail /> }, "/orders/o1");
    expect(await screen.findByRole("heading", { name: "Sipariş #DEMO-1001" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "İade et" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Fatura kes" })).toBeInTheDocument();
    expect(screen.getAllByText("Başarılı").length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toMatch(/succeeded|fulfilling/);
    await u.click(screen.getByRole("button", { name: "İptal edildi" }));
    expect(await screen.findByRole("dialog")).toHaveTextContent("ÖDEME OTOMATİK İADE EDİLMEZ");
    await u.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Vazgeç" }));
    await u.click(screen.getByRole("button", { name: "İade et" }));
    expect(await screen.findByRole("dialog")).toHaveTextContent("İade geri alınamaz");
  });
});

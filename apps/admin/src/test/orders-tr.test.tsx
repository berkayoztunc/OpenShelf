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
  it("list shows process columns, needs-attention hints and status tab counts", async () => {
    const row = (o: object) => ({ id: "o", number: "N", source: "website", status: "paid", email: "a@b.co", createdAt: 1767000000, currency: "TRY", total: 1000, ...o });
    mockApi({
      "GET /api/admin/orders/counts": () => ({ byStatus: { pending: 1, awaiting_payment: 2, paid: 4, fulfilling: 1, shipped: 3 }, total: 11 }),
      "GET /api/admin/orders": () => ({ page: 1, pageSize: 25, total: 2, items: [
        row({ id: "a", number: "A-1", customerName: "Ayşe Kaya", city: "Izmir", itemCount: 3, lineCount: 3, lines: [{ name: "Seramik Vazo", sku: "V1", quantity: 2 }, { name: "Keten Örtü", sku: "K1", quantity: 1 }], payment: { status: "succeeded", provider: "iyzico" }, shipment: null, invoice: null }),
        row({ id: "b", number: "B-2", status: "shipped", payment: { status: "succeeded", provider: "iyzico" }, shipment: { status: "in_transit", carrier: "Yurtiçi", trackingNumber: "TRK123", trackingUrl: "https://t.example/TRK123" }, invoice: { status: "issued", number: "EA-1" } }),
      ] }),
    });
    renderRoutes({ "/orders": <Orders /> }, "/orders");
    expect(await screen.findByText("Seramik Vazo")).toBeInTheDocument();
    expect(screen.getByText("Kargo bekliyor")).toBeInTheDocument();
    expect(screen.getByText("Fatura kesilmedi")).toBeInTheDocument();
    expect(screen.getByText("Yolda", { selector: "span" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /TRK123/ })).toHaveAttribute("href", "https://t.example/TRK123");
    expect(screen.getByText("Izmir")).toBeInTheDocument();
    for (const h of ["Ürünler", "Ödeme", "Kargo", "Fatura"]) expect(screen.getByRole("columnheader", { name: h })).toBeInTheDocument();
    expect(await screen.findByRole("tab", { name: /Hazırlanacak\s*5/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Ödeme bekleyen\s*3/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Tümü\s*11/ })).toHaveAttribute("aria-selected", "true");
    expect(document.body.textContent).not.toMatch(/in_transit|succeeded/);
  });
  it("tab and process filters are sent to the API as query params", async () => {
    const seen: string[] = [];
    mockApi({ "GET /api/admin/orders/counts": () => ({ byStatus: {}, total: 0 }), "GET /api/admin/orders": (p) => { seen.push(p); return { items: [], page: 1, pageSize: 25, total: 0 }; } });
    const u = userEvent.setup(); renderRoutes({ "/orders": <Orders /> }, "/orders");
    await u.click(await screen.findByRole("tab", { name: /Hazırlanacak/ }));
    await u.selectOptions(screen.getByLabelText("Kargo"), "none");
    await vi.waitFor(() => { const last = seen[seen.length - 1] ?? ""; expect(last).toContain("status=paid%2Cfulfilling"); expect(last).toContain("shipping=none"); });
  });
  it("quick view drawer shows address, items and process; status change asks for confirmation", async () => {
    const posts: string[] = [];
    mockApi({
      "GET /api/admin/orders/counts": () => ({ byStatus: {}, total: 1 }),
      "GET /api/admin/orders/o1": () => DETAIL,
      "GET /api/admin/orders": () => LIST,
      "POST /api/admin/orders/o1/status": (path, body) => { posts.push(`${path} ${JSON.stringify(body)}`); return {}; },
    });
    const u = userEvent.setup(); renderRoutes({ "/orders": <Orders /> }, "/orders");
    await u.click(await screen.findByRole("button", { name: "DEMO-1001 numaralı siparişe hızlı bak" }));
    const dlg = await screen.findByRole("dialog");
    expect(await within(dlg).findByText("Vazo")).toBeInTheDocument();
    expect(within(dlg).getByText(/x, y|, y/)).toBeInTheDocument();
    expect(within(dlg).getByRole("link", { name: /Sipariş sayfasını aç/ })).toHaveAttribute("href", "/orders/o1");
    await u.click(within(dlg).getByRole("button", { name: "Hazırlanıyor" }));
    const confirm = (await screen.findByText(/durumuna alınsın/)).closest("dialog") as HTMLElement;
    await u.click(within(confirm).getByRole("button", { name: "Durumu değiştir" }));
    await vi.waitFor(() => expect(posts).toEqual(['/api/admin/orders/o1/status {"status":"fulfilling"}']));
  });
  it("bulk: only eligible orders get a shipment; failures are listed", async () => {
    const row = (o: object) => ({ source: "website", email: "a@b.co", createdAt: 1767000000, currency: "TRY", total: 1000, shipment: null, invoice: null, payment: { status: "succeeded", provider: "iyzico" }, ...o });
    const calls: string[] = [];
    mockApi({
      "GET /api/admin/orders/counts": () => ({ byStatus: {}, total: 3 }),
      "GET /api/admin/orders": () => ({ page: 1, pageSize: 25, total: 3, items: [
        row({ id: "a", number: "A-1", status: "paid" }), row({ id: "b", number: "B-2", status: "fulfilling" }), row({ id: "c", number: "C-3", status: "pending", payment: null }),
      ] }),
      "POST /api/admin/orders/a/shipment": (p, b) => { calls.push(`${p} ${JSON.stringify(b)}`); return {}; },
      "POST /api/admin/orders/b/shipment": () => new (class extends Error { code = "x"; })("boom"),
    });
    const u = userEvent.setup(); renderRoutes({ "/orders": <Orders /> }, "/orders");
    await screen.findByRole("link", { name: "#A-1" });
    for (const n of ["A-1", "B-2", "C-3"]) await u.click(screen.getByRole("checkbox", { name: `${n} numaralı siparişi seç` }));
    await u.click(screen.getByRole("button", { name: "Kargo oluştur (2)" }));
    const dlg = await screen.findByRole("dialog");
    expect(within(dlg).getByText(/1 sipariş bu işleme uygun olmadığı için atlanacak/)).toBeInTheDocument();
    await u.type(within(dlg).getByLabelText("Kargo hizmet kimliği"), "svc-1");
    await u.click(within(dlg).getByRole("button", { name: "2 siparişe uygula" }));
    expect(await screen.findByText(/1 sipariş güncellendi, 1 sipariş başarısız oldu/)).toBeInTheDocument();
    expect(calls).toEqual(['/api/admin/orders/a/shipment {"serviceId":"svc-1"}']);
    expect(within(screen.getByRole("dialog")).getByText("#B-2")).toBeInTheDocument();
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

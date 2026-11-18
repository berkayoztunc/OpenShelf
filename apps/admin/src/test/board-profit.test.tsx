import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import OrderBoard, { orderSteps } from "../pages/OrderBoard";
import Profit from "../pages/Profit";
import { computeProfit } from "../lib/profit";
import { setLocale } from "../i18n";
import { asRole, mockApi, renderRoutes } from "./helpers";
import type { OrderRow } from "../lib/types";

beforeEach(() => { asRole("owner"); setLocale("tr"); try { localStorage.clear(); } catch { /* */ } });
afterEach(() => vi.restoreAllMocks());

describe("computeProfit", () => {
  it("deducts commission, shipping, cost, net VAT and income tax", () => {
    // 1200 TL incl. 20% VAT, 10% commission, 60 TL shipping, 480 TL cost, 25% tax, no withholding
    const b = computeProfit({ price: 120000, cost: 48000, commissionPct: 10, shipping: 6000, vatPct: 20, incomeTaxPct: 25, withholdingPct: 0 });
    expect(b.commission).toBe(12000);
    expect(b.outputVat).toBe(20000);
    expect(b.inputVat).toBe(11000); // (120 + 60 + 480) / 6
    expect(b.vatPayable).toBe(9000);
    expect(b.preTax).toBe(120000 - 12000 - 6000 - 48000 - 9000);
    expect(b.incomeTax).toBe(Math.round(45000 * 0.25));
    expect(b.net).toBe(45000 - 11250);
    expect(b.margin).toBeCloseTo(33750 / 120000);
  });
  it("uses withholding as a floor for tax and never taxes a loss", () => {
    const loss = computeProfit({ price: 10000, cost: 20000, commissionPct: 20, shipping: 5000, vatPct: 20, incomeTaxPct: 25, withholdingPct: 1 });
    expect(loss.vatPayable).toBe(0);
    expect(loss.incomeTax).toBe(loss.withholding);
    expect(loss.net).toBeLessThan(0);
  });
});

const row = (o: Partial<OrderRow>): OrderRow => ({ id: "o", number: "N", status: "paid", source: "website", total: 1000, currency: "TRY", createdAt: "2026-01-01T00:00:00Z", payment: null, shipment: null, invoice: null, ...o });

describe("order board", () => {
  it("derives progress steps", () => {
    expect(orderSteps(row({ status: "delivered", invoice: { status: "issued" }, shipment: { status: "delivered" } })).every((s) => s.state === "done")).toBe(true);
    const c = orderSteps(row({ status: "cancelled" }));
    expect(c[0]!.state).toBe("skip");
  });
  it("renders columns and advances a status via icon", async () => {
    const api = mockApi({
      "GET /api/admin/orders": (p) => (p.includes("status=paid&") || p.endsWith("status=paid")
        ? { page: 1, pageSize: 30, total: 1, items: [{ id: "o1", number: "A-1", source: "website", status: "paid", currency: "TRY", total: 5000, createdAt: 1767000000, customerName: "Ayşe Kaya", payment: { status: "succeeded", provider: "iyzico" }, shipment: null, invoice: null }] }
        : { page: 1, pageSize: 30, total: 0, items: [] }),
      "POST /api/admin/orders/o1/status": () => ({ ok: true }),
    });
    renderRoutes({ "/order-board": <OrderBoard /> }, "/order-board");
    const col = await screen.findByRole("region", { name: "Ödendi" });
    expect(await within(col).findByText("Ayşe Kaya")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Kargoda" })).toBeInTheDocument();
    await userEvent.click(within(col).getByRole("button", { name: /Durumu "Hazırlanıyor" yap/ }));
    await userEvent.click(await screen.findByRole("button", { name: "Onayla" }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/api/admin/orders/o1/status", { status: "fulfilling" }));
  });
});

describe("profit matrix", () => {
  it("lists variants and recomputes net profit when a cost is typed", async () => {
    mockApi({ "GET /api/admin/products": () => ({ page: 1, pageSize: 50, total: 1, items: [{ id: "p1", nameTr: "Seramik Vazo", slug: "vazo", status: "active", variants: [{ id: "v1", sku: "V1", title: "Mavi", prices: { website: 120000, trendyol: 130000 } }], images: [] }] }) });
    renderRoutes({ "/profit": <Profit /> }, "/profit");
    expect(await screen.findByText("Seramik Vazo")).toBeInTheDocument();
    const input = screen.getByRole("textbox", { name: "Maliyet" });
    await userEvent.type(input, "480{enter}");
    await waitFor(() => expect(screen.getByText("Maliyeti girilen varyant").nextSibling?.textContent).toBe("1 / 1"));
  });
});

describe("coupon code generator", () => {
  it("makes unambiguous codes and prefixes free-shipping ones", async () => {
    const { generateCouponCode } = await import("../pages/Coupons");
    expect(generateCouponCode("percent")).toMatch(/^[A-HJKMNP-Z2-9]{8}$/);
    expect(generateCouponCode("free_shipping")).toMatch(/^KARGO-[A-HJKMNP-Z2-9]{8}$/);
    expect(new Set(Array.from({ length: 50 }, () => generateCouponCode("fixed"))).size).toBe(50);
  });
});

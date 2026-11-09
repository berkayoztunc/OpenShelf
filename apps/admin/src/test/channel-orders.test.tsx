import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import OrderDetail from "../pages/OrderDetail";
import { LabelDoc } from "../pages/print/docs";
import type { RawOrder } from "../lib/rawOrder";
import Overview from "../pages/trendyol/views/Overview";
import { mockApi, renderRoutes } from "./helpers";

const base = { id: "o9", number: "TY-555", source: "trendyol", status: "shipped", email: "t@example.invalid", createdAt: Math.floor(Date.now() / 1000), currency: "TRY", subtotal: 1000, discountTotal: 0, shippingTotal: 0, taxTotal: 0, total: 1000,
  shippingAddress: { name: "Ayşe Kaya", phone: "1", line1: "x", city: "y" }, items: [{ id: "i1", sku: "S1", name: "Vazo", quantity: 1, unitPrice: 1000 }], payments: [], invoices: [], events: [],
  shipments: [{ id: "s1", provider: "trendyol", carrier: "Trendyol Express", trackingNumber: "TRK1", trackingUrl: "https://t.example/TRK1", externalPackageId: "555", status: "in_transit" }] };

describe("channel-managed orders (Trendyol)", () => {
  it("order detail: channel note, no ship/invoice actions, tracking link", async () => {
    mockApi({ "GET /api/admin/orders/o9/notifications": () => ({ items: [] }), "GET /api/admin/orders/o9": () => base });
    renderRoutes({ "/orders/:id": <OrderDetail /> }, "/orders/o9");
    expect(await screen.findByTestId("order-managed")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Create shipment|Kargo oluştur/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Issue invoice|Fatura kes/ })).toBeNull();
    expect(screen.getByRole("link", { name: "TRK1" })).toHaveAttribute("href", "https://t.example/TRK1");
  });

  it("order detail: website orders keep the ship + invoice actions", async () => {
    mockApi({ "GET /api/admin/orders/o9/notifications": () => ({ items: [] }), "GET /api/admin/orders/o9": () => ({ ...base, source: "website", status: "paid", shipments: [] }) });
    renderRoutes({ "/orders/:id": <OrderDetail /> }, "/orders/o9");
    await screen.findByRole("button", { name: /Issue invoice|Fatura kes/ });
    expect(screen.queryByTestId("order-managed")).toBeNull();
  });

  it("label shows the Trendyol slip header with package id and carrier; site orders do not", () => {
    const seller = { name: "Shop" };
    const { unmount } = renderRoutes({ "/": <LabelDoc order={base as unknown as RawOrder} seller={seller} /> }, "/");
    expect(screen.getByTestId("label-marketplace")).toHaveTextContent("555");
    expect(screen.getByTestId("label-doc")).toHaveTextContent("Trendyol Express");
    unmount();
    renderRoutes({ "/": <LabelDoc order={{ ...base, source: "website" } as unknown as RawOrder} seller={seller} /> }, "/");
    expect(screen.queryByTestId("label-marketplace")).toBeNull();
  });

  it("overview shows health numbers and recent problems", async () => {
    mockApi({ "GET /api/admin/trendyol/health": () => ({ orders: { total: 12, last7d: 3, lastAt: null, withoutCargo: 2, unmappedLines: 1 }, reconcile: { lastRunAt: null },
      stock: { listings: 5, errors: 0, drift: 4, lastPushAt: null, truth: "local" }, import: null, errors: [{ id: 1, level: "warn", message: "lines without variant mapping", at: null }] }) });
    renderRoutes({ "/": <Overview /> }, "/");
    expect(await screen.findByTestId("tdy-overview")).toHaveTextContent("12");
    expect(screen.getByText("lines without variant mapping")).toBeInTheDocument();
  });
});

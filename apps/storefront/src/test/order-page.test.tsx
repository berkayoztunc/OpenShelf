import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { OrderView } from "../api/types";

const state = vi.hoisted(() => ({ order: null as unknown }));
vi.mock("../api/client", () => ({ api: { order: async () => state.order } }));
vi.mock("../store/ConfigContext", () => ({ useConfig: () => ({ config: { general: { storeName: "Mağaza", contactEmail: "destek@magaza.test", contactPhone: "+90 212 000 00 00", pricesIncludeTax: true }, seo: {} } }) }));
vi.mock("../i18n", async () => { const { MESSAGES } = await vi.importActual<typeof import("../i18n/messages")>("../i18n/messages"); return { useI18n: () => ({ locale: "tr", t: (k: string, v?: Record<string, unknown>) => String((MESSAGES.tr as Record<string, string>)[k] ?? k).replace(/\{(\w+)\}/g, (_, n: string) => String(v?.[n] ?? "")) }) }; });
vi.mock("../components/Money", () => ({ useMoney: () => (n: number) => `${(n / 100).toFixed(2)} TL` }));
vi.mock("../cart/CartContext", () => ({ useCart: () => ({ forget: () => {} }) }));
vi.mock("../lib/head", () => ({ useHead: () => {} }));
vi.mock("../lib/seo", () => ({ pageTitle: () => "t" }));
vi.mock("../tracking", () => ({ getConsent: () => ({ analytics: false, marketing: false }), onConsentChange: () => () => {}, trackPurchase: () => false }));
import Order from "../pages/Order";

const base: OrderView = {
  orderNumber: "OS-TEST1", status: "paid", currency: "TRY", subtotal: 39800, shipping: 15000, discount: 0, tax: 6633, total: 54800, createdAt: "2026-11-15T16:13:24.000Z", email: "ayse@example.com",
  items: [{ variantId: "v1", title: "Keten Gömlek", variantTitle: "M / Bej", quantity: 2, unitPrice: 19900, imageUrl: "/media/m1", productSlug: "keten-gomlek" }],
  shippingAddress: { fullName: "Ayşe Yılmaz", line1: "Atatürk Cad. No 1", district: "Kadıköy", city: "İstanbul", phone: "+905551112233" }, shipment: null,
};
const mount = async (o: Partial<OrderView> = {}) => {
  state.order = { ...base, ...o };
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={["/order/OS-TEST1?t=tok"]}><Routes><Route path="/order/:number" element={<Order />} /></Routes></MemoryRouter></QueryClientProvider>);
  await screen.findByRole("heading", { name: "OS-TEST1" });
};

describe("order page", () => {
  it("paid order: thanks, e-mail, progress, real product photo linked to the product, full price breakdown, address, help", async () => {
    await mount();
    expect(screen.getByRole("status").textContent).toContain("Teşekkürler, siparişiniz alındı");
    expect(screen.getByText("Onay e-postası ayse@example.com adresine gönderildi.")).toBeTruthy();
    const steps = within(screen.getByRole("list", { name: "Sipariş durumu" })).getAllByRole("listitem");
    expect(steps.map((s) => s.textContent)).toEqual(["Sipariş alındı", "2Hazırlanıyor", "3Kargoda", "4Teslim edildi"]);
    expect(steps[1]!.getAttribute("aria-current")).toBe("step");
    const img = document.querySelector("img") as HTMLImageElement;
    expect(img.getAttribute("src")).toBe("/media/m1");
    expect(screen.getByRole("link", { name: "Keten Gömlek" }).getAttribute("href")).toBe("/product/keten-gomlek");
    expect(screen.getByText("M / Bej")).toBeTruthy();
    expect(screen.getByText(/Adet: 2/).textContent).toContain("Adet: 2 · 199.00 TL / adet");
    for (const s of ["398.00 TL", "150.00 TL", "548.00 TL", "Fiyatlara KDV dahildir (66.33 TL)."]) expect(screen.getAllByText(s).length).toBeGreaterThan(0);
    expect(screen.getByText("Ayşe Yılmaz")).toBeTruthy(); expect(screen.getByText("Kadıköy / İstanbul")).toBeTruthy();
    expect(screen.getByText(/kargoya verildiğinde takip bilgisi/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "destek@magaza.test" }).getAttribute("href")).toBe("mailto:destek@magaza.test?subject=OS-TEST1");
  });
  it("shipped order shows carrier, tracking number and a safe tracking link", async () => {
    await mount({ status: "shipped", shipment: { carrier: "Sürat Kargo", trackingNumber: "1234567890", trackingUrl: "https://takip.example/1234567890" } });
    expect(screen.getByText("Sürat Kargo")).toBeTruthy(); expect(screen.getByText("1234567890")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Kargoyu takip et/ }).getAttribute("href")).toBe("https://takip.example/1234567890");
  });
  it("cancelled order: explains, no progress or tracking, offers to go back to the cart; discount and coupon are shown", async () => {
    await mount({ status: "cancelled", discount: 5000, couponCode: "HOSGELDIN" });
    expect(screen.getByRole("status").textContent).toContain("Ödeme tamamlanamadı");
    expect(screen.getByText(/Kartınızdan çekim yapıldığını görüyorsanız/)).toBeTruthy();
    expect(screen.queryByRole("list", { name: "Sipariş durumu" })).toBeNull();
    expect(screen.queryByText("Kargo takibi")).toBeNull();
    expect(screen.getByRole("link", { name: "Sepete dön ve tekrar dene" }).getAttribute("href")).toBe("/cart");
    expect(screen.getByText("(Kupon: HOSGELDIN)")).toBeTruthy();
  });
  it("a product that no longer exists keeps its stored name without a link", async () => {
    await mount({ items: [{ variantId: "line-0", title: "Eski Ürün - Tek Beden", quantity: 1, unitPrice: 10000, imageUrl: null, productSlug: null }] });
    expect(screen.getByText("Eski Ürün - Tek Beden")).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Eski Ürün/ })).toBeNull();
  });
});

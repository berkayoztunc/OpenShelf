import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Dashboard from "../pages/Dashboard";
import { setLocale } from "../i18n";
import { asRole, mockApi, renderRoutes, withSettings } from "./helpers";

const day = (i: number) => `2026-03-${String(i + 1).padStart(2, "0")}`;
const series = Array.from({ length: 7 }, (_, i) => ({ date: day(i), revenue: i === 6 ? 30000 : 10000 * (i % 3), orders: i % 3, website: 0, trendyol: 0 }));
const INSIGHTS = {
  range: { days: 7, timezone: "Europe/Istanbul", from: day(0), to: day(6) },
  kpis: { revenue: { cur: 90000, prev: 60000 }, orders: { cur: 9, prev: 12 }, aov: { cur: 10000, prev: 5000 }, units: { cur: 14, prev: 14 }, customers: { cur: 3, prev: 0 } },
  series, previous: series.map((s) => ({ date: s.date, revenue: 5000, orders: 1 })),
  channels: { website: { revenue: 60000, orders: 6 }, trendyol: { revenue: 30000, orders: 3 } },
  topProducts: [{ productId: "p1", name: "Seramik Vazo", units: 8, revenue: 64000 }, { productId: "p2", name: "Keten Örtü", units: 4, revenue: 12000 }],
  topCities: [{ city: "Izmir", orders: 5, revenue: 50000 }],
  attention: { toShip: 4, awaitingPayment: 0, toInvoice: 2, failedJobs: 1, outOfStock: 0, lowStock: 0, noImage: 3, drafts: 0 },
  activity: [{ id: 1, action: "order.status", entity: "order", entityId: "o1", at: new Date().toISOString(), admin: "Ayşe Kaya" }],
};
const LEGACY = { salesToday: { total: 25000, count: 2 }, salesWeek: { total: 1, count: 1 }, ordersByStatus: { paid: 4, shipped: 2, pending: 1 }, lowStock: [], integrationHealth: [], stockDrift: [] };

const setup = (over: Record<string, unknown> = {}, days: string[] = []) => {
  asRole("owner"); withSettings(); setLocale("tr");
  return mockApi({
    "GET /api/admin/dashboard/insights": (p) => { days.push(p); return { ...INSIGHTS, ...over }; },
    "GET /api/admin/dashboard$": () => LEGACY,
    "GET /api/admin/orders": () => ({ items: [], page: 1, pageSize: 8, total: 0 }),
    "GET /api/admin/products": () => ({ items: [], total: 0 }),
    "GET /api/admin/integrations": () => [],
  });
};
beforeEach(() => vi.useRealTimers());
afterEach(() => vi.restoreAllMocks());

describe("Dashboard", () => {
  it("shows KPIs with change vs the previous period (arrow + sign, not color alone)", async () => {
    setup(); renderRoutes({ "/": <Dashboard /> }, "/");
    const kpi = (name: string) => screen.getByText(name).closest("div")!.parentElement!;
    await screen.findByText("Ortalama sepet");
    expect(within(kpi("Ciro")).getByText("+50%")).toBeTruthy();
    expect(within(kpi("Sipariş")).getByText("−25%")).toBeTruthy();
    expect(within(kpi("Ortalama sepet")).getByText("+100%")).toBeTruthy();
    expect(within(kpi("Satılan adet")).getByText("0%")).toBeTruthy();
    expect(within(kpi("Yeni müşteri")).getByText("Yeni")).toBeTruthy(); // previous period had none: no fake percentage
  });
  it("work queue lists only non-zero items and links to the filtered lists", async () => {
    setup(); renderRoutes({ "/": <Dashboard /> }, "/");
    const ship = await screen.findByRole("link", { name: /Kargolanacak sipariş/ });
    expect(ship.getAttribute("href")).toBe("/orders?tab=prepare&shipping=none&source=website");
    expect(screen.getByRole("link", { name: /Başarısız arka plan işi/ }).getAttribute("href")).toBe("/integration-events");
    expect(screen.getByRole("link", { name: /Görseli olmayan aktif ürün/ }).getAttribute("href")).toBe("/products?image=none&status=active");
    expect(screen.queryByRole("link", { name: /Tükenen ürün çeşidi/ })).toBeNull();
  });
  it("says everything is fine when the work queue is empty", async () => {
    setup({ attention: { toShip: 0, awaitingPayment: 0, toInvoice: 0, failedJobs: 0, outOfStock: 0, lowStock: 0, noImage: 0, drafts: 0 } }); renderRoutes({ "/": <Dashboard /> }, "/");
    expect(await screen.findByText("Bekleyen iş yok, her şey yolunda.")).toBeTruthy();
  });
  it("period switch re-queries insights; the chart has a table view with every day", async () => {
    const calls: string[] = []; setup({}, calls); renderRoutes({ "/": <Dashboard /> }, "/"); const u = userEvent.setup();
    await screen.findByText("Ortalama sepet");
    expect(calls.at(-1)).toContain("days=30");
    await u.click(screen.getByRole("button", { name: "90 gün" }));
    await waitFor(() => expect(calls.at(-1)).toContain("days=90"));
    expect(screen.getByRole("button", { name: "90 gün" }).getAttribute("aria-pressed")).toBe("true");
    await u.click(screen.getByRole("button", { name: /Tablo/ }));
    expect(within(screen.getByRole("table", { name: /günlük cirosu/ })).getAllByRole("row")).toHaveLength(8);
  });
  it("chart is keyboard operable: arrow keys move the crosshair and show a tooltip", async () => {
    setup(); renderRoutes({ "/": <Dashboard /> }, "/?days=7"); const u = userEvent.setup();
    const chart = await screen.findByRole("img", { name: /günlük cirosu/ });
    chart.focus(); await u.keyboard("{ArrowLeft}");
    expect((await screen.findByTestId("chart-tooltip")).textContent).toContain("Bu dönem");
    expect(screen.getAllByText(/Önceki dönem/).length).toBeGreaterThan(1);
  });
  it("lists best sellers, channel split with numbers in text, and recent activity", async () => {
    setup(); renderRoutes({ "/": <Dashboard /> }, "/");
    expect(await screen.findByText("Seramik Vazo")).toBeTruthy();
    expect(screen.getByText("8 adet")).toBeTruthy();
    expect(screen.getByText(/67% · 6 sipariş/)).toBeTruthy(); // website share is written out, not only drawn
    expect(screen.getByText(/Ayşe Kaya/)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/order\.status/); // action codes are humanised
  });
  it("an insights failure does not take the whole page down", async () => {
    asRole("owner"); withSettings(); setLocale("tr");
    mockApi({ "GET /api/admin/dashboard/insights": () => new Error("boom"), "GET /api/admin/dashboard$": () => LEGACY, "GET /api/admin/orders": () => ({ items: [], page: 1, pageSize: 8, total: 0 }), "GET /api/admin/products": () => ({ items: [], total: 0 }), "GET /api/admin/integrations": () => [] });
    renderRoutes({ "/": <Dashboard /> }, "/");
    expect(await screen.findByText("Duruma göre siparişler")).toBeTruthy();
    expect(await screen.findByRole("button", { name: /Tekrar dene|Retry/i })).toBeTruthy();
  });
});

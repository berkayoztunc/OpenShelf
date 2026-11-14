import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockApi, renderRoutes } from "./helpers";
import { setLocale } from "../i18n";
import Sync from "../pages/trendyol/views/Sync";
import { TrendyolSyncCard } from "../components/trendyol/SyncCard";
import type { SyncDetail, SyncList, SyncRow } from "../lib/trendyolSync";

const row = (o: Partial<SyncRow>): SyncRow => ({
  productId: "p1", name: "Keten Gömlek", status: "active", imageUrl: null, mode: "website_only", variants: 2, withBarcode: 2, linked: 0, enabled: 0, errors: 0, available: 14,
  contentSource: "local", priceSource: "local", lastSyncedAt: null, lastPulledAt: null, ...o,
});
const list = (items: SyncRow[], available = true): SyncList => ({ items, total: items.length, page: 1, pageSize: 25, available, summary: { total: 2, synced: 1, websiteOnly: 1, errors: 0, following: 0 } });
const detail = (o: Partial<SyncDetail> = {}): SyncDetail => ({
  ...row({ mode: "synced", linked: 2, enabled: 2 }), available: true, stock: 14,
  variantRows: [
    { variantId: "v1", sku: "GML-S", title: "S", barcode: "8690001", linked: true, enabled: true, available: 9, lastSyncedStock: 9, lastSyncedAt: "2026-11-14T10:00:00Z", lastError: null },
    { variantId: "v2", sku: "GML-M", title: "M", barcode: "8690002", linked: true, enabled: true, available: 5, lastSyncedStock: 7, lastSyncedAt: "2026-11-14T10:00:00Z", lastError: "8690002: barcode not found" },
  ], ...o,
});

beforeEach(() => { vi.restoreAllMocks(); setLocale("en"); });

describe("Trendyol → Sync control", () => {
  const rows = [row({}), row({ productId: "p2", name: "Deri Cüzdan", mode: "synced", linked: 1, enabled: 1, variants: 1, withBarcode: 1 })];
  it("lists products with their mode, and the row switch turns sync on", async () => {
    const m = mockApi({ "GET /api/admin/trendyol/sync": () => list(rows), "PUT /api/admin/trendyol/sync": () => ({ updated: 1, linked: 2, skippedNoBarcode: 0, barcodeTaken: 0 }) });
    renderRoutes({ "/trendyol/sync": <Sync /> }, "/trendyol/sync");
    const r1 = await screen.findByTestId("tdy-sync-row-p1");
    expect(within(r1).getByText("Not on Trendyol")).toBeInTheDocument();
    expect(within(screen.getByTestId("tdy-sync-row-p2")).getByText("Synced")).toBeInTheDocument();
    // sources only make sense for synced products
    expect(within(r1).getByLabelText("Content source: Keten Gömlek")).toBeDisabled();
    await userEvent.click(within(r1).getByRole("switch"));
    await waitFor(() => expect(m.put).toHaveBeenCalledWith("/api/admin/trendyol/sync", { productIds: ["p1"], enabled: true }));
  });
  it("bulk: pick products, make them website only, change a source", async () => {
    const m = mockApi({ "GET /api/admin/trendyol/sync": () => list(rows), "PUT /api/admin/trendyol/sync": () => ({ updated: 2, linked: 0, skippedNoBarcode: 0, barcodeTaken: 0 }) });
    renderRoutes({ "/trendyol/sync": <Sync /> }, "/trendyol/sync");
    await screen.findByTestId("tdy-sync-row-p1");
    expect(screen.queryByTestId("tdy-sync-bulk")).not.toBeInTheDocument();
    await userEvent.click(screen.getByLabelText("Select all products on this page"));
    const bulk = screen.getByTestId("tdy-sync-bulk");
    expect(within(bulk).getByText("2 selected")).toBeInTheDocument();
    await userEvent.selectOptions(within(bulk).getByLabelText("Price source"), "remote");
    await waitFor(() => expect(m.put).toHaveBeenCalledWith("/api/admin/trendyol/sync", { productIds: ["p1", "p2"], priceSource: "remote" }));
    await userEvent.click(within(bulk).getByRole("button", { name: "Website only" }));
    await waitFor(() => expect(m.put).toHaveBeenCalledWith("/api/admin/trendyol/sync", { productIds: ["p1", "p2"], enabled: false }));
    await waitFor(() => expect(screen.queryByTestId("tdy-sync-bulk")).not.toBeInTheDocument());
  });
  it("filter and search go to the API", async () => {
    const m = mockApi({ "GET /api/admin/trendyol/sync": () => list(rows) });
    renderRoutes({ "/trendyol/sync": <Sync /> }, "/trendyol/sync");
    await screen.findByTestId("tdy-sync-row-p1");
    await userEvent.click(screen.getByRole("tab", { name: /Website only/ }));
    await waitFor(() => expect(m.get.mock.calls.some(([p]) => String(p).includes("mode=website_only"))).toBe(true));
  });
});

describe("Product page → Trendyol card", () => {
  it("shows per-variant state, saves a source and asks before overwriting stock", async () => {
    const m = mockApi({ "GET /api/admin/trendyol/sync/p1": () => detail(), "PUT /api/admin/trendyol/sync": () => ({ updated: 1, linked: 0, skippedNoBarcode: 0, barcodeTaken: 0 }), "POST /api/admin/trendyol/sync/": () => ({ queued: true }) });
    renderRoutes({ "/p": <TrendyolSyncCard productId="p1" /> }, "/p");
    const card = await screen.findByTestId("product-trendyol-card");
    expect(within(card).getByText("In sync")).toBeInTheDocument();
    expect(within(card).getByText("8690002: barcode not found")).toBeInTheDocument();
    expect(within(card).getByText("Here 5 · sent to Trendyol 7")).toBeInTheDocument();
    await userEvent.selectOptions(within(card).getByLabelText("Content source"), "remote");
    await waitFor(() => expect(m.put).toHaveBeenCalledWith("/api/admin/trendyol/sync", { productIds: ["p1"], contentSource: "remote" }));
    await userEvent.click(within(card).getByRole("button", { name: "Push stock now" }));
    await waitFor(() => expect(m.post).toHaveBeenCalledWith("/api/admin/trendyol/sync/push", { productIds: ["p1"] }));
    await userEvent.click(within(card).getByRole("button", { name: "Take stock from Trendyol" }));
    expect(m.post).not.toHaveBeenCalledWith("/api/admin/trendyol/sync/pull", expect.anything());
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Take stock from Trendyol" }));
    await waitFor(() => expect(m.post).toHaveBeenCalledWith("/api/admin/trendyol/sync/pull", { productIds: ["p1"], stock: true }));
  });
  it("website-only product: only the switch, with a barcode hint when none is set", async () => {
    mockApi({ "GET /api/admin/trendyol/sync/p1": () => detail({ mode: "website_only", linked: 0, enabled: 0, withBarcode: 0, variantRows: [] }) });
    renderRoutes({ "/p": <TrendyolSyncCard productId="p1" /> }, "/p");
    const card = await screen.findByTestId("product-trendyol-card");
    expect(within(card).getByRole("switch")).toHaveAttribute("aria-checked", "false");
    expect(within(card).getByText(/enter the Trendyol barcode/)).toBeInTheDocument();
    expect(within(card).queryByLabelText("Content source")).not.toBeInTheDocument();
  });
  it("stays hidden for staff (403) and for stores that never connected Trendyol", async () => {
    mockApi({ "GET /api/admin/trendyol/sync/p1": () => new Error("forbidden"), "GET /api/admin/trendyol/sync/p2": () => detail({ mode: "website_only", linked: 0, enabled: 0, available: false, variantRows: [] }) });
    const { container } = renderRoutes({ "/p": <><TrendyolSyncCard productId="p1" /><TrendyolSyncCard productId="p2" /></> }, "/p");
    await waitFor(() => expect(container.querySelector(".animate-pulse")).toBeNull());
    expect(screen.queryByTestId("product-trendyol-card")).not.toBeInTheDocument();
  });
});

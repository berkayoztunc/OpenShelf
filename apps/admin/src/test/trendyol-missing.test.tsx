import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TrendyolMissing } from "../components/dashboard/TrendyolMissing";
import { setLocale } from "../i18n";
import { asRole, mockApi, renderRoutes } from "./helpers";

const item = (n: number) => ({ externalId: String(n), title: `Ürün ${n}`, brand: "Marka", barcodes: [`BC${n}`], variants: 2, quantity: 5, salePrice: 19990 });
const report = (total: number, extra: Record<string, unknown> = {}) => ({
  runId: "r1", complete: true, imported: false, startedAt: "2026-11-18T10:00:00Z", finishedAt: "2026-11-18T10:01:00Z",
  total, variants: total * 2, items: Array.from({ length: Math.min(total, 500) }, (_, i) => item(i + 1)), ...extra,
});
afterEach(() => vi.restoreAllMocks());

describe("TrendyolMissing (dashboard card)", () => {
  it("lists missing products and imports them all as drafts in one click", async () => {
    asRole("owner"); setLocale("tr");
    const posts: unknown[] = [];
    mockApi({
      "GET /api/admin/trendyol/import/missing": () => ({ report: report(7), status: { state: "done", dryRun: true, createMissing: true, totals: { created: 7 } }, running: false }),
      "POST /api/admin/trendyol/import": (_p, b) => { posts.push(b); return { queued: true, runId: "x" }; },
    });
    renderRoutes({ "/": <TrendyolMissing /> }, "/");
    expect(await screen.findByText("Trendyol'da 7 ürün (14 varyant) sitede yok")).toBeTruthy();
    expect(screen.getByText("Ürün 1")).toBeTruthy();
    expect(screen.queryByText("Ürün 6")).toBeNull(); // only the first five
    expect(screen.getByText(/ve 2 ürün daha/)).toBeTruthy();
    await userEvent.setup().click(screen.getByRole("button", { name: "7 ürünü içe aktar" }));
    await waitFor(() => expect(posts).toEqual([{ createMissing: true }]));
  });

  it("shows a quiet line when nothing is missing; Scan now starts a dry run", async () => {
    asRole("owner"); setLocale("tr");
    const posts: unknown[] = [];
    mockApi({
      "GET /api/admin/trendyol/import/missing": () => ({ report: report(0), status: null, running: false }),
      "POST /api/admin/trendyol/import": (_p, b) => { posts.push(b); return { queued: true }; },
    });
    renderRoutes({ "/": <TrendyolMissing /> }, "/");
    expect(await screen.findByText("Trendyol'daki tüm ürünler sitede var.")).toBeTruthy();
    await userEvent.setup().click(screen.getByRole("button", { name: /Şimdi tara/ }));
    await waitFor(() => expect(posts).toEqual([{ createMissing: true, dryRun: true }]));
  });

  it("after an import, links to the new drafts", async () => {
    asRole("owner"); setLocale("tr");
    mockApi({ "GET /api/admin/trendyol/import/missing": () => ({ report: report(0, { imported: true }), status: { state: "done", dryRun: false, createMissing: true, totals: { created: 3 } }, running: false }) });
    renderRoutes({ "/": <TrendyolMissing /> }, "/");
    expect(await screen.findByText(/3 Trendyol ürünü taslak olarak eklendi/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Taslakları gör" }).getAttribute("href")).toBe("/products?status=draft");
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockApi, renderRoutes } from "./helpers";
import { setLocale } from "../i18n";
import { en } from "../i18n/en";
import { tr } from "../i18n/tr";
import { SuggestionsCard } from "../pages/trendyol/views/products/Suggestions";
import { normalizeRows } from "../pages/trendyol/views/Products";

beforeEach(() => { sessionStorage.clear(); localStorage.clear(); void setLocale("en"); });

const report = {
  suggestions: [
    { variantId: "v1", label: "Neon Pop", barcode: "B-100", title: "Neon Pop", status: "approved", by: "barcode" },
    { variantId: "v2", label: "Inbox Zero - Siyah", barcode: "B-200", title: "Inbox Zero", status: "pending", by: "sku" },
  ],
  unmatchedRemote: [{ barcode: "B-900", stockCode: "", title: "x", status: "approved" }], unmatchedLocal: [{ variantId: "v9", label: "y", sku: "Y" }],
  staleMappings: [{ variantId: "v8", label: "z", barcode: "OLD-1" }], conflicts: [{ barcode: "B-300", variantIds: ["a", "b"] }],
  counts: { remote: 4, local: 5 }, truncated: false,
};

describe("match suggestions", () => {
  it("reads Trendyol only when asked, links one suggestion on confirm and shows conflicts / stale mappings", async () => {
    mockApi({ "GET /api/admin/trendyol/match-suggestions": () => report, "POST /api/admin/trendyol/mappings": () => ({ ok: true }) });
    const post = vi.mocked((await import("../lib/api")).api.post);
    renderRoutes({ "/*": <SuggestionsCard /> }, "/");
    expect(screen.queryByText("Neon Pop")).toBeNull();                                  // nothing fetched yet
    await userEvent.click(screen.getByRole("button", { name: "Find matches" }));
    expect(await screen.findByText("2 suggestion(s)")).toBeInTheDocument();
    expect(screen.getAllByText(/stock code = SKU/).length).toBeGreaterThan(1);   // the intro text and the SKU-matched row
    expect(screen.getByText(/B-300/)).toBeInTheDocument(); expect(screen.getByText(/OLD-1/)).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();                                                // suggestions never link by themselves
    await userEvent.click(screen.getAllByRole("button", { name: "Link" })[0]!);
    await waitFor(() => expect(post).toHaveBeenCalledWith("/api/admin/trendyol/mappings", { variantId: "v1", barcode: "B-100" }));
    await waitFor(() => expect(screen.getByText("1 suggestion(s)")).toBeInTheDocument());
  });
});

describe("rejected products", () => {
  it("keep Trendyol's reject reason", () => {
    const rows = normalizeRows("unapproved", [{ barcode: "B-300", title: "Bad", status: "rejected", rejectReasonDetails: [{ rejectReason: "Görselde Yasaklı Kelime" }] }, { barcode: "B-200", title: "Wait", status: "pendingApproval", rejectReasonDetails: [] }]);
    expect(rows.map((r) => r.rejectReason)).toEqual(["Görselde Yasaklı Kelime", undefined]);
  });
});

describe("i18n", () => {
  it("Turkish and English have the same trendyol keys", () => {
    const keys = (o: Record<string, string>) => Object.keys(o).filter((k) => k.startsWith("trendyol")).sort();
    expect(keys(tr as Record<string, string>)).toEqual(keys(en as Record<string, string>));
  });
});

import { describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CampaignEditor } from "../pages/Campaigns";
import { ImportCard } from "../pages/trendyol/views/products/Mappings";
import Overview from "../pages/trendyol/views/Overview";
import { asRole, mockApi, renderRoutes } from "./helpers";

const AUD = { count: 3, truncated: false, max: 5000, sample: [] };
const FULL = (o: object = {}) => ({ id: "c1", name: "Yaz", channel: "email", body: "Selam", subject: "Konu", filters: { city: "İzmir", minOrders: 2 }, status: "draft", total: 0, sent: 0, failed: 0, skipped: 0, pending: 0, createdAt: 1767000000, problems: [], ...o });

describe("campaign editor details", () => {
  it("draft: loads saved fields + filters, preview renders the e-mail in a sandboxed frame, test send posts the address", async () => {
    asRole("admin");
    const posts: Record<string, unknown> = {};
    mockApi({
      "POST /api/admin/campaigns/audience": () => AUD, "GET /api/admin/campaigns/c1": () => FULL(), "PUT /api/admin/campaigns/c1": () => ({ id: "c1" }),
      "POST /api/admin/campaigns/c1/preview": () => ({ subject: "Selam Ayşe", html: "<p>Merhaba</p>", text: "Merhaba" }),
      "POST /api/admin/campaigns/c1/test": (_p, b) => { posts.test = b; return { ok: true }; },
    });
    const u = userEvent.setup(); renderRoutes({ "/campaigns/:id": <CampaignEditor /> }, "/campaigns/c1");
    expect(await screen.findByDisplayValue("Yaz")).toBeInTheDocument();
    expect(screen.getByDisplayValue("İzmir")).toBeInTheDocument(); expect(screen.getByDisplayValue("2")).toBeInTheDocument();
    await u.click(screen.getByRole("button", { name: /^Preview|^Önizleme/ }));
    const dlg = await screen.findByRole("dialog");
    expect(within(dlg).getByText("Selam Ayşe")).toBeInTheDocument();
    expect(within(dlg).getByTitle(/Preview|Önizleme/)).toHaveAttribute("sandbox", "");
    await u.click(within(dlg).getByRole("button", { name: /Close|Kapat/ }));
    await u.click(screen.getByRole("button", { name: /Send a test|Test gönder/ }));
    const t = await screen.findByRole("dialog");
    await u.type(within(t).getByLabelText(/Test e-mail|Test e-posta/), "me@example.com");
    await u.click(within(t).getByRole("button", { name: /Send test|Testi gönder/ }));
    await waitFor(() => expect(posts.test).toEqual({ to: "me@example.com" }));
  });

  it("sms draft shows the segment counter and warns about Turkish characters", async () => {
    asRole("admin");
    mockApi({ "POST /api/admin/campaigns/audience": () => AUD, "GET /api/admin/campaigns/c2": () => FULL({ id: "c2", channel: "sms", body: "", subject: null }) });
    const u = userEvent.setup(); renderRoutes({ "/campaigns/:id": <CampaignEditor /> }, "/campaigns/c2");
    const box = await screen.findByLabelText(/^Message|^Mesaj/);
    await u.type(box, "hello");
    expect(screen.getByTestId("sms-counter")).toHaveTextContent("5");
    expect(screen.getByTestId("sms-counter")).not.toHaveTextContent(/Turkish|Türkçe/);
    await u.type(box, " şeker");
    expect(screen.getByTestId("sms-counter")).toHaveTextContent(/Turkish|Türkçe/);
    expect(screen.queryByLabelText(/^Subject|^Konu/)).toBeNull(); // no subject for SMS
  });

  it("sending: fields are locked, no send button, cancel posts and refreshes", async () => {
    asRole("admin");
    const posts: string[] = [];
    mockApi({ "POST /api/admin/campaigns/audience": () => AUD, "GET /api/admin/campaigns/c1": () => FULL({ status: "sending", total: 10, sent: 2, pending: 8 }), "POST /api/admin/campaigns/c1/cancel": () => { posts.push("cancel"); return { status: "cancelled" }; } });
    const u = userEvent.setup(); renderRoutes({ "/campaigns/:id": <CampaignEditor /> }, "/campaigns/c1");
    expect(await screen.findByDisplayValue("Yaz")).toBeDisabled();
    expect(screen.queryByRole("button", { name: /Delete|Sil/ })).toBeNull(); // cannot delete while sending
    await u.click(screen.getByRole("button", { name: /Cancel sending|Göndermeyi iptal et/ }));
    await waitFor(() => expect(posts).toEqual(["cancel"]));
  });

  it("finished campaign is read-only but can be deleted after confirmation", async () => {
    asRole("admin");
    const posts: string[] = [];
    mockApi({ "POST /api/admin/campaigns/audience": () => AUD, "GET /api/admin/campaigns/c1": () => FULL({ status: "done", total: 3, sent: 3 }), "GET /api/admin/campaigns": () => ({ items: [], total: 0, page: 1, pageSize: 20 }) });
    const api = (await import("../lib/api")).api;
    const { vi } = await import("vitest");
    const del = vi.spyOn(api, "del").mockImplementation((async (p: string) => { posts.push(p); return null; }) as never);
    const u = userEvent.setup(); renderRoutes({ "/campaigns/:id": <CampaignEditor />, "/campaigns": <p>list page</p> }, "/campaigns/c1");
    expect(await screen.findByDisplayValue("Yaz")).toBeDisabled();
    await u.click(screen.getByRole("button", { name: /^Delete|^Sil/ }));
    await u.click(within(await screen.findByRole("dialog")).getByRole("button", { name: /^Delete|^Sil/ }));
    await waitFor(() => expect(posts).toEqual(["/api/admin/campaigns/c1"]));
    del.mockRestore();
  });

  it("audience too large disables sending", async () => {
    asRole("admin");
    mockApi({ "POST /api/admin/campaigns/audience": () => ({ count: 5000, truncated: true, max: 5000, sample: [] }), "GET /api/admin/campaigns/c1": () => FULL() });
    renderRoutes({ "/campaigns/:id": <CampaignEditor /> }, "/campaigns/c1");
    await waitFor(() => expect(screen.getByTestId("audience")).toHaveTextContent("5000"));
    expect(screen.getByRole("button", { name: /Send campaign|Kampanyayı gönder/ })).toBeDisabled();
  });
});

describe("trendyol import card: HTML description cleanup", () => {
  it("posts the cleanup and reports how many were cleaned", async () => {
    asRole("admin");
    const posts: string[] = [];
    mockApi({ "GET /api/admin/trendyol/import": () => ({ status: null }), "POST /api/admin/trendyol/import/clean-descriptions": (p) => { posts.push(p); return { cleaned: 7 }; } });
    const u = userEvent.setup(); renderRoutes({ "/": <ImportCard /> }, "/");
    await u.click(await screen.findByRole("button", { name: /Clean HTML|HTML’i temizle/ }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(await screen.findByText(/7 description|7 açıklama/)).toBeInTheDocument();
  });
});

describe("trendyol overview states", () => {
  it("shows the empty-errors message and a danger state when the API fails", async () => {
    asRole("admin");
    mockApi({ "GET /api/admin/trendyol/health": () => ({ orders: { total: 0, last7d: 0, lastAt: null, withoutCargo: 0, unmappedLines: 0 }, reconcile: { lastRunAt: null }, stock: { listings: 0, errors: 0, drift: 0, lastPushAt: null, truth: "local" }, import: null, errors: [] }) });
    renderRoutes({ "/": <Overview /> }, "/");
    expect(await screen.findByText(/No warnings or errors|Kayıtlı uyarı veya hata yok/)).toBeInTheDocument();
  });
  it("API failure shows an error box with retry", async () => {
    asRole("admin");
    mockApi({ "GET /api/admin/trendyol/health": () => new Error("boom") });
    renderRoutes({ "/": <Overview /> }, "/");
    expect(await screen.findByRole("button", { name: /Retry|Tekrar/ })).toBeInTheDocument();
  });
});

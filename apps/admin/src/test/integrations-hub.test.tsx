import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Integrations from "../pages/Integrations";
import { ToastProvider } from "../components/ui";
import { api } from "../lib/api";
import { statusOf, unhealthyCount, isConfigured } from "../lib/integrations";
import type { Integration } from "../lib/types";

const base = { enabled: false, configPublic: {}, secretsSet: {}, secretsMasked: {}, health: null, publicFields: [], secretFields: [] };
const L: Integration[] = [
  { ...base, provider: "iyzico", name: "iyzico", description: "Payments", enabled: true, secretFields: [{ key: "apiKey", label: "API key", required: true }], secretsSet: { apiKey: true }, secretsMasked: { apiKey: "••••1" }, health: { ok: true, detail: "OK", at: new Date().toISOString() } },
  { ...base, provider: "geliver", name: "Geliver", description: "Shipping", enabled: true, secretFields: [{ key: "token", label: "Token", required: true }], secretsSet: { token: true }, health: { ok: false, detail: "401 unauthorized", at: new Date().toISOString() } },
  { ...base, provider: "ga4", name: "GA4", description: "Analytics", secretFields: [{ key: "apiSecret", label: "API secret", required: true }] },
];
const mount = (list = L, mock = false) => {
  vi.spyOn(api, "get").mockImplementation(async (url: string) => (url.includes("integrations") ? list : { system: { mockMode: mock }, general: {}, branding: {} }) as never);
  return render(<MemoryRouter><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ToastProvider><Integrations /></ToastProvider></QueryClientProvider></MemoryRouter>);
};
afterEach(() => vi.restoreAllMocks());

describe("integration status helpers", () => {
  it("derives status and the unhealthy count", () => {
    expect(statusOf(L[0]!, false)).toBe("connected");
    expect(statusOf(L[1]!, false)).toBe("error");
    expect(statusOf(L[2]!, false)).toBe("unconfigured");
    expect(statusOf(L[2]!, true)).toBe("mock");
    expect(isConfigured(L[1]!)).toBe(true);
    expect(unhealthyCount(L, false)).toBe(1);
    expect(unhealthyCount(L, true)).toBe(0);
  });
});

describe("Integrations hub", () => {
  it("renders summary, status pills and filters by category and search", async () => {
    const u = userEvent.setup(); mount();
    expect(await screen.findByRole("article", { name: "iyzico" })).toHaveAttribute("data-status", "connected");
    expect(screen.getByRole("article", { name: "Geliver" })).toHaveAttribute("data-status", "error");
    expect(screen.getByRole("article", { name: "GA4" })).toHaveAttribute("data-status", "unconfigured");
    expect(screen.getByText("1 of 3")).toBeInTheDocument();
    await u.click(screen.getByRole("button", { name: /^Payments/ }));
    expect(screen.queryByRole("article", { name: "Geliver" })).toBeNull();
    await u.click(screen.getByRole("button", { name: /^All/ }));
    await u.type(screen.getByRole("searchbox", { name: "Search integrations" }), "zzz");
    expect(screen.getByText("No integrations match")).toBeInTheDocument();
  });
  it("tests a single card and shows the inline result", async () => {
    const post = vi.spyOn(api, "post").mockResolvedValue({ ok: false, detail: "bad key" } as never);
    const u = userEvent.setup(); mount();
    const card = await screen.findByRole("article", { name: "iyzico" });
    await u.click(within(card).getByRole("button", { name: /Test connection/ }));
    await waitFor(() => expect(post).toHaveBeenCalledWith("/api/admin/integrations/iyzico/test"));
    expect(await within(card).findByText(/bad key/)).toBeInTheDocument();
  });
  it("Test all runs enabled providers sequentially", async () => {
    const order: string[] = [];
    vi.spyOn(api, "post").mockImplementation(async (url: string) => { order.push(url); return { ok: true, detail: "OK" } as never; });
    const u = userEvent.setup(); mount();
    await u.click(await screen.findByRole("button", { name: "Test all" }));
    await waitFor(() => expect(order).toEqual(["/api/admin/integrations/iyzico/test", "/api/admin/integrations/geliver/test"]));
  });
  it("opens the configure drawer with masked secrets, and shows the mock note in mock mode", async () => {
    const u = userEvent.setup(); mount(L, true);
    expect(await screen.findByTestId("integrations-mock-note")).toHaveTextContent(/all integrations are simulated; real keys are ignored/);
    expect(screen.getByRole("article", { name: "iyzico" })).toHaveAttribute("data-status", "mock");
    await u.click(within(screen.getByRole("article", { name: "iyzico" })).getByRole("button", { name: "Configure" }));
    expect(await screen.findByDisplayValue("••••1")).toBeInTheDocument();
  });
});

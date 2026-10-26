import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { IntegrationForm } from "../components/IntegrationForm";
import { ToastProvider } from "../components/ui";
import { api } from "../lib/api";
import type { Integration } from "../lib/types";

const it_: Integration = {
  provider: "iyzico", name: "iyzico", enabled: false, configPublic: { baseUrl: "https://sandbox-api.iyzipay.com" },
  secretsSet: { apiKey: true, secretKey: false }, secretsMasked: { apiKey: "••••9876" }, health: { ok: false, detail: "401 from provider", at: "2026-01-01T00:00:00Z" },
  publicFields: [{ key: "baseUrl", label: "Base URL", type: "url", required: true }],
  secretFields: [{ key: "apiKey", label: "API key", required: true }, { key: "secretKey", label: "Secret key", required: true }],
  docsUrl: "https://docs.example.com/iyzico",
};
const wrap = (props: Partial<Parameters<typeof IntegrationForm>[0]> = {}) =>
  render(<QueryClientProvider client={new QueryClient()}><ToastProvider><IntegrationForm integration={it_} onTest={() => {}} {...props} /></ToastProvider></QueryClientProvider>);
afterEach(() => vi.restoreAllMocks());

describe("IntegrationForm (drawer)", () => {
  it("shows the mask, never a stored value, a docs link and required markers", () => {
    wrap();
    expect(screen.getByDisplayValue("••••9876")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Provider documentation/ })).toHaveAttribute("href", "https://docs.example.com/iyzico");
    expect(document.querySelectorAll('label [aria-hidden="true"]').length).toBeGreaterThanOrEqual(3);
  });
  it("sends only changed secrets and clears typed values after save", async () => {
    const put = vi.spyOn(api, "put").mockResolvedValue({});
    const u = userEvent.setup(); wrap();
    await u.click(screen.getByRole("button", { name: "Set" })); // secretKey
    await u.type(screen.getByLabelText(/^Secret key/), "sk-live-xyz");
    await u.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(put).toHaveBeenCalled());
    expect(put).toHaveBeenCalledWith("/api/admin/integrations/iyzico", { enabled: false, config: { baseUrl: "https://sandbox-api.iyzipay.com" }, secrets: { secretKey: "sk-live-xyz" } });
    await waitFor(() => expect(screen.queryByDisplayValue("sk-live-xyz")).toBeNull());
  });
  it("sends null to clear and disables Test while dirty", async () => {
    const put = vi.spyOn(api, "put").mockResolvedValue({});
    const u = userEvent.setup(); wrap();
    expect(screen.getByRole("button", { name: "Test connection" })).toBeEnabled();
    await u.click(screen.getByRole("button", { name: "Clear" }));
    expect(screen.getByRole("button", { name: "Test connection" })).toBeDisabled();
    await u.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(put).toHaveBeenCalledWith("/api/admin/integrations/iyzico", expect.objectContaining({ secrets: { apiKey: null } })));
  });
  it("shows inline validation errors for required fields when enabling, without calling the API", async () => {
    const put = vi.spyOn(api, "put").mockResolvedValue({});
    const u = userEvent.setup(); wrap();
    await u.click(screen.getByRole("switch", { name: "Enabled" })); // secretKey is not set
    await u.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Secret key is required")).toBeInTheDocument();
    expect(put).not.toHaveBeenCalled();
  });
  it("disables Save in mock mode but keeps Test available", () => {
    wrap({ mockMode: true });
    expect(screen.getByText(/Mock mode: this integration is simulated/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Test connection" })).toBeEnabled();
  });
  it("renders a failed test with detail and a copy button", () => {
    wrap({ testResult: { state: "fail", detail: "timeout", at: "2026-01-01T00:00:00Z" } });
    expect(screen.getByTestId("test-result")).toHaveAttribute("data-state", "fail");
    expect(screen.getByRole("button", { name: "Copy error" })).toBeInTheDocument();
  });
});

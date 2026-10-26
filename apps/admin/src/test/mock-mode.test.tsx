import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MockBanner } from "../components/MockBanner";
import { ToastProvider } from "../components/ui";
import System from "../pages/settings/System";
import * as settingsLib from "../lib/settings";
import * as auth from "../lib/auth";
import { api } from "../lib/api";

const settings = (mockMode: boolean) => vi.spyOn(settingsLib, "useSettings").mockReturnValue({ isPending: false, isError: false, data: { system: { mockMode } } } as never);
const asRole = (role: string) => vi.spyOn(auth, "useAdmin").mockReturnValue({ id: "1", email: "a@b.c", name: "A", role, totpEnabled: true } as never);
const wrap = (ui: React.ReactElement) => render(
  <QueryClientProvider client={new QueryClient()}><ToastProvider><MemoryRouter>{ui}</MemoryRouter></ToastProvider></QueryClientProvider>);

beforeEach(() => { vi.restoreAllMocks(); });

describe("admin MOCK MODE banner", () => {
  it("is shown while mock mode is on, with links to the inbox and System tab", () => {
    settings(true);
    wrap(<MockBanner />);
    expect(screen.getByTestId("mock-banner")).toHaveTextContent("MOCK MODE");
    expect(screen.getByRole("link", { name: "Turn off" }).getAttribute("href")).toBe("/settings/system");
    expect(screen.getByRole("link", { name: "Mock inbox" }).getAttribute("href")).toBe("/mock-inbox");
  });
  it("is hidden when mock mode is off or settings are not loaded", () => {
    settings(false);
    const { unmount } = wrap(<MockBanner />);
    expect(screen.queryByTestId("mock-banner")).toBeNull();
    unmount();
    vi.spyOn(settingsLib, "useSettings").mockReturnValue({ isPending: true, data: undefined } as never);
    wrap(<MockBanner />);
    expect(screen.queryByTestId("mock-banner")).toBeNull();
  });
});

describe("Settings > System mock toggle", () => {
  it("owner: asks for confirmation, then PUTs mockMode", async () => {
    settings(false); asRole("owner");
    const put = vi.spyOn(api, "put").mockResolvedValue({ mockMode: true } as never);
    wrap(<System />);
    const sw = screen.getByRole("switch", { name: /mock mode/i });
    expect(sw).toHaveAttribute("aria-checked", "false");
    expect(sw).toBeEnabled();
    fireEvent.click(sw);
    expect(put).not.toHaveBeenCalled(); // nothing happens before the dialog is confirmed
    fireEvent.click(await screen.findByRole("button", { name: "Enable mock mode" }));
    await waitFor(() => expect(put).toHaveBeenCalledWith("/api/admin/settings/system", { mockMode: true }));
  });
  it("cancelling the dialog does not save", async () => {
    settings(false); asRole("owner");
    const put = vi.spyOn(api, "put").mockResolvedValue({} as never);
    wrap(<System />);
    fireEvent.click(screen.getByRole("switch"));
    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));
    expect(put).not.toHaveBeenCalled();
  });
  it("non-owner: switch is disabled with an explanation", () => {
    settings(false); asRole("admin");
    wrap(<System />);
    expect(screen.getByRole("switch")).toBeDisabled();
    expect(screen.getByText(/only the owner/i)).toBeInTheDocument();
  });
});

import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Branding from "../pages/settings/Branding";
import { ToastProvider } from "../components/ui";
import { api } from "../lib/api";
import { BrandingSettings } from "@openshelf/shared";

const base = BrandingSettings.parse({ bannerMediaIds: ["b1", "b2"], logoMediaId: "l1" });
const settings = { general: {}, branding: base, seo: {}, legal: {}, checkout: {}, tracking: {} };
const wrap = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ToastProvider><Branding /></ToastProvider></QueryClientProvider>);
afterEach(() => vi.restoreAllMocks());

describe("Branding form", () => {
  it("loads, previews colors live, reorders banners and saves a validated payload", async () => {
    vi.spyOn(api, "get").mockResolvedValue(settings);
    const put = vi.spyOn(api, "put").mockImplementation(async (_p, body) => body);
    const u = userEvent.setup(); wrap();
    await screen.findByText("Homepage banners");

    const save = screen.getByRole("button", { name: "Save changes" });
    expect(save).toBeDisabled();

    const hex = screen.getByLabelText("Primary color hex");
    fireEvent.change(hex, { target: { value: "#112233" } });
    expect(screen.getByTestId("brand-preview").style.getPropertyValue("--os-primary")).toBe("#112233");

    await u.click(screen.getByRole("button", { name: "Move banner 1 down" }));
    await u.type(screen.getByLabelText("Banner title"), "Summer");
    expect(save).toBeEnabled();
    await u.click(save);

    await waitFor(() => expect(put).toHaveBeenCalled());
    const [path, body] = put.mock.calls[0]!;
    expect(path).toBe("/api/admin/settings/branding");
    expect(body).toMatchObject({ primaryColor: "#112233", bannerMediaIds: ["b2", "b1"], bannerTitle: "Summer" });
  });

  it("blocks invalid hex colors client-side", async () => {
    vi.spyOn(api, "get").mockResolvedValue(settings);
    const put = vi.spyOn(api, "put").mockResolvedValue({});
    const u = userEvent.setup(); wrap();
    await screen.findByText("Brand colors");
    fireEvent.change(screen.getByLabelText("Accent color hex"), { target: { value: "red" } });
    await u.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText(/6-digit hex/)).toBeInTheDocument();
    expect(put).not.toHaveBeenCalled();
  });
});

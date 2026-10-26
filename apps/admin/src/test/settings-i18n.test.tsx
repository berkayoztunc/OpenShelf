import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CheckoutSettings, GeneralSettings } from "@openshelf/shared";
import Settings from "../pages/settings/Settings";
import Audit from "../pages/Audit";
import Security from "../pages/Security";
import { ToastProvider } from "../components/ui";
import { api } from "../lib/api";
import * as auth from "../lib/auth";
import { setLocale } from "../i18n";
import { tr } from "../i18n/tr";
import { en } from "../i18n/en";

const settings = { general: GeneralSettings.parse({ storeName: "Shop" }), checkout: CheckoutSettings.parse({}) };
const mount = (ui: React.ReactElement, at = "/") => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ToastProvider><MemoryRouter initialEntries={[at]}>{ui}</MemoryRouter></ToastProvider></QueryClientProvider>);

beforeEach(() => setLocale("tr"));
afterEach(() => { cleanup(); setLocale("en"); vi.restoreAllMocks(); });

describe("settings in Turkish", () => {
  it("renders Turkish tab labels and the reservation help popover", async () => {
    vi.spyOn(api, "get").mockResolvedValue(settings);
    const u = userEvent.setup();
    mount(<Routes><Route path="/settings/:tab" element={<Settings />} /></Routes>, "/settings/checkout");
    expect(await screen.findByRole("link", { name: "Ödeme ve sipariş" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Takip ve reklam" })).toBeInTheDocument();
    expect(screen.queryByText("Checkout")).toBeNull();
    await screen.findByLabelText(/Stok ayırma süresi/);
    const row = screen.getByLabelText(/Stok ayırma süresi/).closest("div.space-y-1\\.5") as HTMLElement;
    await u.click(within(row).getByRole("button", { name: "Açıklamayı göster" }));
    expect(await screen.findByText(/ürünler bu süre boyunca onun için ayrılır/)).toBeInTheDocument();
  });
  it("every key has an English twin (settings, security)", () => {
    const mine = Object.keys(tr).filter((k) => /^(settings|security|audit|data)\.|^help\.(settings|security|audit|data)\./.test(k));
    expect(mine.length).toBeGreaterThan(400);
    expect(mine.filter((k) => !(k in en))).toEqual([]);
  });
});

describe("audit log humanizing", () => {
  const log = (action: string, entity?: string) => ({ id: 1, adminId: "x", action, entity, entityId: null, at: "2026-10-01T10:00:00Z", meta: null });
  const run = () => {
    vi.spyOn(auth, "useAdmin").mockReturnValue({ id: "me", email: "a@b.c", name: "A", role: "admin", totpEnabled: true } as never);
    vi.spyOn(api, "get").mockResolvedValue({ items: [log("mock_mode.enabled", "settings"), log("email.compose.send", "outbound_email"), log("something.new", "widget")], total: 3, page: 1, pageSize: 50 });
    mount(<Audit />);
  };
  it("maps action codes to sentences (TR) and never shows the raw code as text", async () => {
    run();
    expect(await screen.findByText("Deneme modu açıldı")).toBeInTheDocument();
    expect(screen.getByText("E-posta gönderildi")).toBeInTheDocument();
    expect(screen.getByText("Giden e-posta")).toBeInTheDocument();
    expect(screen.queryByText("mock_mode.enabled")).toBeNull();
    expect(screen.queryByText("email.compose.send")).toBeNull();
  });
  it("English sentences and fallback for unknown codes", async () => {
    setLocale("en"); run();
    expect(await screen.findByText("Mock mode was turned on")).toBeInTheDocument();
    expect(screen.getByText("Something new")).toBeInTheDocument();
  });
});

describe("MFA setup steps", () => {
  it("shows the three steps in Turkish when starting setup", async () => {
    vi.spyOn(auth, "useAdmin").mockReturnValue({ id: "1", email: "a@b.c", name: "A", role: "admin", totpEnabled: false } as never);
    vi.spyOn(auth, "useMe").mockReturnValue({ refetch: vi.fn() } as never);
    vi.spyOn(api, "post").mockResolvedValue({ secret: "ABCDEF", otpauthUrl: "otpauth://totp/x?secret=ABCDEF" } as never);
    const u = userEvent.setup();
    mount(<Security />);
    await u.click(await screen.findByRole("button", { name: "2 adımlı doğrulamayı kur" }));
    await waitFor(() => expect(screen.getByText(/QR kodu okutun/)).toBeInTheDocument());
    expect(screen.getByText(/doğrulama uygulaması kurun/)).toBeInTheDocument();
    expect(screen.getByText(/6 haneli kodu aşağıya yazıp/)).toBeInTheDocument();
  });
});

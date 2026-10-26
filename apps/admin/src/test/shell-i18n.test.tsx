import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiError, errDetailList, errMsg } from "../lib/api";
import { setLocale } from "../i18n";
import { IntegrationForm } from "../components/IntegrationForm";
import { localizeDetail } from "../components/TestResult";
import { ToastProvider } from "../components/ui";
import { buildOnboarding } from "../lib/onboarding";
import { LoginPage } from "../pages/Login";
import { api } from "../lib/api";
import type { Integration } from "../lib/types";

afterEach(() => vi.restoreAllMocks());

describe("API error mapping", () => {
  it("maps known codes to the active language", () => {
    const e = new ApiError(409, "insufficient_stock", "Not enough stock");
    setLocale("tr"); expect(errMsg(e)).toMatch(/Yeterli stok yok/);
    setLocale("en"); expect(errMsg(e)).toMatch(/Not enough stock/);
  });
  it("falls back to the server message for unknown codes and a generic text for non-API errors", () => {
    setLocale("tr");
    expect(errMsg(new ApiError(418, "teapot", "I am a teapot"))).toBe("I am a teapot");
    expect(errMsg({})).toMatch(/ters gitti/);
    expect(errMsg(new TypeError("Failed to fetch"))).toMatch(/ulaşılamadı/);
  });
  it("429 says when to retry", () => {
    setLocale("tr");
    expect(errMsg(new ApiError(429, "rate_limited", "x", undefined, 300))).toMatch(/5 dakika/);
    expect(errMsg(new ApiError(429, "rate_limited", "x", undefined, 30))).toMatch(/30 saniye/);
    expect(errMsg(new ApiError(429, "account_locked", "x"))).toMatch(/Birkaç dakika/);
    setLocale("en");
    expect(errMsg(new ApiError(429, "rate_limited", "x", undefined, 120))).toMatch(/2 minutes/);
  });
  it("names the missing record and distinguishes CSRF / origin / login errors", () => {
    setLocale("tr");
    expect(errMsg(new ApiError(404, "not_found", "Order not found"))).toMatch(/^Sipariş bulunamadı/);
    expect(errMsg(new ApiError(403, "forbidden", "Invalid CSRF token"))).toMatch(/CSRF/);
    expect(errMsg(new ApiError(403, "forbidden", "Origin not allowed"))).toMatch(/adres/);
    expect(errMsg(new ApiError(401, "unauthorized", "Invalid credentials"))).toMatch(/parola hatalı/i);
  });
  it("turns validation details into a friendly list", () => {
    const e = new ApiError(400, "validation_error", "Invalid request", [
      { path: "email", message: "Invalid email", code: "invalid_string" },
      { path: "lines.0.name", message: "Required", code: "invalid_type" },
      { path: "title", message: "String must contain at most 80 character(s)", code: "too_big" },
    ]);
    setLocale("tr");
    expect(errDetailList(e)).toEqual(["E-posta (geçerli bir e-posta adresi olmalı)", "Ad (zorunlu)", "Başlık (en çok 80 karakter olabilir)"]);
    expect(errMsg(e)).toMatch(/^Düzeltilmesi gerekenler: E-posta/);
    setLocale("en");
    expect(errDetailList(e)[0]).toBe("Email (must be a valid email address)");
  });
});

describe("test-result detail phrases", () => {
  it("translates stable adapter phrases and keeps provider text", () => {
    setLocale("tr");
    expect(localizeDetail("mock mode: no external call made")).toMatch(/Deneme modu/);
    expect(localizeDetail("HTTP 401: nope")).toMatch(/anahtarlarını/);
    expect(localizeDetail("weird provider error")).toBe("weird provider error");
  });
});

const ga4: Integration = {
  provider: "ga4", name: "Google Analytics 4 (Measurement Protocol)", enabled: false, configPublic: {}, secretsSet: {}, secretsMasked: {}, health: null,
  publicFields: [{ key: "measurementId", label: "Measurement ID", required: true, type: "text", placeholder: "G-XXXXXXXXXX" }],
  secretFields: [{ key: "apiSecret", label: "Measurement Protocol API secret", required: true }],
};
const wrap = (it: Integration) => render(<MemoryRouter><QueryClientProvider client={new QueryClient()}><ToastProvider><IntegrationForm integration={it} onTest={() => {}} /></ToastProvider></QueryClientProvider></MemoryRouter>);

describe("IntegrationForm in Turkish", () => {
  it("shows translated labels, hints, '?' help and the setup guide link", async () => {
    setLocale("tr");
    const u = userEvent.setup(); wrap(ga4);
    expect(screen.getByLabelText(/Ölçüm kimliği/)).toBeInTheDocument();
    expect(screen.getByText(/G- ile başlayan kimliği/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bağlantıyı test et" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Kurulum rehberi/ })).toHaveAttribute("href", "/help/integrations#google-analytics-4");
    await u.click(screen.getAllByRole("button", { name: "Açıklamayı göster" })[0]!);
    expect(screen.getByRole("dialog")).toHaveTextContent("Ölçüm Kimliği");
  });
  it("keeps the server English text in English for English-authored manifests", () => {
    wrap(ga4);
    expect(screen.getByLabelText(/^Measurement ID/)).toBeInTheDocument();
  });
});

describe("onboarding checklist", () => {
  const base = { storeName: "My Store", productCount: 0, originNotice: "derived_origins_workers_dev", mockMode: true };
  it("marks nothing done on a fresh install except unset defaults", () => {
    const s = buildOnboarding(base);
    expect(s).toHaveLength(10);
    expect(s.filter((x) => x.done)).toEqual([]);
  });
  it("derives each step from existing data and links to anchors from the guide map", () => {
    const s = buildOnboarding({ storeName: "Atölye", logoMediaId: "m1", productCount: 3, paymentConnected: true, shippingConnected: true, invoicingConnected: true, adminEmail: "a@b.c", originNotice: null, totpEnabled: true, mockMode: false });
    expect(s.every((x) => x.done)).toBe(true);
    expect(buildOnboarding(base).find((x) => x.id === "payment")).toMatchObject({ to: "/integrations?configure=iyzico", guide: "integrations#iyzico" });
  });
});

describe("Login language switch", () => {
  it("is shown on the login page and switches the whole page", async () => {
    vi.spyOn(api, "get").mockResolvedValue({ needsSetup: false } as never);
    const u = userEvent.setup();
    setLocale("tr");
    render(<MemoryRouter><QueryClientProvider client={new QueryClient()}><LoginPage /></QueryClientProvider></MemoryRouter>);
    expect(screen.getByRole("heading", { name: "Tekrar hoş geldiniz" })).toBeInTheDocument();
    await u.click(screen.getByRole("button", { name: /^en$/i }));
    expect(screen.getByRole("heading", { name: "Welcome back" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Guide/ })).toHaveAttribute("href", "/help/getting-started#ilk-giris");
  });
});

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const cfg = vi.hoisted(() => ({ mockMode: false as boolean | undefined, locale: "en" as "en" | "tr" }));
vi.mock("../store/ConfigContext", () => ({ useConfig: () => ({ config: { mockMode: cfg.mockMode } }) }));
vi.mock("../i18n", () => ({ useI18n: () => ({ locale: cfg.locale }) }));
import { MockBanner } from "../components/MockBanner";

describe("storefront mock banner", () => {
  it("shows a persistent status banner only in mock mode", () => {
    cfg.mockMode = true;
    const { unmount } = render(<MockBanner />);
    expect(screen.getByRole("status").textContent).toMatch(/DEMO \/ MOCK PAYMENTS/);
    unmount();
    cfg.mockMode = false;
    render(<MockBanner />);
    expect(screen.queryByRole("status")).toBeNull();
  });
  it("is localized and hidden when the flag is absent", () => {
    cfg.mockMode = true; cfg.locale = "tr";
    const { unmount } = render(<MockBanner />);
    expect(screen.getByRole("status").textContent).toMatch(/MOCK ÖDEME/);
    unmount();
    cfg.mockMode = undefined;
    render(<MockBanner />);
    expect(screen.queryByRole("status")).toBeNull();
  });
});

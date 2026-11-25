import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AnnouncementSettings, announcementActive } from "@openshelf/shared";

const cfg = vi.hoisted(() => ({ announcement: null as unknown, locale: "tr" }));
vi.mock("../store/ConfigContext", () => ({ useConfig: () => ({ config: { announcement: cfg.announcement } }) }));
vi.mock("../i18n", () => ({ useI18n: () => ({ t: (k: string) => k, locale: cfg.locale }) }));
const { AnnouncementBar } = await import("../components/AnnouncementBar");

const bar = (o: object = {}) => AnnouncementSettings.parse({ enabled: true, text: "SEPETTE10 koduyla sepette %10 indirim", ...o });
const mount = () => render(<MemoryRouter><AnnouncementBar /></MemoryRouter>);
afterEach(() => { cleanup(); cfg.locale = "tr"; });

describe("announcementActive", () => {
  const now = Date.parse("2026-11-25T12:00:00Z");
  it("needs enabled + text", () => {
    expect(announcementActive(bar(), now)).toBe(true);
    expect(announcementActive(bar({ enabled: false }), now)).toBe(false);
    expect(announcementActive(bar({ text: "   " }), now)).toBe(false);
  });
  it("respects the start/end window (end exclusive); an inverted window never shows", () => {
    expect(announcementActive(bar({ endsAt: "2026-12-31T23:59:00+03:00" }), now)).toBe(true);
    expect(announcementActive(bar({ endsAt: "2026-11-25T12:00:00Z" }), now)).toBe(false);
    expect(announcementActive(bar({ startsAt: "2026-12-01T00:00:00+03:00" }), now)).toBe(false);
    expect(announcementActive(bar({ startsAt: "2026-12-01T00:00:00Z", endsAt: "2026-11-01T00:00:00Z" }), now)).toBe(false);
  });
  it("rejects unsafe links", () => {
    expect(AnnouncementSettings.safeParse({ link: "javascript:alert(1)" }).success).toBe(false);
    expect(AnnouncementSettings.safeParse({ link: "//evil.example" }).success).toBe(false);
    expect(AnnouncementSettings.safeParse({ link: "/products" }).success).toBe(true);
    expect(AnnouncementSettings.safeParse({ link: "https://example.com/x" }).success).toBe(true);
  });
});

describe("AnnouncementBar", () => {
  it("renders nothing when off or expired", () => {
    cfg.announcement = null; mount();
    expect(screen.queryByTestId("announcement-bar")).toBeNull();
    cfg.announcement = bar({ endsAt: "2000-01-01T00:00:00Z" }); mount();
    expect(screen.queryByTestId("announcement-bar")).toBeNull();
  });
  it("marquee: screen readers get the text once, the moving copies are hidden", () => {
    cfg.announcement = bar(); mount();
    const region = screen.getByRole("region", { name: "announcement.label" });
    expect(screen.getAllByText("SEPETTE10 koduyla sepette %10 indirim")).toHaveLength(1); // the sr-only copy
    expect(region.querySelector("[aria-hidden]")?.textContent).toContain("SEPETTE10");
  });
  it("static style, English text and an internal link", () => {
    cfg.locale = "en";
    cfg.announcement = bar({ style: "static", textEn: "10% off with SEPETTE10", link: "/products" }); mount();
    const link = screen.getByRole("link", { name: "10% off with SEPETTE10" });
    expect(link.getAttribute("href")).toBe("/products");
  });
  it("external links open in a new tab", () => {
    cfg.announcement = bar({ style: "static", link: "https://example.com/kampanya" }); mount();
    const link = screen.getByRole("link");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
  });
});

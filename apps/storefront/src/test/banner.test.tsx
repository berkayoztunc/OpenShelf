import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const cfg = vi.hoisted(() => ({ branding: { bannerUrls: ["/media/a", "/media/b"] as string[], bannerTitle: "Yeni sezon", bannerSubtitle: "Koleksiyon", bannerCtaLabel: "Gör", bannerCtaUrl: "/products" } }));
vi.mock("../store/ConfigContext", () => ({ useConfig: () => ({ config: { branding: cfg.branding, general: { storeName: "Mağaza", tagline: "" }, checkout: { freeShippingThreshold: null } } }) }));
vi.mock("../i18n", () => ({ useI18n: () => ({ t: (k: string) => k, locale: "tr" }) }));
vi.mock("../components/Money", () => ({ useMoney: () => (n: number) => String(n) }));
import { Banner } from "../components/Banner";

const mount = () => render(<MemoryRouter><Banner /></MemoryRouter>).container;

describe("hero banner carousel", () => {
  it("always spans the full width at the banner's own 16:7 ratio (no 4:5 phone crop, no width-shrinking cap)", () => {
    const box = mount().querySelector('section[aria-roledescription="carousel"] > div') as HTMLElement;
    const cls = box.className;
    expect(cls).toContain("aspect-[16/7]"); expect(cls).toContain("w-full");
    expect(cls).not.toMatch(/aspect-\[4\/5\]/);                  // the old phone ratio showed only ~35% of the image
    expect(cls).toMatch(/lg:max-h-\[840px\]/);                     // 840px is exactly 16:7 at 1920px: no crop up to full-HD
  });
  it("tablet/desktop overlay the text; phones show the same text under the image instead of covering it", () => {
    const c = mount();
    const overlay = c.querySelector("div.hidden.sm\\:flex") as HTMLElement; const below = c.querySelector("div.sm\\:hidden") as HTMLElement;
    expect(overlay?.textContent).toContain("Yeni sezon"); expect(below?.textContent).toContain("Yeni sezon");
    expect(below.querySelector("a")?.getAttribute("href")).toBe("/products");
    expect(c.querySelector('section[aria-roledescription="carousel"] > div')!.contains(below)).toBe(false);   // under the image, not on top of it
  });
  it("images keep object-cover inside the box and the zoom is gentle", () => {
    const img = mount().querySelector("img") as HTMLImageElement;
    expect(img.className).toContain("object-cover"); expect(img.className).toContain("scale-[1.02]"); expect(img.className).not.toContain("scale-105");
  });
  it("without text there is no text block at all", () => {
    cfg.branding = { ...cfg.branding, bannerTitle: "", bannerSubtitle: "", bannerCtaLabel: "" };
    const c = mount(); expect(c.querySelector("div.sm\\:hidden")).toBeNull(); expect(c.querySelector("h1")).toBeNull();
  });
});

import { beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Category } from "../api/types";

const cats: Category[] = [{ id: "c1", slug: "vazo", name: "Vazolar" }, { id: "c2", slug: "tabak", name: "Tabaklar" }, { id: "c1a", slug: "kucuk-vazo", name: "Küçük vazolar", parentId: "c1" }];
const cfg = vi.hoisted(() => ({ menu: undefined as unknown }));
vi.mock("../store/ConfigContext", () => ({ useConfig: () => ({ config: { menu: cfg.menu }, locales: ["tr"] }) }));
vi.mock("../i18n", () => ({ useI18n: () => ({ t: (k: string, v?: Record<string, string>) => (v ? `${k}:${Object.values(v).join(",")}` : k), locale: "tr", setLocale: () => {} }) }));
vi.mock("../cart/CartContext", () => ({ useCart: () => ({ totals: { itemCount: 0 }, setDrawerOpen: () => {} }) }));
vi.mock("../components/ThemeMenu", () => ({ ThemeMenu: () => null }));
vi.mock("../components/Logo", () => ({ Logo: () => <span>logo</span> }));
vi.mock("../api/client", () => ({ api: { categories: async () => cats } }));
import { Header } from "../components/Header";

const item = (o: object) => ({ id: "i", type: "category", categoryId: null, label: "", labelEn: "", url: "", newTab: false, showChildren: true, ...o }) as never;
const Where = () => <p data-testid="where">{useLocation().pathname}</p>;
const mount = () => render(<QueryClientProvider client={new QueryClient()}><MemoryRouter initialEntries={["/"]}><Header /><Routes><Route path="*" element={<Where />} /></Routes></MemoryRouter></QueryClientProvider>);

beforeAll(() => {
  // jsdom has no <dialog> modal support: emulate open/close so the component's real code path runs
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); this.dispatchEvent(new Event("close")); };
});

describe("hamburger menu (phones)", () => {
  it("a hamburger button opens a navigation drawer with every menu item; the close button closes it", async () => {
    cfg.menu = { auto: false, showProductsLink: true, items: [item({ id: "a", categoryId: "c1" }), item({ id: "b", categoryId: "c2" }), item({ id: "c", type: "link", label: "Blog", url: "https://blog.example.com/", newTab: true })] };
    mount();
    const burger = await screen.findByRole("button", { name: "nav.openMenu" });
    expect(burger.getAttribute("aria-expanded")).toBe("false"); expect(burger.className).toContain("md:hidden");   // desktop keeps the inline menu
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(burger);
    const dlg = await screen.findByRole("dialog");
    const nav = within(dlg).getByRole("navigation", { name: "nav.menu" });
    for (const name of ["nav.products", "Vazolar", "Tabaklar", "Blog"]) expect(within(nav).getByRole("link", { name })).toBeTruthy();
    const blog = within(nav).getByRole("link", { name: "Blog" }); expect(blog.getAttribute("target")).toBe("_blank"); expect(blog.getAttribute("rel")).toContain("noopener");
    expect(screen.getByRole("button", { name: "nav.openMenu" }).getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(within(dlg).getByRole("button", { name: "nav.closeMenu" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("categories with sub-categories get an expand button; children are hidden until expanded", async () => {
    cfg.menu = { auto: false, showProductsLink: false, items: [item({ id: "a", categoryId: "c1" })] };
    mount(); fireEvent.click(await screen.findByRole("button", { name: "nav.openMenu" }));
    const dlg = await screen.findByRole("dialog");
    expect(within(dlg).queryByRole("link", { name: "Küçük vazolar" })).toBeNull();
    const toggle = within(dlg).getByRole("button", { name: "nav.expand:Vazolar" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(toggle);
    expect(within(dlg).getByRole("link", { name: "Küçük vazolar" }).getAttribute("href")).toBe("/category/kucuk-vazo");
    expect(within(dlg).getByRole("button", { name: "nav.collapse:Vazolar" }).getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(within(dlg).getByRole("button", { name: "nav.collapse:Vazolar" }));
    expect(within(dlg).queryByRole("link", { name: "Küçük vazolar" })).toBeNull();
  });
  it("choosing a link navigates and closes the drawer; the page behind does not scroll while it is open", async () => {
    cfg.menu = { auto: false, showProductsLink: true, items: [item({ id: "b", categoryId: "c2" })] };
    mount(); fireEvent.click(await screen.findByRole("button", { name: "nav.openMenu" }));
    const dlg = await screen.findByRole("dialog");
    expect(document.documentElement.style.overflow).toBe("hidden");
    fireEvent.click(within(dlg).getByRole("link", { name: "Tabaklar" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByTestId("where").textContent).toBe("/category/tabak");
    expect(document.documentElement.style.overflow).toBe("");
  });
  it("it does not close itself right after opening (only a real navigation or the user closes it)", async () => {
    cfg.menu = undefined; mount();
    fireEvent.click(await screen.findByRole("button", { name: "nav.openMenu" }));
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.getByRole("dialog")).toBeTruthy();
  });
  it("the old scrolling chip row is gone (one phone navigation, not two)", async () => {
    cfg.menu = undefined; const c = mount().container;
    await screen.findByRole("button", { name: "nav.openMenu" });
    expect(c.querySelectorAll("nav.overflow-x-auto").length).toBe(0);
  });
});

import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { Category } from "../api/types";
import { buildMenu } from "../lib/menu";

const cats: Category[] = [
  { id: "c1", slug: "vazo", name: "Vazolar" }, { id: "c2", slug: "tabak", name: "Tabaklar" }, { id: "c3", slug: "ortu", name: "Örtüler" },
  { id: "c4", slug: "mum", name: "Mumlar" }, { id: "c5", slug: "sepet", name: "Sepetler" }, { id: "c1a", slug: "kucuk-vazo", name: "Küçük vazolar", parentId: "c1" },
];
const item = (o: object) => ({ id: "i", type: "category", categoryId: null, label: "", labelEn: "", url: "", newTab: false, showChildren: true, ...o }) as never;

describe("buildMenu", () => {
  it("automatic menu = all products + the first four top-level categories (sub-categories never)", () => {
    for (const menu of [undefined, { auto: true, showProductsLink: true, items: [] }]) {
      expect(buildMenu(menu, cats, "tr", "Tüm ürünler").map((n) => n.label)).toEqual(["Tüm ürünler", "Vazolar", "Tabaklar", "Örtüler", "Mumlar"]);
    }
  });
  it("manual menu keeps the configured order, label overrides, locale labels and custom links", () => {
    const menu = { auto: false, showProductsLink: false, items: [
      item({ id: "a", categoryId: "c5", label: "Hepsi" }), item({ id: "b", categoryId: "c1" }),
      item({ id: "c", type: "link", label: "Kampanyalar", labelEn: "Sales", url: "/page/kampanya" }),
      item({ id: "d", type: "link", label: "Blog", url: "https://blog.example.com/", newTab: true }),
    ] };
    const tr = buildMenu(menu, cats, "tr", "Tüm ürünler");
    expect(tr.map((n) => n.label)).toEqual(["Hepsi", "Vazolar", "Kampanyalar", "Blog"]);
    expect(tr[1]!.children.map((c) => c.label)).toEqual(["Küçük vazolar"]);
    expect(tr[2]).toMatchObject({ to: "/page/kampanya" }); expect(tr[3]).toMatchObject({ href: "https://blog.example.com/", newTab: true });
    expect(buildMenu(menu, cats, "en", "All")[2]!.label).toBe("Sales");
  });
  it("skips categories that no longer exist, honours showChildren=false and showProductsLink", () => {
    const menu = { auto: false, showProductsLink: true, items: [item({ id: "x", categoryId: "gone" }), item({ id: "y", categoryId: "c1", showChildren: false })] };
    const nodes = buildMenu(menu, cats, "tr", "Tüm ürünler");
    expect(nodes.map((n) => n.label)).toEqual(["Tüm ürünler", "Vazolar"]);
    expect(nodes[1]!.children).toEqual([]);
  });
});

const cfg = vi.hoisted(() => ({ menu: undefined as unknown }));
vi.mock("../store/ConfigContext", () => ({ useConfig: () => ({ config: { menu: cfg.menu }, locales: ["tr"] }) }));
vi.mock("../i18n", () => ({ useI18n: () => ({ t: (k: string) => k, locale: "tr", setLocale: () => {} }) }));
vi.mock("../cart/CartContext", () => ({ useCart: () => ({ totals: { itemCount: 0 }, setDrawerOpen: () => {} }) }));
vi.mock("../components/ThemeMenu", () => ({ ThemeMenu: () => null }));
vi.mock("../components/Logo", () => ({ Logo: () => null }));
vi.mock("../api/client", () => ({ api: { categories: async () => cats } }));
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Header } from "../components/Header";

describe("Header menu", () => {
  it("renders custom links, opens dropdown children and marks external links safely", async () => {
    cfg.menu = { auto: false, showProductsLink: true, items: [item({ id: "b", categoryId: "c1" }), item({ id: "d", type: "link", label: "Blog", url: "https://blog.example.com/", newTab: true })] };
    render(<QueryClientProvider client={new QueryClient()}><MemoryRouter><Header /></MemoryRouter></QueryClientProvider>);
    const [desktop] = await screen.findAllByRole("navigation", { name: "nav.menu" });
    expect((await within(desktop!).findByRole("link", { name: "Küçük vazolar" })).getAttribute("href")).toBe("/category/kucuk-vazo");
    const blog = within(desktop!).getByRole("link", { name: "Blog" });
    expect(blog.getAttribute("href")).toBe("https://blog.example.com/"); expect(blog.getAttribute("target")).toBe("_blank"); expect(blog.getAttribute("rel")).toContain("noopener");
  });
});

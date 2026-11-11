import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Category, ProductSummary } from "../api/types";

const cats: Category[] = [
  { id: "c1", slug: "vazo", name: "Vazolar", description: "El yapımı seramik vazolar.\nHer biri tek.", descriptionEn: "Hand-made ceramic vases." },
  { id: "c1a", slug: "kucuk-vazo", name: "Küçük vazolar", parentId: "c1" }, { id: "c1b", slug: "buyuk-vazo", name: "Büyük vazolar", parentId: "c1" },
  { id: "c2", slug: "tabak", name: "Tabaklar" }, { id: "c3", slug: "ortu", name: "Örtüler", imageUrl: "/media/m3" },
];
const prod = (id: string, img = true): ProductSummary => ({ id, slug: id, title: `Ürün ${id}`, images: img ? [{ url: `https://x/${id}.jpg` }] : [], price: 1000, currency: "TRY", variants: [] } as never);
const state = vi.hoisted(() => ({ items: [] as unknown[], total: 0, locale: "tr" as "tr" | "en", cards: undefined as undefined | "plain" | "image" }));
vi.mock("../api/client", () => ({ api: { categories: async () => cats, products: async () => ({ items: state.items, total: state.total, page: 1, pageSize: 12 }) } }));
vi.mock("../store/ConfigContext", () => ({ useConfig: () => ({ config: { general: { currency: "TRY", storeName: "M", description: "" }, seo: {}, branding: {}, merchandising: { defaultSort: "newest" }, checkout: {}, homepage: { categoryCards: state.cards } } }) }));
vi.mock("../i18n", () => ({ useI18n: () => ({ t: (k: string, v?: Record<string, unknown>) => (v ? `${k}:${Object.values(v).join(",")}` : k), locale: state.locale }) }));
vi.mock("../lib/head", () => ({ useHead: () => {}, absUrl: (u: string) => u }));
vi.mock("../tracking", () => ({ track: () => {}, getConsent: () => ({}), onConsentChange: () => () => {} }));
vi.mock("../components/ProductCard", () => ({ ProductGrid: ({ products }: { products: { id: string }[] }) => <ul data-testid="grid">{products.map((p) => <li key={p.id}>{p.id}</li>)}</ul>, ProductGridSkeleton: () => <div>skeleton</div> }));
import Listing from "../pages/Listing";

const mount = (path: string) => render(<QueryClientProvider client={new QueryClient()}><MemoryRouter initialEntries={[path]}><Routes><Route path="/category/:slug" element={<Listing />} /><Route path="/products" element={<Listing />} /></Routes></MemoryRouter></QueryClientProvider>);

describe("category page", () => {
  it("has a hero with breadcrumb, title, description and product count — and does NOT list every category as filter chips", async () => {
    state.items = [prod("p1"), prod("p2")]; state.total = 2; state.locale = "tr";
    mount("/category/vazo");
    expect((await screen.findByRole("heading", { level: 1, name: "Vazolar" })).textContent).toBe("Vazolar");
    expect(screen.getByText(/El yapımı seramik vazolar\./)).toBeTruthy();
    expect(screen.getByText("list.count:2")).toBeTruthy();
    const crumb = screen.getByRole("navigation", { name: "cat.breadcrumb" });
    expect(within(crumb).getByRole("link", { name: "product.home" }).getAttribute("href")).toBe("/");
    expect(screen.queryByRole("link", { name: "list.allCategories" })).toBeNull();           // no all-categories chip row on a category page
    expect(screen.queryByRole("navigation", { name: "list.filters" })).toBeNull();
    expect(screen.getByTestId("grid").children).toHaveLength(2);
  });
  it("a parent category lists only ITS subcategories", async () => {
    state.items = [prod("p1")]; state.total = 1;
    mount("/category/vazo");
    const sub = await screen.findByRole("region", { name: /^cat\.sub/ });
    expect(within(sub).getAllByRole("link").map((a) => a.textContent)).toEqual(["Küçük vazolar", "Büyük vazolar"]);
    expect(within(sub).queryByRole("link", { name: "Tabaklar" })).toBeNull();
    expect(within(sub).getByRole("link", { name: "Küçük vazolar" }).getAttribute("href")).toBe("/category/kucuk-vazo");
  });
  it("a subcategory shows its siblings (current one marked), a way back to the parent and the parent in the breadcrumb", async () => {
    state.items = [prod("p1")]; state.total = 1;
    mount("/category/kucuk-vazo");
    await screen.findByRole("heading", { level: 1, name: "Küçük vazolar" });
    const crumb = screen.getByRole("navigation", { name: "cat.breadcrumb" });
    expect(within(crumb).getByRole("link", { name: "Vazolar" }).getAttribute("href")).toBe("/category/vazo");
    const sib = screen.getByRole("region", { name: /cat\.inParent/ });
    expect(within(sib).getByRole("link", { name: "Küçük vazolar" }).getAttribute("aria-current")).toBe("page");
    expect(within(sib).getByRole("link", { name: "Büyük vazolar" })).toBeTruthy();
    expect(within(sib).getByRole("link", { name: /cat\.back/ }).getAttribute("href")).toBe("/category/vazo");
  });
  it("other top-level categories are offered at the bottom, never the current one or its siblings", async () => {
    state.items = [prod("p1")]; state.total = 1;
    mount("/category/kucuk-vazo");
    const others = (await screen.findByRole("heading", { name: "cat.others" })).closest("section")!;
    expect(within(others).getAllByRole("link").map((a) => a.getAttribute("href"))).toEqual(["/category/tabak", "/category/ortu"]);   // not Vazolar (the parent), not the sub-categories
  });
  it("other-category cards are plain by default (no photo, no icon); 'image' mode shows the photo only where one exists", async () => {
    state.items = [prod("p1")]; state.total = 1; state.cards = undefined;
    const a = mount("/category/kucuk-vazo");
    const sec = (await screen.findByRole("heading", { name: "cat.others" })).closest("section")!;
    expect([...sec.querySelectorAll("a")].map((l) => l.getAttribute("data-card"))).toEqual(["plain", "plain"]);
    expect(sec.querySelector("img")).toBeNull(); a.unmount();
    state.cards = "image"; mount("/category/kucuk-vazo");
    const sec2 = (await screen.findByRole("heading", { name: "cat.others" })).closest("section")!;
    expect([...sec2.querySelectorAll("a")].map((l) => l.getAttribute("data-card"))).toEqual(["plain", "image"]);   // Tabaklar has no photo → plain
    expect(sec2.querySelector("img")?.getAttribute("src")).toContain("/media/m3"); state.cards = undefined;
  });
  it("English description is used for the en locale; an empty category explains itself instead of showing a search miss", async () => {
    state.items = []; state.total = 0; state.locale = "en";
    mount("/category/vazo");
    expect(await screen.findByText("Hand-made ceramic vases.")).toBeTruthy();
    expect(screen.getByText("cat.emptyHere")).toBeTruthy(); expect(screen.getByText("cat.emptyHereHint")).toBeTruthy();
  });
  it("hero collage uses product images of the category and is hidden from assistive tech; no images means no collage", async () => {
    state.locale = "tr"; state.items = [prod("p1"), prod("p2"), prod("p3"), prod("p4")]; state.total = 4;
    const { container, unmount } = mount("/category/tabak");
    await screen.findByRole("heading", { level: 1, name: "Tabaklar" });
    const collage = container.querySelector("div[aria-hidden='true'].lg\\:grid"); expect(collage?.querySelectorAll("img").length).toBe(3);
    unmount();
    state.items = [prod("p1", false)]; state.total = 1;
    const second = mount("/category/tabak"); await screen.findByRole("heading", { level: 1, name: "Tabaklar" });
    expect(second.container.querySelector("div[aria-hidden='true'].lg\\:grid")).toBeNull();
  });
  it("the all-products page keeps the category chips (that is where they belong)", async () => {
    state.items = [prod("p1")]; state.total = 1;
    mount("/products");
    expect(await screen.findByRole("navigation", { name: "list.filters" })).toBeTruthy();
    expect(await screen.findByRole("link", { name: "Tabaklar" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "cat.others" })).toBeNull();
  });
});

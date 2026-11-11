import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HomepageSettings, MenuSettings, MerchandisingSettings } from "@openshelf/shared";
import Menu from "../pages/storefront/Menu";
import Merchandising from "../pages/storefront/Merchandising";
import HomeProducts from "../pages/storefront/HomeProducts";
import Storefront from "../pages/storefront/Storefront";
import { MemoryRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { ToastProvider } from "../components/ui";
import { api } from "../lib/api";
import { setLocale } from "../i18n";

const CATS = { items: [{ id: "c1", slug: "vazo", nameTr: "Vazolar" }, { id: "c2", slug: "tabak", nameTr: "Tabaklar" }, { id: "c3", slug: "ortu", nameTr: "Örtüler" }, { id: "c4", slug: "mum", nameTr: "Mumlar" }, { id: "c5", slug: "sepet", nameTr: "Sepetler" }] };
const wrap = (ui: React.ReactElement) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ToastProvider>{ui}</ToastProvider></QueryClientProvider>);
beforeEach(() => setLocale("tr"));
afterEach(() => vi.restoreAllMocks());

describe("Settings → Menu", () => {
  const load = (menu = MenuSettings.parse({})) => vi.spyOn(api, "get").mockImplementation(async (p: string) => (p.startsWith("/api/admin/categories") ? CATS : { menu }) as never);
  it("automatic by default; turning it off seeds the manual menu with what is shown today", async () => {
    load(); const put = vi.spyOn(api, "put").mockImplementation(async (_p, b) => b as never); const u = userEvent.setup(); wrap(<Menu />);
    const sw = await screen.findByRole("switch", { name: "Otomatik menü" });
    expect(sw).toHaveAttribute("aria-checked", "true");
    await u.click(sw);
    expect(await screen.findByRole("button", { name: "4. öğeyi aşağı taşı" })).toBeDisabled();
    await u.click(screen.getByRole("button", { name: "Değişiklikleri kaydet" }));
    await waitFor(() => expect(put).toHaveBeenCalled());
    const body = put.mock.calls[0]![1] as { auto: boolean; items: { categoryId: string }[] };
    expect(body.auto).toBe(false); expect(body.items.map((i) => i.categoryId)).toEqual(["c1", "c2", "c3", "c4"]);
  });
  it("adds a category and a custom link, reorders and removes items; invalid links are blocked", async () => {
    load(MenuSettings.parse({ auto: false, items: [{ id: "a", type: "category", categoryId: "c1" }, { id: "b", type: "category", categoryId: "c2" }] }));
    const put = vi.spyOn(api, "put").mockImplementation(async (_p, b) => b as never); const u = userEvent.setup(); wrap(<Menu />);
    await u.click(await screen.findByRole("button", { name: "1. öğeyi aşağı taşı" }));
    await u.selectOptions(screen.getByLabelText("Kategori ekle"), "c5"); await u.click(screen.getByRole("button", { name: "Kategoriyi ekle" }));
    await u.click(screen.getByRole("button", { name: "Özel bağlantı ekle" }));
    const save = screen.getByRole("button", { name: "Değişiklikleri kaydet" });
    await u.click(save); // new link has no label/address yet
    expect(put).not.toHaveBeenCalled();
    const labels = screen.getAllByLabelText("Menüde görünen ad"); const link = labels[labels.length - 1]!;
    await u.type(link, "Kampanyalar"); await u.type(screen.getByLabelText("Adres"), "javascript:alert(1)"); await u.click(save);
    expect(put).not.toHaveBeenCalled();
    await u.clear(screen.getByLabelText("Adres")); await u.type(screen.getByLabelText("Adres"), "/page/kampanyalar");
    await u.click(screen.getByRole("button", { name: "2. öğeyi kaldır" }));
    await u.click(save);
    await waitFor(() => expect(put).toHaveBeenCalled());
    const items = (put.mock.calls[0]![1] as { items: { id: string; type: string; categoryId: string | null; url: string }[] }).items;
    expect(items.map((i) => i.categoryId ?? i.url)).toEqual(["c2", "c5", "/page/kampanyalar"]);
  });
});

describe("Settings → Product order", () => {
  const PRODUCTS = { items: [{ id: "p1", nameTr: "Seramik Vazo", status: "active" }, { id: "p2", nameTr: "Keten Örtü", status: "active" }, { id: "p3", nameTr: "Ahşap Tabak", status: "active" }] };
  const load = (m = MerchandisingSettings.parse({})) => vi.spyOn(api, "get").mockImplementation(async (p: string) => {
    if (!p.startsWith("/api/admin/products")) return { merchandising: m } as never;
    const ids = new URL(p, "http://x").searchParams.get("ids"); const q = new URL(p, "http://x").searchParams.get("q");
    return { items: ids ? PRODUCTS.items.filter((x) => ids.split(",").includes(x.id)) : PRODUCTS.items.filter((x) => x.nameTr.toLowerCase().includes((q ?? "").toLowerCase())) } as never;
  });
  it("pins products from search, reorders them and saves the pinned list with the chosen default sort", async () => {
    load(); const put = vi.spyOn(api, "put").mockImplementation(async (_p, b) => b as never); const u = userEvent.setup(); wrap(<Merchandising />);
    await u.selectOptions(await screen.findByLabelText("Müşteri bir sıralama seçmediğinde"), "featured");
    await u.type(screen.getByLabelText("Ürün ara ve sabitle"), "vazo");
    await u.click(await screen.findByRole("button", { name: "Seramik Vazo ürününü sabitle" }));
    await u.type(screen.getByLabelText("Ürün ara ve sabitle"), "tabak");
    await u.click(await screen.findByRole("button", { name: "Ahşap Tabak ürününü sabitle" }));
    expect(await screen.findByText("Ahşap Tabak", { selector: "span" })).toBeTruthy();
    await u.click(screen.getByRole("button", { name: "2. ürünü en başa al" }));
    await u.click(screen.getByRole("button", { name: "Değişiklikleri kaydet" }));
    await waitFor(() => expect(put).toHaveBeenCalled());
    expect(put.mock.calls[0]![1]).toMatchObject({ defaultSort: "featured", pinned: ["p3", "p1"] });
  });
  it("warns that pins are inactive unless the default order is Recommended; bestseller days only for that order", async () => {
    load(MerchandisingSettings.parse({ pinned: ["p1"] })); const u = userEvent.setup(); wrap(<Merchandising />);
    expect(await screen.findByText(/yalnızca varsayılan sıralama “Önerilen” iken kullanılır/)).toBeTruthy();
    expect(screen.queryByLabelText("Çok satanlar için gün aralığı")).toBeNull();
    await u.selectOptions(screen.getByLabelText("Müşteri bir sıralama seçmediğinde"), "bestselling");
    expect(screen.getByLabelText("Çok satanlar için gün aralığı")).toBeTruthy();
  });
});

describe("Storefront → Home page products", () => {
  const PRODUCTS = { items: [{ id: "p1", nameTr: "Seramik Vazo", status: "active" }, { id: "p2", nameTr: "Keten Örtü", status: "active" }, { id: "p3", nameTr: "Ahşap Tabak", status: "draft" }] };
  const load = (h = HomepageSettings.parse({})) => vi.spyOn(api, "get").mockImplementation(async (p: string) => {
    if (!p.startsWith("/api/admin/products")) return { homepage: h } as never;
    const u = new URL(p, "http://x"); const ids = u.searchParams.get("ids"); const q = u.searchParams.get("q") ?? "";
    return { items: ids ? PRODUCTS.items.filter((x) => ids.split(",").includes(x.id)) : PRODUCTS.items.filter((x) => x.nameTr.toLowerCase().includes(q.toLowerCase())) } as never;
  });
  it("automatic by default: limit and heading only, no picker; saves the chosen limit and headings", async () => {
    load(); const put = vi.spyOn(api, "put").mockImplementation(async (_p, b) => b as never); const u = userEvent.setup(); wrap(<HomeProducts />);
    expect(await screen.findByLabelText("Kaç ürün gösterilsin?")).toBeTruthy();
    expect(screen.queryByLabelText("Ürün ara ve ekle")).toBeNull();
    await u.selectOptions(screen.getByLabelText("Kaç ürün gösterilsin?"), "12");
    await u.type(screen.getByLabelText("Bölüm başlığı"), "Seçtiklerimiz");
    await u.click(screen.getByRole("button", { name: "Değişiklikleri kaydet" }));
    await waitFor(() => expect(put).toHaveBeenCalled());
    expect(put.mock.calls[0]![0]).toBe("/api/admin/settings/homepage");
    expect(put.mock.calls[0]![1]).toMatchObject({ mode: "auto", limit: 12, title: "Seçtiklerimiz" });
  });
  it("manual: pick products, reorder, flag inactive ones, save the ordered ids", async () => {
    load(HomepageSettings.parse({ mode: "manual", productIds: ["p3"] })); const put = vi.spyOn(api, "put").mockImplementation(async (_p, b) => b as never); const u = userEvent.setup(); wrap(<HomeProducts />);
    expect(await screen.findByText("Aktif değil")).toBeTruthy(); // p3 is a draft
    await u.type(screen.getByLabelText("Ürün ara ve ekle"), "vazo");
    await u.click(await screen.findByRole("button", { name: "Seramik Vazo ürününü ana sayfaya ekle" }));
    await u.click(screen.getByRole("button", { name: "2. ürünü en başa al" }));
    await u.click(screen.getByRole("button", { name: "Değişiklikleri kaydet" }));
    await waitFor(() => expect(put).toHaveBeenCalled());
    expect(put.mock.calls[0]![1]).toMatchObject({ mode: "manual", productIds: ["p1", "p3"] });
  });
});

describe("Storefront page", () => {
  const Where = () => <p data-testid="where">{useLocation().pathname}</p>;
  const app = (path: string) => wrap(<MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/storefront" element={<Navigate to="/storefront/home" replace />} /><Route path="/storefront/:tab" element={<><Storefront /><Where /></>} />
    <Route path="/settings/menu" element={<Navigate to="/storefront/menu" replace />} /><Route path="/settings/merchandising" element={<Navigate to="/storefront/order" replace />} />
  </Routes></MemoryRouter>);
  beforeEach(() => { vi.spyOn(api, "get").mockImplementation(async (p: string) => (p.startsWith("/api/admin/categories") ? CATS : { menu: MenuSettings.parse({}), merchandising: MerchandisingSettings.parse({}), homepage: HomepageSettings.parse({}) }) as never); });
  it("has three tabs, defaults to home page products, and old settings URLs redirect", async () => {
    app("/storefront");
    expect(await screen.findByRole("heading", { name: "Vitrin" })).toBeTruthy();
    for (const n of ["Ana sayfa", "Üst menü", "Ürün sıralaması"]) expect(screen.getByRole("link", { name: n })).toBeTruthy();
    expect(screen.getByTestId("where").textContent).toBe("/storefront/home");
  });
  it.each([["/settings/menu", "/storefront/menu"], ["/settings/merchandising", "/storefront/order"], ["/storefront/bogus", "/storefront/home"]])("%s lands on %s", async (from, to) => {
    app(from); await waitFor(() => expect(screen.getByTestId("where").textContent).toBe(to));
  });
});

describe("Storefront → category card style", () => {
  const cats = (withPhoto: boolean[]) => ({ items: withPhoto.map((p, i) => ({ id: `c${i}`, slug: `k${i}`, nameTr: `Kat ${i}`, ...(p ? { imageMediaId: `m${i}` } : {}) })) });
  const load = (h = HomepageSettings.parse({}), photos: boolean[] = [true, false, false]) => vi.spyOn(api, "get").mockImplementation(async (p: string) => (p.startsWith("/api/admin/categories") ? cats(photos) : { homepage: h }) as never);
  it("defaults to plain cards; choosing 'with photos' saves categoryCards=image and warns about categories without a photo", async () => {
    load(); const put = vi.spyOn(api, "put").mockImplementation(async (_p, b) => b as never); const u = userEvent.setup(); wrap(<MemoryRouter><HomeProducts /></MemoryRouter>);
    const group = await screen.findByRole("radiogroup", { name: "Kategori kartı görünümü" });
    const [plain, image] = [...group.querySelectorAll("[role=radio]")] as HTMLElement[];
    expect(plain!.getAttribute("aria-checked")).toBe("true"); expect(image!.getAttribute("aria-checked")).toBe("false");
    expect(screen.queryByRole("note")).toBeNull();                                           // no warning while plain
    await u.click(image!);
    expect(image!.getAttribute("aria-checked")).toBe("true");
    expect((await screen.findByRole("note")).textContent).toContain("2 kategorinin kart görseli yok");
    expect(screen.getByRole("link", { name: "Kategorilere git" }).getAttribute("href")).toBe("/categories");
    await u.click(screen.getByRole("button", { name: "Değişiklikleri kaydet" }));
    await waitFor(() => expect(put).toHaveBeenCalled());
    expect(put.mock.calls[0]![1]).toMatchObject({ categoryCards: "image" });
  });
  it("no warning when every category has a photo; an existing 'image' choice is shown selected", async () => {
    load(HomepageSettings.parse({ categoryCards: "image" }), [true, true]); wrap(<MemoryRouter><HomeProducts /></MemoryRouter>);
    const group = await screen.findByRole("radiogroup", { name: "Kategori kartı görünümü" });
    expect((group.querySelectorAll("[role=radio]")[1] as HTMLElement).getAttribute("aria-checked")).toBe("true");
    await new Promise((r) => setTimeout(r, 30)); expect(screen.queryByRole("note")).toBeNull();
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { GeneralSettings, SeoSettings } from "@openshelf/shared";
import { setLocale } from "../i18n";
import { api } from "../lib/api";
import { ToastProvider } from "../components/ui";
import ProductEdit from "../pages/ProductEdit";
import Products from "../pages/Products";
import Categories from "../pages/Categories";
import Coupons from "../pages/Coupons";
import Customers from "../pages/Customers";

afterEach(() => vi.restoreAllMocks());
const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });
const settings = { general: GeneralSettings.parse({ storeName: "Shop" }), seo: SeoSettings.parse({}) };
const product = {
  id: "p1", slug: "old-slug", nameTr: "Vase", descriptionTr: "A nice vase", status: "active", categoryId: null,
  variants: [{ id: "v1", sku: "S1", title: "Default", prices: { website: 10000 }, stock: { total: 3, reserved: 1 }, active: true }],
  images: [{ id: "i1", url: "https://img.test/a.jpg", alt: "", position: 0 }],
  seoTitle: "", seoDescription: "", seoNoindex: false, seoCanonical: "",
};

function mount(ui: React.ReactElement, path = "/", route = "*") {
  return render(<QueryClientProvider client={client()}><ToastProvider><MemoryRouter initialEntries={[path]}><Routes><Route path={route} element={ui} /></Routes></MemoryRouter></ToastProvider></QueryClientProvider>);
}
const mountProduct = (over: Record<string, unknown> = {}) => {
  vi.spyOn(api, "get").mockImplementation(async (path: string) => {
    if (path.startsWith("/api/admin/products/")) return { ...product, ...over } as never;
    if (path.startsWith("/api/admin/categories")) return { items: [] } as never;
    if (path.startsWith("/api/admin/settings")) return settings as never;
    throw new Error("404");
  });
  const put = vi.spyOn(api, "put").mockResolvedValue({ id: "p1" } as never);
  mount(<ProductEdit />, "/products/p1", "/products/:id");
  return put;
};

describe("Product edit in Turkish", () => {
  it("renders Turkish labels, human status, SERP counter texts and the slug explanation", async () => {
    setLocale("tr");
    mountProduct();
    expect(await screen.findByLabelText("SEO başlığı")).toBeTruthy();
    expect(screen.getByLabelText("Meta açıklama")).toBeTruthy();
    expect(screen.getByLabelText(/Stok kodu \(SKU\)/)).toBeTruthy();
    expect(screen.getByLabelText(/Web sitesi fiyatı/)).toBeTruthy();
    expect(screen.getByText("Varyantlar ve fiyatlar")).toBeTruthy();
    expect(screen.getByText("Boş: ürün adı kullanılır")).toBeTruthy();
    const status = screen.getByLabelText("Durum") as HTMLSelectElement;
    expect(within(status).getByRole("option", { name: "Yayında" })).toBeTruthy();
    expect(within(status).getByRole("option", { name: "Taslak" })).toBeTruthy();
    // no raw codes anywhere in the options
    expect(within(status).queryByRole("option", { name: /^(draft|active|archived)$/ })).toBeNull();

    const u = userEvent.setup();
    await u.type(screen.getByLabelText("SEO başlığı"), "A".repeat(65));
    expect(screen.getByText("Arama sonuçlarında kesilebilir")).toBeTruthy();
    expect(screen.getByTestId("SEO title-count").textContent).toBe("65/70");
    expect(within(screen.getByTestId("seo-checklist")).getByText("Görsel alternatif metni")).toBeTruthy();

    // slug "?" popover holds the explanation
    const slugLabel = screen.getByText("Adres (slug)", { selector: "label" });
    await u.click(within(slugLabel.parentElement!).getByRole("button", { name: "Açıklamayı göster" }));
    expect(await screen.findByText(/Slug, ürünün web adresinde görünen kısa addır/)).toBeTruthy();
    expect(screen.getAllByText(/seramik-vazo/).length).toBeGreaterThan(0);
  });

  it("shows the Turkish 301 notice when the slug changes", async () => {
    setLocale("tr");
    mountProduct();
    const slug = await screen.findByLabelText(/Adres \(slug\)/);
    fireEvent.change(slug, { target: { value: "yeni-adres" } });
    expect(screen.getByTestId("slug-warning").textContent).toMatch(/301 ile yönlendirilir/);
  });

  it("asks for confirmation that explains the consequences before archiving", async () => {
    const put = mountProduct();
    const u = userEvent.setup();
    const status = await screen.findByLabelText("Status");
    await u.selectOptions(status, "archived");
    expect(screen.getByText(/removed from the shop and cannot be bought/)).toBeTruthy();
    await u.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText(/will be removed from the shop and can no longer be bought/)).toBeTruthy();
    expect(put).not.toHaveBeenCalled();
    await u.click(screen.getByRole("button", { name: "Archive" }));
    await waitFor(() => expect(put).toHaveBeenCalled());
    expect(put.mock.calls[0]![1]).toMatchObject({ status: "archived" });
  });

  it("previews the new stock level and explains the ledger before applying an adjustment", async () => {
    mountProduct();
    const u = userEvent.setup();
    await u.click(await screen.findByRole("button", { name: "Adjust stock" }));
    await u.type(screen.getByLabelText("Change (+/-)"), "-5");
    expect(screen.getByTestId("adjust-preview").textContent).toMatch(/from 3 to -2/);
    expect(screen.getByText(/cannot be deleted later/)).toBeTruthy();
  });
});

describe("Products list", () => {
  const page = { items: [{ id: "p1", slug: "a", nameTr: "Vase", status: "draft", variants: [{ id: "v", sku: "S", title: "D", prices: { website: 5000 }, stock: { total: 9, reserved: 0 } }], images: [] }, { id: "p2", slug: "b", nameTr: "Mug", status: "archived", variants: [], images: [] }], page: 1, pageSize: 20, total: 2 };
  const run = async () => {
    vi.spyOn(api, "get").mockImplementation(async (path: string) => (path.startsWith("/api/admin/categories") ? ({ items: [] } as never) : (page as never)));
    mount(<Products />);
    await screen.findByText("Vase");
  };
  it("shows human status badges in Turkish, never the raw codes", async () => {
    setLocale("tr");
    await run();
    const table = screen.getByRole("table");
    expect(within(table).getByText("Taslak")).toBeTruthy();
    expect(within(table).getByText("Arşivde")).toBeTruthy();
    expect(within(table).queryByText("draft")).toBeNull();
    expect(within(table).queryByText("archived")).toBeNull();
    expect(screen.getByRole("heading", { name: "Ürünler" })).toBeTruthy();
  });
  it("shows human status badges in English", async () => {
    await run();
    const table = screen.getByRole("table");
    expect(within(table).getByText("Draft")).toBeTruthy();
    expect(within(table).getByText("Archived")).toBeTruthy();
  });
});

describe("Products list: inline edit, filters, bulk", () => {
  const multi = { id: "p2", slug: "mug", nameTr: "Mug", status: "active", brand: "Atölye", categoryName: "Seramik", onTrendyol: true, updatedAt: 1767000000,
    variants: [{ id: "m1", sku: "MUG-S", title: "Small", prices: { website: 2000 }, stock: { total: 8, reserved: 2 }, active: true }, { id: "m2", sku: "MUG-L", title: "Large", prices: { website: 3000 }, compareAtPrice: 4000, stock: { total: 0, reserved: 0 }, active: true }], images: [] };
  const single = { id: "p1", slug: "vase", nameTr: "Vase", status: "active", categoryName: "Seramik", variants: [{ id: "v1", sku: "VASE-1", title: "D", prices: { website: 10000 }, stock: { total: 9, reserved: 1 }, active: true }], images: [] };
  const setup = () => {
    const seen: string[] = [];
    vi.spyOn(api, "get").mockImplementation(async (path: string) => { if (path.startsWith("/api/admin/categories")) return { items: [{ id: "c1", slug: "s", nameTr: "Seramik" }] } as never; seen.push(path); return { items: [single, multi], page: 1, pageSize: 25, total: 2 } as never; });
    return seen;
  };
  it("inline price edit PATCHes the variant price in minor units", async () => {
    setLocale("tr"); setup();
    const patch = vi.spyOn(api, "patch").mockResolvedValue({} as never);
    mount(<Products />); const u = userEvent.setup();
    await u.click(await screen.findByRole("button", { name: "Vase fiyatını düzenle" }));
    const input = screen.getByRole("textbox", { name: "Vase fiyatını düzenle" });
    await u.clear(input); await u.type(input, "125,50{Enter}");
    await waitFor(() => expect(patch).toHaveBeenCalledWith("/api/admin/variants/v1/price", { price: 12550 }));
  });
  it("inline stock edit sends the delta against total stock", async () => {
    setLocale("tr"); setup();
    const post = vi.spyOn(api, "post").mockResolvedValue({} as never);
    mount(<Products />); const u = userEvent.setup();
    await u.click(await screen.findByRole("button", { name: "Vase toplam stoğunu düzenle" }));
    const input = screen.getByRole("textbox", { name: "Vase toplam stoğunu düzenle" });
    await u.clear(input); await u.type(input, "4{Enter}");
    await waitFor(() => expect(post).toHaveBeenCalledWith("/api/admin/inventory/v1/adjust", { delta: -5, reason: "Ürün listesinden düzenleme" }));
  });
  it("invalid inline input is rejected without calling the API; Escape cancels", async () => {
    setLocale("tr"); setup();
    const patch = vi.spyOn(api, "patch").mockResolvedValue({} as never);
    mount(<Products />); const u = userEvent.setup();
    await u.click(await screen.findByRole("button", { name: "Vase fiyatını düzenle" }));
    await u.clear(screen.getByRole("textbox", { name: "Vase fiyatını düzenle" })); await u.type(screen.getByRole("textbox", { name: "Vase fiyatını düzenle" }), "abc{Enter}");
    expect(await screen.findByText("Geçerli bir fiyat girin (0’dan büyük).")).toBeTruthy();
    await u.click(screen.getByRole("button", { name: "Vase fiyatını düzenle" })); await u.keyboard("{Escape}");
    expect(patch).not.toHaveBeenCalled();
  });
  it("multi-variant products expand to per-variant rows; strike-through price is shown", async () => {
    setLocale("tr"); setup(); mount(<Products />); const u = userEvent.setup();
    await u.click(await screen.findByRole("button", { name: "Mug varyantlarını göster" }));
    expect(await screen.findByText("SKU: MUG-L")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Mug (MUG-S) fiyatını düzenle" })).toBeTruthy();
    expect(within(screen.getByRole("table")).getByText(/40,00/)).toBeTruthy();
  });
  it("shows category, brand and the Trendyol channel badge", async () => {
    setLocale("tr"); setup(); mount(<Products />);
    const table = await screen.findByRole("table");
    expect(within(table).getAllByText("Seramik").length).toBe(2);
    expect(within(table).getByText(/Atölye/)).toBeTruthy();
    expect(within(table).getByText("Trendyol")).toBeTruthy();
  });
  it("filters and sort are sent as query params", async () => {
    setLocale("tr"); const seen = setup(); mount(<Products />); const u = userEvent.setup();
    await screen.findByRole("table");
    await u.selectOptions(screen.getByLabelText("Stok durumu"), "out");
    await u.click(screen.getByRole("checkbox", { name: "Yalnızca görseli olmayanlar" }));
    await u.selectOptions(screen.getByLabelText("Sırala"), "price");
    await u.click(screen.getByRole("tab", { name: "Taslak" }));
    await waitFor(() => { const last = seen[seen.length - 1] ?? ""; for (const part of ["stock=out", "image=none", "sort=price", "status=draft"]) expect(last).toContain(part); });
  });
  it("bulk status posts the selected ids once after confirmation", async () => {
    setLocale("tr"); setup();
    const post = vi.spyOn(api, "post").mockResolvedValue({ updated: 2, missing: [] } as never);
    mount(<Products />); const u = userEvent.setup();
    await u.click(await screen.findByRole("checkbox", { name: "Bu sayfadaki tüm ürünleri seç" }));
    await u.selectOptions(screen.getByLabelText("Durumu değiştir…"), "archived");
    const dlg = await screen.findByRole("dialog");
    expect(dlg).toHaveTextContent("2 ürün “Arşivde” durumuna alınacak");
    await u.click(within(dlg).getByRole("button", { name: "2 ürüne uygula" }));
    await waitFor(() => expect(post).toHaveBeenCalledWith("/api/admin/products/bulk", { ids: ["p1", "p2"], action: "status", status: "archived" }));
  });
  it("bulk price change validates the percentage and sends it", async () => {
    setLocale("tr"); setup();
    const post = vi.spyOn(api, "post").mockResolvedValue({ updated: 1, missing: [] } as never);
    mount(<Products />); const u = userEvent.setup();
    await u.click(await screen.findByRole("checkbox", { name: "Vase ürününü seç" }));
    await u.click(screen.getByRole("button", { name: "Fiyatı değiştir" }));
    const dlg = await screen.findByRole("dialog");
    const apply = within(dlg).getByRole("button", { name: "1 ürüne uygula" });
    expect(apply).toBeDisabled();
    await u.type(within(dlg).getByLabelText("Yüzde değişim"), "-15");
    expect(apply).toBeEnabled();
    expect(dlg).toHaveTextContent("%-15");
    await u.click(apply);
    await waitFor(() => expect(post).toHaveBeenCalledWith("/api/admin/products/bulk", { ids: ["p1"], action: "price", percent: -15 }));
  });
});

describe("destructive confirmations explain the consequences", () => {
  it("category delete", async () => {
    setLocale("tr");
    vi.spyOn(api, "get").mockResolvedValue({ items: [{ id: "c1", slug: "vazo", name: "Vazolar" }] } as never);
    mount(<Categories />);
    const u = userEvent.setup();
    await u.click(await screen.findByRole("button", { name: "Sil" }));
    expect(await screen.findByText(/kategorisiz kalır/)).toBeTruthy();
    expect(screen.getByText(/geri alınamaz/)).toBeTruthy();
  });
  it("coupon delete and Turkish type label", async () => {
    setLocale("tr");
    vi.spyOn(api, "get").mockResolvedValue({ items: [{ id: "K1", code: "YAZ25", type: "percent", value: 25, active: true, usedCount: 2, maxUses: 10 }] } as never);
    mount(<Coupons />);
    const u = userEvent.setup();
    expect(await screen.findByText("Yüzde (%)")).toBeTruthy();
    expect(screen.queryByText("percent")).toBeNull();
    await u.click(screen.getByRole("button", { name: "Sil" }));
    expect(await screen.findByText(/bu kodu bir daha kullanamaz/)).toBeTruthy();
  });
  it("customer anonymize", async () => {
    setLocale("tr");
    vi.spyOn(api, "get").mockResolvedValue({ items: [{ id: "u1", email: "ayse@ornek.com", name: "Ayşe", createdAt: 1700000000 }], page: 1, pageSize: 20, total: 1 } as never);
    mount(<Customers />);
    const u = userEvent.setup();
    await u.click(await screen.findByRole("button", { name: "Anonimleştir" }));
    expect(await screen.findByText(/ayse@ornek\.com adresine ait kişisel veriler/)).toBeTruthy();
    expect(screen.getByText(/geri getirilemez/)).toBeTruthy();
  });
});

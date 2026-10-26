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

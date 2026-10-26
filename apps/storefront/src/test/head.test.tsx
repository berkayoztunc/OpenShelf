import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useHead } from "../lib/head";

const config = vi.hoisted(() => ({
  general: { storeName: "Shop", tagline: "", description: "Store desc", currency: "TRY" },
  seo: { titleTemplate: "%s | {storeName}", homeTitle: "", homeDescription: "", jsonLd: true, twitterHandle: "shop", robotsIndex: true },
  checkout: { freeShippingThreshold: null }, branding: {}, tracking: {},
}));
vi.mock("../store/ConfigContext", () => ({ useConfig: () => ({ config }) }));
vi.mock("../i18n", () => ({ useI18n: () => ({ t: (k: string, v?: Record<string, unknown>) => (v ? `${k}:${JSON.stringify(v)}` : k), locale: "en" }) }));
vi.mock("../tracking", () => ({ track: vi.fn(), getConsent: () => ({ analytics: false, marketing: false }), onConsentChange: () => () => {} }));
vi.mock("../cart/CartContext", () => ({ useCart: () => ({ addItem: vi.fn(), setDrawerOpen: vi.fn(), busy: false }) }));
vi.mock("../components/Money", () => ({ useMoney: () => (n: number) => String(n / 100) }));

const apiMock = vi.hoisted(() => ({
  categories: vi.fn(), products: vi.fn(), product: vi.fn(),
}));
vi.mock("../api/client", () => ({ api: apiMock, ApiError: class extends Error { status = 0 } }));

import Listing from "../pages/Listing";
import Product from "../pages/Product";

const headAll = (sel: string) => [...document.head.querySelectorAll(sel)];
const wrap = (path: string, ui: React.ReactNode, route: string) => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter initialEntries={[path]}><Routes><Route path={route} element={ui} /></Routes></MemoryRouter>
  </QueryClientProvider>,
);

function Probe({ title }: { title: string }) { useHead({ title, description: "d", url: "https://x.test/a", jsonLd: { "@type": "Thing" } }); return null; }

describe("useHead", () => {
  it("takes ownership of server-injected tags and leaves no duplicates", () => {
    document.head.insertAdjacentHTML("beforeend",
      '<meta name="description" content="server" data-ssr-head><link rel="canonical" href="https://x.test/old" data-ssr-head><meta property="og:title" content="old" data-prerender>' +
      '<script type="application/ld+json" data-ssr-head>{"@type":"Old"}</script><meta name="description" content="static html">');
    const { rerender, unmount } = render(<Probe title="One" />);
    expect(document.title).toBe("One");
    expect(headAll('meta[name="description"]')).toHaveLength(1);
    expect((headAll('meta[name="description"]')[0] as HTMLMetaElement).content).toBe("d");
    expect(headAll('link[rel="canonical"]')).toHaveLength(1);
    expect((headAll('link[rel="canonical"]')[0] as HTMLLinkElement).href).toBe("https://x.test/a");
    expect(headAll("[data-ssr-head],[data-prerender]")).toHaveLength(0);
    expect(headAll('script[type="application/ld+json"]')).toHaveLength(1);
    rerender(<Probe title="Two" />);
    expect(headAll('meta[property="og:title"]')).toHaveLength(1);
    expect((headAll('meta[property="og:title"]')[0] as HTMLMetaElement).content).toBe("Two");
    unmount();
    expect(headAll("[data-os-head]")).toHaveLength(0);
  });
});

describe("Listing head", () => {
  const items = Array.from({ length: 12 }, (_, i) => ({ id: `p${i}`, slug: `p${i}`, title: `P${i}`, images: [], variants: [{ id: `v${i}`, title: "", price: 100, available: 1 }] }));
  apiMock.categories.mockResolvedValue([{ id: "c1", slug: "vases", name: "Vases", seo: { title: "Vases custom", description: "Custom desc" } }]);
  apiMock.products.mockResolvedValue({ items, total: 30, page: 2, pageSize: 12 });

  it("noindexes search / sorted URLs and emits canonical without the query", async () => {
    wrap("/products?q=vase", <Listing />, "/products");
    await screen.findByRole("heading", { level: 1 });
    await waitFor(() => expect(headAll('meta[name="robots"]')).toHaveLength(1));
    expect((headAll('meta[name="robots"]')[0] as HTMLMetaElement).content).toMatch(/noindex/);
    expect((headAll('link[rel="canonical"]')[0] as HTMLLinkElement).href).toBe(`${location.origin}/products`);
    expect(headAll('link[rel="next"],link[rel="prev"]')).toHaveLength(0);
  });

  it("indexes clean category pages, uses resolved seo and links prev/next", async () => {
    wrap("/category/vases?page=2", <Listing />, "/category/:slug");
    await waitFor(() => expect(document.title).toContain("Vases custom"));
    expect(headAll('meta[name="robots"]')).toHaveLength(0);
    expect((headAll('meta[name="description"]')[0] as HTMLMetaElement).content).toBe("Custom desc");
    expect((headAll('link[rel="canonical"]')[0] as HTMLLinkElement).href).toBe(`${location.origin}/category/vases?page=2`);
    expect((headAll('link[rel="prev"]')[0] as HTMLLinkElement).href).toBe(`${location.origin}/category/vases`);
    expect((headAll('link[rel="next"]')[0] as HTMLLinkElement).href).toBe(`${location.origin}/category/vases?page=3`);
  });
});

describe("Product head", () => {
  const product = {
    id: "p1", slug: "vase", title: "Ceramic Vase", categoryId: "c1", description: "Plain description",
    images: [{ url: "https://img.test/a.jpg", alt: "A vase" }],
    variants: [{ id: "v1", sku: "S1", title: "S", price: 34900, available: 3 }],
    seo: { title: "Resolved SEO title", description: "Resolved description", image: "https://img.test/og.jpg", canonical: "https://shop.test/product/vase", noindex: true },
  };
  it("uses the resolved seo object, noindex, JSON-LD Product + BreadcrumbList and a single h1", async () => {
    apiMock.product.mockResolvedValue(product);
    apiMock.categories.mockResolvedValue([{ id: "c1", slug: "vases", name: "Vases" }]);
    apiMock.products.mockResolvedValue({ items: [product, ...[2, 3].map((n) => ({ ...product, id: `p${n}`, slug: `v${n}`, title: `V${n}`, seo: undefined }))], total: 3, page: 1, pageSize: 5 });
    wrap("/product/vase", <Product />, "/product/:slug");
    await waitFor(() => expect(document.title).toBe("Resolved SEO title"));
    expect((headAll('meta[name="description"]')[0] as HTMLMetaElement).content).toBe("Resolved description");
    expect((headAll('meta[property="og:image"]')[0] as HTMLMetaElement).content).toBe("https://img.test/og.jpg");
    expect((headAll('link[rel="canonical"]')[0] as HTMLLinkElement).href).toBe("https://shop.test/product/vase");
    expect((headAll('meta[name="robots"]')[0] as HTMLMetaElement).content).toMatch(/noindex/);
    const ld = headAll('script[type="application/ld+json"]').map((s) => JSON.parse(s.textContent!) as { "@type": string; offers?: { availability: string } });
    expect(ld.map((x) => x["@type"]).sort()).toEqual(["BreadcrumbList", "Product"]);
    expect(ld.find((x) => x["@type"] === "Product")!.offers!.availability).toBe("https://schema.org/InStock");
    expect(document.querySelectorAll("h1")).toHaveLength(1);
    expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toBeTruthy();
    await screen.findByText("product.related");
    expect(screen.getAllByRole("link", { name: /V[23]/ }).length).toBeGreaterThan(0);
    const hero = screen.getAllByRole("img").find((i) => i.getAttribute("fetchpriority") === "high")!;
    expect(hero.getAttribute("alt")).toBe("A vase");
    expect(hero.getAttribute("width")).toBe("800");
  });
  it("falls back to the template title when seo is absent", async () => {
    apiMock.product.mockResolvedValue({ ...product, seo: undefined });
    wrap("/product/vase", <Product />, "/product/:slug");
    await waitFor(() => expect(document.title).toBe("Ceramic Vase | Shop"));
    expect(headAll('meta[name="robots"]')).toHaveLength(0);
  });
});

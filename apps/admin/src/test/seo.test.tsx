import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { GeneralSettings, SeoSettings } from "@openshelf/shared";
import Seo from "../pages/settings/Seo";
import ProductEdit from "../pages/ProductEdit";
import { SerpPreview } from "../components/Seo";
import { ToastProvider } from "../components/ui";
import { api } from "../lib/api";
import { descMeter, productChecks, titleMeter, truncate } from "../lib/seo";

afterEach(() => vi.restoreAllMocks());
const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

describe("seo helpers", () => {
  it("truncates on a word boundary with an ellipsis and leaves short text alone", () => {
    expect(truncate("short", 60)).toBe("short");
    const out = truncate("word ".repeat(40), 60);
    expect(out.length).toBeLessThanOrEqual(60);
    expect(out.endsWith("…")).toBe(true);
  });
  it("counters classify title and description lengths", () => {
    expect(titleMeter("").tone).toBe("empty");
    expect(titleMeter("a".repeat(60)).tone).toBe("good");
    expect(titleMeter("a".repeat(65)).tone).toBe("warn");
    expect(titleMeter("a".repeat(71)).tone).toBe("bad");
    expect(descMeter("a".repeat(100)).tone).toBe("warn");
    expect(descMeter("a".repeat(130)).tone).toBe("good");
    expect(descMeter("a".repeat(200)).tone).toBe("warn");
    expect(descMeter("a".repeat(321)).tone).toBe("bad");
  });
  it("checklist flags missing alt text and unclean slugs", () => {
    const base = { title: "Good title", name: "n", description: "", metaDescription: "a".repeat(130), slug: "clean-slug", images: [{ alt: "x" }], hasOgImage: false, hasPrice: true, hasStock: true, noindex: false };
    expect(productChecks(base).every((c) => c.state === "ok")).toBe(true);
    const bad = productChecks({ ...base, slug: "Bad Slug", images: [{ alt: "" }] });
    expect(bad.find((c) => c.id === "alt")!.state).toBe("warn");
    expect(bad.find((c) => c.id === "slug")!.state).toBe("warn");
  });
});

describe("SerpPreview", () => {
  it("truncates the title at ~60 and the description at ~155 characters", () => {
    render(<SerpPreview title={"T".repeat(100)} description={"word ".repeat(80)} url="https://shop.test/product/vase" />);
    expect(screen.getByTestId("serp-title").textContent!.length).toBeLessThanOrEqual(60);
    expect(screen.getByTestId("serp-title").textContent!.endsWith("…")).toBe(true);
    expect(screen.getByTestId("serp-desc").textContent!.length).toBeLessThanOrEqual(155);
    expect(screen.getByTestId("serp-url").textContent).toBe("shop.test › product › vase");
  });
});

const settings = { general: GeneralSettings.parse({ storeName: "Shop" }), seo: SeoSettings.parse({}) };

describe("Settings → SEO tab", () => {
  it("shows the live title example, warns when indexing is off and saves a validated payload", async () => {
    vi.spyOn(api, "get").mockResolvedValue(settings);
    const put = vi.spyOn(api, "put").mockImplementation(async (_p, body) => body);
    const u = userEvent.setup();
    render(<QueryClientProvider client={client()}><ToastProvider><Seo /></ToastProvider></QueryClientProvider>);
    await screen.findByText("Home page");
    expect(screen.getByTestId("title-example").textContent).toBe("Ceramic Vase | Shop");
    expect(screen.queryByTestId("noindex-warning")).toBeNull();

    await u.type(screen.getByLabelText("Home title"), "Shop | Handmade ceramics");
    await u.click(screen.getByRole("switch", { name: /Allow search engines/ }));
    expect(screen.getByTestId("noindex-warning")).toBeTruthy();
    await u.type(screen.getByLabelText("Path to disallow"), "internal");
    await u.click(screen.getByRole("button", { name: "Add path" }));
    expect(screen.getByText("/internal")).toBeTruthy();
    await u.click(screen.getByRole("switch", { name: /Structured data/ }));
    await u.type(screen.getByLabelText("Google Search Console"), "abc123");
    await u.click(screen.getByRole("button", { name: "Save changes" }));
    // hiding a store that is currently indexable asks for confirmation first
    expect(put).not.toHaveBeenCalled();
    await u.click(await screen.findByRole("button", { name: "Hide and save" }));

    await waitFor(() => expect(put).toHaveBeenCalled());
    const [path, body] = put.mock.calls[0]!;
    expect(path).toBe("/api/admin/settings/seo");
    expect(body).toMatchObject({ homeTitle: "Shop | Handmade ceramics", robotsIndex: false, robotsDisallow: ["/internal"], jsonLd: false, googleSiteVerification: "abc123" });
  });

  it("rejects a malformed twitter handle", async () => {
    vi.spyOn(api, "get").mockResolvedValue(settings);
    const put = vi.spyOn(api, "put").mockResolvedValue({});
    const u = userEvent.setup();
    render(<QueryClientProvider client={client()}><ToastProvider><Seo /></ToastProvider></QueryClientProvider>);
    await screen.findByText("Home page");
    fireEvent.change(screen.getByLabelText("X / Twitter handle"), { target: { value: "not a handle!" } });
    await u.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText(/Letters, numbers/)).toBeTruthy();
    expect(put).not.toHaveBeenCalled();
  });
});

describe("Product edit → SEO card", () => {
  const product = {
    id: "p1", slug: "old-slug", nameTr: "Vase", descriptionTr: "A nice vase", status: "active", categoryId: null,
    variants: [{ id: "v1", sku: "S1", title: "Default", prices: { website: 10000 }, stock: { total: 3, reserved: 0 }, active: true }],
    images: [{ id: "i1", url: "https://img.test/a.jpg", alt: "", position: 0 }],
    seoTitle: "", seoDescription: "", seoNoindex: false, seoCanonical: "",
  };
  const mount = () => {
    vi.spyOn(api, "get").mockImplementation(async (path: string) => {
      if (path.startsWith("/api/admin/products/")) return product as never;
      if (path.startsWith("/api/admin/categories")) return { items: [] } as never;
      if (path.startsWith("/api/admin/settings")) return settings as never;
      throw new Error("404");
    });
    const put = vi.spyOn(api, "put").mockResolvedValue({ id: "p1" } as never);
    render(<QueryClientProvider client={client()}><ToastProvider><MemoryRouter initialEntries={["/products/p1"]}><Routes><Route path="/products/:id" element={<ProductEdit />} /></Routes></MemoryRouter></ToastProvider></QueryClientProvider>);
    return put;
  };

  it("warns that the old URL will 301 when the slug changes and shows the full URL", async () => {
    mount();
    const slug = await screen.findByLabelText(/URL slug/);
    expect(screen.queryByTestId("slug-warning")).toBeNull();
    fireEvent.change(slug, { target: { value: "New Slug" } });
    expect(screen.getByTestId("slug-warning").textContent).toMatch(/301/);
    expect(screen.getByTestId("slug-url").textContent).toBe(`${location.origin}/product/new-slug`);
  });

  it("sends the SEO fields, noindex flag and new slug on save; counters and checklist update", async () => {
    const put = mount();
    const u = userEvent.setup();
    const title = await screen.findByLabelText("SEO title");
    await u.type(title, "A".repeat(65));
    expect(screen.getByTestId("SEO title-count").textContent).toBe("65/70");
    expect(within(screen.getByTestId("seo-checklist")).getByText("Image alt text").closest("li")!.getAttribute("data-state")).toBe("warn");
    await u.type(screen.getByLabelText("Meta description"), "Short desc");
    await u.click(screen.getByRole("switch", { name: /noindex/ }));
    fireEvent.change(screen.getByLabelText(/URL slug/), { target: { value: "new-slug" } });
    await u.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(put).toHaveBeenCalled());
    const [path, body] = put.mock.calls[0]!;
    expect(path).toBe("/api/admin/products/p1");
    expect(body).toMatchObject({ slug: "new-slug", seoTitle: "A".repeat(65), seoDescription: "Short desc", seoNoindex: true, seoCanonical: "", seoOgMediaId: null, seoOgImageUrl: null });
  });
});

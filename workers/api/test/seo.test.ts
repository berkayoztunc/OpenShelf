import { beforeAll, describe, expect, it } from "vitest";
import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import worker from "../src/index";
import { admin, createProduct, ensureOwner, j, type Session } from "./helpers";

const SHELL = `<!doctype html><html lang="x"><head><meta charset="UTF-8"><title data-prerender>OLD</title><meta name="description" content="old"><meta property="og:title" content="old"><link rel="canonical" href="http://old"><script type="application/ld+json">{"old":1}</script><script type="module" src="/assets/a.js"></script></head><body><div id="root"><div data-prerender>OLD SNAPSHOT</div></div></body></html>`;
const assets = { fetch: async () => new Response(SHELL, { headers: { "Content-Type": "text/html" } }) } as unknown as Fetcher;

async function page(path: string, o: { env?: Record<string, unknown>; headers?: Record<string, string> } = {}) {
  const ctx = createExecutionContext();
  const res = await worker.fetch(new Request(`http://shop.test${path}`, { headers: o.headers }), { ...env, ASSETS: assets, STOREFRONT_ORIGIN: "http://shop.test", ...(o.env ?? {}) } as never, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}
const ld = (html: string) => [...html.matchAll(/<script data-prerender type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]!.replace(/\\u003c/g, "<")));
const meta = (html: string, key: string) => html.match(new RegExp(`<meta data-prerender (?:name|property)="${key.replace(/[.:]/g, "\\$&")}" content="([^"]*)"`))?.[1];

let s: Session; let slug: string; let catSlug: string; let catId: string;
const setSeo = (v: Record<string, unknown>) => admin(s, "/settings/seo", "PUT", { robotsIndex: true, ...v });

beforeAll(async () => {
  s = await ensureOwner();
  await admin(s, "/settings/general", "PUT", { storeName: "Test Shop", tagline: "Tag line", description: "Store description", currency: "TRY", contactEmail: "hi@shop.test", contactPhone: "+905551112233" });
  await setSeo({});
  const cr = await j<any>(await admin(s, "/categories", "POST", { slug: "seo-cat", nameTr: "SEO Kategori", seoTitle: "Cat Title", seoDescription: "Cat desc" }));
  catId = cr.id; catSlug = "seo-cat";
  const r = await admin(s, "/products", "POST", {
    slug: "seo-prod", nameTr: "SEO Ürün", status: "active", categoryId: catId, brand: "Acme", seoNoindex: false,
    descriptionTr: "<p>Harika <b>ürün</b> açıklaması</p>",
    images: [{ url: "https://img.test/a.jpg", alt: "A" }],
    variants: [{ sku: "SEO-1", barcode: "8690000000011", prices: { website: 12345 }, stock: { total: 5 } }],
  });
  expect(r.status).toBe(201);
  slug = "seo-prod";
});

describe("storefront SSR head", () => {
  it("home: title/description/canonical/og/twitter + Organization & WebSite JSON-LD", async () => {
    const res = await page("/?utm=1");
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toContain("s-maxage=300");
    const h = await res.text();
    expect(h).toContain("<title data-prerender>Test Shop – Tag line</title>");
    expect(h).not.toContain("OLD");
    expect(h).toContain('<html lang="tr">');
    expect(h).toContain('<link data-prerender rel="canonical" href="http://shop.test/">');
    expect(meta(h, "twitter:card")).toBe("summary");
    expect(meta(h, "og:type")).toBe("website");
    expect(meta(h, "robots")).toContain("index,follow");
    const types = ld(h).map((x) => x["@type"]);
    expect(types).toEqual(["Organization", "WebSite"]);
    expect(ld(h)[1].potentialAction.target.urlTemplate).toBe("http://shop.test/products?q={search_term_string}");
    expect(h).toContain('data-ssr="home"');
  });

  it("product: head, price format, availability, escaping", async () => {
    const res = await page(`/product/${slug}?ref=x`);
    expect(res.status).toBe(200);
    const h = await res.text();
    expect(h).toContain("<title data-prerender>SEO Ürün | Test Shop</title>");
    expect(meta(h, "description")).toBe("Harika ürün açıklaması");
    expect(h).toContain('rel="canonical" href="http://shop.test/product/seo-prod"');
    expect(meta(h, "og:image")).toBe("https://img.test/a.jpg");
    expect(meta(h, "og:type")).toBe("product");
    expect(meta(h, "twitter:card")).toBe("summary_large_image");
    const [prod, crumbs] = ld(h);
    expect(prod["@type"]).toBe("Product");
    expect(prod.offers).toMatchObject({ "@type": "Offer", price: "123.45", priceCurrency: "TRY", availability: "https://schema.org/InStock" });
    expect(prod.gtin).toBe("8690000000011");
    expect(prod.brand.name).toBe("Acme");
    expect(crumbs.itemListElement.map((i: any) => i.name)).toEqual(["Test Shop", "SEO Kategori", "SEO Ürün"]);
    expect(h).toContain('data-ssr="product"');
  });

  it("out of stock -> OutOfStock; noindex flag -> robots + X-Robots-Tag", async () => {
    const p = await createProduct(s, { stock: 0 });
    const up = await j<any>(await admin(s, `/products/${p.product.id}`, "PUT", { slug: p.slug, nameTr: "Tükendi", status: "active", seoNoindex: true, variants: [{ id: p.variantId, sku: p.product.variants[0].sku, prices: { website: 5000 }, stock: { total: 0 } }] }));
    expect(up.seoNoindex).toBe(true);
    const res = await page(`/product/${p.slug}`);
    const h = await res.text();
    expect(ld(h)[0].offers.availability).toBe("https://schema.org/OutOfStock");
    expect(meta(h, "robots")).toBe("noindex,nofollow");
    expect(res.headers.get("X-Robots-Tag")).toContain("noindex");
  });

  it("hostile names are escaped in HTML and JSON-LD", async () => {
    const evil = `"><script>alert(1)</script>`;
    const p = await createProduct(s);
    await admin(s, `/products/${p.product.id}`, "PUT", { slug: p.slug, nameTr: evil, status: "active", seoDescription: evil, variants: [{ id: p.variantId, sku: p.product.variants[0].sku, prices: { website: 5000 }, stock: { total: 3 } }] });
    const h = await (await page(`/product/${p.slug}`)).text();
    expect(h).not.toContain("<script>alert(1)");
    expect(h).toContain("&quot;&gt;&lt;script&gt;");
    const raw = [...h.matchAll(/application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]!).join("");
    expect(raw).not.toContain("<");
    expect(ld(h)[0].name).toBe(evil);
  });

  it("category + list: CollectionPage/ItemList, canonical with page", async () => {
    const h = await (await page(`/category/${catSlug}`)).text();
    expect(h).toContain("<title data-prerender>Cat Title | Test Shop</title>");
    expect(ld(h).map((x) => x["@type"])).toEqual(["CollectionPage", "ItemList", "BreadcrumbList"]);
    expect(ld(h)[1].itemListElement[0].url).toBe("http://shop.test/product/seo-prod");
    const p2 = await (await page(`/products?page=2&sort=x`)).text();
    expect(p2).toContain('rel="canonical" href="http://shop.test/products?page=2"');
    const q = await (await page(`/products?q=abc`)).text();
    expect(meta(q, "robots")).toBe("noindex,nofollow");
  });

  it("unknown slug -> real 404 + noindex; unknown route -> 404 shell", async () => {
    const r = await page("/product/does-not-exist");
    expect(r.status).toBe(404);
    expect(meta(await r.text(), "robots")).toBe("noindex,nofollow");
    expect((await page("/category/nope")).status).toBe(404);
    expect((await page("/some/random/page")).status).toBe(404);
    expect((await page("/api/nothing")).headers.get("content-type")).toContain("json");
    expect((await page("/cart")).status).toBe(200);
    expect(meta(await (await page("/cart")).text(), "robots")).toBe("noindex,nofollow");
  });

  it("slug change creates a 301 and collapses chains; reverting removes the loop", async () => {
    const p = await createProduct(s);
    const put = (slugN: string) => admin(s, `/products/${p.product.id}`, "PUT", { slug: slugN, nameTr: "R", status: "active", variants: [{ id: p.variantId, sku: p.product.variants[0].sku, prices: { website: 5000 }, stock: { total: 3 } }] });
    const a = p.slug; const b = `${a}-b`; const c = `${a}-c`;
    expect((await put(b)).status).toBe(200);
    expect((await put(c)).status).toBe(200);
    const r1 = await page(`/product/${a}?x=1`);
    expect(r1.status).toBe(301);
    expect(r1.headers.get("Location")).toContain(`/product/${c}?x=1`); // collapsed: a -> c directly
    expect((await page(`/product/${b}`)).headers.get("Location")).toContain(`/product/${c}`);
    expect((await put(a)).status).toBe(200); // back to the original: no a->a loop
    expect((await page(`/product/${a}`)).status).toBe(200);
    expect((await page(`/product/${b}`)).headers.get("Location")).toContain(`/product/${a}`);
    expect((await page(`/products/${a}`)).status).toBe(301);
  });

  it("settings overrides: titleTemplate, homeTitle, verification, twitter, jsonLd off, robotsIndex off", async () => {
    await setSeo({ titleTemplate: "{storeName} » %s", homeTitle: "Custom Home", homeDescription: "Custom desc", googleSiteVerification: "g123", bingSiteVerification: "b123", facebookDomainVerification: "f123", twitterHandle: "shop", jsonLd: false });
    let h = await (await page("/")).text();
    expect(h).toContain("<title data-prerender>Custom Home</title>");
    expect(meta(h, "description")).toBe("Custom desc");
    expect(h).toContain('name="google-site-verification" content="g123"');
    expect(h).toContain('name="msvalidate.01" content="b123"');
    expect(h).toContain('name="facebook-domain-verification" content="f123"');
    expect(meta(h, "twitter:site")).toBe("@shop");
    expect(ld(h)).toEqual([]);
    h = await (await page(`/product/${slug}`)).text();
    expect(h).toContain("<title data-prerender>Test Shop » SEO Ürün</title>");
    await setSeo({ robotsIndex: false });
    h = await (await page(`/product/${slug}`)).text();
    expect(meta(h, "robots")).toBe("noindex,nofollow");
    await setSeo({});
  });

  it("fail-open: DB failure serves the plain shell", async () => {
    const boom = { prepare() { throw new Error("db down"); }, batch() { throw new Error("db down"); }, exec() { throw new Error("db down"); } };
    const res = await page(`/product/${slug}`, { env: { DB: boom } });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(SHELL);
  });

  it("ETag / 304", async () => {
    const r = await page("/");
    const tag = r.headers.get("ETag")!;
    expect(tag).toBeTruthy();
    expect((await page("/", { headers: { "If-None-Match": tag } })).status).toBe(304);
  });
});

describe("API: seo fields + preview", () => {
  it("validates seo fields", async () => {
    const base = { slug: "val-prod", nameTr: "V", variants: [{ sku: "VAL-1", prices: { website: 100 } }] };
    expect((await admin(s, "/products", "POST", { ...base, seoTitle: "x".repeat(71) })).status).toBe(400);
    expect((await admin(s, "/products", "POST", { ...base, seoDescription: "x".repeat(321) })).status).toBe(400);
    expect((await admin(s, "/products", "POST", { ...base, seoCanonical: "http://insecure.test/x" })).status).toBe(400);
    expect((await admin(s, "/products", "POST", { ...base, seoOgImageUrl: "javascript:alert(1)" })).status).toBe(400);
    const ok = await admin(s, "/products", "POST", { ...base, seoCanonical: "", seoOgImageUrl: "https://img.test/o.png", seoTitle: "T" });
    expect(ok.status).toBe(201);
    const p = await j<any>(ok);
    expect(p.seoCanonical).toBeNull(); expect(p.seoOgImageUrl).toBe("https://img.test/o.png");
    expect((await admin(s, "/categories", "POST", { slug: "bad-cat", nameTr: "B", seoOgImageUrl: "http://x.test/a.png" })).status).toBe(400);
  });

  it("store endpoints return a resolved seo object", async () => {
    const d = await j<any>(await (await import("./helpers")).call(`/api/store/products/${slug}`));
    expect(d.seo).toMatchObject({ title: "SEO Ürün | Test Shop", canonical: "http://shop.test/product/seo-prod", noindex: false });
    expect(d.seo.image).toBe("https://img.test/a.jpg");
    const l = await j<any>(await (await import("./helpers")).call(`/api/store/products?pageSize=60`));
    expect(l.items.every((i: any) => i.seo && typeof i.seo.title === "string")).toBe(true);
    const c = await j<any>(await (await import("./helpers")).call(`/api/store/categories`));
    expect(c.items.find((x: any) => x.slug === catSlug).seo.title).toBe("Cat Title | Test Shop");
  });

  it("preview endpoint (admin only)", async () => {
    const [p] = (await j<any>(await admin(s, "/products?q=seo-prod"))).items;
    const pv = await j<any>(await admin(s, `/seo/preview?type=product&id=${p.id}`));
    expect(pv.title).toBe("SEO Ürün | Test Shop");
    expect(pv.og.type).toBe("product");
    expect(pv.jsonLd[0]["@type"]).toBe("Product");
    expect((await j<any>(await admin(s, `/seo/preview?type=category&id=${catId}`))).title).toBe("Cat Title | Test Shop");
    expect((await j<any>(await admin(s, `/seo/preview?type=home`))).jsonLd.length).toBe(2);
    expect((await admin(s, `/seo/preview?type=product&id=nope`)).status).toBe(404);
    expect((await admin(s, `/seo/preview?type=zzz`)).status).toBe(400);
    expect((await (await import("./helpers")).call(`/api/admin/seo/preview?type=home`)).status).toBe(401);
  });
});

describe("sitemap + robots", () => {
  it("sitemap lists only active, indexable entries with images and lastmod", async () => {
    const draft = await createProduct(s, { status: "draft" });
    const res = await page("/sitemap.xml");
    expect(res.headers.get("Content-Type")).toContain("xml");
    const x = await res.text();
    expect(x).toContain("xmlns:image=");
    expect(x).toContain("<loc>http://shop.test/product/seo-prod</loc>");
    expect(x).toMatch(/<loc>http:\/\/shop.test\/product\/seo-prod<\/loc><lastmod>\d{4}-\d\d-\d\dT/);
    expect(x).toContain("<image:loc>https://img.test/a.jpg</image:loc>");
    expect(x).toContain("<loc>http://shop.test/category/seo-cat</loc>");
    expect(x).not.toContain(draft.slug);
    expect(x).not.toMatch(/Tükendi/);
    await admin(s, `/categories/${catId}`, "PUT", { slug: catSlug, nameTr: "SEO Kategori", seoNoindex: true });
    expect(await (await page("/sitemap.xml")).text()).not.toContain("/category/seo-cat");
    expect(await (await page("/sitemap-9.xml")).status).toBe(404);
  });
  it("noindex products are excluded", async () => {
    const x = await (await page("/sitemap.xml")).text();
    const [np] = (await j<any>(await admin(s, "/products?q=Tükendi"))).items;
    expect(np.seoNoindex).toBe(true);
    expect(x).not.toContain(`/product/${np.slug}`);
  });
  it("robots.txt rules", async () => {
    await setSeo({ robotsDisallow: ["/private"] });
    const t = await (await page("/robots.txt")).text();
    for (const p of ["/api/", "/admin/", "/mock/", "/cart", "/checkout", "/order/", "/private"]) expect(t).toContain(`Disallow: ${p}\n`);
    expect(t).toContain("Sitemap: http://shop.test/sitemap.xml");
    await setSeo({ robotsIndex: false });
    expect(await (await page("/robots.txt")).text()).toBe("User-agent: *\nDisallow: /\n");
    expect(await (await page("/sitemap.xml")).text()).not.toContain("<url>");
    await setSeo({});
  });
  it("X-Robots-Tag on admin/api, not on media", async () => {
    expect((await page("/api/store/config")).headers.get("X-Robots-Tag")).toBe("noindex");
    expect((await page("/media/none")).headers.get("X-Robots-Tag")).toBeNull();
  });
});

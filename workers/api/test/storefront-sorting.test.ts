import { env } from "cloudflare:test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin, call, ensureOwner, j, type Session } from "./helpers";

let owner: Session;
const P = ["ss-a", "ss-b", "ss-c", "ss-d"];
const prod = (id: string, name: string, created: string) => env.DB.prepare("INSERT INTO products (id, slug, name_tr, status, created_at, updated_at) VALUES (?1, ?1, ?2, 'active', strftime('%s', ?3), strftime('%s', ?3))").bind(id, name, created).run();
const variant = async (pid: string, price: number, total: number) => {
  await env.DB.prepare("INSERT INTO product_variants (id, product_id, sku, position, active) VALUES (?1, ?2, ?1, 0, 1)").bind(`${pid}-v`, pid).run();
  await env.DB.prepare("INSERT INTO channel_prices (variant_id, channel, price, currency) VALUES (?1, 'website', ?2, 'TRY')").bind(`${pid}-v`, price).run();
  await env.DB.prepare("INSERT INTO inventory (variant_id, total, reserved, safety_stock) VALUES (?1, ?2, 0, 0)").bind(`${pid}-v`, total).run();
};
const sold = async (pid: string, qty: number, status = "paid") => {
  const oid = `ss-o-${pid}`;
  await env.DB.prepare(`INSERT INTO orders (id, number, source, status, email, shipping_address, currency, subtotal, total, tracking_token, created_at, updated_at)
    VALUES (?1, ?1, 'website', ?2, 'x@example.invalid', '{}', 'TRY', 1, 1, ?1, unixepoch(), unixepoch())`).bind(oid, status).run();
  await env.DB.prepare("INSERT INTO order_items (id, order_id, variant_id, sku, name, quantity, unit_price) VALUES (?1, ?2, ?3, 'x', 'x', ?4, 1)").bind(`${oid}-i`, oid, `${pid}-v`, qty).run();
};
const slugs = async (qs = "") => ((await j<any>(await call(`/api/store/products?pageSize=60&q=SS${qs ? "&" + qs : ""}`))).items as any[]).map((p) => p.slug).filter((s) => P.includes(s));
const setMerch = (patch: object) => admin(owner, "/settings/merchandising", "PATCH", patch);

beforeAll(async () => {
  owner = await ensureOwner();
  await prod("ss-a", "SS A", "2026-01-01 10:00:00"); await variant("ss-a", 300, 5);
  await prod("ss-b", "SS B", "2026-01-02 10:00:00"); await variant("ss-b", 100, 0);   // sold out
  await prod("ss-c", "SS C", "2026-01-03 10:00:00"); await variant("ss-c", 200, 9);
  await prod("ss-d", "SS D", "2026-01-04 10:00:00"); await variant("ss-d", 400, 3);
  await sold("ss-a", 7); await sold("ss-c", 2); await sold("ss-d", 50, "pending"); // pending orders do not count
});

// Shared test DB: remove everything this file created so other files never see it.
afterAll(async () => {
  for (const sql of [
    "DELETE FROM order_items WHERE id LIKE 'ss-o-%'", "DELETE FROM orders WHERE id LIKE 'ss-o-%'",
    "DELETE FROM inventory WHERE variant_id LIKE 'ss-%'", "DELETE FROM channel_prices WHERE variant_id LIKE 'ss-%'",
    "DELETE FROM product_variants WHERE id LIKE 'ss-%'", "DELETE FROM products WHERE id LIKE 'ss-%'",
  ]) await env.DB.prepare(sql).run();
});

describe("storefront product ordering", () => {
  it("defaults to newest and accepts explicit sorts", async () => {
    expect(await slugs()).toEqual(["ss-d", "ss-c", "ss-b", "ss-a"]);
    expect(await slugs("sort=price_asc")).toEqual(["ss-b", "ss-c", "ss-a", "ss-d"]);
    expect(await slugs("sort=price_desc")).toEqual(["ss-d", "ss-a", "ss-c", "ss-b"]);
    expect(await slugs("sort=name")).toEqual(["ss-a", "ss-b", "ss-c", "ss-d"]);
  });
  it("bestselling counts paid-or-later orders only", async () => {
    expect(await slugs("sort=bestselling")).toEqual(["ss-a", "ss-c", "ss-d", "ss-b"]);
  });
  it("featured puts pinned products first in pinned order, then newest", async () => {
    expect((await setMerch({ pinned: ["ss-a", "ss-c", "ss-a"] })).status).toBe(200);
    expect(await slugs("sort=featured")).toEqual(["ss-a", "ss-c", "ss-d", "ss-b"]);
    expect(await slugs("sort=newest")).toEqual(["ss-d", "ss-c", "ss-b", "ss-a"]); // customer-picked newest ignores pins
  });
  it("defaultSort applies when the customer picks nothing; an unknown sort falls back to it", async () => {
    await setMerch({ defaultSort: "featured" });
    expect(await slugs()).toEqual(["ss-a", "ss-c", "ss-d", "ss-b"]);
    expect(await slugs("sort=bogus")).toEqual(["ss-a", "ss-c", "ss-d", "ss-b"]);
    expect((await j<any>(await call("/api/store/config"))).merchandising).toMatchObject({ defaultSort: "featured", pinnedCount: 2 });
  });
  it("inStockFirst moves sold-out products last for every order", async () => {
    await setMerch({ inStockFirst: true, defaultSort: "price_asc" });
    expect(await slugs()).toEqual(["ss-c", "ss-a", "ss-d", "ss-b"]);
    expect(await slugs("sort=newest")).toEqual(["ss-d", "ss-c", "ss-a", "ss-b"]);
  });
  it("validates merchandising settings", async () => {
    for (const bad of [{ defaultSort: "random" }, { bestsellerDays: 3 }, { pinned: [""] }]) expect((await setMerch(bad)).status).toBe(400);
    await setMerch({ inStockFirst: false, defaultSort: "newest", pinned: [] });
  });
});

describe("menu settings", () => {
  it("exposes the menu publicly with defaults, and validates items", async () => {
    expect((await j<any>(await call("/api/store/config"))).menu).toEqual({ auto: true, showProductsLink: true, items: [] });
    const ok = await admin(owner, "/settings/menu", "PATCH", { auto: false, items: [
      { id: "m1", type: "category", categoryId: "c1", label: "", showChildren: true },
      { id: "m2", type: "link", label: "Kampanyalar", url: "/page/kampanya" },
      { id: "m3", type: "link", label: "Blog", labelEn: "Blog", url: "https://blog.example.com/", newTab: true },
    ] });
    expect(ok.status).toBe(200);
    const cfg = (await j<any>(await call("/api/store/config"))).menu;
    expect(cfg.auto).toBe(false); expect(cfg.items).toHaveLength(3);
    for (const items of [
      [{ id: "x", type: "category", categoryId: null }],
      [{ id: "x", type: "link", label: "", url: "/a" }],
      [{ id: "x", type: "link", label: "A", url: "javascript:alert(1)" }],
      [{ id: "x", type: "link", label: "A", url: "//evil.example.com" }],
      Array.from({ length: 13 }, (_, i) => ({ id: `i${i}`, type: "link", label: "L", url: "/a" })),
    ]) expect((await admin(owner, "/settings/menu", "PATCH", { items })).status).toBe(400);
    await admin(owner, "/settings/menu", "PATCH", { auto: true, items: [] });
  });
});

describe("admin product list by ids", () => {
  it("filters by comma-separated ids", async () => {
    const r = await j<any>(await admin(owner, "/products?ids=ss-a,ss-c,nope"));
    expect(r.items.map((p: any) => p.id).sort()).toEqual(["ss-a", "ss-c"]);
  });
});

describe("curated home page products", () => {
  it("?ids returns exactly those active products in the given order and ignores sort settings", async () => {
    await setMerch({ inStockFirst: true, defaultSort: "price_asc" });
    const r = await j<any>(await call("/api/store/products?ids=ss-b,ss-a,nope,ss-c&pageSize=24"));
    expect(r.items.map((p: any) => p.slug)).toEqual(["ss-b", "ss-a", "ss-c"]);
    await env.DB.prepare("UPDATE products SET status = 'draft' WHERE id = 'ss-a'").run();
    expect((await j<any>(await call("/api/store/products?ids=ss-b,ss-a,ss-c"))).items.map((p: any) => p.slug)).toEqual(["ss-b", "ss-c"]);
    await env.DB.prepare("UPDATE products SET status = 'active' WHERE id = 'ss-a'").run();
    await setMerch({ inStockFirst: false, defaultSort: "newest" });
  });
  it("homepage settings: public defaults, validation and dedupe", async () => {
    expect((await j<any>(await call("/api/store/config"))).homepage).toEqual({ mode: "auto", productIds: [], limit: 8, title: "", titleEn: "" });
    const ok = await admin(owner, "/settings/homepage", "PATCH", { mode: "manual", productIds: ["ss-c", "ss-a", "ss-c"], title: "Seçtiklerimiz" });
    expect(ok.status).toBe(200);
    expect((await j<any>(await call("/api/store/config"))).homepage).toMatchObject({ mode: "manual", productIds: ["ss-c", "ss-a"], title: "Seçtiklerimiz" });
    for (const bad of [{ mode: "random" }, { limit: 2 }, { limit: 30 }, { productIds: Array.from({ length: 25 }, (_, i) => `p${i}`) }, { title: "x".repeat(61) }]) expect((await admin(owner, "/settings/homepage", "PATCH", bad)).status).toBe(400);
    await admin(owner, "/settings/homepage", "PATCH", { mode: "auto", productIds: [], title: "" });
  });
});

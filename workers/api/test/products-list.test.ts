import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { admin, ensureOwner, j, type Session } from "./helpers";

let owner: Session;
const prod = (id: string, name: string, status = "active", cat: string | null = null, brand: string | null = null) => env.DB.prepare(
  "INSERT INTO products (id, slug, name_tr, status, category_id, brand, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, unixepoch(), unixepoch())",
).bind(id, `pl-${id}`, name, status, cat, brand).run();
const variant = async (pid: string, vid: string, sku: string, price: number, total: number, reserved = 0, compare: number | null = null) => {
  await env.DB.prepare("INSERT INTO product_variants (id, product_id, sku, position, active) VALUES (?1, ?2, ?3, 0, 1)").bind(vid, pid, sku).run();
  await env.DB.prepare("INSERT INTO channel_prices (variant_id, channel, price, compare_at_price, currency) VALUES (?1, 'website', ?2, ?3, 'TRY')").bind(vid, price, compare).run();
  await env.DB.prepare("INSERT INTO inventory (variant_id, total, reserved, safety_stock) VALUES (?1, ?2, ?3, 0)").bind(vid, total, reserved).run();
};
const list = async (qs = "") => (await j<any>(await admin(owner, `/products?pageSize=100&q=PLX${qs ? "&" + qs : ""}`))).items as any[];
const ids = (rows: any[]) => rows.map((r) => r.id);

beforeAll(async () => {
  owner = await ensureOwner();
  await env.DB.prepare("INSERT OR IGNORE INTO categories (id, slug, name_tr, position, active) VALUES ('pl-cat','pl-cat','Seramik',0,1),('pl-cat2','pl-cat2','Keten',0,1)").run();
  await prod("pa", "PLX Vazo", "active", "pl-cat", "Atölye"); await variant("pa", "pa-v", "PLX-A", 10000, 20, 0, 15000);
  await prod("pb", "PLX Tabak", "draft", null); await variant("pb", "pb-v", "PLX-B", 5000, 3);
  await prod("pc", "PLX Örtü", "active", "pl-cat2"); await variant("pc", "pc-v", "PLX-C", 2000, 4, 4);
  await env.DB.prepare("INSERT INTO product_images (id, product_id, url, position) VALUES ('pl-img','pa','https://x.example/a.png',0)").run();
  await env.DB.prepare("INSERT INTO product_mappings (id, variant_id, provider, external_sku) VALUES ('pl-m','pa-v','trendyol','TY-A')").run();
});

describe("GET /products list", () => {
  it("returns category name and Trendyol mapping flag", async () => {
    const rows = await list(); const a = rows.find((r) => r.id === "pa");
    expect(a).toMatchObject({ categoryName: "Seramik", onTrendyol: true });
    expect(rows.find((r) => r.id === "pb")).toMatchObject({ categoryName: null, onTrendyol: false });
  });
  it("filters by stock, image, channel, category=none and brand search", async () => {
    expect(ids(await list("stock=out"))).toEqual(["pc"]);
    expect(ids(await list("stock=low"))).toEqual(["pb"]);
    expect(ids(await list("stock=in"))).toEqual(["pa"]);
    expect(ids(await list("image=none")).sort()).toEqual(["pb", "pc"]);
    expect(ids(await list("channel=trendyol"))).toEqual(["pa"]);
    expect(ids(await list("channel=website_only")).sort()).toEqual(["pb", "pc"]);
    expect(ids(await list("category=none"))).toEqual(["pb"]);
    expect(ids(await list("status=active&category=pl-cat"))).toEqual(["pa"]);
    expect(ids((await j<any>(await admin(owner, "/products?q=Atölye"))).items)).toContain("pa");
  });
  it("sorts by price and stock, both directions", async () => {
    expect(ids(await list("sort=price"))).toEqual(["pc", "pb", "pa"]);
    expect(ids(await list("sort=price-desc"))).toEqual(["pa", "pb", "pc"]);
    expect(ids(await list("sort=stock"))).toEqual(["pc", "pb", "pa"]);
    // SQLite NOCASE is ASCII-only: names starting with Turkish letters (Ö, Ç, Ş...) sort after Z. Known limitation.
    expect(ids(await list("sort=name"))).toEqual(["pb", "pa", "pc"]);
  });
  it("rejects unknown filter values", async () => {
    for (const qs of ["stock=x", "image=x", "channel=x", "sort=x"]) expect((await admin(owner, `/products?${qs}`)).status).toBe(400);
  });
});

describe("variant price + bulk actions", () => {
  it("PATCH /variants/:id/price updates the website price and validates compare-at", async () => {
    expect((await admin(owner, "/variants/pb-v/price", "PATCH", { price: 6000 })).status).toBe(200);
    expect((await list()).find((r) => r.id === "pb").variants[0].prices.website).toBe(6000);
    expect((await admin(owner, "/variants/pb-v/price", "PATCH", { price: 6000, compareAtPrice: 5000 })).status).toBe(400);
    expect((await admin(owner, "/variants/nope/price", "PATCH", { price: 100 })).status).toBe(404);
    // omitted compareAtPrice keeps the strike-through while it stays above the price, and is dropped once it would not
    expect(await j<any>(await admin(owner, "/variants/pa-v/price", "PATCH", { price: 12000 }))).toMatchObject({ price: 12000, compareAtPrice: 15000 });
    expect(await j<any>(await admin(owner, "/variants/pa-v/price", "PATCH", { price: 15000 }))).toMatchObject({ compareAtPrice: null });
    await admin(owner, "/variants/pa-v/price", "PATCH", { price: 10000, compareAtPrice: 15000 });
  });
  it("POST /products/bulk changes status and category, reports missing ids", async () => {
    const r = await j<any>(await admin(owner, "/products/bulk", "POST", { ids: ["pb", "pc", "ghost"], action: "status", status: "archived" }));
    expect(r).toMatchObject({ updated: 2, missing: ["ghost"] });
    expect((await list("status=archived")).map((x) => x.id).sort()).toEqual(["pb", "pc"]);
    expect((await j<any>(await admin(owner, "/products/bulk", "POST", { ids: ["pb"], action: "category", categoryId: "pl-cat2" }))).updated).toBe(1);
    expect((await list()).find((x) => x.id === "pb").categoryId).toBe("pl-cat2");
    expect((await admin(owner, "/products/bulk", "POST", { ids: ["pb"], action: "category", categoryId: "unknown" })).status).toBe(400);
  });
  it("POST /products/bulk price applies a percentage to price and compare-at (keeps compare-at above price)", async () => {
    const r = await j<any>(await admin(owner, "/products/bulk", "POST", { ids: ["pa", "pc"], action: "price", percent: 10 }));
    expect(r).toMatchObject({ updated: 2, pricesChanged: 2 });
    const rows = await list();
    const a = rows.find((x) => x.id === "pa").variants[0]; const c = rows.find((x) => x.id === "pc").variants[0];
    expect(a.prices.website).toBe(11000); expect(a.compareAtPrice).toBe(16500); expect(c.prices.website).toBe(2200);
    await admin(owner, "/products/bulk", "POST", { ids: ["pa"], action: "price", percent: -10 });
    expect((await list()).find((x) => x.id === "pa").variants[0].prices.website).toBe(9900);
  });
  it("validates the bulk body", async () => {
    for (const body of [{ ids: [], action: "status", status: "active" }, { ids: ["pa"], action: "price", percent: 0 }, { ids: ["pa"], action: "price", percent: 900 }, { ids: ["pa"], action: "nope" }]) {
      expect((await admin(owner, "/products/bulk", "POST", body)).status).toBe(400);
    }
  });
});

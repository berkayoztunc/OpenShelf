import { env } from "cloudflare:test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { clearSettingsCache } from "../src/lib/settings";
import { admin, ensureOwner, j, loginAs, type Session } from "./helpers";

let owner: Session; let staff: Session;
const setMock = (on: boolean) => env.DB.prepare(`INSERT INTO store_settings ("group", value, updated_at) VALUES ('system', ?1, unixepoch()) ON CONFLICT("group") DO UPDATE SET value = ?1`).bind(JSON.stringify({ mockMode: on })).run().then(() => clearSettingsCache());
const one = <T,>(q: string, ...b: unknown[]) => env.DB.prepare(q).bind(...b).first<T>();
const IMG = [{ url: "https://cdn.example.com/charm.jpg", alt: "x" }];

beforeAll(async () => {
  owner = await ensureOwner();
  const email = `staff-tydraft-${Date.now()}@example.com`;
  expect((await admin(owner, "/users", "POST", { email, name: "S", password: "staff password 12345", role: "staff" })).status).toBe(201);
  staff = await loginAs(email, "staff password 12345");
  await setMock(true);
  await env.DB.exec("DELETE FROM mock_state WHERE key LIKE 'ty:%'");
});
afterAll(async () => {
  await env.DB.exec(`DELETE FROM product_mappings WHERE variant_id LIKE 'dr-%' OR variant_id IN (SELECT id FROM product_variants WHERE sku LIKE 'DR-%'); DELETE FROM channel_listings WHERE variant_id IN (SELECT id FROM product_variants WHERE sku LIKE 'DR-%'); DELETE FROM inventory WHERE variant_id IN (SELECT id FROM product_variants WHERE sku LIKE 'DR-%'); DELETE FROM channel_prices WHERE variant_id IN (SELECT id FROM product_variants WHERE sku LIKE 'DR-%'); DELETE FROM product_images WHERE product_id IN (SELECT id FROM products WHERE slug LIKE 'dr-%'); DELETE FROM product_variants WHERE sku LIKE 'DR-%'; DELETE FROM products WHERE slug LIKE 'dr-%'; DELETE FROM categories WHERE id LIKE 'dr-%'; DELETE FROM sync_cursors WHERE key LIKE 'trendyol:defaults:%'; DELETE FROM mock_state WHERE key LIKE 'ty:%'; DELETE FROM outbox_jobs;`);
  await setMock(false);
});

async function category(id: string, name: string) {
  await env.DB.prepare("INSERT INTO categories (id, slug, name_tr) VALUES (?1, ?1, ?2)").bind(id, name).run();
}
async function product(slug: string, o: { brand?: string | null; categoryId?: string | null; variants: { sku: string; title: string; stock?: number; grams?: number }[]; desc?: string }) {
  const r = await admin(owner, "/products", "POST", {
    slug, nameTr: "Çanta Süsü Model", status: "active", brand: o.brand ?? null, categoryId: o.categoryId ?? null, descriptionTr: o.desc ?? "El yapımı çanta süsü.", images: IMG,
    variants: o.variants.map((v, i) => ({ sku: v.sku, barcode: v.sku, title: v.title, position: i, ...(v.grams ? { weightGrams: v.grams } : {}), prices: { website: 69000 }, stock: { total: v.stock ?? 20 } })),
  });
  expect(r.status).toBe(201);
  const p = await j<any>(r);
  return { id: p.id as string, variants: p.variants as { id: string; sku: string }[] };
}
const draft = async (productId: string, overrides?: unknown) => j<any>(await admin(owner, "/trendyol/draft", "POST", { productId, ...(overrides ? { overrides } : {}) }));

describe("Trendyol draft / create-product (MCP backend, mock Trendyol)", () => {
  it("is admin only and needs Trendyol", async () => {
    expect((await admin(staff, "/trendyol/draft", "POST", { productId: "x" })).status).toBe(403);
    expect((await admin(staff, "/trendyol/find?kind=brand&q=ko")).status).toBe(403);
    expect((await admin(staff, "/trendyol/create-product", "POST", { productId: "x" })).status).toBe(403);
    expect((await admin(owner, "/trendyol/draft", "POST", { productId: "nope" })).status).toBe(404);
  });

  it("find: brands, leaf categories, attributes and values come back compact", async () => {
    expect((await j<any>(await admin(owner, "/trendyol/find?kind=brand&q=Koton"))).items).toEqual([{ id: 104, name: "Koton" }]);
    expect((await admin(owner, "/trendyol/find?kind=brand&q=k")).status).toBe(400);
    const cats = await j<any>(await admin(owner, "/trendyol/find?kind=category&q=Bere"));
    expect(cats.items.map((i: any) => i.id)).toEqual([384, 382]);                                                    // leaves only (never the parent "Atkı & Bere & Eldiven"), the one NAMED Bere first
    expect(cats.items[0].path).toBe("Aksesuar › Atkı & Bere & Eldiven › Bere");
    const attrs = await j<any>(await admin(owner, "/trendyol/find?kind=attributes&categoryId=384"));
    expect(attrs.items.find((a: any) => a.name === "Renk")).toMatchObject({ id: 47, required: true, slicer: true, allowCustom: true });
    const vals = await j<any>(await admin(owner, "/trendyol/find?kind=attributeValue&categoryId=384&attributeId=47&q=mavı"));
    expect(vals.total).toBeGreaterThan(5); expect(vals.items.length).toBeLessThanOrEqual(40);
    expect((await j<any>(await admin(owner, "/trendyol/find?kind=attributeValue&categoryId=384&attributeId=47&q=Kırmızı"))).items).toEqual([{ id: 1008, name: "Kırmızı" }]);
    expect((await admin(owner, "/trendyol/find?kind=attributeValue&categoryId=384")).status).toBe(400);
  });

  it("draft: brand from the product, leaf category from the local category name, colour per variant from the variant names", async () => {
    await category("dr-bere", "Bere");
    const p = await product("dr-bere-1", { brand: "Koton", categoryId: "dr-bere", variants: [{ sku: "DR-1A", title: "Kırmızı", grams: 1500 }, { sku: "DR-1B", title: "Mavi" }] });
    const d = await draft(p.id);
    expect(d).toMatchObject({ ready: true, unresolved: [], problems: [], remembered: false });
    expect(d.brand).toMatchObject({ id: 104, name: "Koton", source: "product" });
    expect(d.category).toMatchObject({ id: 384, source: "name" });
    expect(d.fields).toMatchObject({ vatRate: 20, origin: "TR", dimensionalWeight: 2, imageCount: 1 });
    const renk = d.attributes.find((a: any) => a.id === 47);
    expect(renk).toMatchObject({ scope: "variant", required: true });
    expect(renk.values[p.variants[0]!.id]).toEqual({ ids: [1008], custom: "" }); expect(renk.values[p.variants[1]!.id]).toEqual({ ids: [1006], custom: "" });
    expect(d.variants.map((v: any) => [v.barcode, v.quantity, v.salePrice])).toEqual([["DR-1A", 20, 690], ["DR-1B", 20, 690]]);
    expect(d.firstItem).toMatchObject({ brandId: 104, categoryId: 384, productMainId: "DR-BERE-1" });
  });

  it("create: sends one item per variant, links the variants as awaiting approval and remembers the choices for the category", async () => {
    const p = (await one<{ id: string }>("SELECT id FROM products WHERE slug = 'dr-bere-1'"))!;
    const before = (await one<{ n: number }>("SELECT COUNT(*) AS n FROM trendyol_calls WHERE operation_id = 'createProducts'"))!.n;
    const r = await admin(owner, "/trendyol/create-product", "POST", { productId: p.id });
    expect(r.status).toBe(201);
    const b = await j<any>(r);
    expect(b).toMatchObject({ created: true, skipped: [] }); expect(b.batchId).toBeTruthy();
    expect(b.linked.map((l: any) => l.barcode).sort()).toEqual(["DR-1A", "DR-1B"]);
    expect((await one<{ n: number }>("SELECT COUNT(*) AS n FROM trendyol_calls WHERE operation_id = 'createProducts'"))!.n).toBe(before + 1);   // ONE request for both variants
    const listing = await env.DB.prepare("SELECT enabled, last_error AS e FROM channel_listings WHERE variant_id IN (SELECT id FROM product_variants WHERE sku IN ('DR-1A','DR-1B'))").all<any>();
    expect(listing.results).toEqual([{ enabled: 1, e: "pending_approval" }, { enabled: 1, e: "pending_approval" }]);
    expect((await one<{ n: number }>("SELECT COUNT(*) AS n FROM product_mappings WHERE external_barcode IN ('DR-1A','DR-1B')"))!.n).toBe(2);
    const mem = JSON.parse((await one<{ value: string }>("SELECT value FROM sync_cursors WHERE key = 'trendyol:defaults:dr-bere'"))!.value);
    expect(mem).toMatchObject({ trendyolCategoryId: 384, brandId: 104, brandName: "Koton", origin: "TR" }); expect(mem.attrs["47"]).toBeUndefined();   // colour is per variant: never remembered
    expect(await j<any>(await admin(owner, `/trendyol/sync/${p.id}`))).toMatchObject({ mode: "synced", pending: 2, notListed: 0 });
  });

  it("a barcode that is already on Trendyol is linked, never created again", async () => {
    const p = (await one<{ id: string }>("SELECT id FROM products WHERE slug = 'dr-bere-1'"))!;
    await env.DB.exec("DELETE FROM product_mappings WHERE external_barcode IN ('DR-1A','DR-1B'); DELETE FROM channel_listings WHERE variant_id IN (SELECT id FROM product_variants WHERE sku IN ('DR-1A','DR-1B'))");
    const d = await draft(p.id);
    expect(d.existing.map((e: any) => [e.barcode, e.status]).sort()).toEqual([["DR-1A", "approved"], ["DR-1B", "approved"]]);
    expect(d).toMatchObject({ ready: true, unresolved: [], problems: [], firstItem: null });
    const before = (await one<{ n: number }>("SELECT COUNT(*) AS n FROM trendyol_calls WHERE operation_id = 'createProducts'"))!.n;
    const r = await admin(owner, "/trendyol/create-product", "POST", { productId: p.id });
    expect(r.status).toBe(201);
    const b = await j<any>(r);
    expect(b.alreadyOnTrendyol.sort()).toEqual(["DR-1A", "DR-1B"]); expect(b.batchId).toBeUndefined();
    expect(b.linked.map((l: any) => l.barcode).sort()).toEqual(["DR-1A", "DR-1B"]);
    expect((await one<{ n: number }>("SELECT COUNT(*) AS n FROM trendyol_calls WHERE operation_id = 'createProducts'"))!.n).toBe(before);   // nothing was sent
    expect((await one<{ n: number }>("SELECT COUNT(*) AS n FROM product_mappings WHERE external_barcode IN ('DR-1A','DR-1B')"))!.n).toBe(2);
  });

  it("the next product of the category is prepared from the remembered choices", async () => {
    const p = await product("dr-bere-2", { brand: null, categoryId: "dr-bere", variants: [{ sku: "DR-2A", title: "Siyah" }] });
    const d = await draft(p.id);
    expect(d).toMatchObject({ ready: true, remembered: true });
    expect(d.brand).toMatchObject({ id: 104, source: "remembered" }); expect(d.category).toMatchObject({ id: 384, source: "remembered" });
    expect(d.attributes.find((a: any) => a.id === 47)).toMatchObject({ scope: "shared", value: { ids: [1003], custom: "" } });      // single variant: "Siyah" -> Siyah
  });

  it("what cannot be decided is returned as unresolved, nothing is sent, and overrides resolve it", async () => {
    await category("dr-zzz", "Hiçbir Yerde Yok");
    const p = await product("dr-open-1", { brand: null, categoryId: "dr-zzz", variants: [{ sku: "DR-3A", title: "Parlak" }] });
    const d = await draft(p.id);
    expect(d.ready).toBe(false);
    expect(d.unresolved.map((u: any) => u.kind)).toEqual(expect.arrayContaining(["category"]));
    const calls = (await one<{ n: number }>("SELECT COUNT(*) AS n FROM trendyol_calls WHERE operation_id = 'createProducts'"))!.n;
    const refused = await admin(owner, "/trendyol/create-product", "POST", { productId: p.id });
    expect(refused.status).toBe(409);
    expect(await j<any>(refused)).toMatchObject({ created: false, reason: "draft_not_ready" });
    expect((await one<{ n: number }>("SELECT COUNT(*) AS n FROM trendyol_calls WHERE operation_id = 'createProducts'"))!.n).toBe(calls);   // nothing was sent
    // the AI picks a category and brand, and chooses the colour (no variant-name match: "Parlak")
    const o1 = await draft(p.id, { categoryId: 411, categoryPath: "Ev Dekorasyon", brandId: 104, brandName: "Koton" });
    const colour = o1.unresolved.find((u: any) => u.kind === "attribute" && u.attributeId === 47);
    expect(colour).toMatchObject({ scope: "shared", allowCustom: true, optionCount: 10 }); expect(colour.options.length).toBe(10);
    const ready = await draft(p.id, { categoryId: 411, categoryPath: "Ev Dekorasyon", brandId: 104, brandName: "Koton", attrs: { "47": { custom: "Parlak Altın" } } });
    expect(ready).toMatchObject({ ready: true, unresolved: [] });
    expect(ready.firstItem.attributes).toContainEqual({ attributeId: 47, customAttributeValue: "Parlak Altın" });
    expect((await admin(owner, "/trendyol/draft", "POST", { productId: p.id, overrides: { nope: 1 } })).status).toBe(400);              // unknown override keys are refused
    const bad = await draft(p.id, { categoryId: 411, brandId: 104, attrs: { "47": { ids: [999999] } } });
    expect(bad.unresolved.find((u: any) => u.attributeId === 47)).toMatchObject({ reason: "unknown_value" });
  });

  it("problems a person would fix by hand are listed (barcode shared by two variants, description missing)", async () => {
    await category("dr-bere2", "Bere");
    const p = await product("dr-prob-1", { brand: "Koton", categoryId: "dr-bere2", desc: "", variants: [{ sku: "DR-4A", title: "Kırmızı" }, { sku: "DR-4B", title: "Mavi" }] });
    await env.DB.prepare("DELETE FROM sync_cursors WHERE key = 'trendyol:defaults:dr-bere2'").run();
    const d = await draft(p.id, { variants: [{ variantId: p.variants[1]!.id, barcode: "DR-4A" }] });
    expect(d.ready).toBe(false);
    expect(d.problems.map((x: any) => x.message)).toEqual(expect.arrayContaining(["description is missing", "barcode DR-4A is used by two variants"]));
  });
});

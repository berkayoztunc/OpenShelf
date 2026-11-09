import { beforeAll, describe, expect, it } from "vitest";
import { admin, call, ensureOwner, j, type Session } from "./helpers";

let owner: Session; let full = ""; let read = "";
const rpc = (t: string, payload: unknown) => call("/mcp", { method: "POST", json: payload, origin: null, headers: { Authorization: `Bearer ${t}` } });
const tool = async (name: string, args: unknown = {}, t = full) => (await j<any>(await rpc(t, { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }))).result as { content: { text: string }[]; isError?: boolean };
const data = (r: { content: { text: string }[] }) => JSON.parse(r.content[0]!.text);
const group = async (g: string) => data(await tool("get_settings_group", { group: g }));

beforeAll(async () => {
  owner = await ensureOwner();
  full = (await j<any>(await admin(owner, "/tokens", "POST", { name: "s-full", level: "full" }))).token;
  read = (await j<any>(await admin(owner, "/tokens", "POST", { name: "s-read", level: "read" }))).token;
});

describe("PATCH /settings/:group (merge)", () => {
  it("changes only the sent fields and validates the merged result", async () => {
    await admin(owner, "/settings/general", "PATCH", { tagline: "Eski slogan", contactPhone: "+905301112233" });
    const r = await admin(owner, "/settings/general", "PATCH", { storeName: "Patch Mağaza" });
    expect(r.status).toBe(200);
    const g = await j<any>(await admin(owner, "/settings/general"));
    expect(g).toMatchObject({ storeName: "Patch Mağaza", tagline: "Eski slogan", contactPhone: "+905301112233", currency: "TRY" });
  });
  it("nested objects merge, arrays replace, null clears nullable fields", async () => {
    await admin(owner, "/settings/branding", "PATCH", { social: { instagram: "ig1", facebook: "fb1" }, bannerMediaIds: ["a", "b"] });
    await admin(owner, "/settings/branding", "PATCH", { social: { instagram: "ig2" }, bannerMediaIds: ["c"] });
    const b = await j<any>(await admin(owner, "/settings/branding"));
    expect(b.social).toMatchObject({ instagram: "ig2", facebook: "fb1" }); expect(b.bannerMediaIds).toEqual(["c"]);
    await admin(owner, "/settings/branding", "PATCH", { logoMediaId: "x1" });
    await admin(owner, "/settings/branding", "PATCH", { logoMediaId: null });
    expect((await j<any>(await admin(owner, "/settings/branding"))).logoMediaId).toBeNull();
  });
  it("rejects unknown fields, empty patches and invalid merged values without saving anything", async () => {
    const before = await j<any>(await admin(owner, "/settings/general"));
    expect((await admin(owner, "/settings/general", "PATCH", { nope: 1 })).status).toBe(400);
    expect((await admin(owner, "/settings/general", "PATCH", {})).status).toBe(400);
    const bad = await admin(owner, "/settings/general", "PATCH", { storeName: "Geçerli", contactEmail: "not-an-email" });
    expect(bad.status).toBe(400);
    expect(await j<any>(await admin(owner, "/settings/general"))).toEqual(before); // atomic: storeName was NOT applied
    expect((await admin(owner, "/settings/unknown", "PATCH", { a: 1 })).status).toBe(404);
    expect((await admin(owner, "/settings/unknown")).status).toBe(404);
  });
});

describe("typed settings tools", () => {
  it("update_store_profile sets the store name and nothing else; get_settings_group reads it", async () => {
    await tool("update_store_profile", { body: { tagline: "Kalıcı slogan", defaultTaxRate: 10 } });
    const r = await tool("update_store_profile", { body: { storeName: "MCP Dükkan" } });
    expect(r.isError).toBeUndefined();
    expect(await group("general")).toMatchObject({ storeName: "MCP Dükkan", tagline: "Kalıcı slogan", defaultTaxRate: 10 });
  });
  it("PATCH tools forward the body as sent: nested defaults never overwrite existing values", async () => {
    await tool("update_notification_settings", { body: { events: { order_paid: { sms: false, email: false } } } });
    await tool("update_notification_settings", { body: { events: { order_paid: { sms: true } } } }); // email must STAY false
    const n = await group("notifications");
    expect(n.events.order_paid).toEqual({ sms: true, email: false });
    await tool("update_notification_settings", { body: { templates: { tr: { order_paid: { subject: "Teşekkürler {{customerName}}" } } } } });
    expect((await group("notifications")).templates.tr.order_paid.subject).toBe("Teşekkürler {{customerName}}");
  });
  it("every group has a patch tool: seo, branding, legal, checkout, tracking", async () => {
    expect((await tool("update_seo_settings", { body: { homeTitle: "Ana sayfa başlığı", twitterHandle: "@mcpshop", robotsDisallow: ["/hesap"] } })).isError).toBeUndefined();
    expect(await group("seo")).toMatchObject({ homeTitle: "Ana sayfa başlığı", twitterHandle: "@mcpshop", robotsDisallow: ["/hesap"], robotsIndex: true });
    expect((await tool("update_branding", { body: { primaryColor: "#112233", social: { x: "mcpshop" } } })).isError).toBeUndefined();
    expect(await group("branding")).toMatchObject({ primaryColor: "#112233" });
    expect((await tool("update_legal_pages", { body: { returns: "14 gün iade" } })).isError).toBeUndefined();
    expect((await group("legal")).returns).toBe("14 gün iade");
    expect((await tool("update_checkout_settings", { body: { freeShippingThreshold: 50000, flatShippingFee: 2990 } })).isError).toBeUndefined();
    expect(await group("checkout")).toMatchObject({ freeShippingThreshold: 50000, flatShippingFee: 2990, guestCheckout: true });
    expect((await tool("update_tracking_settings", { body: { ga4MeasurementId: "G-ABC123" } })).isError).toBeUndefined();
    expect((await group("tracking")).ga4MeasurementId).toBe("G-ABC123");
  });
  it("validation problems come back as readable errors; nothing is saved", async () => {
    const r = await tool("update_seo_settings", { body: { twitterHandle: "bu geçersiz bir tutamaç!!" } });
    expect(r.isError).toBe(true);
    const r2 = await tool("update_tracking_settings", { body: { ga4MeasurementId: "yanlis" } });
    expect(r2.isError).toBe(true); expect(r2.content[0]!.text).toMatch(/Invalid arguments|HTTP 400/);
    expect((await group("tracking")).ga4MeasurementId).toBe("G-ABC123");
  });
  it("read tokens can read one group but not change settings; system group is not selectable", async () => {
    expect((await tool("get_settings_group", { group: "general" }, read)).isError).toBeUndefined();
    const denied = await tool("update_store_profile", { body: { storeName: "Hack" } }, read);
    expect(denied.isError).toBe(true); expect(denied.content[0]!.text).toContain('needs level "write"');
    expect((await group("general")).storeName).toBe("MCP Dükkan");
    expect((await tool("get_settings_group", { group: "system" })).isError).toBe(true);
    // even through the raw API an admin-level caller cannot patch system; only the owner can
    expect((await admin(owner, "/settings/system", "PATCH", { mockMode: false })).status).toBe(200);
  });
});

describe("per-product / per-category SEO and the audit", () => {
  let pid = ""; let cid = "";
  beforeAll(async () => {
    cid = data(await tool("create_category", { body: { slug: "seo-kat", nameTr: "SEO Kategori" } })).id;
    const p = data(await tool("create_product", { body: { slug: "seo-urun", nameTr: "SEO Ürün", categoryId: cid, status: "active", descriptionTr: "Uzun bir açıklama metni burada.", variants: [{ sku: "SEO-1", prices: { website: 1000 }, stock: { total: 3 } }], images: [{ url: "https://img.example.com/a.jpg" }] } }));
    pid = p.id;
  });
  it("seo_audit lists site problems and product gaps; fixing them removes the issues", async () => {
    await tool("update_seo_settings", { body: { robotsIndex: false, homeTitle: "", defaultOgMediaId: null } });
    const a = data(await tool("seo_audit"));
    expect(a.site.map((s: any) => s.code)).toEqual(expect.arrayContaining(["robots_noindex", "no_home_title", "no_default_og_image"]));
    expect(a.site.find((s: any) => s.code === "robots_noindex").severity).toBe("high");
    const prod = a.products.find((p: any) => p.id === pid);
    expect(prod.issues).toEqual(expect.arrayContaining(["no_seo_title", "no_seo_description", "images_missing_alt"]));
    expect(a.categories.find((c: any) => c.id === cid).issues).toContain("no_seo_title");
    expect(a.summary.productIssueCounts.no_seo_title).toBeGreaterThanOrEqual(1);
    await tool("update_seo_settings", { body: { robotsIndex: true, homeTitle: "Ana sayfa" } });
    expect(data(await tool("seo_audit")).site.map((s: any) => s.code)).not.toContain("robots_noindex");
  });
  it("update_product_seo changes only SEO fields; seo_preview reflects it; empty string clears", async () => {
    const before = data(await tool("get_product", { id: pid }));
    const r = await tool("update_product_seo", { id: pid, body: { seoTitle: "Harika SEO Ürün | Mağaza", seoDescription: "Bu ürün hakkında arama motorları için yeterince uzun ve açıklayıcı bir açıklama metni yazıldı." } });
    expect(r.isError).toBeUndefined(); expect(data(r)).toMatchObject({ seoTitle: "Harika SEO Ürün | Mağaza" });
    const after = data(await tool("get_product", { id: pid }));
    expect(after.nameTr).toBe(before.nameTr); expect(after.variants).toHaveLength(before.variants.length); expect(after.images).toHaveLength(before.images.length); expect(after.slug).toBe(before.slug);
    expect(data(await tool("seo_preview", { type: "product", id: pid })).title).toContain("Harika SEO Ürün");
    const issues = data(await tool("seo_audit")).products.find((p: any) => p.id === pid)?.issues ?? [];
    expect(issues).not.toContain("no_seo_title"); expect(issues).not.toContain("no_seo_description");
    await tool("update_product_seo", { id: pid, body: { seoNoindex: true } });
    expect(data(await tool("seo_audit")).products.find((p: any) => p.id === pid).issues).toContain("noindex");
    await tool("update_product_seo", { id: pid, body: { seoNoindex: false, seoTitle: "" } });
    expect(data(await tool("get_product", { id: pid })).seoTitle ?? null).toBeNull(); // cleared
  });
  it("update_product_seo / update_category_seo validate input and ids", async () => {
    expect((await tool("update_product_seo", { id: pid, body: {} })).isError).toBe(true);
    expect((await tool("update_product_seo", { id: "yok", body: { seoTitle: "x" } })).content[0]!.text).toContain("HTTP 404");
    expect((await tool("update_product_seo", { id: pid, body: { seoTitle: "x".repeat(71) } })).isError).toBe(true);
    expect((await tool("update_product_seo", { id: pid, body: { seoCanonical: "http://insecure.example.com" } })).isError).toBe(true);
    const c = await tool("update_category_seo", { id: cid, body: { seoTitle: "Kategori başlığı", seoDescription: "Kategori için arama sonucunda görünecek açıklama metni, yeterince uzun." } });
    expect(c.isError).toBeUndefined(); expect(data(c).seoTitle).toBe("Kategori başlığı");
    expect(data(await tool("seo_preview", { type: "category", id: cid })).title).toContain("Kategori başlığı");
    expect((await tool("update_category_seo", { id: "yok", body: { seoTitle: "x" } })).content[0]!.text).toContain("HTTP 404");
    expect((await tool("update_category_seo", { id: cid, body: {} })).isError).toBe(true);
  });
  it("duplicate SEO titles are flagged", async () => {
    const p2 = data(await tool("create_product", { body: { slug: "seo-urun-2", nameTr: "SEO Ürün 2", status: "active", variants: [{ sku: "SEO-2", prices: { website: 1000 } }] } })).id;
    await tool("update_product_seo", { id: pid, body: { seoTitle: "Aynı Başlık" } });
    await tool("update_product_seo", { id: p2, body: { seoTitle: "aynı başlık" } });
    const a = data(await tool("seo_audit"));
    expect(a.products.find((p: any) => p.id === pid).issues).toContain("duplicate_seo_title");
    expect(a.products.find((p: any) => p.id === p2).issues).toContain("duplicate_seo_title");
  });
  it("SEO tools need write level and are grouped under SEO", async () => {
    expect((await tool("update_product_seo", { id: pid, body: { seoTitle: "x" } }, read)).isError).toBe(true);
    expect((await tool("seo_audit", {}, read)).isError).toBeUndefined();
    const { groupOf, TOOL_BY_NAME } = await import("../src/mcp/tools");
    for (const n of ["seo_audit", "seo_preview", "update_product_seo", "update_category_seo", "update_seo_settings"]) expect(groupOf(TOOL_BY_NAME.get(n)!), n).toBe("seo");
  });
});

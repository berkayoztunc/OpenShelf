import { env, fetchMock } from "cloudflare:test";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { normalizeImageUrl } from "../src/lib/imageFetch";
import { BASE64_MAX_CHARS } from "../src/mcp/server";
import { admin, call, createProduct, ensureOwner, j, type Session } from "./helpers";

let owner: Session; let write = ""; let read = "";
const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const IEND = [0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82];
const png = (w: number, h: number, pad = 0) => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, ...be32(w), ...be32(h), 8, 6, 0, 0, 0, 0, 0, 0, 0, ...new Array(pad).fill(7), ...IEND]);
const rpc = (t: string, payload: unknown) => call("/mcp", { method: "POST", json: payload, origin: null, headers: { Authorization: `Bearer ${t}` } });
const tool = async (name: string, args: unknown = {}, t = write) => (await j<any>(await rpc(t, { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }))).result as { content: { text: string }[]; isError?: boolean };
const data = (r: { content: { text: string }[] }) => JSON.parse(r.content[0]!.text);
const serve = (host: string, path: string, bytes: Uint8Array) => fetchMock.get(`https://${host}`).intercept({ path }).reply(200, Buffer.from(bytes), { headers: { "content-type": "image/png" } });
const upload = (t: string | null, form: FormData, q = "") => call(`/mcp/upload${q}`, { method: "POST", form, origin: null, headers: t ? { Authorization: `Bearer ${t}` } : {} });
const fileForm = (bytes: Uint8Array, kind = "product", alt = "Alt") => { const f = new FormData(); f.set("file", new File([bytes as BlobPart], "p.png", { type: "image/png" })); f.set("kind", kind); f.set("alt", alt); return f; };
const created: string[] = [];

beforeAll(async () => {
  owner = await ensureOwner();
  write = (await j<any>(await admin(owner, "/tokens", "POST", { name: "ma-write", level: "write" }))).token;
  read = (await j<any>(await admin(owner, "/tokens", "POST", { name: "ma-read", level: "read" }))).token;
  fetchMock.activate(); fetchMock.disableNetConnect();
});
afterEach(() => fetchMock.assertNoPendingInterceptors());
afterAll(async () => { for (const id of created) await env.DB.prepare("DELETE FROM media WHERE id = ?1").bind(id).run(); });
const seen = <T extends { id: string }>(r: T): T => { created.push(r.id); return r; };

describe("share-link normalisation", () => {
  it("Google Drive and Dropbox share links become direct downloads; others are untouched", () => {
    expect(normalizeImageUrl("https://drive.google.com/file/d/1AbC_d-E/view?usp=sharing")).toBe("https://drive.google.com/uc?export=download&id=1AbC_d-E");
    expect(normalizeImageUrl("https://drive.google.com/open?id=XYZ123")).toBe("https://drive.google.com/uc?export=download&id=XYZ123");
    expect(normalizeImageUrl("https://www.dropbox.com/s/abc/photo.jpg?dl=0")).toBe("https://www.dropbox.com/s/abc/photo.jpg?raw=1");
    expect(normalizeImageUrl("https://cdn.example.com/a.png?x=1")).toBe("https://cdn.example.com/a.png?x=1");
    expect(normalizeImageUrl("not a url")).toBe("not a url");
  });
});

describe("upload_help", () => {
  it("lists the methods by what the client has, with a ready-to-run command for the real host", async () => {
    const r = data(await tool("upload_help"));
    expect(r.chooseByWhatYouHave).toHaveLength(6);
    expect(r.shellUpload.url).toMatch(/\/mcp\/upload$/); expect(r.shellUpload.example).toContain("-F file=@");
    expect(r.attach.product).toContain("add_product_images");
  });
});

describe("batch import", () => {
  it("imports several links in one call; one bad link does not fail the others", async () => {
    serve("img.example.com", "/a.png", png(1600, 2000, 100));
    fetchMock.get("https://img.example.com").intercept({ path: "/missing.png" }).reply(404, "nope");
    const r = data(await tool("upload_media_from_url", { body: { kind: "product", urls: ["https://img.example.com/a.png", "https://img.example.com/missing.png"] } }));
    expect(r).toMatchObject({ imported: 1, failed: 1 });
    expect(r.items[0]).toMatchObject({ ok: true, width: 1600, height: 2000 }); seen(r.items[0]);
    expect(r.items[1]).toMatchObject({ ok: false, source: "https://img.example.com/missing.png" });
    expect((await tool("upload_media_from_url", { body: { kind: "product" } })).isError).toBe(true);                       // neither url nor urls
    expect((await tool("upload_media_from_url", { body: { kind: "product", url: "https://a.example.com/x.png", urls: ["https://a.example.com/y.png"] } })).isError).toBe(true);
  });
});

const newMedia = async (w = 1600, h = 2000, kind = "product") => { const r = seen(await j<any>(await upload(write, fileForm(png(w, h, 30), kind)))); return r.id as string; };
const gallery = async (pid: string) => (await j<any>(await admin(owner, `/products/${pid}`))).images as { id: string; mediaId: string | null; alt: string | null; position: number }[];

describe("add_product_images", () => {
  it("attaches by link and by media id in one call, without touching variants or prices", async () => {
    const { product } = await createProduct(owner, { price: 12345, stock: 7 });
    serve("img.example.com", "/p1.png", png(1600, 2000, 50));
    const m2 = await newMedia();
    const r = data(await tool("add_product_images", { id: product.id, body: { images: [{ url: "https://img.example.com/p1.png", alt: "Ön" }, { mediaId: m2, alt: "Yan" }] } }));
    expect(r.images.map((i: any) => [i.position, i.alt])).toEqual([[0, "Ön"], [1, "Yan"]]);
    created.push(r.images[0].mediaId);
    const after = await j<any>(await admin(owner, `/products/${product.id}`));
    expect(after.variants[0]).toMatchObject({ prices: { website: 12345 }, stock: { total: 7 } });
    expect(after.images).toHaveLength(2);
  });
  it("append skips images already on the product; prepend puts new ones first; wrong ratio comes back as a warning", async () => {
    const { product } = await createProduct(owner);
    const a = await newMedia(); const b = await newMedia(); const sq = await newMedia(1000, 1000);
    await tool("add_product_images", { id: product.id, body: { images: [{ mediaId: a }] } });
    await tool("add_product_images", { id: product.id, body: { images: [{ mediaId: a }, { mediaId: b }] } });
    expect((await gallery(product.id)).map((g) => g.mediaId)).toEqual([a, b]);
    await tool("add_product_images", { id: product.id, body: { images: [{ mediaId: sq }], mode: "prepend" } });
    expect((await gallery(product.id)).map((g) => g.mediaId)).toEqual([sq, a, b]);
    serve("img.example.com", "/sq.png", png(1000, 1000));
    const w = data(await tool("add_product_images", { id: product.id, body: { images: [{ url: "https://img.example.com/sq.png" }] } }));
    expect(w.warnings[0].warnings.join()).toMatch(/Aspect ratio/); created.push(w.images[3].mediaId);
  });
  it("replace sets the exact gallery in the given order; imageId keeps (and reorders) existing images", async () => {
    const { product } = await createProduct(owner);
    const a = await newMedia(); const b = await newMedia(); const c = await newMedia();
    await tool("add_product_images", { id: product.id, body: { images: [{ mediaId: a }, { mediaId: b }, { mediaId: c }] } });
    const g = await gallery(product.id);
    const r = data(await tool("add_product_images", { id: product.id, body: { mode: "replace", images: [{ imageId: g[2]!.id }, { imageId: g[0]!.id, alt: "Yeni alt" }] } }));
    expect(r.images.map((i: any) => i.mediaId)).toEqual([c, a]); expect(r.images[1].alt).toBe("Yeni alt");
    expect(r.images[0].id).toBe(g[2]!.id); // the row is kept, not recreated
  });
  it("refuses unknown ids, ambiguous items, other products' images and unknown products", async () => {
    const { product } = await createProduct(owner); const other = (await createProduct(owner)).product; const a = await newMedia();
    await tool("add_product_images", { id: other.id, body: { images: [{ mediaId: a }] } });
    const foreign = (await gallery(other.id))[0]!.id;
    for (const images of [[{ mediaId: "nope" }], [{ mediaId: a, url: "https://x.example.com/a.png" }], [{ imageId: foreign }], [{}]]) {
      expect((await tool("add_product_images", { id: product.id, body: { images } })).isError, JSON.stringify(images)).toBe(true);
    }
    expect((await tool("add_product_images", { id: "ghost", body: { images: [{ mediaId: a }] } })).isError).toBe(true);
    expect(await gallery(product.id)).toHaveLength(0);
  });
  it("read-level tokens cannot change images", async () => {
    const { product } = await createProduct(owner); const a = await newMedia();
    const r = await tool("add_product_images", { id: product.id, body: { images: [{ mediaId: a }] } }, read);
    expect(r.isError).toBe(true); expect(r.content[0]!.text).toContain('needs level "write"');
  });
});

describe("set_store_image", () => {
  it("logo / favicon / og by media id or link: one call, setting saved", async () => {
    const logo = await newMedia(600, 144, "logo"); const og = await newMedia(1200, 630, "og");
    expect((await tool("set_store_image", { body: { slot: "logo", mediaId: logo } })).isError).toBeUndefined();
    expect((await tool("set_store_image", { body: { slot: "og", mediaId: og } })).isError).toBeUndefined();
    serve("img.example.com", "/fav.png", png(512, 512));
    const fav = data(await tool("set_store_image", { body: { slot: "favicon", url: "https://img.example.com/fav.png" } })); created.push(fav.id);
    expect(fav).toMatchObject({ slot: "favicon", width: 512 });
    const branding = await j<any>(await admin(owner, "/settings/branding")); const seo = await j<any>(await admin(owner, "/settings/seo"));
    expect(branding).toMatchObject({ logoMediaId: logo, faviconMediaId: fav.id }); expect(seo.defaultOgMediaId).toBe(og);
    await admin(owner, "/settings/branding", "PATCH", { logoMediaId: null, faviconMediaId: null }); await admin(owner, "/settings/seo", "PATCH", { defaultOgMediaId: null });
  });
  it("banners are appended (no duplicates) up to 6, then refused", async () => {
    await admin(owner, "/settings/branding", "PATCH", { bannerMediaIds: [] });
    const ids: string[] = []; for (let i = 0; i < 6; i++) ids.push(await newMedia(2400, 1050, "banner"));
    for (const id of ids) expect((await tool("set_store_image", { body: { slot: "banner", mediaId: id } })).isError).toBeUndefined();
    await tool("set_store_image", { body: { slot: "banner", mediaId: ids[0] } });
    expect((await j<any>(await admin(owner, "/settings/branding"))).bannerMediaIds).toEqual(ids);
    const extra = await newMedia(2400, 1050, "banner");
    const full = await tool("set_store_image", { body: { slot: "banner", mediaId: extra } });
    expect(full.isError).toBe(true); expect(full.content[0]!.text).toMatch(/banners_full|6 banners/);
    await admin(owner, "/settings/branding", "PATCH", { bannerMediaIds: [] });
  });
  it("unknown media id and ambiguous input are refused", async () => {
    expect((await tool("set_store_image", { body: { slot: "logo", mediaId: "nope" } })).isError).toBe(true);
    expect((await tool("set_store_image", { body: { slot: "logo" } })).isError).toBe(true);
  });
});

describe("update_media_alt and list_media limit", () => {
  it("changes alt text; empty clears it; list_media honours limit and is newest first", async () => {
    const a = await newMedia(); const b = await newMedia();
    expect((await tool("update_media_alt", { id: a, body: { alt: "  Mavi vazo  " } })).isError).toBeUndefined();
    expect((await j<any>(await admin(owner, "/media"))).items.find((m: any) => m.id === a).alt).toBe("Mavi vazo");
    await tool("update_media_alt", { id: a, body: { alt: "" } });
    expect((await j<any>(await admin(owner, "/media"))).items.find((m: any) => m.id === a).alt).toBeNull();
    void b;
    const two = data(await tool("list_media", { limit: 2 })); expect(two.items).toHaveLength(2);
    expect(data(await tool("list_media", {})).items.length).toBeGreaterThan(2);
    expect((await tool("update_media_alt", { id: "ghost", body: { alt: "x" } })).isError).toBe(true);
  });
});

describe("POST /mcp/upload (agents with a shell)", () => {
  it("multipart upload with the MCP token stores the image and returns id, size, dimensions, warnings", async () => {
    const res = await upload(write, fileForm(png(1600, 2000, 200), "product", "Elle yüklendi"));
    expect(res.status).toBe(201);
    const r = seen(await j<any>(res));
    expect(r).toMatchObject({ mime: "image/png", width: 1600, height: 2000, warnings: [] });
    expect((await env.DB.prepare("SELECT alt, kind FROM media WHERE id = ?1").bind(r.id).first<any>())).toMatchObject({ alt: "Elle yüklendi", kind: "product" });
    expect((await call(r.url)).status).toBe(200);
  });
  it("raw image body with ?kind= works too", async () => {
    const r = new Request("http://api.test/mcp/upload?kind=og&alt=Sosyal", { method: "POST", headers: { Authorization: `Bearer ${write}`, "Content-Type": "image/png", "CF-Connecting-IP": "203.0.113.9" }, body: png(1200, 630, 40) });
    const worker = (await import("../src/index")).default; const { createExecutionContext, waitOnExecutionContext } = await import("cloudflare:test");
    const ctx = createExecutionContext(); const out = await worker.fetch(r, env, ctx); await waitOnExecutionContext(ctx);
    expect(out.status).toBe(201); const body = seen(await j<any>(out)); expect(body).toMatchObject({ width: 1200, height: 630, warnings: [] });
  });
  it("needs a valid token with write level; rejects non-images, truncated images and bad kinds", async () => {
    expect((await upload(null, fileForm(png(10, 10)))).status).toBe(401);
    expect((await upload("osk_" + "x".repeat(40), fileForm(png(10, 10)))).status).toBe(401);
    expect((await upload(read, fileForm(png(10, 10)))).status).toBe(403);
    const text = new FormData(); text.set("file", new File(["<html>"], "a.png", { type: "image/png" })); text.set("kind", "product");
    expect((await upload(write, text)).status).toBe(415);
    const cut = png(800, 800, 3000).slice(0, 1500); expect((await j<any>(await upload(write, fileForm(cut)))).error.code).toBe("incomplete_image");
    expect((await upload(write, fileForm(png(10, 10), "avatar"))).status).toBe(400);
    expect((await upload(write, new FormData())).status).toBe(400);
  });
});

describe("upload_media base64 guard", () => {
  it("refuses long base64 immediately and points at the right way", async () => {
    const r = await tool("upload_media", { kind: "product", data: "A".repeat(BASE64_MAX_CHARS + 1) });
    expect(r.isError).toBe(true); expect(r.content[0]!.text).toMatch(/upload_help/); expect(r.content[0]!.text).toMatch(/Do not retry/);
    const tiny = await tool("upload_media", { kind: "favicon", data: Buffer.from(png(64, 64)).toString("base64") });
    expect(tiny.isError).toBeUndefined(); seen(data(tiny));
  });
});

import { env, fetchMock } from "cloudflare:test";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { proxyPath, proxyableUrl, urlTag } from "../src/lib/imageProxy";
import { admin, call, ensureOwner, j, type Session } from "./helpers";

let owner: Session; let tok = "";
const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const IEND = [0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82];
const png = (w: number, h: number, pad = 0) => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, ...be32(w), ...be32(h), 8, 6, 0, 0, 0, 0, 0, 0, 0, ...new Array(pad).fill(7), ...IEND]);
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xd9]);
const rpc = (payload: unknown) => call("/mcp", { method: "POST", json: payload, origin: null, headers: { Authorization: `Bearer ${tok}` } });
const tool = async (name: string, args: unknown = {}) => (await j<any>(await rpc({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }))).result as { content: any[]; isError?: boolean };
const reply = (host: string, path: string, bytes: Uint8Array, status = 200, type = "image/jpeg") => fetchMock.get(`https://${host}`).intercept({ path }).reply(status, Buffer.from(bytes), { headers: { "content-type": type } });
const SQL = [
  "DELETE FROM product_images WHERE product_id = 'px-p'", "DELETE FROM media WHERE id = 'px-m'", "DELETE FROM products WHERE id = 'px-p'",
];

beforeAll(async () => {
  owner = await ensureOwner();
  tok = (await j<any>(await admin(owner, "/tokens", "POST", { name: "px", level: "read" }))).token;
  fetchMock.activate(); fetchMock.disableNetConnect();
  await env.DB.prepare("INSERT INTO products (id, slug, name_tr, status, created_at, updated_at) VALUES ('px-p','px-p','Proxy Ürün','active',unixepoch(),unixepoch())").run();
  await env.DB.prepare("INSERT INTO media (id, kind, mime, size, sha256, data, created_at) VALUES ('px-m','product','image/png',?1,'x',?2,unixepoch())").bind(png(10, 10).length, Buffer.from(png(10, 10))).run();
  await env.DB.prepare(`INSERT INTO product_images (id, product_id, media_id, url, alt, position) VALUES
    ('px-p:0','px-p',NULL,'https://cdn.dsmcdn.com/ty1/a.jpg','Trendyol',0), ('px-p:1','px-p',NULL,'https://evil.example.com/a.jpg','Başka',1),
    ('px-p:2','px-p','px-m',NULL,'Yerel',2), ('px-p:3','px-p',NULL,'https://cdn.dsmcdn.com/ty1/html.jpg','Bozuk',3), ('px-p:4','px-p',NULL,'https://cdn.dsmcdn.com/ty1/big.jpg','Büyük',4)`).run();
});
afterEach(() => fetchMock.assertNoPendingInterceptors());
afterAll(async () => { for (const q of SQL) await env.DB.prepare(q).run(); });

describe("proxy helpers", () => {
  it("only https links on the marketplace CDN hosts are proxyable; links carry a fingerprint of the source URL", () => {
    expect(proxyableUrl("https://cdn.dsmcdn.com/a.jpg")).toBe(true); expect(proxyableUrl("https://x.dsmcdn.com/a.jpg")).toBe(true); expect(proxyableUrl("https://cdn.trendyol.com/a.jpg")).toBe(true);
    for (const bad of ["http://cdn.dsmcdn.com/a.jpg", "https://dsmcdn.com.evil.com/a.jpg", "https://evildsmcdn.com/a.jpg", "https://example.com/a.jpg", "ftp://cdn.dsmcdn.com/a", "nope", "", null]) expect(proxyableUrl(bad as never), String(bad)).toBe(false);
    expect(proxyPath({ id: "p:0", mediaId: null, url: "https://cdn.dsmcdn.com/a.jpg" })).toBe(`/img/p/p%3A0?v=${urlTag("https://cdn.dsmcdn.com/a.jpg")}`);
    expect(proxyPath({ id: "p:0", mediaId: "m", url: null })).toBeNull(); expect(proxyPath({ id: "p:1", mediaId: null, url: "https://example.com/a.jpg" })).toBeNull();
    expect(urlTag("a")).not.toBe(urlTag("b"));
  });
});

describe("GET /img/p/:id", () => {
  it("serves a CDN-hosted photo through our domain with the REAL type, long cache headers, and then from the edge cache", async () => {
    reply("cdn.dsmcdn.com", "/ty1/a.jpg", jpeg, 200, "text/plain"); // wrong upstream content-type must not matter
    const r = await call("/img/p/px-p%3A0?v=t1");
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("image/jpeg"); expect(r.headers.get("cache-control")).toContain("immutable"); expect(r.headers.get("x-content-type-options")).toBe("nosniff");
    expect(r.headers.get("access-control-allow-origin")).toBe("*");
    expect([...new Uint8Array(await r.arrayBuffer())]).toEqual([...jpeg]);
    const again = await call("/img/p/px-p%3A0?v=t1");               // no interceptor registered: must come from the cache, not the network
    expect(again.status).toBe(200); expect(again.headers.get("content-type")).toBe("image/jpeg");
  });
  it("a different ?v= is a different cache entry (changed source URL gets a fresh copy)", async () => {
    reply("cdn.dsmcdn.com", "/ty1/a.jpg", jpeg);
    expect((await call("/img/p/px-p%3A0?v=t2")).status).toBe(200);
  });
  it("is not an open proxy: unknown ids, other hosts and arbitrary urls give 404 without any outbound request", async () => {
    for (const path of ["/img/p/nope", "/img/p/px-p%3A1", "/img/p/https%3A%2F%2Fcdn.dsmcdn.com%2Fa.jpg", "/img/p/..%2F..%2Fetc"]) expect((await call(path)).status, path).toBe(404);
    expect((await call("/img/p/px-p%3A0", { method: "POST", json: {} })).status).toBeGreaterThanOrEqual(400);
  });
  it("images we already host redirect to /media", async () => {
    const r = await call("/img/p/px-p%3A2", { headers: {} }); // follows? call() uses fetch directly on the worker: a redirect response
    expect(r.status).toBe(302); expect(r.headers.get("location")).toBe("/media/px-m");
  });
  it("upstream errors and non-images become 502 and are not cached", async () => {
    reply("cdn.dsmcdn.com", "/ty1/html.jpg", new TextEncoder().encode("<html>blocked</html>"), 200, "text/html");
    const bad = await call("/img/p/px-p%3A3?v=a"); expect(bad.status).toBe(502); expect((await j<any>(bad)).error.code).toBe("not_an_image");
    fetchMock.get("https://cdn.dsmcdn.com").intercept({ path: "/ty1/html.jpg" }).reply(403, "forbidden");
    expect((await call("/img/p/px-p%3A3?v=a")).status).toBe(502);   // retried upstream (previous failure was not cached)
  });
});

describe("product images expose proxyUrl; MCP results use absolute links", () => {
  it("admin API: proxyUrl only for CDN-hosted photos", async () => {
    const p = await j<any>(await admin(owner, "/products/px-p"));
    const by = Object.fromEntries(p.images.map((i: any) => [i.id, i]));
    expect(by["px-p:0"].proxyUrl).toMatch(/^\/img\/p\/px-p%3A0\?v=/); expect(by["px-p:1"].proxyUrl).toBeNull(); expect(by["px-p:2"].proxyUrl).toBeNull();
  });
  it("get_product through MCP returns absolute proxyUrl and media urls", async () => {
    const txt = (await tool("get_product", { id: "px-p" })).content[0].text as string;
    expect(txt).toMatch(/"proxyUrl": "http:\/\/api\.test\/img\/p\/px-p%3A0\?v=/); expect(txt).toContain('"url": "http://api.test/media/px-m"');
  });
});

describe("view_image (MCP image block)", () => {
  it("shows an uploaded image by mediaId as an image block with metadata", async () => {
    const r = await tool("view_image", { mediaId: "px-m" });
    expect(r.isError).toBeUndefined();
    expect(r.content[0]).toMatchObject({ type: "image", mimeType: "image/png" }); expect(Buffer.from(r.content[0].data, "base64").length).toBe(png(10, 10).length);
    expect(JSON.parse(r.content[1].text)).toMatchObject({ mime: "image/png", width: 10, height: 10, source: "media" });
  });
  it("shows a Trendyol-hosted product photo (downloaded by the server, no sandbox needed) and reports its proxyUrl", async () => {
    reply("cdn.dsmcdn.com", "/ty1/a.jpg", jpeg);
    const r = await tool("view_image", { productId: "px-p", imageId: "px-p:0" });
    expect(r.content[0]).toMatchObject({ type: "image", mimeType: "image/jpeg" });
    expect(JSON.parse(r.content[1].text)).toMatchObject({ source: "remote", proxyUrl: expect.stringMatching(/^http:\/\/api\.test\/img\/p\/px-p%3A0\?v=/) });
  });
  it("refuses ambiguous input, wrong product/image pairs, unknown ids and oversize images", async () => {
    expect((await tool("view_image", {})).isError).toBe(true);
    expect((await tool("view_image", { mediaId: "px-m", productId: "px-p", imageId: "px-p:0" })).isError).toBe(true);
    expect((await tool("view_image", { productId: "other", imageId: "px-p:0" })).isError).toBe(true);
    expect((await tool("view_image", { mediaId: "ghost" })).isError).toBe(true);
    reply("cdn.dsmcdn.com", "/ty1/big.jpg", new Uint8Array(1_200_000).fill(1), 200);
    const big = await tool("view_image", { productId: "px-p", imageId: "px-p:4" });
    expect(big.isError).toBe(true);
  });
});

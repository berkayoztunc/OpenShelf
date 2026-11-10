import { env, fetchMock } from "cloudflare:test";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { blockedHost, checkImportUrl, fetchImageBytes } from "../src/lib/imageFetch";
import { admin, call, ensureOwner, j, loginAs, type Session } from "./helpers";

let owner: Session; let tok = "";
const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const IEND = [0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82];
const png = (w: number, h: number, pad = 0) => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, ...be32(w), ...be32(h), 8, 6, 0, 0, 0, 0, 0, 0, 0, ...new Array(pad).fill(7), ...IEND]);
const rpc = (payload: unknown) => call("/mcp", { method: "POST", json: payload, origin: null, headers: { Authorization: `Bearer ${tok}` } });
const tool = async (name: string, args: unknown = {}) => (await j<any>(await rpc({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }))).result as { content: { text: string }[]; isError?: boolean };
const data = (r: { content: { text: string }[] }) => JSON.parse(r.content[0]!.text);

beforeAll(async () => {
  owner = await ensureOwner();
  tok = (await j<any>(await admin(owner, "/tokens", "POST", { name: "img-import", level: "write" }))).token;
  fetchMock.activate(); fetchMock.disableNetConnect();
});
afterEach(() => fetchMock.assertNoPendingInterceptors());

describe("SSRF guard", () => {
  it("only public https hosts on the default port, no credentials", () => {
    expect(checkImportUrl("https://img.example.com/a.png").host).toBe("img.example.com");
    for (const bad of ["http://img.example.com/a.png", "https://localhost/a.png", "https://127.0.0.1/a.png", "https://[::1]/a.png", "https://10.0.0.5/a.png", "https://169.254.169.254/latest/meta-data", "https://2130706433/a.png", "https://0x7f000001/a.png",
      "https://intranet/a.png", "https://db.internal/a.png", "https://printer.local/a.png", "https://user:pw@img.example.com/a.png", "https://img.example.com:8443/a.png", "ftp://img.example.com/a.png", "not a url", "file:///etc/passwd", "https://metadata.google.internal/x"]) {
      expect(() => checkImportUrl(bad), bad).toThrow();
    }
    expect(blockedHost("cdn.example.com")).toBe(false); expect(blockedHost("localhost.")).toBe(true);
  });
  it("redirects are followed but every hop is validated; too many redirects fail", async () => {
    const fake = (map: Record<string, Response>) => (async (u: string) => map[u] ?? new Response("nope", { status: 404 })) as unknown as typeof fetch;
    const ok = await fetchImageBytes("https://a.example.com/x", 1000, fake({ "https://a.example.com/x": new Response(null, { status: 302, headers: { Location: "https://b.example.com/y" } }), "https://b.example.com/y": new Response(new Uint8Array([1, 2, 3])) }));
    expect([...ok]).toEqual([1, 2, 3]);
    await expect(fetchImageBytes("https://a.example.com/x", 1000, fake({ "https://a.example.com/x": new Response(null, { status: 302, headers: { Location: "http://169.254.169.254/latest" } }) }))).rejects.toThrow(/https|not allowed/i);
    await expect(fetchImageBytes("https://a.example.com/x", 1000, fake({ "https://a.example.com/x": new Response(null, { status: 302, headers: { Location: "https://a.example.com/x" } }) }))).rejects.toThrow(/redirects/);
  });
  it("size cap is enforced while streaming and by content-length; non-200 and network errors are readable", async () => {
    const big = new Response(new Uint8Array(5000));
    await expect(fetchImageBytes("https://a.example.com/x", 1000, (async () => big) as unknown as typeof fetch)).rejects.toThrow(/larger than/);
    await expect(fetchImageBytes("https://a.example.com/x", 1000, (async () => new Response("x", { headers: { "content-length": "99999" } })) as unknown as typeof fetch)).rejects.toThrow(/larger than/);
    await expect(fetchImageBytes("https://a.example.com/x", 1000, (async () => new Response("x", { status: 500 })) as unknown as typeof fetch)).rejects.toThrow(/HTTP 500/);
    await expect(fetchImageBytes("https://a.example.com/x", 1000, (async () => { throw new Error("boom"); }) as unknown as typeof fetch)).rejects.toThrow(/Could not download/);
  });
});

describe("upload_media_from_url (MCP)", () => {
  it("downloads a FULL-size image server-side and reports size, dimensions and fit warnings", async () => {
    const img = png(1600, 2000, 80_000); // ~80 KB: more than a chat client can type as base64
    fetchMock.get("https://img.example.com").intercept({ path: "/product.png" }).reply(200, Buffer.from(img), { headers: { "content-type": "image/png" } });
    const r = data(await tool("upload_media_from_url", { body: { kind: "product", url: "https://img.example.com/product.png", alt: "Vazo" } }));
    expect(r).toMatchObject({ mime: "image/png", size: img.length, width: 1600, height: 2000, warnings: [] });
    const stored = await env.DB.prepare("SELECT size, alt, kind FROM media WHERE id = ?1").bind(r.id).first<any>();
    expect(stored).toMatchObject({ size: img.length, alt: "Vazo", kind: "product" });
    expect((await call(r.url)).status).toBe(200);
  });
  it("wrong ratio comes back as a warning; non-images, oversize and bad URLs are refused", async () => {
    fetchMock.get("https://img.example.com").intercept({ path: "/square.png" }).reply(200, Buffer.from(png(1000, 1000)));
    expect(data(await tool("upload_media_from_url", { body: { kind: "product", url: "https://img.example.com/square.png" } })).warnings.join()).toMatch(/Aspect ratio/);
    fetchMock.get("https://img.example.com").intercept({ path: "/page.html" }).reply(200, "<html>not an image</html>");
    const html = await tool("upload_media_from_url", { body: { kind: "product", url: "https://img.example.com/page.html" } });
    expect(html.isError).toBe(true); expect(html.content[0]!.text).toMatch(/HTTP 415/);
    fetchMock.get("https://img.example.com").intercept({ path: "/huge.png" }).reply(200, Buffer.from(png(10, 10, 2 * 1024 * 1024))); // > 512KB favicon limit (D1) / ok under R2 5MB
    const huge = await tool("upload_media_from_url", { body: { kind: "favicon", url: "https://img.example.com/huge.png" } });
    if (!(env as unknown as { MEDIA?: unknown }).MEDIA) { expect(huge.isError).toBe(true); expect(huge.content[0]!.text).toMatch(/HTTP 413/); }
    for (const url of ["http://img.example.com/a.png", "https://127.0.0.1/a.png", "https://169.254.169.254/x.png"]) {
      const r = await tool("upload_media_from_url", { body: { kind: "product", url } });
      expect(r.isError, url).toBe(true); expect(r.content[0]!.text, url).toMatch(/HTTP 400|Invalid arguments/);
    }
    fetchMock.get("https://img.example.com").intercept({ path: "/gone.png" }).reply(404, "nope");
    expect((await tool("upload_media_from_url", { body: { kind: "product", url: "https://img.example.com/gone.png" } })).content[0]!.text).toMatch(/HTTP 502/);
  });
  it("a read token cannot import; tool descriptions steer the AI away from big base64", async () => {
    const rt = (await j<any>(await admin(owner, "/tokens", "POST", { name: "r", level: "read" }))).token;
    const res = (await j<any>(await call("/mcp", { method: "POST", json: { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "upload_media_from_url", arguments: { body: { kind: "product", url: "https://img.example.com/a.png" } } } }, origin: null, headers: { Authorization: `Bearer ${rt}` } }))).result;
    expect(res.isError).toBe(true);
    const list = (await j<any>(await rpc({ jsonrpc: "2.0", id: 2, method: "tools/list" }))).result.tools;
    expect(list.find((t: any) => t.name === "upload_media").description).toMatch(/ONLY for small images/);
    expect(list.find((t: any) => t.name === "upload_media_from_url").description).toMatch(/BEST WAY/);
    expect(list.map((t: any) => t.name)).not.toContain("create_upload_link"); // no public upload links
  });
});

describe("existing multipart upload still works", () => {
  it("POST /media multipart goes through the shared store path (warnings included)", async () => {
    const fd = new FormData(); fd.set("kind", "product"); fd.set("file", new File([png(1600, 2000) as never], "p.png", { type: "image/png" })); fd.set("alt", "x");
    const r = await call("/api/admin/media", { method: "POST", form: fd, cookie: owner.cookie, csrf: owner.csrf, ip: owner.ip });
    expect(r.status).toBe(201); expect(await j<any>(r)).toMatchObject({ width: 1600, height: 2000, warnings: [] });
  });
});

describe("truncated images are rejected (what chat clients produce from long base64)", () => {
  const cut = (b: Uint8Array, n: number) => b.slice(0, n);
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc0, 0, 17, 8, 3, 232, 2, 88, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1, 0xff, 0xd9]);
  const gif = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 10, 0, 10, 0, 0, 0, 0, 0x3b]);
  const webp = (() => { const b = new Uint8Array(40); b.set([0x52, 0x49, 0x46, 0x46, 32, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x58, 10, 0, 0, 0, 0, 0, 0, 0], 0); return b; })();
  it("isCompleteImage: complete files pass, cut-off files fail (png/jpeg/gif/webp)", async () => {
    const { isCompleteImage } = await import("@openshelf/shared");
    for (const [name, full] of Object.entries({ png: png(300, 400, 500), jpeg, gif, webp })) {
      expect(isCompleteImage(full), `${name} full`).toBe(true);
      expect(isCompleteImage(cut(full, Math.floor(full.length / 2))), `${name} half`).toBe(false);
    }
    expect(isCompleteImage(png(10, 10).slice(0, 33))).toBe(false); // header only (the 60-byte "logo" from the bug report)
    expect(isCompleteImage(new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66, 1, 2, 3, 4]))).toBe(true); // avif: assumed complete
  });
  it("upload_media (base64) refuses a cut-off image with guidance instead of storing a broken file", async () => {
    const half = cut(png(1600, 2000, 60_000), 700);
    const r = await tool("upload_media", { kind: "product", data: btoa(String.fromCharCode(...half)) });
    expect(r.isError).toBe(true); expect(r.content[0]!.text).toMatch(/HTTP 422/); expect(r.content[0]!.text).toMatch(/incomplete/); expect(r.content[0]!.text).toMatch(/upload_media_from_url/);
    const before = (await env.DB.prepare("SELECT COUNT(*) AS n FROM media").first<any>()).n;
    await tool("upload_media", { kind: "product", data: btoa(String.fromCharCode(...half)) });
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM media").first<any>()).n).toBe(before); // nothing stored
  });
  it("a truncated file is refused on the URL import and the multipart upload too", async () => {
    fetchMock.get("https://img.example.com").intercept({ path: "/cut.png" }).reply(200, Buffer.from(cut(png(1600, 2000, 5000), 900)));
    expect((await tool("upload_media_from_url", { body: { kind: "product", url: "https://img.example.com/cut.png" } })).content[0]!.text).toMatch(/HTTP 422/);
    const fd = new FormData(); fd.set("kind", "product"); fd.set("file", new File([cut(png(1600, 2000, 5000), 900) as never], "p.png", { type: "image/png" }));
    expect((await call("/api/admin/media", { method: "POST", form: fd, cookie: owner.cookie, csrf: owner.csrf, ip: owner.ip })).status).toBe(422);
  });
});

describe("list_media flags truncated-looking uploads", () => {
  it("very small non-favicon files are marked suspect; normal ones are not", async () => {
    const fd = (kind: string, bytes: Uint8Array) => { const f = new FormData(); f.set("kind", kind); f.set("file", new File([bytes as never], "x.png", { type: "image/png" })); return f; };
    const small = await j<any>(await call("/api/admin/media", { method: "POST", form: fd("product", png(1600, 2000)), cookie: owner.cookie, csrf: owner.csrf, ip: owner.ip }));
    const big = await j<any>(await call("/api/admin/media", { method: "POST", form: fd("product", png(1600, 2000, 3000)), cookie: owner.cookie, csrf: owner.csrf, ip: owner.ip }));
    const list = data(await tool("list_media", { kind: "product" })).items;
    expect(list.find((m: any) => m.id === small.id).suspect).toMatch(/truncated/);
    expect(list.find((m: any) => m.id === big.id).suspect).toBeUndefined();
  });
});

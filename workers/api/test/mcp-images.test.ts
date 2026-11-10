import { beforeAll, describe, expect, it } from "vitest";
import { IMAGE_SPECS, MEDIA_KINDS, checkImage, imageSize } from "@openshelf/shared";
import { admin, call, ensureOwner, j, type Session } from "./helpers";

let owner: Session; let tok = "";
const rpc = (payload: unknown) => call("/mcp", { method: "POST", json: payload, origin: null, headers: { Authorization: `Bearer ${tok}` } });
const tool = async (name: string, args: unknown = {}) => (await j<any>(await rpc({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }))).result as { content: { text: string }[]; isError?: boolean };

/* tiny synthetic images: only headers matter for sniffing/dimension reading */
const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const le16 = (n: number) => [n & 255, (n >> 8) & 255];
const IEND = [0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82];
const png = (w: number, h: number) => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, ...be32(w), ...be32(h), 8, 6, 0, 0, 0, 0, 0, 0, 0, ...IEND]);
const gif = (w: number, h: number) => new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, ...le16(w), ...le16(h), 0, 0, 0, 0x3b]);
const jpeg = (w: number, h: number) => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc0, 0, 17, 8, (h >> 8) & 255, h & 255, (w >> 8) & 255, w & 255, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1, 0xff, 0xd9]);
const webpVp8x = (w: number, h: number) => { const b = new Uint8Array(40); b.set([0x52, 0x49, 0x46, 0x46, 32, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x58, 10, 0, 0, 0, 0, 0, 0, 0], 0); b.set([(w - 1) & 255, ((w - 1) >> 8) & 255, ((w - 1) >> 16) & 255, (h - 1) & 255, ((h - 1) >> 8) & 255, ((h - 1) >> 16) & 255], 24); return b; };
const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));

beforeAll(async () => {
  owner = await ensureOwner();
  tok = (await j<any>(await admin(owner, "/tokens", "POST", { name: "img", level: "write" }))).token;
});

describe("image specs", () => {
  it("every media kind has a complete, sane spec", () => {
    for (const k of MEDIA_KINDS) {
      const s = IMAGE_SPECS[k];
      expect(s.kind).toBe(k); expect(s.width).toBeGreaterThanOrEqual(s.minWidth); expect(s.height).toBeGreaterThanOrEqual(s.minHeight);
      for (const f of [s.usage, s.guidance, s.attach]) expect(f.length).toBeGreaterThan(30);
      expect(s.aspect.length).toBeGreaterThan(3);
    }
    expect(IMAGE_SPECS.product).toMatchObject({ width: 1600, height: 2000 });
    expect(IMAGE_SPECS.og).toMatchObject({ width: 1200, height: 630 });
    expect(IMAGE_SPECS.favicon).toMatchObject({ width: 512, height: 512, transparent: true });
  });
  it("reads dimensions of png, gif, jpeg and webp; null for junk", () => {
    expect(imageSize(png(1600, 2000))).toEqual({ width: 1600, height: 2000 });
    expect(imageSize(gif(320, 200))).toEqual({ width: 320, height: 200 });
    expect(imageSize(jpeg(1200, 630))).toEqual({ width: 1200, height: 630 });
    expect(imageSize(webpVp8x(2400, 1050))).toEqual({ width: 2400, height: 1050 });
    expect(imageSize(new Uint8Array([1, 2, 3]))).toBeNull();
    expect(imageSize(new Uint8Array(0))).toBeNull();
  });
  it("checkImage: right size passes; wrong ratio / too small / non-square favicon / odd logo warn", () => {
    expect(checkImage("product", 1600, 2000)).toEqual([]);
    expect(checkImage("product", 1200, 1500)).toEqual([]); // same ratio, smaller but above the minimum
    expect(checkImage("product", 1000, 1000).join()).toMatch(/Aspect ratio/);
    expect(checkImage("product", 400, 500).join()).toMatch(/Too small/);
    expect(checkImage("banner", 2400, 1050)).toEqual([]);
    expect(checkImage("banner", 1200, 1200).join()).toMatch(/Aspect ratio/);
    expect(checkImage("og", 1200, 630)).toEqual([]);
    expect(checkImage("favicon", 512, 512)).toEqual([]);
    expect(checkImage("favicon", 512, 256).join()).toMatch(/square/);
    expect(checkImage("logo", 600, 144)).toEqual([]);
    expect(checkImage("logo", 600, 60).join()).toMatch(/unusual/);
  });
});

describe("MCP image tools", () => {
  it("get_image_specs returns every kind with the limits in force", async () => {
    const r = await tool("get_image_specs");
    expect(r.isError).toBeUndefined();
    const d = JSON.parse(r.content[0]!.text);
    expect(d.kinds.map((k: any) => k.kind).sort()).toEqual([...MEDIA_KINDS].sort());
    const product = d.kinds.find((k: any) => k.kind === "product");
    expect(product).toMatchObject({ width: 1600, height: 2000, maxKB: expect.any(Number) });
    expect(product.guidance).toContain("No text");
    expect(d.storage).toMatch(/^(r2|d1)$/); expect(d.general.formats).toContain("webp");
    // it is a read tool: visible with a read token, and documented in the tool description
    const rt = (await j<any>(await admin(owner, "/tokens", "POST", { name: "r", level: "read" }))).token;
    const list = (await j<any>(await call("/mcp", { method: "POST", json: { jsonrpc: "2.0", id: 1, method: "tools/list" }, origin: null, headers: { Authorization: `Bearer ${rt}` } }))).result.tools;
    expect(list.map((t: any) => t.name)).toContain("get_image_specs"); expect(list.map((t: any) => t.name)).not.toContain("upload_media");
    expect(list.find((t: any) => t.name === "get_image_specs").description).toContain("before generating");
  });

  it("upload_media stores the image and reports size + fit warnings", async () => {
    const ok = JSON.parse((await tool("upload_media", { kind: "product", data: b64(png(1600, 2000)), filename: "p.png", alt: "Kırmızı vazo" })).content[0]!.text);
    expect(ok).toMatchObject({ mime: "image/png", width: 1600, height: 2000, warnings: [] }); expect(ok.url).toMatch(/^\/media\//);
    const square = JSON.parse((await tool("upload_media", { kind: "product", data: b64(png(1000, 1000)) })).content[0]!.text);
    expect(square.warnings.join()).toMatch(/Aspect ratio/);
    const small = JSON.parse((await tool("upload_media", { kind: "favicon", data: b64(png(16, 16)) })).content[0]!.text);
    expect(small.warnings.join()).toMatch(/Too small/);
    const wp = JSON.parse((await tool("upload_media", { kind: "banner", data: b64(webpVp8x(2400, 1050)), filename: "b.webp" })).content[0]!.text);
    expect(wp).toMatchObject({ mime: "image/webp", width: 2400, height: 1050, warnings: [] });
    const list = await j<any>(await admin(owner, "/media?kind=product"));
    expect(list.items.some((m: any) => m.id === ok.id)).toBe(true);
    // served publicly
    expect((await call(ok.url)).status).toBe(200);
  });

  it("rejects non-images, SVG, bad base64 and unknown kinds with readable errors", async () => {
    const svg = await tool("upload_media", { kind: "logo", data: btoa('<svg xmlns="http://www.w3.org/2000/svg"></svg>') });
    expect(svg.isError).toBe(true); expect(svg.content[0]!.text).toMatch(/HTTP 415/);
    const junk = await tool("upload_media", { kind: "product", data: btoa("this is not an image at all ......") });
    expect(junk.isError).toBe(true);
    const bad = await tool("upload_media", { kind: "product", data: "!!!not base64!!!!!!!!!!!!" });
    expect(bad.isError).toBe(true); expect(bad.content[0]!.text).toContain("base64");
    expect((await tool("upload_media", { kind: "poster", data: b64(png(10, 10)) })).isError).toBe(true);
  });

  it("generate_product_images prompt and guide mention the image workflow", async () => {
    const p = await j<any>(await rpc({ jsonrpc: "2.0", id: 2, method: "prompts/get", params: { name: "generate_product_images" } }));
    expect(p.result.messages[0].content.text).toContain("get_image_specs");
    const g = await j<any>(await rpc({ jsonrpc: "2.0", id: 3, method: "resources/read", params: { uri: "openshelf://guide" } }));
    expect(g.result.contents[0].text).toContain("get_image_specs");
  });
});

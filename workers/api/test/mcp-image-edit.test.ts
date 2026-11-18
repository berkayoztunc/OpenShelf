import { beforeAll, describe, expect, it } from "vitest";
import { admin, call, ensureOwner, j, type Session } from "./helpers";
import { buildEditBrief, detectCategory, resizePlan } from "../src/mcp/imageEdit";

let owner: Session; let tok = "";
const rpc = (payload: unknown) => call("/mcp", { method: "POST", json: payload, origin: null, headers: { Authorization: `Bearer ${tok}` } });
const tool = async (name: string, args: unknown = {}) => (await j<any>(await rpc({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }))).result as { content: { text: string }[]; isError?: boolean };
const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const png = (w: number, h: number) => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, ...be32(w), ...be32(h), 8, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);
const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));

beforeAll(async () => {
  owner = await ensureOwner();
  tok = (await j<any>(await admin(owner, "/tokens", "POST", { name: "edit", level: "write" }))).token;
});

describe("image edit helpers", () => {
  it("resize plan: uniform contain into 1600×2000, extends the right sides, flags tiny sources", () => {
    const sq = resizePlan(1200, 1200);
    expect(sq).toMatchObject({ scale: 1.3333, scaledWidth: 1600, scaledHeight: 1600, extend: "top_bottom", quality: "upscaled", pad: { top: 200, bottom: 200, left: 0, right: 0 } });
    expect(resizePlan(1000, 2000)).toMatchObject({ extend: "left_right", scaledWidth: 1000, scaledHeight: 2000, quality: "ok" });
    expect(resizePlan(3200, 4000)).toMatchObject({ extend: "none", scale: 0.5, quality: "ok" });
    expect(resizePlan(300, 300).quality).toBe("too_small");
  });
  it("detects bags and other categories from Turkish names", () => {
    expect(detectCategory("Kadın Deri Omuz Çantası")).toBe("bag");
    expect(detectCategory("Hakiki Deri Cüzdan")).toBe("bag");
    expect(detectCategory("Erkek Sneaker Ayakkabı")).toBe("shoes");
    expect(detectCategory("Gümüş Kolye")).toBe("jewelry");
    expect(detectCategory("Basic Tişört")).toBe("apparel");
    expect(detectCategory("Seramik Şey")).toBe("other");
  });
  it("bag brief keeps straps, hardware and logos and forbids resizing by the model", () => {
    const b = buildEditBrief({ category: "bag", goal: "white_background", productName: "Omuz Çantası", colors: ["Taba"] });
    expect(b.imagePrompt).toMatch(/straps/); expect(b.imagePrompt).toMatch(/hardware/); expect(b.imagePrompt).toMatch(/Taba/);
    expect(b.resizeRule.join(" ")).toMatch(/in CODE/);
    expect(b.negativePrompt).toMatch(/cut-off strap/);
  });
});

describe("get_image_edit_kit (MCP only)", () => {
  it("returns images with measured size, resize plan and the brief; the admin panel cannot call it", async () => {
    const up = JSON.parse((await tool("upload_media", { kind: "product", data: b64(png(1200, 1200)), filename: "c.png" })).content[0]!.text);
    const pr = await admin(owner, "/products", "POST", { slug: `canta-${Date.now()}`, nameTr: "Deri Omuz Çantası", brand: "Marka", status: "draft",
      variants: [{ sku: `CNT-${Date.now()}`, position: 0, active: true, options: { Renk: "Siyah" }, prices: { website: 99900 }, stock: { total: 3 } }], images: [{ mediaId: up.id, alt: "çanta", position: 0 }] });
    expect(pr.status).toBe(201);
    const productId = (await j<any>(pr)).id;

    const r = await tool("get_image_edit_kit", { productId });
    expect(r.isError).toBeFalsy();
    const kit = JSON.parse(r.content[0]!.text);
    expect(kit).toMatchObject({ editCategory: "bag", detected: true, goal: "white_background", product: { colors: ["Siyah"] } });
    expect(kit.images[0]).toMatchObject({ width: 1200, height: 1200, resizePlan: { extend: "top_bottom", pad: { top: 200, bottom: 200 } } });
    expect(kit.brief.imagePrompt).toMatch(/Siyah/);
    expect(kit.resizeScript).toMatch(/LANCZOS/);

    const g = JSON.parse((await tool("get_image_edit_kit", { productId, category: "jewelry", goal: "lifestyle" })).content[0]!.text);
    expect(g).toMatchObject({ editCategory: "jewelry", detected: false, goal: "lifestyle" });

    expect((await admin(owner, `/media/edit-kit?productId=${productId}`)).status).toBe(404);
  });

  it("prompts: list with arguments; get renders the brief for the requested category", async () => {
    const pl = await j<any>(await rpc({ jsonrpc: "2.0", id: 2, method: "prompts/list" }));
    const edit = pl.result.prompts.find((p: any) => p.name === "edit_product_images");
    expect(edit.arguments.map((a: any) => a.name)).toEqual(["productId", "category", "goal", "background"]);
    const g = await j<any>(await rpc({ jsonrpc: "2.0", id: 3, method: "prompts/get", params: { name: "edit_product_images", arguments: { productId: "p1", category: "bag" } } }));
    expect(g.result.messages[0].content.text).toMatch(/get_image_edit_kit productId=p1 category=bag goal=white_background/);
    const rules = await j<any>(await rpc({ jsonrpc: "2.0", id: 4, method: "prompts/get", params: { name: "image_edit_rules", arguments: { category: "bag", goal: "light_grey_background" } } }));
    const txt = rules.result.messages[0].content.text as string;
    expect(txt).toMatch(/1600×2000/); expect(txt).toMatch(/handles and straps/); expect(txt).toMatch(/#F4F4F2/); expect(txt).toMatch(/QA checklist/);
    // prompts without arguments still work
    expect((await j<any>(await rpc({ jsonrpc: "2.0", id: 5, method: "prompts/get", params: { name: "daily_report" } }))).result.messages[0].content.text).toMatch(/daily report/);
  });
});

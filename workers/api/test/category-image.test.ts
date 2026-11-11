import { env } from "cloudflare:test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { IMAGE_SPECS, MEDIA_KINDS } from "@openshelf/shared";
import { admin, call, ensureOwner, j, type Session } from "./helpers";

let owner: Session;
const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const IEND = [0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82];
const png = (w: number, h: number, pad = 0) => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, ...be32(w), ...be32(h), 8, 6, 0, 0, 0, 0, 0, 0, 0, ...new Array(pad).fill(7), ...IEND]);
const created: string[] = []; const cats: string[] = [];
const upload = async (w: number, h: number, kind = "category") => {
  const fd = new FormData(); fd.set("kind", kind); fd.set("file", new File([png(w, h, 200) as BlobPart], "c.png", { type: "image/png" }));
  const r = await call("/api/admin/media", { method: "POST", form: fd, cookie: owner.cookie, csrf: owner.csrf, ip: owner.ip }); const body = await j<any>(r); if (body.id) created.push(body.id); return { status: r.status, body };
};
const mkCat = (slug: string, extra: object = {}) => admin(owner, "/categories", "POST", { slug, nameTr: `Kat ${slug}`, ...extra });

beforeAll(async () => { owner = await ensureOwner(); });
afterAll(async () => { for (const id of cats) await env.DB.prepare("DELETE FROM categories WHERE id = ?1").bind(id).run(); for (const id of created) await env.DB.prepare("DELETE FROM media WHERE id = ?1").bind(id).run(); });

describe("media kind: category", () => {
  it("is a real kind with its own spec (4:3 card photo) and accepts uploads, warning about the wrong ratio", async () => {
    expect(MEDIA_KINDS).toContain("category"); expect(IMAGE_SPECS.category).toMatchObject({ kind: "category", width: 1200, height: 900 });
    const ok = await upload(1200, 900); expect(ok.status).toBe(201); expect(ok.body).toMatchObject({ width: 1200, height: 900, warnings: [] });
    const wrong = await upload(1000, 1000); expect(wrong.body.warnings.join()).toMatch(/Aspect ratio/);
    const specs = await j<any>(await admin(owner, "/media/specs")); expect(specs.kinds.map((k: any) => k.kind)).toContain("category");
  });
});

describe("category card image", () => {
  it("a category stores imageMediaId and the public categories list exposes it (the storefront builds the card from it)", async () => {
    const m = await upload(1200, 900);
    const r = await mkCat("ci-with-image", { imageMediaId: m.body.id }); expect(r.status).toBe(201); const cat = await j<any>(r); cats.push(cat.id);
    const pub = (await j<any>(await call("/api/store/categories"))).items.find((c: any) => c.slug === "ci-with-image");
    expect(pub.imageMediaId).toBe(m.body.id);
    expect((await j<any>(await admin(owner, "/categories"))).items.find((c: any) => c.id === cat.id).imageMediaId).toBe(m.body.id);
  });
  it("update sets, keeps (when omitted) and clears (null) the image", async () => {
    const a = await upload(1200, 900); const b = await upload(1200, 900);
    const cat = await j<any>(await mkCat("ci-update")); cats.push(cat.id);
    const put = (extra: object) => admin(owner, `/categories/${cat.id}`, "PUT", { slug: "ci-update", nameTr: "Kat", ...extra });
    expect((await j<any>(await put({ imageMediaId: a.body.id }))).imageMediaId).toBe(a.body.id);
    expect((await j<any>(await put({ descriptionTr: "değişti" }))).imageMediaId).toBe(a.body.id);             // omitted: unchanged
    expect((await j<any>(await put({ imageMediaId: b.body.id }))).imageMediaId).toBe(b.body.id);
    expect((await j<any>(await put({ imageMediaId: null }))).imageMediaId).toBeNull();                          // null: cleared
  });
  it("an unknown media id is refused on create and update", async () => {
    const r = await mkCat("ci-bad", { imageMediaId: "does-not-exist" }); expect(r.status).toBe(400); expect((await j<any>(r)).error.message).toMatch(/imageMediaId/);
    const cat = await j<any>(await mkCat("ci-bad2")); cats.push(cat.id);
    expect((await admin(owner, `/categories/${cat.id}`, "PUT", { slug: "ci-bad2", nameTr: "x", imageMediaId: "nope" })).status).toBe(400);
  });
});

describe("home page setting categoryCards", () => {
  it("defaults to plain (no photos), is public, accepts image and rejects anything else", async () => {
    expect((await j<any>(await call("/api/store/config"))).homepage.categoryCards).toBe("plain");
    expect((await admin(owner, "/settings/homepage", "PATCH", { categoryCards: "image" })).status).toBe(200);
    expect((await j<any>(await call("/api/store/config"))).homepage.categoryCards).toBe("image");
    for (const bad of ["gradient", "", 1]) expect((await admin(owner, "/settings/homepage", "PATCH", { categoryCards: bad })).status).toBe(400);
    await admin(owner, "/settings/homepage", "PATCH", { categoryCards: "plain" });
  });
});

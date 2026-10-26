import { describe, expect, it } from "vitest";
import { admin, call, ensureOwner, j } from "./helpers";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137]);
function form(bytes: Uint8Array | string, type: string, kind = "logo", name = "x.png") {
  const f = new FormData(); f.set("file", new File([bytes as BlobPart], name, { type })); f.set("kind", kind); return f;
}
const upload = (s: any, f: FormData) => call("/api/admin/media", { form: f, cookie: s.cookie, csrf: s.csrf, ip: s.ip });

describe("media upload", () => {
  it("accepts a real PNG, serves it with immutable cache + ETag + nosniff", async () => {
    const s = await ensureOwner();
    const r = await upload(s, form(PNG, "image/png"));
    expect(r.status).toBe(201);
    const m = await j<any>(r);
    expect(m.url).toBe(`/media/${m.id}`); expect(m.mime).toBe("image/png");
    const get = await call(m.url);
    expect(get.status).toBe(200);
    expect(get.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable");
    expect(get.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(get.headers.get("Content-Type")).toBe("image/png");
    const etag = get.headers.get("ETag")!;
    expect(etag).toMatch(/^"[0-9a-f]{64}"$/);
    expect(new Uint8Array(await get.arrayBuffer())).toEqual(PNG);
    expect((await call(m.url, { headers: { "If-None-Match": etag } })).status).toBe(304);
    // branding settings resolve media id -> url
    const sets = await admin(s, "/settings/branding", "PUT", { logoMediaId: m.id, bannerMediaIds: [m.id] });
    expect(sets.status).toBe(200);
    const cfg = await j<any>(await call("/api/store/config"));
    expect(cfg.branding.logoUrl).toBe(`/media/${m.id}`);
    expect(cfg.branding.bannerUrls).toEqual([`/media/${m.id}`]);
    expect((await admin(s, `/media?kind=logo`)).status).toBe(200);
    expect((await admin(s, `/media/${m.id}`, "DELETE")).status).toBe(204);
    expect((await call(m.url)).status).toBe(404);
  });

  it("rejects SVG (by mime and by content)", async () => {
    const s = await ensureOwner();
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>';
    expect((await upload(s, form(svg, "image/svg+xml", "logo", "x.svg"))).status).toBe(415);
    expect((await upload(s, form(svg, "image/png"))).status).toBe(415); // svg bytes pretending to be png
  });

  it("rejects fake MIME / mismatched magic bytes", async () => {
    const s = await ensureOwner();
    expect((await upload(s, form("not an image at all", "image/png"))).status).toBe(415);
    expect((await upload(s, form(PNG, "image/jpeg"))).status).toBe(415); // real png, lies about jpeg
    expect((await upload(s, form("#!/bin/sh\necho hi", "image/jpeg", "logo", "evil.jpg"))).status).toBe(415);
  });

  it("enforces size limits and kind validation; requires auth/csrf", async () => {
    const s = await ensureOwner();
    const big = new Uint8Array(600 * 1024); big.set(PNG);
    expect((await upload(s, form(big, "image/png", "logo"))).status).toBe(413);
    expect((await upload(s, form(PNG, "image/png", "bogus"))).status).toBe(400);
    expect((await call("/api/admin/media", { form: form(PNG, "image/png") })).status).toBe(401);
  });
});

describe("media upload: real byte limit", () => {
  it("rejects oversized files even when Content-Length lies", async () => {
    const s = await ensureOwner();
    const big = new Uint8Array(700 * 1024); big.set(PNG);
    const r = await call("/api/admin/media", { form: form(big, "image/png"), cookie: s.cookie, csrf: s.csrf, ip: s.ip, headers: { "Content-Length": "100" } });
    expect(r.status).toBe(413);
    const huge = new Uint8Array(5 * 1024 * 1024 + 200 * 1024); huge.set(PNG);
    const r2 = await call("/api/admin/media", { form: form(huge, "image/png", "banner"), cookie: s.cookie, csrf: s.csrf, ip: s.ip, headers: { "Content-Length": "100" } });
    expect(r2.status).toBe(413);
  });
});

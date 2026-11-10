import { env, fetchMock } from "cloudflare:test";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { blockedHost, checkImportUrl, fetchImageBytes } from "../src/lib/imageFetch";
import { signTicket, verifyTicket } from "../src/lib/tickets";
import { admin, call, ensureOwner, j, loginAs, type Session } from "./helpers";

let owner: Session; let tok = "";
const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const png = (w: number, h: number, pad = 0) => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, ...be32(w), ...be32(h), 8, 6, 0, 0, 0, 0, 0, 0, 0, ...new Array(pad).fill(7)]);
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
    expect(list.map((t: any) => t.name)).toContain("create_upload_link");
  });
});

describe("one-time upload link (PUT raw bytes)", () => {
  it("create_upload_link returns a single-use link; PUT of raw bytes stores the full image; a second PUT is refused", async () => {
    const link = data(await tool("create_upload_link", { body: { kind: "banner", alt: "Yaz banner" } }));
    expect(link).toMatchObject({ method: "PUT", expiresInSeconds: 600, singleUse: true, kind: "banner" }); expect(link.uploadUrl).toMatch(/\/media\/upload\/.+\..+/); expect(link.example).toContain("curl -X PUT");
    const path = new URL(link.uploadUrl).pathname;
    const img = png(2400, 1050, 100_000);
    const put = await call(path, { method: "PUT", raw: img as never, origin: null, headers: { "content-type": "application/octet-stream" } });
    expect(put.status).toBe(201);
    const r = await j<any>(put);
    expect(r).toMatchObject({ size: img.length, width: 2400, height: 1050, warnings: [] });
    expect((await env.DB.prepare("SELECT alt, kind, created_by AS by FROM media WHERE id = ?1").bind(r.id).first<any>())).toMatchObject({ alt: "Yaz banner", kind: "banner" });
    const again = await call(path, { method: "PUT", raw: img as never, origin: null });
    expect(again.status).toBe(409); expect((await j<any>(again)).error.code).toBe("ticket_used");
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE action = 'media.upload' AND meta LIKE '%upload-link%'").first<any>()).n).toBeGreaterThanOrEqual(1);
  });
  it("tampered, forged and expired tickets are refused; the ticket fixes the kind and the limits", async () => {
    const link = data(await tool("create_upload_link", { body: { kind: "favicon" } }));
    const path = new URL(link.uploadUrl).pathname; const ticket = path.split("/").pop()!;
    expect((await call(`/media/upload/${ticket.slice(0, -3)}abc`, { method: "PUT", raw: png(512, 512) as never, origin: null })).status).toBe(401);
    expect((await call("/media/upload/garbage", { method: "PUT", raw: png(512, 512) as never, origin: null })).status).toBe(401);
    const aid = (await j<any>(await admin(owner, "/auth/me"))).admin.id;
    const old = await signTicket(env, { aid, kind: "logo", alt: null }, 600_000, Date.now() - 700_000);
    expect(await verifyTicket(env, old)).toBeNull();
    expect((await call(`/media/upload/${old}`, { method: "PUT", raw: png(600, 144) as never, origin: null })).status).toBe(401);
    expect(await verifyTicket(env, await signTicket(env, { aid, kind: "logo", alt: null }))).toMatchObject({ kind: "logo", aid });
    // not an image: refused, even with a valid ticket
    const bad = await call(path, { method: "PUT", raw: new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'/>") as never, origin: null });
    expect(bad.status).toBe(415);
  });
  it("needs write level and admin role to mint a link; the clear ticket is not stored anywhere", async () => {
    const rt = (await j<any>(await admin(owner, "/tokens", "POST", { name: "r2", level: "read" }))).token;
    const res = (await j<any>(await call("/mcp", { method: "POST", json: { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "create_upload_link", arguments: { body: { kind: "logo" } } } }, origin: null, headers: { Authorization: `Bearer ${rt}` } }))).result;
    expect(res.isError).toBe(true);
    const link = data(await tool("create_upload_link", { body: { kind: "logo" } }));
    const ticket = link.uploadUrl.split("/").pop()!;
    const logs = await env.DB.prepare("SELECT meta FROM audit_logs ORDER BY id DESC LIMIT 20").all<{ meta: string }>();
    expect(JSON.stringify(logs.results)).not.toContain(ticket);
  });
});

describe("existing multipart upload still works", () => {
  it("POST /media multipart goes through the shared store path (warnings included)", async () => {
    const fd = new FormData(); fd.set("kind", "product"); fd.set("file", new File([png(1600, 2000) as never], "p.png", { type: "image/png" })); fd.set("alt", "x");
    const r = await call("/api/admin/media", { method: "POST", form: fd, cookie: owner.cookie, csrf: owner.csrf, ip: owner.ip });
    expect(r.status).toBe(201); expect(await j<any>(r)).toMatchObject({ width: 1600, height: 2000, warnings: [] });
  });
});

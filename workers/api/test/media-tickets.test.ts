import { env, fetchMock } from "cloudflare:test";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { signTicket, verifyTicket } from "../src/lib/tickets";
import { admin, call, createProduct, ensureOwner, j, type Session } from "./helpers";

let owner: Session; let write = ""; let read = "";
const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const IEND = [0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82];
const png = (w: number, h: number, pad = 0) => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, ...be32(w), ...be32(h), 8, 6, 0, 0, 0, 0, 0, 0, 0, ...new Array(pad).fill(7), ...IEND]);
const rpc = (t: string, payload: unknown) => call("/mcp", { method: "POST", json: payload, origin: null, headers: { Authorization: `Bearer ${t}` } });
const tool = async (name: string, args: unknown = {}, t = write) => (await j<any>(await rpc(t, { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }))).result as { content: { text: string }[]; isError?: boolean };
const data = (r: { content: { text: string }[] }) => JSON.parse(r.content[0]!.text);
/** exactly what a sandbox does: a plain PUT with the ticket in a header and no other credentials */
const put = async (ticket: string | null, bytes: Uint8Array, ct = "image/png", q = "") => {
  const worker = (await import("../src/index")).default; const { createExecutionContext, waitOnExecutionContext } = await import("cloudflare:test");
  const ctx = createExecutionContext();
  const res = await worker.fetch(new Request(`http://api.test/mcp/upload${q}`, { method: "PUT", headers: { "Content-Type": ct, "CF-Connecting-IP": "203.0.113.50", ...(ticket ? { "X-Upload-Ticket": ticket } : {}) }, body: bytes as BodyInit }), env, ctx);
  await waitOnExecutionContext(ctx); return res;
};
const created: string[] = [];
const keep = <T extends { id: string }>(r: T): T => { created.push(r.id); return r; };
const mint = async (args: object = { kind: "product" }) => data(await tool("create_upload_link", { body: args }));

beforeAll(async () => {
  owner = await ensureOwner();
  write = (await j<any>(await admin(owner, "/tokens", "POST", { name: "tk-write", level: "write" }))).token;
  read = (await j<any>(await admin(owner, "/tokens", "POST", { name: "tk-read", level: "read" }))).token;
  fetchMock.activate(); fetchMock.disableNetConnect();
});
afterEach(() => fetchMock.assertNoPendingInterceptors());
afterAll(async () => { for (const id of created) await env.DB.prepare("DELETE FROM media WHERE id = ?1").bind(id).run(); });

describe("ticket signing", () => {
  it("round-trips, expires, and any tampering is rejected", async () => {
    const t = await signTicket(env, { aid: "a1", role: "owner", lvl: "write", tid: "ticket", kind: "product", alt: null }, 1000, 5000);
    expect(t.startsWith("upl_")).toBe(true);
    expect(await verifyTicket(env, t, 5500)).toMatchObject({ aid: "a1", kind: "product" });
    expect(await verifyTicket(env, t, 7000)).toBeNull();                                   // expired
    const [p, sig] = t.slice(4).split(".");
    const forged = btoa(JSON.stringify({ ...JSON.parse(atob(p!.replace(/-/g, "+").replace(/_/g, "/"))), kind: "logo" })).replace(/=+$/, "");
    expect(await verifyTicket(env, `upl_${forged}.${sig}`, 5500)).toBeNull();                // payload changed, signature kept
    for (const bad of ["", "upl_", "upl_x.y", "osk_abc", t + "x", "x".repeat(3000)]) expect(await verifyTicket(env, bad, 5500), bad.slice(0, 12)).toBeNull();
  });
});

describe("create_upload_link + PUT /mcp/upload with a ticket (no MCP token)", () => {
  it("a sandbox with only the ticket uploads one full-size image, kind and alt come from the ticket", async () => {
    const m = await mint({ kind: "product", alt: "Ön görsel", count: 2 });
    expect(m.tickets).toHaveLength(2); expect(m.expiresInSeconds).toBe(600); expect(m.uploadUrl).toBe("http://api.test/mcp/upload");
    expect(m.example).toContain("X-Upload-Ticket"); expect(m.example).not.toContain("osk_");
    const img = png(1600, 2000, 120_000);                                                   // ~120 KB: far more than a chat can carry as base64
    const res = await put(m.tickets[0], img, "image/png", "?kind=logo&alt=ignored");        // client-supplied kind/alt must not matter
    expect(res.status).toBe(201);
    const r = keep(await j<any>(res));
    expect(r).toMatchObject({ mime: "image/png", size: img.length, width: 1600, height: 2000, warnings: [] });
    expect(await env.DB.prepare("SELECT kind, alt FROM media WHERE id = ?1").bind(r.id).first()).toMatchObject({ kind: "product", alt: "Ön görsel" });
  });
  it("a ticket uploads exactly one image; a second use is refused, another ticket still works", async () => {
    const m = await mint({ kind: "banner", count: 2 });
    expect((await put(m.tickets[0], png(2400, 1050, 40))).status).toBe(201);
    const again = await put(m.tickets[0], png(2400, 1050, 40)); expect(again.status).toBe(409); expect((await j<any>(again)).error.code).toBe("ticket_used");
    const second = await put(m.tickets[1], png(2400, 1050, 41)); expect(second.status).toBe(201); keep(await j<any>(second));
  });
  it("a failed upload (truncated image) does not spend the ticket; after 3 attempts it stops", async () => {
    const m = await mint({ kind: "product" });
    const cut = png(800, 800, 3000).slice(0, 1500);
    for (let i = 0; i < 3; i++) { const r = await put(m.tickets[0], cut); expect(r.status).toBe(422); expect((await j<any>(r)).error.code).toBe("incomplete_image"); }
    expect((await put(m.tickets[0], png(800, 1000))).status).toBe(429);
  });
  it("invalid, forged and missing tickets are rejected; the ticket cannot be used for anything but uploading", async () => {
    expect((await put("upl_garbage.sig", png(10, 10))).status).toBe(401);
    expect((await put("osk_" + "x".repeat(40), png(10, 10))).status).toBe(401);
    expect((await put(null, png(10, 10))).status).toBe(401);
    const m = await mint();
    expect((await call("/api/admin/products", { headers: { "X-Upload-Ticket": m.tickets[0] } })).status).toBe(401);          // not an API credential
    expect((await call("/mcp", { method: "POST", json: { jsonrpc: "2.0", id: 1, method: "tools/list" }, origin: null, headers: { "X-Upload-Ticket": m.tickets[0] } })).status).toBe(401);
    expect((await put(m.tickets[0], new TextEncoder().encode("<html>"), "text/html")).status).toBe(415);
  });
  it("only write-level tokens can mint tickets; the owner can switch the tool off", async () => {
    const denied = await tool("create_upload_link", { body: { kind: "product" } }, read);
    expect(denied.isError).toBe(true); expect(denied.content[0]!.text).toContain('needs level "write"');
    expect((await tool("create_upload_link", { body: { kind: "avatar" } })).isError).toBe(true);
    expect((await tool("create_upload_link", { body: { kind: "product", count: 11 } })).isError).toBe(true);
  });
  it("a ticket stops working once the admin who minted it is disabled", async () => {
    const m = await mint(); const aid = (await verifyTicket(env, m.tickets[0]))!.aid;
    await env.DB.prepare("UPDATE admins SET disabled = 1 WHERE id = ?1").bind(aid).run();
    try { expect((await put(m.tickets[0], png(800, 1000))).status).toBe(401); }
    finally { await env.DB.prepare("UPDATE admins SET disabled = 0 WHERE id = ?1").bind(aid).run(); }
    const ok = await put(m.tickets[0], png(800, 1000, 7)); expect(ok.status).toBe(201); keep(await j<any>(ok));   // and works again for an active admin
  });
});

describe("import_attached_files (ChatGPT attachments)", () => {
  it("advertises the file parameter to ChatGPT with a schema it accepts", async () => {
    const list = (await (async () => (await j<any>(await rpc(write, { jsonrpc: "2.0", id: 1, method: "tools/list" }))).result.tools)()) as any[];
    const t = list.find((x) => x.name === "import_attached_files");
    expect(t._meta["openai/fileParams"]).toEqual(["files"]);
    const item = t.inputSchema.properties.body.properties.files.items;
    expect(Object.keys(item.properties).sort()).toEqual(["download_url", "file_id", "file_name", "mime_type"]);
    expect(item.required.sort()).toEqual(["download_url", "file_id"]);
    expect(list.filter((x) => x._meta).map((x) => x.name)).toEqual(["import_attached_files"]);
  });
  it("downloads the attached files at full size, attaches them to a product in one call, and keeps going past a bad file", async () => {
    const { product } = await createProduct(owner);
    fetchMock.get("https://files.example.com").intercept({ path: "/a.png" }).reply(200, Buffer.from(png(1600, 2000, 90_000)));
    fetchMock.get("https://files.example.com").intercept({ path: "/b.png" }).reply(200, Buffer.from(png(1600, 2000, 60_000)));
    fetchMock.get("https://files.example.com").intercept({ path: "/gone.png" }).reply(404, "nope");
    const r = data(await tool("import_attached_files", { body: { kind: "product", productId: product.id, alt: "Eklenen", files: [
      { download_url: "https://files.example.com/a.png", file_id: "f1", file_name: "a.png" }, { download_url: "https://files.example.com/gone.png", file_id: "f2" }, { download_url: "https://files.example.com/b.png", file_id: "f3", mime_type: "image/png" },
    ] } }));
    expect(r).toMatchObject({ imported: 2, failed: 1 });
    expect(r.items.map((i: any) => i.ok)).toEqual([true, false, true]); for (const i of r.items.filter((x: any) => x.ok)) keep(i);
    expect(r.product.images).toHaveLength(2); expect(r.product.images.map((i: any) => i.alt)).toEqual(["Eklenen", "Eklenen"]);
    expect((await j<any>(await admin(owner, `/products/${product.id}`))).images).toHaveLength(2);
  });
  it("without productId it only imports; private hosts and bad input are refused", async () => {
    fetchMock.get("https://files.example.com").intercept({ path: "/c.png" }).reply(200, Buffer.from(png(512, 512)));
    const ok = data(await tool("import_attached_files", { body: { kind: "favicon", files: [{ download_url: "https://files.example.com/c.png", file_id: "f" }] } }));
    expect(ok.imported).toBe(1); expect(ok.product).toBeUndefined(); keep(ok.items[0]);
    const bad = data(await tool("import_attached_files", { body: { kind: "product", files: [{ download_url: "https://127.0.0.1/a.png", file_id: "x" }] } }));
    expect(bad).toMatchObject({ imported: 0, failed: 1 }); expect(bad.items[0].error.code).toBe("invalid_url");
    expect((await tool("import_attached_files", { body: { kind: "product", files: [] } })).isError).toBe(true);
    expect((await tool("import_attached_files", { body: { kind: "product", files: [{ download_url: "https://files.example.com/x.png", file_id: "f" }], productId: "ghost" } })).isError).toBeFalsy();
  });
});

describe("upload_help lists every way, in order of cost", () => {
  it("includes the ticket and attachment routes and the sandbox network note", async () => {
    const h = data(await tool("upload_help"));
    const uses = h.chooseByWhatYouHave.map((x: any) => x.use as string).join("\n");
    expect(uses).toContain("import_attached_files"); expect(uses).toContain("create_upload_link"); expect(uses).toContain("/mcp/upload"); expect(uses).toContain("Katalog → Medya"); expect(uses).toContain("upload_media (base64)");
    expect(h.sandboxNote).toMatch(/allow-list/);
  });
});

import { beforeAll, describe, expect, it } from "vitest";
import { HELP_DOCS } from "../src/mcp/helpDocs.generated";
import { GUIDE } from "../src/mcp/guide";
import { TOOLS, TOOL_BY_NAME } from "../src/mcp/tools";
import { admin, call, ensureOwner, j, type Session } from "./helpers";

let owner: Session; let write = ""; let read = "";
const rpc = (t: string, payload: unknown) => call("/mcp", { method: "POST", json: payload, origin: null, headers: { Authorization: `Bearer ${t}` } });
const rpcResult = async (t: string, method: string, params: unknown = {}) => (await j<any>(await rpc(t, { jsonrpc: "2.0", id: 1, method, params }))).result;
const tool = async (name: string, args: unknown = {}, t = write) => (await rpcResult(t, "tools/call", { name, arguments: args })) as { content: { text: string }[]; isError?: boolean };
const data = (r: { content: { text: string }[] }) => JSON.parse(r.content[0]!.text);

/** Everything added for AI clients lately: it must be reachable over MCP at the right level, and explained in the guide. */
const NEW_TOOLS: Record<string, "read" | "write"> = {
  store_insights: "read", view_image: "read", upload_help: "read", help_topics: "read", help_search: "read", help_read: "read",
  add_product_images: "write", set_store_image: "write", create_upload_link: "write", import_attached_files: "write", update_media_alt: "write", upload_media_from_url: "write", upload_media: "write",
  update_menu: "write", update_merchandising: "write", update_homepage: "write", update_variant_price: "write", bulk_update_products: "write",
};

beforeAll(async () => {
  owner = await ensureOwner();
  write = (await j<any>(await admin(owner, "/tokens", "POST", { name: "mh-write", level: "write" }))).token;
  read = (await j<any>(await admin(owner, "/tokens", "POST", { name: "mh-read", level: "read" }))).token;
});

describe("the new tools are really exposed over MCP", () => {
  it("every new tool is in tools/list for a write token with a description and an object input schema", async () => {
    const list = (await rpcResult(write, "tools/list")).tools as { name: string; description: string; inputSchema: { type: string } }[];
    const by = new Map(list.map((t) => [t.name, t]));
    for (const [name, level] of Object.entries(NEW_TOOLS)) {
      const t = by.get(name);
      expect(t, `${name} missing from tools/list`).toBeTruthy();
      expect(t!.description.startsWith(`[${level}]`), `${name} level`).toBe(true);
      expect(t!.description.length, `${name} description`).toBeGreaterThan(60);
      expect(t!.inputSchema.type).toBe("object");
    }
  });
  it("a read token sees the read ones and none of the write ones", async () => {
    const names = ((await rpcResult(read, "tools/list")).tools as { name: string }[]).map((t) => t.name);
    for (const [name, level] of Object.entries(NEW_TOOLS)) expect(names.includes(name), `${name} (${level}) for read token`).toBe(level === "read");
  });
  it("the admin screen (Settings → MCP → Tools) lists them in sensible groups", async () => {
    const v = await j<any>(await admin(owner, "/mcp/tools"));
    const group = (n: string) => v.tools.find((t: any) => t.name === n)?.group;
    expect(group("store_insights")).toBe("overview"); expect(group("help_read")).toBe("overview"); expect(group("help_search")).toBe("overview");
    for (const n of ["update_menu", "update_merchandising", "update_homepage", "update_variant_price", "bulk_update_products", "add_product_images", "set_store_image", "view_image", "upload_help"]) expect(group(n), n).toBe("catalog");
  });
  it("every new tool is explained in the AI guide (openshelf://guide)", async () => {
    const r = await rpcResult(write, "resources/read", { uri: "openshelf://guide" });
    const text = r.contents[0].text as string;
    for (const n of Object.keys(NEW_TOOLS)) expect(text.includes(n) || GUIDE.includes(n), `guide does not mention ${n}`).toBe(true);
  });
  it("the server instructions point at upload_help and the built-in guide", async () => {
    const init = await rpcResult(write, "initialize", { protocolVersion: "2025-06-18" });
    expect(init.instructions).toMatch(/upload_help/); expect(init.instructions).toMatch(/help_search/);
  });
});

describe("the user guide over MCP", () => {
  it("help_topics lists every chapter with section ids; the MCP chapter is there", async () => {
    const r = data(await tool("help_topics", { lang: "en" }));
    const slugs = r.topics.map((t: any) => t.topic);
    for (const s of ["getting-started", "store-settings", "catalog", "orders", "invoices", "integrations", "seo", "mcp", "troubleshooting"]) expect(slugs).toContain(s);
    const mcp = r.topics.find((t: any) => t.topic === "mcp");
    expect(mcp.sections.map((s: any) => s.id)).toEqual(expect.arrayContaining(["dosya-ve-gorsel-yukleme", "trendyol-fotograflari", "rehberi-yapay-zekaya-acma"]));
    expect(mcp.title).toMatch(/MCP/);
  });
  it("help_search finds answers accent-insensitively in both languages", async () => {
    const tr = data(await tool("help_search", { q: "kargo etiketi yazdırma", lang: "tr" }));
    expect(tr.results.length).toBeGreaterThan(0); expect(tr.results[0].read).toMatch(/^help_read topic=/);
    expect(data(await tool("help_search", { q: "siparis listesi", lang: "tr" })).results.some((x: any) => x.topic === "orders" && x.section === "siparis-listesi")).toBe(true);
    expect(data(await tool("help_search", { q: "bulk shipment", lang: "en" })).results.some((x: any) => x.topic === "orders")).toBe(true);
    expect((await tool("help_search", { q: "x" })).isError).toBe(true);
  });
  it("help_read returns a whole chapter or just one section, cleaned for an AI", async () => {
    const sec = data(await tool("help_read", { topic: "orders", section: "siparis-listesi", lang: "tr" }));
    expect(sec.markdown).toContain("Aşama sekmeleri"); expect(sec.markdown).not.toContain("## Sipariş durumları"); expect(sec.language).toBe("tr");
    const en = data(await tool("help_read", { topic: "orders", section: "siparis-listesi", lang: "en" }));
    expect(en.markdown).toContain("Stage tabs"); expect(en.language).toBe("en");
    const chapter = data(await tool("help_read", { topic: "store-settings", lang: "tr" }));
    expect(chapter.markdown).not.toMatch(/!\[[^\]]*\]\(/);          // screenshots are replaced by a note
    expect(chapter.markdown).not.toMatch(/\]\(term:/);              // glossary links keep only their text
    expect(chapter.markdown).not.toMatch(/\{#[a-z0-9-]+\}/);        // pinned anchors are listed in `sections`, not in headings
    expect(chapter.sections.length).toBeGreaterThan(5);
  });
  it("a long chapter is capped and tells the AI to read it section by section", async () => {
    const longest = HELP_DOCS.tr.reduce((a, b) => (b.md.length > a.md.length ? b : a));
    const r = data(await tool("help_read", { topic: longest.slug, lang: "tr" }));
    if (longest.md.length > 60_000) expect(r.truncated).toBe(true); else expect(r.truncated).toBeUndefined();
    expect(r.markdown.length).toBeLessThanOrEqual(61_000);
  });
  it("unknown topic, unknown section and bad language are readable errors", async () => {
    const t = await tool("help_read", { topic: "nope" }); expect(t.isError).toBe(true); expect(t.content[0]!.text).toMatch(/help_topics/);
    const s = await tool("help_read", { topic: "orders", section: "nope" }); expect(s.isError).toBe(true); expect(s.content[0]!.text).toMatch(/siparis-listesi/);
    expect((await tool("help_read", { topic: "orders", lang: "de" })).isError).toBe(true);
  });
  it("chapters are also MCP resources (default language, ?lang= for the other)", async () => {
    const list = (await rpcResult(write, "resources/list")).resources as { uri: string; name: string }[];
    expect(list.map((r) => r.uri)).toEqual(expect.arrayContaining(["openshelf://guide", "openshelf://help/orders", "openshelf://help/mcp"]));
    const tr = (await rpcResult(write, "resources/read", { uri: "openshelf://help/orders" })).contents[0];
    expect(tr.mimeType).toBe("text/markdown"); expect(tr.text).toContain("Sipariş listesi");
    const en = (await rpcResult(write, "resources/read", { uri: "openshelf://help/orders?lang=en" })).contents[0];
    expect(en.text).toContain("Order list");
    const missing = await j<any>(await rpc(write, { jsonrpc: "2.0", id: 2, method: "resources/read", params: { uri: "openshelf://help/nope" } }));
    expect(missing.error.code).toBe(-32002);
  });
  it("read-level tokens can use the help tools (they only read)", async () => {
    expect((await tool("help_search", { q: "iade" }, read)).isError).toBeUndefined();
  });
});

describe("the guide and the tool list stay in sync", () => {
  it("every snake_case tool name written in the AI/MCP chapter is a real tool", () => {
    for (const lang of ["tr", "en"] as const) {
      const md = HELP_DOCS[lang].find((d) => d.slug === "mcp")!.md;
      const names = [...new Set([...md.matchAll(/`([a-z]+(?:_[a-z]+)+)`/g)].map((m) => m[1]!))];
      expect(names.length).toBeGreaterThan(15);
      const PARAMS = new Set(["download_url", "file_id", "mime_type", "file_name"]);   // argument names that are written in backticks too
      expect(names.filter((n) => !TOOL_BY_NAME.has(n) && !PARAMS.has(n)), `unknown tool names in ${lang} chapter`).toEqual([]);
    }
  });
  it("the same holds for tool names used in the AI guide text", () => {
    const names = [...new Set([...GUIDE.matchAll(/\b([a-z]+(?:_[a-z]+)+)\b/g)].map((m) => m[1]!))].filter((n) => /^(list|get|update|create|add|set|view|help|upload|store|bulk|adjust|seo|campaign|preview|test|send|retry|trendyol|geliver|mock|delete|import|order|catalog|customer)_/.test(n));
    expect(names.filter((n) => !TOOL_BY_NAME.has(n) && !["upload_media_from_url_"].includes(n)), "tool names in the guide that do not exist").toEqual([]);
    expect(TOOLS.length).toBeGreaterThan(80);
  });
});

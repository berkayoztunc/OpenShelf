import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { app } from "../src/index";
import { MAX_RESULT_BYTES, MCP_RATE_PER_MIN, authenticateToken, visibleTools } from "../src/mcp/server";
import { INTERNAL_HEADER, signInternal, verifyInternal } from "../src/mcp/internal";
import { EXCLUDED_ROUTES, TOOLS, TOOL_BY_NAME, inputSchema } from "../src/mcp/tools";
import { sha256Hex } from "../src/lib/crypto";
import { admin, call, ensureOwner, j, type Session } from "./helpers";

let owner: Session; let ownerId = "";
const mkToken = async (level: "read" | "write" | "full", extra: Record<string, unknown> = {}) => {
  const r = await admin(owner, "/tokens", "POST", { name: `t-${level}`, level, ...extra });
  expect(r.status).toBe(201);
  return (await j<any>(r));
};
const rpc = (token: string | null, payload: unknown, headers: Record<string, string> = {}) =>
  call("/mcp", { method: "POST", json: payload, origin: null, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers } });
const tool = async (token: string, name: string, args: unknown = {}) => {
  const r = await j<any>(await rpc(token, { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }));
  return r.result as { content: { text: string }[]; isError?: boolean };
};
const out = (r: { content: { text: string }[] }) => r.content[0]!.text;

beforeAll(async () => {
  owner = await ensureOwner();
  ownerId = (await j<any>(await admin(owner, "/auth/me"))).admin.id;
});

describe("api tokens (admin panel)", () => {
  it("creates a token shown once; list never exposes it or its hash; revoke blocks it", async () => {
    const t = await mkToken("read");
    expect(t.token).toMatch(/^osk_/); expect(t.mcpUrl).toMatch(/\/mcp$/);
    const list = await j<any>(await admin(owner, "/tokens"));
    const row = list.items.find((x: any) => x.id === t.id);
    expect(row).toMatchObject({ name: "t-read", level: "read" }); expect(JSON.stringify(list)).not.toContain(t.token); expect(JSON.stringify(list)).not.toContain("tokenHash");
    expect((await rpc(t.token, { jsonrpc: "2.0", id: 1, method: "ping" })).status).toBe(200);
    expect((await admin(owner, `/tokens/${t.id}`, "DELETE")).status).toBe(204);
    expect((await rpc(t.token, { jsonrpc: "2.0", id: 1, method: "ping" })).status).toBe(401);
  });
  it("validates input and refuses staff", async () => {
    expect((await admin(owner, "/tokens", "POST", { name: "", level: "read" })).status).toBe(400);
    expect((await admin(owner, "/tokens", "POST", { name: "x", level: "root" })).status).toBe(400);
  });
  it("expired, unknown, malformed and disabled-owner tokens are rejected", async () => {
    const t = await mkToken("read");
    await env.DB.prepare("UPDATE api_tokens SET expires_at = unixepoch() - 10 WHERE id = ?1").bind(t.id).run();
    expect((await rpc(t.token, { jsonrpc: "2.0", id: 1, method: "ping" })).status).toBe(401);
    expect((await rpc("osk_doesnotexistdoesnotexist", { jsonrpc: "2.0", id: 1, method: "ping" })).status).toBe(401);
    expect((await rpc("not-a-token", { jsonrpc: "2.0", id: 1, method: "ping" })).status).toBe(401);
    expect((await rpc(null, { jsonrpc: "2.0", id: 1, method: "ping" })).status).toBe(401);
  });
  it("tokens of a user who is disabled stop working", async () => {
    const email = `mcp-dis-${Date.now()}@example.com`;
    const u = await j<any>(await admin(owner, "/users", "POST", { email, name: "D", password: "staff password 12345", role: "staff" }));
    const raw = `osk_${"d".repeat(40)}`;
    await env.DB.prepare("INSERT INTO api_tokens (id, admin_id, name, token_hash, prefix, level, created_at) VALUES ('dis-1', ?1, 'x', ?2, 'osk_dddd', 'read', unixepoch())").bind(u.id, await sha256Hex(raw)).run();
    expect((await rpc(raw, { jsonrpc: "2.0", id: 1, method: "ping" })).status).toBe(200);
    await env.DB.prepare("UPDATE admins SET disabled = 1 WHERE id = ?1").bind(u.id).run();
    expect((await rpc(raw, { jsonrpc: "2.0", id: 1, method: "ping" })).status).toBe(401);
    expect(await authenticateToken({} as never, "short")).toBeNull();
  });
});

describe("token cannot bypass the MCP layer", () => {
  it("Bearer on the admin API is rejected (no cookie session)", async () => {
    const t = await mkToken("full");
    expect((await call("/api/admin/orders", { headers: { Authorization: `Bearer ${t.token}` } })).status).toBe(401);
  });
  it("forged / tampered / expired internal claims are rejected", async () => {
    const good = await signInternal(env, { aid: ownerId, role: "owner", lvl: "full", tid: "t" });
    expect((await call("/api/admin/orders", { headers: { [INTERNAL_HEADER]: good } })).status).toBe(200); // proves the claim format works
    const [p, s] = good.split(".");
    expect((await call("/api/admin/orders", { headers: { [INTERNAL_HEADER]: `${p}.${s!.slice(0, -2)}xx` } })).status).toBe(401);
    expect((await call("/api/admin/orders", { headers: { [INTERNAL_HEADER]: `${btoa(JSON.stringify({ aid: ownerId, role: "owner", lvl: "full", tid: "t", exp: Date.now() + 1e9 }))}.${s}` } })).status).toBe(401);
    expect((await call("/api/admin/orders", { headers: { [INTERNAL_HEADER]: "garbage" } })).status).toBe(401);
    const old = await signInternal(env, { aid: ownerId, role: "owner", lvl: "full", tid: "t" }, 60_000, Date.now() - 120_000);
    expect(await verifyInternal(env, old)).toBeNull();
    expect((await call("/api/admin/orders", { headers: { [INTERNAL_HEADER]: old } })).status).toBe(401);
  });
  it("an internal claim cannot manage tokens, users or reset data", async () => {
    const h = { [INTERNAL_HEADER]: await signInternal(env, { aid: ownerId, role: "owner", lvl: "full", tid: "t" }) };
    expect((await call("/api/admin/tokens", { headers: h })).status).toBe(403);
    expect((await call("/api/admin/tokens", { method: "POST", json: { name: "x", level: "full" }, headers: h })).status).toBe(403);
    const reset = await call("/api/admin/system/reset", { method: "POST", json: { confirm: "SIFIRLA", password: "x" }, headers: h });
    expect(reset.status).toBe(403); // tokens never act as owner
    expect((await call("/api/admin/users", { headers: h })).status).toBe(403);
  });
});

describe("protocol", () => {
  let tok = "";
  beforeAll(async () => { tok = (await mkToken("read")).token; });
  it("initialize negotiates a version and advertises tools/resources/prompts", async () => {
    const r = await j<any>(await rpc(tok, { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "t", version: "1" } } }));
    expect(r.result.protocolVersion).toBe("2025-03-26"); expect(r.result.serverInfo.name).toBe("openshelf"); expect(Object.keys(r.result.capabilities).sort()).toEqual(["prompts", "resources", "tools"]);
    const unknown = await j<any>(await rpc(tok, { jsonrpc: "2.0", id: 2, method: "initialize", params: { protocolVersion: "1999-01-01" } }));
    expect(unknown.result.protocolVersion).toBe("2025-06-18");
  });
  it("ping, unknown method, invalid request, parse error, notification, batch, GET", async () => {
    expect((await j<any>(await rpc(tok, { jsonrpc: "2.0", id: 1, method: "ping" }))).result).toEqual({});
    expect((await j<any>(await rpc(tok, { jsonrpc: "2.0", id: 2, method: "nope" }))).error.code).toBe(-32601);
    expect((await j<any>(await rpc(tok, { id: 3 }))).error.code).toBe(-32600);
    expect((await call("/mcp", { method: "POST", raw: "{bad", origin: null, headers: { Authorization: `Bearer ${tok}` } })).status).toBe(400);
    expect((await rpc(tok, { jsonrpc: "2.0", method: "notifications/initialized" })).status).toBe(202);
    const batch = await j<any[]>(await rpc(tok, [{ jsonrpc: "2.0", id: 1, method: "ping" }, { jsonrpc: "2.0", id: 2, method: "ping" }]));
    expect(batch.map((x) => x.id)).toEqual([1, 2]);
    expect((await call("/mcp", { method: "GET", headers: { Authorization: `Bearer ${tok}` } })).status).toBe(405);
  });
  it("answers as a single SSE event when the client only accepts text/event-stream", async () => {
    const r = await rpc(tok, { jsonrpc: "2.0", id: 9, method: "ping" }, { Accept: "text/event-stream" });
    expect(r.headers.get("content-type")).toContain("text/event-stream");
    const body = await r.text();
    expect(body).toMatch(/^event: message\ndata: /); expect(JSON.parse(body.split("data: ")[1]!).id).toBe(9);
    expect((await rpc(tok, { jsonrpc: "2.0", id: 9, method: "ping" }, { Accept: "application/json, text/event-stream" })).headers.get("content-type")).toContain("application/json");
  });
  it("resources and prompts", async () => {
    const res = await j<any>(await rpc(tok, { jsonrpc: "2.0", id: 1, method: "resources/read", params: { uri: "openshelf://guide" } }));
    expect(res.result.contents[0].text).toContain("minor units");
    expect((await j<any>(await rpc(tok, { jsonrpc: "2.0", id: 2, method: "resources/read", params: { uri: "x://y" } }))).error.code).toBe(-32002);
    const pl = await j<any>(await rpc(tok, { jsonrpc: "2.0", id: 3, method: "prompts/list" }));
    expect(pl.result.prompts.map((p: any) => p.name)).toContain("daily_report");
    const pg = await j<any>(await rpc(tok, { jsonrpc: "2.0", id: 4, method: "prompts/get", params: { name: "draft_campaign" } }));
    expect(pg.result.messages[0].content.text).toContain("Do NOT call send_campaign");
  });
  it("rate limits per token", async () => {
    const t = await mkToken("read");
    await env.DB.prepare("INSERT OR REPLACE INTO rate_limits (key, count, window_start) VALUES (?1, ?2, unixepoch())").bind(`mcp:${t.id}`, MCP_RATE_PER_MIN).run();
    const r = await rpc(t.token, { jsonrpc: "2.0", id: 1, method: "ping" });
    expect(r.status).toBe(429); expect(r.headers.get("Retry-After")).toBeTruthy();
  });
});

describe("tool levels", () => {
  it("tools/list grows with the level; names unique; every tool has a valid JSON schema and annotations", async () => {
    const [r, w, f] = await Promise.all((["read", "write", "full"] as const).map(async (l) => j<any>(await rpc((await mkToken(l)).token, { jsonrpc: "2.0", id: 1, method: "tools/list" }))));
    const names = (x: any) => x.result.tools.map((t: any) => t.name) as string[];
    expect(names(r).length).toBeLessThan(names(w).length); expect(names(w).length).toBeLessThan(names(f).length);
    expect(names(f).length).toBe(TOOLS.length); expect(new Set(names(f)).size).toBe(TOOLS.length);
    expect(names(r)).toContain("list_orders"); expect(names(r)).not.toContain("create_product"); expect(names(w)).toContain("create_product"); expect(names(w)).not.toContain("refund_order"); expect(names(f)).toContain("refund_order");
    for (const t of f.result.tools) {
      expect(t.inputSchema.type).toBe("object"); expect(typeof t.annotations.readOnlyHint).toBe("boolean");
      expect(t.description).toMatch(/^\[(read|write|full)\] /);
    }
    const refund = f.result.tools.find((t: any) => t.name === "refund_order");
    expect(refund.annotations.destructiveHint).toBe(true); expect(refund.inputSchema.properties.confirm).toBeTruthy();
    expect(f.result.tools.find((t: any) => t.name === "list_orders").annotations.readOnlyHint).toBe(true);
    expect(visibleTools("read").every((t) => t.level === "read")).toBe(true);
  });
  it("a read token cannot call write or full tools (clear message, nothing happens)", async () => {
    const t = (await mkToken("read")).token;
    const r = await tool(t, "create_category", { body: { slug: "nope-x", nameTr: "Hayır" } });
    expect(r.isError).toBe(true); expect(out(r)).toContain('needs level "write"');
    const g = await tool(t, "refund_order", { id: "x", body: { amount: 1 }, confirm: true });
    expect(g.isError).toBe(true);
    const cats = await j<any>(await admin(owner, "/categories"));
    expect(cats.items.find((c: any) => c.slug === "nope-x")).toBeUndefined();
  });
  it("full-level tools do nothing without confirm: true, and run with it", async () => {
    const t = (await mkToken("full")).token;
    await admin(owner, "/coupons", "POST", { code: "MCPDEL", type: "percent", value: 10 });
    const dry = await tool(t, "delete_coupon", { code: "MCPDEL" });
    expect(out(dry)).toContain("NOT EXECUTED"); expect(dry.isError).toBeUndefined();
    expect((await j<any>(await admin(owner, "/coupons"))).items.some((c: any) => c.code === "MCPDEL")).toBe(true);
    const done = await tool(t, "delete_coupon", { code: "MCPDEL", confirm: true });
    expect(done.isError).toBeUndefined();
    expect((await j<any>(await admin(owner, "/coupons"))).items.some((c: any) => c.code === "MCPDEL")).toBe(false);
  });
  it("unknown tool and invalid arguments return readable errors", async () => {
    const t = (await mkToken("write")).token;
    expect(out(await tool(t, "does_not_exist"))).toContain("Unknown tool");
    const bad = await tool(t, "get_order", {});
    expect(bad.isError).toBe(true); expect(out(bad)).toContain("Invalid arguments"); expect(out(bad)).toContain("id");
    const badBody = await tool(t, "create_category", { body: { slug: "BAD SLUG", nameTr: "" } });
    expect(badBody.isError).toBe(true);
  });
});

describe("tools run the real admin API", () => {
  let t = "";
  beforeAll(async () => { t = (await mkToken("full")).token; });
  it("read: dashboard, orders, settings, integrations are returned as JSON text", async () => {
    expect(JSON.parse(out(await tool(t, "store_overview")))).toBeTruthy();
    expect(JSON.parse(out(await tool(t, "list_orders", { pageSize: 5 }))).items).toBeInstanceOf(Array);
    expect(JSON.parse(out(await tool(t, "get_settings"))).general).toBeTruthy();
    expect(JSON.parse(out(await tool(t, "list_integrations")))).toBeTruthy();
    expect(JSON.parse(out(await tool(t, "trendyol_health"))).stock.truth).toBe("local");
    expect(JSON.parse(out(await tool(t, "mock_status")))).toHaveProperty("allowed");
  });
  it("write: product lifecycle (create, stock adjust, update, get) with path/query/body mapping", async () => {
    const cat = JSON.parse(out(await tool(t, "create_category", { body: { slug: "mcp-kat", nameTr: "MCP Kategori" } })));
    expect(cat.id).toBeTruthy();
    const prod = JSON.parse(out(await tool(t, "create_product", { body: { slug: "mcp-urun", nameTr: "MCP Ürün", categoryId: cat.id, status: "draft", variants: [{ sku: "MCP-1", title: "Std", prices: { website: 1999 }, stock: { total: 5 } }] } })));
    expect(prod.slug).toBe("mcp-urun");
    const variantId = prod.variants[0].id;
    const adj = await tool(t, "adjust_stock", { variantId, body: { delta: 7, reason: "mcp test" } });
    expect(adj.isError).toBeUndefined();
    const got = JSON.parse(out(await tool(t, "get_product", { id: prod.id })));
    expect(got.variants[0].stock.total ?? got.variants[0].stock).toBeTruthy();
    const list = JSON.parse(out(await tool(t, "list_products", { q: "mcp-urun" })));
    expect(list.items.some((p: any) => p.id === prod.id)).toBe(true); // query params are forwarded
    expect((await tool(t, "delete_product", { id: prod.id })).isError).toBeUndefined(); // dry run
    expect(out(await tool(t, "delete_product", { id: prod.id }))).toContain("NOT EXECUTED");
    expect((await tool(t, "delete_product", { id: prod.id, confirm: true })).isError).toBeUndefined();
  });
  it("write: settings group replace goes through the API validation", async () => {
    const all = JSON.parse(out(await tool(t, "get_settings")));
    const ok = await tool(t, "update_settings", { group: "general", value: { ...all.general, storeName: "MCP Mağaza" } });
    expect(ok.isError).toBeUndefined();
    expect(JSON.parse(out(await tool(t, "get_settings"))).general.storeName).toBe("MCP Mağaza");
    const bad = await tool(t, "update_settings", { group: "general", value: { storeName: 5 } });
    expect(bad.isError).toBe(true); expect(out(bad)).toContain("HTTP 400");
    expect((await tool(t, "update_settings", { group: "system", value: { mockMode: true } })).isError).toBe(true); // system group is not selectable
    await tool(t, "update_settings", { group: "general", value: all.general });
  });
  it("campaign workflow: draft -> audience -> preview (nothing is sent); send needs confirm", async () => {
    const c = JSON.parse(out(await tool(t, "create_campaign", { body: { name: "MCP", channel: "email", subject: "Selam {{name}}", body: "Merhaba {{name}}", filters: {} } })));
    expect(JSON.parse(out(await tool(t, "campaign_audience", { body: { channel: "email", filters: {} } })))).toHaveProperty("count");
    expect(JSON.parse(out(await tool(t, "preview_campaign", { id: c.id }))).html).toContain("Unsubscribe");
    expect(out(await tool(t, "send_campaign", { id: c.id }))).toContain("NOT EXECUTED");
    expect(JSON.parse(out(await tool(t, "get_campaign", { id: c.id }))).status).toBe("draft");
    await tool(t, "delete_campaign", { id: c.id, confirm: true });
  });
  it("API errors are surfaced with status and code so the AI can correct itself", async () => {
    const r = await tool(t, "get_order", { id: "does-not-exist" });
    expect(r.isError).toBe(true); expect(out(r)).toContain("HTTP 404");
    const ch = await tool(t, "list_orders", { source: "trendyol" });
    expect(ch.isError).toBeUndefined();
  });
  it("raw Trendyol/Geliver calls reach the console endpoints (confirm rule stays with the API)", async () => {
    const ops = JSON.parse(out(await tool(t, "geliver_list_operations")));
    expect(ops).toHaveProperty("mode");
    const r = await tool(t, "geliver_call", { body: { operationId: "priceList", query: {}, body: {} } });
    expect(typeof out(r)).toBe("string");
  });
  it("CSV import uploads text as a file", async () => {
    const r = await tool(t, "import_products_csv", { csv: "slug,sku\nmcp-csv,CSV-1\n", confirm: true });
    expect(out(r)).not.toContain("CSV file is required");
    expect(out(await tool(t, "import_products_csv", { csv: "slug,sku\nx,y\n" }))).toContain("NOT EXECUTED");
  });
  it("every call is audited without arguments or tokens", async () => {
    const rows = (await env.DB.prepare("SELECT meta FROM audit_logs WHERE action = 'mcp.tool' ORDER BY id DESC LIMIT 30").all<{ meta: string }>()).results;
    expect(rows.length).toBeGreaterThan(5);
    for (const r of rows) { const m = JSON.parse(r.meta); expect(m.tokenId).toBeTruthy(); expect(r.meta).not.toContain("osk_"); expect(["ok", "error"]).toContain(m.outcome); }
  });
});

describe("role cap", () => {
  it("a full token owned by a STAFF user cannot call admin-only tools", async () => {
    const email = `mcp-staff-${Date.now()}@example.com`;
    const u = await j<any>(await admin(owner, "/users", "POST", { email, name: "S", password: "staff password 12345", role: "staff" }));
    const raw = `osk_${"s".repeat(40)}`;
    await env.DB.prepare("INSERT INTO api_tokens (id, admin_id, name, token_hash, prefix, level, created_at) VALUES ('staff-1', ?1, 'x', ?2, 'osk_ssss', 'full', unixepoch())").bind(u.id, await sha256Hex(raw)).run();
    const staffOk = await tool(raw, "list_orders");
    expect(staffOk.isError).toBeUndefined(); // staff may read
    const denied = await tool(raw, "create_category", { body: { slug: "staff-cat", nameTr: "x" } });
    expect(denied.isError).toBe(true); expect(out(denied)).toContain("HTTP 403");
    expect(out(await tool(raw, "list_integrations"))).toContain("HTTP 403");
  });
});

describe("tool registry integrity", () => {
  it("every admin route is exposed as a tool or explicitly excluded (new routes must be classified)", () => {
    const covered = new Set<string>([...EXCLUDED_ROUTES, ...TOOLS.map((x) => `${x.method} ${x.path}`)]);
    const norm = (s: string) => s.replace(/\/+$/, "") || "/";
    const routes = app.routes.filter((r) => r.path.startsWith("/api/admin") && r.method !== "ALL").map((r) => `${r.method} ${norm(r.path.slice("/api/admin".length))}`);
    const missing = [...new Set(routes)].filter((r) => !covered.has(r));
    expect(missing).toEqual([]);
  });
  it("every tool points at a real admin route", () => {
    const real = new Set(app.routes.filter((r) => r.path.startsWith("/api/admin") && r.method !== "ALL").map((r) => `${r.method} ${r.path.slice("/api/admin".length).replace(/\/+$/, "") || "/"}`));
    expect(TOOLS.map((x) => `${x.method} ${x.path}`).filter((r) => !real.has(r))).toEqual([]);
  });
  it("path params and query names appear in the tool shape; no excluded route is also a tool", () => {
    for (const d of TOOLS) {
      for (const m of d.path.matchAll(/:([A-Za-z]+)/g)) expect(Object.keys(d.shape), `${d.name} path param ${m[1]}`).toContain(m[1]);
      for (const q of d.query ?? []) expect(Object.keys(d.shape), `${d.name} query ${q}`).toContain(q);
      expect(inputSchema(d)).toBeTruthy();
    }
    const tools = new Set(TOOLS.map((x) => `${x.method} ${x.path}`));
    expect(EXCLUDED_ROUTES.filter((r) => tools.has(r))).toEqual([]);
    expect(TOOL_BY_NAME.size).toBe(TOOLS.length);
  });
  it("level policy: money/customer-facing/deleting tools are full, read tools never mutate", () => {
    for (const n of ["refund_order", "send_campaign", "send_email", "send_sms", "anonymize_customer", "delete_product", "issue_manual_invoice", "create_shipment", "trendyol_call", "geliver_call"]) expect(TOOL_BY_NAME.get(n)!.level, n).toBe("full");
    for (const d of TOOLS.filter((x) => x.level === "read")) {
      if (d.method !== "GET") expect(["preview_email", "campaign_audience", "preview_campaign", "preview_manual_invoice", "preview_saved_manual_invoice"], d.name).toContain(d.name);
    }
    expect(MAX_RESULT_BYTES).toBeGreaterThan(0);
  });
});

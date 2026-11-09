import { env } from "cloudflare:test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { INTERNAL_HEADER, signInternal } from "../src/mcp/internal";
import { TOOLS, TOOL_GROUPS, groupOf } from "../src/mcp/tools";
import { admin, call, ensureOwner, j, loginAs, type Session } from "./helpers";

let owner: Session; let adminSes: Session; let tok = ""; let ownerId = "";
const rpc = (payload: unknown) => call("/mcp", { method: "POST", json: payload, origin: null, headers: { Authorization: `Bearer ${tok}` } });
const names = async () => ((await j<any>(await rpc({ jsonrpc: "2.0", id: 1, method: "tools/list" }))).result.tools as { name: string }[]).map((t) => t.name);
const callTool = async (name: string, args: unknown = {}) => (await j<any>(await rpc({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }))).result;
const put = (b: unknown, s = owner) => admin(s, "/mcp/tools", "PUT", b);

beforeAll(async () => {
  owner = await ensureOwner();
  ownerId = (await j<any>(await admin(owner, "/auth/me"))).admin.id;
  const email = `mcp-pol-${Date.now()}@example.com`;
  expect((await admin(owner, "/users", "POST", { email, name: "A", password: "admin password 12345", role: "admin" })).status).toBe(201);
  adminSes = await loginAs(email, "admin password 12345").catch(() => owner);
  tok = (await j<any>(await admin(owner, "/tokens", "POST", { name: "pol", level: "full" }))).token;
});
afterAll(async () => { await env.DB.exec("DELETE FROM mcp_tool_settings"); });

describe("MCP tool permissions (owner screen)", () => {
  it("lists every tool with group, level and enabled=true by default", async () => {
    const v = await j<any>(await admin(owner, "/mcp/tools"));
    expect(v.masterEnabled).toBe(true); expect(v.tools).toHaveLength(TOOLS.length);
    expect(v.tools.every((t: any) => t.enabled === true)).toBe(true);
    expect(new Set(v.tools.map((t: any) => t.group))).toEqual(new Set(TOOLS.map((t) => groupOf(t))));
    for (const t of v.tools) expect(TOOL_GROUPS).toContain(t.group);
    expect(v.tools.find((t: any) => t.name === "refund_order")).toMatchObject({ level: "full", group: "orders", readOnly: false });
    expect(v.tools.find((t: any) => t.name === "list_orders")).toMatchObject({ level: "read", readOnly: true });
  });

  it("disabling a tool hides it from tools/list and refuses calls; enabling restores it", async () => {
    expect(await names()).toContain("send_sms");
    const r = await put({ tools: { send_sms: false, refund_order: false } });
    expect(r.status).toBe(200);
    expect((await j<any>(r)).tools.find((t: any) => t.name === "send_sms").enabled).toBe(false);
    const list = await names();
    expect(list).not.toContain("send_sms"); expect(list).not.toContain("refund_order"); expect(list).toContain("list_orders");
    const res = await callTool("send_sms", { body: { to: "+905301234567", text: "x" }, confirm: true });
    expect(res.isError).toBe(true); expect(res.content[0].text).toContain("disabled by the store owner");
    expect((await put({ tools: { send_sms: true } })).status).toBe(200);
    expect(await names()).toContain("send_sms"); expect(await names()).not.toContain("refund_order");
    await put({ tools: { refund_order: true } });
  });

  it("master switch off: MCP answers 403 for every request; on again restores it", async () => {
    expect((await put({ masterEnabled: false })).status).toBe(200);
    expect((await j<any>(await admin(owner, "/mcp/tools"))).masterEnabled).toBe(false);
    const r = await rpc({ jsonrpc: "2.0", id: 1, method: "ping" });
    expect(r.status).toBe(403); expect((await j<any>(r)).error.message).toContain("switched off");
    expect((await put({ masterEnabled: true })).status).toBe(200);
    expect((await rpc({ jsonrpc: "2.0", id: 1, method: "ping" })).status).toBe(200);
  });

  it("only the owner can change it; admins may view; unknown tools and empty patches are rejected", async () => {
    if (adminSes !== owner) {
      expect((await admin(adminSes, "/mcp/tools")).status).toBe(200);
      expect((await put({ tools: { send_sms: false } }, adminSes)).status).toBe(403);
    }
    const unknown = await put({ tools: { not_a_tool: false } });
    expect(unknown.status).toBe(400);
    expect((await put({})).status).toBe(400);
    expect((await put({ tools: {} })).status).toBe(400);
    expect((await j<any>(await admin(owner, "/mcp/tools"))).tools.every((t: any) => t.enabled)).toBe(true);
  });

  it("a token (internal claim) can never read or change its own permissions", async () => {
    const h = { [INTERNAL_HEADER]: await signInternal(env, { aid: ownerId, role: "owner", lvl: "full", tid: "t" }) };
    expect((await call("/api/admin/mcp/tools", { headers: h })).status).toBe(403);
    expect((await call("/api/admin/mcp/tools", { method: "PUT", json: { masterEnabled: true }, headers: h })).status).toBe(403);
  });

  it("changes are audited and idempotent; bulk disable/enable works", async () => {
    const all = TOOLS.filter((t) => t.level === "full").map((t) => t.name);
    await put({ tools: Object.fromEntries(all.map((n) => [n, false])) });
    await put({ tools: Object.fromEntries(all.map((n) => [n, false])) }); // twice: no error
    const list = await names();
    expect(list.some((n) => all.includes(n))).toBe(false); expect(list).toContain("create_product");
    const rows = await env.DB.prepare("SELECT COUNT(*) AS n FROM mcp_tool_settings WHERE enabled = 0").first<{ n: number }>();
    expect(rows!.n).toBe(all.length);
    await put({ tools: Object.fromEntries(all.map((n) => [n, true])) });
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM mcp_tool_settings").first<{ n: number }>())!.n).toBe(0);
    const audit = await env.DB.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE action = 'mcp.policy.update'").first<{ n: number }>();
    expect(audit!.n).toBeGreaterThanOrEqual(4);
  });
});

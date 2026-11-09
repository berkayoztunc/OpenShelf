import type { Hono } from "hono";
import { eq } from "drizzle-orm";
import { zodToJsonSchema } from "zod-to-json-schema";
import { apiTokens, admins, auditLogs } from "@openshelf/db";
import type { Role } from "@openshelf/shared";
import type { AppEnv, Db } from "../env";
import { sha256Hex } from "../lib/crypto";
import { hit } from "../middleware/security";
import { GUIDE, GUIDE_URI, PROMPTS } from "./guide";
import { INTERNAL_HEADER, signInternal } from "./internal";
import { LEVEL_RANK, TOOLS, TOOL_BY_NAME, inputSchema, type Level, type ToolDef } from "./tools";
import { loadPolicy, type ToolPolicy } from "./policy";

export const TOKEN_PREFIX = "osk_";
export const MCP_RATE_PER_MIN = 120;
export const MAX_RESULT_BYTES = 100_000;
const PROTOCOLS = ["2025-06-18", "2025-03-26", "2024-11-05"];
type Ctx = Parameters<Hono<AppEnv>["fetch"]>[2];
const SERVER_INFO = { name: "openshelf", version: "1.0.0" };
const INSTRUCTIONS = "OpenShelf store management. Read the openshelf://guide resource first (units, channels, safety rules). Money is in minor units (kuruş). Destructive tools need confirm: true; ask the human before confirming.";

interface Principal { tokenId: string; adminId: string; role: Role; level: Level; ip: string }

const rpcError = (id: unknown, code: number, message: string, data?: unknown) => ({ jsonrpc: "2.0" as const, id: id ?? null, error: { code, message, ...(data !== undefined ? { data } : {}) } });
const rpcResult = (id: unknown, result: unknown) => ({ jsonrpc: "2.0" as const, id, result });
const text = (s: string, isError = false) => ({ content: [{ type: "text", text: s }], ...(isError ? { isError: true } : {}) });

/** Token -> principal. Revoked, expired, unknown tokens and disabled admins all look the same to the caller (401). */
export async function authenticateToken(db: Db, raw: string, now = new Date()): Promise<Omit<Principal, "ip"> | null> {
  if (!raw.startsWith(TOKEN_PREFIX) || raw.length < 20 || raw.length > 200) return null;
  const hash = await sha256Hex(raw);
  const [r] = await db.select({ t: apiTokens, a: admins }).from(apiTokens).innerJoin(admins, eq(admins.id, apiTokens.adminId)).where(eq(apiTokens.tokenHash, hash)).limit(1);
  if (!r || r.t.revokedAt || r.a.disabled) return null;
  if (r.t.expiresAt && r.t.expiresAt.getTime() <= now.getTime()) return null;
  if (!r.t.lastUsedAt || now.getTime() - r.t.lastUsedAt.getTime() > 60_000) await db.update(apiTokens).set({ lastUsedAt: now }).where(eq(apiTokens.id, r.t.id));
  return { tokenId: r.t.id, adminId: r.a.id, role: r.a.role as Role, level: (r.t.level as Level) ?? "read" };
}

const toolJson = (d: ToolDef) => {
  const { $schema: _s, ...schema } = zodToJsonSchema(inputSchema(d), { target: "jsonSchema7", $refStrategy: "none" }) as Record<string, unknown>;
  return {
    name: d.name, title: d.title, description: `[${d.level}] ${d.description}`, inputSchema: schema,
    annotations: { title: d.title, readOnlyHint: d.method === "GET" || d.level === "read", destructiveHint: d.level === "full", idempotentHint: d.method === "GET" || d.method === "PUT" || d.method === "DELETE", openWorldHint: false },
  };
};
export const visibleTools = (level: Level, policy?: ToolPolicy) => TOOLS.filter((t) => LEVEL_RANK[t.level] <= LEVEL_RANK[level] && !policy?.disabled.has(t.name));

function truncate(s: string): string {
  if (new TextEncoder().encode(s).length <= MAX_RESULT_BYTES) return s;
  return `${s.slice(0, MAX_RESULT_BYTES / 2)}\n…[truncated: result too large, use filters/paging]`;
}

/** Runs one tool by calling the REAL admin route in-process with a signed internal claim (inherits roles, validation, rate limits, audit). */
export async function callTool(app: Hono<AppEnv>, env: AppEnv["Bindings"], ctx: Ctx, origin: string, p: Principal, name: string, rawArgs: unknown, policy?: ToolPolicy) {
  const def = TOOL_BY_NAME.get(name);
  if (!def) return text(`Unknown tool: ${name}`, true);
  if (policy?.disabled.has(name)) return text(`Tool "${name}" is disabled by the store owner (Settings → MCP → Tools). Do not retry; tell the human if you need it enabled.`, true);
  if (LEVEL_RANK[p.level] < LEVEL_RANK[def.level]) return text(`This token has level "${p.level}" but "${name}" needs level "${def.level}". Ask the owner for a token with a higher level.`, true);
  const parsed = inputSchema(def).safeParse(rawArgs ?? {});
  if (!parsed.success) return text(`Invalid arguments: ${parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ")}`, true);
  const args = parsed.data as Record<string, unknown>;
  if (def.level === "full" && !def.noConfirm && args["confirm"] !== true) {
    return text(`NOT EXECUTED. "${name}" is a ${def.level}-level action: ${def.description}\nIf the human really wants this, call the tool again with the same arguments plus confirm: true.`);
  }
  // build the internal request
  let path = def.path.replace(/:([A-Za-z]+)/g, (_m, k: string) => encodeURIComponent(String(args[k] ?? "")));
  const qs = new URLSearchParams();
  for (const k of def.query ?? []) { const v = args[k]; if (v !== undefined && v !== null && v !== "") qs.set(k, String(v)); }
  if ([...qs].length) path += `?${qs}`;
  const headers = new Headers({ [INTERNAL_HEADER]: await signInternal(env, { aid: p.adminId, role: p.role, lvl: p.level, tid: p.tokenId }), "CF-Connecting-IP": p.ip, "user-agent": "openshelf-mcp" });
  let body: BodyInit | undefined;
  if (def.upload === "csv") { const f = new FormData(); f.set("file", new File([String(args["csv"])], "import.csv", { type: "text/csv" })); body = f; }
  else if (def.method !== "GET" && def.method !== "DELETE") {
    const key = def.bodyArg ?? "body";
    if (key in def.shape) { headers.set("content-type", "application/json"); body = JSON.stringify(args[key] ?? {}); }
  }
  const res = await app.fetch(new Request(`${origin}/api/admin${path}`, { method: def.method, headers, body }), env, ctx);
  const raw = await res.text();
  let out: string;
  try { out = JSON.stringify(JSON.parse(raw), null, 1); } catch { out = raw; }
  return text(truncate(res.ok ? (out || `OK (${res.status})`) : `HTTP ${res.status}: ${out}`), !res.ok);
}

async function audit(db: Db, p: Principal, tool: string, outcome: string) {
  await db.insert(auditLogs).values({ adminId: p.adminId, action: "mcp.tool", entity: "mcp", entityId: tool, meta: { tokenId: p.tokenId, level: p.level, outcome }, ip: p.ip }).catch(() => {});
}

async function handle(app: Hono<AppEnv>, env: AppEnv["Bindings"], ctx: Ctx, db: Db, origin: string, p: Principal, policy: ToolPolicy, msg: any) {
  const id = msg?.id; const method = msg?.method; const params = msg?.params ?? {};
  if (!msg || msg.jsonrpc !== "2.0" || typeof method !== "string") return rpcError(id, -32600, "Invalid Request");
  switch (method) {
    case "initialize": {
      const want = typeof params.protocolVersion === "string" ? params.protocolVersion : PROTOCOLS[0]!;
      return rpcResult(id, { protocolVersion: PROTOCOLS.includes(want) ? want : PROTOCOLS[0], capabilities: { tools: { listChanged: false }, resources: {}, prompts: {} }, serverInfo: SERVER_INFO, instructions: INSTRUCTIONS });
    }
    case "ping": return rpcResult(id, {});
    case "tools/list": return rpcResult(id, { tools: visibleTools(p.level, policy).map(toolJson) });
    case "tools/call": {
      const name = String(params.name ?? "");
      const r = await callTool(app, env, ctx, origin, p, name, params.arguments, policy);
      await audit(db, p, name, (r as { isError?: boolean }).isError ? "error" : "ok");
      return rpcResult(id, r);
    }
    case "resources/list": return rpcResult(id, { resources: [{ uri: GUIDE_URI, name: "OpenShelf guide", description: "Units, channels, safety rules and workflows", mimeType: "text/markdown" }] });
    case "resources/read":
      if (params.uri !== GUIDE_URI) return rpcError(id, -32002, "Resource not found");
      return rpcResult(id, { contents: [{ uri: GUIDE_URI, mimeType: "text/markdown", text: GUIDE }] });
    case "prompts/list": return rpcResult(id, { prompts: PROMPTS.map((x) => ({ name: x.name, description: x.description })) });
    case "prompts/get": {
      const pr = PROMPTS.find((x) => x.name === params.name);
      if (!pr) return rpcError(id, -32602, "Unknown prompt");
      return rpcResult(id, { description: pr.description, messages: [{ role: "user", content: { type: "text", text: pr.text } }] });
    }
    default:
      return method.startsWith("notifications/") ? null : rpcError(id, -32601, `Method not found: ${method}`);
  }
}

const jsonRes = (body: unknown, status = 200, extra: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...extra } });

/** Streamable HTTP (stateless). POST = JSON-RPC (single or batch); answers JSON, or one SSE event when the client only accepts text/event-stream. */
export function mountMcp(app: Hono<AppEnv>) {
  app.all("/mcp", async (c) => {
    if (c.req.method !== "POST") return new Response("MCP endpoint: POST JSON-RPC (Streamable HTTP, stateless)", { status: 405, headers: { Allow: "POST" } });
    const db = c.get("db");
    const auth = c.req.header("Authorization") ?? "";
    const who = auth.startsWith("Bearer ") ? await authenticateToken(db, auth.slice(7).trim()) : null;
    if (!who) return jsonRes(rpcError(null, -32001, "Unauthorized: send Authorization: Bearer osk_… (create a token in Settings → MCP)"), 401, { "WWW-Authenticate": 'Bearer realm="openshelf-mcp"' });
    const r = await hit(c.env.DB, `mcp:${who.tokenId}`, 60);
    if (r.count > MCP_RATE_PER_MIN) return jsonRes(rpcError(null, -32000, "Rate limit exceeded"), 429, { "Retry-After": String(r.resetIn) });
    const policy = await loadPolicy(db);
    if (!policy.masterEnabled) return jsonRes(rpcError(null, -32003, "MCP access is switched off by the store owner (Settings → MCP)."), 403);
    const p: Principal = { ...who, ip: c.get("ip") };
    let payload: unknown;
    try { payload = await c.req.json(); } catch { return jsonRes(rpcError(null, -32700, "Parse error"), 400); }
    const origin = new URL(c.req.url).origin;
    const run = (m: unknown) => handle(app, c.env, c.executionCtx as unknown as Ctx, db, origin, p, policy, m).catch((e) => rpcError((m as { id?: unknown })?.id, -32603, e instanceof Error ? e.message : "Internal error"));
    let out: unknown;
    if (Array.isArray(payload)) { if (payload.length === 0 || payload.length > 20) return jsonRes(rpcError(null, -32600, "Invalid batch"), 400); const rs = (await Promise.all(payload.map(run))).filter((x) => x !== null); out = rs.length ? rs : null; }
    else out = await run(payload);
    if (out === null) return new Response(null, { status: 202 }); // notifications only
    const accept = c.req.header("Accept") ?? "";
    if (accept.includes("text/event-stream") && !accept.includes("application/json")) {
      return new Response(`event: message\ndata: ${JSON.stringify(out)}\n\n`, { headers: { "content-type": "text/event-stream", "cache-control": "no-store" } });
    }
    return jsonRes(out);
  });
}

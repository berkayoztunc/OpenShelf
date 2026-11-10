import type { Hono } from "hono";
import { eq } from "drizzle-orm";
import { zodToJsonSchema } from "zod-to-json-schema";
import { apiTokens, admins, auditLogs } from "@openshelf/db";
import type { Role } from "@openshelf/shared";
import type { AppEnv, Db } from "../env";
import { sha256Hex } from "../lib/crypto";
import { hit } from "../middleware/security";
import { GUIDE, GUIDE_URI, HELP_URI, PROMPTS } from "./guide";
import { INTERNAL_HEADER, signInternal } from "./internal";
import { LEVEL_RANK, TOOLS, TOOL_BY_NAME, inputSchema, type Level, type ToolDef } from "./tools";
import { loadPolicy, type ToolPolicy } from "./policy";
import { verifyTicket } from "../lib/tickets";
import { helpRead, helpTopics, type HelpLang } from "../lib/help";
import { getSettings } from "../lib/settings";
import { R2_LIMIT } from "../lib/media";

export const TOKEN_PREFIX = "osk_";
export const MCP_RATE_PER_MIN = 120;
export const MAX_RESULT_BYTES = 100_000;
/** Longest base64 string upload_media accepts (~21 KB of image). Bigger ones are cut off by chat clients anyway: refuse before decoding. */
export const BASE64_MAX_CHARS = 28_000;
const PROTOCOLS = ["2025-06-18", "2025-03-26", "2024-11-05"];
type Ctx = Parameters<Hono<AppEnv>["fetch"]>[2];
const SERVER_INFO = { name: "openshelf", version: "1.0.0" };
const INSTRUCTIONS = "OpenShelf store management. Read the openshelf://guide resource first (units, channels, safety rules). Money is in minor units (kuruş). Destructive tools need confirm: true; ask the human before confirming. To get a file into the store call upload_help first (never paste big base64). When unsure how a feature or setting works, search the built-in user guide with help_search / help_read instead of guessing.";

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

/** MIME from magic bytes so the upload route's declared-vs-real type check passes for any allowed format. */
const sniffMime = (b: Uint8Array) => {
  const s = (o: number, n: number) => String.fromCharCode(...b.slice(o, o + n));
  if (b[0] === 0x89 && s(1, 3) === "PNG") return "image/png";
  if (b[0] === 0xff && b[1] === 0xd8) return "image/jpeg";
  if (s(0, 4) === "RIFF" && s(8, 4) === "WEBP") return "image/webp";
  if (s(0, 3) === "GIF") return "image/gif";
  if (s(4, 4) === "ftyp") return "image/avif";
  return "application/octet-stream";
};
const toolJson = (d: ToolDef) => {
  const { $schema: _s, ...schema } = zodToJsonSchema(inputSchema(d), { target: "jsonSchema7", $refStrategy: "none" }) as Record<string, unknown>;
  return {
    name: d.name, title: d.title, description: `[${d.level}] ${d.description}`, inputSchema: schema,
    ...(d.fileParams ? { _meta: { "openai/fileParams": d.fileParams } } : {}),
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
  else if (def.upload === "base64") {
    if (String(args["data"]).length > BASE64_MAX_CHARS) return text(`Refused: this image is too large to send as base64 (over ~20 KB). Do not retry this way. Call upload_help: use upload_media_from_url / add_product_images with a public https link, a curl upload to /mcp/upload from a shell, or ask the human to drop the file in the admin panel (Katalog → Medya).`, true);
    let bytes: Uint8Array;
    try { bytes = Uint8Array.from(atob(String(args["data"]).replace(/^data:[^,]*,/, "").replace(/\s+/g, "")), (ch) => ch.charCodeAt(0)); }
    catch { return text("Invalid arguments: data is not valid base64", true); }
    const f = new FormData();
    f.set("file", new File([bytes as BlobPart], String(args["filename"] ?? "upload"), { type: sniffMime(bytes) }));
    f.set("kind", String(args["kind"])); if (args["alt"]) f.set("alt", String(args["alt"]));
    body = f;
  }
  else if (def.method !== "GET" && def.method !== "DELETE") {
    const key = def.bodyArg ?? "body";
    if (key in def.shape) { headers.set("content-type", "application/json"); body = JSON.stringify((def.rawBody ? (rawArgs as Record<string, unknown> | undefined)?.[key] : args[key]) ?? {}); }
  }
  const res = await app.fetch(new Request(`${origin}/api/admin${path}`, { method: def.method, headers, body }), env, ctx);
  if (def.name === "view_image" && res.ok) { // hand the picture to the model as an image block, not as a wall of base64 text
    const { base64, ...meta } = (await res.json()) as { base64: string; mime: string } & Record<string, unknown>;
    return { content: [{ type: "image", data: base64, mimeType: meta.mime }, { type: "text", text: JSON.stringify({ ...meta, ...(typeof meta["proxyUrl"] === "string" ? { proxyUrl: `${origin}${meta["proxyUrl"]}` } : {}) }) }] };
  }
  // links in results must be usable outside the store (AI sandboxes, designs): make our own relative links absolute
  const raw = (await res.text()).replace(/("(?:proxyUrl|url)"\s*:\s*")(\/(?:img|media)\/)/g, `$1${origin}$2`);
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
    case "resources/list": {
      const lang = (await getSettings(db, "general")).defaultLocale;
      return rpcResult(id, { resources: [
        { uri: GUIDE_URI, name: "OpenShelf guide", description: "Units, channels, safety rules and workflows", mimeType: "text/markdown" },
        ...helpTopics(lang).map((t) => ({ uri: `${HELP_URI}${t.slug}`, name: `Admin guide: ${t.title}`, description: `Chapter of the store's user guide (${t.language}). Add ?lang=tr|en for the other language; the help_read tool reads single sections.`, mimeType: "text/markdown" })),
      ] });
    }
    case "resources/read": {
      const uri = String(params.uri ?? "");
      if (uri === GUIDE_URI) return rpcResult(id, { contents: [{ uri: GUIDE_URI, mimeType: "text/markdown", text: GUIDE }] });
      if (uri.startsWith(HELP_URI)) {
        const [slug = "", query = ""] = uri.slice(HELP_URI.length).split("?");
        const l = new URLSearchParams(query).get("lang"); const lang: HelpLang = l === "en" || l === "tr" ? l : (await getSettings(db, "general")).defaultLocale;
        const r = helpRead(lang, slug);
        if ("markdown" in r) return rpcResult(id, { contents: [{ uri, mimeType: "text/markdown", text: r.markdown }] });
      }
      return rpcError(id, -32002, "Resource not found");
    }
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
  /**
   * File upload for agents that can run a shell (Claude Code, Codex, Cursor, scripts): multipart (file, kind, alt) or a raw image body with ?kind=&alt=.
   * Same Bearer token as /mcp (level write+, respects the owner's tool switches), same validation and audit as the admin upload. The bytes never
   * pass through the conversation, so no tokens are spent on them and nothing gets truncated.
   */
  app.on(["POST", "PUT"], "/mcp/upload", async (c) => {
    const db = c.get("db");
    const jsonErr = (status: number, code: string, message: string, extra: Record<string, string> = {}) => jsonRes({ error: { code, message } }, status, extra);
    const ticketRaw = c.req.header("X-Upload-Ticket");
    let who: Omit<Principal, "ip"> | null = null; let fixed: { kind: string; alt: string | null; n: string } | null = null;
    if (ticketRaw) {
      // ticket mode: a code sandbox that cannot hold the MCP token uploads ONE image with the ticket minted by create_upload_link
      const t = await verifyTicket(c.env, ticketRaw.trim());
      if (!t) return jsonErr(401, "invalid_ticket", "Upload ticket is invalid or expired (they last 10 minutes): call create_upload_link again");
      if ((await c.env.DB.prepare("SELECT count FROM rate_limits WHERE key = ?1").bind(`upl-done:${t.n}`).first<{ count: number }>())?.count) return jsonErr(409, "ticket_used", "This ticket was already used: one ticket uploads one image. Call create_upload_link for more");
      if ((await hit(c.env.DB, `upl-try:${t.n}`, 900)).count > 3) return jsonErr(429, "too_many_attempts", "Too many attempts with this ticket: call create_upload_link again");
      const [adm] = await db.select().from(admins).where(eq(admins.id, t.aid)).limit(1);
      if (!adm || adm.disabled) return jsonErr(401, "invalid_ticket", "Upload ticket is no longer valid");
      who = { tokenId: t.tid, adminId: adm.id, role: adm.role as Role, level: "write" }; fixed = { kind: t.kind, alt: t.alt, n: t.n };
    } else {
      const auth = c.req.header("Authorization") ?? "";
      const raw = /^bearer\s+/i.test(auth) ? auth.replace(/^bearer\s+/i, "").trim() : "";
      who = raw ? await authenticateToken(db, raw) : null;
      if (!who) return jsonErr(401, "unauthorized", "Send Authorization: Bearer osk_… (token from Settings → MCP), or X-Upload-Ticket from create_upload_link");
    }
    const rl = await hit(c.env.DB, `mcp:${who.tokenId}:${c.get("ip")}`, 60);
    if (rl.count > MCP_RATE_PER_MIN) return jsonErr(429, "rate_limited", "Rate limit exceeded", { "Retry-After": String(rl.resetIn) });
    const policy = await loadPolicy(db);
    if (!policy.masterEnabled) return jsonErr(403, "mcp_disabled", "MCP access is switched off by the store owner (Settings → MCP).");
    if (policy.disabled.has(fixed ? "create_upload_link" : "upload_media")) return jsonErr(403, "tool_disabled", `Uploads are disabled by the store owner (Settings → MCP → Tools: ${fixed ? "create_upload_link" : "upload_media"}).`);
    if (LEVEL_RANK[who.level] < LEVEL_RANK.write) return jsonErr(403, "forbidden", `This token has level "${who.level}"; uploading needs "write" or higher.`);
    const max = R2_LIMIT + 64 * 1024;
    if (Number(c.req.header("Content-Length") ?? 0) > max) return jsonErr(413, "payload_too_large", "File too large");
    const ct = c.req.header("Content-Type") ?? "";
    let bytes: Uint8Array; let kind = ""; let alt = ""; let filename = "upload";
    try {
      if (ct.toLowerCase().startsWith("multipart/form-data")) {
        const fd = await c.req.formData(); const f = fd.get("file");
        if (!(f instanceof File)) return jsonErr(400, "validation_error", "multipart field `file` is required (curl -F file=@photo.jpg)");
        bytes = new Uint8Array(await f.arrayBuffer()); filename = f.name || filename; kind = String(fd.get("kind") ?? ""); alt = String(fd.get("alt") ?? "");
      } else if (ct.toLowerCase().startsWith("image/") || (fixed && ct.toLowerCase().startsWith("application/octet-stream"))) {
        bytes = new Uint8Array(await c.req.arrayBuffer()); kind = c.req.query("kind") ?? ""; alt = c.req.query("alt") ?? ""; filename = c.req.query("filename") ?? filename;
      } else return jsonErr(415, "unsupported_media_type", "Send multipart/form-data (file, kind, alt) or a raw image body (Content-Type: image/jpeg|png|webp|gif|avif)" + (fixed ? "" : " with ?kind="));
    } catch { return jsonErr(400, "validation_error", "Malformed request body"); }
    if (fixed) { kind = fixed.kind; alt = fixed.alt ?? alt; }                       // the ticket decides what the image is for
    if (bytes.byteLength > max) return jsonErr(413, "payload_too_large", "File too large");
    const f = new FormData(); f.set("file", new File([bytes as BlobPart], filename, { type: sniffMime(bytes) })); f.set("kind", kind); if (alt) f.set("alt", alt);
    const origin = new URL(c.req.url).origin;
    const headers = new Headers({ [INTERNAL_HEADER]: await signInternal(c.env, { aid: who.adminId, role: who.role, lvl: who.level, tid: who.tokenId }), "CF-Connecting-IP": c.get("ip"), "user-agent": "openshelf-mcp-upload" });
    const res = await app.fetch(new Request(`${origin}/api/admin/media`, { method: "POST", headers, body: f }), c.env, c.executionCtx as unknown as Ctx);
    if (fixed && res.ok) await hit(c.env.DB, `upl-done:${fixed.n}`, 900);               // the ticket is spent only by a successful upload
    await audit(db, { ...who, ip: c.get("ip") }, fixed ? "upload_media(ticket)" : "upload_media(file)", res.ok ? "ok" : "error");
    return new Response(await res.text(), { status: res.status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
  });
  // Bearer token = an OAuth access token (osk_…, 1 h, from /oauth/token) or a personal access token (osk_…, created in Settings -> MCP).
  // A token in the URL is deliberately NOT supported: URLs end up in logs, history and screenshots.
  app.all("/mcp", async (c) => {
    if (c.req.method !== "POST") return new Response("MCP endpoint: POST JSON-RPC (Streamable HTTP, stateless)", { status: 405, headers: { Allow: "POST" } });
    const db = c.get("db");
    const auth = c.req.header("Authorization") ?? "";
    const raw = /^bearer\s+/i.test(auth) ? auth.replace(/^bearer\s+/i, "").trim() : "";
    const who = raw ? await authenticateToken(db, raw) : null;
    if (!who) return jsonRes(rpcError(null, -32001, "Unauthorized: authorize this app via OAuth (see resource_metadata) or send Authorization: Bearer osk_… (token from Settings → MCP)"), 401,
      { "WWW-Authenticate": `Bearer realm="openshelf-mcp", resource_metadata="${new URL(c.req.url).origin}/.well-known/oauth-protected-resource"` });
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

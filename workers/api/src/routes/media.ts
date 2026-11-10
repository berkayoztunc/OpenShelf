import { Hono } from "hono";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { auditLogs, media } from "@openshelf/db";
import { IMAGE_GENERAL, IMAGE_SPECS, MEDIA_KINDS, checkImage, imageSize, type MediaKind } from "@openshelf/shared";
import type { AppEnv } from "../env";
import { ApiError, body, notFound } from "../lib/http";
import { audit } from "../lib/audit";
import { requireRole } from "../middleware/auth";
import { hit } from "../middleware/security";
import { fetchImageBytes } from "../lib/imageFetch";
import { signTicket, verifyTicket } from "../lib/tickets";
import { sha256Hex, toBytes } from "../lib/crypto";
import { ALLOWED_MIMES, D1_LIMITS, R2_LIMIT, sniffImage } from "../lib/media";

/** Public: GET /media/:id */
export const mediaPublic = new Hono<AppEnv>();
mediaPublic.get("/:id", async (c) => {
  const row = await c.env.DB.prepare("SELECT mime, size, sha256, r2_key, data FROM media WHERE id = ?1").bind(c.req.param("id")).first<{ mime: string; size: number; sha256: string; r2_key: string | null; data: unknown }>();
  if (!row) throw notFound("Media");
  const etag = `"${row.sha256}"`;
  const headers: Record<string, string> = {
    "Content-Type": row.mime, "Cache-Control": "public, max-age=31536000, immutable", ETag: etag,
    "X-Content-Type-Options": "nosniff", "Cross-Origin-Resource-Policy": "cross-origin", "Content-Disposition": "inline",
  };
  if (c.req.header("If-None-Match") === etag) return new Response(null, { status: 304, headers });
  if (row.r2_key && c.env.MEDIA) {
    const obj = await c.env.MEDIA.get(row.r2_key);
    if (!obj) throw notFound("Media");
    return new Response(obj.body, { headers: { ...headers, "Content-Length": String(row.size) } });
  }
  if (!row.data) throw notFound("Media");
  const bytes = toBytes(row.data);
  return new Response(bytes, { headers: { ...headers, "Content-Length": String(bytes.length) } });
});

/** Reads a stream fully but aborts (413) as soon as more than `max` bytes have arrived. */
async function readLimited(stream: ReadableStream<Uint8Array>, max: number): Promise<Uint8Array<ArrayBuffer>> {
  const reader = stream.getReader(); const chunks: Uint8Array[] = []; let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    n += value.byteLength;
    if (n > max) { await reader.cancel().catch(() => {}); throw new ApiError(413, "payload_too_large", "File too large"); }
    chunks.push(value);
  }
  const out = new Uint8Array(n); let o = 0;
  for (const ch of chunks) { out.set(ch, o); o += ch.byteLength; }
  return out;
}

/** Limit in force for a kind (R2 when bound, otherwise the D1 per-kind limit). */
export const limitFor = (env: { MEDIA?: unknown }, kind: MediaKind) => (env.MEDIA ? R2_LIMIT : D1_LIMITS[kind]!);

/** Validates (real type by content, size) and stores an image; shared by the multipart upload, the URL import and the ticket upload. */
async function storeImage(c: { env: AppEnv["Bindings"]; get(k: "db"): AppEnv["Variables"]["db"] }, o: { bytes: Uint8Array<ArrayBuffer>; kind: MediaKind; alt: string | null; declaredMime?: string; adminId: string | null }) {
  const { bytes, kind } = o; const limit = limitFor(c.env, kind); const useR2 = !!c.env.MEDIA;
  if (bytes.byteLength > limit) throw new ApiError(413, "payload_too_large", `File exceeds ${Math.floor(limit / 1024)}KB limit for ${kind}`);
  const sniffed = sniffImage(bytes);
  if (!sniffed || !ALLOWED_MIMES.includes(sniffed)) throw new ApiError(415, "unsupported_media_type", "Only png, jpeg, webp, gif and avif images are allowed (SVG is rejected)");
  if (o.declaredMime && o.declaredMime.toLowerCase() !== sniffed) throw new ApiError(415, "mime_mismatch", "File content does not match declared type");
  const id = crypto.randomUUID(); const sha = await sha256Hex(bytes);
  let r2Key: string | null = null;
  if (useR2) { r2Key = `media/${id}`; await c.env.MEDIA!.put(r2Key, bytes, { httpMetadata: { contentType: sniffed } }); }
  await c.get("db").insert(media).values({ id, kind, mime: sniffed, size: bytes.length, sha256: sha, r2Key, data: useR2 ? null : Buffer.from(bytes), alt: o.alt ? o.alt.slice(0, 300) : null, createdBy: o.adminId });
  // best-effort dimensions (png/jpeg/webp/gif) so a generator/uploader learns immediately if the image does not fit its slot
  const dim = imageSize(bytes);
  return { id, url: `/media/${id}`, mime: sniffed, size: bytes.length, ...(dim ? { width: dim.width, height: dim.height } : {}), warnings: dim ? checkImage(kind, dim.width, dim.height) : [] };
}
const isKind = (k: unknown): k is MediaKind => (MEDIA_KINDS as readonly string[]).includes(String(k));

/** Public, ticket-authenticated raw upload (PUT /media/upload/:ticket). The ticket is minted by an admin/MCP call: short-lived, single use, fixed kind. */
mediaPublic.put("/upload/:ticket", async (c) => {
  const t = await verifyTicket(c.env, c.req.param("ticket"));
  if (!t) throw new ApiError(401, "invalid_ticket", "Upload link is invalid or expired: create a new one");
  if ((await hit(c.env.DB, `upload-ticket:${t.n}`, 900)).count > 1) throw new ApiError(409, "ticket_used", "This upload link was already used: create a new one");
  if (!isKind(t.kind)) throw new ApiError(400, "validation_error", "Bad ticket");
  const limit = limitFor(c.env, t.kind);
  if (Number(c.req.header("Content-Length") ?? 0) > limit) throw new ApiError(413, "payload_too_large", `File exceeds ${Math.floor(limit / 1024)}KB limit for ${t.kind}`);
  const bytes = c.req.raw.body ? await readLimited(c.req.raw.body, limit) : new Uint8Array();
  const r = await storeImage(c, { bytes, kind: t.kind, alt: t.alt, adminId: t.aid });
  await c.get("db").insert(auditLogs).values({ adminId: t.aid, action: "media.upload", entity: "media", entityId: r.id, meta: { kind: t.kind, mime: r.mime, size: r.size, via: "upload-link" }, ip: c.get("ip") }).catch(() => {});
  return c.json(r, 201);
});

/** Admin: mounted under /api/admin/media */
export const adminMedia = new Hono<AppEnv>();
adminMedia.post("/", requireRole("admin"), async (c) => {
  const ct = c.req.header("Content-Type") ?? "";
  if (!ct.toLowerCase().startsWith("multipart/form-data")) throw new ApiError(415, "unsupported_media_type", "multipart/form-data required");
  const declaredLen = Number(c.req.header("Content-Length") ?? 0);
  if (declaredLen > R2_LIMIT + 64 * 1024) throw new ApiError(413, "payload_too_large", "File too large");
  // Count real bytes while streaming the body; Content-Length can be absent or a lie.
  const maxBody = R2_LIMIT + 64 * 1024;
  const rawBody = c.req.raw.body ? await readLimited(c.req.raw.body, maxBody) : new Uint8Array();
  let fd: FormData;
  try { fd = await new Request("http://upload.invalid/", { method: "POST", headers: { "Content-Type": ct }, body: new Blob([rawBody as BlobPart]) }).formData(); }
  catch { throw new ApiError(400, "validation_error", "Malformed multipart body"); }
  const form = { file: fd.get("file"), kind: fd.get("kind"), alt: fd.get("alt") } as Record<string, unknown>;
  const file = form["file"];
  const kind = String(form["kind"] ?? "") as MediaKind;
  if (!(file instanceof File)) throw new ApiError(400, "validation_error", "file is required");
  if (!(MEDIA_KINDS as readonly string[]).includes(kind)) throw new ApiError(400, "validation_error", `kind must be one of ${MEDIA_KINDS.join(", ")}`);
  const limit = limitFor(c.env, kind);
  if (file.size > limit) throw new ApiError(413, "payload_too_large", `File exceeds ${Math.floor(limit / 1024)}KB limit for ${kind}`);
  const r = await storeImage(c, { bytes: new Uint8Array(await file.arrayBuffer()), kind, alt: typeof form["alt"] === "string" ? form["alt"] : null, declaredMime: file.type || undefined, adminId: c.get("admin")!.id });
  await audit(c, "media.upload", "media", r.id, { kind, mime: r.mime, size: r.size });
  return c.json(r, 201);
});

const ImportBody = z.object({ kind: z.enum(MEDIA_KINDS), url: z.string().min(8).max(2000), alt: z.string().max(300).optional() });
/** Server-side download of an image from a public https URL (SSRF-guarded). Lets an AI client hand over a link instead of megabytes of base64. */
adminMedia.post("/import", requireRole("admin"), async (c) => {
  const b = await body(c, ImportBody);
  const bytes = await fetchImageBytes(b.url, limitFor(c.env, b.kind));
  const r = await storeImage(c, { bytes, kind: b.kind, alt: b.alt ?? null, adminId: c.get("admin")!.id });
  await audit(c, "media.import", "media", r.id, { kind: b.kind, host: new URL(b.url).host, size: r.size });
  return c.json(r, 201);
});

const LinkBody = z.object({ kind: z.enum(MEDIA_KINDS), alt: z.string().max(300).optional() });
/** One-time upload link for clients that can run an HTTP request but cannot put a large file into a tool argument. */
adminMedia.post("/upload-link", requireRole("admin"), async (c) => {
  const b = await body(c, LinkBody); const a = c.get("admin")!;
  const ticket = await signTicket(c.env, { aid: a.id, kind: b.kind, alt: b.alt ?? null });
  const uploadUrl = `${new URL(c.req.url).origin}/media/upload/${ticket}`;
  await audit(c, "media.upload_link", "media", b.kind, { kind: b.kind });
  return c.json({ uploadUrl, method: "PUT", body: "raw image bytes (not multipart, not base64)", expiresInSeconds: 600, singleUse: true, maxBytes: limitFor(c.env, b.kind), kind: b.kind, example: `curl -X PUT --data-binary @image.png "${uploadUrl}"` }, 201);
});
/** Image requirements per kind (recommended size, aspect, safe area, limits actually in force). Used by the MCP get_image_specs tool. */
adminMedia.get("/specs", requireRole("staff"), (c) => {
  const r2 = !!c.env.MEDIA;
  return c.json({
    storage: r2 ? "r2" : "d1",
    kinds: MEDIA_KINDS.map((k) => ({ ...IMAGE_SPECS[k], maxBytes: r2 ? R2_LIMIT : D1_LIMITS[k], maxKB: Math.floor((r2 ? R2_LIMIT : D1_LIMITS[k]!) / 1024) })),
    general: IMAGE_GENERAL,
    upload: "upload_media_from_url (MCP, best: public https link, server downloads it), create_upload_link (one-time PUT link), upload_media (MCP, small base64 only) or POST /api/admin/media multipart (file, kind, alt). Responses include width, height and warnings when the image does not fit its slot.",
  });
});
adminMedia.get("/", requireRole("staff"), async (c) => {
  const kind = c.req.query("kind");
  const rows = await c.get("db").select({ id: media.id, kind: media.kind, mime: media.mime, size: media.size, alt: media.alt, createdAt: media.createdAt }).from(media)
    .where(kind ? eq(media.kind, kind) : undefined).orderBy(desc(media.createdAt)).limit(200);
  return c.json({ items: rows.map((r) => ({ ...r, url: `/media/${r.id}` })) });
});
adminMedia.delete("/:id", requireRole("admin"), async (c) => {
  const id = c.req.param("id");
  const db = c.get("db");
  const [row] = await db.select({ id: media.id, r2Key: media.r2Key }).from(media).where(eq(media.id, id)).limit(1);
  if (!row) throw notFound("Media");
  if (row.r2Key && c.env.MEDIA) await c.env.MEDIA.delete(row.r2Key);
  await db.delete(media).where(eq(media.id, id));
  await audit(c, "media.delete", "media", id);
  return c.body(null, 204);
});

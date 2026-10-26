import { Hono } from "hono";
import { desc, eq } from "drizzle-orm";
import { media } from "@openshelf/db";
import { MEDIA_KINDS, type MediaKind } from "@openshelf/shared";
import type { AppEnv } from "../env";
import { ApiError, notFound } from "../lib/http";
import { audit } from "../lib/audit";
import { requireRole } from "../middleware/auth";
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
async function readLimited(stream: ReadableStream<Uint8Array>, max: number): Promise<Uint8Array> {
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
  const useR2 = !!c.env.MEDIA;
  const limit = useR2 ? R2_LIMIT : D1_LIMITS[kind]!;
  if (file.size > limit) throw new ApiError(413, "payload_too_large", `File exceeds ${Math.floor(limit / 1024)}KB limit for ${kind}`);
  const bytes = new Uint8Array(await file.arrayBuffer());
  // Real byte limit after buffering: never trust Content-Length or File.size alone.
  if (bytes.byteLength > limit) throw new ApiError(413, "payload_too_large", `File exceeds ${Math.floor(limit / 1024)}KB limit for ${kind}`);
  const sniffed = sniffImage(bytes);
  if (!sniffed || !ALLOWED_MIMES.includes(sniffed)) throw new ApiError(415, "unsupported_media_type", "Only png, jpeg, webp, gif and avif images are allowed (SVG is rejected)");
  if (file.type && file.type.toLowerCase() !== sniffed) throw new ApiError(415, "mime_mismatch", "File content does not match declared type");
  const id = crypto.randomUUID();
  const sha = await sha256Hex(bytes);
  let r2Key: string | null = null;
  if (useR2) { r2Key = `media/${id}`; await c.env.MEDIA!.put(r2Key, bytes, { httpMetadata: { contentType: sniffed } }); }
  await c.get("db").insert(media).values({ id, kind, mime: sniffed, size: bytes.length, sha256: sha, r2Key, data: useR2 ? null : Buffer.from(bytes), alt: typeof form["alt"] === "string" ? form["alt"].slice(0, 300) : null, createdBy: c.get("admin")!.id });
  await audit(c, "media.upload", "media", id, { kind, mime: sniffed, size: bytes.length });
  return c.json({ id, url: `/media/${id}`, mime: sniffed, size: bytes.length }, 201);
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

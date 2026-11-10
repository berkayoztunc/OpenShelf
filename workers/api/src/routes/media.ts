import { Hono } from "hono";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { media, productImages } from "@openshelf/db";
import { getSettings, saveSettings } from "../lib/settings";
import { IMAGE_GENERAL, IMAGE_SPECS, MEDIA_KINDS, checkImage, imageSize, isCompleteImage, type MediaKind } from "@openshelf/shared";
import type { AppEnv } from "../env";
import { ApiError, body, notFound } from "../lib/http";
import { audit } from "../lib/audit";
import { requireRole } from "../middleware/auth";
import { fetchImageBytes, normalizeImageUrl } from "../lib/imageFetch";
import { sha256Hex, toBytes } from "../lib/crypto";
import { ALLOWED_MIMES, D1_LIMITS, R2_LIMIT, sniffImage } from "../lib/media";
import { proxyPath } from "../lib/imageProxy";

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
export async function storeImage(c: { env: AppEnv["Bindings"]; get(k: "db"): AppEnv["Variables"]["db"] }, o: { bytes: Uint8Array<ArrayBuffer>; kind: MediaKind; alt: string | null; declaredMime?: string; adminId: string | null }) {
  const { bytes, kind } = o; const limit = limitFor(c.env, kind); const useR2 = !!c.env.MEDIA;
  if (bytes.byteLength > limit) throw new ApiError(413, "payload_too_large", `File exceeds ${Math.floor(limit / 1024)}KB limit for ${kind}`);
  const sniffed = sniffImage(bytes);
  if (!sniffed || !ALLOWED_MIMES.includes(sniffed)) throw new ApiError(415, "unsupported_media_type", "Only png, jpeg, webp, gif and avif images are allowed (SVG is rejected)");
  if (!isCompleteImage(bytes)) throw new ApiError(422, "incomplete_image", `The image data is incomplete (cut off after ${bytes.length} bytes). Long base64 strings are truncated by chat clients. Call upload_help: use a public https link (upload_media_from_url / add_product_images), curl the file to /mcp/upload, or upload it in the admin panel (Katalog → Medya).`);
  if (o.declaredMime && o.declaredMime.toLowerCase() !== sniffed) throw new ApiError(415, "mime_mismatch", "File content does not match declared type");
  const id = crypto.randomUUID(); const sha = await sha256Hex(bytes);
  let r2Key: string | null = null;
  if (useR2) { r2Key = `media/${id}`; await c.env.MEDIA!.put(r2Key, bytes, { httpMetadata: { contentType: sniffed } }); }
  await c.get("db").insert(media).values({ id, kind, mime: sniffed, size: bytes.length, sha256: sha, r2Key, data: useR2 ? null : Buffer.from(bytes), alt: o.alt ? o.alt.slice(0, 300) : null, createdBy: o.adminId });
  // best-effort dimensions (png/jpeg/webp/gif) so a generator/uploader learns immediately if the image does not fit its slot
  const dim = imageSize(bytes);
  return { id, url: `/media/${id}`, mime: sniffed, size: bytes.length, ...(dim ? { width: dim.width, height: dim.height } : {}), warnings: dim ? checkImage(kind, dim.width, dim.height) : [] };
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
  const limit = limitFor(c.env, kind);
  if (file.size > limit) throw new ApiError(413, "payload_too_large", `File exceeds ${Math.floor(limit / 1024)}KB limit for ${kind}`);
  const r = await storeImage(c, { bytes: new Uint8Array(await file.arrayBuffer()), kind, alt: typeof form["alt"] === "string" ? form["alt"] : null, declaredMime: file.type || undefined, adminId: c.get("admin")!.id });
  await audit(c, "media.upload", "media", r.id, { kind, mime: r.mime, size: r.size });
  return c.json(r, 201);
});

export type Stored = Awaited<ReturnType<typeof storeImage>>;
/** Downloads one public image URL server-side and stores it (SSRF-guarded). Shared by the import route and the attach tools. */
export async function importImage(c: { env: AppEnv["Bindings"]; get(k: "db"): AppEnv["Variables"]["db"] }, kind: MediaKind, url: string, alt: string | null, adminId: string | null): Promise<Stored> {
  const bytes = await fetchImageBytes(url, limitFor(c.env, kind));
  return storeImage(c, { bytes, kind, alt, adminId });
}
const hostOf = (u: string) => { try { return new URL(normalizeImageUrl(u)).host; } catch { return "invalid"; } };

const ImportBody = z.object({ kind: z.enum(MEDIA_KINDS), url: z.string().min(8).max(2000).optional(), urls: z.array(z.string().min(8).max(2000)).min(1).max(10).optional(), alt: z.string().max(300).optional() })
  .refine((b) => (b.url ? 1 : 0) + (b.urls ? 1 : 0) === 1, { message: "send either url or urls", path: ["url"] });
/**
 * Server-side download of image(s) from public https URLs (SSRF-guarded). Lets an AI client hand over links instead of megabytes of base64.
 * `url` -> the stored image; `urls` (max 10) -> one result per link (a bad link never fails the others). Drive/Dropbox share links are converted.
 */
adminMedia.post("/import", requireRole("admin"), async (c) => {
  const b = await body(c, ImportBody); const adminId = c.get("admin")!.id;
  if (b.url) {
    const r = await importImage(c, b.kind, b.url, b.alt ?? null, adminId);
    await audit(c, "media.import", "media", r.id, { kind: b.kind, host: hostOf(b.url), size: r.size });
    return c.json(r, 201);
  }
  const items: Record<string, unknown>[] = [];
  for (const url of b.urls!) {
    try { const r = await importImage(c, b.kind, url, b.alt ?? null, adminId); await audit(c, "media.import", "media", r.id, { kind: b.kind, host: hostOf(url), size: r.size }); items.push({ source: url, ok: true, ...r }); }
    catch (e) { items.push({ source: url, ok: false, error: e instanceof ApiError ? { code: e.code, message: e.message } : { code: "failed", message: "import failed" } }); }
  }
  return c.json({ imported: items.filter((i) => i["ok"]).length, failed: items.filter((i) => !i["ok"]).length, items }, 201);
});

const AssignBody = z.object({
  slot: z.enum(["logo", "logo_dark", "favicon", "og", "banner"]).describe("where the image goes"),
  mediaId: z.string().min(1).max(60).optional(), url: z.string().min(8).max(2000).optional(), alt: z.string().max(300).optional(),
}).refine((b) => (b.mediaId ? 1 : 0) + (b.url ? 1 : 0) === 1, { message: "send either mediaId or url", path: ["mediaId"] });
/**
 * One call = (import if a URL was given) + put the image into a store slot: logo, dark logo, favicon, default social image (og) or add a home banner.
 * Replaces the get_settings -> edit -> update_settings dance. Returns the stored image (with fit warnings) and the slot.
 */
adminMedia.post("/assign", requireRole("admin"), async (c) => {
  const b = await body(c, AssignBody); const db = c.get("db"); const adminId = c.get("admin")!.id;
  let r: Stored | { id: string; url: string };
  if (b.url) r = await importImage(c, b.slot, b.url, b.alt ?? null, adminId);
  else {
    const [m] = await db.select({ id: media.id }).from(media).where(eq(media.id, b.mediaId!)).limit(1);
    if (!m) throw new ApiError(404, "not_found", "Media not found: check the id with list_media");
    r = { id: m.id, url: `/media/${m.id}` };
  }
  if (b.slot === "og") await saveSettings(db, "seo", { ...(await getSettings(db, "seo")), defaultOgMediaId: r.id }, adminId);
  else {
    const br = await getSettings(db, "branding");
    if (b.slot === "banner") {
      if (br.bannerMediaIds.includes(r.id)) { /* already there */ }
      else if (br.bannerMediaIds.length >= 6) throw new ApiError(409, "banners_full", "The home page already has 6 banners: remove one first (update_branding bannerMediaIds)");
      else br.bannerMediaIds = [...br.bannerMediaIds, r.id];
    } else if (b.slot === "logo") br.logoMediaId = r.id; else if (b.slot === "logo_dark") br.logoDarkMediaId = r.id; else br.faviconMediaId = r.id;
    await saveSettings(db, "branding", br, adminId);
  }
  await audit(c, "media.assign", "media", r.id, { slot: b.slot });
  return c.json({ slot: b.slot, ...r }, 200);
});

const AltBody = z.object({ alt: z.string().max(300) });
/** Change the alt text of an uploaded image (accessibility + SEO). */
adminMedia.patch("/:id", requireRole("admin"), async (c) => {
  const id = c.req.param("id"); const b = await body(c, AltBody); const db = c.get("db");
  const [row] = await db.select({ id: media.id }).from(media).where(eq(media.id, id)).limit(1);
  if (!row) throw notFound("Media");
  await db.update(media).set({ alt: b.alt.trim() || null }).where(eq(media.id, id));
  await audit(c, "media.update", "media", id, { alt: true });
  return c.json({ id, alt: b.alt.trim() || null });
});

/** Image requirements per kind (recommended size, aspect, safe area, limits actually in force). Used by the MCP get_image_specs tool. */
adminMedia.get("/specs", requireRole("staff"), (c) => {
  const r2 = !!c.env.MEDIA;
  return c.json({
    storage: r2 ? "r2" : "d1",
    kinds: MEDIA_KINDS.map((k) => ({ ...IMAGE_SPECS[k], maxBytes: r2 ? R2_LIMIT : D1_LIMITS[k], maxKB: Math.floor((r2 ? R2_LIMIT : D1_LIMITS[k]!) / 1024) })),
    general: IMAGE_GENERAL,
    upload: "upload_media_from_url (MCP, best: public https link, server downloads it), upload_media (MCP, small base64 only), or POST /api/admin/media multipart (file, kind, alt). People upload in the admin panel (product images, Settings → Branding). Responses include width, height and warnings when the image does not fit its slot.",
  });
});
const PREVIEW_MAX = 1_000_000;
/**
 * Image bytes as base64 JSON, so an AI client can SEE a picture through the MCP connection itself (the MCP server turns this into an image block).
 * Works for uploaded media and for product photos hosted elsewhere (Trendyol CDN), which AI sandboxes often cannot download.
 * Pass mediaId, or productId + imageId (from get_product). Capped at ~1 MB.
 */
adminMedia.get("/preview", requireRole("staff"), async (c) => {
  const db = c.get("db"); const mediaId = c.req.query("mediaId"); const productId = c.req.query("productId"); const imageId = c.req.query("imageId");
  if (!!mediaId === !!(productId && imageId)) throw new ApiError(400, "validation_error", "Pass either mediaId, or productId together with imageId");
  let bytes: Uint8Array<ArrayBuffer>; let source: "media" | "remote"; let proxyUrl: string | null = null;
  let mid = mediaId ?? null;
  if (!mid) {
    const [img] = await db.select().from(productImages).where(eq(productImages.id, imageId!)).limit(1);
    if (!img || img.productId !== productId) throw notFound("Image");
    mid = img.mediaId;
    if (!mid) {
      if (!img.url) throw notFound("Image");
      proxyUrl = proxyPath({ id: img.id, mediaId: null, url: img.url });
      try { bytes = await fetchImageBytes(img.url, PREVIEW_MAX); }
      catch (e) { throw e instanceof ApiError && e.code === "payload_too_large" ? e : new ApiError(502, "fetch_failed", "Could not download the image from its host"); }
      source = "remote";
    }
  }
  if (mid) {
    const row = await c.env.DB.prepare("SELECT size, r2_key, data FROM media WHERE id = ?1").bind(mid).first<{ size: number; r2_key: string | null; data: unknown }>();
    if (!row) throw notFound("Media");
    if (row.size > PREVIEW_MAX) throw new ApiError(413, "payload_too_large", `Image is ${Math.round(row.size / 1024)} KB: too large to show inline (max ~${Math.round(PREVIEW_MAX / 1024)} KB). Use its url instead.`);
    if (row.r2_key && c.env.MEDIA) { const obj = await c.env.MEDIA.get(row.r2_key); if (!obj) throw notFound("Media"); bytes = new Uint8Array(await obj.arrayBuffer()); }
    else if (row.data) bytes = toBytes(row.data); else throw notFound("Media");
    source = "media";
  }
  const mime = sniffImage(bytes!); if (!mime) throw new ApiError(415, "unsupported_media_type", "Not a supported image");
  const dim = imageSize(bytes!);
  return c.json({ mime, size: bytes!.length, ...(dim ? { width: dim.width, height: dim.height } : {}), source: source!, ...(proxyUrl ? { proxyUrl } : {}), base64: Buffer.from(bytes!).toString("base64") });
});

/** Which way of getting a file into the store works for which client, with a ready-to-run command. Cheap to read: AI clients should call it BEFORE trying to upload. */
adminMedia.get("/upload-help", requireRole("staff"), (c) => {
  const origin = new URL(c.req.url).origin;
  return c.json({
    chooseByWhatYouHave: [
      { you_have: "a public https link to the image (generated image URL, CDN, Google Drive / Dropbox share link)", use: "upload_media_from_url (up to 10 links per call) or, to also attach it, add_product_images / set_store_image with `url`", cost: "cheapest: a few tokens, full size" },
      { you_have: "a file on a machine where you can run shell commands (Claude Code, Codex, Cursor, scripts)", use: "curl to /mcp/upload with your token (below), then attach with add_product_images / set_store_image using the returned id", cost: "cheap: no base64 in the conversation" },
      { you_have: "only a chat window and the human's own files", use: "ask the human to drop the files into the admin panel: Katalog → Medya (or product page / Settings → Branding). Then call list_media (newest first) and attach the ids", cost: "one human step, no tokens spent on bytes" },
      { you_have: "a tiny image (a few KB, e.g. favicon) only", use: "upload_media (base64). Anything bigger is rejected immediately: do NOT try", cost: "expensive and fragile: last resort" },
    ],
    shellUpload: {
      url: `${origin}/mcp/upload`, method: "POST", auth: "Authorization: Bearer <your MCP token osk_…>, level write or higher",
      example: `curl -sS -H "Authorization: Bearer $OPENSHELF_TOKEN" -F kind=product -F alt="Short description" -F file=@./photo.jpg ${origin}/mcp/upload`,
      alternativeRawBody: `curl -sS -H "Authorization: Bearer $OPENSHELF_TOKEN" -H "Content-Type: image/jpeg" --data-binary @./photo.jpg "${origin}/mcp/upload?kind=product&alt=Short%20description"`,
      returns: "id, url, size, width, height, warnings (same as upload_media_from_url)",
      kinds: MEDIA_KINDS,
    },
    attach: { product: "add_product_images (productId, images[{mediaId|url|imageId, alt}], mode append|prepend|replace): never resend the whole product", store: "set_store_image (slot logo|logo_dark|favicon|og|banner, mediaId|url)" },
  });
});
adminMedia.get("/", requireRole("staff"), async (c) => {
  const kind = c.req.query("kind"); const limit = Math.min(200, Math.max(1, Number(c.req.query("limit") ?? 50) || 50));
  const rows = await c.get("db").select({ id: media.id, kind: media.kind, mime: media.mime, size: media.size, alt: media.alt, createdAt: media.createdAt }).from(media)
    .where(kind ? eq(media.kind, kind) : undefined).orderBy(desc(media.createdAt)).limit(limit);
  return c.json({ items: rows.map((r) => ({ ...r, url: `/media/${r.id}`, ...(r.kind !== "favicon" && r.size < 1500 ? { suspect: "very small file: probably a truncated upload, delete it and upload the full image" } : {}) })) });
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


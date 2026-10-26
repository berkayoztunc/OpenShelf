export type ImageMime = "image/png" | "image/jpeg" | "image/webp" | "image/gif" | "image/avif";
export const ALLOWED_MIMES: ImageMime[] = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif"];

const ascii = (b: Uint8Array, from: number, to: number) => String.fromCharCode(...b.slice(from, to));
/** Detect real type from magic bytes. Never trusts client MIME or extension. SVG/anything else => null. */
export function sniffImage(b: Uint8Array): ImageMime | null {
  if (b.length >= 8 && b[0] === 0x89 && ascii(b, 1, 4) === "PNG" && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return "image/png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 12 && ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 12) === "WEBP") return "image/webp";
  if (b.length >= 6 && (ascii(b, 0, 6) === "GIF87a" || ascii(b, 0, 6) === "GIF89a")) return "image/gif";
  if (b.length >= 12 && ascii(b, 4, 8) === "ftyp" && ["avif", "avis"].includes(ascii(b, 8, 12))) return "image/avif";
  return null;
}
export const D1_LIMITS: Record<string, number> = { logo: 512 * 1024, logo_dark: 512 * 1024, favicon: 512 * 1024, banner: 1536 * 1024, og: 1536 * 1024, product: 1536 * 1024 };
export const R2_LIMIT = 5 * 1024 * 1024;

import type { MediaKind } from "./api";

/**
 * Image requirements per upload kind: single source of truth for the admin, the MCP `get_image_specs` tool (so AI can generate images
 * that fit) and the upload size check. Derived from how the storefront renders each image (object-cover crops to the box, so the
 * aspect ratio and a calm, centred subject matter more than exact pixels).
 */
export interface ImageSpec {
  kind: MediaKind; title: string;
  /** recommended pixel size to generate */
  width: number; height: number; aspect: string;
  /** below this the image looks soft; reject-worthy for the generator */
  minWidth: number; minHeight: number;
  /** transparent background allowed/useful */
  transparent: boolean;
  /** formats best suited (all of png/jpeg/webp/gif/avif are accepted; SVG never) */
  preferredFormats: string[];
  /** where and how it is shown */
  usage: string;
  /** generation guidance: composition / safe area / what NOT to bake in */
  guidance: string;
  /** how to attach it after uploading it (upload_media_from_url) */
  attach: string;
}

export const IMAGE_SPECS: Record<MediaKind, ImageSpec> = {
  product: {
    kind: "product", title: "Product photo", width: 1600, height: 2000, aspect: "4:5 (portrait)", minWidth: 800, minHeight: 1000, transparent: false, preferredFormats: ["webp", "jpeg"],
    usage: "Product page main image (4:5 on desktop, 1:1 on mobile, zoom on hover), product cards (4:5), square thumbnails, cart/checkout thumbnails (64-96 px), category tiles (cropped to 4:3 desktop / 3:4 mobile), Google Merchant feed and the default social preview. The FIRST image of a product is the cover.",
    guidance: "Subject centred with ~10% margin on every side (square and 4:3 crops cut the top/bottom). Clean, evenly lit neutral background (white/light grey) for consistent catalogue look. No text, logos, watermarks or borders baked in. Same framing and lighting across a product's images. sRGB.",
    attach: "add_product_images (productId, images: [{ mediaId or url, alt }], mode append|prepend|replace): one call, no need to resend the product. Put the best shot first. Up to 30 images per product. Write a short alt text.",
  },
  banner: {
    kind: "banner", title: "Home hero banner", width: 2400, height: 1050, aspect: "16:7 (wide)", minWidth: 1600, minHeight: 700, transparent: false, preferredFormats: ["webp", "jpeg"],
    usage: "Home page hero carousel at full width, always shown at 16:7: the WHOLE image is visible on phones and tablets; on screens wider than 1920 px (max height 840 px) a little is cropped from the top and bottom, from the centre. The store's title/subtitle/button are overlaid on the left on tablet/desktop (with a dark gradient) and sit under the image on phones.",
    guidance: "Keep the key subject vertically centred with ~12% free space above and below (very wide monitors crop a little at the top and bottom). Leave the left third calm/low-detail for the overlaid text. No text or buttons in the image. Darker or mid-tone images read best under the overlay. Up to 6 banners rotate.",
    attach: "set_store_image (slot banner, mediaId or url): appended to the carousel, max 6. Title/subtitle/CTA are separate fields (bannerTitle, bannerSubtitle, bannerCtaLabel, bannerCtaUrl).",
  },
  og: {
    kind: "og", title: "Social share image (Open Graph)", width: 1200, height: 630, aspect: "1.91:1", minWidth: 1200, minHeight: 630, transparent: false, preferredFormats: ["jpeg", "png"],
    usage: "Link previews on WhatsApp, Facebook, X/Twitter, LinkedIn, Slack, iMessage. Used by a product or category when its own SEO image is set, otherwise the first product image or the store default.",
    guidance: "Exactly 1.91:1. Keep everything important inside the central 1000×500 area (platforms crop edges). Large, legible, high-contrast; text is allowed here (brand or offer) but keep it big and short. Under ~300 KB loads fastest. JPEG/PNG are the most widely supported.",
    attach: "set_store_image (slot og) for the store-wide default; for one product use update_product_seo `seoOgMediaId`; a product/category can also use `seoOgImageUrl` (https URL).",
  },
  logo: {
    kind: "logo", title: "Logo (light theme)", width: 600, height: 144, aspect: "free, wide wordmark up to 5:1", minWidth: 240, minHeight: 72, transparent: true, preferredFormats: ["png", "webp"],
    usage: "Header and footer, rendered 36 px high with automatic width (so generate it 4× that, 144 px high, for sharp retina screens). Shown on light backgrounds.",
    guidance: "Transparent background, tight crop (no empty padding), dark/brand colours that contrast on white. Horizontal lockup preferred (icon + name); width up to ~600 px. No drop shadows or gradients baked into the background.",
    attach: "set_store_image (slot logo, mediaId or url).",
  },
  logo_dark: {
    kind: "logo_dark", title: "Logo (dark theme)", width: 600, height: 144, aspect: "same as the light logo", minWidth: 240, minHeight: 72, transparent: true, preferredFormats: ["png", "webp"],
    usage: "Same places as the logo, swapped in when the visitor uses dark mode.",
    guidance: "Same artwork and proportions as the light logo, recoloured to be light/white so it reads on a dark background. Transparent background.",
    attach: "set_store_image (slot logo_dark).",
  },
  favicon: {
    kind: "favicon", title: "Favicon / site icon", width: 512, height: 512, aspect: "1:1 (square)", minWidth: 48, minHeight: 48, transparent: true, preferredFormats: ["png"],
    usage: "Browser tab, bookmarks and home-screen icon; shown tiny (16-48 px) so only a simple shape survives.",
    guidance: "Square, simple mark or single letter, bold shapes, high contrast, ~10% padding. No small text or fine detail. PNG with transparency (or solid brand-colour background).",
    attach: "set_store_image (slot favicon).",
  },
};

export const IMAGE_GENERAL = {
  formats: ["png", "jpeg", "webp", "gif", "avif"],
  rejected: ["svg", "anything else (checked by file content, not extension)"],
  colorSpace: "sRGB",
  tips: [
    "Smaller files load faster: aim for WebP/JPEG quality ~80, under ~300 KB for product photos.",
    "Generate at the recommended size or larger with the exact aspect ratio; the storefront crops (object-cover), it never stretches.",
    "Do not bake text, prices or badges into product photos; the shop overlays sale badges itself.",
    "Uploaded files are public and cached forever (immutable): re-uploading gives a new id, the old URL keeps working until deleted.",
  ],
} as const;

/* ---------- dimension reading (png/jpeg/webp/gif; avif is not parsed) ---------- */
export function imageSize(b: Uint8Array): { width: number; height: number } | null {
  const u16 = (o: number) => (b[o]! << 8) | b[o + 1]!; const u32 = (o: number) => ((b[o]! << 24) | (b[o + 1]! << 16) | (b[o + 2]! << 8) | b[o + 3]!) >>> 0;
  const l16 = (o: number) => b[o]! | (b[o + 1]! << 8); const l24 = (o: number) => b[o]! | (b[o + 1]! << 8) | (b[o + 2]! << 16);
  const str = (o: number, n: number) => String.fromCharCode(...b.slice(o, o + n));
  try {
    if (b.length > 24 && b[0] === 0x89 && str(1, 3) === "PNG") return { width: u32(16), height: u32(20) };
    if (b.length > 10 && (str(0, 6) === "GIF87a" || str(0, 6) === "GIF89a")) return { width: l16(6), height: l16(8) };
    if (b.length > 30 && str(0, 4) === "RIFF" && str(8, 4) === "WEBP") {
      const t = str(12, 4);
      if (t === "VP8X") return { width: l24(24) + 1, height: l24(27) + 1 };
      if (t === "VP8L") { const v = b[21]! | (b[22]! << 8) | (b[23]! << 16) | (b[24]! << 24); return { width: (v & 0x3fff) + 1, height: ((v >> 14) & 0x3fff) + 1 }; }
      if (t === "VP8 ") return { width: l16(26) & 0x3fff, height: l16(28) & 0x3fff };
    }
    if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
      let o = 2;
      while (o + 9 < b.length) {
        if (b[o] !== 0xff) { o++; continue; }
        const m = b[o + 1]!;
        if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { o += 2; continue; }
        const len = u16(o + 2);
        if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { width: u16(o + 7), height: u16(o + 5) };
        o += 2 + len;
      }
    }
  } catch { /* fall through */ }
  return null;
}

/** Human-readable problems of an uploaded image against its kind's spec (empty = fits). */
export function checkImage(kind: MediaKind, width: number, height: number): string[] {
  const s = IMAGE_SPECS[kind]; const out: string[] = [];
  if (width < s.minWidth || height < s.minHeight) out.push(`Too small: ${width}×${height}px, minimum ${s.minWidth}×${s.minHeight}px (recommended ${s.width}×${s.height}px).`);
  if (kind === "favicon") { if (Math.abs(width / height - 1) > 0.02) out.push(`Favicon should be square (1:1), got ${width}×${height}px.`); return out; }
  if (kind === "logo" || kind === "logo_dark") { if (width / height > 6 || width / height < 1) out.push(`Logo ratio ${(width / height).toFixed(2)}:1 is unusual: use a horizontal lockup between 1:1 and 5:1 with a tight crop.`); return out; }
  const want = s.width / s.height; const got = width / height;
  if (Math.abs(got - want) / want > 0.08) out.push(`Aspect ratio ${got.toFixed(2)}:1 differs from the recommended ${s.aspect} (${want.toFixed(2)}:1): it will be cropped around the centre.`);
  return out;
}

/**
 * False when the file is clearly cut off (what happens when a chat client truncates a long base64 argument): PNG without its IEND end chunk,
 * JPEG without the EOI marker, GIF without the trailer, WebP whose RIFF length does not match. Other formats (AVIF) are assumed complete.
 */
export function isCompleteImage(b: Uint8Array): boolean {
  const n = b.length; const str = (o: number, l: number) => String.fromCharCode(...b.slice(o, o + l));
  if (n > 8 && b[0] === 0x89 && str(1, 3) === "PNG") return n >= 20 && str(n - 8, 4) === "IEND";
  if (n > 3 && b[0] === 0xff && b[1] === 0xd8) { let e = n; while (e > 2 && b[e - 1] === 0) e--; return b[e - 2] === 0xff && b[e - 1] === 0xd9; }
  if (n > 6 && str(0, 3) === "GIF") { let e = n; while (e > 1 && b[e - 1] === 0) e--; return b[e - 1] === 0x3b; }
  if (n > 12 && str(0, 4) === "RIFF" && str(8, 4) === "WEBP") { const len = (b[4]! | (b[5]! << 8) | (b[6]! << 16) | (b[7]! << 24)) >>> 0; return len + 8 === n || len + 9 === n; }
  return true;
}

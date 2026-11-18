/**
 * MCP-only helper for AI image EDITING of product photos (not documented in the user guide on purpose).
 * One source of truth for: category-specific "keep the product identical" rules, the target size, the resize/pad rule and the
 * QA checklist. Used by the get_image_edit_kit tool (route GET /api/admin/media/edit-kit, MCP callers only) and by the
 * edit_product_images / image_edit_rules MCP prompts, so every AI client gets exactly the same instructions.
 */
import { IMAGE_SPECS } from "@openshelf/shared";

export const EDIT_CATEGORIES = ["bag", "apparel", "shoes", "jewelry", "accessory", "home", "other"] as const;
export type EditCategory = (typeof EDIT_CATEGORIES)[number];
export const EDIT_GOALS = ["white_background", "light_grey_background", "lifestyle", "cleanup", "resize_only"] as const;
export type EditGoal = (typeof EDIT_GOALS)[number];

const SPEC = IMAGE_SPECS.product;
export const TARGET = { width: SPEC.width, height: SPEC.height, aspect: "4:5", minWidth: SPEC.minWidth, minHeight: SPEC.minHeight } as const;
/** product (its bounding box) fills this share of the frame on its limiting side: ~10% margin all round */
const FILL = 0.8;
/** above this upscale the result is soft: ask for a better original instead */
const MAX_UPSCALE = 2;

// ---------------------------------------------------------------------------------------------------------------------
// Category detection
// ---------------------------------------------------------------------------------------------------------------------
const KEYWORDS: [EditCategory, RegExp][] = [
  ["bag", /\b(çanta|canta|bag|handbag|tote|clutch|sırt çanta|sirt canta|backpack|cüzdan|cuzdan|wallet|portföy|portfoy|bel çanta|crossbody|omuz çanta|el çanta|kartlık|kartlik|makyaj çanta|valiz|luggage)/i],
  ["shoes", /\b(ayakkabı|ayakkabi|sneaker|bot\b|çizme|cizme|terlik|sandalet|loafer|babet|topuklu|shoe|boot|sandal|slipper)/i],
  ["jewelry", /\b(kolye|küpe|kupe|yüzük|yuzuk|bileklik|bilezik|halhal|broş|bros|takı|taki|necklace|earring|ring\b|bracelet|jewel)/i],
  ["apparel", /\b(tişört|tisort|t-shirt|gömlek|gomlek|elbise|etek|pantolon|şort|sort|ceket|mont|kaban|hırka|hirka|kazak|sweat|hoodie|bluz|tunik|tayt|eşofman|esofman|yelek|dress|shirt|jacket|coat|skirt|trouser|pants|sweater|cardigan)/i],
  ["accessory", /\b(şapka|sapka|bere|atkı|atki|şal|sal\b|eşarp|esarp|kemer|gözlük|gozluk|saat\b|eldiven|kravat|hat\b|cap\b|scarf|belt|sunglass|watch|glove|tie\b)/i],
  ["home", /\b(yastık|yastik|kırlent|kirlent|nevresim|havlu|örtü|ortu|halı|hali|mum\b|vazo|kupa|bardak|tabak|pillow|towel|blanket|vase|mug|candle|decor)/i],
];
/** Best guess from product name / category name / description; "other" when nothing matches. */
export function detectCategory(...texts: (string | null | undefined)[]): EditCategory {
  const s = texts.filter(Boolean).join(" ");
  for (const [cat, re] of KEYWORDS) if (re.test(s)) return cat;
  return "other";
}

// ---------------------------------------------------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------------------------------------------------
const PRESERVE_COMMON = [
  "exact silhouette, proportions and dimensions of the product (no slimming, stretching, straightening or 'improving' the shape)",
  "exact colour and shade of every part (no hue shift, no saturation boost, no white-balance change on the product itself)",
  "material and surface texture (grain, weave, knit, shine or matte finish) at the original detail level, no smoothing or plastic look",
  "every logo, label, embossing, print, pattern and text on the product exactly as is: same position, size, spelling, no new or removed markings",
  "all seams, stitching, edges, piping, trims and their colours",
  "number and position of all parts (nothing added, nothing removed, nothing duplicated)",
];
const CATEGORY_RULES: Record<EditCategory, { name: string; preserve: string[]; framing: string[] }> = {
  bag: {
    name: "bag / wallet / backpack",
    preserve: [
      "handles and straps: same count, length, width, attachment points and the way they fall; a long strap must stay complete (never cut off or shortened), if it does not fit, show it naturally looped or draped as in the original",
      "metal hardware (zips, zip pullers, buckles, rings, clasps, feet, chain links, studs): same shape, count, finish (gold/silver/gunmetal) and position; no added shine or tint",
      "the bag's own shape and volume: keep how it stands or slumps, do not inflate or square it up; keep the flap/closure open or closed exactly as in the source",
      "leather/fabric grain, quilting pattern, panel lines, edge paint and stitch spacing",
      "branding: embossed/debossed logo, metal plate or label exactly as is",
    ],
    framing: [
      "front view upright, centred, handles fully inside the frame with headroom; strap tops are part of the product's bounding box",
      "soft, natural contact shadow under the base so it does not float; no hard drop shadow, no reflection floor unless the source had it",
    ],
  },
  apparel: {
    name: "apparel",
    preserve: [
      "garment cut, length, fit and drape (do not tailor, shorten or tighten it)",
      "collar, cuffs, buttons, zips, pockets, drawstrings, labels and their exact positions",
      "print/graphic/pattern scale and alignment, knit or weave texture; wrinkles may be softened only if the goal is cleanup, never reshape the garment",
      "if a model wears it: same model, pose, face and skin; do not change the person",
    ],
    framing: ["ghost-mannequin or flat-lay framing exactly as in the source; whole garment visible including hems and sleeves"],
  },
  shoes: {
    name: "shoes",
    preserve: [
      "sole shape, thickness, tread and sole colour; heel height and shape",
      "laces (count of eyelets, lacing pattern, lace colour), straps, buckles",
      "toe shape, stitching, perforations, panel overlaps and logos",
    ],
    framing: ["the original angle (usually lateral side, toe pointing left); keep a pair as a pair if the source shows two shoes", "soft contact shadow under the sole"],
  },
  jewelry: {
    name: "jewellery",
    preserve: [
      "metal colour (yellow/rose/white gold, silver) exactly; no extra polish or tint",
      "stones: same count, cut, colour, size and setting; do not add sparkle or make them larger",
      "chain type, link size and length; clasp; engraving",
    ],
    framing: ["product sharp end-to-end; jewellery is small, so it may fill a bit less (about 60-70%) to keep a calm, premium look"],
  },
  accessory: {
    name: "accessory",
    preserve: ["shape, fasteners and hardware, lens/dial/buckle details and printed text exactly as is"],
    framing: ["centred, whole item visible, soft contact shadow"],
  },
  home: {
    name: "home / decor",
    preserve: ["size proportions, pattern scale and repeat, fringe/tassels, glaze or finish exactly as is"],
    framing: ["centred, whole item visible; for textiles keep the fold or drape of the source"],
  },
  other: { name: "product", preserve: [], framing: ["centred, whole item visible, soft contact shadow"] },
};

const GOALS: Record<EditGoal, { label: string; instruction: string }> = {
  white_background: {
    label: "clean white studio background (marketplace standard)",
    instruction: "Replace ONLY the background with seamless pure white (#FFFFFF) studio background, even soft lighting, a subtle natural contact shadow under the product. Remove everything that is not the product (hands, hangers, tags not part of the product, clutter, other objects, watermarks).",
  },
  light_grey_background: {
    label: "light grey studio background (store catalogue look)",
    instruction: "Replace ONLY the background with a seamless very light warm grey (#F4F4F2) studio background, even soft lighting, a subtle natural contact shadow. Remove everything that is not the product.",
  },
  lifestyle: {
    label: "lifestyle scene",
    instruction: "Place the UNCHANGED product into a calm, realistic lifestyle setting that fits it, with lighting that matches the product's existing highlights and shadows. The product stays the hero: in focus, same size relation, nothing covering it, no people unless asked, no other branded items.",
  },
  cleanup: {
    label: "cleanup / retouch only",
    instruction: "Keep the existing background and composition. Only remove dust, lint, stray threads, small scratches on the background, sensor spots and harsh reflections; even out the background tone. Do not touch the product's shape, colour or details.",
  },
  resize_only: {
    label: "resize / reframe only (no AI)",
    instruction: "Do NOT use an image model. Only scale and pad the image in code to the target size as described in the resize rule. Pixels of the product stay untouched.",
  },
};

export interface ResizePlan {
  source: { width: number; height: number; aspect: string };
  target: { width: number; height: number; aspect: string };
  /** uniform scale applied to the source to fit (contain) the 4:5 frame */
  scale: number; scaledWidth: number; scaledHeight: number;
  /** canvas extension needed after scaling (in target pixels) */
  pad: { top: number; bottom: number; left: number; right: number };
  /** what has to be added: background extension on top/bottom or left/right, or nothing */
  extend: "top_bottom" | "left_right" | "none";
  quality: "ok" | "upscaled" | "too_small";
  notes: string[];
}
const ratio = (w: number, h: number) => { const g = (a: number, b: number): number => (b ? g(b, a % b) : a); const d = g(w, h) || 1; return `${w / d}:${h / d}`; };

/** Fit (contain) the whole source into 1600×2000: uniform scale, never crop, never stretch; the rest is background extension. */
export function resizePlan(width: number, height: number): ResizePlan {
  const scale = Math.min(TARGET.width / width, TARGET.height / height);
  const sw = Math.round(width * scale), sh = Math.round(height * scale);
  const padX = TARGET.width - sw, padY = TARGET.height - sh;
  const pad = { top: Math.floor(padY / 2), bottom: Math.ceil(padY / 2), left: Math.floor(padX / 2), right: Math.ceil(padX / 2) };
  const extend = padY > 2 ? "top_bottom" : padX > 2 ? "left_right" : "none";
  const quality = scale > MAX_UPSCALE ? "too_small" : scale > 1.01 ? "upscaled" : "ok";
  const notes: string[] = [];
  if (extend === "top_bottom") notes.push(`Source is wider than 4:5: extend the background by ${pad.top}px on top and ${pad.bottom}px at the bottom (never crop the sides, never stretch).`);
  if (extend === "left_right") notes.push(`Source is taller than 4:5: extend the background by ${pad.left}px left and ${pad.right}px right (never crop top/bottom, never stretch).`);
  if (quality === "upscaled") notes.push(`Source is smaller than the target: upscaling ×${scale.toFixed(2)} (Lanczos). Acceptable up to ×${MAX_UPSCALE}.`);
  if (quality === "too_small") notes.push(`Source is too small (×${scale.toFixed(2)} upscale needed). Results will be soft: ask the human for a larger original before editing; minimum ${TARGET.minWidth}×${TARGET.minHeight}.`);
  if (width < TARGET.minWidth || height < TARGET.minHeight) notes.push(`Below the store minimum ${TARGET.minWidth}×${TARGET.minHeight}: the upload will carry a warning.`);
  notes.push(`After editing, re-centre so the product's bounding box fills ~${Math.round(FILL * 100)}% of the frame on its limiting side (~10% margin all round); square (1:1) and 4:3 crops cut the top and bottom, so nothing important may sit in the outer 10%.`);
  return { source: { width, height, aspect: ratio(width, height) }, target: { width: TARGET.width, height: TARGET.height, aspect: TARGET.aspect }, scale: Number(scale.toFixed(4)), scaledWidth: sw, scaledHeight: sh, pad, extend, quality, notes };
}

export const RESIZE_RULE = [
  `Target: exactly ${TARGET.width}×${TARGET.height} px (4:5 portrait), sRGB, WebP or JPEG quality ~85, under ~400 KB.`,
  "Resize/reframe in CODE (Pillow, sharp, ImageMagick), NOT with the image model: models silently redraw the product when asked to change size.",
  "Uniform scale only (keep the aspect ratio). Never stretch or squash. Never crop into the product.",
  "If the source is not 4:5, EXTEND the canvas with the same background (pure/solid backgrounds: fill with the sampled background colour; textured backgrounds: outpaint ONLY the new border area with a mask that excludes the original pixels).",
  `Product bounding box ≈ ${Math.round(FILL * 100)}% of the frame on its limiting side, centred horizontally, optically centred vertically (a few px above centre). ~10% safe margin all round.`,
  `Upscale at most ×${MAX_UPSCALE} (Lanczos). Smaller sources: ask for a better original.`,
  "Same framing, product size and background across all images of one product (consistent gallery).",
];

export const PIPELINE = [
  "1. Look first: view_image every source image; note colours, hardware, logos, strap/handle layout. This is your reference.",
  "2. Prefer MASKED editing (inpainting) so the product pixels are never regenerated: segment the product (background-removal / SAM / your tool's 'select subject'), invert the mask, edit only the background. Whole-image regeneration (plain text-to-image or 'edit this photo' without a mask) is the main cause of changed products: avoid it.",
  "3. If your tool cannot mask, cut the product out (background removal), and composite the ORIGINAL product pixels onto the new background yourself in code; generate only the background/shadow.",
  "4. Resize/pad in code to the target (resize rule), never by the model.",
  "5. QA against the original side by side with the checklist. Any failed point → discard and redo; do not 'fix' with another full regeneration.",
  "6. Show the human before/after. Only after approval upload (create_upload_link / upload_media_from_url / add_product_images url) with mode=append, alt text describing the product; never delete or replace the original images unless the human asks (then add_product_images mode=replace keeping order).",
];

export interface EditBrief {
  category: EditCategory; categoryName: string; goal: EditGoal; goalLabel: string;
  imagePrompt: string; negativePrompt: string; preserve: string[]; framing: string[]; resizeRule: string[]; pipeline: string[]; qaChecklist: string[];
}

/** The complete, reusable brief. `imagePrompt` is ready to paste into an image-editing model (with the source image attached). */
export function buildEditBrief(opts: { category: EditCategory; goal: EditGoal; productName?: string | null; brand?: string | null; colors?: string[]; background?: string | null }): EditBrief {
  const cat = CATEGORY_RULES[opts.category]; const goal = GOALS[opts.goal];
  const preserve = [...PRESERVE_COMMON, ...cat.preserve];
  const what = [opts.brand, opts.productName].filter(Boolean).join(" ") || `this ${cat.name}`;
  const colors = opts.colors?.length ? ` Its colour(s): ${opts.colors.join(", ")}: keep exactly.` : "";
  const bg = opts.background && opts.goal !== "resize_only" ? ` Background override requested by the store: ${opts.background}.` : "";
  const imagePrompt = opts.goal === "resize_only" ? goal.instruction : [
    `Edit the attached photo of ${what} (${cat.name}). ${goal.instruction}${bg}`,
    `The product itself must stay PIXEL-FAITHFUL to the original: treat it as a locked layer. Keep: ${preserve.join("; ")}.${colors}`,
    `Composition: ${cat.framing.join(" ")} Keep the original camera angle and perspective.`,
    "Photorealistic product photography, sharp focus on the whole product, no text, no watermark, no props unless requested, no border, no frame. Output the same resolution as the input (resizing is done afterwards in code).",
  ].join("\n\n");
  const negativePrompt = "changed shape, altered colour, recoloured, different material, smoothed texture, plastic look, extra or missing straps/handles/buttons/parts, duplicated hardware, warped or misspelled logo, new text, watermark, cropped product, cut-off strap, stretched, squashed, distorted perspective, floating product, harsh drop shadow, props, hands, mannequin (unless in source), CGI, illustration, blur";
  const qaChecklist = [
    "Overlay/side by side with the original: outline and proportions identical (no part moved, longer, shorter, thinner).",
    "Colour identical (compare a mid-tone patch of the product in both images; ΔE should be small, no hue shift).",
    "Count parts: handles/straps, buttons, zips, rings, stones, eyelets: same numbers as the original.",
    "Logos/labels/text: same spelling, size and place; nothing invented.",
    "Texture still visible at 100% zoom (not smoothed or AI-painted).",
    `Exactly ${TARGET.width}×${TARGET.height}, product not cropped, ~10% margin, centred, nothing important in the outer 10% (square crop safe).`,
    "Background clean and even, natural contact shadow, no halo/fringe around the edges of the cut-out.",
    "File: WebP/JPEG, sRGB, under ~400 KB; after upload read `warnings` (wrong ratio / too small → fix).",
  ];
  return { category: opts.category, categoryName: cat.name, goal: opts.goal, goalLabel: goal.label, imagePrompt, negativePrompt, preserve, framing: cat.framing, resizeRule: RESIZE_RULE, pipeline: PIPELINE, qaChecklist };
}

/** Python (Pillow) for the deterministic part: fit the edited image into 1600×2000 and fill the new border with the background colour. */
export const RESIZE_SCRIPT = `# pip install pillow
from PIL import Image, ImageOps
import sys
W, H, FILL = ${TARGET.width}, ${TARGET.height}, ${FILL}
src = ImageOps.exif_transpose(Image.open(sys.argv[1])).convert("RGB")
# background colour = median of the 4 corners (works for studio backgrounds)
px = [src.getpixel(p) for p in [(2, 2), (src.width - 3, 2), (2, src.height - 3), (src.width - 3, src.height - 3)]]
bg = tuple(sorted(c[i] for c in px)[1] for i in range(3))
# product bounding box = pixels clearly different from the background
diff = Image.eval(ImageOps.grayscale(Image.merge("RGB", [Image.eval(b, lambda v, k=k: abs(v - bg[k])) for k, b in enumerate(src.split())])), lambda v: 255 if v > 18 else 0)
box = diff.getbbox() or (0, 0, src.width, src.height)
prod = src.crop(box)
scale = min(W * FILL / prod.width, H * FILL / prod.height, 2.0)  # uniform, max x2 upscale
prod = prod.resize((round(prod.width * scale), round(prod.height * scale)), Image.LANCZOS)
out = Image.new("RGB", (W, H), bg)
out.paste(prod, ((W - prod.width) // 2, max(0, (H - prod.height) // 2 - H // 100)))
out.save(sys.argv[2], "WEBP", quality=85, method=6)
print(out.size, "bg", bg, "scale", round(scale, 3))
`;

/** Markdown version of a brief, for prompts and for pasting into any AI. */
export function briefMarkdown(b: EditBrief): string {
  const list = (xs: string[]) => xs.map((x) => `- ${x}`).join("\n");
  return [
    `# Product photo edit: ${b.categoryName} · ${b.goalLabel}`,
    "## Prompt for the image model (attach the source photo)", "```", b.imagePrompt, "```",
    "## Negative prompt", "```", b.negativePrompt, "```",
    "## Must stay identical", list(b.preserve),
    "## Framing", list(b.framing),
    "## Size and resize rule", list(b.resizeRule),
    "## Pipeline", b.pipeline.join("\n"),
    "## QA checklist (reject the result if any point fails)", list(b.qaChecklist),
    "## Resize script (deterministic, run after the edit)", "```python", RESIZE_SCRIPT.trim(), "```",
  ].join("\n\n");
}

export const isCategory = (v: unknown): v is EditCategory => typeof v === "string" && (EDIT_CATEGORIES as readonly string[]).includes(v);
export const isGoal = (v: unknown): v is EditGoal => typeof v === "string" && (EDIT_GOALS as readonly string[]).includes(v);

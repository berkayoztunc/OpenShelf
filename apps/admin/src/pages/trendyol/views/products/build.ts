/** Pure helpers of the "add product to Trendyol" wizard: createProducts V2 body builder + validation derived from the catalog field hints. */

export interface AttrChoice { ids: number[]; custom: string }
export interface WizardForm {
  barcode: string; stockCode: string; productMainId: string; title: string; description: string;
  brandId: number | null; categoryId: number | null;
  vatRate: string; listPrice: string; salePrice: string; quantity: string;
  images: string[]; cargo: string; dimensionalWeight: string; deliveryDuration: string; origin: string;
  attrs: Record<number, AttrChoice>;
}
export const emptyForm = (): WizardForm => ({
  barcode: "", stockCode: "", productMainId: "", title: "", description: "", brandId: null, categoryId: null, vatRate: "20", listPrice: "", salePrice: "", quantity: "0",
  images: [], cargo: "", dimensionalWeight: "1", deliveryDuration: "1", origin: "TR", attrs: {},
});

const n = (s: string): number => Number(String(s).replace(",", "."));

/** createProducts V2 item. Attributes follow the guide: attributeId + attributeValueId, or customAttributeValue. No `currencyType` in V2. */
export function buildItem(f: WizardForm): Record<string, unknown> {
  const attributes: Record<string, unknown>[] = [];
  for (const [id, c] of Object.entries(f.attrs)) {
    for (const v of c.ids) attributes.push({ attributeId: Number(id), attributeValueId: v });
    if (c.custom.trim()) attributes.push({ attributeId: Number(id), customAttributeValue: c.custom.trim() });
  }
  return {
    barcode: f.barcode.trim(), title: f.title.trim(), productMainId: f.productMainId.trim(),
    brandId: f.brandId, categoryId: f.categoryId, quantity: Math.trunc(n(f.quantity)),
    stockCode: f.stockCode.trim(), ...(f.origin.trim() ? { origin: f.origin.trim().toUpperCase() } : {}),
    dimensionalWeight: n(f.dimensionalWeight), listPrice: n(f.listPrice), salePrice: n(f.salePrice), vatRate: Math.trunc(n(f.vatRate)),
    description: f.description, ...(f.cargo ? { cargoProviders: [f.cargo] } : {}),
    deliveryOption: { deliveryDuration: Math.trunc(n(f.deliveryDuration)) },
    images: f.images.filter(Boolean).map((url) => ({ url })), attributes,
  };
}
export const buildBody = (f: WizardForm): { items: Record<string, unknown>[] } => ({ items: [buildItem(f)] });

export interface Problem { field: string; key: string; vars?: Record<string, string | number> }
const VAT = [0, 1, 10, 20];

/** Validation hints from the catalog (not a Trendyol validator): required fields, max lengths, price order, https images, required attributes. */
export function validateBody(body: unknown, requiredAttrs: number[] = []): Problem[] {
  const out: Problem[] = [];
  const items = (body as { items?: unknown })?.items;
  if (!Array.isArray(items) || items.length === 0) return [{ field: "items", key: "trendyolviews.products.v.items" }];
  items.forEach((raw, i) => {
    const it = (raw ?? {}) as Record<string, unknown>;
    const p = (field: string, key: string, vars?: Problem["vars"]) => out.push({ field: items.length > 1 ? `items[${i}].${field}` : field, key: `trendyolviews.products.v.${key}`, vars });
    const s = (k: string) => (typeof it[k] === "string" ? (it[k] as string) : "");
    if (!s("barcode").trim()) p("barcode", "barcode.required");
    else if (s("barcode").length > 40 || !/^[A-Za-z0-9._-]+$/.test(s("barcode"))) p("barcode", "barcode.format");
    if (!s("title").trim()) p("title", "title.required");
    else if (s("title").length > 100) p("title", "title.long", { max: 100 });
    if (!s("productMainId").trim()) p("productMainId", "main.required");
    else if (s("productMainId").length > 40) p("productMainId", "main.long", { max: 40 });
    if (!it.brandId) p("brandId", "brand.required");
    if (!it.categoryId) p("categoryId", "category.required");
    if (typeof it.quantity !== "number" || !Number.isInteger(it.quantity) || it.quantity < 0 || it.quantity > 20000) p("quantity", "quantity.range", { max: 20000 });
    if (s("stockCode").length > 100) p("stockCode", "stockCode.long", { max: 100 });
    if (!s("description").trim()) p("description", "description.required");
    else if (s("description").length > 30000) p("description", "description.long", { max: 30000 });
    const lp = it.listPrice, sp = it.salePrice;
    if (typeof lp !== "number" || !(lp > 0)) p("listPrice", "price.list");
    if (typeof sp !== "number" || !(sp > 0)) p("salePrice", "price.sale");
    else if (typeof lp === "number" && sp > lp) p("salePrice", "price.order");
    if (typeof it.vatRate !== "number" || !VAT.includes(it.vatRate)) p("vatRate", "vat.value");
    const imgs = Array.isArray(it.images) ? (it.images as { url?: unknown }[]) : [];
    if (imgs.length === 0) p("images", "images.required");
    else if (imgs.length > 8) p("images", "images.max", { max: 8 });
    if (imgs.some((x) => typeof x.url !== "string" || !/^https:\/\//i.test(x.url))) p("images", "images.https");
    const attrs = Array.isArray(it.attributes) ? (it.attributes as { attributeId?: number }[]) : [];
    for (const id of requiredAttrs) if (!attrs.some((a) => a.attributeId === id)) p(`attributes.${id}`, "attr.required", { id });
  });
  return out;
}

/** Local image url -> absolute URL (Trendyol needs public https URLs). */
export function absoluteImage(url: string | undefined, mediaId: string | undefined, origin: string): string {
  const u = url || (mediaId ? `/media/${mediaId}` : "");
  if (!u) return "";
  if (/^https?:\/\//i.test(u)) return u;
  return `${origin.replace(/\/$/, "")}${u.startsWith("/") ? "" : "/"}${u}`;
}
export const isPublicHttps = (url: string): boolean => {
  try { const u = new URL(url); return u.protocol === "https:" && !/^(localhost|127\.|0\.0\.0\.0)/.test(u.hostname); } catch { return false; }
};

/** Flatten the nested category tree into leaves with their path. */
export interface Leaf { id: number; name: string; path: string }
export function leaves(tree: unknown, trail: string[] = []): Leaf[] {
  if (!Array.isArray(tree)) return [];
  const out: Leaf[] = [];
  for (const raw of tree) {
    const c = raw as { id?: number; name?: string; subCategories?: unknown };
    const here = [...trail, String(c.name ?? "")];
    if (Array.isArray(c.subCategories) && c.subCategories.length) out.push(...leaves(c.subCategories, here));
    else if (typeof c.id === "number") out.push({ id: c.id, name: String(c.name ?? ""), path: here.join(" › ") });
  }
  return out;
}

/** Batch finished? (`status: COMPLETED`, or every item has SUCCESS/FAILED when the batch carries no status — stock/price updates). */
export function batchFinished(body: unknown): boolean {
  const b = (body ?? {}) as { status?: string; items?: { status?: string }[] };
  if (b.status === "COMPLETED") return true;
  if (b.status === "IN_PROGRESS") return false;
  const items = Array.isArray(b.items) ? b.items : [];
  return items.length > 0 && items.every((x) => x.status === "SUCCESS" || x.status === "FAILED");
}

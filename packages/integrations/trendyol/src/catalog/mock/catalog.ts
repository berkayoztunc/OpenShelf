import type { MockHandler, MockRequest, MockResponse, MockState } from "@openshelf/shared";
import { loadList, saveList } from "./state";

/**
 * Offline handlers for brands, categories, attributes and lookup services (Product Integration V2).
 * State keys: `ty:brands` (seeded brand list), `ty:categories` (seeded flat category tree).
 * Brand/category/attribute ids are mock ids except the ones copied from the official docs examples.
 */

// ---------- shared helpers (also used by mock/products.ts) ----------
export const ok = (body: unknown, status = 200): MockResponse => ({ status, body });
/** Trendyol-style error body: `{ errors: [{ key, message, errorCode }] }`. */
export const fail = (status: number, errors: { key: string; message: string }[]): MockResponse => ({
  status, body: { errors: errors.map((e) => ({ key: e.key, message: e.message, errorCode: String(status) })) },
});
export function qStr(q: Record<string, unknown>, k: string): string | undefined {
  const v = q[k];
  if (v == null || v === "") return undefined;
  return Array.isArray(v) ? v.join(",") : String(v);
}
/** integer query param; NaN when present but not a number */
export function qInt(q: Record<string, unknown>, k: string, def: number): number {
  const s = qStr(q, k);
  if (s === undefined) return def;
  const n = Number(s);
  return Number.isFinite(n) ? Math.trunc(n) : NaN;
}
export const qList = (q: Record<string, unknown>, k: string): string[] => (qStr(q, k) ?? "").split(",").map((s) => s.trim()).filter(Boolean);
export const hash = (s: string): number => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };

// ---------- seed data ----------
export interface MockBrand { id: number; name: string }
export interface MockCategory { id: number; name: string; parentId: number | null }

const BRAND_NAMES: [number, string][] = [
  [10, "TrendyolMilla"], [19, "Milla"], [20, "Trendyol"], [40, "TRENDYOLMİLLA"],
  [101, "Arçelik"], [102, "Beko"], [103, "Vestel"], [104, "Koton"], [105, "LC Waikiki"], [106, "DeFacto"], [107, "Mavi"],
  [108, "Karaca"], [109, "English Home"], [110, "Madame Coco"], [111, "Paşabahçe"], [112, "Taç"], [113, "Yataş"],
  [114, "Bellona"], [115, "Doğtaş"], [116, "Tefal"], [117, "Fakir"], [118, "Arzum"], [119, "Kütahya Porselen"],
  [120, "Lav"], [121, "Evidea"], [122, "Özdilek"], [123, "Hisar"], [9001, "OpenShelf"],
];
const seedBrands = (): MockBrand[] => BRAND_NAMES.map(([id, name]) => ({ id, name }));

const seedCategories = (): MockCategory[] => [
  { id: 400, name: "Ev & Yaşam", parentId: null },
  { id: 410, name: "Dekorasyon", parentId: 400 },
  { id: 411, name: "Ev Dekorasyon", parentId: 410 },
  { id: 613, name: "Mum", parentId: 410 },
  { id: 714, name: "Raf", parentId: 410 },
  { id: 510, name: "Ev Tekstili", parentId: 400 },
  { id: 512, name: "Yastık", parentId: 510 },
  { id: 815, name: "Battaniye", parentId: 510 },
  { id: 368, name: "Aksesuar", parentId: null },
  { id: 1162, name: "Atkı & Bere & Eldiven", parentId: 368 },
  { id: 382, name: "Atkı", parentId: 1162 },
  { id: 384, name: "Bere", parentId: 1162 },
  { id: 600, name: "Elektronik", parentId: null },
  { id: 610, name: "Küçük Ev Aletleri", parentId: 600 },
  { id: 611, name: "Kahve Makinesi", parentId: 610 },
  { id: 612, name: "Blender", parentId: 610 },
  { id: 1000, name: "Giyim", parentId: null },
  { id: 1010, name: "Kadın Giyim", parentId: 1000 },
  { id: 1011, name: "Elbise", parentId: 1010 },
  { id: 1012, name: "Tişört", parentId: 1010 },
  { id: 1020, name: "Ayakkabı", parentId: 1000 },
  { id: 1021, name: "Spor Ayakkabı", parentId: 1020 },
];

export const loadBrands = (s: MockState) => loadList<MockBrand>(s, "ty:brands", seedBrands);
export const loadCategories = (s: MockState) => loadList<MockCategory>(s, "ty:categories", seedCategories);
export const isLeaf = (cats: MockCategory[], id: number) => cats.some((c) => c.id === id) && !cats.some((c) => c.parentId === id);

// ---------- attribute catalogue ----------
interface AttrDef { id: number; name: string; allowCustom: boolean; multi: boolean; slicer: boolean; varianter: boolean; values: [number, string][] }
export const ATTRS: Record<string, AttrDef> = {
  renk: { id: 47, name: "Renk", allowCustom: true, multi: false, slicer: true, varianter: false,
    values: [[1001, "Bej"], [1002, "Beyaz"], [1003, "Siyah"], [1004, "Gri"], [1005, "Krem"], [1006, "Mavi"], [1007, "Yeşil"], [1008, "Kırmızı"], [1009, "Kahverengi"], [1010, "Sarı"]] },
  beden: { id: 293, name: "Beden", allowCustom: false, multi: false, slicer: false, varianter: true,
    values: [[4872, "Tek Ebat"], [4873, "S"], [4874, "M"], [4875, "L"], [4876, "XL"], [4602, "77 x 200 cm"], [4603, "77 x 300 cm"]] },
  yas: { id: 294, name: "Yaş Grubu", allowCustom: false, multi: false, slicer: false, varianter: false, values: [[2879, "Yetişkin"], [2878, "Çocuk"]] },
  cinsiyet: { id: 296, name: "Cinsiyet", allowCustom: false, multi: false, slicer: false, varianter: false, values: [[2873, "Erkek"], [2874, "Kadın"], [2875, "Unisex"]] },
  materyal: { id: 1201, name: "Materyal", allowCustom: true, multi: true, slicer: false, varianter: false,
    values: [[5001, "Seramik"], [5002, "Keten"], [5003, "Pamuk"], [5004, "Ahşap"], [5005, "Soya Mumu"], [5006, "Polar"], [5007, "Paslanmaz Çelik"]] },
};
export const attrById = (id: number): AttrDef | undefined => Object.values(ATTRS).find((a) => a.id === id);
const HOME: [string, boolean][] = [["renk", true], ["materyal", false], ["beden", false]];
const CLOTHES: [string, boolean][] = [["renk", true], ["beden", true], ["cinsiyet", false], ["yas", false]];
const LEAF_SPEC: Record<number, [string, boolean][]> = {
  411: HOME, 512: HOME, 613: HOME, 714: HOME, 815: HOME,
  382: [["renk", true], ["beden", false], ["cinsiyet", false], ["yas", false]], 384: [["renk", true], ["beden", false], ["cinsiyet", false], ["yas", false]],
  611: [["renk", true], ["materyal", false]], 612: [["renk", true], ["materyal", false]],
  1011: CLOTHES, 1012: CLOTHES, 1021: CLOTHES,
};
export function categoryAttributeList(catId: number): { def: AttrDef; required: boolean }[] {
  return (LEAF_SPEC[catId] ?? [["renk", true]]).map(([k, required]) => ({ def: ATTRS[k]!, required }));
}

// ---------- handlers ----------
interface TreeNode { id: number; name: string; parentId: number | null; subCategories: TreeNode[] }
function buildTree(cats: MockCategory[], parent: number | null): TreeNode[] {
  return cats.filter((c) => c.parentId === parent).map((c) => ({ id: c.id, name: c.name, parentId: c.parentId, subCategories: buildTree(cats, c.id) }));
}
function pruneTree(nodes: TreeNode[], keyword: string, keepAll = false): TreeNode[] {
  const out: TreeNode[] = [];
  for (const n of nodes) {
    const self = n.name.includes(keyword);
    const subs = pruneTree(n.subCategories, keyword, keepAll || self);
    if (keepAll || self) out.push({ ...n, subCategories: keepAll || self ? n.subCategories : subs });
    else if (subs.length) out.push({ ...n, subCategories: subs });
  }
  return out;
}

const getBrands: MockHandler = async (req, state) => {
  const brands = await loadBrands(state);
  const page = qInt(req.query, "page", 0), size = qInt(req.query, "size", 1000);
  if (!(page >= 0) || !(size >= 1)) return fail(400, [{ key: "invalid.paging", message: "page ve size geçerli sayılar olmalıdır" }]);
  return ok({ brands: brands.slice(page * size, page * size + size) });
};

const getBrandsByName: MockHandler = async (req, state) => {
  const name = qStr(req.query, "name");
  if (!name) return fail(400, [{ key: "name", message: "name parametresi zorunludur" }]);
  // docs: search is case-sensitive; the docs example returns one exact match, we match on a case-sensitive substring
  return ok((await loadBrands(state)).filter((b) => b.name.includes(name)));
};

const createBrand: MockHandler = async (req, state) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const fields = (body.fields ?? {}) as Record<string, unknown>;
  const name = String(body.name ?? fields.name ?? "").trim();
  if (!name) return fail(400, [{ key: "name", message: "Marka adı (name) zorunludur" }]);
  const images = body.images ?? body.files;
  if (Array.isArray(images) && (images.length < 1 || images.length > 3)) return fail(400, [{ key: "images", message: "En az 1, en fazla 3 marka görseli gönderilmelidir" }]);
  const brands = await loadBrands(state);
  if (brands.some((b) => b.name === name)) return fail(400, [{ key: "brand.already.exists", message: `'${name}' markası zaten mevcut` }]);
  const brandId = Math.max(200000, ...brands.map((b) => b.id)) + 1;
  brands.push({ id: brandId, name });
  await saveList(state, "ty:brands", brands);
  return ok({ brandId }, 201);
};

const getCategoryTree: MockHandler = async (req, state) => {
  const cats = await loadCategories(state);
  const tree = buildTree(cats, null);
  const name = qStr(req.query, "name");
  return ok(name ? pruneTree(tree, name) : tree);
};

const getCategoryAttributes: MockHandler = async (req, state) => {
  const id = Number(req.path.categoryId);
  const cats = await loadCategories(state);
  const cat = cats.find((c) => c.id === id);
  if (!cat) return fail(404, [{ key: "category.not.found", message: `Kategori bulunamadı: ${req.path.categoryId}` }]);
  const requiredQ = qStr(req.query, "required");
  const list = isLeaf(cats, id) ? categoryAttributeList(id) : [];
  const categoryAttributes = list
    .filter((a) => requiredQ === undefined || a.required === (requiredQ === "true"))
    .map((a) => ({ allowCustom: a.def.allowCustom, attribute: { id: a.def.id, name: a.def.name }, categoryId: id, required: a.required, varianter: a.def.varianter, slicer: a.def.slicer, allowMultipleAttributeValues: a.def.multi }));
  return ok({ id, name: cat.name, displayName: cat.name, categoryAttributes });
};

const getCategoryAttributeValues: MockHandler = async (req, state) => {
  const catId = Number(req.path.categoryId), attrId = Number(req.path.attributeId);
  const cats = await loadCategories(state);
  if (!cats.some((c) => c.id === catId)) return fail(404, [{ key: "category.not.found", message: `Kategori bulunamadı: ${req.path.categoryId}` }]);
  const attr = categoryAttributeList(catId).find((a) => a.def.id === attrId);
  if (!attr || !isLeaf(cats, catId)) return fail(404, [{ key: "attribute.not.found", message: `Kategoride ${req.path.attributeId} numaralı özellik bulunamadı` }]);
  const page = qInt(req.query, "page", 0), size = qInt(req.query, "size", 1000);
  if (!(page >= 0 && page <= 1000) || !(size >= 1 && size <= 1000)) return fail(400, [{ key: "invalid.paging", message: "page ve size 0-1000 aralığında olmalıdır (size en az 1)" }]);
  const all = attr.def.values.map(([attributeValueId, attributeValueName]) => ({ attributeValueId, attributeValueName }));
  return ok({ totalElements: all.length, totalPages: Math.max(1, Math.ceil(all.length / size)), page, size, content: all.slice(page * size, page * size + size) });
};

/** First six rows are the docs sample; ARASMP/MNGMP/TEXMP are additions following the same `*MP` code pattern (not in the docs sample). */
export const CARGO_PROVIDERS = [
  { code: "KOLAYGELSINMP", name: "Kolay Gelsin" }, { code: "YKMP", name: "Yurtiçi Kargo" }, { code: "SURATMP", name: "Sürat Kargo" },
  { code: "DHLECOMMP", name: "DHL eCommerce" }, { code: "PTTMP", name: "PTT Kargo" }, { code: "CEVAMP", name: "CEVA Lojistik" },
  { code: "ARASMP", name: "Aras Kargo" }, { code: "MNGMP", name: "MNG Kargo" }, { code: "TEXMP", name: "Trendyol Express" },
];
const getCargoProviders: MockHandler = () => ok(CARGO_PROVIDERS);

export type { MockRequest };
export const mockHandlers: Record<string, MockHandler> = {
  getBrands, getBrandsByName, createBrand, getCategoryTree, getCategoryAttributes, getCategoryAttributeValues, getCargoProviders,
};

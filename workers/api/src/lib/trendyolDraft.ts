import type { Context } from "hono";
import { eq } from "drizzle-orm";
import { categories, products, syncCursors } from "@openshelf/db";
import {
  absoluteImage, buildBody, problemText, remoteVariants, desiFromGrams, emptyForm, filterLeaves, importedCategoryId, leaves, matchBrand, rankCategories, resolveAttributes, validateBody,
  type AttrChoice, type AttrDef, type RememberedDefaults, type TrendyolDraftOverrides, type UnresolvedAttr, type VariantRow,
} from "@openshelf/shared";
import { PENDING_APPROVAL } from "@openshelf/integration-trendyol";
import type { AppEnv } from "../env";
import { hydrateProducts, availableOf } from "./catalog";
import { getSettings } from "./settings";
import { runTrendyolOp } from "../routes/admin-trendyol";
import { barcodeOwners, linkVariant } from "./trendyolMapping";

/** Where the wizard / MCP tools keep "what was chosen last time" per local category (see admin-trendyol-sync). */
export const DEFAULTS_PREFIX = "trendyol:defaults:";
const VAT = [0, 1, 10, 20];
const major = (minor: number | null | undefined) => (((minor ?? 0) as number) / 100).toFixed(2);

export interface RunResult { ok: boolean; status: number; body: any; truncated: boolean; error?: string }
export type Run = (operationId: string, input?: { path?: Record<string, string | number>; query?: Record<string, string | number | boolean>; body?: unknown }, confirm?: boolean) => Promise<RunResult>;

/** Trendyol calls through the same code path as the API console (mock or live, rate limits, call history). Writes carry their production confirmation. */
export const makeRun = (c: Context<AppEnv>): Run => async (operationId, input = {}, confirm = false) => {
  const r = await runTrendyolOp(c, { operationId, path: input.path ?? {}, query: input.query ?? {}, ...(input.body !== undefined ? { body: input.body } : {}), ...(confirm ? { confirm: operationId } : {}) });
  return { ok: r.ok, status: r.status, body: r.response.body, truncated: r.response.truncated === true, ...(r.error ? { error: r.error.message } : {}) };
};

const valueList = (body: any): { id: number; name: string }[] =>
  ((body?.content ?? []) as Record<string, unknown>[]).map((o) => ({ id: Number(o.attributeValueId ?? o.id), name: String(o.attributeValueName ?? o.attributeValue ?? o.name ?? "") })).filter((o) => o.id > 0 && o.name);

export interface Draft {
  product: { id: string; name: string; variants: number; slug: string };
  remembered: boolean;
  brand: { id: number | null; name: string; source: "override" | "remembered" | "product" | "store" | null; suggestions: { id: number; name: string }[] };
  category: { id: number | null; path: string; source: "override" | "remembered" | "imported" | "name" | null; suggestions: { id: number; path: string }[] };
  fields: { title: string; productMainId: string; vatRate: number; cargo: string; dimensionalWeight: number; deliveryDuration: number; origin: string; imageCount: number };
  attributes: { id: number; name: string; required: boolean; scope: "shared" | "variant"; value?: { ids: number[]; custom: string }; values?: Record<string, { ids: number[]; custom: string }> }[];
  /** variants whose barcode is already on Trendyol: they are linked, never created again */
  existing: { variantId: string; barcode: string; status: "approved" | "pending" | "rejected"; title: string }[];
  variants: { variantId: string; label: string; include: boolean; barcode: string; stockCode: string; quantity: number; listPrice: number; salePrice: number }[];
  unresolved: ({ kind: "brand" | "category"; suggestions: unknown[] } | ({ kind: "attribute" } & UnresolvedAttr))[];
  problems: { field: string; message: string }[];
  ready: boolean;
  /** internal: what createProducts would send */
  _body: { items: Record<string, unknown>[] };
  _rows: VariantRow[];
  _productId: string;
  _localCategoryId: string | null;
  _remembered: RememberedDefaults | null;
  _form: ReturnType<typeof emptyForm>;
}

/**
 * Builds the createProducts draft of a local product with the same logic as the admin wizard: brand, category and attribute values are found from what
 * the store knows (product brand / category / variant names, last time's choices) and from Trendyol's own lists; whatever cannot be decided safely is
 * returned as `unresolved` with suggestions. `ov` overrides any decision. Only reads from Trendyol.
 */
export async function buildDraft(c: Context<AppEnv>, run: Run, productId: string, ov: TrendyolDraftOverrides = {}): Promise<Draft | null> {
  const db = c.get("db");
  const [row] = await db.select().from(products).where(eq(products.id, productId)).limit(1);
  if (!row) return null;
  const [p] = await hydrateProducts(db, [row]);
  if (!p) return null;
  const general = await getSettings(db, "general");
  const localCats = await db.select({ id: categories.id, name: categories.nameTr, parentId: categories.parentId }).from(categories);
  const catNames: string[] = []; { let cur = localCats.find((x) => x.id === p.categoryId); for (let n = 0; cur && n < 5; n++) { catNames.push(cur.name); cur = localCats.find((x) => x.id === cur?.parentId); } }
  const [remRow] = p.categoryId ? await db.select().from(syncCursors).where(eq(syncCursors.key, `${DEFAULTS_PREFIX}${p.categoryId}`)).limit(1) : [];
  let remembered: RememberedDefaults | null = null; try { remembered = remRow ? (JSON.parse(remRow.value) as RememberedDefaults) : null; } catch { remembered = null; }

  const origin = c.env.STOREFRONT_ORIGIN ?? "";
  const active = p.variants.filter((v) => v.active);
  const first = active[0];
  const many = active.length > 1;
  const vOv = new Map((ov.variants ?? []).map((v) => [v.variantId, v]));
  const rows: VariantRow[] = active.map((v) => {
    const o = vOv.get(v.id); const price = major(v.prices.trendyol ?? v.prices.website);
    return {
      variantId: v.id, label: v.title || v.sku, hints: [v.title ?? "", ...Object.values(v.options ?? {})].filter(Boolean), include: o?.include ?? true, attrs: {},
      barcode: o?.barcode ?? (v.barcode || v.sku), stockCode: o?.stockCode ?? v.sku, quantity: String(o?.quantity ?? availableOf(v.stock)),
      listPrice: String(o?.listPrice ?? price), salePrice: String(o?.salePrice ?? price),
    };
  });

  // barcodes that already exist on Trendyol (approved or awaiting approval): linked instead of created
  const existing: Draft["existing"] = [];
  for (const r of rows.filter((x) => x.include)) {
    const q = { barcode: r.barcode, page: 0, size: 5 };
    const [a, u] = [await run("filterApprovedProducts", { query: q }), await run("filterUnapprovedProducts", { query: q })];
    const hit = remoteVariants(a.ok ? (a.body?.content ?? []) : [], u.ok ? (u.body?.content ?? []) : []).find((x) => x.barcode === r.barcode);
    if (hit) existing.push({ variantId: r.variantId, barcode: r.barcode, status: hit.status, title: hit.title });
  }
  const isExisting = new Set(existing.map((e) => e.barcode));

  // cargo, delivery, origin, KDV
  // No carrier is ever guessed: without an explicit / remembered one the field is left out and Trendyol uses the seller's default agreement
  const cargo = ov.cargo ?? remembered?.cargo ?? "";
  const vatRate = ov.vatRate ?? (p.taxRate != null && VAT.includes(p.taxRate) ? p.taxRate : VAT.includes(general.defaultTaxRate) ? general.defaultTaxRate : 20);
  const desc = (ov.description ?? p.descriptionTr ?? "").trim();
  const form = emptyForm();
  Object.assign(form, {
    barcode: rows[0]?.barcode ?? "", stockCode: rows[0]?.stockCode ?? "", productMainId: (ov.productMainId ?? (p.slug || first?.sku || "").toUpperCase()).slice(0, 40),
    title: (ov.title ?? (many ? p.nameTr : `${p.nameTr}${first?.title && first.title !== p.nameTr ? ` - ${first.title}` : ""}`)).slice(0, 100),
    description: desc ? (/<\w+/.test(desc) ? desc : `<p>${desc.replace(/\n+/g, "</p><p>")}</p>`) : "", vatRate: String(vatRate),
    listPrice: rows[0]?.listPrice ?? "", salePrice: rows[0]?.salePrice ?? "", quantity: rows[0]?.quantity ?? "0",
    images: ov.images ?? p.images.map((i) => absoluteImage(i.url || undefined, i.mediaId ?? undefined, origin)).filter(Boolean).slice(0, 8),
    cargo, dimensionalWeight: String(ov.dimensionalWeight ?? (first?.weightGrams ? desiFromGrams(first.weightGrams) : remembered?.dimensionalWeight ?? "1")),
    deliveryDuration: String(ov.deliveryDuration ?? remembered?.deliveryDuration ?? "1"), origin: (ov.origin ?? remembered?.origin ?? "TR").toUpperCase(),
  });

  // brand
  const brand: Draft["brand"] = { id: null, name: "", source: null, suggestions: [] };
  if (ov.brandId) { brand.id = ov.brandId; brand.name = ov.brandName ?? ""; brand.source = "override"; }
  else if (remembered?.brandId) { brand.id = remembered.brandId; brand.name = remembered.brandName; brand.source = "remembered"; }
  else {
    const wanted = (ov.brandName ?? p.brand ?? general.storeName ?? "").trim();
    if (wanted.length >= 2) {
      const r = await run("getBrandsByName", { query: { name: wanted } });
      const list = (r.ok && Array.isArray(r.body) ? r.body : []).map((b: any) => ({ id: Number(b.id), name: String(b.name ?? "") })).filter((b: { id: number }) => b.id > 0);
      const m = matchBrand(list, wanted);
      if (m.exact) { brand.id = m.exact.id; brand.name = m.exact.name; brand.source = ov.brandName || p.brand ? "product" : "store"; }
      else brand.suggestions = m.ranked;
    }
  }
  form.brandId = brand.id;

  // category
  const category: Draft["category"] = { id: null, path: "", source: null, suggestions: [] };
  if (ov.categoryId) { category.id = ov.categoryId; category.path = ov.categoryPath ?? ""; category.source = "override"; }
  else if (remembered?.trendyolCategoryId) { category.id = remembered.trendyolCategoryId; category.path = remembered.categoryPath; category.source = "remembered"; }
  else {
    const names = catNames.length ? catNames : [p.nameTr];
    let all = leaves((await run("getCategoryTree", { query: { name: names[0]! } })).body);
    if (!all.length && names[1]) all = leaves((await run("getCategoryTree", { query: { name: names[1] } })).body);
    const imp = importedCategoryId(p.categoryId); const il = imp != null ? all.find((l) => l.id === imp) : undefined; // an imported parent cannot hold products
    const r = rankCategories(all, names);
    const pick = il ?? r.exact;
    if (pick) { category.id = pick.id; category.path = pick.path; category.source = il ? "imported" : "name"; }
    else category.suggestions = r.ranked.map((l) => ({ id: l.id, path: l.path }));
  }
  form.categoryId = category.id;

  // attributes of the chosen category
  let defs: AttrDef[] = []; let requiredIds: number[] = [];
  const unresolved: Draft["unresolved"] = [];
  if (category.id) {
    const ar = await run("getCategoryAttributes", { path: { categoryId: category.id } });
    const list = ((ar.body?.categoryAttributes ?? []) as any[]);
    for (const a of list) {
      const id = Number(a.attribute?.id);
      const wanted = a.required === true || a.varianter === true || a.slicer === true || !!ov.attrs?.[String(id)] || !!remembered?.attrs?.[String(id)];
      // The real API lists the values inline (empty for free-text attributes): only ask per attribute when it did not
      const inline = ((a.attributeValues ?? []) as Record<string, unknown>[]).map((o) => ({ id: Number(o.id ?? o.attributeValueId), name: String(o.name ?? o.attributeValue ?? "") })).filter((o) => o.id > 0 && o.name);
      const vr = wanted && !inline.length ? await run("getCategoryAttributeValues", { path: { categoryId: category.id, attributeId: id }, query: { size: 1000 } }) : null;
      defs.push({ id, name: String(a.attribute?.name ?? id), required: a.required === true, varianter: a.varianter === true, slicer: a.slicer === true, allowCustom: a.allowCustom === true, allowMulti: a.allowMultipleAttributeValues === true, values: inline.length ? inline : vr ? valueList(vr.body) : wanted ? [] : null });
    }
    requiredIds = defs.filter((d) => d.required).map((d) => d.id);
  }
  // only what is not on Trendyol yet is created: existing barcodes are linked by sendDraft
  const createRows = rows.map((r) => (isExisting.has(r.barcode) ? { ...r, include: false } : r));
  const nothingToCreate = createRows.every((r) => !r.include);
  const res = resolveAttributes({ defs, rows: createRows, origin: form.origin, sharedHints: many ? [] : rows[0]?.hints ?? [], remembered: remembered?.attrs, shared: ov.attrs, byVariant: ov.variantAttrs });
  form.attrs = res.shared;
  for (const u of res.unresolved) unresolved.push({ kind: "attribute", ...u });
  if (!brand.id && !nothingToCreate) unresolved.unshift({ kind: "brand", suggestions: brand.suggestions });
  if (!category.id && !nothingToCreate) unresolved.unshift({ kind: "category", suggestions: category.suggestions });

  const body = nothingToCreate ? { items: [] as Record<string, unknown>[] } : buildBody(form, createRows);
  const problems = (nothingToCreate ? [] : validateBody(body, requiredIds)).map((x) => ({ field: x.field, message: problemText(x) }))
    .filter((x) => !(x.field === "brandId" && !brand.id) && !(x.field === "categoryId" && !category.id) && !/^attributes\./.test(x.field)); // those are reported as `unresolved`
  const included = createRows.filter((r) => r.include);
  const attrOut: Draft["attributes"] = defs.filter((d) => res.shared[d.id] || res.perVariant.includes(d.id) || d.required).map((d) => res.perVariant.includes(d.id)
    ? { id: d.id, name: d.name, required: d.required, scope: "variant" as const, values: Object.fromEntries(included.filter((r) => r.attrs[d.id]).map((r) => [r.variantId, r.attrs[d.id]!])) }
    : { id: d.id, name: d.name, required: d.required, scope: "shared" as const, ...(res.shared[d.id] ? { value: res.shared[d.id]! } : {}) });
  return {
    product: { id: p.id, name: p.nameTr, variants: active.length, slug: p.slug }, remembered: !!remembered, brand, category,
    fields: { title: form.title, productMainId: form.productMainId, vatRate, cargo, dimensionalWeight: Number(form.dimensionalWeight), deliveryDuration: Number(form.deliveryDuration), origin: form.origin, imageCount: form.images.length },
    attributes: attrOut,
    existing,
    variants: rows.map((r) => ({ variantId: r.variantId, label: r.label, include: r.include, barcode: r.barcode, stockCode: r.stockCode, quantity: Number(r.quantity), listPrice: Number(r.listPrice), salePrice: Number(r.salePrice) })),
    unresolved: nothingToCreate ? [] : unresolved, problems, ready: nothingToCreate ? existing.length > 0 : unresolved.length === 0 && problems.length === 0 && included.length > 0,
    _body: body, _rows: rows, _productId: p.id, _localCategoryId: p.categoryId ?? null, _remembered: remembered, _form: form,
  };
}

/** The draft as shown to an AI / the admin: without the internal fields. */
export const publicDraft = (d: Draft) => { const { _body, _rows, _productId, _localCategoryId, _remembered, _form, ...rest } = d; return { ...rest, firstItem: _body.items[0] ?? null }; };

export interface CreateResult {
  created: boolean; /** barcodes that were already on Trendyol and only got linked */ alreadyOnTrendyol?: string[]; batchId?: string; results?: { barcode: string; status: string; reasons: string[] }[]; linked?: { variantId: string; barcode: string }[]; skipped?: { variantId: string; reason: string }[]; error?: string;
}

/**
 * Sends a ready draft to Trendyol (createProducts), waits briefly for the batch result, links the sent variants to their barcodes (they show as
 * "awaiting approval" until Trendyol approves, then stock/price sync starts by itself) and remembers the choices for the local category.
 */
export async function sendDraft(c: Context<AppEnv>, run: Run, d: Draft): Promise<CreateResult> {
  const db = c.get("db");
  const sent = d._body.items;
  let batchId = ""; let results: NonNullable<CreateResult["results"]> = [];
  if (sent.length) {
    const r = await run("createProducts", { body: d._body }, true);
    batchId = r.ok ? String(r.body?.batchRequestId ?? "") : "";
    if (!r.ok || !batchId) return { created: false, error: (r.error ?? JSON.stringify(r.body ?? {})).slice(0, 500) };
  }
  for (let i = 0; sent.length && i < 3; i++) {
    if (i) await new Promise((res) => setTimeout(res, 1200));
    const b = await run("getBatchRequestResult", { path: { batchRequestId: batchId } });
    const items = (b.body?.items ?? []) as any[];
    results = items.map((x) => ({ barcode: String(x.requestItem?.barcode ?? ""), status: String(x.status ?? ""), reasons: (x.failureReasons ?? []) as string[] }));
    if (String(b.body?.status ?? "").toUpperCase() === "COMPLETED" || (items.length && items.every((x) => x.status !== "IN_PROGRESS" && x.status !== "PENDING"))) break;
  }

  // link the variants that were sent (unless a barcode already belongs to another variant)
  const linked: { variantId: string; barcode: string }[] = []; const skipped: { variantId: string; reason: string }[] = [];
  const sentBarcodes = new Set(sent.map((i) => String(i.barcode)));
  const onTrendyol = new Map(d.existing.map((e) => [e.barcode, e]));
  const todo = d._rows.filter((x) => x.include && (sentBarcodes.has(x.barcode) || onTrendyol.has(x.barcode)));
  const owners = await barcodeOwners(db, todo.map((x) => x.barcode));
  const failedBc = new Set(results.filter((x) => x.status.toUpperCase() === "FAILED").map((x) => x.barcode));
  for (const x of todo) {
    if (failedBc.has(x.barcode)) { skipped.push({ variantId: x.variantId, reason: "Trendyol rejected this item" }); continue; }
    const owner = owners.get(x.barcode);
    if (owner && owner !== x.variantId) { skipped.push({ variantId: x.variantId, reason: "barcode already linked to another variant" }); continue; }
    // a barcode that is already approved on Trendyol is linked as is (stock/price sync starts); everything else waits for approval
    const ex = onTrendyol.get(x.barcode);
    await linkVariant(db, { variantId: x.variantId, barcode: x.barcode, sku: x.stockCode, ...(ex?.status === "approved" ? {} : { pending: PENDING_APPROVAL }) });
    linked.push({ variantId: x.variantId, barcode: x.barcode });
  }

  // remember the shared choices for the local category (never the per-variant ones)
  if (d._localCategoryId && d.category.id) {
    const variantIds = new Set(d.attributes.filter((a) => a.scope === "variant").map((a) => String(a.id)));
    const attrs = Object.fromEntries(Object.entries(d._form.attrs).filter(([id, v]) => !variantIds.has(id) && (v.ids.length || v.custom)).map(([id, v]) => [id, v as AttrChoice]));
    const value = JSON.stringify({ trendyolCategoryId: d.category.id, categoryPath: d.category.path, brandId: d.brand.id, brandName: d.brand.name, attrs, cargo: d._form.cargo, vatRate: d._form.vatRate, dimensionalWeight: d._form.dimensionalWeight, deliveryDuration: d._form.deliveryDuration, origin: d._form.origin });
    await db.insert(syncCursors).values({ key: `${DEFAULTS_PREFIX}${d._localCategoryId}`, value }).onConflictDoUpdate({ target: syncCursors.key, set: { value, updatedAt: new Date() } }).catch(() => {});
  }
  return { created: true, ...(d.existing.length ? { alreadyOnTrendyol: d.existing.map((e) => e.barcode) } : {}), ...(batchId ? { batchId } : {}), results, linked, skipped };
}

/** Compact lookups for an AI: brands / leaf categories by name, a category's attributes, an attribute's values. */
export async function findOnTrendyol(run: Run, q: { kind: "brand" | "category" | "attributes" | "attributeValue"; q?: string; categoryId?: number; attributeId?: number }) {
  const text = (q.q ?? "").trim();
  if (q.kind === "brand") {
    if (text.length < 2) return { error: "q needs at least 2 letters" };
    const r = await run("getBrandsByName", { query: { name: text } });
    return { items: (r.ok && Array.isArray(r.body) ? r.body : []).slice(0, 20).map((b: any) => ({ id: Number(b.id), name: String(b.name ?? "") })) };
  }
  if (q.kind === "category") {
    if (text.length < 2) return { error: "q needs at least 2 letters" };
    const r = await run("getCategoryTree", { query: { name: text } });
    return { items: filterLeaves(leaves(r.body), text, 25).map((l) => ({ id: l.id, path: l.path })), ...(r.truncated ? { note: "too many results, narrow the search" } : {}) };
  }
  if (!q.categoryId) return { error: "categoryId is required" };
  if (q.kind === "attributes") {
    const r = await run("getCategoryAttributes", { path: { categoryId: q.categoryId } });
    return { items: ((r.body?.categoryAttributes ?? []) as any[]).map((a) => ({ id: Number(a.attribute?.id), name: String(a.attribute?.name ?? ""), required: a.required === true, varianter: a.varianter === true, slicer: a.slicer === true, allowCustom: a.allowCustom === true })) };
  }
  if (!q.attributeId) return { error: "attributeId is required" };
  const r = await run("getCategoryAttributeValues", { path: { categoryId: q.categoryId, attributeId: q.attributeId }, query: { size: 1000 } });
  const all = valueList(r.body);
  const words = text.toLocaleLowerCase("tr").split(/\s+/).filter(Boolean);
  const hit = words.length ? all.filter((v) => words.every((w) => v.name.toLocaleLowerCase("tr").includes(w))) : all;
  return { total: all.length, items: hit.slice(0, 40) };
}

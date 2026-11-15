import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, X } from "lucide-react";
import { Badge, Button, Card, ConfirmDialog, SelectField, TextArea, TextField, cx, useDebounced } from "../../../../components/ui";
import { Term } from "../../../../components/help/Term";
import { Typeahead } from "../../../../components/Typeahead";
import { InlineError, TableSkeleton, TyErrorBox, arr, num, rec, str, useTyQuery } from "../../../../components/trendyol/views/shared";
import { api, qs } from "../../../../lib/api";
import { checkJson, prettyJson } from "../../../../lib/trendyol";
import { useT } from "../../../../i18n";
import { BatchPanel } from "./BatchPanel";
import { absoluteImage, buildBody, desiFromGrams, emptyForm, importedCategoryId, leaves, matchBrand, rankCategories, validateBody, type BrandHit, type CategoryLeaf, type Leaf, type RememberedDefaults, type VariantRow, type WizardForm } from "@openshelf/shared";
import { FieldsStep, valueOf, type Ops, type W } from "./FieldsStep";
export { valueOf };
import { useCategories } from "../../../Categories";
import { useSettings } from "../../../../lib/settings";
import { LookupRow, lookupLabel, useMapVariant } from "./Mappings";
import type { LookupItem } from "./Mappings";

interface LocalVariant { id: string; sku: string; barcode: string | null; title: string | null; options?: Record<string, string> | null; weightGrams?: number | null; prices: { website: number | null; trendyol?: number | null }; stock?: { total: number; reserved: number; safetyStock: number } }
interface LocalProduct { id: string; nameTr: string; slug: string; brand?: string | null; categoryId?: string | null; descriptionTr?: string | null; variants: LocalVariant[]; images: { url?: string | null; mediaId?: string | null }[] }
const STEPS = ["local", "fields", "preview", "submit"] as const;
const VAT = ["0", "1", "10", "20"];
const major = (minor: number) => (minor / 100).toFixed(2);

/**
 * Creates a local product on Trendyol (createProducts V2). `productId` opens it straight on that product (from the product page);
 * otherwise the first step searches one. Every variant of the product is sent as its own item in ONE request, and after sending the
 * variants are linked to their Trendyol barcodes, so stock and price sync starts by itself once Trendyol approves the product.
 */
export function Wizard({ w, ops, onClose, productId }: { w: W; ops: Ops; onClose: () => void; productId?: string }) {
  const { t, td } = useT();
  const qc = useQueryClient();
  const [step, setStep] = useState(0);
  const [rows, setRows] = useState<VariantRow[]>([]);
  const [linked, setLinked] = useState<{ ok: number; failed: string | null } | null>(null);
  const [search, setSearch] = useState(""); const [picked, setPicked] = useState<LookupItem | null>(null);
  const [form, setForm] = useState<WizardForm>(emptyForm());
  const [brandName, setBrandName] = useState(""); const [catPath, setCatPath] = useState("");
  const [jsonText, setJsonText] = useState("");
  const [batch, setBatch] = useState<{ id: string; barcode: string } | null>(null);
  const [mapping, setMapping] = useState(false);
  const [required, setRequired] = useState<number[]>([]);
  const [varianters, setVarianters] = useState<number[]>([]);
  const set = (p: Partial<WizardForm>) => setForm((f) => ({ ...f, ...p }));
  // what the system filled in by itself (shown to the user), the suggestions for what it could not decide, and what the user took over
  const [notes, setNotes] = useState<{ key: "brand" | "category" | "remembered"; text: string }[]>([]);
  const [brandSugg, setBrandSugg] = useState<BrandHit[]>([]);
  const [catSugg, setCatSugg] = useState<CategoryLeaf[]>([]);
  const manual = useRef({ brand: false, category: false });
  const addNote = (key: "brand" | "category" | "remembered", text: string) => setNotes((n) => [...n.filter((x) => x.key !== key), { key, text }]);

  /* local product (images/description): list by SKU to find the product id, then GET /:id */
  const listQ = useQuery({ queryKey: ["trendyol", "local-list", picked?.sku], enabled: !!picked, queryFn: () => api.get<{ items: LocalProduct[] }>(`/api/admin/products${qs({ q: picked!.sku })}`) });
  const pid = productId ?? listQ.data?.items?.find((p) => p.variants?.some((v) => v.id === picked?.variantId))?.id;
  const prodQ = useQuery({ queryKey: ["trendyol", "local-product", pid], enabled: !!pid, queryFn: () => api.get<LocalProduct>(`/api/admin/products/${pid}`) });
  const product = prodQ.data;

  useEffect(() => {
    if (!product || (!picked && !productId)) return;
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const desc = product.descriptionTr?.trim() ?? "";
    const first = product.variants.find((x) => x.id === picked?.variantId) ?? product.variants[0];
    const priceOf = (v?: LocalVariant) => major(v?.prices.trendyol ?? v?.prices.website ?? picked?.unitPrice ?? 0);
    const stockOf = (v: LocalVariant) => String(Math.max(0, v.stock ? v.stock.total - v.stock.reserved - v.stock.safetyStock : v.id === picked?.variantId ? picked.stock : 0));
    const many = product.variants.length > 1;
    // the picked variant first, then the rest: all of them are sent unless unticked
    const ordered = first ? [first, ...product.variants.filter((v) => v.id !== first.id)] : [];
    setRows(ordered.map((v) => ({ variantId: v.id, label: v.title || v.sku, hints: [v.title ?? "", ...Object.values(v.options ?? {})].filter(Boolean), include: true, barcode: v.barcode || v.sku, stockCode: v.sku, quantity: stockOf(v), listPrice: priceOf(v), salePrice: priceOf(v), attrs: {} })));
    const tax = picked?.taxRate ?? (product as { taxRate?: number | null }).taxRate;
    setForm((f) => ({
      ...f,
      barcode: first?.barcode || first?.sku || "", stockCode: first?.sku ?? "", productMainId: (product.slug || first?.sku || "").toUpperCase().slice(0, 40),
      title: (many ? product.nameTr : `${product.nameTr}${first?.title && first.title !== product.nameTr ? ` - ${first.title}` : ""}`).slice(0, 100),
      description: desc ? (/<\w+/.test(desc) ? desc : `<p>${desc.replace(/\n+/g, "</p><p>")}</p>`) : "",
      vatRate: VAT.includes(String(tax)) ? String(tax) : "20",
      listPrice: priceOf(first), salePrice: priceOf(first),
      quantity: first ? stockOf(first) : "0",
      images: product.images.map((i) => absoluteImage(i.url ?? undefined, i.mediaId ?? undefined, origin)).filter(Boolean).slice(0, 8),
    }));
  }, [picked, product, productId]);

  /* ---- automatic brand / category / settings: from the local product, the store, what was chosen last time ---- */
  const localCats = useCategories();
  const storeSettings = useSettings();
  const remQ = useQuery({
    queryKey: ["trendyol", "defaults", product?.categoryId], enabled: !!product?.categoryId, staleTime: 60_000,
    queryFn: () => api.get<{ defaults: RememberedDefaults | null }>(`/api/admin/trendyol/defaults${qs({ category: product!.categoryId! })}`),
  });
  const remembered = remQ.data?.defaults ?? null;
  const remReady = !product?.categoryId || remQ.isFetched || remQ.isError;
  const localCat = localCats.data?.find((c) => c.id === product?.categoryId);
  const catNames = useMemo(() => {   // the product's category first, then its parents: "Çanta Süsü", "Aksesuar"
    const out: string[] = []; let cur = localCat;
    for (let n = 0; cur && n < 5; n++) { out.push(cur.name); cur = localCats.data?.find((c) => c.id === cur?.parentId); }
    return out;
  }, [localCat, localCats.data]);
  // Trendyol's full category tree is several MB (more than the console returns), so categories are searched BY NAME: the most specific
  // local category name first, then its parent's name as a second chance.
  const treeA = useTyQuery(w.call.run, ops.getCategoryTree, { query: { name: catNames[0] ?? "" } }, { enabled: !!product && remReady && catNames.length > 0 && form.categoryId == null && !manual.current.category });
  const treeB = useTyQuery(w.call.run, ops.getCategoryTree, { query: { name: catNames[1] ?? "" } }, { enabled: !!product && remReady && catNames.length > 1 && form.categoryId == null && !manual.current.category && treeA.isFetched && leaves(treeA.data?.response.body).length === 0 });
  const allLeaves = useMemo(() => { const m = new Map<number, Leaf>(); for (const l of [...leaves(treeA.data?.response.body), ...leaves(treeB.data?.response.body)]) m.set(l.id, l); return [...m.values()]; }, [treeA.data, treeB.data]);
  const brandWanted = (remembered?.brandName || product?.brand || storeSettings.data?.general?.storeName || "").trim();
  const brandQ = useTyQuery(w.call.run, ops.getBrandsByName, { query: { name: brandWanted } }, { enabled: !!product && remReady && brandWanted.length >= 2 && form.brandId == null && !manual.current.brand });
  const settings0 = useRef(false);

  // cargo, delivery time, origin, KDV: what was used for this category last time (once)
  useEffect(() => {
    if (!product || !remReady || settings0.current || !form.title) return;
    settings0.current = true;
    const first = product.variants.find((x) => x.id === picked?.variantId) ?? product.variants[0];
    const kg = first?.weightGrams ? { dimensionalWeight: String(desiFromGrams(first.weightGrams)) } : {};
    if (remembered) { set({ ...kg, cargo: remembered.cargo, deliveryDuration: remembered.deliveryDuration, origin: remembered.origin, dimensionalWeight: first?.weightGrams ? String(desiFromGrams(first.weightGrams)) : remembered.dimensionalWeight }); addNote("remembered", t("trendyolviews.wizard.auto.remembered", { category: localCat?.name ?? "" })); }
    else if (first?.weightGrams) set(kg);
  }, [product, remReady, form.title]); // eslint-disable-line react-hooks/exhaustive-deps

  // brand: remembered id, else the local brand / store name looked up on Trendyol (an equal name is taken, otherwise suggested)
  useEffect(() => {
    if (!product || !remReady || form.brandId != null || manual.current.brand) return;
    if (remembered?.brandId) { set({ brandId: remembered.brandId }); setBrandName(remembered.brandName); addNote("brand", t("trendyolviews.wizard.auto.brand.remembered", { name: remembered.brandName })); return; }
    const list = (arr(brandQ.data?.response.body) as Record<string, unknown>[]).map((b) => ({ id: num(b.id), name: str(b.name) })).filter((b) => b.id > 0);
    if (!list.length) { setBrandSugg([]); return; }
    const m = matchBrand(list, brandWanted);
    if (m.exact) { set({ brandId: m.exact.id }); setBrandName(m.exact.name); addNote("brand", product.brand ? t("trendyolviews.wizard.auto.brand.product", { name: m.exact.name }) : t("trendyolviews.wizard.auto.brand.store", { name: m.exact.name })); setBrandSugg([]); }
    else setBrandSugg(m.ranked);
  }, [product, remReady, brandQ.data, remembered]); // eslint-disable-line react-hooks/exhaustive-deps

  // category: remembered > the store imported it from Trendyol (id inside the local id) > an equal leaf name > suggestions
  useEffect(() => {
    if (!product || !remReady || form.categoryId != null || manual.current.category) return;
    const pick = (leaf: { id: number; path: string }, why: "remembered" | "imported" | "name", attrs?: RememberedDefaults["attrs"]) => {
      set({ categoryId: leaf.id, attrs: Object.fromEntries(Object.entries(attrs ?? {}).map(([k, v]) => [Number(k), v])) }); setCatPath(leaf.path); setCatSugg([]);
      addNote("category", why === "remembered" ? t("trendyolviews.wizard.auto.category.remembered", { path: leaf.path }) : why === "imported" ? t("trendyolviews.wizard.auto.category.imported", { path: leaf.path }) : t("trendyolviews.wizard.auto.category.name", { path: leaf.path }));
    };
    // remembered and imported categories carry their Trendyol id: no lookup needed
    if (remembered?.trendyolCategoryId) { pick({ id: remembered.trendyolCategoryId, path: remembered.categoryPath }, "remembered", remembered.attrs); return; }
    if (!allLeaves.length) return;
    // a category imported from Trendyol is only taken when Trendyol lists it as a LEAF (an imported parent such as "Aksesuar" cannot hold products)
    const imp = importedCategoryId(product.categoryId);
    const il = imp != null ? allLeaves.find((l) => l.id === imp) : undefined;
    if (il) { pick(il, "imported"); return; }
    const r = rankCategories(allLeaves, catNames.length ? catNames : [product.nameTr]);
    if (r.exact) pick(r.exact, "name");
    else setCatSugg(r.ranked);
  }, [product, remReady, allLeaves, remembered, catNames]); // eslint-disable-line react-hooks/exhaustive-deps

  const problems = useMemo(() => { const c = checkJson(jsonText); return c.ok ? validateBody(c.value, required) : null; }, [jsonText, required]);
  const jsonCheck = jsonText ? checkJson(jsonText) : null;
  const formIssues = validateBody(buildBody(form, rows), required);
  const canNext = step === 0 ? !!product && (!!picked || !!productId) : step === 1 ? formIssues.length === 0 : step === 2 ? !!jsonCheck?.ok && problems?.length === 0 : false;

  const go = (n: number) => { if (n === 2) setJsonText(prettyJson(buildBody(form, rows))); setStep(n); };
  const submit = async () => {
    if (!jsonCheck?.ok) return;
    const r = await w.exec(ops.createProducts, { body: jsonCheck.value }, { refresh: false });
    const id = str(rec(r?.response.body).batchRequestId);
    if (r?.ok && id) {
      setBatch({ id, barcode: str(rec(arr(rec(jsonCheck.value).items)[0]).barcode) }); setStep(3);
      void linkVariants(arr(rec(jsonCheck.value).items).map((it) => str(it.barcode)));
      void remember();
    }
  };
  /** Remember this product's Trendyol choices for its local category: the next product of that category is filled automatically. */
  const remember = async () => {
    if (!product?.categoryId || !form.categoryId) return;
    const shared = Object.fromEntries(Object.entries(form.attrs).filter(([id, c]) => !varianters.includes(Number(id)) && (c.ids.length || c.custom.trim())));
    try {
      await api.put("/api/admin/trendyol/defaults", {
        localCategoryId: product.categoryId, trendyolCategoryId: form.categoryId, categoryPath: catPath, brandId: form.brandId, brandName,
        attrs: shared, cargo: form.cargo, vatRate: form.vatRate, dimensionalWeight: form.dimensionalWeight, deliveryDuration: form.deliveryDuration, origin: form.origin,
      });
      void qc.invalidateQueries({ queryKey: ["trendyol", "defaults"] });
    } catch { /* a convenience: never blocks the submission */ }
  };
  /** Link every sent variant to its Trendyol barcode and mark the product "waiting for approval": sync starts when Trendyol approves it. */
  const linkVariants = async (sent: string[]) => {
    if (!pid) return;
    const multi = rows.length > 1;
    const todo = multi ? rows.filter((r) => r.include && sent.includes(r.barcode)) : rows.slice(0, 1).map((r) => ({ ...r, barcode: sent[0] ?? r.barcode }));
    let ok = 0; let failed: string | null = null;
    for (const r of todo) {
      try { await api.post("/api/admin/trendyol/mappings", { variantId: r.variantId, barcode: r.barcode }); ok++; }
      catch (e) { failed = e instanceof Error ? e.message : String(e); }
    }
    try { await api.post("/api/admin/trendyol/sync/verify", { productIds: [pid] }); } catch { /* the periodic re-check picks it up */ }
    setLinked({ ok, failed });
    void qc.invalidateQueries({ queryKey: ["trendyol"] });
  };

  return (
    <Card title={t("trendyolviews.wizard.title")} actions={<Button size="sm" variant="ghost" onClick={onClose}><X size={14} />{t("common.close")}</Button>} testId="tdyv-wizard">
      <ol className="mb-5 flex flex-wrap gap-2" aria-label={t("trendyolviews.wizard.steps")}>
        {STEPS.map((s, i) => (
          <li key={s} aria-current={i === step ? "step" : undefined} className={cx("flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium", i === step ? "border-brand-600 bg-brand-50 text-brand-ink" : i < step ? "border-success-line bg-success-soft text-success" : "border-line text-muted")}>
            <span className="grid size-4 place-items-center rounded-full bg-current/15 text-[10px]">{i < step ? <Check size={10} /> : i + 1}</span>{t(`trendyolviews.wizard.step.${s}`)}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <div className="space-y-4">
          <p className="text-sm text-muted">{t(productId ? "trendyolviews.wizard.local.fromProduct" : "trendyolviews.wizard.local.body")}</p>
          {productId && prodQ.isPending && <TableSkeleton rows={2} />}
          {!productId && <Typeahead<LookupItem> label={t("trendyolviews.wizard.local.search")} hint={t("trendyolviews.wizard.local.hint")} path="/api/admin/catalog-lookup" value={search} onChange={(v) => { setSearch(v); setPicked(null); }}
            onPick={(it) => { setPicked(it); setSearch(lookupLabel(it)); }} render={(it) => <LookupRow it={it} />} placeholder={t("trendyolviews.wizard.local.placeholder")} minChars={1} />}
          {picked && (listQ.isPending || prodQ.isPending) && <TableSkeleton rows={2} />}
          {(listQ.error || prodQ.error) && <TyErrorBox error={listQ.error ?? prodQ.error} />}
          {picked && !pid && listQ.isSuccess && <InlineError text={t("trendyolviews.wizard.local.notFound")} />}
          {product && <div className="flex items-center gap-3 rounded-xl border border-line bg-canvas p-3">
            {form.images[0] && <img src={form.images[0]} alt="" className="size-14 rounded-lg object-cover ring-1 ring-line" />}
            <div className="min-w-0 text-sm"><p className="font-medium">{picked ? lookupLabel(picked) : product.nameTr}</p><p className="text-xs text-muted">{picked && <><Term id="sku" />: {picked.sku} · </>}{t("trendyolviews.wizard.local.variants", { n: product.variants.length })} · {t("trendyolviews.wizard.local.images", { n: product.images.length })}</p></div></div>}
        </div>
      )}

      {step === 1 && <FieldsStep notes={notes} brandSugg={brandSugg} catSugg={catSugg} onManual={(k) => { manual.current[k] = true; setNotes((n) => n.filter((x) => x.key !== k)); }} setVarianters={setVarianters} rows={rows} setRows={setRows} form={form} set={set} w={w} ops={ops} brandName={brandName} setBrandName={setBrandName} catPath={catPath} setCatPath={setCatPath} setRequired={setRequired} issues={formIssues.length} />}

      {step === 2 && (
        <div className="space-y-3">
          <p className="text-sm text-muted">{t("trendyolviews.wizard.preview.body")}</p>
          <TextArea label={t("trendyolviews.wizard.preview.json")} hint={t("trendyolviews.wizard.preview.hint")} help="trendyolviews.createBody" className="min-h-96 font-mono text-xs" spellCheck={false} value={jsonText} onChange={(e) => setJsonText(e.target.value)} />
          <div className="flex flex-wrap gap-2"><Button size="sm" variant="secondary" onClick={() => setJsonText(prettyJson(buildBody(form, rows)))}>{t("trendyolviews.wizard.preview.reset")}</Button></div>
          {jsonCheck && !jsonCheck.ok && <InlineError text={t("trendyolviews.wizard.preview.invalid", { line: jsonCheck.line, col: jsonCheck.col, msg: jsonCheck.message })} />}
          {problems && (problems.length ? <ul className="space-y-1 rounded-lg border border-warn-line bg-warn-soft p-3 text-sm text-warn" aria-label={t("trendyolviews.wizard.preview.problems")}>{problems.map((p, i) => <li key={i} className="flex gap-2"><AlertTriangle size={14} className="mt-0.5 shrink-0" /><span><code className="font-mono text-xs">{p.field}</code> — {td(p.key, p.vars)}</span></li>)}</ul>
            : <p className="flex items-center gap-2 text-sm text-success"><Check size={14} />{t("trendyolviews.wizard.preview.ok")}</p>)}
          <InlineError text={w.err} />
          <p className="text-xs text-muted">{t("trendyolviews.wizard.preview.async")}</p>
        </div>
      )}

      {step === 3 && batch && (
        <div className="space-y-3">
          <p className="text-sm">{t("trendyolviews.wizard.submitted")}</p>
          {linked && <p role="status" data-testid="tdyv-wizard-linked" className={cx("rounded-lg border px-3 py-2 text-sm", linked.failed ? "border-warn-line bg-warn-soft text-warn" : "border-success-line bg-success-soft text-success")}>{linked.failed ? t("trendyolviews.wizard.linkFailed", { n: linked.ok, reason: linked.failed }) : t("trendyolviews.wizard.linkedNote", { n: linked.ok })}</p>}
          <BatchPanel id={batch.id} label={t("trendyolviews.wizard.batchLabel")} run={w.call.run} op={ops.getBatchRequestResult} onClose={() => setBatch(null)}
            extra={() => <div className="flex flex-wrap items-center gap-2"><Button size="sm" variant="secondary" onClick={() => setMapping(true)}>{t("trendyolviews.map.cta")}</Button><span className="text-xs text-muted">{t("trendyolviews.wizard.pendingNote")}</span></div>} />
          {picked && mapping && <MapPrefilled picked={picked} barcode={batch.barcode} onClose={() => setMapping(false)} />}
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4">
        <Button variant="ghost" disabled={step === 0 || step === 3} onClick={() => go(step - 1)}>{t("common.previous")}</Button>
        {step < 2 && <Button disabled={!canNext} onClick={() => go(step + 1)}>{t("common.next")}</Button>}
        {step === 2 && <Button disabled={!canNext} loading={w.call.isPending} onClick={() => void submit()}>{t("trendyolviews.wizard.submit")}</Button>}
        {step === 3 && <Button onClick={onClose}>{t("trendyolviews.wizard.done")}</Button>}
      </div>
    </Card>
  );
}

/** Mapping with the wizard's chosen variant: one confirmation, then POST /api/admin/trendyol/mappings. */
function MapPrefilled({ picked, barcode, onClose }: { picked: LookupItem; barcode: string; onClose: () => void }) {
  const { t } = useT();
  const map = useMapVariant();
  return <ConfirmDialog open title={t("trendyolviews.map.title")} message={t("trendyolviews.map.confirm", { barcode, sku: picked.sku })} confirmLabel={t("trendyolviews.map.save")} loading={map.isPending}
    onClose={onClose} onConfirm={() => map.mutate({ variantId: picked.variantId, barcode }, { onSuccess: onClose })} />;
}


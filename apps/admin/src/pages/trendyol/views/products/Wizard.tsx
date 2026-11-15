import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, X } from "lucide-react";
import { Badge, Button, Card, ConfirmDialog, SelectField, TextArea, TextField, cx, useDebounced } from "../../../../components/ui";
import { Term } from "../../../../components/help/Term";
import { Typeahead } from "../../../../components/Typeahead";
import { InlineError, TableSkeleton, TyErrorBox, arr, num, rec, str, useTyQuery } from "../../../../components/trendyol/views/shared";
import type { useOps, useTyWrite } from "../../../../components/trendyol/views/shared";
import { api, qs } from "../../../../lib/api";
import { checkJson, prettyJson } from "../../../../lib/trendyol";
import { useT } from "../../../../i18n";
import { BatchPanel } from "./BatchPanel";
import { absoluteImage, buildBody, emptyForm, isPublicHttps, leaves, validateBody } from "./build";
import { desiFromGrams, importedCategoryId, matchAttrValue, matchBrand, rankCategories, type BrandHit, type CategoryLeaf, type RememberedDefaults } from "./autofill";
import { useCategories } from "../../../Categories";
import { useSettings } from "../../../../lib/settings";
import type { AttrChoice, VariantRow, WizardForm } from "./build";
import { LookupRow, lookupLabel, useMapVariant } from "./Mappings";
import type { LookupItem } from "./Mappings";

type Ops = ReturnType<typeof useOps>["ops"];
type W = ReturnType<typeof useTyWrite>;
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
  const tree = useTyQuery(w.call.run, ops.getCategoryTree, {});
  const allLeaves = useMemo(() => leaves(tree.data?.response.body), [tree.data]);
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
    if (!product || !remReady || form.categoryId != null || manual.current.category || !allLeaves.length) return;
    const pick = (leaf: { id: number; path: string }, why: "remembered" | "imported" | "name", attrs?: RememberedDefaults["attrs"]) => {
      set({ categoryId: leaf.id, attrs: Object.fromEntries(Object.entries(attrs ?? {}).map(([k, v]) => [Number(k), v])) }); setCatPath(leaf.path); setCatSugg([]);
      addNote("category", why === "remembered" ? t("trendyolviews.wizard.auto.category.remembered", { path: leaf.path }) : why === "imported" ? t("trendyolviews.wizard.auto.category.imported", { path: leaf.path }) : t("trendyolviews.wizard.auto.category.name", { path: leaf.path }));
    };
    const known = (id: number) => allLeaves.find((l) => l.id === id);
    const rl = remembered && known(remembered.trendyolCategoryId);
    if (remembered && rl) { pick(rl, "remembered", remembered.attrs); return; }
    const imp = importedCategoryId(product.categoryId); const il = imp != null ? known(imp) : undefined;
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

/* ------------------------------------------------------------------ step 2 */

function FieldsStep({ notes, brandSugg, catSugg, onManual, setVarianters, rows, setRows, form, set, w, ops, brandName, setBrandName, catPath, setCatPath, setRequired, issues }: {
  notes: { key: string; text: string }[]; brandSugg: BrandHit[]; catSugg: CategoryLeaf[]; onManual: (k: "brand" | "category") => void; setVarianters: (ids: number[]) => void;
  rows: VariantRow[]; setRows: (f: (r: VariantRow[]) => VariantRow[]) => void; form: WizardForm; set: (p: Partial<WizardForm>) => void; w: W; ops: Ops; brandName: string; setBrandName: (s: string) => void; catPath: string; setCatPath: (s: string) => void; setRequired: (ids: number[]) => void; issues: number;
}) {
  const { t } = useT();
  const cargo = useTyQuery(w.call.run, ops.getCargoProviders, {});
  const providers = arr(cargo.data?.response.body);
  useEffect(() => { if (!form.cargo && providers[0]) set({ cargo: str(providers[0].code) }); }, [providers.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const publicImages = form.images.every(isPublicHttps);
  const many = rows.length > 1;
  const setRow = (id: string, p: Partial<VariantRow>) => setRows((rs) => rs.map((r) => (r.variantId === id ? { ...r, ...p } : r)));
  return (
    <div className="space-y-6">
      {notes.length > 0 && (
        <div role="status" data-testid="tdyv-autofill" className="space-y-1 rounded-xl border border-success-line bg-success-soft px-4 py-3 text-sm text-success">
          <p className="font-medium">{t("trendyolviews.wizard.auto.title")}</p>
          <ul className="list-inside list-disc text-xs">{notes.map((n) => <li key={n.key}>{n.text}</li>)}</ul>
          <p className="text-xs opacity-80">{t("trendyolviews.wizard.auto.hint")}</p>
        </div>
      )}
      <p className="text-sm text-muted">{t("trendyolviews.wizard.fields.body")} {issues > 0 && <Badge tone="warning">{t("trendyolviews.wizard.fields.issues", { n: issues })}</Badge>}</p>
      <div className="grid gap-4 lg:grid-cols-2">
        <BrandPicker w={w} ops={ops} value={form.brandId} name={brandName} suggestions={brandSugg} onPick={(id, n) => { onManual("brand"); set({ brandId: id }); setBrandName(n); }} />
        <CategoryPicker w={w} ops={ops} value={form.categoryId} path={catPath} suggestions={catSugg} onPick={(id, p) => { onManual("category"); set({ categoryId: id, attrs: {} }); setCatPath(p); }} />
      </div>
      {form.categoryId && <Attributes w={w} ops={ops} categoryId={form.categoryId} attrs={form.attrs} onChange={(attrs) => set({ attrs })} setRequired={setRequired} setVarianters={setVarianters} rows={many ? rows.filter((r) => r.include) : []} setRow={setRow} sharedHints={many ? [] : rows[0]?.hints ?? []} />}
      {many && (
        <fieldset className="space-y-2" data-testid="tdyv-wizard-variants">
          <legend className="text-[13px] font-medium">{t("trendyolviews.wizard.variants.title")}</legend>
          <p className="text-xs text-muted">{t("trendyolviews.wizard.variants.hint")}</p>
          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="w-full min-w-[44rem] text-sm">
              <thead className="bg-canvas text-left text-xs text-muted"><tr>{(["send", "variant", "barcode", "stockCode", "quantity", "listPrice", "salePrice"] as const).map((k) => <th key={k} className="px-3 py-2 font-medium">{t(`trendyolviews.wizard.variants.col.${k}`)}</th>)}</tr></thead>
              <tbody className="divide-y divide-line">
                {rows.map((r) => {
                  const cell = (k: "barcode" | "stockCode" | "quantity" | "listPrice" | "salePrice", mode?: "numeric" | "decimal") => (
                    <td className="px-2 py-1.5"><input aria-label={`${t(`trendyolviews.wizard.variants.col.${k}`)}: ${r.label}`} inputMode={mode} disabled={!r.include} value={r[k]} onChange={(e) => setRow(r.variantId, { [k]: e.target.value })}
                      className="w-full min-w-20 rounded-lg border border-line bg-surface px-2 py-1.5 text-[13px] disabled:opacity-50 dark:bg-canvas" /></td>);
                  return (
                    <tr key={r.variantId}>
                      <td className="px-3 py-1.5"><input type="checkbox" className="size-4 accent-[var(--color-brand-600)]" aria-label={t("trendyolviews.wizard.variants.send", { name: r.label })} checked={r.include} onChange={(e) => setRow(r.variantId, { include: e.target.checked })} /></td>
                      <td className="px-3 py-1.5 font-medium">{r.label}</td>
                      {cell("barcode")}{cell("stockCode")}{cell("quantity", "numeric")}{cell("listPrice", "decimal")}{cell("salePrice", "decimal")}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </fieldset>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <TextField label={t("trendyolviews.wizard.f.title")} hint={t("trendyolviews.wizard.f.title.hint")} help="trendyolviews.title" value={form.title} maxLength={100} onChange={(e) => set({ title: e.target.value })} />
        {!many && <TextField label={t("trendyolviews.wizard.f.barcode")} hint={t("trendyolviews.wizard.f.barcode.hint")} help="trendyolviews.barcode" value={form.barcode} maxLength={40} onChange={(e) => set({ barcode: e.target.value })} />}
        {!many && <TextField label={t("trendyolviews.wizard.f.stockCode")} hint={t("trendyolviews.wizard.f.stockCode.hint")} help="trendyolviews.stockCode" value={form.stockCode} onChange={(e) => set({ stockCode: e.target.value })} />}
        <TextField label={t("trendyolviews.wizard.f.main")} hint={t("trendyolviews.wizard.f.main.hint")} help="trendyolviews.productMainId" value={form.productMainId} maxLength={40} onChange={(e) => set({ productMainId: e.target.value })} />
        <SelectField label={t("trendyolviews.wizard.f.vat")} hint={t("trendyolviews.wizard.f.vat.hint")} help="trendyolviews.vat" value={form.vatRate} onChange={(e) => set({ vatRate: e.target.value })}>{VAT.map((v) => <option key={v} value={v}>%{v}</option>)}</SelectField>
        {!many && <TextField label={t("trendyolviews.wizard.f.quantity")} hint={t("trendyolviews.wizard.f.quantity.hint")} help="trendyolviews.quantity" inputMode="numeric" value={form.quantity} onChange={(e) => set({ quantity: e.target.value })} />}
        {!many && <TextField label={t("trendyolviews.wizard.f.listPrice")} hint={t("trendyolviews.wizard.f.listPrice.hint")} help="trendyolviews.listPrice" inputMode="decimal" value={form.listPrice} onChange={(e) => set({ listPrice: e.target.value })} />}
        {!many && <TextField label={t("trendyolviews.wizard.f.salePrice")} hint={t("trendyolviews.wizard.f.salePrice.hint")} help="trendyolviews.salePrice" inputMode="decimal" value={form.salePrice} onChange={(e) => set({ salePrice: e.target.value })} />}
        <SelectField label={t("trendyolviews.wizard.f.cargo")} hint={t("trendyolviews.wizard.f.cargo.hint")} help="trendyolviews.cargoProvider" value={form.cargo} onChange={(e) => set({ cargo: e.target.value })}>
          <option value="">{t("trendyolviews.wizard.f.cargo.none")}</option>{providers.map((p) => <option key={str(p.code)} value={str(p.code)}>{str(p.name)}</option>)}</SelectField>
        <TextField label={t("trendyolviews.wizard.f.dimensional")} hint={t("trendyolviews.wizard.f.dimensional.hint")} help="trendyolviews.dimensionalWeight" inputMode="decimal" value={form.dimensionalWeight} onChange={(e) => set({ dimensionalWeight: e.target.value })} />
      </div>
      <TextArea label={t("trendyolviews.wizard.f.description")} hint={t("trendyolviews.wizard.f.description.hint")} help="trendyolviews.description" className="min-h-32" value={form.description} onChange={(e) => set({ description: e.target.value })} />
      <fieldset className="space-y-2">
        <legend className="text-[13px] font-medium">{t("trendyolviews.wizard.f.images")}</legend>
        <p className="text-xs text-muted">{t("trendyolviews.wizard.f.images.hint")}</p>
        {!publicImages && <p className="flex gap-2 rounded-lg border border-warn-line bg-warn-soft p-3 text-sm text-warn" role="alert"><AlertTriangle size={16} className="mt-0.5 shrink-0" />{t("trendyolviews.wizard.f.images.warn")}</p>}
        <ul className="space-y-2">
          {form.images.map((u, i) => (
            <li key={i} className="flex items-center gap-2"><img src={u} alt="" className="size-10 shrink-0 rounded-lg object-cover ring-1 ring-line" onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = "hidden"; }} />
              <input aria-label={t("trendyolviews.wizard.f.images.url", { n: i + 1 })} value={u} onChange={(e) => set({ images: form.images.map((x, j) => (j === i ? e.target.value : x)) })} className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-2 font-mono text-xs dark:bg-canvas" />
              <Button size="sm" variant="ghost" aria-label={t("trendyolviews.wizard.f.images.remove", { n: i + 1 })} onClick={() => set({ images: form.images.filter((_, j) => j !== i) })}><X size={14} /></Button></li>
          ))}
        </ul>
        <Button size="sm" variant="secondary" disabled={form.images.length >= 8} onClick={() => set({ images: [...form.images, "https://"] })}>{t("trendyolviews.wizard.f.images.add")}</Button>
      </fieldset>
    </div>
  );
}

function BrandPicker({ w, ops, value, name, onPick, suggestions }: { w: W; ops: Ops; value: number | null; name: string; onPick: (id: number, name: string) => void; suggestions: BrandHit[] }) {
  const { t } = useT();
  const [text, setText] = useState(""); const dq = useDebounced(text.trim(), 300);
  const q = useTyQuery(w.call.run, ops.getBrandsByName, { query: { name: dq } }, { enabled: dq.length >= 2 });
  const list = arr(q.data?.response.body).slice(0, 12);
  return (
    <div className="space-y-1.5">
      <TextField label={t("trendyolviews.wizard.f.brand")} hint={t("trendyolviews.wizard.f.brand.hint")} help="trendyolviews.brand" value={text} onChange={(e) => setText(e.target.value)} placeholder={t("trendyolviews.wizard.f.brand.placeholder")} autoComplete="off" />
      {value ? <p className="text-xs"><Badge tone="success">{name || `#${value}`}</Badge></p> : null}
      {!value && suggestions.length > 0 && dq.length < 2 && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs" data-testid="tdyv-brand-suggest"><span className="text-muted">{t("trendyolviews.wizard.auto.suggested")}</span>
          {suggestions.map((b) => <button key={b.id} type="button" onClick={() => onPick(b.id, b.name)} className="rounded-full border border-brand-600/50 bg-brand-50 px-3 py-1 text-brand-ink hover:border-brand-600">{b.name}</button>)}</div>
      )}
      {dq.length >= 2 && (q.isFetching ? <p className="text-xs text-muted">{t("ui.typeahead.searching")}</p> : q.error ? <TyErrorBox error={q.error} /> : list.length === 0 ? <p className="text-xs text-muted">{t("ui.typeahead.none")}</p>
        : <ul className="flex flex-wrap gap-1.5" aria-label={t("trendyolviews.wizard.f.brand")}>{list.map((b) => <li key={num(b.id)}><button type="button" onClick={() => { onPick(num(b.id), str(b.name)); setText(str(b.name)); }} className={cx("rounded-full border px-3 py-1 text-xs hover:border-brand-600", value === num(b.id) ? "border-brand-600 bg-brand-50 text-brand-ink" : "border-line")}>{str(b.name)}</button></li>)}</ul>)}
    </div>
  );
}

function CategoryPicker({ w, ops, value, path, onPick, suggestions }: { w: W; ops: Ops; value: number | null; path: string; onPick: (id: number, path: string) => void; suggestions: CategoryLeaf[] }) {
  const { t } = useT();
  const tree = useTyQuery(w.call.run, ops.getCategoryTree, {});
  const all = useMemo(() => leaves(tree.data?.response.body), [tree.data]);
  const [text, setText] = useState("");
  const f = text.trim().toLocaleLowerCase("tr");
  const list = (f ? all.filter((l) => l.path.toLocaleLowerCase("tr").includes(f)) : all).slice(0, 30);
  return (
    <div className="space-y-1.5">
      <TextField label={t("trendyolviews.wizard.f.category")} hint={t("trendyolviews.wizard.f.category.hint")} help="trendyolviews.category" value={text} onChange={(e) => setText(e.target.value)} placeholder={t("trendyolviews.wizard.f.category.placeholder")} autoComplete="off" />
      {value ? <p className="text-xs"><Badge tone="success">{path || `#${value}`}</Badge></p> : null}
      {!value && suggestions.length > 0 && !text.trim() && (
        <div className="space-y-1 text-xs" data-testid="tdyv-category-suggest"><span className="text-muted">{t("trendyolviews.wizard.auto.suggested")}</span>
          <div className="flex flex-wrap gap-1.5">{suggestions.map((l) => <button key={l.id} type="button" onClick={() => onPick(l.id, l.path)} className="rounded-full border border-brand-600/50 bg-brand-50 px-3 py-1 text-left text-brand-ink hover:border-brand-600">{l.path}</button>)}</div></div>
      )}
      {tree.isPending ? <TableSkeleton rows={2} /> : tree.error ? <TyErrorBox error={tree.error} retry={() => void tree.refetch()} />
        : <ul className="max-h-44 overflow-auto rounded-lg border border-line" aria-label={t("trendyolviews.wizard.f.category")}>{list.map((l) => <li key={l.id}><button type="button" onClick={() => onPick(l.id, l.path)} aria-pressed={value === l.id} className={cx("block w-full px-3 py-1.5 text-left text-xs hover:bg-hover", value === l.id && "bg-brand-50 text-brand-ink")}>{l.path}</button></li>)}{list.length === 0 && <li className="px-3 py-2 text-xs text-muted">{t("ui.typeahead.none")}</li>}</ul>}
    </div>
  );
}

function Attributes({ w, ops, categoryId, attrs, onChange, setRequired, setVarianters, rows, setRow, sharedHints }: { w: W; ops: Ops; categoryId: number; attrs: Record<number, AttrChoice>; onChange: (a: Record<number, AttrChoice>) => void; setRequired: (ids: number[]) => void; setVarianters: (ids: number[]) => void; rows: VariantRow[]; setRow: (id: string, p: Partial<VariantRow>) => void; sharedHints: string[] }) {
  const { t } = useT();
  const q = useTyQuery(w.call.run, ops.getCategoryAttributes, { path: { categoryId } });
  const list = arr(rec(q.data?.response.body).categoryAttributes);
  useEffect(() => { setRequired(list.filter((a) => a.required === true).map((a) => num(rec(a.attribute).id))); setVarianters(list.filter((a) => a.varianter === true).map((a) => num(rec(a.attribute).id))); }, [q.data]); // eslint-disable-line react-hooks/exhaustive-deps
  if (q.isPending) return <TableSkeleton rows={2} />;
  if (q.error) return <TyErrorBox error={q.error} retry={() => void q.refetch()} />;
  const sorted = [...list].sort((a, b) => Number(b.required === true) - Number(a.required === true));
  return (
    <fieldset className="space-y-3">
      <legend className="text-[13px] font-medium">{t("trendyolviews.wizard.attrs")}</legend>
      <p className="text-xs text-muted">{t("trendyolviews.wizard.attrs.hint")}</p>
      <div className="grid gap-4 lg:grid-cols-2">
        {sorted.map((a) => <AttrField key={num(rec(a.attribute).id)} a={a} w={w} ops={ops} categoryId={categoryId} choice={attrs[num(rec(a.attribute).id)] ?? { ids: [], custom: "" }} onChange={(c) => onChange({ ...attrs, [num(rec(a.attribute).id)]: c })} rows={rows} setRow={setRow} sharedHints={sharedHints} />)}
      </div>
    </fieldset>
  );
}

function AttrField({ a, w, ops, categoryId, choice, onChange, rows, setRow, sharedHints }: { a: Record<string, unknown>; w: W; ops: Ops; categoryId: number; choice: AttrChoice; onChange: (c: AttrChoice) => void; rows: VariantRow[]; setRow: (id: string, p: Partial<VariantRow>) => void; sharedHints: string[] }) {
  const { t } = useT();
  const attr = rec(a.attribute); const id = num(attr.id);
  const vals = useTyQuery(w.call.run, ops.getCategoryAttributeValues, { path: { categoryId, attributeId: id }, query: { size: 1000 } });
  const options = arr(rec(vals.data?.response.body).content);
  const multi = a.allowMultipleAttributeValues === true;
  const optList = useMemo(() => options.map((o) => ({ id: num(o.attributeValueId), name: str(o.attributeValueName) })), [vals.data]); // eslint-disable-line react-hooks/exhaustive-deps
  // Automatic value: for a one-variant product from what the variant is called; a required attribute with a single possible value is simply taken.
  // Only fills an EMPTY field, and only when the options arrive: whatever the user (or last time's memory) set is never touched.
  const hintKey = sharedHints.join("|");
  useEffect(() => {
    if (rows.length > 1 || choice.ids.length || choice.custom.trim() || !optList.length) return;
    const hit = a.varianter === true || sharedHints.length ? matchAttrValue(optList, sharedHints) : null;
    const only = a.required === true && optList.length === 1 ? optList[0]! : null;
    const pick = hit ?? only;
    if (pick) onChange({ ids: [pick.id], custom: "" });
  }, [optList, hintKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const tags = [a.required === true && t("trendyolviews.wizard.attr.required"), a.varianter === true && t("trendyolviews.wizard.attr.varianter"), a.slicer === true && t("trendyolviews.wizard.attr.slicer")].filter(Boolean) as string[];
  const hint = tags.join(" · ") || t("trendyolviews.wizard.attr.optional");
  // A "varianter" attribute (colour, size...) is what tells the variants apart: one value per variant instead of one for all.
  if (a.varianter === true && rows.length > 1) {
    const EMPTY: AttrChoice = { ids: [], custom: "" };
    return (
      <div className="space-y-2 rounded-xl border border-brand-600/40 bg-brand-50/40 p-3 lg:col-span-2" data-testid={`tdyv-attr-${id}`}>
        <p className="text-[13px] font-medium">{str(attr.name)}{a.required === true ? " *" : ""} <span className="font-normal text-muted">· {t("trendyolviews.wizard.attr.perVariant")}</span></p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {rows.map((r) => <VariantAttrCell key={r.variantId} r={r} id={id} attrName={str(attr.name)} allowCustom={a.allowCustom === true} loading={vals.isPending} options={optList} setRow={setRow} empty={EMPTY} />)}
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-1.5 rounded-xl border border-line p-3" data-testid={`tdyv-attr-${id}`}>
      <SelectField label={`${str(attr.name)}${a.required === true ? " *" : ""}`} hint={hint} help="trendyolviews.attribute" multiple={multi} value={multi ? choice.ids.map(String) : String(choice.ids[0] ?? "")}
        onChange={(e) => onChange({ ...choice, ids: multi ? Array.from(e.target.selectedOptions, (o) => Number(o.value)) : e.target.value ? [Number(e.target.value)] : [] })}>
        {!multi && <option value="">{vals.isPending ? t("ui.loading") : t("trendyolviews.wizard.attr.pick")}</option>}
        {options.map((o) => <option key={num(o.attributeValueId)} value={num(o.attributeValueId)}>{str(o.attributeValueName)}</option>)}
      </SelectField>
      {a.allowCustom === true && <TextField label={t("trendyolviews.wizard.attr.custom")} hint={t("trendyolviews.wizard.attr.custom.hint")} help="trendyolviews.attributeCustom" value={choice.custom} onChange={(e) => onChange({ ...choice, custom: e.target.value })} />}
    </div>
  );
}


/** One variant's value of a variant-defining attribute (colour, size...). Starts filled when the variant's name or options match a Trendyol value. */
function VariantAttrCell({ r, id, attrName, allowCustom, loading, options, setRow, empty }: { r: VariantRow; id: number; attrName: string; allowCustom: boolean; loading: boolean; options: { id: number; name: string }[]; setRow: (id: string, p: Partial<VariantRow>) => void; empty: AttrChoice }) {
  const { t } = useT();
  const c = r.attrs[id] ?? empty;
  const put = (next: AttrChoice) => setRow(r.variantId, { attrs: { ...r.attrs, [id]: next } });
  const hintKey = (r.hints ?? []).join("|");
  useEffect(() => {
    if (c.ids.length || c.custom.trim() || !options.length) return;
    const hit = matchAttrValue(options, r.hints ?? [r.label]);
    if (hit) put({ ids: [hit.id], custom: "" });
  }, [options, hintKey]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="space-y-1.5">
      <SelectField label={`${attrName}: ${r.label}`} value={String(c.ids[0] ?? "")} onChange={(e) => put({ ...c, ids: e.target.value ? [Number(e.target.value)] : [] })}>
        <option value="">{loading ? t("ui.loading") : t("trendyolviews.wizard.attr.pick")}</option>
        {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </SelectField>
      {allowCustom && <TextField label={`${t("trendyolviews.wizard.attr.custom")}: ${r.label}`} value={c.custom} onChange={(e) => put({ ...c, custom: e.target.value })} />}
    </div>
  );
}

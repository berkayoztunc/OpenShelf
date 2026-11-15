import { useEffect, useMemo, useState } from "react";
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
import type { AttrChoice, VariantRow, WizardForm } from "./build";
import { LookupRow, lookupLabel, useMapVariant } from "./Mappings";
import type { LookupItem } from "./Mappings";

type Ops = ReturnType<typeof useOps>["ops"];
type W = ReturnType<typeof useTyWrite>;
interface LocalVariant { id: string; sku: string; barcode: string | null; title: string | null; prices: { website: number | null; trendyol?: number | null }; stock?: { total: number; reserved: number; safetyStock: number } }
interface LocalProduct { id: string; nameTr: string; slug: string; descriptionTr?: string | null; variants: LocalVariant[]; images: { url?: string | null; mediaId?: string | null }[] }
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
  const set = (p: Partial<WizardForm>) => setForm((f) => ({ ...f, ...p }));

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
    setRows(ordered.map((v) => ({ variantId: v.id, label: v.title || v.sku, include: true, barcode: v.barcode || v.sku, stockCode: v.sku, quantity: stockOf(v), listPrice: priceOf(v), salePrice: priceOf(v), attrs: {} })));
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
    }
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

      {step === 1 && <FieldsStep rows={rows} setRows={setRows} form={form} set={set} w={w} ops={ops} brandName={brandName} setBrandName={setBrandName} catPath={catPath} setCatPath={setCatPath} setRequired={setRequired} issues={formIssues.length} />}

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

function FieldsStep({ rows, setRows, form, set, w, ops, brandName, setBrandName, catPath, setCatPath, setRequired, issues }: {
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
      <p className="text-sm text-muted">{t("trendyolviews.wizard.fields.body")} {issues > 0 && <Badge tone="warning">{t("trendyolviews.wizard.fields.issues", { n: issues })}</Badge>}</p>
      <div className="grid gap-4 lg:grid-cols-2">
        <BrandPicker w={w} ops={ops} value={form.brandId} name={brandName} onPick={(id, n) => { set({ brandId: id }); setBrandName(n); }} />
        <CategoryPicker w={w} ops={ops} value={form.categoryId} path={catPath} onPick={(id, p) => { set({ categoryId: id, attrs: {} }); setCatPath(p); }} />
      </div>
      {form.categoryId && <Attributes w={w} ops={ops} categoryId={form.categoryId} attrs={form.attrs} onChange={(attrs) => set({ attrs })} setRequired={setRequired} rows={many ? rows.filter((r) => r.include) : []} setRow={setRow} />}
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

function BrandPicker({ w, ops, value, name, onPick }: { w: W; ops: Ops; value: number | null; name: string; onPick: (id: number, name: string) => void }) {
  const { t } = useT();
  const [text, setText] = useState(""); const dq = useDebounced(text.trim(), 300);
  const q = useTyQuery(w.call.run, ops.getBrandsByName, { query: { name: dq } }, { enabled: dq.length >= 2 });
  const list = arr(q.data?.response.body).slice(0, 12);
  return (
    <div className="space-y-1.5">
      <TextField label={t("trendyolviews.wizard.f.brand")} hint={t("trendyolviews.wizard.f.brand.hint")} help="trendyolviews.brand" value={text} onChange={(e) => setText(e.target.value)} placeholder={t("trendyolviews.wizard.f.brand.placeholder")} autoComplete="off" />
      {value ? <p className="text-xs"><Badge tone="success">{name || `#${value}`}</Badge></p> : null}
      {dq.length >= 2 && (q.isFetching ? <p className="text-xs text-muted">{t("ui.typeahead.searching")}</p> : q.error ? <TyErrorBox error={q.error} /> : list.length === 0 ? <p className="text-xs text-muted">{t("ui.typeahead.none")}</p>
        : <ul className="flex flex-wrap gap-1.5" aria-label={t("trendyolviews.wizard.f.brand")}>{list.map((b) => <li key={num(b.id)}><button type="button" onClick={() => { onPick(num(b.id), str(b.name)); setText(str(b.name)); }} className={cx("rounded-full border px-3 py-1 text-xs hover:border-brand-600", value === num(b.id) ? "border-brand-600 bg-brand-50 text-brand-ink" : "border-line")}>{str(b.name)}</button></li>)}</ul>)}
    </div>
  );
}

function CategoryPicker({ w, ops, value, path, onPick }: { w: W; ops: Ops; value: number | null; path: string; onPick: (id: number, path: string) => void }) {
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
      {tree.isPending ? <TableSkeleton rows={2} /> : tree.error ? <TyErrorBox error={tree.error} retry={() => void tree.refetch()} />
        : <ul className="max-h-44 overflow-auto rounded-lg border border-line" aria-label={t("trendyolviews.wizard.f.category")}>{list.map((l) => <li key={l.id}><button type="button" onClick={() => onPick(l.id, l.path)} aria-pressed={value === l.id} className={cx("block w-full px-3 py-1.5 text-left text-xs hover:bg-hover", value === l.id && "bg-brand-50 text-brand-ink")}>{l.path}</button></li>)}{list.length === 0 && <li className="px-3 py-2 text-xs text-muted">{t("ui.typeahead.none")}</li>}</ul>}
    </div>
  );
}

function Attributes({ w, ops, categoryId, attrs, onChange, setRequired, rows, setRow }: { w: W; ops: Ops; categoryId: number; attrs: Record<number, AttrChoice>; onChange: (a: Record<number, AttrChoice>) => void; setRequired: (ids: number[]) => void; rows: VariantRow[]; setRow: (id: string, p: Partial<VariantRow>) => void }) {
  const { t } = useT();
  const q = useTyQuery(w.call.run, ops.getCategoryAttributes, { path: { categoryId } });
  const list = arr(rec(q.data?.response.body).categoryAttributes);
  useEffect(() => { setRequired(list.filter((a) => a.required === true).map((a) => num(rec(a.attribute).id))); }, [q.data]); // eslint-disable-line react-hooks/exhaustive-deps
  if (q.isPending) return <TableSkeleton rows={2} />;
  if (q.error) return <TyErrorBox error={q.error} retry={() => void q.refetch()} />;
  const sorted = [...list].sort((a, b) => Number(b.required === true) - Number(a.required === true));
  return (
    <fieldset className="space-y-3">
      <legend className="text-[13px] font-medium">{t("trendyolviews.wizard.attrs")}</legend>
      <p className="text-xs text-muted">{t("trendyolviews.wizard.attrs.hint")}</p>
      <div className="grid gap-4 lg:grid-cols-2">
        {sorted.map((a) => <AttrField key={num(rec(a.attribute).id)} a={a} w={w} ops={ops} categoryId={categoryId} choice={attrs[num(rec(a.attribute).id)] ?? { ids: [], custom: "" }} onChange={(c) => onChange({ ...attrs, [num(rec(a.attribute).id)]: c })} rows={rows} setRow={setRow} />)}
      </div>
    </fieldset>
  );
}

function AttrField({ a, w, ops, categoryId, choice, onChange, rows, setRow }: { a: Record<string, unknown>; w: W; ops: Ops; categoryId: number; choice: AttrChoice; onChange: (c: AttrChoice) => void; rows: VariantRow[]; setRow: (id: string, p: Partial<VariantRow>) => void }) {
  const { t } = useT();
  const attr = rec(a.attribute); const id = num(attr.id);
  const vals = useTyQuery(w.call.run, ops.getCategoryAttributeValues, { path: { categoryId, attributeId: id }, query: { size: 1000 } });
  const options = arr(rec(vals.data?.response.body).content);
  const multi = a.allowMultipleAttributeValues === true;
  const tags = [a.required === true && t("trendyolviews.wizard.attr.required"), a.varianter === true && t("trendyolviews.wizard.attr.varianter"), a.slicer === true && t("trendyolviews.wizard.attr.slicer")].filter(Boolean) as string[];
  const hint = tags.join(" · ") || t("trendyolviews.wizard.attr.optional");
  // A "varianter" attribute (colour, size...) is what tells the variants apart: one value per variant instead of one for all.
  if (a.varianter === true && rows.length > 1) {
    const EMPTY: AttrChoice = { ids: [], custom: "" };
    return (
      <div className="space-y-2 rounded-xl border border-brand-600/40 bg-brand-50/40 p-3 lg:col-span-2" data-testid={`tdyv-attr-${id}`}>
        <p className="text-[13px] font-medium">{str(attr.name)}{a.required === true ? " *" : ""} <span className="font-normal text-muted">· {t("trendyolviews.wizard.attr.perVariant")}</span></p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {rows.map((r) => {
            const c = r.attrs[id] ?? EMPTY;
            const put = (next: AttrChoice) => setRow(r.variantId, { attrs: { ...r.attrs, [id]: next } });
            return (
              <div key={r.variantId} className="space-y-1.5">
                <SelectField label={`${str(attr.name)}: ${r.label}`} value={String(c.ids[0] ?? "")} onChange={(e) => put({ ...c, ids: e.target.value ? [Number(e.target.value)] : [] })}>
                  <option value="">{vals.isPending ? t("ui.loading") : t("trendyolviews.wizard.attr.pick")}</option>
                  {options.map((o) => <option key={num(o.attributeValueId)} value={num(o.attributeValueId)}>{str(o.attributeValueName)}</option>)}
                </SelectField>
                {a.allowCustom === true && <TextField label={`${t("trendyolviews.wizard.attr.custom")}: ${r.label}`} value={c.custom} onChange={(e) => put({ ...c, custom: e.target.value })} />}
              </div>
            );
          })}
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


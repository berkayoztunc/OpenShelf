import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { filterLeaves, isPublicHttps, leaves, matchAttrValue, norm, type AttrChoice, type BrandHit, type CategoryLeaf, type VariantRow, type WizardForm } from "@openshelf/shared";
import { Badge, Button, SelectField, TextArea, TextField, cx, useDebounced } from "../../../../components/ui";
import { TableSkeleton, TyErrorBox, arr, num, rec, str, useTyQuery } from "../../../../components/trendyol/views/shared";
import type { useOps, useTyWrite } from "../../../../components/trendyol/views/shared";
import { useT } from "../../../../i18n";

export type Ops = ReturnType<typeof useOps>["ops"];
export type W = ReturnType<typeof useTyWrite>;
const VAT = ["0", "1", "10", "20"];
/** One attribute value of a category. The values endpoint answers `attributeValueId` / `attributeValue`, the inline lists of getCategoryAttributes `id` / `name` (OpenAPI says `attributeValueName`): all are read. */
export const valueOf = (o: Record<string, unknown>): { id: number; name: string } => ({ id: num(o.attributeValueId ?? o.id), name: str(o.attributeValueName ?? o.attributeValue ?? o.name) });

/* ------------------------------------------------------------------ step 2 */

export function FieldsStep({ notes, brandSugg, catSugg, onManual, setVarianters, rows, setRows, form, set, w, ops, brandName, setBrandName, catPath, setCatPath, setRequired, issues }: {
  notes: { key: string; text: string }[]; brandSugg: BrandHit[]; catSugg: CategoryLeaf[]; onManual: (k: "brand" | "category") => void; setVarianters: (ids: number[]) => void;
  rows: VariantRow[]; setRows: (f: (r: VariantRow[]) => VariantRow[]) => void; form: WizardForm; set: (p: Partial<WizardForm>) => void; w: W; ops: Ops; brandName: string; setBrandName: (s: string) => void; catPath: string; setCatPath: (s: string) => void; setRequired: (ids: number[]) => void; issues: number;
}) {
  const { t } = useT();
  const cargo = useTyQuery(w.call.run, ops.getCargoProviders, {});
  const providers = arr(cargo.data?.response.body);
  const publicImages = form.images.every(isPublicHttps);
  const many = rows.length > 1;
  // `attrs` patches are MERGED into the row's attributes (several attribute cells fill themselves in the same tick: none may overwrite another)
  const setRow = (id: string, p: Partial<VariantRow>) => setRows((rs) => rs.map((r) => (r.variantId === id ? { ...r, ...p, ...(p.attrs ? { attrs: { ...r.attrs, ...p.attrs } } : {}) } : r)));
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
      {form.categoryId && <Attributes origin={form.origin} w={w} ops={ops} categoryId={form.categoryId} attrs={form.attrs} onChange={(attrs) => set({ attrs })} setRequired={setRequired} setVarianters={setVarianters} rows={many ? rows.filter((r) => r.include) : []} setRow={setRow} sharedHints={many ? [] : rows[0]?.hints ?? []} />}
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
  const [text, setText] = useState(""); const dq = useDebounced(text.trim(), 350);
  // Searched on Trendyol by name: the full category tree is far too big to download, and an unfiltered list would be useless anyway.
  const tree = useTyQuery(w.call.run, ops.getCategoryTree, { query: { name: dq } }, { enabled: dq.length >= 2 });
  const found = useMemo(() => filterLeaves(leaves(tree.data?.response.body), dq), [tree.data, dq]);
  const truncated = tree.data?.response.truncated === true;
  return (
    <div className="space-y-1.5">
      <TextField label={t("trendyolviews.wizard.f.category")} hint={t("trendyolviews.wizard.f.category.hint")} help="trendyolviews.category" value={text} onChange={(e) => setText(e.target.value)} placeholder={t("trendyolviews.wizard.f.category.placeholder")} autoComplete="off" />
      {value ? <p className="text-xs"><Badge tone="success">{path || `#${value}`}</Badge></p> : null}
      {!value && suggestions.length > 0 && !text.trim() && (
        <div className="space-y-1 text-xs" data-testid="tdyv-category-suggest"><span className="text-muted">{t("trendyolviews.wizard.auto.suggested")}</span>
          <div className="flex flex-wrap gap-1.5">{suggestions.map((l) => <button key={l.id} type="button" onClick={() => onPick(l.id, l.path)} className="rounded-full border border-brand-600/50 bg-brand-50 px-3 py-1 text-left text-brand-ink hover:border-brand-600">{l.path}</button>)}</div></div>
      )}
      {dq.length < 2 ? <p className="text-xs text-muted">{t("trendyolviews.wizard.f.category.type")}</p>
        : tree.isFetching ? <TableSkeleton rows={2} />
        : tree.error ? <TyErrorBox error={tree.error} retry={() => void tree.refetch()} />
        : truncated && found.length === 0 ? <p role="alert" className="text-xs text-warn">{t("trendyolviews.wizard.f.category.tooMany")}</p>
        : <>
          <ul className="max-h-44 overflow-auto rounded-lg border border-line" aria-label={t("trendyolviews.wizard.f.category")}>{found.map((l) => <li key={l.id}><button type="button" onClick={() => onPick(l.id, l.path)} aria-pressed={value === l.id} className={cx("block w-full px-3 py-1.5 text-left text-xs hover:bg-hover", value === l.id && "bg-brand-50 text-brand-ink")}>{l.path}</button></li>)}{found.length === 0 && <li className="px-3 py-2 text-xs text-muted">{t("trendyolviews.wizard.f.category.none", { q: dq })}</li>}</ul>
          {truncated && <p className="text-xs text-warn">{t("trendyolviews.wizard.f.category.tooMany")}</p>}
        </>}
    </div>
  );
}

function Attributes({ origin, w, ops, categoryId, attrs, onChange, setRequired, setVarianters, rows, setRow, sharedHints }: { origin: string; w: W; ops: Ops; categoryId: number; attrs: Record<number, AttrChoice>; onChange: (a: Record<number, AttrChoice>) => void; setRequired: (ids: number[]) => void; setVarianters: (ids: number[]) => void; rows: VariantRow[]; setRow: (id: string, p: Partial<VariantRow>) => void; sharedHints: string[] }) {
  const { t } = useT();
  const q = useTyQuery(w.call.run, ops.getCategoryAttributes, { path: { categoryId } });
  const list = arr(rec(q.data?.response.body).categoryAttributes);
  useEffect(() => { setRequired(list.filter((a) => a.required === true).map((a) => num(rec(a.attribute).id))); setVarianters(list.filter((a) => a.varianter === true || a.slicer === true).map((a) => num(rec(a.attribute).id))); }, [q.data]); // eslint-disable-line react-hooks/exhaustive-deps
  if (q.isPending) return <TableSkeleton rows={2} />;
  if (q.error) return <TyErrorBox error={q.error} retry={() => void q.refetch()} />;
  const sorted = [...list].sort((a, b) => Number(b.required === true) - Number(a.required === true));
  return (
    <fieldset className="space-y-3">
      <legend className="text-[13px] font-medium">{t("trendyolviews.wizard.attrs")}</legend>
      <p className="text-xs text-muted">{t("trendyolviews.wizard.attrs.hint")}</p>
      {(() => {
        const field = (a: Record<string, unknown>) => <AttrField key={num(rec(a.attribute).id)} a={a} w={w} ops={ops} categoryId={categoryId} choice={attrs[num(rec(a.attribute).id)] ?? { ids: [], custom: "" }} onChange={(c) => onChange({ ...attrs, [num(rec(a.attribute).id)]: c })} rows={rows} setRow={setRow} sharedHints={sharedHints} origin={origin} />;
        const must = sorted.filter((a) => a.required === true || a.varianter === true); const opt = sorted.filter((a) => !(a.required === true || a.varianter === true));
        // the required ones (and the variant-defining ones) up front; the long tail of optional attributes (importer, manufacturer, package size...) is folded away
        return (<>
          <div className="grid gap-4 lg:grid-cols-2">{must.map(field)}</div>
          {opt.length > 0 && (
            <details className="rounded-xl border border-line p-3" data-testid="tdyv-optional-attrs">
              <summary className="cursor-pointer text-[13px] font-medium">{t("trendyolviews.wizard.attrs.optional", { n: opt.length })}</summary>
              <div className="mt-3 grid gap-4 lg:grid-cols-2">{opt.map(field)}</div>
            </details>
          )}
        </>);
      })()}
    </fieldset>
  );
}

function AttrField({ origin, a, w, ops, categoryId, choice, onChange, rows, setRow, sharedHints }: { origin: string; a: Record<string, unknown>; w: W; ops: Ops; categoryId: number; choice: AttrChoice; onChange: (c: AttrChoice) => void; rows: VariantRow[]; setRow: (id: string, p: Partial<VariantRow>) => void; sharedHints: string[] }) {
  const { t } = useT();
  const attr = rec(a.attribute); const id = num(attr.id);
  // closed value lists come inline with the attribute: one request per attribute is only needed when the list is not there
  const inline = arr(a.attributeValues);
  const vals = useTyQuery(w.call.run, ops.getCategoryAttributeValues, { path: { categoryId, attributeId: id }, query: { size: 1000 } }, { enabled: inline.length === 0 });
  const options = inline.length ? inline : arr(rec(vals.data?.response.body).content);
  const multi = a.allowMultipleAttributeValues === true;
  const optList = useMemo(() => options.map(valueOf).filter((o) => o.id > 0 && o.name), [vals.data]); // eslint-disable-line react-hooks/exhaustive-deps
  // Automatic value: for a one-variant product from what the variant is called; a required attribute with a single possible value is simply taken.
  // Only fills an EMPTY field, and only when the options arrive: whatever the user (or last time's memory) set is never touched.
  const hintKey = sharedHints.join("|");
  // Which attributes differ per variant: the ones Trendyol marks as variant-defining or as the product slicer (colour), and any attribute whose
  // values match the NAMES of at least two different variants (a colour attribute without flags: "Kırmızı", "Mavi" are both in its list).
  const perVariant = rows.length > 1 && (a.varianter === true || a.slicer === true || new Set(rows.map((r) => matchAttrValue(optList, r.hints ?? [r.label])?.id).filter((x) => x != null)).size >= 2);
  useEffect(() => {
    if (perVariant || choice.ids.length || choice.custom.trim() || !optList.length) return; // per-variant cells fill the variant-defining ones
    // "Menşei" (country of origin) is the product's origin field: TR -> "TR"/"Türkiye"
    const originHints = norm(attr.name) === "mensei" ? [origin, origin.toUpperCase() === "TR" ? "Türkiye" : ""].filter(Boolean) : [];
    const hit = originHints.length ? matchAttrValue(optList, originHints) : a.varianter === true || sharedHints.length ? matchAttrValue(optList, sharedHints) : null;
    const only = a.required === true && optList.length === 1 ? optList[0]! : null;
    const pick = hit ?? only;
    if (pick) onChange({ ids: [pick.id], custom: "" });
  }, [optList, hintKey, perVariant]); // eslint-disable-line react-hooks/exhaustive-deps
  const tags = [a.required === true && t("trendyolviews.wizard.attr.required"), a.varianter === true && t("trendyolviews.wizard.attr.varianter"), a.slicer === true && t("trendyolviews.wizard.attr.slicer")].filter(Boolean) as string[];
  const hint = tags.join(" · ") || t("trendyolviews.wizard.attr.optional");
  // A variant-defining attribute (colour, size...) is what tells the variants apart: one value per variant instead of one for all.
  if (perVariant) {
    const EMPTY: AttrChoice = { ids: [], custom: "" };
    return (
      <div className="space-y-2 rounded-xl border border-brand-600/40 bg-brand-50/40 p-3 lg:col-span-2" data-testid={`tdyv-attr-${id}`}>
        <p className="text-[13px] font-medium">{str(attr.name)}{a.required === true ? " *" : ""} <span className="font-normal text-muted">· {t("trendyolviews.wizard.attr.perVariant")}</span></p>
        {optList.length > 1 && (
          <SelectField label={t("trendyolviews.wizard.attr.applyAll")} hint={t("trendyolviews.wizard.attr.applyAll.hint")} value="" onChange={(e) => { const v = Number(e.target.value); if (v) rows.forEach((r) => setRow(r.variantId, { attrs: { [id]: { ids: [v], custom: "" } } })); }}>
            <option value="">{t("trendyolviews.wizard.attr.pick")}</option>{optList.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </SelectField>
        )}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {rows.map((r) => <VariantAttrCell key={r.variantId} r={r} id={id} attrName={str(attr.name)} allowCustom={a.allowCustom === true} fillCustom={a.required === true && optList.length === 0} loading={inline.length === 0 && vals.isPending} options={optList} setRow={setRow} empty={EMPTY} />)}
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-1.5 rounded-xl border border-line p-3" data-testid={`tdyv-attr-${id}`}>
      <SelectField label={`${str(attr.name)}${a.required === true ? " *" : ""}`} hint={hint} help="trendyolviews.attribute" multiple={multi} value={multi ? choice.ids.map(String) : String(choice.ids[0] ?? "")}
        onChange={(e) => onChange({ ...choice, ids: multi ? Array.from(e.target.selectedOptions, (o) => Number(o.value)) : e.target.value ? [Number(e.target.value)] : [] })}>
        {!multi && <option value="">{inline.length === 0 && vals.isPending ? t("ui.loading") : t("trendyolviews.wizard.attr.pick")}</option>}
        {optList.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </SelectField>
      {a.allowCustom === true && <TextField label={t("trendyolviews.wizard.attr.custom")} hint={t("trendyolviews.wizard.attr.custom.hint")} help="trendyolviews.attributeCustom" value={choice.custom} onChange={(e) => onChange({ ...choice, custom: e.target.value })} />}
    </div>
  );
}


/** One variant's value of a variant-defining attribute (colour, size...). Starts filled when the variant's name or options match a Trendyol value. */
function VariantAttrCell({ r, id, attrName, allowCustom, fillCustom, loading, options, setRow, empty }: { r: VariantRow; id: number; attrName: string; allowCustom: boolean; fillCustom: boolean; loading: boolean; options: { id: number; name: string }[]; setRow: (id: string, p: Partial<VariantRow>) => void; empty: AttrChoice }) {
  const { t } = useT();
  const c = r.attrs[id] ?? empty;
  const put = (next: AttrChoice) => setRow(r.variantId, { attrs: { [id]: next } });
  const hintKey = (r.hints ?? []).join("|");
  useEffect(() => {
    if (c.ids.length || c.custom.trim() || loading) return;
    if (!options.length) { if (fillCustom && allowCustom) put({ ids: [], custom: r.hints?.[0] ?? r.label }); return; }   // free-text colour: the variant's own name
    const hit = matchAttrValue(options, r.hints ?? [r.label]);
    if (hit) put({ ids: [hit.id], custom: "" });
  }, [options, hintKey, loading]); // eslint-disable-line react-hooks/exhaustive-deps
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

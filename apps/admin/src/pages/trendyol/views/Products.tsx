import { useMemo, useState } from "react";
import { Archive, ArchiveRestore, BarChart3, Braces, Link2, Pencil, Plus, RefreshCw, Search, Trash2, X, Check } from "lucide-react";
import { Badge, Button, Card, ConfirmDialog, EmptyState, Modal, SelectField, Table, Tabs, Td, TextField } from "../../../components/ui";
import { Term } from "../../../components/help/Term";
import { CodeBlock, InlineError, RangeFields, TableSkeleton, Thumb, TyErrorBox, TyPager, ViewGate, StatusBadge, arr, dig, num, paged, presetRange, rangeValid, rec, str, tryMoney, useOps, useTyQuery, useTyWrite } from "../../../components/trendyol/views/shared";
import type { Range } from "../../../components/trendyol/views/shared";
import { prettyJson } from "../../../lib/trendyol";
import { useT } from "../../../i18n";
import { BatchPanel } from "./products/BatchPanel";
import { MapDialog, MappingsTab } from "./products/Mappings";
import { Wizard } from "./products/Wizard";

type TabId = "approved" | "unapproved" | "archived" | "mappings";
const OPS = ["filterApprovedProducts", "filterUnapprovedProducts", "updatePriceAndInventory", "getBatchRequestResult", "archiveProducts", "deleteProducts", "getBuyboxInformation", "createProducts",
  "getBrandsByName", "getCategoryTree", "getCategoryAttributes", "getCategoryAttributeValues", "getCargoProviders"];

interface ProdRow {
  key: string; image?: string; title: string; barcode: string; stockCode: string; quantity: number | null; listPrice: number | null; salePrice: number | null;
  onSale?: boolean; approved: boolean; status?: string; brand: string; category: string; raw: unknown;
}

/** Flatten Trendyol's approved (content → variants) and unapproved (flat) shapes into table rows. */
export function normalizeRows(tab: TabId, content: Record<string, unknown>[]): ProdRow[] {
  if (tab === "unapproved") {
    return content.map((p) => ({
      key: str(p.barcode), image: str(arr(p.media ?? p.images)[0]?.url) || undefined, title: str(p.title), barcode: str(p.barcode), stockCode: str(p.stockCode),
      quantity: p.quantity === undefined ? null : num(p.quantity), listPrice: p.listPrice === undefined ? null : num(p.listPrice), salePrice: p.salePrice === undefined ? null : num(p.salePrice),
      approved: false, status: str(p.status), brand: str(dig(p, "brand.name")), category: str(dig(p, "category.name")), raw: p,
    }));
  }
  return content.flatMap((c) => {
    const variants = arr(c.variants);
    return variants.map((v) => ({
      key: str(v.barcode), image: str(arr(c.images)[0]?.url) || undefined, title: str(c.title), barcode: str(v.barcode), stockCode: str(v.stockCode),
      quantity: dig(v, "stock.quantity") === undefined ? null : num(dig(v, "stock.quantity")), listPrice: dig(v, "price.listPrice") === undefined ? null : num(dig(v, "price.listPrice")), salePrice: dig(v, "price.salePrice") === undefined ? null : num(dig(v, "price.salePrice")),
      onSale: v.onSale === true, approved: true, brand: str(dig(c, "brand.name")), category: str(dig(c, "category.name")), raw: { content: { ...c, variants: undefined }, variant: v },
    }));
  });
}

export default function ProductsView() { return <ViewGate><ProductsBody /></ViewGate>; }

interface Filters { barcode: string; stockCode: string; title: string; status: string; useDates: boolean }
const NO_FILTERS: Filters = { barcode: "", stockCode: "", title: "", status: "", useDates: false };

function ProductsBody() {
  const { t } = useT();
  const { ops } = useOps(OPS);
  const w = useTyWrite();
  const [tab, setTab] = useState<TabId>("approved");
  const [wizard, setWizard] = useState(false);
  const [batches, setBatches] = useState<{ id: string; label: string }[]>([]);
  const addBatch = (id: string, label: string) => setBatches((b) => [{ id, label }, ...b.filter((x) => x.id !== id)].slice(0, 4));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs<TabId> label={t("trendyolviews.products.tabs")} value={tab} onChange={(x) => { setTab(x); setWizard(false); }} tabs={[
          { id: "approved", label: t("trendyolviews.products.tab.approved") }, { id: "unapproved", label: t("trendyolviews.products.tab.unapproved") },
          { id: "archived", label: t("trendyolviews.products.tab.archived") }, { id: "mappings", label: t("trendyolviews.products.tab.mappings") }]} />
        <Button onClick={() => setWizard(true)} className="-mt-6"><Plus size={14} />{t("trendyolviews.products.add")}</Button>
      </div>
      {batches.map((b) => <BatchPanel key={b.id} id={b.id} label={b.label} run={w.call.run} op={ops.getBatchRequestResult} onClose={() => setBatches((x) => x.filter((y) => y.id !== b.id))} />)}
      {wizard && <Wizard w={w} ops={ops} onClose={() => { setWizard(false); setTab("unapproved"); }} />}
      {!wizard && (tab === "mappings" ? <MappingsTab /> : <ProductList key={tab} tab={tab} ops={ops} w={w} addBatch={addBatch} />)}
      {w.call.confirmNode}
    </div>
  );
}

function ProductList({ tab, ops, w, addBatch }: { tab: Exclude<TabId, "mappings">; ops: ReturnType<typeof useOps>["ops"]; w: ReturnType<typeof useTyWrite>; addBatch: (id: string, label: string) => void }) {
  const { t } = useT();
  const [draft, setDraft] = useState<Filters>(NO_FILTERS); const [f, setF] = useState<Filters>(NO_FILTERS);
  const [range, setRange] = useState<Range>(() => presetRange("d14"));
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<string | null>(null);
  const [del, setDel] = useState<ProdRow | null>(null); const [json, setJson] = useState<ProdRow | null>(null);
  const [bb, setBb] = useState<ProdRow | null>(null); const [map, setMap] = useState<ProdRow | null>(null);
  const valid = !f.useDates || rangeValid(range, 90);
  const op = tab === "unapproved" ? ops.filterUnapprovedProducts : ops.filterApprovedProducts;
  const query: Record<string, unknown> = { page, size: 50, ...(f.barcode ? { barcode: f.barcode } : {}), ...(f.stockCode ? { stockCode: f.stockCode } : {}) };
  if (tab === "archived") query.status = "archived"; else if (f.status) query.status = f.status;
  if (f.useDates) { query.startDate = range.start; query.endDate = range.end; query.dateQueryType = tab === "unapproved" ? "LAST_MODIFIED_DATE" : "VARIANT_MODIFIED_DATE"; }
  const q = useTyQuery(w.call.run, op, { query }, { enabled: valid });
  const data = useMemo(() => paged(q.data?.response.body), [q.data]);
  const all = useMemo(() => normalizeRows(tab, data.content), [tab, data.content]);
  const rows = f.title.trim() ? all.filter((r) => r.title.toLocaleLowerCase("tr").includes(f.title.trim().toLocaleLowerCase("tr"))) : all;

  const afterBatch = (r: Awaited<ReturnType<typeof w.exec>>, label: string) => { const id = str(rec(r?.response.body).batchRequestId); if (r?.ok && id) addBatch(id, label); return !!(r?.ok); };
  const archive = async (r: ProdRow, archived: boolean) => afterBatch(await w.exec(ops.archiveProducts, { body: { items: [{ barcode: r.barcode, archived }] } }, { refresh: false }), t(archived ? "trendyolviews.products.batch.archive" : "trendyolviews.products.batch.unarchive", { barcode: r.barcode }));
  const remove = async () => { const r = del; setDel(null); if (r) afterBatch(await w.exec(ops.deleteProducts, { body: { items: [{ barcode: r.barcode }] } }, { skipConfirm: true, refresh: false }), t("trendyolviews.products.batch.delete", { barcode: r.barcode })); };
  const saveStock = async (r: ProdRow, d: { quantity?: number; salePrice?: number; listPrice?: number }) => {
    const ok = afterBatch(await w.exec(ops.updatePriceAndInventory, { body: { items: [{ barcode: r.barcode, ...d }] } }, { refresh: false }), t("trendyolviews.products.batch.stock", { barcode: r.barcode }));
    if (ok) setEditing(null);
  };

  return (
    <div className="space-y-5">
      <Card title={t("trendyolviews.products.filters")} actions={<Button size="sm" variant="secondary" loading={q.isFetching} onClick={() => void q.refetch()}><RefreshCw size={13} />{t("trendyolviews.common.refresh")}</Button>}>
        <form className="space-y-4" role="search" onSubmit={(e) => { e.preventDefault(); setPage(0); setF(draft); }}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <TextField label={t("trendyolviews.products.f.barcode")} hint={t("trendyolviews.products.f.barcode.hint")} help="trendyolviews.barcode" value={draft.barcode} onChange={(e) => setDraft({ ...draft, barcode: e.target.value })} />
            <TextField label={t("trendyolviews.products.f.title")} hint={t("trendyolviews.products.f.title.hint")} help="trendyolviews.titleFilter" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
            <TextField label={t("trendyolviews.products.f.stockCode")} hint={t("trendyolviews.products.f.stockCode.hint")} help="trendyolviews.stockCode" value={draft.stockCode} onChange={(e) => setDraft({ ...draft, stockCode: e.target.value })} />
            {tab === "approved" && <SelectField label={t("trendyolviews.products.f.onSale")} hint={t("trendyolviews.products.f.onSale.hint")} help="trendyolviews.onSale" value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })}>
              <option value="">{t("trendyolviews.common.all")}</option><option value="onSale">{t("trendyolviews.products.onSale.yes")}</option><option value="notOnSale">{t("trendyolviews.products.onSale.no")}</option></SelectField>}
            {tab === "unapproved" && <SelectField label={t("trendyolviews.products.f.status")} hint={t("trendyolviews.products.f.status.hint")} help="trendyolviews.productStatus" value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })}>
              <option value="">{t("trendyolviews.common.all")}</option><option value="pendingApproval">{t("trendyolviews.status.product.pendingApproval")}</option><option value="rejected">{t("trendyolviews.status.product.rejected")}</option></SelectField>}
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.useDates} onChange={(e) => { setDraft({ ...draft, useDates: e.target.checked }); setF((x) => ({ ...x, useDates: e.target.checked })); setPage(0); }} />{t("trendyolviews.products.f.useDates")}</label>
          {draft.useDates && <RangeFields idPrefix="typ" range={range} maxDays={90} presets={["today", "d3", "d7", "d14"]} onChange={(r) => { setPage(0); setRange(r); }} />}
          <div className="flex gap-2"><Button type="submit" variant="secondary"><Search size={14} />{t("trendyolviews.common.search")}</Button><Button variant="ghost" onClick={() => { setDraft(NO_FILTERS); setF(NO_FILTERS); setPage(0); }}>{t("trendyolviews.common.clear")}</Button></div>
        </form>
      </Card>

      <Card>
        <InlineError text={w.err} />
        {!valid ? <EmptyState title={t("trendyolviews.products.invalidRange")} />
          : q.isPending ? <TableSkeleton />
          : q.error ? <TyErrorBox error={q.error} retry={() => void q.refetch()} />
          : rows.length === 0 ? <EmptyState title={t(`trendyolviews.products.empty.${tab}.title`)} description={t(`trendyolviews.products.empty.${tab}.body`)} action={tab === "approved" || tab === "unapproved" ? <Button variant="secondary" onClick={() => { setDraft(NO_FILTERS); setF(NO_FILTERS); }}>{t("trendyolviews.common.clear")}</Button> : undefined} />
          : <>
            <Table caption={t(`trendyolviews.products.tab.${tab}`)} head={[<span key="i" className="sr-only">{t("trendyolviews.products.col.image")}</span>, t("trendyolviews.products.col.title"), t("trendyolviews.products.col.barcode"), t("trendyolviews.products.col.stock"), t("trendyolviews.products.col.listPrice"), t("trendyolviews.products.col.salePrice"), t("trendyolviews.products.col.onSale"), t("trendyolviews.products.col.approved"), `${t("trendyolviews.products.col.brand")} / ${t("trendyolviews.products.col.category")}`, <span key="a" className="sr-only">{t("trendyolviews.common.actions")}</span>]}>
              {rows.map((r) => editing === r.barcode
                ? <EditRow key={r.key} r={r} saving={w.call.isPending} onCancel={() => setEditing(null)} onSave={(d) => void saveStock(r, d)} />
                : (
                  <tr key={r.key}>
                    <Td><Thumb src={r.image} alt={r.title} /></Td>
                    <Td className="min-w-48 max-w-72"><span className="line-clamp-2 font-medium">{r.title}</span><span className="block text-xs text-muted">{r.stockCode}</span></Td>
                    <Td className="font-mono text-[13px]">{r.barcode}</Td>
                    <Td className="text-right tabular-nums">{r.quantity ?? "-"}</Td>
                    <Td className="whitespace-nowrap text-right tabular-nums">{tryMoney(r.listPrice)}</Td>
                    <Td className="whitespace-nowrap text-right tabular-nums">{tryMoney(r.salePrice)}</Td>
                    <Td>{r.onSale === undefined ? "-" : <Badge tone={r.onSale ? "success" : "neutral"}>{t(r.onSale ? "trendyolviews.products.onSale.yes" : "trendyolviews.products.onSale.no")}</Badge>}</Td>
                    <Td>{r.approved ? <Badge tone="success">{t("trendyolviews.products.approved.yes")}</Badge> : <StatusBadge group="product" value={r.status ?? "pendingApproval"} />}</Td>
                    <Td className="max-w-44"><span className="block truncate">{r.brand}</span><span className="block truncate text-xs text-muted">{r.category}</span></Td>
                    <Td><div className="flex gap-0.5">
                      {tab === "approved" && <IconBtn label={t("trendyolviews.products.act.edit", { barcode: r.barcode })} onClick={() => setEditing(r.barcode)}><Pencil size={14} /></IconBtn>}
                      {tab === "approved" && <IconBtn label={t("trendyolviews.products.act.archive", { barcode: r.barcode })} onClick={() => void archive(r, true)}><Archive size={14} /></IconBtn>}
                      {tab === "archived" && <IconBtn label={t("trendyolviews.products.act.unarchive", { barcode: r.barcode })} onClick={() => void archive(r, false)}><ArchiveRestore size={14} /></IconBtn>}
                      {tab !== "approved" && <IconBtn label={t("trendyolviews.products.act.delete", { barcode: r.barcode })} onClick={() => setDel(r)}><Trash2 size={14} /></IconBtn>}
                      {tab === "approved" && <IconBtn label={t("trendyolviews.products.act.buybox", { barcode: r.barcode })} onClick={() => setBb(r)}><BarChart3 size={14} /></IconBtn>}
                      <IconBtn label={t("trendyolviews.products.act.map", { barcode: r.barcode })} onClick={() => setMap(r)}><Link2 size={14} /></IconBtn>
                      <IconBtn label={t("trendyolviews.products.act.json", { barcode: r.barcode })} onClick={() => setJson(r)}><Braces size={14} /></IconBtn>
                    </div></Td>
                  </tr>
                ))}
            </Table>
            <TyPager data={data} onPage={setPage} />
            {tab === "approved" && <p className="mt-2 text-xs text-muted">{t("trendyolviews.products.stockNote")}</p>}
          </>}
      </Card>

      <ConfirmDialog open={!!del} danger title={t("trendyolviews.products.delete.title")} message={t("trendyolviews.products.delete.message", { barcode: del?.barcode ?? "" })} confirmLabel={t("common.delete")} loading={w.call.isPending} onClose={() => setDel(null)} onConfirm={() => void remove()} />
      {json && <Modal open wide onClose={() => setJson(null)} title={t("trendyolviews.products.json.title", { barcode: json.barcode })} footer={<Button variant="ghost" onClick={() => setJson(null)}>{t("common.close")}</Button>}><CodeBlock label={t("trendyolviews.products.json.title", { barcode: json.barcode })}>{prettyJson(json.raw)}</CodeBlock></Modal>}
      {bb && <Buybox row={bb} ops={ops} w={w} onClose={() => setBb(null)} />}
      {map && <MapDialog barcode={map.barcode} title={map.title} onClose={() => setMap(null)} />}
    </div>
  );
}

function IconBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" aria-label={label} title={label} onClick={onClick} className="grid size-8 place-items-center rounded-lg text-muted transition hover:bg-hover hover:text-ink focus-visible:ring-4 focus-visible:ring-brand-600/15">{children}</button>;
}

/** Inline stock/price editor row. Only changed values are sent (Trendyol rejects an identical repeat within 15 minutes). */
function EditRow({ r, saving, onCancel, onSave }: { r: ProdRow; saving: boolean; onCancel: () => void; onSave: (d: { quantity?: number; salePrice?: number; listPrice?: number }) => void }) {
  const { t } = useT();
  const [qty, setQty] = useState(String(r.quantity ?? "")); const [sale, setSale] = useState(String(r.salePrice ?? "")); const [list, setList] = useState(String(r.listPrice ?? ""));
  const nq = Number(qty), ns = Number(sale.replace(",", ".")), nl = Number(list.replace(",", "."));
  const changed = { ...(qty !== "" && nq !== r.quantity ? { quantity: Math.trunc(nq) } : {}), ...(sale !== "" && ns !== r.salePrice ? { salePrice: ns } : {}), ...(list !== "" && nl !== r.listPrice ? { listPrice: nl } : {}) };
  const price = ns > 0 ? ns : r.salePrice ?? 0; const lp = nl > 0 ? nl : r.listPrice ?? 0;
  const err = !Number.isInteger(nq) || nq < 0 || nq > 20000 ? t("trendyolviews.products.edit.errQty") : price > lp ? t("trendyolviews.products.edit.errPrice") : null;
  const cls = "w-24 rounded-lg border border-line bg-surface px-2 py-1.5 text-right text-sm tabular-nums focus:border-brand-600 focus:ring-4 focus:ring-brand-600/15 dark:bg-canvas";
  return (
    <tr className="bg-brand-50/40">
      <Td><Thumb src={r.image} alt={r.title} /></Td>
      <Td className="min-w-48"><span className="font-medium">{r.title}</span><span className="block text-xs text-muted">{t("trendyolviews.products.edit.hint")}</span>{err && <span role="alert" className="block text-xs text-danger">{err}</span>}</Td>
      <Td className="font-mono text-[13px]">{r.barcode}</Td>
      <Td><input aria-label={t("trendyolviews.products.col.stock")} inputMode="numeric" className={cls} value={qty} onChange={(e) => setQty(e.target.value)} /></Td>
      <Td><input aria-label={t("trendyolviews.products.col.listPrice")} inputMode="decimal" className={cls} value={list} onChange={(e) => setList(e.target.value)} /></Td>
      <Td><input aria-label={t("trendyolviews.products.col.salePrice")} inputMode="decimal" className={cls} value={sale} onChange={(e) => setSale(e.target.value)} /></Td>
      <td colSpan={4} className="px-5 py-3 align-middle"><span className="text-xs text-muted">{t("trendyolviews.products.edit.repeat")}</span></td>
      <Td><div className="flex gap-1"><Button size="sm" loading={saving} disabled={!!err || Object.keys(changed).length === 0} aria-label={t("trendyolviews.products.edit.save")} onClick={() => onSave(changed)}><Check size={14} /></Button><Button size="sm" variant="ghost" aria-label={t("common.cancel")} onClick={onCancel}><X size={14} /></Button></div></Td>
    </tr>
  );
}

function Buybox({ row, ops, w, onClose }: { row: ProdRow; ops: ReturnType<typeof useOps>["ops"]; w: ReturnType<typeof useTyWrite>; onClose: () => void }) {
  const { t } = useT();
  const q = useTyQuery(w.call.run, ops.getBuyboxInformation, { body: { barcodes: [row.barcode] } });
  const info = arr(rec(q.data?.response.body).buyboxInfo)[0];
  return (
    <Modal open onClose={onClose} title={t("trendyolviews.products.buybox.title")} footer={<Button variant="ghost" onClick={onClose}>{t("common.close")}</Button>}>
      <p className="mb-3 text-sm text-muted"><Term id="buybox" />: {row.title} · <span className="font-mono">{row.barcode}</span></p>
      {q.isPending ? <TableSkeleton rows={2} /> : q.error ? <TyErrorBox error={q.error} retry={() => void q.refetch()} /> : !info ? <p className="text-sm text-muted">{t("trendyolviews.products.buybox.none")}</p> : (
        <dl className="grid grid-cols-2 gap-3 text-sm" data-testid="tdyv-buybox">
          <div><dt className="text-xs text-muted">{t("trendyolviews.products.buybox.order")}</dt><dd className="font-semibold">{num(info.buyboxOrder)}</dd></div>
          <div><dt className="text-xs text-muted">{t("trendyolviews.products.buybox.price")}</dt><dd className="font-semibold">{tryMoney(info.buyboxPrice)}</dd></div>
          <div><dt className="text-xs text-muted">{t("trendyolviews.products.buybox.second")}</dt><dd>{tryMoney(info.secondBuyboxPrice)}</dd></div>
          <div><dt className="text-xs text-muted">{t("trendyolviews.products.buybox.third")}</dt><dd>{tryMoney(info.thirdBuyboxPrice)}</dd></div>
          <div className="col-span-2"><dt className="text-xs text-muted">{t("trendyolviews.products.buybox.multi")}</dt><dd>{info.hasMultipleSeller ? t("common.yes") : t("common.no")}</dd></div>
        </dl>)}
    </Modal>
  );
}

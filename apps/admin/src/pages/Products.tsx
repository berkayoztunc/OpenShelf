import { Fragment, useEffect, useState } from "react";
import { ChevronRight, Package, Plus, SlidersHorizontal } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, errMsg, qs } from "../lib/api";
import { useAdmin } from "../lib/auth";
import { dateOnly, enumLabel, money, toMajor, toMinor } from "../lib/format";
import { useT } from "../i18n";
import type { Paged, Product, Variant } from "../lib/types";
import { mapPaged, productFromApi } from "../lib/adapt";
import { Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, Loading, Modal, PageHeader, Pagination, SelectField, statusTone, Table, Td, TextField, useDebounced, useToast } from "../components/ui";
import { InlineEdit } from "../components/InlineEdit";
import { useCategories } from "./Categories";
import { mediaUrl } from "../lib/media";

const STATUS_TABS = ["", "active", "draft", "archived"] as const;
const SORTS = ["newest", "updated", "oldest", "name", "name-desc", "price", "price-desc", "stock", "stock-desc"] as const;
const LOW = 5;
const FILTER_KEYS = ["category", "stock", "channel", "image"] as const;

const availableOf = (v: Variant) => (v.stock ? v.stock.total - v.stock.reserved : 0);
function StockBadge({ n }: { n: number }) { return n <= LOW ? <Badge tone={n <= 0 ? "danger" : "warning"}>{n}</Badge> : <span className="tabular-nums">{n}</span>; }
function PriceView({ v }: { v: Variant }) {
  return <span className="tabular-nums">{money(v.prices.website)}{v.compareAtPrice ? <span className="ml-1.5 text-xs text-faint line-through">{money(v.compareAtPrice)}</span> : null}</span>;
}

export default function Products() {
  const { t } = useT();
  const toast = useToast(); const qc = useQueryClient();
  const admin = useAdmin();
  const canPrice = admin?.role !== "staff"; // price edits are admin-only on the API
  const [sp, setSp] = useSearchParams();
  const [q, setQ] = useState(sp.get("q") ?? "");
  const dq = useDebounced(q);
  const get = (k: string) => sp.get(k) ?? "";
  const status = STATUS_TABS.includes(get("status") as never) ? get("status") : "";
  const sort = (SORTS as readonly string[]).includes(get("sort")) ? get("sort") : "newest";
  const page = Number(sp.get("page") ?? 1);
  const cats = useCategories();
  const list = useQuery({
    queryKey: ["products", dq, status, get("category"), get("stock"), get("channel"), get("image"), sort, page],
    queryFn: async () => mapPaged(await api.get<Paged<unknown>>(`/api/admin/products${qs({ q: dq, status, category: get("category"), stock: get("stock"), channel: get("channel"), image: get("image"), sort: sort === "newest" ? "" : sort, page, pageSize: 25 })}`), productFromApi),
  });
  const upd = (k: string, v: string) => setSp((p) => { const n = new URLSearchParams(p); v ? n.set(k, v) : n.delete(k); if (k !== "page") n.delete("page"); return n; }, { replace: k === "q" });
  const activeFilters = FILTER_KEYS.filter((k) => get(k)).length;
  const clear = () => { setQ(""); setSp((p) => { const n = new URLSearchParams(); const s = p.get("status"); if (s) n.set("status", s); return n; }); };
  const rows: Product[] = list.data?.items ?? [];

  // ---- selection + expanded variant rows
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<Set<string>>(new Set());
  useEffect(() => setSel(new Set()), [sp.toString()]);
  const allOn = rows.length > 0 && rows.every((p) => sel.has(p.id));
  const flip = (set: Set<string>, id: string) => { const n = new Set(set); n.has(id) ? n.delete(id) : n.add(id); return n; };

  // ---- inline edits
  const done = (msg: string) => { qc.invalidateQueries({ queryKey: ["products"] }); toast.success(msg); };
  const savePrice = async (v: Variant, raw: string) => {
    const minor = toMinor(raw);
    if (!(minor > 0)) { toast.error(t("catalog.products.edit.invalidPrice")); throw new Error("invalid"); }
    try { await api.patch(`/api/admin/variants/${v.id}/price`, { price: minor }); done(t("catalog.products.edit.priceSaved")); } catch (e) { toast.error(errMsg(e)); throw e; }
  };
  const saveStock = async (v: Variant, raw: string) => {
    const next = Number(raw);
    if (!Number.isInteger(next) || next < 0) { toast.error(t("catalog.products.edit.invalidStock")); throw new Error("invalid"); }
    const delta = next - (v.stock?.total ?? 0);
    if (delta === 0) return;
    try { await api.post(`/api/admin/inventory/${v.id}/adjust`, { delta, reason: t("catalog.products.edit.stockReason") }); done(t("catalog.products.edit.stockSaved")); } catch (e) { toast.error(errMsg(e)); throw e; }
  };
  const priceCell = (p: Product, v: Variant) => v.id ? (
    <InlineEdit label={t("catalog.products.edit.price", { name: p.variants.length > 1 ? `${p.name} (${v.sku})` : p.name })} display={<PriceView v={v} />} initial={toMajor(v.prices.website)} disabled={!canPrice} onSave={(raw) => savePrice(v, raw)} />
  ) : <PriceView v={v} />;
  const stockCell = (p: Product, v: Variant) => v.id ? (
    <InlineEdit label={t("catalog.products.edit.stock", { name: p.variants.length > 1 ? `${p.name} (${v.sku})` : p.name })} display={<StockBadge n={availableOf(v)} />} initial={String(v.stock?.total ?? 0)} inputMode="numeric" onSave={(raw) => saveStock(v, raw)} />
  ) : <StockBadge n={availableOf(v)} />;

  // ---- bulk actions (one API call for the whole selection)
  const [bulk, setBulk] = useState<null | { kind: "status"; status: string } | { kind: "category"; categoryId: string | null } | { kind: "price"; percent: string }>(null);
  const pct = bulk?.kind === "price" ? Number(bulk.percent.replace(",", ".")) : NaN;
  const pctOk = Number.isFinite(pct) && pct !== 0 && pct >= -90 && pct <= 500;
  const run = useMutation({
    mutationFn: () => {
      const ids = [...sel];
      if (!bulk) return Promise.reject(new Error("no action"));
      const body = bulk.kind === "status" ? { action: "status", status: bulk.status } : bulk.kind === "category" ? { action: "category", categoryId: bulk.categoryId } : { action: "price", percent: pct };
      return api.post<{ updated: number; missing: string[] }>("/api/admin/products/bulk", { ids, ...body });
    },
    onSuccess: (r) => {
      setBulk(null); setSel(new Set()); qc.invalidateQueries({ queryKey: ["products"] });
      toast.success(r.missing?.length ? t("catalog.products.bulk.doneMissing", { n: r.updated, missing: r.missing.length }) : t("catalog.products.bulk.done", { n: r.updated }));
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  const catName = (id: string | null) => (id ? cats.data?.find((c) => c.id === id)?.name ?? "" : t("catalog.products.category.none"));

  return (
    <>
      <PageHeader title={t("catalog.products.title")} description={t("catalog.products.description")} guide="catalog#urun-ekleme" actions={<Link to="/products/new"><Button><Plus size={16} />{t("catalog.products.new")}</Button></Link>} />
      <Card>
        <div role="tablist" aria-label={t("catalog.products.tabs.label")} className="-mx-1 mb-5 flex gap-1 overflow-x-auto border-b border-line pb-px">
          {STATUS_TABS.map((s) => {
            const on = s === status;
            return <button key={s || "all"} role="tab" type="button" aria-selected={on} onClick={() => upd("status", s)}
              className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors ${on ? "border-brand-600 text-brand-ink" : "border-transparent text-muted hover:text-ink"}`}>{s ? enumLabel("productStatus", s) : t("common.all")}</button>;
          })}
        </div>
        <div className="mb-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <div className="sm:col-span-2 xl:col-span-2">
            <TextField label={t("catalog.products.searchLabel")} help="catalog.productSearch" hint={t("catalog.products.searchHint")} type="search" placeholder={t("catalog.products.searchPlaceholder")} value={q} onChange={(e) => { setQ(e.target.value); upd("q", e.target.value); }} />
          </div>
          <SelectField label={t("catalog.product.category.label")} value={get("category")} onChange={(e) => upd("category", e.target.value)}>
            <option value="">{t("common.all")}</option><option value="none">{t("catalog.products.category.none")}</option>{cats.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </SelectField>
          <SelectField label={t("catalog.products.filter.stock")} value={get("stock")} onChange={(e) => upd("stock", e.target.value)}>
            <option value="">{t("common.all")}</option>{(["out", "low", "in"] as const).map((s) => <option key={s} value={s}>{t(`catalog.products.stock.${s}`)}</option>)}
          </SelectField>
          <SelectField label={t("catalog.products.filter.channel")} value={get("channel")} onChange={(e) => upd("channel", e.target.value)}>
            <option value="">{t("common.all")}</option><option value="trendyol">{t("catalog.products.channel.trendyol")}</option><option value="website_only">{t("catalog.products.channel.website")}</option>
          </SelectField>
          <SelectField label={t("catalog.products.filter.sort")} value={sort} onChange={(e) => upd("sort", e.target.value === "newest" ? "" : e.target.value)}>
            {SORTS.map((s) => <option key={s} value={s}>{t(`catalog.products.sort.${s}`)}</option>)}
          </SelectField>
        </div>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-[var(--color-brand-600)]" checked={get("image") === "none"} onChange={(e) => upd("image", e.target.checked ? "none" : "")} />{t("catalog.products.filter.noImage")}</label>
          {(activeFilters > 0 || dq) && <Button size="sm" variant="ghost" onClick={clear}><SlidersHorizontal size={14} />{t("catalog.products.filter.clear")}</Button>}
        </div>
        {list.isPending ? <Loading /> : list.isError ? <ErrorState error={list.error} retry={() => list.refetch()} /> :
          rows.length === 0 ? <EmptyState icon={<Package size={22} />} title={t("catalog.products.empty.title")} description={t("catalog.products.empty.body")} action={<Link to="/products/new"><Button>{t("catalog.products.new")}</Button></Link>} /> : (
            <>
              <p className="mb-3 text-xs text-muted">{t("catalog.products.stockHint")}</p>
              <Table minWidth="72rem" head={[
                <input key="all" type="checkbox" aria-label={t("catalog.products.bulk.selectAll")} className="size-4 accent-[var(--color-brand-600)]" checked={allOn} onChange={() => setSel(allOn ? new Set() : new Set(rows.map((p) => p.id)))} />,
                t("catalog.products.col.product"), t("catalog.products.col.category"), t("catalog.products.col.status"), t("catalog.products.col.channels"), t("catalog.products.col.variants"),
                <span key="p" className="block">{t("catalog.products.col.price")}</span>, t("catalog.products.col.stock"), t("catalog.products.col.updated")]} caption={t("catalog.products.caption")}>{rows.map((p) => {
                const img = p.images?.[0]; const src = img?.url ?? mediaUrl(img?.mediaId);
                const single = p.variants.length === 1 ? p.variants[0]! : null;
                const stock = p.variants.reduce((s, v) => s + availableOf(v), 0);
                const prices = p.variants.map((v) => v.prices.website);
                const expanded = open.has(p.id);
                return (
                  <Fragment key={p.id}>
                    <tr>
                      <Td className="w-10"><input type="checkbox" aria-label={t("catalog.products.bulk.selectOne", { name: p.name })} className="size-4 accent-[var(--color-brand-600)]" checked={sel.has(p.id)} onChange={() => setSel((s) => flip(s, p.id))} /></Td>
                      <Td><Link to={`/products/${p.id}`} className="flex items-center gap-3 font-medium hover:text-brand-ink">
                        {src ? <img src={src} alt="" className="size-11 rounded-lg object-cover ring-1 ring-ink/[.07]" /> : <span className="grid size-11 place-items-center rounded-lg bg-hover text-faint" aria-hidden title={t("catalog.products.noImage")}><Package size={18} /></span>}
                        <span className="min-w-0"><span className="block truncate">{p.name}</span>{(p.brand || single?.sku) && <span className="block truncate text-xs font-normal text-muted">{[p.brand, single?.sku].filter(Boolean).join(" · ")}</span>}</span></Link></Td>
                      <Td className="text-muted">{p.categoryName ?? "-"}</Td>
                      <Td><Badge tone={statusTone(p.status)}>{enumLabel("productStatus", p.status)}</Badge></Td>
                      <Td><span className="flex flex-wrap gap-1"><Badge tone={p.status === "active" ? "success" : "neutral"}>{t("catalog.products.badge.web")}</Badge>{p.onTrendyol && <Badge tone="info">{t("catalog.products.badge.trendyol")}</Badge>}</span></Td>
                      <Td className="tabular-nums text-muted">
                        {p.variants.length > 1 ? (
                          <button type="button" aria-expanded={expanded} aria-label={t(expanded ? "catalog.products.variants.hide" : "catalog.products.variants.show", { name: p.name })} onClick={() => setOpen((s) => flip(s, p.id))} className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 -mx-1.5 hover:bg-hover hover:text-ink">
                            <ChevronRight size={14} className={`transition-transform ${expanded ? "rotate-90" : ""}`} />{p.variants.length}</button>
                        ) : p.variants.length}
                      </Td>
                      <Td className="whitespace-nowrap">{single ? priceCell(p, single) : prices.length ? (Math.min(...prices) === Math.max(...prices) ? money(prices[0]) : `${money(Math.min(...prices))} - ${money(Math.max(...prices))}`) : "-"}</Td>
                      <Td>{single ? stockCell(p, single) : <StockBadge n={stock} />}</Td>
                      <Td className="whitespace-nowrap text-muted">{p.updatedAt ? dateOnly(p.updatedAt) : "-"}</Td>
                    </tr>
                    {expanded && p.variants.map((v) => (
                      <tr key={v.id ?? v.sku} className="bg-canvas/60">
                        <Td /><Td className="pl-8"><span className="block text-[13px]">{v.title || Object.values(v.options ?? {}).join(" / ") || "-"}</span><span className="block text-xs text-muted">{t("catalog.products.variant.sku")}: {v.sku}</span></Td>
                        <Td /><Td /><Td /><Td />
                        <Td className="whitespace-nowrap">{priceCell(p, v)}</Td>
                        <Td><span className="inline-flex items-center gap-2">{stockCell(p, v)}{(v.stock?.reserved ?? 0) > 0 && <span className="text-xs text-muted">{t("catalog.products.variant.reserved", { n: v.stock?.reserved ?? 0 })}</span>}</span></Td>
                        <Td />
                      </tr>
                    ))}
                  </Fragment>
                );
              })}</Table>
              <Pagination page={list.data.page} pageSize={list.data.pageSize} total={list.data.total} onPage={(n) => upd("page", String(n))} />
            </>
          )}
      </Card>
      {sel.size > 0 && (
        <div role="region" aria-label={t("catalog.products.bulk.label")} className="sticky bottom-4 z-20 mx-auto mt-4 flex w-fit max-w-full flex-wrap items-center gap-2 rounded-xl border border-line bg-raised px-4 py-2.5 shadow-lift">
          <span className="text-sm font-medium">{t("catalog.products.bulk.selected", { n: sel.size })}</span>
          <label className="sr-only" htmlFor="bulk-p-status">{t("catalog.products.bulk.status")}</label>
          <select id="bulk-p-status" className="h-8 rounded-lg border border-line bg-surface px-2 text-[13px]" value="" disabled={!canPrice} onChange={(e) => e.target.value && setBulk({ kind: "status", status: e.target.value })}>
            <option value="">{t("catalog.products.bulk.status")}</option>{(["active", "draft", "archived"] as const).map((s) => <option key={s} value={s}>{enumLabel("productStatus", s)}</option>)}
          </select>
          <label className="sr-only" htmlFor="bulk-p-cat">{t("catalog.products.bulk.category")}</label>
          <select id="bulk-p-cat" className="h-8 rounded-lg border border-line bg-surface px-2 text-[13px]" value="" disabled={!canPrice} onChange={(e) => e.target.value && setBulk({ kind: "category", categoryId: e.target.value === "none" ? null : e.target.value })}>
            <option value="">{t("catalog.products.bulk.category")}</option><option value="none">{t("catalog.products.category.none")}</option>{cats.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <Button size="sm" variant="secondary" disabled={!canPrice} onClick={() => setBulk({ kind: "price", percent: "" })}>{t("catalog.products.bulk.price")}</Button>
          <Button size="sm" variant="ghost" onClick={() => setSel(new Set())}>{t("common.clear")}</Button>
        </div>
      )}
      <ConfirmDialog open={bulk?.kind === "status" || bulk?.kind === "category"} loading={run.isPending}
        title={bulk?.kind === "category" ? t("catalog.products.bulk.category.title") : t("catalog.products.bulk.status.title")} confirmLabel={t("catalog.products.bulk.apply", { n: sel.size })}
        danger={bulk?.kind === "status" && bulk.status === "archived"}
        message={bulk?.kind === "status" ? t("catalog.products.bulk.status.body", { n: sel.size, status: enumLabel("productStatus", bulk.status) }) : bulk?.kind === "category" ? t("catalog.products.bulk.category.body", { n: sel.size, category: catName(bulk.categoryId) }) : ""}
        onConfirm={() => run.mutate()} onClose={() => !run.isPending && setBulk(null)} />
      <Modal open={bulk?.kind === "price"} onClose={() => !run.isPending && setBulk(null)} title={t("catalog.products.bulk.price.title")}
        footer={<><Button variant="ghost" disabled={run.isPending} onClick={() => setBulk(null)}>{t("common.cancel")}</Button><Button loading={run.isPending} disabled={!pctOk} onClick={() => run.mutate()}>{t("catalog.products.bulk.apply", { n: sel.size })}</Button></>}>
        {bulk?.kind === "price" && <div className="space-y-3">
          <TextField label={t("catalog.products.bulk.price.percent")} inputMode="decimal" placeholder="10" hint={t("catalog.products.bulk.price.hint")} value={bulk.percent} error={bulk.percent && !pctOk ? t("catalog.products.bulk.price.invalid") : undefined} onChange={(e) => setBulk({ kind: "price", percent: e.target.value })} />
          {pctOk && <p role="note" className="rounded-lg border border-warn-line bg-warn-soft px-3 py-2 text-sm text-warn">{t("catalog.products.bulk.price.body", { n: sel.size, percent: pct > 0 ? `+${pct}` : String(pct) })}</p>}
        </div>}
      </Modal>
    </>
  );
}

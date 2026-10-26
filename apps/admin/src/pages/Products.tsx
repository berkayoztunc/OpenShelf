import { useState } from "react";
import { Package, Plus } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, qs } from "../lib/api";
import { enumLabel, money } from "../lib/format";
import { useT } from "../i18n";
import type { Paged, Product } from "../lib/types";
import { mapPaged, productFromApi } from "../lib/adapt";
import { Badge, Button, Card, EmptyState, ErrorState, Loading, PageHeader, Pagination, SelectField, statusTone, Table, Td, TextField, useDebounced } from "../components/ui";
import { useCategories } from "./Categories";
import { mediaUrl } from "../lib/media";

export default function Products() {
  const { t } = useT();
  const [sp, setSp] = useSearchParams();
  const [q, setQ] = useState(sp.get("q") ?? "");
  const dq = useDebounced(q);
  const status = sp.get("status") ?? "";
  const category = sp.get("category") ?? "";
  const page = Number(sp.get("page") ?? 1);
  const cats = useCategories();
  const list = useQuery({ queryKey: ["products", dq, status, category, page], queryFn: async () => mapPaged(await api.get<Paged<unknown>>(`/api/admin/products${qs({ q: dq, status, category, page, pageSize: 20 })}`), productFromApi) });
  const upd = (k: string, v: string) => setSp((p) => { const n = new URLSearchParams(p); v ? n.set(k, v) : n.delete(k); if (k !== "page") n.delete("page"); return n; });

  return (
    <>
      <PageHeader title={t("catalog.products.title")} description={t("catalog.products.description")} guide="catalog#urun-ekleme" actions={<Link to="/products/new"><Button><Plus size={16} />{t("catalog.products.new")}</Button></Link>} />
      <Card>
        <div className="mb-5 grid gap-3 sm:grid-cols-3">
          <TextField label={t("catalog.products.searchLabel")} help="catalog.productSearch" hint={t("catalog.products.searchHint")} type="search" placeholder={t("catalog.products.searchPlaceholder")} value={q} onChange={(e) => { setQ(e.target.value); upd("q", e.target.value); }} />
          <SelectField label={t("common.status")} help="catalog.productStatus" value={status} onChange={(e) => upd("status", e.target.value)}><option value="">{t("common.all")}</option>{(["active", "draft", "archived"] as const).map((s) => <option key={s} value={s}>{enumLabel("productStatus", s)}</option>)}</SelectField>
          <SelectField label={t("catalog.product.category.label")} value={category} onChange={(e) => upd("category", e.target.value)}><option value="">{t("common.all")}</option>{cats.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</SelectField>
        </div>
        {list.isPending ? <Loading /> : list.isError ? <ErrorState error={list.error} retry={() => list.refetch()} /> :
          list.data.items.length === 0 ? <EmptyState icon={<Package size={22} />} title={t("catalog.products.empty.title")} description={t("catalog.products.empty.body")} action={<Link to="/products/new"><Button>{t("catalog.products.new")}</Button></Link>} /> : (
            <>
              <p className="mb-3 text-xs text-muted">{t("catalog.products.stockHint")}</p>
              <Table head={[t("catalog.products.col.product"), t("catalog.products.col.status"), t("catalog.products.col.variants"), t("catalog.products.col.price"), t("catalog.products.col.stock")]} caption={t("catalog.products.caption")}>{list.data.items.map((p) => {
                const img = p.images?.[0]; const src = img?.url ?? mediaUrl(img?.mediaId);
                const stock = p.variants.reduce((s, v) => s + (v.stock ? v.stock.total - v.stock.reserved : 0), 0);
                const prices = p.variants.map((v) => v.prices.website);
                return (
                  <tr key={p.id}>
                    <Td><Link to={`/products/${p.id}`} className="flex items-center gap-3 font-medium hover:text-brand-ink">
                      {src ? <img src={src} alt="" className="size-11 rounded-lg object-cover ring-1 ring-ink/[.07]" /> : <span className="grid size-11 place-items-center rounded-lg bg-hover text-faint" aria-hidden><Package size={18} /></span>}{p.name}</Link></Td>
                    <Td><Badge tone={statusTone(p.status)}>{enumLabel("productStatus", p.status)}</Badge></Td>
                    <Td>{p.variants.length}</Td>
                    <Td>{prices.length ? (Math.min(...prices) === Math.max(...prices) ? money(prices[0]) : `${money(Math.min(...prices))} - ${money(Math.max(...prices))}`) : "-"}</Td>
                    <Td className="tabular-nums">{stock <= 5 ? <Badge tone={stock <= 0 ? "danger" : "warning"}>{stock}</Badge> : stock}</Td>
                  </tr>
                );
              })}</Table>
              <Pagination page={list.data.page} pageSize={list.data.pageSize} total={list.data.total} onPage={(n) => upd("page", String(n))} />
            </>
          )}
      </Card>
    </>
  );
}

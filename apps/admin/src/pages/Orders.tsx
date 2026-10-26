import { useEffect, useState } from "react";
import { ClipboardList, Printer } from "lucide-react";
import { MAX_PRINT_IDS, openPrint } from "../lib/print";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ORDER_SOURCES, ORDER_STATUSES } from "@openshelf/shared";
import { api, qs } from "../lib/api";
import { dateTime, enumLabel, money } from "../lib/format";
import { useT } from "../i18n";
import type { Paged } from "../lib/types";
import { mapPaged, orderRowFromApi } from "../lib/adapt";
import { Badge, Button, Card, EmptyState, ErrorState, Loading, PageHeader, Pagination, SelectField, statusTone, Table, Td, TextField, useDebounced } from "../components/ui";

export default function Orders() {
  const { t } = useT();
  const [sp, setSp] = useSearchParams();
  const [q, setQ] = useState(sp.get("q") ?? "");
  const dq = useDebounced(q);
  const status = sp.get("status") ?? ""; const source = sp.get("source") ?? ""; const page = Number(sp.get("page") ?? 1);
  const list = useQuery({ queryKey: ["orders", dq, status, source, page], queryFn: async () => mapPaged(await api.get<Paged<unknown>>(`/api/admin/orders${qs({ q: dq, status, source, page, pageSize: 20 })}`), orderRowFromApi) });
  const [sel, setSel] = useState<Set<string>>(new Set());
  useEffect(() => setSel(new Set()), [dq, status, source, page]);
  const rows = list.data?.items ?? [];
  const allOn = rows.length > 0 && rows.every((o) => sel.has(o.id));
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const ids = [...sel].slice(0, MAX_PRINT_IDS);
  const upd = (k: string, v: string) => setSp((p) => { const n = new URLSearchParams(p); v ? n.set(k, v) : n.delete(k); if (k !== "page") n.delete("page"); return n; });
  return (
    <>
      <PageHeader title={t("orders.title")} description={t("orders.description")} guide="orders#siparis-durumlari" />
      <Card>
        <div className="mb-5 grid gap-3 sm:grid-cols-3">
          <TextField label={t("common.search")} type="search" placeholder={t("orders.filter.searchPlaceholder")} hint={t("orders.filter.search.hint")} help="orders.search" value={q} onChange={(e) => { setQ(e.target.value); upd("q", e.target.value); }} />
          <SelectField label={t("common.status")} hint={t("orders.filter.status.hint")} help="orders.status" value={status} onChange={(e) => upd("status", e.target.value)}><option value="">{t("common.all")}</option>{ORDER_STATUSES.map((s) => <option key={s} value={s}>{enumLabel("status", s)}</option>)}</SelectField>
          <SelectField label={t("orders.filter.source")} hint={t("orders.filter.source.hint")} help="orders.source" value={source} onChange={(e) => upd("source", e.target.value)}><option value="">{t("common.all")}</option>{ORDER_SOURCES.map((s) => <option key={s} value={s}>{enumLabel("source", s)}</option>)}</SelectField>
        </div>
        {list.isPending ? <Loading /> : list.isError ? <ErrorState error={list.error} retry={() => list.refetch()} /> :
          list.data.items.length === 0 ? <EmptyState icon={<ClipboardList size={22} />} title={t("orders.empty.title")} description={t("orders.empty.body")} /> : (
            <>
              <Table head={[<input key="all" type="checkbox" aria-label={t("orders.col.selectAll")} className="size-4 accent-[var(--color-brand-600)]" checked={allOn} onChange={() => setSel(allOn ? new Set() : new Set(rows.map((o) => o.id)))} />, t("orders.col.order"), t("orders.col.date"), t("orders.col.customer"), t("orders.col.source"), t("orders.col.status"), t("orders.col.total")]} caption={t("orders.table.caption")}>{list.data.items.map((o) => (
                <tr key={o.id}>
                  <Td className="w-10"><input type="checkbox" aria-label={t("orders.selectOne", { number: o.number })} className="size-4 accent-[var(--color-brand-600)]" checked={sel.has(o.id)} onChange={() => toggle(o.id)} /></Td>
                  <Td><Link className="font-medium text-brand-ink hover:underline" to={`/orders/${o.id}`}>#{o.number}</Link>{o.isMock && <span className="ml-2"><Badge tone="danger">{t("orders.mockBadge")}</Badge></span>}</Td>
                  <Td>{dateTime(o.createdAt)}</Td><Td>{o.customerName ?? o.email ?? "-"}</Td>
                  <Td><Badge>{enumLabel("source", o.source)}</Badge></Td><Td><Badge tone={statusTone(o.status)}>{enumLabel("status", o.status)}</Badge></Td>
                  <Td>{money(o.total, o.currency)}</Td>
                </tr>
              ))}</Table>
              <Pagination page={list.data.page} pageSize={list.data.pageSize} total={list.data.total} onPage={(n) => upd("page", String(n))} />
            </>
          )}
      </Card>
      {sel.size > 0 && (
        <div role="region" aria-label={t("orders.bulk.label")} className="sticky bottom-4 z-20 mx-auto mt-4 flex w-fit max-w-full flex-wrap items-center gap-2 rounded-xl border border-line bg-raised px-4 py-2.5 shadow-lift">
          <span className="text-sm font-medium">{sel.size > MAX_PRINT_IDS ? t("orders.bulk.selectedCapped", { n: sel.size, max: MAX_PRINT_IDS }) : t("orders.bulk.selected", { n: sel.size })}</span>
          <Button size="sm" variant="secondary" onClick={() => openPrint("label", ids)}><Printer size={14} />{t("orders.bulk.printLabels", { n: ids.length })}</Button>
          <Button size="sm" variant="secondary" onClick={() => openPrint("packing", ids)}>{t("orders.bulk.packing", { n: ids.length })}</Button>
          <Button size="sm" variant="secondary" onClick={() => openPrint("invoice", ids)}>{t("orders.bulk.invoices", { n: ids.length })}</Button>
          <Button size="sm" variant="ghost" onClick={() => setSel(new Set())}>{t("common.clear")}</Button>
          <span className="basis-full text-xs text-muted">{t("orders.bulk.hint", { max: MAX_PRINT_IDS })}</span>
        </div>
      )}
    </>
  );
}

import { useState } from "react";
import { FileText, Plus, Printer } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, qs } from "../lib/api";
import { dateTime, enumLabel, money } from "../lib/format";
import { hasKey, tNow, useT } from "../i18n";
import { HelpTip } from "../components/help/HelpTip";
import type { Paged } from "../lib/types";
import { INVOICE_STATUSES } from "../lib/invoices";
import type { InvoiceRow } from "../lib/invoices";
import { useAdmin } from "../lib/auth";
import { printUrl } from "../lib/print";
import { Badge, Button, Card, cx, EmptyState, ErrorState, Loading, PageHeader, Pagination, Table, Td, TextField, useDebounced } from "../components/ui";
import type { Tone } from "../components/ui";

export const invoiceTone = (s: string): Tone =>
  ({ issued: "success", draft: "warning", failed: "danger", issuing: "info", cancelling: "info", cancelled: "neutral" } as Record<string, Tone>)[s] ?? "neutral";
export const typeLabel = (t?: string | null) => (t && hasKey(`invoices.type.${t}`) ? tNow(`invoices.type.${t}`) : "-");

export default function Invoices() {
  const { t } = useT();
  const [sp, setSp] = useSearchParams();
  const [q, setQ] = useState(sp.get("q") ?? ""); const dq = useDebounced(q);
  const status = sp.get("status") ?? ""; const page = Number(sp.get("page") ?? 1);
  const admin = useAdmin();
  const list = useQuery({ queryKey: ["manual-invoices", dq, status, page], queryFn: () => api.get<Paged<InvoiceRow>>(`/api/admin/manual-invoices${qs({ q: dq, status, page, pageSize: 20 })}`) });
  const upd = (k: string, v: string) => setSp((p) => { const n = new URLSearchParams(p); v ? n.set(k, v) : n.delete(k); if (k !== "page") n.delete("page"); return n; });
  const chip = (value: string, text: string) => (
    <button key={value} type="button" aria-pressed={status === value} onClick={() => upd("status", value)}
      className={cx("rounded-full border px-3 py-1 text-[13px] font-medium transition", status === value ? "border-brand-600 bg-brand-50 text-brand-ink" : "border-line text-muted hover:border-line-strong hover:text-ink")}>{text}</button>
  );
  return (
    <>
      <PageHeader title={t("invoices.title")} description={t("invoices.description")} guide="invoices#manuel-fatura"
        actions={<Link to="/invoices/new"><Button><Plus size={16} />{t("invoices.manualButton")}</Button></Link>} />
      <Card>
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div role="group" aria-label={t("invoices.filterByStatus")} className="flex flex-wrap items-center gap-2">{chip("", t("common.all"))}{INVOICE_STATUSES.map((s) => chip(s, enumLabel("invoice", s)))}<HelpTip id="invoices.status" guide="invoices#manuel-fatura" /></div>
          <div className="w-full sm:w-72"><TextField label={t("common.search")} type="search" placeholder={t("invoices.searchPlaceholder")} value={q} onChange={(e) => { setQ(e.target.value); upd("q", e.target.value); }} /></div>
        </div>
        {list.isPending ? <Loading /> : list.isError ? <ErrorState error={list.error} retry={() => list.refetch()} /> :
          list.data.items.length === 0 ? <EmptyState icon={<FileText size={22} />} title={t("invoices.empty.title")} description={t("invoices.empty.body")}
            action={admin?.role !== "staff" ? <Link to="/invoices/new"><Button>{t("invoices.empty.action")}</Button></Link> : undefined} /> : (
            <>
              <Table head={[t("invoices.col.created"), t("invoices.col.number"), t("invoices.col.customer"), t("invoices.col.total"), t("invoices.col.status"), ""]} caption={t("invoices.table.caption")}>{list.data.items.map((r) => (
                <tr key={r.id}>
                  <Td>{dateTime(r.createdAt)}</Td>
                  <Td><Link className="font-medium text-brand-ink hover:underline" to={`/invoices/${r.id}`}>{r.number ?? enumLabel("invoice", "draft")}</Link>{r.type && <span className="ml-2 text-xs text-muted">{typeLabel(r.type)}</span>}</Td>
                  <Td>{r.customerName || "-"}</Td>
                  <Td className="tabular-nums">{money(r.total, r.currency)}</Td>
                  <Td><Badge tone={invoiceTone(r.status)}>{enumLabel("invoice", r.status)}</Badge></Td>
                  <Td className="text-right whitespace-nowrap">
                    <Link to={`/invoices/${r.id}`}><Button size="sm" variant="ghost">{r.status === "draft" || r.status === "failed" ? t("invoices.action.edit") : t("invoices.action.view")}</Button></Link>
                    {r.status === "issued" && <a href={printUrl("manual-invoice", [r.id])} target="_blank" rel="noopener noreferrer" aria-label={t("invoices.printAria", { number: r.number ?? "" })} className="ml-1 inline-grid size-8 place-items-center rounded-lg text-muted transition hover:bg-hover hover:text-ink"><Printer size={16} /></a>}
                  </Td>
                </tr>
              ))}</Table>
              <p className="mt-3 text-xs text-muted">{t("invoices.statusLegend")}</p>
              <Pagination page={list.data.page} pageSize={list.data.pageSize} total={list.data.total} onPage={(n) => upd("page", String(n))} />
            </>
          )}
      </Card>
    </>
  );
}

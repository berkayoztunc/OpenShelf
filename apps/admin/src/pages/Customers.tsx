import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, errMsg, qs } from "../lib/api";
import { useT } from "../i18n";
import { HelpTip } from "../components/help/HelpTip";
import { TermText } from "../components/TermText";
import { dateTime } from "../lib/format";
import type { Customer, Paged } from "../lib/types";
import { customerFromApi, mapPaged } from "../lib/adapt";
import { Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, Loading, PageHeader, Pagination, Table, Td, TextField, useDebounced, useToast } from "../components/ui";

export default function Customers() {
  const { t } = useT();
  const [q, setQ] = useState(""); const dq = useDebounced(q);
  const [page, setPage] = useState(1);
  const [anon, setAnon] = useState<Customer | null>(null);
  const qc = useQueryClient(); const toast = useToast();
  const list = useQuery({ queryKey: ["customers", dq, page], queryFn: async () => mapPaged(await api.get<Paged<unknown>>(`/api/admin/customers${qs({ q: dq, page, pageSize: 20 })}`), customerFromApi) });
  const run = useMutation({
    mutationFn: (id: string) => api.post(`/api/admin/customers/${id}/anonymize`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["customers"] }); setAnon(null); toast.success(t("catalog.customers.anonymized")); },
    onError: (e) => toast.error(errMsg(e)),
  });
  return (
    <>
      <PageHeader title={t("catalog.customers.title")} description={t("catalog.customers.description")} guide="customers-kvkk#musteriler" />
      <Card>
        <p className="mb-4 flex items-center gap-1 text-xs text-muted"><span><TermText text={t("catalog.customers.kvkkNote")} /></span><HelpTip id="catalog.anonymize" /></p>
        <div className="mb-4 max-w-sm"><TextField label={t("catalog.customers.searchLabel")} help="catalog.customerSearch" hint={t("catalog.customers.searchHint")} type="search" placeholder={t("catalog.customers.searchPlaceholder")} value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /></div>
        {list.isPending ? <Loading /> : list.isError ? <ErrorState error={list.error} retry={() => list.refetch()} /> :
          list.data.items.length === 0 ? <EmptyState title={t("catalog.customers.empty.title")} description={t("catalog.customers.empty.body")} /> : (
            <>
              <Table head={[t("catalog.customers.col.customer"), t("catalog.customers.col.joined"), ""]} caption={t("catalog.customers.caption")}>{list.data.items.map((c) => (
                <tr key={c.id}><Td>{c.name ?? "-"}<span className="block text-xs text-muted">{c.email}</span></Td><Td>{dateTime(c.createdAt)}</Td>
                  <Td className="whitespace-nowrap text-right">{c.anonymizedAt ? <Badge>{t("catalog.customers.anonymizedBadge")}</Badge> : <>
                    <Link to={`/emails/compose?${new URLSearchParams({ to: c.email, customerId: c.id })}`}><Button size="sm" variant="ghost">{t("catalog.customers.email")}</Button></Link>
                    <Button size="sm" variant="ghost" onClick={() => setAnon(c)}>{t("catalog.customers.anonymize")}</Button></>}</Td></tr>
              ))}</Table>
              <Pagination page={list.data.page} pageSize={list.data.pageSize} total={list.data.total} onPage={setPage} />
            </>
          )}
      </Card>
      <ConfirmDialog open={!!anon} danger title={t("catalog.customers.anonymize.title")} confirmLabel={t("catalog.customers.anonymize.action")} loading={run.isPending}
        message={t("catalog.customers.anonymize.message", { email: anon?.email ?? "" })} onConfirm={() => anon && run.mutate(anon.id)} onClose={() => setAnon(null)} />
    </>
  );
}

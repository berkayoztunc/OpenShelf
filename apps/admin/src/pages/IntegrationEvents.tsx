import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PROVIDER_IDS } from "@openshelf/shared";
import { api, errMsg, qs } from "../lib/api";
import { dateTime, enumLabel } from "../lib/format";
import { hasKey, tNow, useT } from "../i18n";
import type { IntegrationEvent, OutboxJob, Paged } from "../lib/types";
import { integrationEventFromApi, mapPaged, outboxFromApi } from "../lib/adapt";
import { Badge, Button, Card, EmptyState, ErrorState, Loading, PageHeader, Pagination, SelectField, statusTone, Table, Td, Tabs, useToast } from "../components/ui";
import { MarketingEventsTable } from "./settings/Tracking";

type Tab = "events" | "outbox" | "marketing";
const list = <T,>(r: Paged<T> | T[]) => (Array.isArray(r) ? r : r.items);

/** Human text for an outbox job kind (`invoice.issue`, `notify.order_paid`, ...); unknown kinds show as sent. */
export function jobLabel(kind: string): string {
  if (hasKey(`events.job.${kind}`)) return tNow(`events.job.${kind}`);
  if (kind.startsWith("notify.")) return tNow("events.job.notify", { event: enumLabel("notificationEvent", kind.slice(7)) });
  if (kind.startsWith("marketing.")) return tNow("events.job.marketing", { provider: enumLabel("provider", kind.split(".").pop()) });
  return kind;
}

function Events() {
  const { t } = useT();
  const [sp] = useSearchParams();
  const [provider, setProvider] = useState(() => { const p = sp.get("provider") ?? ""; return (PROVIDER_IDS as readonly string[]).includes(p) ? p : ""; }); const [page, setPage] = useState(1);
  const q = useQuery({ queryKey: ["integration-events", provider, page], queryFn: async () => mapPaged(await api.get<Paged<unknown>>(`/api/admin/integration-events${qs({ provider, page })}`), integrationEventFromApi) as Paged<IntegrationEvent> });
  return (<>
    <div className="mb-4 max-w-xs"><SelectField label={t("events.provider")} value={provider} onChange={(e) => { setProvider(e.target.value); setPage(1); }}><option value="">{t("events.all")}</option>{PROVIDER_IDS.map((p) => <option key={p} value={p}>{enumLabel("provider", p)}</option>)}</SelectField></div>
    {q.isPending ? <Loading /> : q.isError ? <ErrorState error={q.error} retry={() => q.refetch()} /> : list(q.data).length === 0 ? <EmptyState title={t("events.empty")} /> : (<>
      <Table head={[t("events.col.time"), t("events.col.provider"), t("events.col.level"), t("events.col.message")]} caption={t("events.caption")}>{list(q.data).map((e) => (
        <tr key={e.id}><Td>{dateTime(e.createdAt)}</Td><Td>{enumLabel("provider", e.provider)}</Td><Td>{(e.status ?? e.kind) ? <Badge tone={statusTone(e.status ?? e.kind ?? "")}>{enumLabel("level", e.status ?? e.kind)}</Badge> : "-"}</Td><Td className="max-w-md break-words">{e.message ?? "-"}</Td></tr>
      ))}</Table>
      {!Array.isArray(q.data) && <Pagination page={q.data.page} pageSize={q.data.pageSize} total={q.data.total} onPage={setPage} />}
    </>)}
  </>);
}

function Outbox() {
  const { t } = useT();
  const [status, setStatus] = useState("");
  const qc = useQueryClient(); const toast = useToast();
  const q = useQuery({ queryKey: ["outbox", status], queryFn: async () => mapPaged(await api.get<Paged<unknown>>(`/api/admin/outbox${qs({ status })}`), outboxFromApi) as Paged<OutboxJob>, refetchInterval: 15_000 });
  const retry = useMutation({
    mutationFn: (id: string) => api.post(`/api/admin/outbox/${id}/retry`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["outbox"] }); toast.success(t("events.outbox.requeued")); }, onError: (e) => toast.error(errMsg(e)),
  });
  return (<>
    <div className="mb-4 max-w-xs"><SelectField label={t("events.status")} hint={t("events.outbox.hint")} value={status} onChange={(e) => setStatus(e.target.value)}><option value="">{t("events.all")}</option>{["pending", "running", "done", "failed", "dead"].map((s) => <option key={s} value={s}>{enumLabel("outbox", s)}</option>)}</SelectField></div>
    {q.isPending ? <Loading /> : q.isError ? <ErrorState error={q.error} retry={() => q.refetch()} /> : list(q.data).length === 0 ? <EmptyState title={t("events.outbox.empty")} /> : (
      <Table head={[t("events.outbox.col.job"), t("events.outbox.col.status"), t("events.outbox.col.attempts"), t("events.outbox.col.nextRun"), t("events.outbox.col.lastError"), ""]} caption={t("events.outbox.caption")}>{list(q.data).map((j) => (
        <tr key={j.id}><Td className="text-xs"><span className="text-sm font-medium">{jobLabel(j.kind)}</span><span className="block font-mono text-muted">{j.kind} · {j.id}</span></Td><Td><Badge tone={statusTone(j.status)}>{enumLabel("outbox", j.status)}</Badge></Td><Td>{j.attempts}</Td><Td>{dateTime(j.nextRunAt)}</Td>
          <Td className="max-w-xs break-words text-xs">{j.lastError ?? "-"}</Td>
          <Td className="text-right">{["failed", "dead"].includes(j.status) && <Button size="sm" variant="secondary" loading={retry.isPending && retry.variables === j.id} onClick={() => retry.mutate(j.id)}>{t("events.outbox.retry")}</Button>}</Td></tr>
      ))}</Table>
    )}
  </>);
}

export default function IntegrationEvents() {
  const { t } = useT();
  const [tab, setTab] = useState<Tab>("events");
  return (
    <>
      <PageHeader title={t("events.title")} description={t("events.description")} guide="troubleshooting#entegrasyon-hatalari" />
      <Tabs<Tab> label={t("events.tabs.label")} value={tab} onChange={setTab} tabs={[{ id: "events", label: t("events.tabs.events") }, { id: "outbox", label: t("events.tabs.outbox") }, { id: "marketing", label: t("events.tabs.marketing") }]} />
      <Card>{tab === "events" ? <Events /> : tab === "outbox" ? <Outbox /> : <MarketingEventsTable />}</Card>
    </>
  );
}

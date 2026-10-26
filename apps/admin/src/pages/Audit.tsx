import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useAdmin } from "../lib/auth";
import { dateTime, label } from "../lib/format";
import { hasKey, useT } from "../i18n";
import type { AdminUser, Paged } from "../lib/types";
import { auditFromApi, mapPaged } from "../lib/adapt";
import { Card, EmptyState, ErrorState, Loading, PageHeader, Pagination, Table, Td, TextField } from "../components/ui";
import { HelpTip } from "../components/help/HelpTip";

export default function Audit() {
  const { t, td } = useT();
  const admin = useAdmin();
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState("");
  const q = useQuery({ queryKey: ["audit", page], queryFn: async () => mapPaged(await api.get<Paged<unknown>>(`/api/admin/audit-logs?page=${page}`), auditFromApi) });
  // Only the owner may list users; for them the actor id is shown as a name, otherwise "You" / a short id.
  const users = useQuery({ queryKey: ["admin-users"], enabled: admin?.role === "owner", queryFn: async () => { const r = await api.get<AdminUser[] | { items: AdminUser[] }>("/api/admin/users"); return Array.isArray(r) ? r : r.items; } });

  /** `settings.update` -> "Settings were updated"; unknown codes fall back to the raw code so nothing is hidden. */
  const actionText = (code: string) => (hasKey(`audit.action.${code}`) ? td(`audit.action.${code}`) : label(code.replace(/\./g, " ")));
  const entityText = (e?: string) => (!e ? "-" : hasKey(`audit.entity.${e}`) ? td(`audit.entity.${e}`) : label(e));
  const actorText = (id?: string) => {
    if (!id) return "-";
    if (id === admin?.id) return t("audit.you");
    const u = users.data?.find((x) => x.id === id);
    return u ? u.name || u.email : `${id.slice(0, 8)}…`;
  };

  const needle = filter.trim().toLowerCase();
  const rows = (q.data?.items ?? []).filter((l) => !needle || [actionText(l.action), actorText(l.actor), entityText(l.entity), l.entityId ?? ""].join(" ").toLowerCase().includes(needle));

  return (
    <>
      <PageHeader title={t("audit.title")} description={t("audit.description")} guide="security#denetim-kaydi" />
      <Card>
        {q.isPending ? <Loading /> : q.isError ? <ErrorState error={q.error} retry={() => q.refetch()} /> : q.data.items.length === 0 ? <EmptyState title={t("audit.empty")} description={t("audit.emptyBody")} /> : (<>
          <div className="mb-4 flex max-w-md items-end gap-2">
            <div className="flex-1"><TextField label={t("audit.filter.label")} placeholder={t("audit.filter.placeholder")} value={filter} onChange={(e) => setFilter(e.target.value)} /></div>
            <HelpTip id="audit.page" className="mb-2" />
          </div>
          <Table head={[t("audit.col.time"), t("audit.col.actor"), t("audit.col.action"), t("audit.col.entity")]} caption={t("audit.caption")}>{rows.map((l) => (
            <tr key={l.id}><Td>{dateTime(l.createdAt)}</Td><Td>{actorText(l.actor)}</Td><Td><span title={l.action}>{actionText(l.action)}</span></Td><Td>{entityText(l.entity)}{l.entityId ? <span className="ml-1 font-mono text-xs text-muted">{l.entityId.length > 12 ? `${l.entityId.slice(0, 8)}…` : l.entityId}</span> : null}</Td></tr>
          ))}</Table>
          {rows.length === 0 && <p className="py-6 text-center text-sm text-muted">{t("audit.filter.none")}</p>}
          <Pagination page={q.data.page} pageSize={q.data.pageSize} total={q.data.total} onPage={setPage} />
        </>)}
      </Card>
    </>
  );
}

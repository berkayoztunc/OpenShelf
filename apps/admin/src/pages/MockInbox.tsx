import { useState } from "react";
import { CreditCard, FileText, Inbox, Mail, MessageSquare, Truck, Zap } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, errMsg, qs } from "../lib/api";
import { useAdmin } from "../lib/auth";
import { dateTime, enumLabel } from "../lib/format";
import { useT } from "../i18n";
import type { Paged } from "../lib/types";
import { Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, Loading, PageHeader, Pagination, SelectField, useToast } from "../components/ui";

const CH: Record<string, { icon: LucideIcon; tone: string }> = {
  sms: { icon: MessageSquare, tone: "bg-success-soft text-success" },
  email: { icon: Mail, tone: "bg-info-soft text-info" },
  event: { icon: Zap, tone: "bg-warn-soft text-warn" },
  invoice: { icon: FileText, tone: "bg-info-soft text-info" },
  shipment: { icon: Truck, tone: "bg-warn-soft text-warn" },
  payment: { icon: CreditCard, tone: "bg-danger-soft text-danger" },
};
const CHANNELS = ["sms", "email", "event", "invoice", "shipment", "payment"] as const;
interface MockMessage { id: number; channel: string; to: string | null; subject: string | null; body: string | null; meta: unknown; at: string }

export default function MockInbox() {
  const { t } = useT();
  const [channel, setChannel] = useState(""); const [page, setPage] = useState(1);
  const [open, setOpen] = useState<number | null>(null); const [clearing, setClearing] = useState(false);
  const qc = useQueryClient(); const toast = useToast(); const admin = useAdmin();
  const q = useQuery({
    queryKey: ["mock-messages", channel, page],
    queryFn: () => api.get<Paged<MockMessage>>(`/api/admin/mock/messages${qs({ channel, page })}`),
    refetchInterval: 5_000,
  });
  const clear = useMutation({
    mutationFn: () => api.del("/api/admin/mock/messages"),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["mock-messages"] }); toast.success(t("mock.cleared")); setClearing(false); setPage(1); },
    onError: (e) => { toast.error(errMsg(e)); setClearing(false); },
  });
  const items = q.data?.items ?? [];
  return (
    <>
      <PageHeader title={t("mock.title")} description={t("mock.description")} guide="getting-started#deneme-modu"
        actions={<Button variant="danger" disabled={admin?.role !== "owner" || items.length === 0} onClick={() => setClearing(true)}>{t("mock.clearAll")}</Button>} />
      <Card>
        <div className="mb-4 max-w-xs">
          <SelectField label={t("mock.channel")} value={channel} onChange={(e) => { setChannel(e.target.value); setPage(1); }}>
            <option value="">{t("mock.all")}</option>{CHANNELS.map((c) => <option key={c} value={c}>{enumLabel("channel", c)}</option>)}
          </SelectField>
        </div>
        {q.isPending ? <Loading /> : q.isError ? <ErrorState error={q.error} retry={() => q.refetch()} /> : items.length === 0 ? <EmptyState title={t("mock.empty.title")} description={t("mock.empty.body")} /> : (<>
          <ul className="-mx-5 divide-y divide-line border-y border-line" aria-label={t("mock.messages")}>{items.map((m) => {
            const ch = CH[m.channel] ?? { icon: Inbox, tone: "bg-hover text-muted" };
            const Icon = ch.icon;
            return (
              <li key={m.id} className="transition-colors hover:bg-hover">
                <div className="flex items-start gap-3.5 px-5 py-3.5">
                  <span aria-hidden className={`mt-0.5 grid size-9 shrink-0 place-items-center rounded-full ${ch.tone}`}><Icon size={17} /></span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5"><Badge>{enumLabel("channel", m.channel)}</Badge><span className="break-all text-sm font-medium">{m.to ?? "-"}</span></div>
                    <p className="mt-1 break-words text-sm text-muted">{m.subject ?? m.body?.slice(0, 120) ?? "-"}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <time className="text-xs text-muted" dateTime={m.at}>{dateTime(m.at)}</time>
                    <Button size="sm" variant="secondary" aria-expanded={open === m.id} aria-controls={`mock-${m.id}`} onClick={() => setOpen(open === m.id ? null : m.id)}>{open === m.id ? t("mock.hide") : t("mock.details")}</Button>
                  </div>
                </div>
                {open === m.id && (
                  <div id={`mock-${m.id}`} className="border-t border-line bg-hover px-5 py-3 pl-[4.4rem]">
                    {m.body && <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs">{m.body}</pre>}
                    {m.meta != null && <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs text-muted">{JSON.stringify(m.meta, null, 2)}</pre>}
                  </div>
                )}
              </li>
            );
          })}</ul>
          <Pagination page={q.data!.page} pageSize={q.data!.pageSize} total={q.data!.total} onPage={setPage} />
        </>)}
      </Card>
      <ConfirmDialog open={clearing} danger loading={clear.isPending} title={t("mock.confirm.title")} message={t("mock.confirm.message")}
        confirmLabel={t("mock.confirm.action")} onConfirm={() => clear.mutate()} onClose={() => setClearing(false)} />
    </>
  );
}

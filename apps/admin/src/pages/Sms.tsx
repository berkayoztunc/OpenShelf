import { useState } from "react";
import { MessageSquare } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, errMsg, qs } from "../lib/api";
import { dateTime } from "../lib/format";
import { useAdmin } from "../lib/auth";
import { useT } from "../i18n";
import type { Paged } from "../lib/types";
import { smsSegments } from "../lib/campaigns";
import { Badge, Button, Card, EmptyState, ErrorState, Loading, PageHeader, Pagination, Table, Td, TextArea, TextField, statusTone, useToast } from "../components/ui";

interface SmsRow { id: string; to: string; text: string; status: "queued" | "sent" | "failed"; provider?: string | null; error?: string | null; createdAt: string | number }

/** /sms: send one SMS to one number (support / transactional use) and review what was sent. Bulk marketing SMS lives in Campaigns (consent required). */
export default function Sms() {
  const { t } = useT(); const toast = useToast(); const qc = useQueryClient(); const admin = useAdmin();
  const [to, setTo] = useState(""); const [text, setText] = useState(""); const [page, setPage] = useState(1);
  const list = useQuery({ queryKey: ["sms", page], queryFn: () => api.get<Paged<SmsRow>>(`/api/admin/sms${qs({ page, pageSize: 20 })}`), enabled: admin?.role !== "staff" });
  const send = useMutation({
    mutationFn: () => api.post("/api/admin/sms/send", { to, text }),
    onSuccess: () => { toast.success(t("sms.sent")); setText(""); void qc.invalidateQueries({ queryKey: ["sms"] }); },
    onError: (e) => { toast.error(errMsg(e)); void qc.invalidateQueries({ queryKey: ["sms"] }); },
  });
  if (admin && admin.role === "staff") return <><PageHeader title={t("sms.title")} /><EmptyState title={t("campaigns.forbidden.title")} description={t("campaigns.forbidden.body")} /></>;
  const seg = smsSegments(text);
  return (
    <>
      <PageHeader title={t("sms.title")} description={t("sms.description")} />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title={t("sms.compose")}>
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); send.mutate(); }}>
            <TextField label={t("sms.to")} hint={t("sms.to.hint")} value={to} onChange={(e) => setTo(e.target.value)} inputMode="tel" autoComplete="off" />
            <TextArea label={t("sms.text")} rows={5} value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} />
            <p className="text-xs text-muted" data-testid="sms-counter">{t("campaigns.sms.counter", { chars: seg.chars, segments: seg.segments })}{seg.unicode ? ` · ${t("campaigns.sms.unicode")}` : ""}</p>
            <p className="text-xs text-muted">{t("sms.note")}</p>
            <Button type="submit" loading={send.isPending} disabled={!to.trim() || !text.trim()}>{t("sms.send")}</Button>
          </form>
        </Card>
        <div className="lg:col-span-2">
          <Card title={t("sms.history")}>
            {list.isPending ? <Loading /> : list.isError ? <ErrorState error={list.error} retry={() => list.refetch()} /> : list.data.items.length === 0
              ? <EmptyState icon={<MessageSquare size={22} />} title={t("sms.empty.title")} description={t("sms.empty.body")} />
              : <>
                <Table caption={t("sms.history")} head={[t("sms.col.time"), t("sms.col.to"), t("sms.col.text"), t("sms.col.status")]}>
                  {list.data.items.map((r) => (
                    <tr key={r.id}><Td className="whitespace-nowrap text-muted">{dateTime(String(r.createdAt))}</Td><Td className="font-mono text-[13px]">{r.to}</Td><Td className="max-w-xs truncate" >{r.text}</Td>
                      <Td><Badge tone={statusTone(r.status)} >{t(`sms.status.${r.status}`)}</Badge>{r.error && <span className="ml-2 text-xs text-danger">{r.error}</span>}</Td></tr>
                  ))}
                </Table>
                <Pagination page={list.data.page} pageSize={list.data.pageSize} total={list.data.total} onPage={setPage} />
              </>}
          </Card>
        </div>
      </div>
    </>
  );
}

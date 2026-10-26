import { useState } from "react";
import { Mail, Pencil } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, qs } from "../lib/api";
import { dateTime, enumLabel } from "../lib/format";
import { useT } from "../i18n";
import { useAdmin } from "../lib/auth";
import { describeSendError } from "../lib/mail";
import type { Paged } from "../lib/types";
import { Badge, Button, Card, ConfirmDialog, cx, EmptyState, ErrorState, Loading, Modal, PageHeader, Pagination, statusTone, Table, Td, TextField, useDebounced, useToast } from "../components/ui";

interface EmailRow { id: string; to: string; cc?: string | null; subject: string; status: "queued" | "sent" | "failed"; provider?: string | null; error?: string | null; orderId?: string | null; customerId?: string | null; manualInvoiceId?: string | null; createdAt: string; sentAt?: string | null }
interface EmailFull extends EmailRow { replyTo?: string | null; bodyText: string; bodyHtml: string }
const STATUSES = ["sent", "failed"] as const;

export default function Emails() {
  const { t } = useT();
  const [sp, setSp] = useSearchParams();
  const [q, setQ] = useState(sp.get("q") ?? ""); const dq = useDebounced(q);
  const status = sp.get("status") ?? ""; const page = Number(sp.get("page") ?? 1);
  const [openId, setOpenId] = useState<string | null>(null);
  const admin = useAdmin();
  const list = useQuery({ queryKey: ["emails", dq, status, page], queryFn: () => api.get<Paged<EmailRow>>(`/api/admin/emails${qs({ q: dq, status, page, pageSize: 20 })}`) });
  const upd = (k: string, v: string) => setSp((p) => { const n = new URLSearchParams(p); v ? n.set(k, v) : n.delete(k); if (k !== "page") n.delete("page"); return n; });
  const chip = (value: string, text: string) => (
    <button key={value} type="button" aria-pressed={status === value} onClick={() => upd("status", value)}
      className={cx("rounded-full border px-3 py-1 text-[13px] font-medium transition", status === value ? "border-brand-600 bg-brand-50 text-brand-ink" : "border-line text-muted hover:border-line-strong hover:text-ink")}>{text}</button>
  );
  return (
    <>
      <PageHeader title={t("emails.title")} description={t("emails.description")} guide="email#e-posta-yazma"
        actions={<Link to="/emails/compose"><Button disabled={admin?.role === "staff"} title={admin?.role === "staff" ? t("emails.staffSendHint") : undefined}><Pencil size={15} />{t("emails.composeButton")}</Button></Link>} />
      <Card>
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div role="group" aria-label={t("emails.filterByStatus")} className="flex gap-2">{chip("", t("common.all"))}{STATUSES.map((s) => chip(s, enumLabel("email", s)))}</div>
          <div className="w-full sm:w-72"><TextField label={t("common.search")} type="search" placeholder={t("emails.searchPlaceholder")} value={q} onChange={(e) => { setQ(e.target.value); upd("q", e.target.value); }} /></div>
        </div>
        {list.isPending ? <Loading /> : list.isError ? <ErrorState error={list.error} retry={() => list.refetch()} /> :
          list.data.items.length === 0 ? <EmptyState icon={<Mail size={22} />} title={t("emails.empty.title")} description={t("emails.empty.body")} /> : (
            <>
              <Table head={[t("emails.col.time"), t("emails.col.recipient"), t("emails.col.subject"), t("emails.col.linked"), t("emails.col.status")]} caption={t("emails.table.caption")}>{list.data.items.map((r) => (
                <tr key={r.id} className="cursor-pointer" onClick={() => setOpenId(r.id)}>
                  <Td className="whitespace-nowrap">{dateTime(r.sentAt ?? r.createdAt)}</Td>
                  <Td><button type="button" className="text-left font-medium text-brand-ink hover:underline" onClick={(e) => { e.stopPropagation(); setOpenId(r.id); }}>{r.to}</button></Td>
                  <Td className="max-w-xs truncate">{r.subject}</Td>
                  <Td className="whitespace-nowrap text-xs" >
                    {r.orderId && <Link className="mr-2 text-brand-ink underline" to={`/orders/${r.orderId}`} onClick={(e) => e.stopPropagation()}>{t("emails.link.order")}</Link>}
                    {r.manualInvoiceId && <Link className="text-brand-ink underline" to={`/invoices/${r.manualInvoiceId}`} onClick={(e) => e.stopPropagation()}>{t("emails.link.invoice")}</Link>}
                    {!r.orderId && !r.manualInvoiceId && <span className="text-muted">-</span>}
                  </Td>
                  <Td><Badge tone={statusTone(r.status)}>{enumLabel("email", r.status)}</Badge></Td>
                </tr>
              ))}</Table>
              <Pagination page={list.data.page} pageSize={list.data.pageSize} total={list.data.total} onPage={(n) => upd("page", String(n))} />
              <p className="mt-3 text-xs text-muted">{t("emails.statusHelp")}</p>
            </>
          )}
      </Card>
      {openId && <EmailDetail id={openId} onClose={() => setOpenId(null)} />}
    </>
  );
}

function EmailDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const { t } = useT();
  const [confirmResend, setConfirmResend] = useState(false);
  const admin = useAdmin(); const toast = useToast(); const qc = useQueryClient();
  const q = useQuery({ queryKey: ["email", id], queryFn: () => api.get<EmailFull>(`/api/admin/emails/${id}`) });
  const [err, setErr] = useState<string | null>(null);
  const resend = useMutation({
    mutationFn: () => api.post(`/api/admin/emails/${id}/resend`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["emails"] }); qc.invalidateQueries({ queryKey: ["email", id] }); toast.success(t("emails.toast.resent")); setErr(null); setConfirmResend(false); },
    onError: (e) => { setConfirmResend(false); const f = describeSendError(e); setErr(f.hint ? `${f.message} ${f.hint}` : f.message); qc.invalidateQueries({ queryKey: ["emails"] }); },
  });
  const m = q.data;
  return (
    <Modal wide open onClose={onClose} title={m?.subject ?? t("emails.detail.titleFallback")}
      footer={<>{m?.status === "failed" && <Button variant="secondary" loading={resend.isPending} disabled={admin?.role === "staff"} title={admin?.role === "staff" ? t("emails.detail.resendStaffHint") : undefined} onClick={() => setConfirmResend(true)}>{t("emails.detail.resend")}</Button>}<Button onClick={onClose}>{t("common.close")}</Button></>}>
      {q.isPending ? <Loading /> : q.isError ? <ErrorState error={q.error} retry={() => q.refetch()} /> : m && (
        <div className="space-y-3 text-sm">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
            <dt className="text-muted">{t("emails.detail.status")}</dt><dd><Badge tone={statusTone(m.status)}>{enumLabel("email", m.status)}</Badge>{m.provider && <span className="ml-2 text-xs text-muted">{t("emails.detail.via", { provider: enumLabel("provider", m.provider) })}</span>}</dd>
            <dt className="text-muted">{t("emails.detail.to")}</dt><dd className="break-all">{m.to}</dd>
            {m.cc && <><dt className="text-muted">{t("emails.detail.cc")}</dt><dd className="break-all">{m.cc}</dd></>}
            {m.replyTo && <><dt className="text-muted">{t("emails.detail.replyTo")}</dt><dd className="break-all">{m.replyTo}</dd></>}
            <dt className="text-muted">{t("emails.detail.time")}</dt><dd>{dateTime(m.sentAt ?? m.createdAt)}</dd>
          </dl>
          {m.error && <p role="alert" className="rounded-lg border border-danger-line bg-danger-soft px-3 py-2 text-danger">{m.error}</p>}
          {err && <p role="alert" className="rounded-lg border border-danger-line bg-danger-soft px-3 py-2 text-danger">{err}</p>}
          <iframe title={t("emails.detail.frameTitle")} sandbox="" srcDoc={m.bodyHtml} className="h-96 w-full rounded-lg border border-line bg-white" />
        </div>
      )}
      <ConfirmDialog open={confirmResend} title={t("emails.detail.resendTitle")} message={t("emails.detail.resendMessage")} confirmLabel={t("emails.detail.resend")} loading={resend.isPending}
        onConfirm={() => resend.mutate()} onClose={() => setConfirmResend(false)} />
    </Modal>
  );
}

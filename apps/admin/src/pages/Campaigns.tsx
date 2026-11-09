import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Megaphone, Plus } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, errMsg, qs } from "../lib/api";
import { dateTime } from "../lib/format";
import { useAdmin } from "../lib/auth";
import { useT } from "../i18n";
import type { Paged } from "../lib/types";
import { progressOf, smsSegments } from "../lib/campaigns";
import type { CampaignFilters, CampaignFull, CampaignRow } from "../lib/campaigns";
import { Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, Loading, Modal, PageHeader, Pagination, SelectField, Table, Td, TextArea, TextField, useDebounced, useToast, statusTone } from "../components/ui";

const STATUS_TONE = { draft: "neutral", sending: "info", done: "success", cancelled: "warning", failed: "danger" } as const;
const StatusBadge = ({ s }: { s: CampaignRow["status"] }) => { const { t } = useT(); return <Badge tone={STATUS_TONE[s] ?? statusTone(s)}>{t(`campaigns.status.${s}`)}</Badge>; };

function Gate({ children }: { children: React.ReactNode }) {
  const { t } = useT(); const admin = useAdmin();
  if (admin && admin.role === "staff") return <EmptyState title={t("campaigns.forbidden.title")} description={t("campaigns.forbidden.body")} />;
  return <>{children}</>;
}

/** /campaigns: list of e-mail / SMS campaigns. */
export function CampaignList() {
  const { t } = useT(); const [page, setPage] = useState(1);
  const q = useQuery({ queryKey: ["campaigns", page], queryFn: () => api.get<Paged<CampaignRow>>(`/api/admin/campaigns${qs({ page, pageSize: 20 })}`) });
  return (
    <>
      <PageHeader title={t("campaigns.title")} description={t("campaigns.description")} actions={<Link to="/campaigns/new"><Button><Plus size={15} />{t("campaigns.new")}</Button></Link>} />
      <Gate>
        <Card>
          {q.isPending ? <Loading /> : q.isError ? <ErrorState error={q.error} retry={() => q.refetch()} /> : q.data.items.length === 0
            ? <EmptyState icon={<Megaphone size={22} />} title={t("campaigns.empty.title")} description={t("campaigns.empty.body")} action={<Link to="/campaigns/new"><Button>{t("campaigns.new")}</Button></Link>} />
            : <>
              <Table caption={t("campaigns.title")} head={[t("campaigns.col.name"), t("campaigns.col.channel"), t("campaigns.col.status"), t("campaigns.col.progress"), t("campaigns.col.date")]}>
                {q.data.items.map((c) => (
                  <tr key={c.id} data-testid="campaign-row">
                    <Td><Link className="font-medium text-brand-ink hover:underline" to={`/campaigns/${c.id}`}>{c.name}</Link></Td>
                    <Td>{t(`campaigns.channel.${c.channel}`)}</Td>
                    <Td><StatusBadge s={c.status} /></Td>
                    <Td className="tabular-nums">{c.status === "draft" ? "-" : `${c.sent}/${c.total}${c.failed ? ` · ${c.failed} ✗` : ""}`}</Td>
                    <Td className="whitespace-nowrap text-muted">{dateTime(String(c.createdAt))}</Td>
                  </tr>
                ))}
              </Table>
              <Pagination page={q.data.page} pageSize={q.data.pageSize} total={q.data.total} onPage={setPage} />
            </>}
        </Card>
      </Gate>
    </>
  );
}

const numOrUndef = (v: string) => (v.trim() === "" ? undefined : Math.max(0, Math.floor(Number(v)) || 0) || undefined);

/** /campaigns/new and /campaigns/:id: draft editor (audience, preview, test, send) or progress view once sent. */
export function CampaignEditor() {
  const { id } = useParams(); const isNew = !id || id === "new";
  const { t } = useT(); const nav = useNavigate(); const toast = useToast(); const qc = useQueryClient();
  const saved = useQuery({
    queryKey: ["campaign", id], enabled: !isNew,
    queryFn: () => api.get<CampaignFull>(`/api/admin/campaigns/${id}`),
    refetchInterval: (query) => (query.state.data?.status === "sending" ? 3000 : false),
  });
  if (!isNew && saved.isPending) return <Loading />;
  if (!isNew && saved.isError) return <ErrorState error={saved.error} retry={() => saved.refetch()} />;
  return <Gate><EditorBody key={saved.data?.id ?? "new"} camp={saved.data} onSaved={(cid) => { void qc.invalidateQueries({ queryKey: ["campaigns"] }); void qc.invalidateQueries({ queryKey: ["campaign", cid] }); if (isNew) nav(`/campaigns/${cid}`, { replace: true }); else toast.success(t("campaigns.saved")); }} /></Gate>;
}

function EditorBody({ camp, onSaved }: { camp?: CampaignFull; onSaved: (id: string) => void }) {
  const { t } = useT(); const toast = useToast(); const nav = useNavigate(); const qc = useQueryClient();
  const locked = !!camp && camp.status !== "draft";
  const [name, setName] = useState(camp?.name ?? ""); const [channel, setChannel] = useState<"email" | "sms">(camp?.channel ?? "email");
  const [subject, setSubject] = useState(camp?.subject ?? ""); const [text, setText] = useState(camp?.body ?? "");
  const [f, setF] = useState<CampaignFilters>(camp?.filters ?? {});
  const [preview, setPreview] = useState<{ subject: string; html?: string; text: string } | null>(null);
  const [testing, setTesting] = useState(false); const [to, setTo] = useState("");
  const [confirmSend, setConfirmSend] = useState(false); const [confirmDel, setConfirmDel] = useState(false);
  const fd = useDebounced(JSON.stringify(f));
  const aud = useQuery({ queryKey: ["campaign-audience", channel, fd], queryFn: () => api.post<{ count: number; truncated: boolean; max: number; sample: { name: string | null; to: string }[] }>("/api/admin/campaigns/audience", { channel, filters: JSON.parse(fd) as CampaignFilters }) });
  const payload = { name, channel, subject: channel === "email" ? subject : "", body: text, filters: f };
  const save = useMutation({
    mutationFn: () => (camp ? api.put<{ id: string }>(`/api/admin/campaigns/${camp.id}`, payload) : api.post<{ id: string }>("/api/admin/campaigns", payload)),
    onSuccess: (r) => onSaved(r.id), onError: (e) => toast.error(errMsg(e)),
  });
  /** Preview/test/send act on the SAVED draft, so save first. */
  const ensureSaved = async () => (camp ? (await api.put(`/api/admin/campaigns/${camp.id}`, payload), camp.id) : (await api.post<{ id: string }>("/api/admin/campaigns", payload)).id);
  const doPreview = useMutation({ mutationFn: async () => { const cid = await ensureSaved(); void qc.invalidateQueries({ queryKey: ["campaign", cid] }); return api.post<{ subject: string; html?: string; text: string }>(`/api/admin/campaigns/${cid}/preview`, {}); }, onSuccess: setPreview, onError: (e) => toast.error(errMsg(e)) });
  const doTest = useMutation({ mutationFn: async () => { const cid = await ensureSaved(); return api.post(`/api/admin/campaigns/${cid}/test`, { to }); }, onSuccess: () => { toast.success(t("campaigns.test.sent")); setTesting(false); }, onError: (e) => toast.error(errMsg(e)) });
  const doSend = useMutation({
    mutationFn: async () => { const cid = await ensureSaved(); await api.post(`/api/admin/campaigns/${cid}/send`, {}); return cid; },
    onSuccess: (cid) => { setConfirmSend(false); toast.success(t("campaigns.send.started")); void qc.invalidateQueries({ queryKey: ["campaigns"] }); void qc.invalidateQueries({ queryKey: ["campaign", cid] }); if (!camp) nav(`/campaigns/${cid}`, { replace: true }); },
    onError: (e) => { setConfirmSend(false); toast.error(errMsg(e)); },
  });
  const cancel = useMutation({ mutationFn: () => api.post(`/api/admin/campaigns/${camp!.id}/cancel`, {}), onSuccess: () => { void qc.invalidateQueries({ queryKey: ["campaign", camp!.id] }); toast.success(t("campaigns.cancelled")); }, onError: (e) => toast.error(errMsg(e)) });
  const del = useMutation({ mutationFn: () => api.del(`/api/admin/campaigns/${camp!.id}`), onSuccess: () => { void qc.invalidateQueries({ queryKey: ["campaigns"] }); nav("/campaigns"); }, onError: (e) => { setConfirmDel(false); toast.error(errMsg(e)); } });

  const valid = name.trim() !== "" && text.trim() !== "" && (channel === "sms" || subject.trim() !== "");
  const seg = channel === "sms" ? smsSegments(text) : null;
  const count = aud.data?.count ?? 0;
  return (
    <>
      <PageHeader title={camp ? camp.name : t("campaigns.new")} description={t("campaigns.editor.description")}
        actions={<><Link to="/campaigns"><Button variant="ghost">{t("common.back")}</Button></Link>
          {camp && camp.status !== "sending" && <Button variant="danger" onClick={() => setConfirmDel(true)}>{t("common.delete")}</Button>}</>} />
      {camp && camp.status !== "draft" && <Progress camp={camp} onCancel={() => cancel.mutate()} cancelling={cancel.isPending} />}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title={t("campaigns.content")}>
            <div className="space-y-4">
              <TextField label={t("campaigns.field.name")} value={name} disabled={locked} onChange={(e) => setName(e.target.value)} maxLength={120} />
              <SelectField label={t("campaigns.field.channel")} value={channel} disabled={locked || !!camp} onChange={(e) => setChannel(e.target.value as "email" | "sms")}>
                <option value="email">{t("campaigns.channel.email")}</option><option value="sms">{t("campaigns.channel.sms")}</option>
              </SelectField>
              {channel === "email" && <TextField label={t("campaigns.field.subject")} value={subject} disabled={locked} onChange={(e) => setSubject(e.target.value)} maxLength={200} />}
              <TextArea label={t("campaigns.field.body")} hint={t("campaigns.field.body.hint")} rows={channel === "sms" ? 5 : 12} value={text} disabled={locked} onChange={(e) => setText(e.target.value)} />
              {seg && <p className="text-xs text-muted" data-testid="sms-counter">{t("campaigns.sms.counter", { chars: seg.chars, segments: seg.segments })}{seg.unicode ? ` · ${t("campaigns.sms.unicode")}` : ""}</p>}
              <p className="text-xs text-muted">{t(channel === "sms" ? "campaigns.footer.sms" : "campaigns.footer.email")}</p>
            </div>
          </Card>
        </div>
        <div className="space-y-6">
          <Card title={t("campaigns.audience")}>
            <p className="mb-3 text-xs text-muted">{t("campaigns.audience.consent")}</p>
            <div className="space-y-3">
              <TextField label={t("campaigns.filter.minOrders")} type="number" min={0} value={f.minOrders ?? ""} disabled={locked} onChange={(e) => setF({ ...f, minOrders: numOrUndef(e.target.value) })} />
              <TextField label={t("campaigns.filter.within")} type="number" min={0} value={f.orderedWithinDays ?? ""} disabled={locked} onChange={(e) => setF({ ...f, orderedWithinDays: numOrUndef(e.target.value) })} />
              <TextField label={t("campaigns.filter.city")} value={f.city ?? ""} disabled={locked} onChange={(e) => setF({ ...f, city: e.target.value || undefined })} />
            </div>
            <div className="mt-4 rounded-lg bg-canvas p-3 text-sm" data-testid="audience">
              {aud.isPending ? t("common.loading") : aud.isError ? <span className="text-danger">{errMsg(aud.error)}</span> : <>
                <p className="font-semibold">{t("campaigns.audience.count", { n: count })}</p>
                {aud.data.truncated && <p className="mt-1 text-xs text-warn">{t("campaigns.audience.tooLarge", { max: aud.data.max })}</p>}
                {aud.data.sample.length > 0 && <p className="mt-1 text-xs text-muted">{aud.data.sample.map((s) => s.to).join(", ")}…</p>}
              </>}
            </div>
          </Card>
          {!locked && (
            <Card title={t("campaigns.actions")}>
              <div className="flex flex-col gap-2">
                <Button variant="secondary" loading={save.isPending} disabled={!valid} onClick={() => save.mutate()}>{t("campaigns.save")}</Button>
                <Button variant="secondary" loading={doPreview.isPending} disabled={!valid} onClick={() => doPreview.mutate()}>{t("campaigns.preview")}</Button>
                <Button variant="secondary" disabled={!valid} onClick={() => setTesting(true)}>{t("campaigns.test")}</Button>
                <Button disabled={!valid || count === 0 || !!aud.data?.truncated} onClick={() => setConfirmSend(true)}>{t("campaigns.send")}</Button>
              </div>
            </Card>
          )}
        </div>
      </div>
      <Modal open={!!preview} wide onClose={() => setPreview(null)} title={t("campaigns.preview")} footer={<Button variant="ghost" onClick={() => setPreview(null)}>{t("common.close")}</Button>}>
        {preview && (preview.html ? <><p className="mb-2 text-sm font-medium">{preview.subject}</p><iframe title={t("campaigns.preview")} sandbox="" srcDoc={preview.html} className="h-96 w-full rounded-lg border border-line bg-white" /></>
          : <pre className="whitespace-pre-wrap rounded-lg border border-line bg-canvas p-3 text-sm">{preview.text}</pre>)}
      </Modal>
      <Modal open={testing} onClose={() => setTesting(false)} title={t("campaigns.test")}
        footer={<><Button variant="ghost" onClick={() => setTesting(false)}>{t("common.cancel")}</Button><Button loading={doTest.isPending} disabled={!to.trim()} onClick={() => doTest.mutate()}>{t("campaigns.test.action")}</Button></>}>
        <TextField label={t(channel === "sms" ? "campaigns.test.phone" : "campaigns.test.email")} value={to} onChange={(e) => setTo(e.target.value)} hint={t("campaigns.test.hint")} />
      </Modal>
      <ConfirmDialog open={confirmSend} danger loading={doSend.isPending} title={t("campaigns.send.title")} message={t("campaigns.send.message", { n: count, channel: t(`campaigns.channel.${channel}`) })} confirmLabel={t("campaigns.send.confirm")}
        onConfirm={() => doSend.mutate()} onClose={() => setConfirmSend(false)} />
      <ConfirmDialog open={confirmDel} danger loading={del.isPending} title={t("campaigns.delete.title")} message={t("campaigns.delete.message")} confirmLabel={t("common.delete")} onConfirm={() => del.mutate()} onClose={() => setConfirmDel(false)} />
    </>
  );
}

function Progress({ camp, onCancel, cancelling }: { camp: CampaignFull; onCancel: () => void; cancelling: boolean }) {
  const { t } = useT(); const pct = progressOf(camp);
  return (
    <Card title={t("campaigns.progress")} actions={<StatusBadge s={camp.status} />}>
      <div data-testid="campaign-progress">
        <div className="h-2 w-full overflow-hidden rounded-full bg-hover" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><div className="h-full bg-brand-600 transition-all" style={{ width: `${pct}%` }} /></div>
        <p className="mt-2 text-sm tabular-nums">{t("campaigns.progress.stats", { sent: camp.sent, total: camp.total, failed: camp.failed, skipped: camp.skipped, pct })}</p>
        {camp.status === "sending" && <div className="mt-3"><Button variant="secondary" size="sm" loading={cancelling} onClick={onCancel}>{t("campaigns.cancel")}</Button><p className="mt-2 text-xs text-muted">{t("campaigns.progress.speed")}</p></div>}
        {camp.problems.length > 0 && (
          <div className="mt-4"><p className="mb-1 text-xs font-medium text-muted">{t("campaigns.problems")}</p>
            <ul className="space-y-1 text-xs">{camp.problems.map((p) => <li key={p.id} className="flex gap-2"><span className="font-mono">{p.to}</span><Badge tone={p.status === "failed" ? "danger" : "neutral"}>{p.error ?? p.status}</Badge></li>)}</ul></div>
        )}
      </div>
    </Card>
  );
}

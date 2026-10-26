import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Bold, Braces, CheckCircle2, Link2 } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, qs } from "../lib/api";
import { enumLabel } from "../lib/format";
import { tNow, useT } from "../i18n";
import { HelpTip } from "../components/help/HelpTip";
import { TermText } from "../components/TermText";
import { useAdmin } from "../lib/auth";
import { clearDraft, describeSendError, emptyDraft, loadDraft, saveDraft, unresolvedPlaceholders } from "../lib/mail";
import type { ComposeDraft, SendFailure } from "../lib/mail";
import type { Paged } from "../lib/types";
import type { InvoiceRow } from "../lib/invoices";
import { Typeahead } from "../components/Typeahead";
import { Button, Card, Field, inputClass, Loading, Modal, PageHeader, SelectField, TextField, useDebounced, useToast } from "../components/ui";
import { warningMessage } from "../lib/mail";

interface Template { id: string; event: string; lang: "tr" | "en"; subject: string; body: string; isDefault: boolean }
interface TemplatesRes { items: Template[]; variables: string[]; note: string }
interface PreviewRes { subject: string; html: string; text: string; from: string; fromName: string; warnings: { code: string; message: string }[] }
interface CustomerItem { id: string; name: string; email: string }

const SUBJECT_MAX = 200;

/** Initial state: URL prefill wins, otherwise the per-tab sessionStorage draft. */
function initialDraft(sp: URLSearchParams): ComposeDraft {
  const fromQuery = ["to", "orderId", "customerId", "manualInvoiceId", "subject"].some((k) => sp.get(k));
  if (fromQuery) return { ...emptyDraft(), to: sp.get("to") ?? "", subject: sp.get("subject") ?? "", orderId: sp.get("orderId") ?? undefined, customerId: sp.get("customerId") ?? undefined, manualInvoiceId: sp.get("manualInvoiceId") ?? undefined };
  return loadDraft() ?? emptyDraft();
}

export default function EmailCompose() {
  const { t, tp } = useT();
  const [sp] = useSearchParams();
  const admin = useAdmin(); const toast = useToast(); const qc = useQueryClient();
  const canSend = admin?.role !== "staff";
  const [d, setD] = useState<ComposeDraft>(() => initialDraft(sp));
  const [showConfirm, setShowConfirm] = useState(false);
  const [failure, setFailure] = useState<SendFailure | null>(null);
  const [sent, setSent] = useState<{ id: string; provider: string } | null>(null);
  const [tplEvent, setTplEvent] = useState(""); const [tplLang, setTplLang] = useState<"tr" | "en">("tr");
  const [linkOpen, setLinkOpen] = useState(false); const [linkUrl, setLinkUrl] = useState("https://");
  const area = useRef<HTMLTextAreaElement>(null);
  const [toSearch, setToSearch] = useState(false);

  useEffect(() => { if (!sent) saveDraft(d); }, [d, sent]);
  const set = (p: Partial<ComposeDraft>) => setD((x) => ({ ...x, ...p }));

  const tpls = useQuery({ queryKey: ["email-templates"], queryFn: () => api.get<TemplatesRes>("/api/admin/emails/templates"), staleTime: 60_000 });
  const issued = useQuery({ queryKey: ["manual-invoices", "issued-for-mail"], queryFn: () => api.get<Paged<InvoiceRow>>(`/api/admin/manual-invoices${qs({ status: "issued", pageSize: 50 })}`) });
  const events = useMemo(() => [...new Set((tpls.data?.items ?? []).map((t) => t.event))], [tpls.data]);

  const unresolved = unresolvedPlaceholders(d.subject, d.body);
  const badLink = linkUrl.trim() !== "" && !/^https:\/\/[^\s]+\.[^\s]+$/i.test(linkUrl.trim());
  const subjectBad = /[\r\n]/.test(d.subject);
  const emailOk = /^[^@\s,;<>"]+@[^@\s,;<>"]+\.[^@\s,;<>"]+$/;
  const toOk = emailOk.test(d.to.trim());
  const ccBad = d.cc.trim() !== "" && !emailOk.test(d.cc.trim());
  const rtBad = d.replyTo.trim() !== "" && !emailOk.test(d.replyTo.trim());
  const ready = toOk && !ccBad && !rtBad && d.subject.trim() !== "" && !subjectBad && d.body.trim() !== "" && unresolved.length === 0;

  const dPrev = useDebounced(JSON.stringify({ subject: d.subject, body: d.body, manualInvoiceId: d.manualInvoiceId || undefined }), 500);
  const hasContent = d.subject.trim() !== "" && d.body.trim() !== "" && !subjectBad;
  const preview = useQuery({ queryKey: ["email-preview", dPrev], enabled: hasContent, placeholderData: (p) => p, staleTime: 5_000, retry: false, queryFn: () => api.post<PreviewRes>("/api/admin/emails/preview", JSON.parse(dPrev)) });

  const send = useMutation({
    mutationFn: () => api.post<{ id: string; status: string; provider: string }>("/api/admin/emails", {
      to: d.to.trim(), ...(d.cc.trim() ? { cc: d.cc.trim() } : {}), ...(d.replyTo.trim() ? { replyTo: d.replyTo.trim() } : {}), subject: d.subject, body: d.body,
      ...(d.orderId ? { orderId: d.orderId } : {}), ...(d.customerId ? { customerId: d.customerId } : {}), ...(d.manualInvoiceId ? { manualInvoiceId: d.manualInvoiceId } : {}),
    }),
    onSuccess: (r) => { setSent({ id: r.id, provider: r.provider }); setFailure(null); setShowConfirm(false); clearDraft(); qc.invalidateQueries({ queryKey: ["emails"] }); toast.success(t("emails.toast.sent")); },
    onError: (e) => { setFailure(describeSendError(e)); qc.invalidateQueries({ queryKey: ["emails"] }); },
  });

  /** Edit the textarea selection without losing undo-friendly caret placement. */
  function edit(fn: (sel: string) => { text: string; select?: [number, number] }) {
    const el = area.current; if (!el) return;
    const a = el.selectionStart, b = el.selectionEnd; const r = fn(d.body.slice(a, b));
    const next = d.body.slice(0, a) + r.text + d.body.slice(b);
    set({ body: next });
    requestAnimationFrame(() => { el.focus(); const [s, e] = r.select ?? [a + r.text.length, a + r.text.length]; el.setSelectionRange(a + s, a + e); });
  }
  const bold = () => edit((sel) => { const w = t("emails.toolbar.boldText"); return sel ? { text: `**${sel}**` } : { text: `**${w}**`, select: [2, 2 + w.length] }; });
  const insertStore = () => edit(() => ({ text: "{{storeName}}" }));
  const insertLink = () => { if (badLink || !linkUrl.trim()) return; const u = linkUrl.trim(); edit(() => ({ text: u })); setLinkOpen(false); setLinkUrl("https://"); };
  const applyTemplate = () => {
    const tpl = tpls.data?.items.find((x) => x.event === tplEvent && x.lang === tplLang); if (!tpl) return;
    set({ subject: tpl.subject.replace(/[\r\n]+/g, " "), body: tpl.body }); toast.info(t("emails.templates.applied"));
  };

  if (sent) {
    return (
      <>
        <PageHeader title={t("emails.compose.title")} guide="email#e-posta-yazma" />
        <Card><div className="py-8 text-center">
          <CheckCircle2 className="mx-auto text-success" size={40} />
          <p className="mt-3 text-lg font-semibold">{t("emails.sent.title")}</p>
          <p className="mt-1 text-sm text-muted">{t("emails.sent.body", { provider: enumLabel("provider", sent.provider) })}</p>
          <div className="mt-5 flex justify-center gap-2"><Link to="/emails"><Button>{t("emails.sent.viewLog")}</Button></Link><Button variant="secondary" onClick={() => { setSent(null); setD(emptyDraft()); }}>{t("emails.sent.another")}</Button></div>
        </div></Card>
      </>
    );
  }

  const pv = hasContent ? preview.data : undefined;
  const roleHint = canSend ? undefined : t("emails.staffSendHint");
  return (
    <>
      <PageHeader title={t("emails.compose.title")} description={t("emails.compose.description")} guide="email#e-posta-yazma"
        actions={<><Link to="/emails"><Button variant="ghost">{t("emails.compose.sentLog")}</Button></Link><Button disabled={!canSend || !ready} title={roleHint ?? (ready ? undefined : t("emails.compose.sendNotReady"))} onClick={() => { setFailure(null); setShowConfirm(true); }}>{t("emails.compose.send")}</Button></>} />
      {!canSend && <p role="alert" className="mb-4 rounded-lg border border-warn-line bg-warn-soft px-3 py-2 text-sm text-warn">{t("emails.compose.readOnly")}</p>}
      <p className="mb-4 flex items-start gap-1 text-xs text-muted"><span><TermText text={t("emails.compose.limits")} /></span><HelpTip id="emails.limits" /></p>
      <div className="grid items-start gap-6 xl:grid-cols-2">
        <div className="space-y-6">
          <Card title={t("emails.message.title")}>
            <div className="space-y-4">
              <div className="space-y-1.5">
              <div className="flex items-center gap-1"><span aria-hidden className="text-[13px] font-medium">{t("emails.message.to")}</span><HelpTip id="emails.to" /></div>
              <Typeahead<CustomerItem> hideLabel label={t("emails.message.to")} path="/api/admin/customer-lookup" type="email" value={d.to} onChange={(v) => { set({ to: v }); setToSearch(true); }} placeholder={t("emails.message.to.placeholder")} minChars={2}
                hint={d.to && !toOk && !toSearch ? undefined : t("emails.message.to.hint")} inputProps={{ "aria-invalid": (d.to !== "" && !toOk) || undefined, inputMode: "email" }}
                render={(c) => <><span className="font-medium">{c.name}</span> <span className="text-muted">{c.email}</span></>}
                onPick={(c) => set({ to: c.email, customerId: c.id })} />
              </div>
              {d.to !== "" && !toOk && <p role="alert" className="-mt-2 text-xs text-danger">{t("emails.message.to.invalid")}</p>}
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField label={t("emails.message.cc")} type="email" help="emails.cc" hint={t("emails.message.cc.hint")} value={d.cc} error={ccBad ? t("emails.message.invalidAddress") : undefined} onChange={(e) => set({ cc: e.target.value })} />
                <TextField label={t("emails.message.replyTo")} type="email" help="emails.replyTo" value={d.replyTo} error={rtBad ? t("emails.message.invalidAddress") : undefined} hint={t("emails.message.replyTo.hint")} onChange={(e) => set({ replyTo: e.target.value })} />
              </div>
              <TextField label={t("emails.message.subject")} help="emails.subject" value={d.subject} maxLength={SUBJECT_MAX} error={subjectBad ? t("emails.message.subjectBreaks") : undefined}
                hint={<span className="tabular-nums" aria-live="off">{d.subject.length} / {SUBJECT_MAX}</span>}
                onChange={(e) => set({ subject: e.target.value.replace(/[\r\n]+/g, " ") })} onPaste={(e) => { const t = e.clipboardData.getData("text"); if (/[\r\n]/.test(t)) { e.preventDefault(); set({ subject: (d.subject + t).replace(/[\r\n]+/g, " ").slice(0, SUBJECT_MAX) }); } }} />
              <Field label={t("emails.message.body")} htmlFor="compose-body" help="emails.body" hint={t("emails.message.body.hint")}>
                <div className="overflow-hidden rounded-lg border border-line focus-within:border-brand-600 focus-within:ring-4 focus-within:ring-brand-600/15">
                  <div role="toolbar" aria-label={t("emails.toolbar.label")} className="flex flex-wrap items-center gap-1 border-b border-line bg-canvas px-2 py-1.5">
                    <Button size="sm" variant="ghost" onClick={bold} aria-label={t("emails.toolbar.bold")}><Bold size={14} />{t("emails.toolbar.bold")}</Button>
                    <Button size="sm" variant="ghost" onClick={() => setLinkOpen((o) => !o)} aria-expanded={linkOpen} aria-label={t("emails.toolbar.linkAria")}><Link2 size={14} />{t("emails.toolbar.link")}</Button>
                    <Button size="sm" variant="ghost" onClick={insertStore} aria-label={t("emails.toolbar.storeAria")}><Braces size={14} />{"{{storeName}}"}</Button>
                  </div>
                  {linkOpen && (
                    <div className="flex flex-wrap items-center gap-2 border-b border-line bg-canvas px-2 py-2">
                      <input aria-label={t("emails.toolbar.linkUrl")} aria-invalid={badLink || undefined} className={`${inputClass} !h-8 max-w-sm flex-1`} value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); insertLink(); } }} />
                      <Button size="sm" onClick={insertLink} disabled={badLink || linkUrl.trim() === "https://"}>{t("emails.toolbar.insert")}</Button>
                      {badLink && <span role="alert" className="text-xs text-danger">{t("emails.toolbar.httpsOnly")}</span>}
                    </div>
                  )}
                  <textarea id="compose-body" ref={area} value={d.body} maxLength={20000} onChange={(e) => set({ body: e.target.value })} rows={14} className="block min-h-72 w-full resize-y bg-surface px-3 py-2.5 text-sm text-ink outline-none placeholder:text-faint dark:bg-canvas" placeholder={t("emails.message.body.placeholder")} />
                </div>
              </Field>
              <p className="text-xs text-muted">{t("emails.placeholderNote").split("%code%").flatMap((part, i) => (i === 0 ? [part] : [<code key={i} className="rounded bg-hover px-1">{"{{storeName}}"}</code>, part]))}</p>
              {unresolved.length > 0 && (
                <div role="alert" data-testid="placeholder-warning" className="flex gap-2 rounded-lg border border-warn-line bg-warn-soft px-3 py-2 text-sm text-warn">
                  <AlertTriangle size={16} className="mt-0.5 shrink-0" /><p>{tp("emails.unresolved", unresolved.length, { list: unresolved.map((u) => `{{${u}}}`).join(", ") })}</p>
                </div>
              )}
            </div>
          </Card>
          <Card title={t("emails.templates.title")}>
            <div className="grid gap-4 sm:grid-cols-3">
              <SelectField label={t("emails.templates.event")} help="emails.templateEvent" value={tplEvent} onChange={(e) => setTplEvent(e.target.value)}><option value="">{t("emails.templates.event.choose")}</option>{events.map((ev) => <option key={ev} value={ev}>{enumLabel("notificationEvent", ev.replace(/\./g, "_"))}</option>)}</SelectField>
              <SelectField label={t("emails.templates.language")} help="emails.templateLang" value={tplLang} onChange={(e) => setTplLang(e.target.value as "tr" | "en")}><option value="tr">{t("common.lang.tr")}</option><option value="en">{t("common.lang.en")}</option></SelectField>
              <div className="flex items-end"><Button variant="secondary" disabled={!tplEvent} onClick={applyTemplate} className="w-full">{t("emails.templates.apply")}</Button></div>
            </div>
            <p className="mt-2 text-xs text-muted">{t("emails.templates.note")}</p>
            <div className="mt-4">
              <SelectField label={t("emails.attach.label")} help="emails.attachInvoice" value={d.manualInvoiceId ?? ""} onChange={(e) => set({ manualInvoiceId: e.target.value || undefined })} hint={t("emails.attach.hint")}>
                <option value="">{t("emails.attach.none")}</option>
                {d.manualInvoiceId && !issued.data?.items.some((i) => i.id === d.manualInvoiceId) && <option value={d.manualInvoiceId}>{t("emails.attach.fallback", { id: d.manualInvoiceId.slice(0, 8) })}</option>}
                {(issued.data?.items ?? []).map((i) => <option key={i.id} value={i.id}>{i.number ?? i.id.slice(0, 8)} - {i.customerName}</option>)}
              </SelectField>
            </div>
            {(d.orderId || d.customerId) && <p className="mt-3 text-xs text-muted">{t(d.orderId && d.customerId ? "emails.linked.both" : d.orderId ? "emails.linked.order" : "emails.linked.customer").split("{order}").flatMap((part, i) => (i === 0 ? [part] : [<Link key={i} className="text-brand-ink underline" to={`/orders/${d.orderId}`}>{t("emails.linked.orderWord")}</Link>, part]))}</p>}
          </Card>
        </div>
        <Card title={t("emails.preview.title")} className="xl:sticky xl:top-20">
          {!hasContent ? <p className="py-10 text-center text-sm text-muted">{t("emails.preview.empty")}</p> : !pv ? (preview.isError ? <p role="alert" className="text-sm text-danger">{t("emails.preview.unavailable")}</p> : <Loading label={t("emails.preview.rendering")} />) : (
            <div className="space-y-3">
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                <dt className="text-muted">{t("emails.preview.from")}</dt><dd data-testid="preview-from">{pv.fromName ? `${pv.fromName} <${pv.from}>` : pv.from}</dd>
                <dt className="text-muted">{t("emails.preview.subject")}</dt><dd className="break-words font-medium">{pv.subject}</dd>
              </dl>
              {pv.warnings.length > 0 && <ul className="space-y-1">{pv.warnings.map((w, i) => <li key={i} className="rounded-lg border border-warn-line bg-warn-soft px-3 py-1.5 text-xs text-warn">{warningMessage(w)}</li>)}</ul>}
              {/* sandbox="" = no scripts, no forms, no same-origin: the server HTML is rendered inert. */}
              <iframe title={t("emails.preview.frameTitle")} sandbox="" srcDoc={pv.html} className="h-[34rem] w-full rounded-lg border border-line bg-white" />
            </div>
          )}
        </Card>
      </div>

      <Modal open={showConfirm} onClose={() => setShowConfirm(false)} title={t("emails.confirm.title")}
        footer={<><Button variant="ghost" onClick={() => setShowConfirm(false)}>{t("emails.confirm.cancel")}</Button><Button loading={send.isPending} onClick={() => send.mutate()}>{failure ? t("emails.confirm.retry") : t("emails.confirm.send")}</Button></>}>
        <div className="space-y-3 text-sm">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
            <dt className="text-muted">{t("emails.confirm.to")}</dt><dd className="break-all font-medium">{d.to}</dd>
            {d.cc && <><dt className="text-muted">{t("emails.confirm.cc")}</dt><dd className="break-all">{d.cc}</dd></>}
            <dt className="text-muted">{t("emails.confirm.subject")}</dt><dd className="break-words">{d.subject}</dd>
            {d.manualInvoiceId && <><dt className="text-muted">{t("emails.confirm.invoice")}</dt><dd>{t("emails.confirm.linkAttached")}</dd></>}
          </dl>
          <p role="note" className="rounded-lg border border-warn-line bg-warn-soft px-3 py-2 text-warn">{t("emails.confirm.consequences")}</p>
          {failure && (
            <div role="alert" className="space-y-2 rounded-lg border border-danger-line bg-danger-soft p-3 text-danger">
              <p>{failure.message}{failure.link && <> <Link className="font-semibold underline" to={failure.link.to}>{failure.link.label}</Link></>}</p>
              {failure.hint && <p className="text-xs">{failure.hint}</p>}
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}

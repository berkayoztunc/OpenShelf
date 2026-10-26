import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  DEFAULT_TEMPLATES, NOTIFICATION_EVENTS, SAMPLE_VARS, TEMPLATE_VARS, pickTemplate, renderEmailHtml, renderSms, renderSubject, smsInfo, unknownTemplateVars,
  type NotificationEvent, type NotificationLang, type SettingsOf,
} from "@openshelf/shared";
import { api, errMsg } from "../../lib/api";
import { useGroupForm } from "../../lib/settings";
import { Badge, Button, Card, Field, inputClass, SelectField, TextField, useToast } from "../../components/ui";
import { HelpTip } from "../../components/help/HelpTip";
import { useT } from "../../i18n";
import { enumLabel } from "../../lib/format";
import { TermStrip } from "./TermStrip";
import { SettingsForm } from "./SaveBar";

const eventLabel = (e: NotificationEvent) => enumLabel("notificationEvent", e);
type Draft = SettingsOf<"notifications">;

export default function Notifications() {
  const { t, tp, td } = useT();
  const { query, draft, patch, errors, save, dirty } = useGroupForm("notifications");
  const toast = useToast();
  const [lang, setLang] = useState<NotificationLang>("tr");
  const [event, setEvent] = useState<NotificationEvent>("order_paid");
  const [testChannel, setTestChannel] = useState<"sms" | "email">("email");
  const [testTo, setTestTo] = useState("");
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const test = useMutation({
    mutationFn: () => api.post<{ ok: boolean; provider: string }>("/api/admin/notifications/test", { channel: testChannel, to: testTo.trim(), lang }),
    onSuccess: (r) => toast.success(t("settings.notif.test.sent", { provider: enumLabel("provider", r.provider) })),
    onError: (e) => toast.error(errMsg(e)),
  });

  const setEvt = (e: NotificationEvent, ch: "sms" | "email", v: boolean) =>
    patch({ events: { ...draft!.events, [e]: { ...draft!.events[e], [ch]: v } } } as Partial<Draft>);
  const cur = draft ? pickTemplate(draft.templates[lang], lang, event) : { subject: "", body: "" };
  const setTpl = (p: Partial<{ subject: string; body: string }>) =>
    patch({ templates: { ...draft!.templates, [lang]: { ...draft!.templates[lang], [event]: { ...cur, ...p } } } } as Partial<Draft>);
  const insertVar = (v: string) => {
    const el = bodyRef.current; const tok = `{{${v}}}`;
    if (!el) return setTpl({ body: cur.body + tok });
    const s = el.selectionStart ?? cur.body.length; const e = el.selectionEnd ?? s;
    setTpl({ body: cur.body.slice(0, s) + tok + cur.body.slice(e) });
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(s + tok.length, s + tok.length); });
  };
  const vars = SAMPLE_VARS[lang];
  const smsText = renderSms(cur.body, vars);
  const info = smsInfo(smsText);
  const bad = [...unknownTemplateVars(cur.subject), ...unknownTemplateVars(cur.body)];

  return (
    <SettingsForm query={query} ready={!!draft} onSave={() => save.mutate()} saving={save.isPending} dirty={dirty}>
      {draft && <>
        <Card title={<span className="inline-flex items-center gap-1">{t("settings.notif.channels.title")}<HelpTip id="settings.notifChannels" /></span>}>
          <p className="mb-3 text-sm text-muted">{t("settings.notif.channels.intro")}</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-muted"><th className="py-2 pr-4 font-medium">{t("settings.notif.col.event")}</th><th className="px-3 font-medium">{t("settings.notif.col.sms")}</th><th className="px-3 font-medium">{t("settings.notif.col.email")}</th></tr></thead>
              <tbody>{NOTIFICATION_EVENTS.map((e) => (
                <tr key={e} className="border-t border-line">
                  <td className="py-2 pr-4"><span className="font-medium">{eventLabel(e)}</span><span className="block text-xs text-muted">{td(`settings.notif.when.${e}`)}</span></td>
                  <td className="px-3"><input type="checkbox" aria-label={t("settings.notif.cell.sms", { event: eventLabel(e) })} checked={draft.events[e].sms} onChange={(ev) => setEvt(e, "sms", ev.target.checked)} /></td>
                  <td className="px-3"><input type="checkbox" aria-label={t("settings.notif.cell.email", { event: eventLabel(e) })} checked={draft.events[e].email} onChange={(ev) => setEvt(e, "email", ev.target.checked)} /></td>
                </tr>))}</tbody>
            </table>
          </div>
        </Card>

        <Card title={t("settings.notif.card.sender")}>
          <TermStrip ids={["smsheader", "e164", "ratelimit"]} />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label={t("settings.notif.fromName.label")} hint={t("settings.notif.fromName.hint")} help="settings.fromName" value={draft.fromName} error={errors.fromName} onChange={(e) => patch({ fromName: e.target.value })} />
            <TextField label={t("settings.notif.fromEmail.label")} help="settings.fromEmail" type="email" value={draft.fromEmail ?? ""} error={errors.fromEmail} hint={t("settings.notif.fromEmail.hint")} onChange={(e) => patch({ fromEmail: e.target.value })} />
            <TextField label={t("settings.notif.smsSender.label")} help="settings.smsSender" maxLength={11} value={draft.smsSenderId} error={errors.smsSenderId} hint={t("settings.notif.smsSender.hint")} onChange={(e) => patch({ smsSenderId: e.target.value })} />
            <span />
            <TextField label={t("settings.notif.adminEmail.label")} help="settings.adminEmail" type="email" value={draft.adminEmail ?? ""} error={errors.adminEmail} hint={t("settings.notif.adminEmail.hint")} onChange={(e) => patch({ adminEmail: e.target.value })} />
            <TextField label={t("settings.notif.smsCountries.label")} help="settings.smsCountries" value={(draft.smsAllowedCountries ?? []).join(", ")} error={errors.smsAllowedCountries} hint={t("settings.notif.smsCountries.hint")}
              onChange={(e) => patch({ smsAllowedCountries: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) } as Partial<Draft>)} />
            <span />
            <TextField label={t("settings.notif.smsCap.label")} help="settings.smsCap" type="number" min={0} value={String(draft.smsDailyCapPerPhone ?? 3)} error={errors.smsDailyCapPerPhone} hint={t("settings.notif.cap.hint")}
              onChange={(e) => patch({ smsDailyCapPerPhone: Math.max(0, Math.floor(Number(e.target.value) || 0)) } as Partial<Draft>)} />
            <TextField label={t("settings.notif.emailCap.label")} type="number" min={0} value={String(draft.emailDailyCapPerAddress ?? 5)} error={errors.emailDailyCapPerAddress} hint={t("settings.notif.cap.hint")}
              onChange={(e) => patch({ emailDailyCapPerAddress: Math.max(0, Math.floor(Number(e.target.value) || 0)) } as Partial<Draft>)} />
            <TextField label={t("settings.notif.adminPhone.label")} help="settings.adminPhone" placeholder={t("settings.notif.adminPhone.placeholder")} value={draft.adminPhone ?? ""} error={errors.adminPhone} hint={t("settings.notif.adminPhone.hint")} onChange={(e) => patch({ adminPhone: e.target.value })} />
          </div>
        </Card>

        <Card title={<span className="inline-flex items-center gap-1">{t("settings.notif.card.templates")}<HelpTip id="settings.templates" /></span>}>
          <TermStrip ids={["templatevar"]} />
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField label={t("settings.notif.tpl.lang")} value={lang} onChange={(e) => setLang(e.target.value as NotificationLang)}><option value="tr">{t("common.lang.tr")}</option><option value="en">{t("common.lang.en")}</option></SelectField>
            <SelectField label={t("settings.notif.tpl.event")} hint={td(`settings.notif.when.${event}`)} value={event} onChange={(e) => setEvent(e.target.value as NotificationEvent)}>{NOTIFICATION_EVENTS.map((e) => <option key={e} value={e}>{eventLabel(e)}</option>)}</SelectField>
          </div>
          <div className="mt-4 space-y-4">
            <TextField label={t("settings.notif.tpl.subject")} value={cur.subject} maxLength={200} onChange={(e) => setTpl({ subject: e.target.value })} />
            <Field label={t("settings.notif.tpl.body")} htmlFor="notif-body">
              <textarea id="notif-body" ref={bodyRef} className={`${inputClass} min-h-32`} rows={6} maxLength={2000} value={cur.body} onChange={(e) => setTpl({ body: e.target.value })} />
            </Field>
            <div className="flex flex-wrap items-center gap-2" aria-label={t("settings.notif.tpl.vars")}>
              {TEMPLATE_VARS.map((v) => <button key={v} type="button" title={td(`settings.notif.var.${v}`)} onClick={() => insertVar(v)} className="rounded-full border border-line px-2.5 py-1 text-xs hover:bg-hover">{`{{${v}}}`}</button>)}
              <Button size="sm" variant="ghost" onClick={() => setTpl(DEFAULT_TEMPLATES[lang][event])}>{t("settings.notif.tpl.reset")}</Button>
            </div>
            <ul className="grid gap-x-6 gap-y-1 text-xs text-muted sm:grid-cols-2">{TEMPLATE_VARS.map((v) => <li key={v}><code className="rounded bg-hover px-1 font-mono">{`{{${v}}}`}</code> {td(`settings.notif.var.${v}`)}</li>)}</ul>
            {bad.length > 0 && <p role="alert" className="text-xs text-danger">{t("settings.notif.tpl.unknown", { list: [...new Set(bad)].join(", ") })}</p>}
          </div>
        </Card>

        <Card title={t("settings.notif.card.preview")}>
          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <h3 className="mb-1 text-sm font-medium">{t("settings.notif.preview.sms")}</h3>
              <pre className="whitespace-pre-wrap rounded-xl border border-line bg-surface p-3 text-sm" data-testid="sms-preview">{smsText}</pre>
              <p className="mt-1 text-xs text-muted" data-testid="sms-counter">
                {tp("settings.notif.sms.counter", info.segments, { length: info.length, encoding: info.encoding })}{" "}
                {info.segments > 1 && <Badge tone="warning">{t("settings.notif.sms.multi")}</Badge>}{" "}
                {info.encoding === "UCS-2" && <Badge tone="neutral">{t("settings.notif.sms.nonGsm")}</Badge>}
              </p>
            </div>
            <div>
              <h3 className="mb-1 text-sm font-medium">{t("settings.notif.preview.email")}</h3>
              <p className="mb-1 text-sm"><strong>{t("settings.notif.preview.subject")}</strong> {renderSubject(cur.subject, vars)}</p>
              <iframe title={t("settings.notif.preview.iframe")} sandbox="" className="h-64 w-full rounded-xl border border-line bg-white" srcDoc={renderEmailHtml(cur.body, vars, vars.storeName)} />
            </div>
          </div>
        </Card>

        <Card title={<span className="inline-flex items-center gap-1">{t("settings.notif.card.test")}<HelpTip id="settings.testSend" /></span>}>
          <div className="grid gap-4 sm:grid-cols-[10rem_1fr_auto] sm:items-end">
            <SelectField label={t("settings.notif.test.channel")} value={testChannel} onChange={(e) => setTestChannel(e.target.value as "sms" | "email")}><option value="email">{enumLabel("channel", "email")}</option><option value="sms">{enumLabel("channel", "sms")}</option></SelectField>
            <TextField label={testChannel === "sms" ? t("settings.notif.test.phone") : t("settings.notif.test.email")} value={testTo} placeholder={testChannel === "sms" ? t("settings.notif.adminPhone.placeholder") : t("settings.notif.test.emailPlaceholder")} onChange={(e) => setTestTo(e.target.value)} />
            <Button loading={test.isPending} disabled={!testTo.trim()} onClick={() => test.mutate()}>{t("settings.notif.test.send")}</Button>
          </div>
          <p className="mt-2 text-xs text-muted">{t("settings.notif.test.note")}</p>
        </Card>
      </>}
    </SettingsForm>
  );
}


import { useState } from "react";
import { Link } from "react-router-dom";
import QRCode from "qrcode";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ROLES } from "@openshelf/shared";
import { api, errMsg } from "../lib/api";
import { useAdmin, useMe } from "../lib/auth";
import { enumLabel } from "../lib/format";
import { useT } from "../i18n";
import type { AdminUser } from "../lib/types";
import { Badge, Button, Card, ConfirmDialog, ErrorState, Loading, Modal, PageHeader, SelectField, Table, Td, TextField, useToast } from "../components/ui";
import { HelpTip } from "../components/help/HelpTip";
import { TermStrip } from "./settings/TermStrip";

/** Card title with a "?" explanation next to it. */
const TitleWithHelp = ({ title, help, guide }: { title: string; help: string; guide?: string }) => <span className="inline-flex items-center gap-1">{title}<HelpTip id={help} guide={guide} /></span>;

function Password() {
  const { t } = useT();
  const toast = useToast();
  const [f, setF] = useState({ current: "", next: "", confirm: "" });
  const m = useMutation({
    mutationFn: () => api.post("/api/admin/auth/password", { current: f.current, next: f.next }),
    onSuccess: () => { setF({ current: "", next: "", confirm: "" }); toast.success(t("security.password.changed")); }, onError: (e) => toast.error(errMsg(e)),
  });
  const mismatch = f.confirm !== "" && f.next !== f.confirm;
  return (
    <Card title={<TitleWithHelp title={t("security.password.title")} help="security.password" />}>
      <p className="mb-4 max-w-prose text-sm text-muted">{t("security.password.intro")}</p>
      <form className="max-w-sm space-y-4" onSubmit={(e) => { e.preventDefault(); if (!mismatch && f.next.length >= 12) m.mutate(); }}>
        <TextField label={t("security.password.current")} type="password" autoComplete="current-password" required value={f.current} onChange={(e) => setF({ ...f, current: e.target.value })} />
        <TextField label={t("security.password.next")} type="password" autoComplete="new-password" minLength={12} required hint={t("security.password.nextHint")} value={f.next} onChange={(e) => setF({ ...f, next: e.target.value })} />
        <TextField label={t("security.password.confirm")} type="password" autoComplete="new-password" required error={mismatch ? t("security.password.mismatch") : undefined} value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} />
        <Button type="submit" loading={m.isPending} disabled={mismatch || f.next.length < 12}>{t("security.password.submit")}</Button>
      </form>
    </Card>
  );
}

function Totp() {
  const { t } = useT();
  const admin = useAdmin(); const me = useMe(); const toast = useToast();
  const [setup, setSetup] = useState<{ secret: string; qr: string } | null>(null);
  const [code, setCode] = useState("");
  const [dis, setDis] = useState<{ password: string; code: string } | null>(null);
  const refresh = () => me.refetch();

  const start = useMutation({
    mutationFn: async () => { const r = await api.post<{ secret: string; otpauthUrl: string }>("/api/admin/auth/mfa/setup"); return { secret: r.secret, qr: await QRCode.toDataURL(r.otpauthUrl, { margin: 1, width: 192 }) }; },
    onSuccess: setSetup, onError: (e) => toast.error(errMsg(e)),
  });
  const enable = useMutation({
    mutationFn: () => api.post("/api/admin/auth/mfa/enable", { code }),
    onSuccess: () => { setSetup(null); setCode(""); refresh(); toast.success(t("security.totp.enabledToast")); }, onError: (e) => toast.error(errMsg(e)),
  });
  const disable = useMutation({
    mutationFn: () => api.post("/api/admin/auth/mfa/disable", dis),
    onSuccess: () => { setDis(null); refresh(); toast.success(t("security.totp.disabledToast")); }, onError: (e) => toast.error(errMsg(e)),
  });

  return (
    <Card title={<TitleWithHelp title={t("security.totp.title")} help="security.totp" />} actions={<Badge tone={admin?.totpEnabled ? "success" : "neutral"}>{admin?.totpEnabled ? t("security.totp.enabled") : t("security.totp.disabled")}</Badge>}>
      <p className="mb-4 max-w-prose text-sm text-muted">{t("security.totp.intro")}</p>
      <TermStrip ids={["totp"]} />
      {admin?.totpEnabled ? <Button variant="danger" onClick={() => setDis({ password: "", code: "" })}>{t("security.totp.disableButton")}</Button> :
        setup ? (
          <div className="space-y-4">
            <ol className="max-w-prose space-y-1 text-sm text-muted">
              <li>{t("security.totp.step1")}</li><li>{t("security.totp.step2")}</li><li>{t("security.totp.step3")}</li>
            </ol>
            <p className="sr-only">{t("security.totp.scan")}</p>
            <img src={setup.qr} alt={t("security.totp.qrAlt")} width={192} height={192} className="rounded-xl border border-line bg-white" />
            <details className="text-sm"><summary className="cursor-pointer text-muted">{t("security.totp.manual")}</summary><code className="mt-1 block break-all">{setup.secret}</code></details>
            <p role="note" className="max-w-prose rounded-lg border border-warn-line bg-warn-soft p-3 text-xs text-warn">{t("security.totp.recovery")}</p>
            <form className="flex max-w-sm items-end gap-3" onSubmit={(e) => { e.preventDefault(); enable.mutate(); }}>
              <TextField label={t("security.totp.code")} help="security.code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
              <Button type="submit" loading={enable.isPending} disabled={code.length !== 6}>{t("security.totp.enable")}</Button>
              <Button variant="ghost" onClick={() => { setSetup(null); setCode(""); }}>{t("common.cancel")}</Button>
            </form>
          </div>
        ) : <Button loading={start.isPending} onClick={() => start.mutate()}>{t("security.totp.setupButton")}</Button>}
      <Modal open={!!dis} onClose={() => setDis(null)} title={t("security.totp.disableTitle")}
        footer={<><Button variant="ghost" onClick={() => setDis(null)}>{t("common.cancel")}</Button><Button variant="danger" loading={disable.isPending} disabled={!dis?.password || dis?.code.length !== 6} onClick={() => disable.mutate()}>{t("security.totp.disableConfirm")}</Button></>}>
        {dis && <div className="space-y-3">
          <p role="alert" className="rounded-lg border border-warn-line bg-warn-soft p-3 text-sm text-warn">{t("security.totp.disableWarning")}</p>
          <TextField label={t("security.totp.password")} type="password" autoComplete="current-password" value={dis.password} onChange={(e) => setDis({ ...dis, password: e.target.value })} />
          <TextField label={t("security.totp.authCode")} help="security.code" inputMode="numeric" maxLength={6} value={dis.code} onChange={(e) => setDis({ ...dis, code: e.target.value.replace(/\D/g, "") })} />
        </div>}
      </Modal>
    </Card>
  );
}

function Sessions() {
  const { t } = useT();
  const toast = useToast(); const [ask, setAsk] = useState(false);
  const out = useMutation({ mutationFn: () => api.post("/api/admin/auth/logout-all"), onSuccess: () => { api.setCsrf(null); window.location.assign(`${import.meta.env.BASE_URL}login`); }, onError: (e) => { setAsk(false); toast.error(errMsg(e)); } });
  return (
    <Card title={<TitleWithHelp title={t("security.sessions.title")} help="security.sessions" />}>
      <p className="mb-3 text-sm text-muted">{t("security.sessions.body")}</p>
      <TermStrip ids={["session"]} />
      <Button variant="secondary" onClick={() => setAsk(true)}>{t("security.sessions.button")}</Button>
      <p className="mt-4 max-w-prose text-xs text-muted">{t("security.lockout.note")} <HelpTip id="security.lockout" /></p>
      <ConfirmDialog open={ask} title={t("security.sessions.confirmTitle")} message={t("security.sessions.confirmMessage")} confirmLabel={t("security.sessions.confirmAction")} loading={out.isPending} onConfirm={() => out.mutate()} onClose={() => setAsk(false)} />
    </Card>
  );
}

function Secrets() {
  const { t } = useT();
  return (
    <Card title={<TitleWithHelp title={t("security.secrets.title")} help="security.secrets" />}>
      <p className="max-w-prose text-sm text-muted">{t("security.secrets.body")}</p>
      <TermStrip ids={["secret", "apikey"]} />
      <Link to="/integrations" className="inline-flex h-9 items-center rounded-lg border border-line bg-surface px-4 text-sm font-medium transition hover:border-line-strong hover:bg-hover dark:bg-raised">{t("security.secrets.link")}</Link>
    </Card>
  );
}

function Users() {
  const { t } = useT();
  const qc = useQueryClient(); const toast = useToast(); const admin = useAdmin();
  const q = useQuery({ queryKey: ["admin-users"], queryFn: async () => { const r = await api.get<AdminUser[] | { items: AdminUser[] }>("/api/admin/users"); return Array.isArray(r) ? r : r.items; } });
  const [f, setF] = useState<{ email: string; name: string; password: string; role: string } | null>(null);
  const [del, setDel] = useState<AdminUser | null>(null);
  const inv = () => qc.invalidateQueries({ queryKey: ["admin-users"] });
  const create = useMutation({ mutationFn: () => api.post("/api/admin/users", f), onSuccess: () => { setF(null); inv(); toast.success(t("security.users.created")); }, onError: (e) => toast.error(errMsg(e)) });
  const patch = useMutation({ mutationFn: (p: { id: string; body: Partial<AdminUser> }) => api.patch(`/api/admin/users/${p.id}`, p.body), onSuccess: () => { inv(); toast.success(t("security.users.updated")); }, onError: (e) => toast.error(errMsg(e)) });
  const remove = useMutation({ mutationFn: (id: string) => api.del(`/api/admin/users/${id}`), onSuccess: () => { setDel(null); inv(); toast.success(t("security.users.deleted")); }, onError: (e) => toast.error(errMsg(e)) });
  const roleOptions = ROLES.filter((r) => r !== "owner").map((r) => <option key={r} value={r}>{enumLabel("role", r)}</option>);
  return (
    <Card title={<TitleWithHelp title={t("security.users.title")} help="security.users" />} actions={<Button size="sm" onClick={() => setF({ email: "", name: "", password: "", role: "admin" })}>{t("security.users.add")}</Button>}>
      <p className="mb-4 max-w-prose text-sm text-muted">{t("security.users.intro")}</p>
      {q.isPending ? <Loading /> : q.isError ? <ErrorState error={q.error} retry={() => q.refetch()} /> : (
        <Table head={[t("security.users.col.user"), t("security.users.col.role"), t("security.users.col.twofa"), t("security.users.col.status"), ""]} caption={t("security.users.caption")}>{q.data.map((u) => (
          <tr key={u.id}><Td>{u.name}<span className="block text-xs text-muted">{u.email}</span></Td>
            <Td>{u.id === admin?.id || u.role === "owner" ? <Badge tone="info">{enumLabel("role", u.role)}</Badge> : (
              <select aria-label={t("security.users.roleFor", { email: u.email })} className="rounded-xl border border-line bg-surface px-2 py-1 text-sm" value={u.role} onChange={(e) => patch.mutate({ id: u.id, body: { role: e.target.value as AdminUser["role"] } })}>{roleOptions}</select>)}</Td>
            <Td>{u.totpEnabled ? t("security.users.on") : t("security.users.off")}</Td><Td><Badge tone={u.disabled ? "danger" : "success"}>{u.disabled ? t("security.users.statusDisabled") : t("security.users.statusActive")}</Badge></Td>
            <Td className="text-right">{u.id !== admin?.id && u.role !== "owner" && <>
              <Button size="sm" variant="ghost" onClick={() => patch.mutate({ id: u.id, body: { disabled: !u.disabled } })}>{u.disabled ? t("security.users.enable") : t("security.users.disable")}</Button>
              <Button size="sm" variant="ghost" onClick={() => setDel(u)}>{t("security.users.delete")}</Button></>}</Td></tr>
        ))}</Table>
      )}
      <div className="mt-5 rounded-xl border border-line bg-canvas p-4 text-sm">
        <p className="mb-2 font-medium">{t("security.roles.title")}</p>
        <ul className="space-y-1.5 text-xs text-muted">
          <li>{t("security.roles.owner")}</li><li>{t("security.roles.admin")}</li><li>{t("security.roles.staff")}</li>
        </ul>
      </div>
      <Modal open={!!f} onClose={() => setF(null)} title={t("security.users.modalTitle")}
        footer={<><Button variant="ghost" onClick={() => setF(null)}>{t("common.cancel")}</Button><Button loading={create.isPending} disabled={!f?.email || !f?.name || (f?.password.length ?? 0) < 12} onClick={() => create.mutate()}>{t("security.users.create")}</Button></>}>
        {f && <div className="space-y-3">
          <TextField label={t("security.users.name")} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          <TextField label={t("security.users.email")} type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
          <TextField label={t("security.users.tempPassword")} help="security.tempPassword" type="password" autoComplete="new-password" hint={t("security.users.tempPasswordHint")} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
          <SelectField label={t("security.users.role")} help="security.role" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>{roleOptions}</SelectField>
        </div>}
      </Modal>
      <ConfirmDialog open={!!del} danger title={t("security.users.deleteTitle")} message={t("security.users.deleteMessage", { email: del?.email ?? "" })} confirmLabel={t("security.users.deleteAction")} loading={remove.isPending} onConfirm={() => del && remove.mutate(del.id)} onClose={() => setDel(null)} />
    </Card>
  );
}

export default function Security() {
  const { t } = useT();
  const admin = useAdmin();
  return (
    <>
      <PageHeader title={t("security.title")} description={t("security.description")} guide="security#iki-adimli-dogrulama" />
      <div className="space-y-6"><Password /><Totp /><Sessions />{admin?.role === "owner" && <Users />}<Secrets /></div>
    </>
  );
}

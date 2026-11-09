import { useState } from "react";
import { Copy } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, errMsg } from "../../lib/api";
import { dateTime } from "../../lib/format";
import { useAdmin } from "../../lib/auth";
import { useT } from "../../i18n";
import { Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, Loading, Modal, SelectField, Table, Tabs, Td, TextField, useToast } from "../../components/ui";
import McpTools from "./McpTools";

type Level = "read" | "write" | "full";
interface TokenRow { id: string; name: string; prefix: string; level: Level; createdAt: string | number; lastUsedAt: string | number | null; expiresAt: string | number | null; revokedAt: string | number | null }
interface Created extends TokenRow { token: string; mcpUrl: string }
const KEY = ["api-tokens"] as const;
const LEVEL_TONE = { read: "success", write: "warning", full: "danger" } as const;

export const claudeCommand = (url: string, token: string) => `claude mcp add --transport http openshelf ${url} --header "Authorization: Bearer ${token}"`;
export const jsonConfig = (url: string, token: string) => JSON.stringify({ mcpServers: { openshelf: { type: "http", url, headers: { Authorization: `Bearer ${token}` } } } }, null, 2);

function CopyBox({ label, value }: { label: string; value: string }) {
  const { t } = useT(); const toast = useToast();
  return (
    <div>
      <div className="mb-1 flex items-center justify-between"><span className="text-xs font-medium text-muted">{label}</span>
        <Button size="sm" variant="ghost" onClick={() => void navigator.clipboard?.writeText(value).then(() => toast.success(t("common.copied")))}><Copy size={13} />{t("common.copy")}</Button></div>
      <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-lg border border-line bg-canvas p-3 font-mono text-xs">{value}</pre>
    </div>
  );
}

/** Settings → MCP: personal access tokens for AI clients (Claude, etc.) that manage the store through the MCP endpoint. */
export default function ApiTokens() {
  const { t } = useT(); const [tab, setTab] = useState<"tokens" | "tools">("tokens"); const toast = useToast(); const qc = useQueryClient(); const admin = useAdmin();
  const [name, setName] = useState(""); const [level, setLevel] = useState<Level>("read"); const [days, setDays] = useState("90");
  const [created, setCreated] = useState<Created | null>(null); const [revoke, setRevoke] = useState<TokenRow | null>(null);
  const allowed = admin?.role === "owner" || admin?.role === "admin";
  const list = useQuery({ queryKey: KEY, queryFn: () => api.get<{ items: TokenRow[] }>("/api/admin/tokens"), enabled: allowed });
  const create = useMutation({
    mutationFn: () => api.post<Created>("/api/admin/tokens", { name, level, expiresInDays: days === "never" ? null : Number(days) }),
    onSuccess: (r) => { setCreated(r); setName(""); void qc.invalidateQueries({ queryKey: KEY }); },
    onError: (e) => toast.error(errMsg(e)),
  });
  const del = useMutation({
    mutationFn: (id: string) => api.del(`/api/admin/tokens/${id}`),
    onSuccess: () => { setRevoke(null); void qc.invalidateQueries({ queryKey: KEY }); toast.success(t("mcp.revoked")); },
    onError: (e) => { setRevoke(null); toast.error(errMsg(e)); },
  });
  if (!allowed) return <EmptyState title={t("mcp.forbidden.title")} description={t("mcp.forbidden.body")} />;
  const status = (r: TokenRow) => r.revokedAt ? <Badge tone="neutral">{t("mcp.status.revoked")}</Badge> : r.expiresAt && new Date(r.expiresAt).getTime() < Date.now() ? <Badge tone="warning">{t("mcp.status.expired")}</Badge> : <Badge tone="success">{t("mcp.status.active")}</Badge>;
  return (
    <div>
    <Tabs tabs={[{ id: "tokens" as const, label: t("mcp.tab.tokens") }, { id: "tools" as const, label: t("mcp.tab.tools") }]} value={tab} onChange={setTab} label={t("mcp.tab.label")} />
    {tab === "tools" ? <McpTools /> : (
    <div className="space-y-6">
      <Card title={t("mcp.about.title")}>
        <p className="max-w-prose text-sm text-muted">{t("mcp.about.body")}</p>
        <p className="mt-2 max-w-prose text-xs text-warn">{t("mcp.about.warn")}</p>
      </Card>
      <Card title={t("mcp.create.title")}>
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
          <TextField label={t("mcp.field.name")} hint={t("mcp.field.name.hint")} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
          <SelectField label={t("mcp.field.expiry")} value={days} onChange={(e) => setDays(e.target.value)}>
            <option value="30">{t("mcp.expiry.30")}</option><option value="90">{t("mcp.expiry.90")}</option><option value="365">{t("mcp.expiry.365")}</option><option value="never">{t("mcp.expiry.never")}</option>
          </SelectField>
          <div className="sm:col-span-2">
            <SelectField label={t("mcp.field.level")} value={level} onChange={(e) => setLevel(e.target.value as Level)} hint={t(`mcp.level.${level}.desc`)}>
              <option value="read">{t("mcp.level.read")}</option><option value="write">{t("mcp.level.write")}</option><option value="full">{t("mcp.level.full")}</option>
            </SelectField>
          </div>
          <div className="sm:col-span-2"><Button type="submit" loading={create.isPending} disabled={!name.trim()}>{t("mcp.create.action")}</Button></div>
        </form>
      </Card>
      <Card title={t("mcp.list.title")}>
        {list.isPending ? <Loading /> : list.isError ? <ErrorState error={list.error} retry={() => list.refetch()} /> : list.data.items.length === 0
          ? <EmptyState title={t("mcp.empty.title")} description={t("mcp.empty.body")} />
          : <Table caption={t("mcp.list.title")} head={[t("mcp.col.name"), t("mcp.col.level"), t("mcp.col.status"), t("mcp.col.lastUsed"), t("mcp.col.expires"), <span key="a" className="sr-only">{t("mcp.col.actions")}</span>]}>
            {list.data.items.map((r) => (
              <tr key={r.id} data-testid="token-row">
                <Td><span className="font-medium">{r.name}</span><span className="block font-mono text-xs text-muted">{r.prefix}…</span></Td>
                <Td><Badge tone={LEVEL_TONE[r.level]}>{t(`mcp.level.${r.level}`)}</Badge></Td>
                <Td>{status(r)}</Td>
                <Td className="whitespace-nowrap text-muted">{r.lastUsedAt ? dateTime(String(r.lastUsedAt)) : "-"}</Td>
                <Td className="whitespace-nowrap text-muted">{r.expiresAt ? dateTime(String(r.expiresAt)) : t("mcp.expiry.never")}</Td>
                <Td className="text-right">{!r.revokedAt && <Button size="sm" variant="danger" onClick={() => setRevoke(r)}>{t("mcp.revoke")}</Button>}</Td>
              </tr>
            ))}
          </Table>}
      </Card>
      <Modal open={!!created} wide onClose={() => setCreated(null)} title={t("mcp.created.title")} footer={<Button onClick={() => setCreated(null)}>{t("mcp.created.done")}</Button>}>
        {created && (
          <div className="space-y-4" data-testid="token-created">
            <p role="alert" className="rounded-lg border border-warn-line bg-warn-soft px-3 py-2 text-sm text-warn">{t("mcp.created.once")}</p>
            <CopyBox label={t("mcp.created.token")} value={created.token} />
            <CopyBox label={t("mcp.created.url")} value={created.mcpUrl} />
            <CopyBox label={t("mcp.created.claude")} value={claudeCommand(created.mcpUrl, created.token)} />
            <CopyBox label={t("mcp.created.json")} value={jsonConfig(created.mcpUrl, created.token)} />
          </div>
        )}
      </Modal>
      <ConfirmDialog open={!!revoke} danger loading={del.isPending} title={t("mcp.revoke.title")} message={t("mcp.revoke.message", { name: revoke?.name ?? "" })} confirmLabel={t("mcp.revoke")} onConfirm={() => revoke && del.mutate(revoke.id)} onClose={() => setRevoke(null)} />
    </div>
    )}
    </div>
  );
}

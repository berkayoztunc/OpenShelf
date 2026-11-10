import { useState } from "react";
import { Copy } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, errMsg } from "../../lib/api";
import { dateTime } from "../../lib/format";
import { useAdmin } from "../../lib/auth";
import { useT } from "../../i18n";
import { Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, Loading, Modal, Table, Td, TextField, useToast } from "../../components/ui";

interface Grant { id: string; client: string; kind: string | null; level: "read" | "write" | "full"; createdAt: string | number; lastUsedAt: string | number | null }
interface Client { clientId: string; name: string; kind: "dynamic" | "manual"; redirectUris: string[]; confidential: boolean; createdAt: string | number; lastUsedAt: string | number | null }
interface Created { clientId: string; clientSecret: string; name: string; redirectUris: string[] }
const GK = ["oauth-grants"] as const; const CK = ["oauth-clients"] as const;
const TONE = { read: "success", write: "warning", full: "danger" } as const;

function Copyable({ label, value }: { label: string; value: string }) {
  const { t } = useT(); const toast = useToast();
  return (
    <div><div className="mb-1 flex items-center justify-between"><span className="text-xs font-medium text-muted">{label}</span>
      <Button size="sm" variant="ghost" onClick={() => void navigator.clipboard?.writeText(value).then(() => toast.success(t("common.copied")))}><Copy size={13} />{t("common.copy")}</Button></div>
      <pre className="overflow-auto whitespace-pre-wrap break-all rounded-lg border border-line bg-canvas p-3 font-mono text-xs">{value}</pre></div>
  );
}

/** Settings → MCP → Apps: AI apps connected through OAuth (disconnect) and manually created OAuth clients (Client ID + secret). */
export default function OauthApps() {
  const { t } = useT(); const toast = useToast(); const qc = useQueryClient(); const admin = useAdmin();
  const owner = admin?.role === "owner";
  const grants = useQuery({ queryKey: GK, queryFn: () => api.get<{ items: Grant[] }>("/api/admin/oauth/grants") });
  const clients = useQuery({ queryKey: CK, queryFn: () => api.get<{ items: Client[] }>("/api/admin/oauth/clients") });
  const [name, setName] = useState(""); const [uri, setUri] = useState("");
  const [created, setCreated] = useState<Created | null>(null); const [drop, setDrop] = useState<Grant | null>(null); const [rmClient, setRmClient] = useState<Client | null>(null);
  const mcpUrl = `${window.location.origin}/mcp`;
  const disconnect = useMutation({ mutationFn: (id: string) => api.del(`/api/admin/oauth/grants/${id}`), onSuccess: () => { setDrop(null); void qc.invalidateQueries({ queryKey: GK }); toast.success(t("oauth.apps.disconnected")); }, onError: (e) => { setDrop(null); toast.error(errMsg(e)); } });
  const create = useMutation({
    mutationFn: () => api.post<Created>("/api/admin/oauth/clients", { name, redirectUris: uri.split(/[\s,]+/).filter(Boolean) }),
    onSuccess: (r) => { setCreated(r); setName(""); setUri(""); void qc.invalidateQueries({ queryKey: CK }); }, onError: (e) => toast.error(errMsg(e)),
  });
  const remove = useMutation({ mutationFn: (id: string) => api.del(`/api/admin/oauth/clients/${id}`), onSuccess: () => { setRmClient(null); void qc.invalidateQueries({ queryKey: CK }); void qc.invalidateQueries({ queryKey: GK }); toast.success(t("oauth.clients.deleted")); }, onError: (e) => { setRmClient(null); toast.error(errMsg(e)); } });
  return (
    <div className="space-y-6">
      <Card title={t("oauth.apps.howTitle")}>
        <ol className="max-w-prose list-decimal space-y-1 pl-5 text-sm text-muted"><li>{t("oauth.apps.how1")}</li><li>{t("oauth.apps.how2")}</li><li>{t("oauth.apps.how3")}</li></ol>
        <div className="mt-4"><Copyable label={t("oauth.apps.url")} value={mcpUrl} /></div>
      </Card>
      <Card title={t("oauth.apps.connected")}>
        {grants.isPending ? <Loading /> : grants.isError ? <ErrorState error={grants.error} retry={() => grants.refetch()} /> : grants.data.items.length === 0
          ? <EmptyState title={t("oauth.apps.empty.title")} description={t("oauth.apps.empty.body")} />
          : <Table caption={t("oauth.apps.connected")} head={[t("oauth.apps.col.app"), t("mcp.col.level"), t("oauth.apps.col.since"), t("mcp.col.lastUsed"), <span key="a" className="sr-only">{t("mcp.col.actions")}</span>]}>
            {grants.data.items.map((g) => (
              <tr key={g.id} data-testid="grant-row"><Td className="font-medium">{g.client}</Td><Td><Badge tone={TONE[g.level]}>{t(`mcp.level.${g.level}`)}</Badge></Td>
                <Td className="whitespace-nowrap text-muted">{dateTime(String(g.createdAt))}</Td><Td className="whitespace-nowrap text-muted">{g.lastUsedAt ? dateTime(String(g.lastUsedAt)) : "-"}</Td>
                <Td className="text-right"><Button size="sm" variant="danger" onClick={() => setDrop(g)}>{t("oauth.apps.disconnect")}</Button></Td></tr>
            ))}
          </Table>}
      </Card>
      <Card title={t("oauth.clients.title")}>
        <p className="mb-3 max-w-prose text-sm text-muted">{t("oauth.clients.body")}</p>
        {owner ? (
          <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
            <TextField label={t("oauth.clients.name")} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
            <TextField label={t("oauth.clients.redirect")} hint={t("oauth.clients.redirect.hint")} value={uri} onChange={(e) => setUri(e.target.value)} placeholder="https://…/callback" />
            <div className="sm:col-span-2"><Button type="submit" loading={create.isPending} disabled={!name.trim() || !uri.trim()}>{t("oauth.clients.create")}</Button></div>
          </form>
        ) : <p className="text-xs text-warn">{t("oauth.clients.ownerOnly")}</p>}
        {clients.data && clients.data.items.filter((c) => c.kind === "manual").length > 0 && (
          <div className="mt-5"><Table caption={t("oauth.clients.title")} head={[t("oauth.clients.name"), t("oauth.clients.id"), t("oauth.clients.redirect"), <span key="a" className="sr-only">{t("mcp.col.actions")}</span>]}>
            {clients.data.items.filter((c) => c.kind === "manual").map((c) => (
              <tr key={c.clientId} data-testid="client-row"><Td className="font-medium">{c.name}</Td><Td className="font-mono text-xs">{c.clientId}</Td><Td className="break-all text-xs">{c.redirectUris.join(", ")}</Td>
                <Td className="text-right">{owner && <Button size="sm" variant="danger" onClick={() => setRmClient(c)}>{t("common.delete")}</Button>}</Td></tr>
            ))}
          </Table></div>
        )}
      </Card>
      <Modal open={!!created} wide onClose={() => setCreated(null)} title={t("oauth.clients.created")} footer={<Button onClick={() => setCreated(null)}>{t("mcp.created.done")}</Button>}>
        {created && <div className="space-y-4" data-testid="client-created">
          <p role="alert" className="rounded-lg border border-warn-line bg-warn-soft px-3 py-2 text-sm text-warn">{t("oauth.clients.once")}</p>
          <Copyable label={t("oauth.clients.id")} value={created.clientId} /><Copyable label={t("oauth.clients.secret")} value={created.clientSecret} /><Copyable label={t("oauth.apps.url")} value={mcpUrl} />
        </div>}
      </Modal>
      <ConfirmDialog open={!!drop} danger loading={disconnect.isPending} title={t("oauth.apps.disconnect.title")} message={t("oauth.apps.disconnect.message", { app: drop?.client ?? "" })} confirmLabel={t("oauth.apps.disconnect")} onConfirm={() => drop && disconnect.mutate(drop.id)} onClose={() => setDrop(null)} />
      <ConfirmDialog open={!!rmClient} danger loading={remove.isPending} title={t("oauth.clients.delete.title")} message={t("oauth.clients.delete.message", { app: rmClient?.name ?? "" })} confirmLabel={t("common.delete")} onConfirm={() => rmClient && remove.mutate(rmClient.clientId)} onClose={() => setRmClient(null)} />
    </div>
  );
}

import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api, errMsg } from "../lib/api";
import { useAdmin } from "../lib/auth";
import { useT } from "../i18n";
import { Badge, Button, Card, ErrorState, Loading, SelectField } from "../components/ui";

type Level = "read" | "write" | "full";
const ORDER: Level[] = ["read", "write", "full"];
interface Info { client: { id: string; name: string; kind: "dynamic" | "manual"; neverUsed: boolean }; redirectUri: string; redirectHost: string; maxLevel: Level; scope: string | null }
const PARAMS = ["response_type", "client_id", "redirect_uri", "state", "code_challenge", "code_challenge_method", "scope", "resource"] as const;

/** Only ever navigate to the exact host the server validated (defence in depth against a tampered response). */
export const safeRedirect = (target: string, host: string): string | null => {
  try { const u = new URL(target); return (u.protocol === "https:" || (u.protocol === "http:" && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(u.hostname))) && u.host === host ? u.toString() : null; } catch { return null; }
};

/** OAuth consent: an AI app asks to manage the store. The owner/admin chooses how much it may do (or denies). */
export default function OauthConsent() {
  const { t } = useT(); const [sp] = useSearchParams(); const admin = useAdmin();
  const params = Object.fromEntries(PARAMS.filter((k) => sp.get(k)).map((k) => [k, sp.get(k)!]));
  const q = useQuery({ queryKey: ["oauth-info", sp.toString()], queryFn: () => api.get<Info>(`/api/admin/oauth/authorize-info?${new URLSearchParams(params)}`), retry: false });
  const [level, setLevel] = useState<Level | null>(null); const [sent, setSent] = useState(false);
  const decide = useMutation({
    mutationFn: (decision: "allow" | "deny") => api.post<{ redirectTo: string }>("/api/admin/oauth/authorize", { ...params, level: level ?? "read", decision }),
    onSuccess: (r) => { const to = safeRedirect(r.redirectTo, q.data!.redirectHost); if (to) { setSent(true); window.location.assign(to); } },
  });
  const allowed = admin?.role === "owner" || admin?.role === "admin";
  return (
    <main className="grid min-h-screen place-items-center bg-canvas p-4">
      <div className="w-full max-w-lg space-y-4">
        <Card title={t("oauth.title")}>
          {!allowed ? <p role="alert" className="text-sm text-danger">{t("oauth.forbidden")}</p>
            : q.isPending ? <Loading /> : q.isError ? <ErrorState error={q.error} retry={() => q.refetch()} />
            : (() => {
              const d = q.data; const max = ORDER.indexOf(d.maxLevel); const lv = level ?? "read";
              return (
                <div className="space-y-4" data-testid="oauth-consent">
                  <p className="text-sm">{t("oauth.ask", { app: d.client.name })}</p>
                  <dl className="space-y-2 rounded-lg border border-line bg-canvas p-3 text-sm">
                    <div className="flex justify-between gap-3"><dt className="text-muted">{t("oauth.app")}</dt><dd className="font-medium break-all">{d.client.name} <Badge tone="neutral">{t("oauth.unverified")}</Badge></dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-muted">{t("oauth.returnsTo")}</dt><dd className="font-mono font-semibold break-all" data-testid="oauth-host">{d.redirectHost}</dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-muted">{t("oauth.signedInAs")}</dt><dd className="break-all">{admin?.email}</dd></div>
                  </dl>
                  {d.client.neverUsed && d.client.kind === "dynamic" && <p role="note" className="rounded-lg border border-warn-line bg-warn-soft px-3 py-2 text-xs text-warn">{t("oauth.newApp")}</p>}
                  <SelectField label={t("oauth.level")} value={lv} onChange={(e) => setLevel(e.target.value as Level)} hint={t(`mcp.level.${lv}.desc`)}>
                    {ORDER.filter((_, i) => i <= max).map((l) => <option key={l} value={l}>{t(`mcp.level.${l}`)}</option>)}
                  </SelectField>
                  <p className="text-xs text-muted">{t("oauth.footer")}</p>
                  {decide.isError && <p role="alert" className="text-sm text-danger">{errMsg(decide.error)}</p>}
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button variant="ghost" disabled={decide.isPending || sent} onClick={() => decide.mutate("deny")}>{t("oauth.deny")}</Button>
                    <Button loading={decide.isPending} disabled={sent} onClick={() => decide.mutate("allow")}>{t("oauth.allow")}</Button>
                  </div>
                </div>
              );
            })()}
        </Card>
      </div>
    </main>
  );
}

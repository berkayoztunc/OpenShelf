import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, errMsg } from "../../lib/api";
import { useAdmin } from "../../lib/auth";
import { useT } from "../../i18n";
import { Badge, Button, Card, EmptyState, ErrorState, Loading, TextField, Toggle, cx, useToast } from "../../components/ui";

export type ToolLevel = "read" | "write" | "full";
export interface ToolRow { name: string; title: string; description: string; level: ToolLevel; group: string; method: string; path: string; readOnly: boolean; enabled: boolean }
interface Policy { masterEnabled: boolean; tools: ToolRow[] }
const KEY = ["mcp-tools"] as const;
const LEVEL_TONE = { read: "success", write: "warning", full: "danger" } as const;
const LEVELS: ToolLevel[] = ["read", "write", "full"];

/** Groups tools for the screen, keeping the server's order. */
export function groupTools(tools: ToolRow[]): [string, ToolRow[]][] {
  const m = new Map<string, ToolRow[]>();
  for (const t of tools) m.set(t.group, [...(m.get(t.group) ?? []), t]);
  return [...m];
}
/** Names whose state differs from the server's. */
export function diffTools(tools: ToolRow[], draft: Record<string, boolean>): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const t of tools) if (t.name in draft && draft[t.name] !== t.enabled) out[t.name] = draft[t.name]!;
  return out;
}

function GroupCheckbox({ state, onChange, label }: { state: "all" | "none" | "some"; onChange: (v: boolean) => void; label: string }) {
  return <input type="checkbox" aria-label={label} className="h-4 w-4 accent-[var(--color-brand-600,#4f46e5)]" checked={state === "all"} ref={(el) => { if (el) el.indeterminate = state === "some"; }} onChange={(e) => onChange(e.target.checked)} />;
}

/** Settings → MCP → Tools: which tools AI clients may use. Default all allowed; the owner can switch single tools, groups or all of MCP off. */
export default function McpTools() {
  const { t, td } = useT(); const toast = useToast(); const qc = useQueryClient(); const admin = useAdmin();
  const owner = admin?.role === "owner";
  const q = useQuery({ queryKey: KEY, queryFn: () => api.get<Policy>("/api/admin/mcp/tools") });
  const [draft, setDraft] = useState<Record<string, boolean>>({}); const [master, setMaster] = useState<boolean | null>(null);
  const [search, setSearch] = useState(""); const [lvl, setLvl] = useState<ToolLevel | "">("");
  const save = useMutation({
    mutationFn: (body: { masterEnabled?: boolean; tools?: Record<string, boolean> }) => api.put<Policy>("/api/admin/mcp/tools", body),
    onSuccess: (r) => { qc.setQueryData(KEY, r); setDraft({}); setMaster(null); toast.success(t("mcp.tools.saved")); },
    onError: (e) => toast.error(errMsg(e)),
  });
  const tools = q.data?.tools ?? [];
  const eff = (x: ToolRow) => (x.name in draft ? draft[x.name]! : x.enabled);
  const changes = useMemo(() => diffTools(tools, draft), [tools, draft]);
  const masterChanged = master !== null && master !== q.data?.masterEnabled;
  const dirty = Object.keys(changes).length > 0 || masterChanged;
  const visible = useMemo(() => {
    const s = search.trim().toLowerCase();
    return tools.filter((x) => (!lvl || x.level === lvl) && (!s || `${x.name} ${x.title} ${x.description}`.toLowerCase().includes(s)));
  }, [tools, search, lvl]);
  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const set = (names: string[], v: boolean) => setDraft((d) => ({ ...d, ...Object.fromEntries(names.map((n) => [n, v])) }));
  const preset = (fn: (x: ToolRow) => boolean) => setDraft(Object.fromEntries(tools.map((x) => [x.name, fn(x)])));
  const masterOn = master ?? q.data.masterEnabled;
  const enabledCount = tools.filter(eff).length;
  return (
    <div className="space-y-6">
      <Card title={t("mcp.tools.master.title")}>
        <Toggle checked={masterOn} onChange={(v) => owner && setMaster(v)} label={t("mcp.tools.master.label")} hint={t(masterOn ? "mcp.tools.master.on" : "mcp.tools.master.off")} />
        {!owner && <p className="mt-3 text-xs text-warn">{t("mcp.tools.ownerOnly")}</p>}
      </Card>
      <Card title={t("mcp.tools.title")} actions={<span className="text-xs text-muted" data-testid="mcp-count">{t("mcp.tools.count", { on: enabledCount, total: tools.length })}</span>}>
        <p className="mb-4 max-w-prose text-sm text-muted">{t("mcp.tools.body")}</p>
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <div className="w-full sm:w-64"><TextField label={t("common.search")} type="search" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
          <div role="group" aria-label={t("mcp.tools.filterLevel")} className="flex gap-2">
            {(["", ...LEVELS] as const).map((l) => (
              <button key={l || "all"} type="button" aria-pressed={lvl === l} onClick={() => setLvl(l)} className={cx("rounded-full border px-3 py-1 text-[13px] font-medium transition", lvl === l ? "border-brand-600 bg-brand-50 text-brand-ink" : "border-line text-muted hover:border-line-strong")}>{l ? t(`mcp.level.${l}`) : t("common.all")}</button>
            ))}
          </div>
          {owner && (
            <div className="ml-auto flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={() => preset((x) => x.level === "read")}>{t("mcp.tools.preset.read")}</Button>
              <Button size="sm" variant="secondary" onClick={() => preset((x) => x.level !== "full")}>{t("mcp.tools.preset.safe")}</Button>
              <Button size="sm" variant="secondary" onClick={() => preset(() => true)}>{t("mcp.tools.preset.all")}</Button>
            </div>
          )}
        </div>
        {visible.length === 0 ? <EmptyState title={t("mcp.tools.empty")} /> : groupTools(visible).map(([group, rows]) => {
          const on = rows.filter(eff).length; const state = on === rows.length ? "all" : on === 0 ? "none" : "some";
          return (
            <section key={group} className="mb-5" data-testid={`mcp-group-${group}`}>
              <div className="mb-2 flex items-center gap-3 border-b border-line pb-2">
                {owner && <GroupCheckbox state={state} label={t("mcp.tools.groupToggle", { group: td(`mcp.group.${group}`) })} onChange={(v) => set(rows.map((r) => r.name), v)} />}
                <h3 className="text-sm font-semibold">{td(`mcp.group.${group}`)}</h3>
                <span className="text-xs text-muted">{on}/{rows.length}</span>
              </div>
              <ul className="divide-y divide-line">
                {rows.map((r) => (
                  <li key={r.name} className="flex items-start gap-3 py-2.5">
                    <input type="checkbox" id={`tool-${r.name}`} aria-label={r.name} className="mt-1 h-4 w-4" disabled={!owner} checked={eff(r)} onChange={(e) => set([r.name], e.target.checked)} />
                    <label htmlFor={`tool-${r.name}`} className="min-w-0 flex-1 cursor-pointer">
                      <span className="flex flex-wrap items-center gap-2"><span className="text-sm font-medium">{r.title}</span><span className="font-mono text-[11px] text-muted">{r.name}</span><Badge tone={LEVEL_TONE[r.level]}>{t(`mcp.level.${r.level}`)}</Badge></span>
                      <span className="block text-xs text-muted">{r.description.replace(/^\[[a-z]+\] /, "")}</span>
                      <span className="block font-mono text-[11px] text-faint">{r.method} /api/admin{r.path}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </Card>
      {dirty && owner && (
        <div role="region" aria-label={t("mcp.tools.unsaved")} data-testid="mcp-savebar" className="sticky bottom-4 z-20 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-raised px-4 py-3 shadow-lift">
          <p className="flex-1 text-sm">{t("mcp.tools.unsaved.n", { n: Object.keys(changes).length + (masterChanged ? 1 : 0) })}</p>
          <Button variant="ghost" onClick={() => { setDraft({}); setMaster(null); }}>{t("mcp.tools.discard")}</Button>
          <Button loading={save.isPending} onClick={() => save.mutate({ ...(masterChanged ? { masterEnabled: master! } : {}), ...(Object.keys(changes).length ? { tools: changes } : {}) })}>{t("mcp.tools.save")}</Button>
        </div>
      )}
    </div>
  );
}

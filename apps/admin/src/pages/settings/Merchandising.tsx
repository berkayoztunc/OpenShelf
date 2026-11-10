import { useState } from "react";
import { ArrowDown, ArrowUp, ChevronsUp, Package, Plus, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { SORT_KEYS } from "@openshelf/shared";
import { api, qs } from "../../lib/api";
import { useGroupForm } from "../../lib/settings";
import { Button, Card, SelectField, TextField, Toggle, useDebounced } from "../../components/ui";
import { useT } from "../../i18n";
import { SettingsForm } from "./SaveBar";

interface Row { id: string; nameTr: string; status: string; images?: { url?: string; mediaId?: string }[] }
const thumb = (p?: Row) => { const i = p?.images?.[0]; return i?.mediaId ? `/media/${i.mediaId}` : i?.url; };

export default function Merchandising() {
  const { t } = useT();
  const { query, draft, patch, errors, save, dirty } = useGroupForm("merchandising");
  const [q, setQ] = useState(""); const dq = useDebounced(q);
  const pinned = draft?.pinned ?? [];
  const names = useQuery({
    queryKey: ["products", "byIds", pinned.join(",")], enabled: pinned.length > 0,
    queryFn: async () => (await api.get<{ items: Row[] }>(`/api/admin/products${qs({ ids: pinned.join(","), pageSize: 100 })}`)).items,
  });
  const search = useQuery({
    queryKey: ["products", "pinSearch", dq], enabled: dq.trim().length >= 2,
    queryFn: async () => (await api.get<{ items: Row[] }>(`/api/admin/products${qs({ q: dq, status: "active", pageSize: 8 })}`)).items,
  });
  const byId = new Map((names.data ?? []).map((p) => [p.id, p]));
  const set = (next: string[]) => patch({ pinned: next });
  const move = (i: number, to: number) => { if (to < 0 || to >= pinned.length) return; const a = [...pinned]; const [x] = a.splice(i, 1); a.splice(to, 0, x!); set(a); };
  const results = (search.data ?? []).filter((p) => !pinned.includes(p.id));
  const full = pinned.length >= 60;

  return (
    <SettingsForm query={query} ready={!!draft} onSave={() => save.mutate()} saving={save.isPending} dirty={dirty}>
      {draft && <>
        <Card title={t("settings.merch.sort.title")}>
          <div className="space-y-4">
            <SelectField label={t("settings.merch.defaultSort.label")} value={draft.defaultSort} hint={t(`settings.merch.sort.${draft.defaultSort}.hint`)} onChange={(e) => patch({ defaultSort: e.target.value as typeof draft.defaultSort })}>
              {SORT_KEYS.map((s) => <option key={s} value={s}>{t(`settings.merch.sort.${s}`)}</option>)}
            </SelectField>
            {draft.defaultSort === "bestselling" && <TextField label={t("settings.merch.days.label")} type="number" min={7} max={365} hint={t("settings.merch.days.hint")} value={draft.bestsellerDays} error={errors.bestsellerDays} onChange={(e) => patch({ bestsellerDays: Number(e.target.value) })} />}
            <Toggle label={t("settings.merch.inStockFirst.label")} hint={t("settings.merch.inStockFirst.hint")} checked={draft.inStockFirst} onChange={(v) => patch({ inStockFirst: v })} />
          </div>
        </Card>
        <Card title={t("settings.merch.pinned.title")} description={t("settings.merch.pinned.description")}>
          {draft.defaultSort !== "featured" && <p role="note" className="mb-4 rounded-lg border border-warn-line bg-warn-soft px-3 py-2 text-sm text-warn">{t("settings.merch.pinned.notActive")}</p>}
          {pinned.length === 0 ? <p className="rounded-lg border border-dashed border-line px-4 py-6 text-center text-sm text-muted">{t("settings.merch.pinned.empty")}</p> : (
            <ol className="mb-4 space-y-2">{pinned.map((id, i) => {
              const p = byId.get(id); const img = thumb(p);
              return (
                <li key={id} className="flex items-center gap-3 rounded-xl border border-line bg-canvas/50 p-2.5">
                  <span className="w-6 text-center text-sm tabular-nums text-muted">{i + 1}</span>
                  {img ? <img src={img} alt="" className="size-10 rounded-lg object-cover ring-1 ring-ink/[.07]" /> : <span className="grid size-10 place-items-center rounded-lg bg-hover text-faint" aria-hidden><Package size={16} /></span>}
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{p?.nameTr ?? (names.isPending ? "…" : t("settings.merch.pinned.missing"))}</span>
                  <span className="flex items-center gap-0.5">
                    <Button type="button" size="sm" variant="ghost" aria-label={t("settings.merch.pinned.top", { n: i + 1 })} disabled={i === 0} onClick={() => move(i, 0)}><ChevronsUp size={14} /></Button>
                    <Button type="button" size="sm" variant="ghost" aria-label={t("settings.merch.pinned.up", { n: i + 1 })} disabled={i === 0} onClick={() => move(i, i - 1)}><ArrowUp size={14} /></Button>
                    <Button type="button" size="sm" variant="ghost" aria-label={t("settings.merch.pinned.down", { n: i + 1 })} disabled={i === pinned.length - 1} onClick={() => move(i, i + 1)}><ArrowDown size={14} /></Button>
                    <Button type="button" size="sm" variant="ghost" aria-label={t("settings.merch.pinned.remove", { n: i + 1 })} onClick={() => set(pinned.filter((x) => x !== id))}><X size={14} /></Button>
                  </span>
                </li>
              );
            })}</ol>
          )}
          <TextField label={t("settings.merch.search.label")} type="search" placeholder={t("settings.merch.search.placeholder")} hint={full ? t("settings.merch.pinned.full") : t("settings.merch.search.hint")} disabled={full} value={q} onChange={(e) => setQ(e.target.value)} />
          {dq.trim().length >= 2 && (
            <ul className="mt-3 space-y-1.5" aria-label={t("settings.merch.search.results")}>
              {search.isPending ? <li className="text-sm text-muted">…</li> : results.length === 0 ? <li className="text-sm text-muted">{t("settings.merch.search.none")}</li> : results.map((p) => (
                <li key={p.id} className="flex items-center gap-3 rounded-lg border border-line px-3 py-2">
                  <span className="min-w-0 flex-1 truncate text-sm">{p.nameTr}</span>
                  <Button type="button" size="sm" variant="secondary" disabled={full} aria-label={t("settings.merch.pin", { name: p.nameTr })} onClick={() => { set([...pinned, p.id]); setQ(""); }}><Plus size={14} />{t("settings.merch.pinButton")}</Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </>}
    </SettingsForm>
  );
}

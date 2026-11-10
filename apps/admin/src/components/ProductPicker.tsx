import { useState } from "react";
import { ArrowDown, ArrowUp, ChevronsUp, Package, Plus, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api, qs } from "../lib/api";
import { useT, type MessageKey } from "../i18n";
import { Button, TextField, useDebounced } from "./ui";

interface Row { id: string; nameTr: string; status: string; images?: { url?: string; mediaId?: string }[] }
const thumb = (p?: Row) => { const i = p?.images?.[0]; return i?.mediaId ? `/media/${i.mediaId}` : i?.url; };

/** i18n keys for the wording of one use of the picker (pinning vs. home page selection). */
export type PickerKeys = Record<"empty" | "missing" | "top" | "up" | "down" | "remove" | "full" | "searchLabel" | "searchPlaceholder" | "searchHint" | "results" | "none" | "add" | "addButton", MessageKey>;

/** Ordered list of products with reorder/remove controls and a search box to add more (active products only). */
export function ProductPicker({ ids, onChange, max, keys }: { ids: string[]; onChange: (ids: string[]) => void; max: number; keys: PickerKeys }) {
  const { t } = useT();
  const [q, setQ] = useState(""); const dq = useDebounced(q);
  const names = useQuery({
    queryKey: ["products", "byIds", ids.join(",")], enabled: ids.length > 0,
    queryFn: async () => (await api.get<{ items: Row[] }>(`/api/admin/products${qs({ ids: ids.join(","), pageSize: 100 })}`)).items,
  });
  const search = useQuery({
    queryKey: ["products", "pickerSearch", dq], enabled: dq.trim().length >= 2,
    queryFn: async () => (await api.get<{ items: Row[] }>(`/api/admin/products${qs({ q: dq, status: "active", pageSize: 8 })}`)).items,
  });
  const byId = new Map((names.data ?? []).map((p) => [p.id, p]));
  const move = (i: number, to: number) => { if (to < 0 || to >= ids.length) return; const a = [...ids]; const [x] = a.splice(i, 1); a.splice(to, 0, x!); onChange(a); };
  const results = (search.data ?? []).filter((p) => !ids.includes(p.id));
  const full = ids.length >= max;
  return (
    <div>
      {ids.length === 0 ? <p className="mb-4 rounded-lg border border-dashed border-line px-4 py-6 text-center text-sm text-muted">{t(keys.empty)}</p> : (
        <ol className="mb-4 space-y-2">{ids.map((id, i) => {
          const p = byId.get(id); const img = thumb(p);
          return (
            <li key={id} className="flex items-center gap-3 rounded-xl border border-line bg-canvas/50 p-2.5">
              <span className="w-6 text-center text-sm tabular-nums text-muted">{i + 1}</span>
              {img ? <img src={img} alt="" className="size-10 rounded-lg object-cover ring-1 ring-ink/[.07]" /> : <span className="grid size-10 place-items-center rounded-lg bg-hover text-faint" aria-hidden><Package size={16} /></span>}
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{p?.nameTr ?? (names.isPending ? "…" : t(keys.missing))}</span>
              {p && p.status !== "active" && <span className="rounded-full bg-warn-soft px-2 py-0.5 text-xs text-warn">{t("picker.notActive")}</span>}
              <span className="flex items-center gap-0.5">
                <Button type="button" size="sm" variant="ghost" aria-label={t(keys.top, { n: i + 1 })} disabled={i === 0} onClick={() => move(i, 0)}><ChevronsUp size={14} /></Button>
                <Button type="button" size="sm" variant="ghost" aria-label={t(keys.up, { n: i + 1 })} disabled={i === 0} onClick={() => move(i, i - 1)}><ArrowUp size={14} /></Button>
                <Button type="button" size="sm" variant="ghost" aria-label={t(keys.down, { n: i + 1 })} disabled={i === ids.length - 1} onClick={() => move(i, i + 1)}><ArrowDown size={14} /></Button>
                <Button type="button" size="sm" variant="ghost" aria-label={t(keys.remove, { n: i + 1 })} onClick={() => onChange(ids.filter((x) => x !== id))}><X size={14} /></Button>
              </span>
            </li>
          );
        })}</ol>
      )}
      <TextField label={t(keys.searchLabel)} type="search" placeholder={t(keys.searchPlaceholder)} hint={full ? t(keys.full) : t(keys.searchHint)} disabled={full} value={q} onChange={(e) => setQ(e.target.value)} />
      {dq.trim().length >= 2 && (
        <ul className="mt-3 space-y-1.5" aria-label={t(keys.results)}>
          {search.isPending ? <li className="text-sm text-muted">…</li> : results.length === 0 ? <li className="text-sm text-muted">{t(keys.none)}</li> : results.map((p) => (
            <li key={p.id} className="flex items-center gap-3 rounded-lg border border-line px-3 py-2">
              <span className="min-w-0 flex-1 truncate text-sm">{p.nameTr}</span>
              <Button type="button" size="sm" variant="secondary" disabled={full} aria-label={t(keys.add, { name: p.nameTr })} onClick={() => { onChange([...ids, p.id]); setQ(""); }}><Plus size={14} />{t(keys.addButton)}</Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

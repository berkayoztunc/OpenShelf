import { useState } from "react";
import { ArrowLeft, ArrowRight, ChevronsLeft, GripVertical, Package, Plus, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api, qs } from "../lib/api";
import { useT, type MessageKey } from "../i18n";
import { money } from "../lib/format";
import { Button, TextField, useDebounced } from "./ui";

interface Row { id: string; nameTr: string; status: string; images?: { url?: string; mediaId?: string }[]; variants?: { prices?: { website?: number | null } }[] }
const thumb = (p?: Row) => { const i = p?.images?.[0]; return i?.mediaId ? `/media/${i.mediaId}` : i?.url; };
/** Lowest website price across variants — what the storefront card shows. */
const fromPrice = (p?: Row) => { const v = (p?.variants ?? []).map((x) => x.prices?.website).filter((n): n is number => typeof n === "number"); return v.length ? { min: Math.min(...v), multi: new Set(v).size > 1 } : null; };

/** i18n keys for the wording of one use of the picker (pinning vs. home page selection). */
export type PickerKeys = Record<"empty" | "missing" | "top" | "up" | "down" | "remove" | "full" | "searchLabel" | "searchPlaceholder" | "searchHint" | "results" | "none" | "add" | "addButton", MessageKey>;

/** Ordered grid of storefront-like product cards: drag & drop to reorder (buttons for keyboard/touch), remove, and and a search box to add more (active products only). */
export function ProductPicker({ ids, onChange, max, keys }: { ids: string[]; onChange: (ids: string[]) => void; max: number; keys: PickerKeys }) {
  const { t } = useT();
  const [q, setQ] = useState(""); const dq = useDebounced(q);
  const idSet = [...ids].sort().join(",");
  const names = useQuery({
    queryKey: ["products", "byIds", idSet], enabled: ids.length > 0, placeholderData: (prev) => prev, // order-independent: reordering must not refetch
    queryFn: async () => (await api.get<{ items: Row[] }>(`/api/admin/products${qs({ ids: idSet, pageSize: 100 })}`)).items,
  });
  const search = useQuery({
    queryKey: ["products", "pickerSearch", dq], enabled: dq.trim().length >= 2,
    queryFn: async () => (await api.get<{ items: Row[] }>(`/api/admin/products${qs({ q: dq, status: "active", pageSize: 8 })}`)).items,
  });
  const byId = new Map((names.data ?? []).map((p) => [p.id, p]));
  const move = (i: number, to: number) => { if (to < 0 || to >= ids.length) return; const a = [...ids]; const [x] = a.splice(i, 1); a.splice(to, 0, x!); onChange(a); };
  const results = (search.data ?? []).filter((p) => !ids.includes(p.id));
  const full = ids.length >= max;
  const [drag, setDrag] = useState<number | null>(null); const [over, setOver] = useState<number | null>(null);
  return (
    <div>
      {ids.length === 0 ? <p className="mb-4 rounded-lg border border-dashed border-line px-4 py-6 text-center text-sm text-muted">{t(keys.empty)}</p> : (
        <>
        <p className="mb-3 flex items-center gap-1.5 text-xs text-muted"><GripVertical size={13} aria-hidden />{t("picker.dragHint")}</p>
        <ol className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" onDragOver={(e) => { if (drag != null) e.preventDefault(); }}>{ids.map((id, i) => {
          const p = byId.get(id); const img = thumb(p); const price = fromPrice(p);
          const dragging = drag === i; const target = over === i && drag != null && drag !== i;
          return (
            <li key={id} draggable data-testid="picker-card"
              onDragStart={(e) => { setDrag(i); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", id); }}
              onDragEnter={(e) => { e.preventDefault(); setOver(i); }}
              onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; if (over !== i) setOver(i); }}
              onDrop={(e) => { e.preventDefault(); if (drag != null) move(drag, i); setDrag(null); setOver(null); }}
              onDragEnd={() => { setDrag(null); setOver(null); }}
              className={`group relative flex cursor-grab select-none flex-col rounded-2xl border bg-surface p-2 transition active:cursor-grabbing ${dragging ? "opacity-40" : ""} ${target ? "border-brand-600 ring-2 ring-brand-600/30 -translate-y-0.5" : "border-line hover:shadow-md"}`}>
              <div className="relative aspect-[4/5] overflow-hidden rounded-xl bg-hover ring-1 ring-ink/[.07]">
                {img ? <img src={img} alt="" draggable={false} className={`absolute inset-0 size-full object-cover ${p && p.status !== "active" ? "opacity-60 grayscale" : ""}`} /> : <span className="absolute inset-0 grid place-items-center text-faint" aria-hidden><Package size={28} /></span>}
                <span className="absolute left-2 top-2 grid size-7 place-items-center rounded-full bg-ink/80 text-xs font-semibold tabular-nums text-canvas">{i + 1}</span>
                <span className="absolute right-2 top-2 grid size-7 place-items-center rounded-full bg-canvas/85 text-muted opacity-0 shadow-sm transition group-hover:opacity-100" aria-hidden><GripVertical size={14} /></span>
                {p && p.status !== "active" && <span className="absolute bottom-2 left-2 rounded-full bg-warn-soft px-2 py-0.5 text-xs text-warn">{t("picker.notActive")}</span>}
              </div>
              <span className="mt-2 line-clamp-2 min-h-[2.5rem] px-0.5 text-sm font-medium leading-5">{p?.nameTr ?? (names.isPending ? "…" : t(keys.missing))}</span>
              <span className="px-0.5 text-sm tabular-nums text-muted">{price ? (price.multi ? t("picker.from", { price: money(price.min) }) : money(price.min)) : "\u00a0"}</span>
              <span className="mt-1.5 flex items-center justify-between border-t border-line pt-1.5">
                <span className="flex items-center gap-0.5">
                  <Button type="button" size="sm" variant="ghost" aria-label={t(keys.top, { n: i + 1 })} title={t(keys.top, { n: i + 1 })} disabled={i === 0} onClick={() => move(i, 0)}><ChevronsLeft size={14} /></Button>
                  <Button type="button" size="sm" variant="ghost" aria-label={t(keys.up, { n: i + 1 })} title={t(keys.up, { n: i + 1 })} disabled={i === 0} onClick={() => move(i, i - 1)}><ArrowLeft size={14} /></Button>
                  <Button type="button" size="sm" variant="ghost" aria-label={t(keys.down, { n: i + 1 })} title={t(keys.down, { n: i + 1 })} disabled={i === ids.length - 1} onClick={() => move(i, i + 1)}><ArrowRight size={14} /></Button>
                </span>
                <Button type="button" size="sm" variant="ghost" aria-label={t(keys.remove, { n: i + 1 })} title={t(keys.remove, { n: i + 1 })} onClick={() => onChange(ids.filter((x) => x !== id))}><X size={14} /></Button>
              </span>
            </li>
          );
        })}</ol>
        </>
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

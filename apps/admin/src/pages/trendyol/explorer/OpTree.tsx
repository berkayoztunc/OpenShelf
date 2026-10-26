import { useMemo, useState } from "react";
import type { KeyboardEvent } from "react";
import { ChevronRight, Search } from "lucide-react";
import { cx, EmptyState, TextField } from "../../../components/ui";
import { MethodChip, OpFlags, RiskDot } from "../../../components/trendyol/Chips";
import { AREA_ORDER, loc } from "../../../lib/trendyol";
import type { TrendyolOperation } from "../../../lib/trendyol";
import { useT } from "../../../i18n";
import type { Locale } from "../../../i18n";

/** Search over id, both titles, summaries, path and method. */
export function matchOp(op: TrendyolOperation, q: string): boolean {
  const n = q.trim().toLowerCase();
  if (!n) return true;
  return n.split(/\s+/).every((w) => `${op.id} ${op.title.tr} ${op.title.en} ${op.summary.tr} ${op.summary.en} ${op.path} ${op.method} ${op.group}`.toLowerCase().includes(w));
}

interface Props { ops: TrendyolOperation[]; selectedId?: string; onSelect: (id: string) => void; search: string; onSearch: (s: string) => void }

export function OpTree({ ops, selectedId, onSelect, search, onSearch }: Props) {
  const { t, td, locale } = useT();
  const searching = search.trim().length > 0;
  const shown = useMemo(() => ops.filter((o) => matchOp(o, search)), [ops, search]);
  const selectedGroup = ops.find((o) => o.id === selectedId)?.group;
  const [open, setOpen] = useState<Set<string>>(() => new Set(selectedGroup ? [selectedGroup] : []));
  const tree = useMemo(() => {
    const areas = new Map<string, Map<string, TrendyolOperation[]>>();
    for (const o of shown) { const g = areas.get(o.area) ?? new Map<string, TrendyolOperation[]>(); g.set(o.group, [...(g.get(o.group) ?? []), o]); areas.set(o.area, g); }
    return [...AREA_ORDER].filter((a) => areas.has(a)).map((a) => ({ area: a, groups: [...areas.get(a)!.entries()] }));
  }, [shown]);

  const toggle = (g: string) => setOpen((s) => { const n = new Set(s); if (n.has(g)) n.delete(g); else n.add(g); return n; });

  const onKey = (e: KeyboardEvent<HTMLElement>) => {
    const items = [...e.currentTarget.querySelectorAll<HTMLElement>("[data-tree-item]")];
    const i = items.indexOf(document.activeElement as HTMLElement);
    const focus = (k: number) => { e.preventDefault(); items[Math.max(0, Math.min(items.length - 1, k))]?.focus(); };
    const cur = items[i];
    if (e.key === "ArrowDown") focus(i + 1);
    else if (e.key === "ArrowUp") { if (i <= 0) { e.preventDefault(); document.getElementById("tdy-op-search")?.focus(); } else focus(i - 1); }
    else if (e.key === "Home") focus(0);
    else if (e.key === "End") focus(items.length - 1);
    else if (cur && e.key === "ArrowRight" && cur.dataset.group && cur.getAttribute("aria-expanded") === "false") { e.preventDefault(); toggle(cur.dataset.group); }
    else if (cur && e.key === "ArrowLeft") {
      if (cur.dataset.group && cur.getAttribute("aria-expanded") === "true") { e.preventDefault(); toggle(cur.dataset.group); }
      else if (cur.dataset.op) { const h = items.find((x) => x.dataset.group === cur.dataset.parent); if (h) { e.preventDefault(); h.focus(); } }
    }
  };

  return (
    <div className="flex min-h-0 flex-col">
      <div className="relative">
        <TextField id="tdy-op-search" label={t("trendyol.tree.search.label")} hint={t("trendyol.tree.search.hint")} help="trendyol.search" placeholder={t("trendyol.tree.search.placeholder")}
          value={search} onChange={(e) => onSearch(e.target.value)} type="search" autoComplete="off"
          onKeyDown={(e) => { if (e.key === "ArrowDown") { e.preventDefault(); document.querySelector<HTMLElement>("[data-tree-item]")?.focus(); } }} />
        <Search size={14} aria-hidden className="pointer-events-none absolute right-3 top-[2.05rem] text-faint" />
      </div>
      <p className="mt-2 text-xs text-muted" aria-live="polite">{t("trendyol.tree.count", { n: shown.length, total: ops.length })}</p>
      <nav aria-label={t("trendyol.tree.label")} onKeyDown={onKey} className="mt-2 min-h-0 flex-1 space-y-4 overflow-y-auto pr-1 lg:max-h-[calc(100vh-17rem)]">
        {tree.length === 0 && <EmptyState title={t("trendyol.tree.empty.title")} description={t("trendyol.tree.empty.body")} />}
        {tree.map(({ area, groups }) => (
          <div key={area}>
            <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">{td(`trendyol.area.${area}`)}</p>
            <ul className="space-y-0.5">
              {groups.map(([g, list]) => {
                const isOpen = searching || open.has(g);
                return (
                  <li key={g}>
                    <button type="button" data-tree-item data-group={g} aria-expanded={isOpen} onClick={() => toggle(g)}
                      className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-[13px] font-medium transition hover:bg-hover">
                      <ChevronRight size={14} aria-hidden className={cx("shrink-0 text-faint transition-transform", isOpen && "rotate-90")} />
                      <span className="flex-1 truncate">{td(`trendyol.group.${g}`)}</span>
                      <span className="rounded-full bg-hover px-1.5 text-[11px] text-muted">{list.length}</span>
                    </button>
                    {isOpen && (
                      <ul className="ml-3 mt-0.5 space-y-0.5 border-l border-line pl-2">
                        {list.map((o) => <OpRow key={o.id} op={o} locale={locale} selected={o.id === selectedId} onSelect={onSelect} />)}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </div>
  );
}

function OpRow({ op, selected, onSelect, locale }: { op: TrendyolOperation; selected: boolean; onSelect: (id: string) => void; locale: Locale }) {
  return (
    <li>
      <button type="button" data-tree-item data-op={op.id} data-parent={op.group} aria-current={selected ? "true" : undefined} onClick={() => onSelect(op.id)}
        className={cx("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition", selected ? "bg-brand-50 text-brand-ink ring-1 ring-brand-200" : "hover:bg-hover")}>
        <MethodChip method={op.method} className="!min-w-[2.6rem] !text-[9.5px]" />
        <span className={cx("min-w-0 flex-1 truncate", op.deprecated && "line-through decoration-faint")}>{loc(op.title, locale)}</span>
        <OpFlags op={op} compact />
        <RiskDot risk={op.risk} />
      </button>
    </li>
  );
}

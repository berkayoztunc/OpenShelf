import { memo, useState } from "react";
import { ChevronRight, Copy } from "lucide-react";
import { cx, useToast } from "../ui";
import { useT } from "../../i18n";
import { matchesDeep, prettyJson } from "../../lib/trendyol";

const PAGE = 100;

function Leaf({ v }: { v: unknown }) {
  if (v === null) return <span className="text-faint">null</span>;
  if (typeof v === "string") return <span className="break-all text-success">"{v.length > 400 ? `${v.slice(0, 400)}…` : v}"</span>;
  if (typeof v === "number") return <span className="text-info">{String(v)}</span>;
  return <span className="text-warn">{String(v)}</span>;
}

function CopyBtn({ text, label }: { text: string; label: string }) {
  const toast = useToast(); const { t } = useT();
  return (
    <button type="button" aria-label={label} title={label}
      onClick={(e) => { e.stopPropagation(); void navigator.clipboard?.writeText(text).then(() => toast.success(t("common.copied"))); }}
      className="rounded p-0.5 text-faint opacity-0 transition hover:text-ink focus-visible:opacity-100 group-hover/row:opacity-100"><Copy size={12} /></button>
  );
}

interface NodeProps { name?: string; value: unknown; path: string; depth: number; search: string; expandKey: number; expanded: boolean | null }
const Node = memo(function Node({ name, value, path, depth, search, expandKey, expanded }: NodeProps) {
  const { t } = useT();
  const isObj = value !== null && typeof value === "object";
  const auto = isObj && (expanded ?? (depth < 2 || (!!search && matchesDeep(value, search))));
  const [open, setOpen] = useState<boolean | undefined>(undefined);
  const [shown, setShown] = useState(PAGE);
  const isOpen = open ?? auto;
  const label = name !== undefined && <span className="text-ink">{name}<span className="text-faint">: </span></span>;
  const hit = !!search && (String(name ?? "").toLowerCase().includes(search.toLowerCase()) || (!isObj && String(value).toLowerCase().includes(search.toLowerCase())));
  const actions = <span className="ml-2 inline-flex gap-0.5">
    <CopyBtn text={path} label={t("trendyol.tree.copyPath")} />
    <CopyBtn text={isObj ? prettyJson(value) : String(value)} label={t("trendyol.tree.copyValue")} />
  </span>;
  if (!isObj) return <div className={cx("group/row flex items-start py-px pl-5", hit && "rounded bg-warn-soft")}>{label}<Leaf v={value} />{actions}</div>;
  const entries = Array.isArray(value) ? (value as unknown[]).map((v, i) => [String(i), v] as const) : Object.entries(value as Record<string, unknown>);
  const brackets = Array.isArray(value) ? ["[", "]"] : ["{", "}"];
  return (
    <div>
      <div className={cx("group/row flex items-center py-px", hit && "rounded bg-warn-soft")}>
        <button type="button" aria-expanded={isOpen} onClick={() => setOpen(!isOpen)} className="flex items-center rounded text-left hover:text-brand-ink">
          <ChevronRight size={14} className={cx("mr-1 shrink-0 text-faint transition-transform", isOpen && "rotate-90")} />
          {label}<span className="text-muted">{brackets[0]}{!isOpen && <>{entries.length ? ` ${entries.length} ` : ""}{brackets[1]}</>}</span>
        </button>
        {actions}
      </div>
      {isOpen && (
        <div className="ml-2 border-l border-line pl-3" key={expandKey}>
          {entries.slice(0, shown).map(([k, v]) => (
            <Node key={k} name={Array.isArray(value) ? undefined : k} value={v} path={Array.isArray(value) ? `${path}[${k}]` : path ? `${path}.${k}` : k} depth={depth + 1} search={search} expandKey={expandKey} expanded={expanded} />
          ))}
          {entries.length > shown && <button type="button" onClick={() => setShown(shown + PAGE)} className="py-1 pl-5 text-xs text-brand-ink hover:underline">{t("trendyol.tree.more", { n: entries.length - shown })}</button>}
          <div className="pl-0 text-muted">{brackets[1]}</div>
        </div>
      )}
    </div>
  );
});

/** Collapsible JSON tree: expand/collapse all, search highlighting, copy path / value. */
export function JsonTree({ value, search = "", expanded, expandKey }: { value: unknown; search?: string; expanded: boolean | null; expandKey: number }) {
  return <div className="overflow-x-auto font-mono text-[12.5px] leading-relaxed" role="tree" aria-label="JSON"><Node value={value} path="" depth={0} search={search} expandKey={expandKey} expanded={expanded} key={`${expandKey}-${expanded}`} /></div>;
}

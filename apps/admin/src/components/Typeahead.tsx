import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, qs } from "../lib/api";
import { cx, inputClass, useDebounced } from "./ui";
import { useT } from "../i18n";

/**
 * Accessible combobox that queries `GET {path}?q=` and expects `{ items: T[] }`.
 * The input is controlled by the parent (`value`), so free text stays usable; picking an item calls `onPick`.
 */
export function Typeahead<T>({ label, path, value, onChange, onPick, render, placeholder, minChars = 1, hint, type = "text", inputProps, hideLabel }: {
  label: string; path: string; value: string; onChange: (v: string) => void; onPick: (item: T) => void; render: (item: T) => ReactNode;
  placeholder?: string; minChars?: number; hint?: string; type?: string; hideLabel?: boolean; inputProps?: React.InputHTMLAttributes<HTMLInputElement>;
}) {
  const { t } = useT();
  const id = useId(); const list = `${id}-list`;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const dq = useDebounced(value.trim(), 250);
  const enabled = open && dq.length >= minChars;
  const res = useQuery({ queryKey: ["lookup", path, dq], enabled, staleTime: 10_000, queryFn: () => api.get<{ items: T[] }>(`${path}${qs({ q: dq })}`) });
  const items = enabled ? res.data?.items ?? [] : [];

  useEffect(() => {
    const h = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h);
  }, []);
  useEffect(() => setActive(0), [dq]);

  const pick = (it: T) => { onPick(it); setOpen(false); };
  const showPanel = open && enabled;
  return (
    <div ref={box} className="relative space-y-1.5">
      <label htmlFor={id} className={cx("block text-[13px] font-medium", hideLabel && "sr-only")}>{label}</label>
      <input id={id} type={type} role="combobox" aria-expanded={showPanel} aria-controls={list} aria-autocomplete="list" autoComplete="off"
        aria-activedescendant={showPanel && items[active] ? `${id}-o${active}` : undefined}
        className={inputClass} placeholder={placeholder} value={value} {...inputProps}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, Math.max(0, items.length - 1))); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          else if (e.key === "Enter" && showPanel && items[active]) { e.preventDefault(); pick(items[active]!); }
          else if (e.key === "Escape" && open) { e.stopPropagation(); setOpen(false); }
        }} />
      {hint && <p className="text-xs text-muted">{hint}</p>}
      {showPanel && (
        <ul id={list} role="listbox" aria-label={t("ui.typeahead.results", { label })} className="absolute inset-x-0 top-full z-30 mt-1 max-h-72 overflow-auto rounded-xl border border-line bg-raised py-1 shadow-lift">
          {res.isFetching && items.length === 0 && <li className="px-3 py-2 text-sm text-muted">{t("ui.typeahead.searching")}</li>}
          {!res.isFetching && items.length === 0 && <li className="px-3 py-2 text-sm text-muted">{res.isError ? t("ui.typeahead.failed") : t("ui.typeahead.none")}</li>}
          {items.map((it, i) => (
            <li key={i} id={`${id}-o${i}`} role="option" aria-selected={i === active} onMouseEnter={() => setActive(i)} onMouseDown={(e) => { e.preventDefault(); pick(it); }}
              className={cx("cursor-pointer px-3 py-2 text-sm", i === active && "bg-hover")}>{render(it)}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

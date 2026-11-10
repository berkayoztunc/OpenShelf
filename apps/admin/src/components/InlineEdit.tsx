import { useEffect, useRef, useState, type ReactNode } from "react";
import { Pencil } from "lucide-react";
import { Spinner } from "./ui";

/**
 * Click-to-edit number cell. Enter / blur saves, Esc cancels. `onSave` receives the raw text and may throw
 * (the caller shows the error); the cell then returns to display mode with the old value.
 */
export function InlineEdit({ label, display, initial, onSave, disabled, suffix, inputMode = "decimal", align = "left" }: {
  label: string; display: ReactNode; initial: string; onSave: (raw: string) => Promise<void>; disabled?: boolean; suffix?: string; inputMode?: "decimal" | "numeric"; align?: "left" | "right";
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(initial);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  useEffect(() => { if (editing) { ref.current?.focus(); ref.current?.select(); } }, [editing]);
  const start = () => { done.current = false; setVal(initial); setEditing(true); };
  const cancel = () => { done.current = true; setEditing(false); };
  const commit = async () => {
    if (done.current) return; done.current = true;
    if (val.trim() === initial.trim()) { setEditing(false); return; }
    setBusy(true);
    try { await onSave(val.trim()); } catch { /* caller reports */ } finally { setBusy(false); setEditing(false); }
  };
  if (disabled) return <span>{display}</span>;
  if (editing || busy) {
    return (
      <span className="inline-flex items-center gap-1">
        <input ref={ref} aria-label={label} inputMode={inputMode} value={val} disabled={busy} onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void commit(); } else if (e.key === "Escape") { e.preventDefault(); cancel(); } }}
          onBlur={() => void commit()} className={`h-8 w-24 rounded-lg border border-brand-600 bg-surface px-2 text-sm tabular-nums outline-none ring-2 ring-brand-600/20 ${align === "right" ? "text-right" : ""}`} />
        {suffix && <span className="text-xs text-muted">{suffix}</span>}{busy && <Spinner className="h-4 w-4" />}
      </span>
    );
  }
  return (
    <button type="button" aria-label={label} title={label} onClick={start} className="group inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 -mx-1.5 text-left transition hover:bg-hover">
      {display}<Pencil size={12} aria-hidden className="text-faint opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100" />
    </button>
  );
}

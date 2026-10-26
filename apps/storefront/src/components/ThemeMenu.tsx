import { useEffect, useRef, useState } from "react";
import { Check, Monitor, Moon, Sun } from "lucide-react";
import { THEME_MODES, getThemeMode, onThemeModeChange, setThemeMode } from "@openshelf/ui";
import type { ThemeMode } from "@openshelf/ui";
import { useI18n } from "../i18n";
import type { MessageKey } from "../i18n/messages";
const cx = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(" ");

const META: Record<ThemeMode, { key: MessageKey; Icon: typeof Sun }> = {
  system: { key: "theme.system", Icon: Monitor }, light: { key: "theme.light", Icon: Sun }, dark: { key: "theme.dark", Icon: Moon },
};

/** Three-state theme control (System / Light / Dark): icon button + radio menu. Arrow keys move, Esc closes and restores focus. */
export function ThemeMenu() {
  const { t } = useI18n();
  const [mode, setMode] = useState<ThemeMode>(getThemeMode);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => onThemeModeChange(setMode), []);
  useEffect(() => {
    if (!open) return;
    root.current?.querySelector<HTMLElement>('[role="menuitemradio"][aria-checked="true"]')?.focus();
    const click = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", click);
    return () => document.removeEventListener("mousedown", click);
  }, [open]);
  const choose = (m: ThemeMode) => { setThemeMode(m); setMode(m); setOpen(false); trigger.current?.focus(); };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { e.stopPropagation(); setOpen(false); trigger.current?.focus(); return; }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    const items = [...(root.current?.querySelectorAll<HTMLElement>('[role="menuitemradio"]') ?? [])];
    const i = items.indexOf(document.activeElement as HTMLElement);
    const n = e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : (i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
    items[n]?.focus();
  };
  const Cur = META[mode].Icon;
  return (
    <div ref={root} className="relative" onKeyDown={onKey}>
      <button ref={trigger} type="button" aria-haspopup="menu" aria-expanded={open} aria-label={`${t("theme.toggle")}: ${t(META[mode].key)}`} title={`${t("theme.toggle")}: ${t(META[mode].key)}`} data-testid="theme-trigger"
        onClick={() => setOpen((o) => !o)}
        className="icon-btn"><Cur size={20} strokeWidth={1.75} /></button>
      {open && (
        <div role="menu" aria-label={t("theme.toggle")} className="absolute right-0 top-full z-30 mt-2 w-40 overflow-hidden rounded-xl border border-line bg-raised p-1 shadow-lift sm:w-44">
          {THEME_MODES.map((m) => {
            const Icon = META[m].Icon; const label = t(META[m].key);
            return (
              <button key={m} type="button" role="menuitemradio" aria-checked={mode === m} onClick={() => choose(m)}
                className={cx("flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition hover:bg-hover focus-visible:bg-hover", mode === m ? "text-ink" : "text-muted")}>
                <Icon size={16} />{label}{mode === m && <Check size={14} className="ml-auto text-brand-ink" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

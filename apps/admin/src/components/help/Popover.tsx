import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";

const cx = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(" ");

/**
 * Accessible, non-modal popover: the trigger is a real button (aria-expanded/controls), Esc and outside click close it
 * and return focus, and the panel flips to the right edge when it would overflow the viewport.
 */
export function Popover({ trigger, label, children, className, panelClassName }: {
  trigger: (p: { open: boolean; toggle: () => void; ref: React.RefObject<HTMLButtonElement>; id: string; panelId: string }) => ReactNode;
  label: string; children: ReactNode; className?: string; panelClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [alignRight, setAlignRight] = useState(false);
  const wrap = useRef<HTMLSpanElement>(null); const btn = useRef<HTMLButtonElement>(null); const panel = useRef<HTMLDivElement>(null);
  const id = useId(); const panelId = `${id}-panel`;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); btn.current?.focus(); } };
    const onDown = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("keydown", onKey); document.addEventListener("mousedown", onDown);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onDown); };
  }, [open]);
  useLayoutEffect(() => {
    if (!open || !panel.current) return;
    const r = panel.current.getBoundingClientRect();
    setAlignRight(r.right > window.innerWidth - 8);
    panel.current.focus({ preventScroll: true });
  }, [open]);

  return (
    <span ref={wrap} className={cx("relative inline-flex align-middle", className)}>
      {trigger({ open, toggle: () => setOpen((v) => !v), ref: btn, id, panelId })}
      {open && (
        <div ref={panel} id={panelId} role="dialog" aria-label={label} tabIndex={-1}
          className={cx("absolute top-full z-50 mt-2 w-80 max-w-[85vw] rounded-xl border border-line-strong bg-raised p-4 text-left text-[13px] font-normal leading-relaxed text-ink shadow-soft outline-none", alignRight ? "right-0" : "left-0", panelClassName)}>
          {children}
        </div>
      )}
    </span>
  );
}

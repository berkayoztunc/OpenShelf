import { useEffect, useRef, useState } from "react";
import { ChevronDown, Printer } from "lucide-react";
import { openPrint } from "../lib/print";
import type { PrintKind } from "../lib/print";
import { useT } from "../i18n";
import { Button } from "./ui";

const ITEMS: PrintKind[] = ["label", "packing", "invoice", "summary"];
/** Dropdown that opens the chrome-less print route for one order in a new tab. */
export function PrintMenu({ orderId }: { orderId: string }) {
  const { td } = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const click = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", click); document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", click); document.removeEventListener("keydown", key); };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <Button variant="secondary" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}><Printer size={15} />{td("common.print")}<ChevronDown size={14} /></Button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-30 mt-2 w-56 overflow-hidden rounded-xl border border-line bg-raised py-1 shadow-lift">
          {ITEMS.map((k) => <button key={k} role="menuitem" type="button" title={td(`orders.print.${k}.title`)} className="block w-full px-4 py-2 text-left text-sm transition hover:bg-hover" onClick={() => { setOpen(false); openPrint(k, [orderId]); }}>{td(`orders.print.${k}`)}</button>)}
        </div>
      )}
    </div>
  );
}

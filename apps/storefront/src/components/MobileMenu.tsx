import { useEffect, useRef, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useI18n } from "../i18n";
import { ChevronDownIcon, CloseIcon } from "../lib/Icons";
import type { MenuLink, MenuNode } from "../lib/menu";
import { Logo } from "./Logo";

const row = ({ isActive }: { isActive: boolean }) =>
  `flex min-h-12 flex-1 items-center rounded-xl px-3 text-base font-medium transition-colors ${isActive ? "bg-brand-50 text-brand-ink" : "text-ink hover:bg-hover"}`;
const sub = ({ isActive }: { isActive: boolean }) =>
  `flex min-h-11 items-center rounded-lg px-3 text-[15px] transition-colors ${isActive ? "bg-brand-50 font-semibold text-brand-ink" : "text-muted hover:bg-hover hover:text-ink"}`;

function Item({ link, cls, onNavigate }: { link: MenuLink; cls: (s: { isActive: boolean }) => string; onNavigate: () => void }) {
  const ext = link.newTab ? { target: "_blank", rel: "noopener noreferrer" } : {};
  if (link.to) return <NavLink to={link.to} end={link.to === "/products"} className={cls} onClick={onNavigate} {...ext}>{link.label}</NavLink>;
  return <a href={link.href} className={cls({ isActive: false })} onClick={onNavigate} {...ext}>{link.label}</a>;
}

function Panel({ nodes, onClose }: { nodes: MenuNode[]; onClose: () => void }) {
  const { t } = useI18n();
  const ref = useRef<HTMLDialogElement>(null);
  const loc = useLocation();
  // the group that contains the current page starts expanded
  const [openKeys, setOpenKeys] = useState<Set<string>>(() => new Set(nodes.filter((n) => n.children.some((c) => c.to === loc.pathname)).map((n) => n.key)));
  useEffect(() => { const d = ref.current; if (d && !d.open) { if (typeof d.showModal === "function") d.showModal(); else d.setAttribute("open", ""); } }, []);
  useEffect(() => { const el = document.documentElement; const prev = el.style.overflow; el.style.overflow = "hidden"; return () => { el.style.overflow = prev; }; }, []);   // no page scroll behind the menu
  const startPath = useRef(loc.pathname);
  useEffect(() => { if (loc.pathname !== startPath.current) onClose(); }, [loc.pathname]); // eslint-disable-line react-hooks/exhaustive-deps -- close after a real navigation, not on mount
  const flip = (k: string) => setOpenKeys((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });
  return (
    <dialog ref={ref} id="mobile-menu" aria-label={t("nav.menu")} onClose={onClose} onCancel={onClose} onClick={(e) => { if (e.target === ref.current) onClose(); }}
      className="drawer-left fixed inset-y-0 left-0 right-auto m-0 h-dvh max-h-none w-[min(88vw,22rem)] border-r border-line bg-raised p-0 text-ink shadow-lift">
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-line px-4 py-3"><Logo /><button type="button" className="icon-btn -mr-2" aria-label={t("nav.closeMenu")} onClick={onClose}><CloseIcon /></button></div>
        <nav aria-label={t("nav.menu")} className="flex-1 overflow-y-auto px-3 py-3">
          <ul className="space-y-1">{nodes.map((n) => {
            const kids = n.children.length > 0; const open = openKeys.has(n.key);
            return (
              <li key={n.key}>
                <div className="flex items-center gap-1">
                  <Item link={n} cls={row} onNavigate={onClose} />
                  {kids && <button type="button" className="icon-btn" aria-expanded={open} aria-controls={`sub-${n.key}`} aria-label={t(open ? "nav.collapse" : "nav.expand", { name: n.label })} onClick={() => flip(n.key)}><ChevronDownIcon className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`} /></button>}
                </div>
                {kids && open && <ul id={`sub-${n.key}`} className="ml-3 mt-1 space-y-0.5 border-l border-line pl-3">{n.children.map((c) => <li key={c.key}><Item link={c} cls={sub} onNavigate={onClose} /></li>)}</ul>}
              </li>
            );
          })}</ul>
        </nav>
      </div>
    </dialog>
  );
}

/** Phone / small-tablet navigation: opened by the hamburger button, a native <dialog> (focus trap, Esc, inert page) sliding in from the left. */
export function MobileMenu({ open, nodes, onClose }: { open: boolean; nodes: MenuNode[]; onClose: () => void }) {
  return open ? <Panel nodes={nodes} onClose={onClose} /> : null;
}

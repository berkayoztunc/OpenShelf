import { useEffect, useRef, useState } from "react";
import { useI18n } from "../i18n";
import { ChevronIcon, CloseIcon, ZoomInIcon, ZoomOutIcon } from "../lib/Icons";
import { ProductImage } from "./ProductImage";

export interface LightboxImage { url: string; alt?: string | null }

/**
 * Image viewer in a contained, rounded panel (not edge to edge): the picture is fitted to a bounded stage so a large photo never
 * overflows the screen, with a thumbnail strip, click / button to zoom, arrow keys + swipe to navigate, Esc to close and focus
 * returning to the opener. Native <dialog>: focus trap and inert background come from the platform.
 */
export function Lightbox({ images, index, title, onIndex, onClose }: { images: LightboxImage[]; index: number; title: string; onIndex: (i: number) => void; onClose: () => void }) {
  const { t } = useI18n();
  const ref = useRef<HTMLDialogElement>(null);
  const touch = useRef<number | null>(null);
  const [zoomed, setZoomed] = useState(false);
  const [origin, setOrigin] = useState("50% 50%");
  const n = images.length;
  const go = (d: number) => onIndex((index + d + n) % n);

  useEffect(() => {
    const d = ref.current; if (!d) return;
    const opener = document.activeElement as HTMLElement | null;
    if (typeof d.showModal === "function") d.showModal(); else d.setAttribute("open", "");
    const el = document.documentElement; const prev = el.style.overflow; el.style.overflow = "hidden";   // no page scroll behind the viewer
    return () => { el.style.overflow = prev; opener?.focus?.(); };
  }, []);
  useEffect(() => { setZoomed(false); setOrigin("50% 50%"); }, [index]);

  const cur = images[index];
  const caption = cur?.alt && cur.alt !== title ? cur.alt : "";
  const btn = "grid size-10 shrink-0 place-items-center rounded-full bg-surface/90 text-ink shadow-sm ring-1 ring-ink/10 transition hover:bg-surface";
  return (
    <dialog ref={ref} aria-label={t("lightbox.title", { title })} onClose={onClose} onCancel={onClose}
      onKeyDown={(e) => { if (n > 1 && e.key === "ArrowRight") go(1); if (n > 1 && e.key === "ArrowLeft") go(-1); }}
      onTouchStart={(e) => { touch.current = e.touches[0]?.clientX ?? null; }}
      onTouchEnd={(e) => { const s = touch.current; touch.current = null; if (s == null || n < 2 || zoomed) return; const dx = (e.changedTouches[0]?.clientX ?? s) - s; if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1); }}
      className="fixed inset-0 m-0 size-full max-h-none max-w-none bg-transparent p-0 text-ink backdrop:bg-black/70 backdrop:backdrop-blur-sm">
      <div className="grid size-full place-items-center p-3 sm:p-8" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="flex max-h-full w-[min(100%,56rem)] flex-col overflow-hidden rounded-2xl bg-surface shadow-lift ring-1 ring-ink/10 dark:bg-raised">
          <div className="flex items-center gap-3 border-b border-line px-4 py-2.5">
            <p className="min-w-0 flex-1 truncate font-display text-base font-semibold">{title}</p>
            {n > 1 && <p className="text-sm tabular-nums text-muted" aria-live="polite">{index + 1} / {n}</p>}
            <button type="button" aria-label={t(zoomed ? "lightbox.zoomOut" : "lightbox.zoomIn")} aria-pressed={zoomed} onClick={() => setZoomed((z) => !z)} className="icon-btn !size-10">{zoomed ? <ZoomOutIcon /> : <ZoomInIcon />}</button>
            <button type="button" aria-label={t("lightbox.close")} onClick={onClose} className="icon-btn -mr-1.5 !size-10"><CloseIcon /></button>
          </div>
          <div className="relative flex h-[min(62dvh,34rem)] min-h-0 items-center justify-center overflow-hidden bg-canvas">
            <div className={`relative size-full ${zoomed ? "cursor-zoom-out" : "cursor-zoom-in"}`} onClick={() => setZoomed((z) => !z)}
              onMouseMove={(e) => { if (!zoomed) return; const r = e.currentTarget.getBoundingClientRect(); setOrigin(`${((e.clientX - r.left) / r.width) * 100}% ${((e.clientY - r.top) / r.height) * 100}%`); }}>
              <div className={`absolute inset-0 transition-transform duration-300 ease-out motion-reduce:transition-none ${zoomed ? "scale-[2.2]" : "scale-100"}`} style={{ transformOrigin: origin }}>
                <ProductImage key={cur?.url} src={cur?.url} alt={cur?.alt} title={title} eager className="absolute inset-0 size-full object-contain p-2" />
              </div>
            </div>
            {n > 1 && (<>
              <button type="button" aria-label={t("lightbox.prev")} onClick={() => go(-1)} className={`${btn} absolute left-3 top-1/2 -translate-y-1/2`}><ChevronIcon dir="left" size={20} /></button>
              <button type="button" aria-label={t("lightbox.next")} onClick={() => go(1)} className={`${btn} absolute right-3 top-1/2 -translate-y-1/2`}><ChevronIcon size={20} /></button>
            </>)}
          </div>
          {(caption || n > 1) && (
            <div className="space-y-2.5 border-t border-line px-4 py-3">
              {caption && <p className="text-sm text-muted">{caption}</p>}
              {n > 1 && (
                <ul className="flex gap-2 overflow-x-auto pb-0.5 [scrollbar-width:thin]">{images.map((im, i) => (
                  <li key={`${im.url}-${i}`} className="shrink-0">
                    <button type="button" aria-label={t("lightbox.goto", { n: i + 1 })} aria-current={i === index} onClick={() => onIndex(i)}
                      className={`relative block size-14 overflow-hidden rounded-lg bg-line ring-2 transition sm:size-16 ${i === index ? "ring-brand-600" : "ring-transparent opacity-70 hover:opacity-100"}`}>
                      <ProductImage src={im.url} alt="" title={title} className="absolute inset-0 size-full object-cover" />
                    </button>
                  </li>
                ))}</ul>
              )}
            </div>
          )}
        </div>
      </div>
    </dialog>
  );
}

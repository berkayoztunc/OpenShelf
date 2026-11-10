import { useEffect, useRef } from "react";
import { useI18n } from "../i18n";
import { ChevronIcon, CloseIcon } from "../lib/Icons";
import { ProductImage } from "./ProductImage";

export interface LightboxImage { url: string; alt?: string | null }

/** Full-screen image viewer on <dialog>: Esc closes, arrow keys + swipe navigate, focus returns to the opener. */
export function Lightbox({ images, index, title, onIndex, onClose }: { images: LightboxImage[]; index: number; title: string; onIndex: (i: number) => void; onClose: () => void }) {
  const { t } = useI18n();
  const ref = useRef<HTMLDialogElement>(null);
  const touch = useRef<number | null>(null);
  const n = images.length;
  const go = (d: number) => onIndex((index + d + n) % n);

  useEffect(() => {
    const d = ref.current; if (!d) return;
    const opener = document.activeElement as HTMLElement | null;
    if (typeof d.showModal === "function") d.showModal(); else d.setAttribute("open", "");
    return () => { opener?.focus?.(); };
  }, []);

  const cur = images[index];
  return (
    <dialog ref={ref} aria-label={title} onClose={onClose} onCancel={onClose}
      onClick={(e) => { if (e.target === ref.current) onClose(); }}
      onKeyDown={(e) => { if (n > 1 && e.key === "ArrowRight") go(1); if (n > 1 && e.key === "ArrowLeft") go(-1); }}
      onTouchStart={(e) => { touch.current = e.touches[0]?.clientX ?? null; }}
      onTouchEnd={(e) => { const s = touch.current; touch.current = null; if (s == null || n < 2) return; const dx = (e.changedTouches[0]?.clientX ?? s) - s; if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1); }}
      className="fixed inset-0 m-0 size-full max-h-none max-w-none bg-ink/90 p-0 text-white backdrop:bg-transparent">
      <button type="button" aria-label={t("lightbox.close")} onClick={onClose} className="absolute right-3 top-3 z-10 grid size-11 place-items-center rounded-full bg-black/40 text-white transition hover:bg-black/60"><CloseIcon size={20} /></button>
      {n > 1 && <p className="absolute left-4 top-5 z-10 text-sm tabular-nums text-white/80" aria-live="polite">{index + 1} / {n}</p>}
      <div className="grid size-full place-items-center p-4 sm:p-10">
        <ProductImage key={cur?.url} src={cur?.url} alt={cur?.alt} title={title} className="max-h-full max-w-full rounded-lg object-contain" />
      </div>
      {n > 1 && (<>
        <button type="button" aria-label={t("lightbox.prev")} onClick={() => go(-1)} className="absolute left-3 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-black/40 transition hover:bg-black/60"><ChevronIcon dir="left" size={22} /></button>
        <button type="button" aria-label={t("lightbox.next")} onClick={() => go(1)} className="absolute right-3 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-black/40 transition hover:bg-black/60"><ChevronIcon size={22} /></button>
      </>)}
    </dialog>
  );
}

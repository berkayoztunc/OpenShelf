import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BookOpen, X } from "lucide-react";
import { useT } from "../../i18n";
import { GuideView } from "../../help/GuideView";
import { getSection, GLOSSARY_SLUG } from "../../help/content";
import { parseGuide } from "../../help/slug";
import { GuideLink } from "./GuideLink";

/** "How do I use this page?" button + side panel with the matching guide section (`guide="orders#iade"`). */
export function PageHelp({ guide }: { guide: string }) {
  const { t, locale } = useT();
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null); const panel = useRef<HTMLDivElement>(null);
  const { section, anchor } = parseGuide(guide);
  const sec = section === GLOSSARY_SLUG ? undefined : getSection(locale, section);

  useEffect(() => {
    if (!open) return;
    panel.current?.focus();
    if (anchor) setTimeout(() => panel.current?.querySelector(`#${CSS.escape(anchor)}`)?.scrollIntoView({ block: "start" }), 60);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); btn.current?.focus(); } };
    document.addEventListener("keydown", onKey); return () => document.removeEventListener("keydown", onKey);
  }, [open, anchor]);

  return (
    <>
      <button ref={btn} type="button" onClick={() => setOpen(true)} aria-haspopup="dialog"
        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-[13px] font-medium text-muted transition hover:border-line-strong hover:text-ink">
        <BookOpen size={15} aria-hidden />{t("help.pageButton")}
      </button>
      {open && createPortal(
        <div className="fixed inset-0 z-50 flex justify-end" role="presentation">
          <div className="absolute inset-0 bg-[var(--os-scrim)]" onClick={() => setOpen(false)} />
          <div ref={panel} role="dialog" aria-modal="true" aria-label={t("help.title")} tabIndex={-1} className="relative flex h-full w-full max-w-xl flex-col border-l border-line bg-surface shadow-soft outline-none">
            <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
              <h2 className="text-sm font-semibold">{sec?.title ?? t("help.title")}</h2>
              <button type="button" onClick={() => { setOpen(false); btn.current?.focus(); }} aria-label={t("common.close")} className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-hover hover:text-ink"><X size={16} /></button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              {sec ? <GuideView md={sec.md.replace(/^#\s+.+\n?/, "")} className="text-sm text-ink" /> : <p className="text-sm text-muted">{t("help.missingSection")}</p>}
            </div>
            <footer className="border-t border-line px-5 py-3"><GuideLink guide={guide}>{t("help.openFull")}</GuideLink></footer>
          </div>
        </div>, document.body)}
    </>
  );
}

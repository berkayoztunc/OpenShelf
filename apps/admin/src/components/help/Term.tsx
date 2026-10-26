import type { ReactNode } from "react";
import { useT } from "../../i18n";
import { Popover } from "./Popover";
import { GuideLink } from "./GuideLink";
import { HelpText } from "./HelpTip";

/**
 * Jargon wrapper. `<Term id="sku" />` shows "Stok kodu (SKU)"; `<Term id="sku">SKU</Term>` keeps your wording.
 * Hover/focus shows the one-line definition; click opens the long explanation with a link to the glossary.
 * Definitions: `glossary.<id>.term | short | long` (registry in i18n/glossary.ts).
 */
export function Term({ id, children }: { id: string; children?: ReactNode }) {
  const { td, t } = useT();
  const term = td(`glossary.${id}.term`);
  if (term === `glossary.${id}.term`) return <>{children ?? id}</>;
  const short = td(`glossary.${id}.short`); const long = td(`glossary.${id}.long`);
  return (
    <span className="group relative inline-flex">
      <Popover label={term}
        trigger={({ open, toggle, ref, panelId }) => (
          <button ref={ref} type="button" onClick={toggle} aria-expanded={open} aria-controls={open ? panelId : undefined}
            className="cursor-help underline decoration-dotted decoration-faint underline-offset-[3px] transition hover:decoration-brand-600 focus-visible:decoration-brand-600">
            {children ?? term}
          </button>
        )}>
        <p className="text-sm font-semibold">{term}</p>
        <div className="mt-1.5 text-muted"><HelpText text={long} /></div>
        <div className="mt-2.5"><GuideLink guide={`glossary#${id}`}>{t("help.glossary")}</GuideLink></div>
      </Popover>
      <span role="tooltip" className="pointer-events-none absolute bottom-full left-0 z-40 mb-1.5 hidden w-64 max-w-[80vw] rounded-lg bg-ink px-2.5 py-1.5 text-xs font-normal leading-snug text-canvas shadow-soft group-focus-within:block group-hover:block">
        {short}
      </span>
    </span>
  );
}

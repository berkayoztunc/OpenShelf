import { CircleHelp } from "lucide-react";
import { useT } from "../../i18n";
import { Popover } from "./Popover";
import { GuideLink } from "./GuideLink";

export interface HelpBody { title?: string; body: string; example?: string; warn?: string; guide?: string }

/** Paragraphs separated by blank lines; `code` spans rendered monospace. */
export function HelpText({ text }: { text: string }) {
  return <>{text.split(/\n{2,}/).map((p, i) => (
    <p key={i} className={i ? "mt-2" : undefined}>{p.split(/(`[^`]+`)/g).map((s, j) => s.startsWith("`") ? <code key={j} className="rounded bg-hover px-1 py-0.5 font-mono text-[12px]">{s.slice(1, -1)}</code> : s)}</p>
  ))}</>;
}

export function HelpPanel({ title, body, example, warn, guide }: HelpBody) {
  const { t } = useT();
  return (
    <div className="space-y-2.5">
      {title && <p className="text-sm font-semibold">{title}</p>}
      <div className="text-muted"><HelpText text={body} /></div>
      {example && <div className="rounded-lg bg-hover px-3 py-2 text-[12.5px]"><span className="font-medium">{t("help.example")}: </span><HelpText text={example} /></div>}
      {warn && <div className="rounded-lg border border-warn-line bg-warn-soft px-3 py-2 text-[12.5px] text-warn"><span className="font-semibold">{t("help.warning")}: </span>{warn}</div>}
      {guide && <GuideLink guide={guide}>{t("help.guide")}</GuideLink>}
    </div>
  );
}

/** "?" button next to a label. Content comes from `help.<id>.title|body|example|warn|guide` in the dictionaries; renders nothing if there is no body. */
export function HelpTip({ id, guide, className }: { id: string; guide?: string; className?: string }) {
  const { td, t } = useT();
  const body = td(`help.${id}.body`);
  if (body === `help.${id}.body`) return null;
  const opt = (k: string) => { const v = td(`help.${id}.${k}`); return v === `help.${id}.${k}` ? undefined : v; };
  return <HelpTipRaw className={className} title={opt("title")} body={body} example={opt("example")} warn={opt("warn")} guide={guide ?? opt("guide")} label={t("help.open")} />;
}

export function HelpTipRaw({ label, className, ...content }: HelpBody & { label: string; className?: string }) {
  return (
    <Popover label={label} className={className}
      trigger={({ open, toggle, ref, panelId }) => (
        <button ref={ref} type="button" onClick={toggle} aria-expanded={open} aria-controls={open ? panelId : undefined} aria-label={label}
          className="grid h-5 w-5 place-items-center rounded-full text-faint transition hover:bg-hover hover:text-brand-ink focus-visible:text-brand-ink">
          <CircleHelp size={15} aria-hidden />
        </button>
      )}>
      <HelpPanel {...content} />
    </Popover>
  );
}

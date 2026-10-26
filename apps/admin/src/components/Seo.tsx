import { useId } from "react";
import type { InputHTMLAttributes, ReactNode } from "react";
import { AlertTriangle, CheckCircle2, ImageOff, Info, XCircle } from "lucide-react";
import { cx, inputClass } from "./ui";
import { useT } from "../i18n";
import { HelpTip } from "./help/HelpTip";
import { TermText } from "./TermText";
import { serpUrlParts, truncate } from "../lib/seo";
import type { Check, Meter } from "../lib/seo";

const barTone = { empty: "bg-line-strong", good: "bg-data-ok", warn: "bg-data-warn", bad: "bg-data-bad" } as const;
const textTone = { empty: "text-muted", good: "text-success", warn: "text-warn", bad: "text-danger" } as const;

/** Input / textarea with a live character counter, progress bar and a one-line verdict. */
export function MeteredField({ label, value, onChange, meter, max, multiline, placeholder, hint, error, rows = 3, help, testId }: {
  label: string; value: string; onChange: (v: string) => void; meter: Meter; max: number; multiline?: boolean; placeholder?: string; hint?: ReactNode; error?: string; rows?: number;
  /** `help.<id>.*` dictionary entry for the "?" popover; `testId` keeps the counter test id stable across languages. */
  help?: string; testId?: string;
}) {
  const { t } = useT();
  const id = useId();
  const common = { id, value, placeholder, "aria-describedby": `${id}-meter`, "aria-invalid": meter.tone === "bad" || !!error || undefined, className: cx(inputClass, multiline && "min-h-20") };
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1"><label htmlFor={id} className="block text-[13px] font-medium">{label}</label>{help && <HelpTip id={help} />}</div>
      {multiline
        ? <textarea {...common} rows={rows} onChange={(e) => onChange(e.target.value)} />
        : <input {...(common as InputHTMLAttributes<HTMLInputElement>)} onChange={(e) => onChange(e.target.value)} />}
      <div id={`${id}-meter`} className="flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line-strong" role="progressbar" aria-label={t("catalog.seo.lengthOf", { label })} aria-valuemin={0} aria-valuemax={max} aria-valuenow={meter.len}>
          <div className={cx("h-full rounded-full transition-all duration-200", barTone[meter.tone])} style={{ width: `${Math.min(100, meter.pct)}%` }} />
        </div>
        <span data-testid={`${testId ?? label}-count`} className={cx("shrink-0 text-xs tabular-nums", textTone[meter.tone])}>{meter.len}/{max}</span>
      </div>
      <p className={cx("text-xs", textTone[meter.tone])}>{meter.label}</p>
      {hint && <p className="text-xs text-muted">{hint}</p>}
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
    </div>
  );
}

export const TITLE_SERP = 60;
export const DESC_SERP = 155;

/** Google-style result snippet. Title is cut at ~60 chars and description at ~155, like the real SERP. */
export function SerpPreview({ title, url, description, label }: { title: string; url: string; description: string; label?: string }) {
  const { t } = useT();
  const { host, crumbs } = serpUrlParts(url);
  return (
    <figure aria-label={label ?? t("catalog.seo.serpAria")} data-testid="serp-preview" className="rounded-xl border border-[#dadce0] bg-white p-4 font-sans text-left text-[#202124] shadow-sm [color-scheme:light]">
      <div className="flex items-center gap-2 text-[12px] leading-tight text-[#202124]">
        <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-full bg-[#f1f3f4] text-[11px] font-semibold uppercase text-[#5f6368]">{host.slice(0, 1) || "?"}</span>
        <span className="min-w-0 truncate"><span className="block truncate font-medium" data-testid="serp-host">{host}</span>
          <span className="block truncate text-[#4d5156]" data-testid="serp-url">{[host, ...crumbs].join(" › ")}</span></span>
      </div>
      <p data-testid="serp-title" className="mt-2 text-[20px] leading-[1.3] text-[#1a0dab]">{truncate(title, TITLE_SERP) || t("catalog.seo.untitled")}</p>
      <p data-testid="serp-desc" className="mt-1 text-[14px] leading-[1.58] text-[#4d5156]">{truncate(description, DESC_SERP) || t("catalog.seo.noDescription")}</p>
    </figure>
  );
}

/** Open Graph card (Facebook / LinkedIn / WhatsApp style). */
export function SocialPreview({ image, title, description, host }: { image?: string | null; title: string; description: string; host: string }) {
  const { t } = useT();
  return (
    <figure aria-label={t("catalog.seo.socialAria")} data-testid="social-preview" className="overflow-hidden rounded-xl border border-[#dadde1] bg-white text-[#1c1e21] shadow-sm [color-scheme:light]">
      <div className="relative aspect-[1.91/1] w-full bg-[#f0f2f5]">
        {image ? <img src={image} alt="" className="size-full object-cover" />
          : <div className="grid size-full place-items-center text-[#65676b]"><span className="flex items-center gap-2 text-xs"><ImageOff size={16} />{t("catalog.seo.noImage")}</span></div>}
      </div>
      <div className="border-t border-[#dadde1] bg-[#f0f2f5] px-3 py-2.5">
        <p className="text-[11px] uppercase tracking-wide text-[#65676b]">{host}</p>
        <p className="mt-0.5 line-clamp-2 text-[15px] font-semibold leading-snug">{truncate(title, 70) || t("catalog.seo.untitled")}</p>
        <p className="mt-0.5 line-clamp-2 text-[13px] text-[#65676b]">{truncate(description, 110)}</p>
      </div>
    </figure>
  );
}

const checkIcon = { ok: <CheckCircle2 size={14} aria-hidden />, warn: <AlertTriangle size={14} aria-hidden />, bad: <XCircle size={14} aria-hidden /> };
const checkTone = {
  ok: "bg-success-soft text-success ring-success-line",
  warn: "bg-warn-soft text-warn ring-warn-line",
  bad: "bg-danger-soft text-danger ring-danger-line",
};
/** Badge row + actionable tips for every check that is not ok. */
export function SeoChecklist({ checks }: { checks: Check[] }) {
  const { t } = useT();
  const todo = checks.filter((c) => c.state !== "ok");
  return (
    <div data-testid="seo-checklist">
      <ul className="flex flex-wrap gap-2" aria-label={t("catalog.seo.checklistAria")}>
        {checks.map((c) => (
          <li key={c.id} data-state={c.state} className={cx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset", checkTone[c.state])}>{checkIcon[c.state]}{c.label}</li>
        ))}
      </ul>
      {todo.length > 0
        ? <ul className="mt-3 space-y-1.5 text-xs text-muted">{todo.map((c) => <li key={c.id} className="flex gap-2"><Info size={13} className="mt-0.5 shrink-0" aria-hidden /><span><strong className="font-medium text-ink">{c.label}:</strong> {c.tip}</span></li>)}</ul>
        : <p className="mt-3 text-xs text-success">{t("catalog.seo.allPassed")}</p>}
    </div>
  );
}

/** Slug input with the full public URL underneath and the 301 notice when an existing slug changes. */
export function SlugField({ label, value, onChange, origin, pathPrefix, original, required, help = "catalog.slug" }: {
  label?: string; value: string; onChange: (v: string) => void; origin: string; pathPrefix: string; original?: string; required?: boolean; help?: string;
}) {
  const { t } = useT();
  const id = useId();
  const changed = !!original && original !== value;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1"><label htmlFor={id} className="block text-[13px] font-medium">{label ?? t("catalog.seo.slug.label")}{required && <span aria-hidden className="text-danger"> *</span>}</label><HelpTip id={help} /></div>
      <div className="flex items-center overflow-hidden rounded-lg border border-line bg-surface focus-within:border-brand-600 focus-within:ring-4 focus-within:ring-brand-600/10">
        <span className="hidden shrink-0 border-r border-line bg-canvas px-3 py-2 text-sm text-muted sm:block">{pathPrefix}</span>
        <input id={id} required={required} value={value} onChange={(e) => onChange(e.target.value)} aria-describedby={`${id}-url`} className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm outline-none" />
      </div>
      <p id={`${id}-url`} data-testid="slug-url" className="break-all text-xs text-muted">{origin}{pathPrefix}<strong className="font-medium text-ink">{value || "…"}</strong></p>
      <p className="text-xs text-muted">{t("catalog.seo.slug.hint")}</p>
      {changed && (
        <p role="alert" data-testid="slug-warning" className="flex gap-2 rounded-lg bg-warn-soft p-2.5 text-xs text-warn ring-1 ring-inset ring-warn-line">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden />
          <span><TermText text={t("catalog.seo.slug.warning")} slots={{ url: <code className="font-mono">{pathPrefix}{original}</code> }} /> <HelpTip id="catalog.slugRedirect" /></span>
        </p>
      )}
    </div>
  );
}

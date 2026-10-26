import { useId, useState } from "react";
import { X } from "lucide-react";
import { Button, cx, inputClass } from "../../../components/ui";
import { HelpTipRaw } from "../../../components/help/HelpTip";
import { applyPreset, loc, localInputToMs, msToLocalInput, pathPlaceholders, splitList, visibleParams } from "../../../lib/trendyol";
import type { OpParam, ParamValues, Preset, TrendyolOperation } from "../../../lib/trendyol";
import { useT } from "../../../i18n";

/** Label row of a generated field: name, required star, type, "?" with the bilingual description. */
function ParamShell({ p, htmlFor, children }: { p: OpParam; htmlFor?: string; children: React.ReactNode }) {
  const { t, td, locale } = useT();
  const desc = loc(p.description, locale);
  const meta = [`${t("trendyol.param.type")}: ${td(`trendyol.ptype.${p.type}`)}`, p.default !== undefined ? `${t("trendyol.param.default")}: \`${String(p.default)}\`` : "", p.enum ? `${t("trendyol.param.values")}: ${p.enum.map((v) => `\`${v}\``).join(", ")}` : ""].filter(Boolean).join("\n\n");
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <label htmlFor={htmlFor} className="font-mono text-[12.5px] font-semibold">{p.name}{p.required && <span aria-hidden className="ml-0.5 text-danger"> *</span>}</label>
        {p.required && <span className="sr-only">{t("trendyol.param.required")}</span>}
        <span className="rounded bg-hover px-1 text-[10px] uppercase text-muted">{td(`trendyol.ptype.${p.type}`)}</span>
        <HelpTipRaw label={t("help.open")} title={p.name} body={`${desc}\n\n${meta}`} example={p.example !== undefined ? `\`${String(p.example)}\`` : undefined} />
      </div>
      {children}
      <p className="text-xs text-muted">{desc}</p>
    </div>
  );
}

function ChipsInput({ id, value, onChange, enumValues, placeholder }: { id: string; value: string; onChange: (v: string) => void; enumValues?: string[]; placeholder: string }) {
  const { t } = useT();
  const [draft, setDraft] = useState("");
  const items = splitList(value);
  const set = (list: string[]) => onChange(list.join(","));
  if (enumValues) {
    return (
      <div id={id} role="group" className="flex flex-wrap gap-1.5">
        {enumValues.map((v) => { const on = items.includes(v); return (
          <button key={v} type="button" aria-pressed={on} onClick={() => set(on ? items.filter((x) => x !== v) : [...items, v])}
            className={cx("rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset transition", on ? "bg-brand-600 text-white ring-brand-600" : "bg-surface text-muted ring-line hover:ring-line-strong")}>{v}</button>); })}
      </div>
    );
  }
  const commit = () => { const add = splitList(draft); if (add.length) set([...items, ...add.filter((a) => !items.includes(a))]); setDraft(""); };
  return (
    <div className={cx(inputClass, "flex flex-wrap items-center gap-1.5 !py-1.5")}>
      {items.map((v) => (
        <span key={v} className="inline-flex items-center gap-1 rounded-full bg-hover px-2 py-0.5 text-xs">{v}
          <button type="button" aria-label={t("trendyol.param.removeChip", { v })} onClick={() => set(items.filter((x) => x !== v))} className="text-muted hover:text-danger"><X size={12} /></button></span>
      ))}
      <input id={id} value={draft} placeholder={items.length ? "" : placeholder} onChange={(e) => setDraft(e.target.value)} onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); commit(); } else if (e.key === "Backspace" && !draft && items.length) set(items.slice(0, -1)); }}
        className="min-w-24 flex-1 bg-transparent py-0.5 text-sm outline-none" />
    </div>
  );
}

function ParamInput({ p, value, onChange }: { p: OpParam; value: string; onChange: (v: string) => void }) {
  const id = useId(); const { t } = useT();
  const ph = p.example !== undefined ? String(p.example) : "";
  let input: React.ReactNode;
  if (p.type === "array") input = <ChipsInput id={id} value={value} onChange={onChange} enumValues={p.enum} placeholder={t("trendyol.param.chipsPlaceholder")} />;
  else if (p.enum || p.type === "boolean") {
    const opts = p.enum ?? ["true", "false"];
    input = <select id={id} className={inputClass} value={value} onChange={(e) => onChange(e.target.value)}>{!p.required && <option value="">{t("trendyol.param.notSet")}</option>}{p.required && value === "" && <option value="" />}{opts.map((o) => <option key={o} value={o}>{o}</option>)}</select>;
  } else if (p.type === "timestamp_ms") {
    input = (
      <div className="flex flex-wrap items-center gap-2">
        <input id={id} type="datetime-local" className={cx(inputClass, "!w-auto")} value={msToLocalInput(value)} onChange={(e) => onChange(localInputToMs(e.target.value))} />
        {value && <code className="text-xs text-muted" title={t("trendyol.param.msHint")}>{value}</code>}
        {value && <Button variant="ghost" size="sm" onClick={() => onChange("")}>{t("trendyol.param.clear")}</Button>}
      </div>
    );
  } else input = <input id={id} className={inputClass} type={p.type === "integer" || p.type === "number" ? "number" : "text"} step={p.type === "number" ? "any" : undefined} value={value} placeholder={ph} onChange={(e) => onChange(e.target.value)} aria-required={p.required || undefined} />;
  return <ParamShell p={p} htmlFor={id}>{input}</ParamShell>;
}

/** Form generated from `op.params` (+ path placeholders). */
export function ParamsForm({ op, values, onChange }: { op: TrendyolOperation; values: ParamValues; onChange: (v: ParamValues) => void }) {
  const { t } = useT();
  const params = visibleParams(op);
  const set = (name: string, v: string) => onChange({ ...values, [name]: v });
  const hasTs = params.some((p) => p.type === "timestamp_ms");
  const declared = new Set(params.map((p) => p.name));
  const extraPath = pathPlaceholders(op).filter((n) => !declared.has(n));
  if (!params.length && !extraPath.length) return <p className="text-sm text-muted">{t("trendyol.params.none")}</p>;
  return (
    <div className="space-y-4">
      {hasTs && (
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t("trendyol.preset.label")}>
          <span className="text-xs text-muted">{t("trendyol.preset.label")}</span>
          {(["today", "last7", "last14"] as Preset[]).map((k) => <Button key={k} variant="secondary" size="sm" onClick={() => onChange(applyPreset(op, values, k))}>{t(`trendyol.preset.${k}`)}</Button>)}
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {extraPath.map((n) => <ParamInput key={n} p={{ name: n, in: "path", type: "string", required: true, description: { tr: t("trendyol.param.pathDesc"), en: t("trendyol.param.pathDesc") } }} value={values[n] ?? ""} onChange={(v) => set(n, v)} />)}
        {params.map((p) => <ParamInput key={p.name} p={p} value={values[p.name] ?? ""} onChange={(v) => set(p.name, v)} />)}
      </div>
    </div>
  );
}

import { useRef } from "react";
import { FileUp } from "lucide-react";
import { Badge, Button, Field, inputClass, cx } from "../../../components/ui";
import { byteLength, checkJson, fileToBase64, formatBytes, insertField, loc, prettyJson } from "../../../lib/trendyol";
import type { TrendyolOperation } from "../../../lib/trendyol";
import { useT } from "../../../i18n";

export interface BodyFile { name: string; type: string; base64: string }

interface Props {
  op: TrendyolOperation; text: string; onText: (s: string) => void; file: BodyFile | null; onFile: (f: BodyFile | null) => void; maxBytes: number;
}

export function BodyEditor({ op, text, onText, file, onFile, maxBytes }: Props) {
  const { t, locale } = useT();
  const area = useRef<HTMLTextAreaElement>(null);
  const gutter = useRef<HTMLDivElement>(null);

  if (op.body.kind === "multipart") {
    const accept = op.body.file?.accept ?? [];
    return (
      <Field label={t("trendyol.body.file.label")} hint={t("trendyol.body.file.hint")} help="trendyol.file" htmlFor="tdy-file">
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-line-strong p-4">
          <FileUp size={18} className="text-muted" aria-hidden />
          <input id="tdy-file" type="file" accept={accept.join(",")} className="text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-hover file:px-3 file:py-1.5 file:text-sm file:font-medium"
            onChange={async (e) => { const f = e.target.files?.[0]; onFile(f ? await fileToBase64(f) : null); }} />
          {file && <Badge tone="success">{file.name} ({formatBytes(Math.floor(file.base64.length * 0.75))})</Badge>}
        </div>
        {accept.length > 0 && <p className="mt-1.5 text-xs text-muted">{t("trendyol.body.file.accept", { types: accept.join(", ") })}</p>}
      </Field>
    );
  }

  const check = text.trim() ? checkJson(text) : null;
  const size = byteLength(text);
  const lines = Math.max(1, text.split("\n").length);
  const fields = op.body.fields ?? [];
  const reset = () => onText(op.body.example !== undefined ? prettyJson(op.body.example) : "");

  return (
    <div className="space-y-3">
      <Field label={t("trendyol.body.label")} hint={t("trendyol.body.hint")} help="trendyol.body" htmlFor="tdy-body">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" onClick={reset}>{t(op.body.example !== undefined ? "trendyol.body.loadExample" : "trendyol.body.clear")}</Button>
          <Button variant="secondary" size="sm" disabled={!check?.ok} onClick={() => check?.ok && onText(prettyJson(check.value))}>{t("trendyol.body.format")}</Button>
          <span className={cx("ml-auto text-xs", size > maxBytes ? "font-semibold text-danger" : "text-muted")} aria-live="polite">{t("trendyol.body.size", { size: formatBytes(size), max: formatBytes(maxBytes) })}</span>
        </div>
        <div className={cx("flex overflow-hidden rounded-lg border bg-surface dark:bg-canvas", check && !check.ok ? "border-danger" : "border-line focus-within:border-brand-600 focus-within:ring-4 focus-within:ring-brand-600/15")}>
          <div ref={gutter} aria-hidden className="select-none overflow-hidden border-r border-line bg-hover px-2 py-2 text-right font-mono text-[12px] leading-5 text-faint" style={{ height: "20rem" }}>
            {Array.from({ length: lines }, (_, i) => <div key={i}>{i + 1}</div>)}
          </div>
          <textarea ref={area} id="tdy-body" spellCheck={false} wrap="off" value={text} aria-invalid={check ? !check.ok : undefined} aria-describedby="tdy-body-status"
            onChange={(e) => onText(e.target.value)} onScroll={(e) => { if (gutter.current) gutter.current.scrollTop = e.currentTarget.scrollTop; }}
            className={cx(inputClass, "!rounded-none !border-0 !shadow-none !ring-0 font-mono text-[12.5px] leading-5")} style={{ height: "20rem", resize: "vertical" }} />
        </div>
        <p id="tdy-body-status" role="status" className={cx("mt-1.5 text-xs", check && !check.ok ? "text-danger" : "text-muted")}>
          {!check ? t("trendyol.body.empty") : check.ok ? t("trendyol.body.valid") : t("trendyol.body.invalid", { line: check.line, col: check.col, message: check.message })}
        </p>
      </Field>
      {fields.length > 0 && (
        <details className="rounded-lg border border-line">
          <summary className="cursor-pointer select-none px-3 py-2 text-[13px] font-medium">{t("trendyol.body.fields", { n: fields.length })}</summary>
          <div className="max-h-64 overflow-auto border-t border-line">
            <table className="w-full text-left text-[12.5px]">
              <caption className="sr-only">{t("trendyol.body.fieldsCaption")}</caption>
              <tbody className="divide-y divide-line">
                {fields.map((f) => (
                  <tr key={f.path} className="hover:bg-hover">
                    <td className="px-3 py-1.5 align-top"><button type="button" title={t("trendyol.body.insert")} onClick={() => onText(insertField(text, f.path, f.type))} className="rounded font-mono font-semibold text-brand-ink hover:underline">{f.path}</button>{f.required && <span className="ml-1 text-danger" title={t("trendyol.param.required")}>*</span>}</td>
                    <td className="px-2 py-1.5 align-top text-muted">{f.type}</td>
                    <td className="px-3 py-1.5 text-muted">{loc(f.description, locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}

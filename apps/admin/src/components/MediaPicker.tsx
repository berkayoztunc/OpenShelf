import { useRef, useState } from "react";
import { Trash2, UploadCloud } from "lucide-react";
import { errMsg } from "../lib/api";
import { MEDIA_ACCEPT, mediaUrl, uploadMedia } from "../lib/media";
import type { MediaKind } from "../lib/media";
import { Button, cx, useToast } from "./ui";
import { useT } from "../i18n";
import { HelpTip } from "./help/HelpTip";

/** Drag-and-drop (or click) upload area. Calls onFile with the first dropped/selected file. Keyboard accessible via the hidden file input + button. */
export function DropZone({ label, busy, onFile, children, className, compact, inputLabel, inputRef }: { label: string; busy?: boolean; onFile: (f: File) => void; children?: React.ReactNode; className?: string; compact?: boolean; inputLabel?: string; inputRef?: React.RefObject<HTMLInputElement> }) {
  const { t } = useT();
  const own = useRef<HTMLInputElement>(null);
  const input = inputRef ?? own;
  const [over, setOver] = useState(false);
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files?.[0]; if (f) onFile(f); }}
      className={cx("group relative flex flex-col items-center justify-center gap-1 overflow-hidden rounded-xl border-2 border-dashed bg-canvas text-center transition-colors", over ? "border-brand-600 bg-brand-50" : "border-line hover:border-muted", className)}>
      {children}
      <input ref={input} type="file" accept={MEDIA_ACCEPT} className="sr-only" aria-label={inputLabel ?? t("catalog.media.uploadAria", { label })} onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
      {!children && (
        <button type="button" disabled={busy} onClick={() => input.current?.click()} className={cx("flex size-full flex-col items-center justify-center gap-1.5 px-3 text-muted transition hover:text-ink", compact ? "py-4" : "py-8")}>
          <UploadCloud size={compact ? 20 : 26} aria-hidden /><span className="text-xs font-medium">{busy ? t("catalog.media.uploading") : t("catalog.media.dropHint")}</span>
        </button>
      )}
    </div>
  );
}

/** Single-image upload slot with preview. Value = media id. */
export function MediaSlot({ label, kind, value, onChange, hint, wide, help }: { label: string; kind: MediaKind; value: string | null; onChange: (id: string | null) => void; hint?: string; wide?: boolean; help?: string }) {
  const { t } = useT();
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const toast = useToast();
  async function pick(f: File) {
    setBusy(true);
    try { const r = await uploadMedia(f, kind); onChange(r.id); toast.success(t("catalog.media.uploaded", { label })); }
    catch (e) { toast.error(errMsg(e)); }
    finally { setBusy(false); }
  }
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1"><p className="text-[13px] font-medium">{label}</p>{help && <HelpTip id={help} />}</div>
      <DropZone label={label} busy={busy} onFile={pick} compact inputRef={input} className={wide ? "h-32 w-full" : "h-28 w-full"}>
        {value ? <img src={mediaUrl(value)} alt={t("catalog.media.previewAlt", { label })} className="size-full object-contain p-2" /> : undefined}
      </DropZone>
      <div className="flex gap-2">
        <Button size="sm" variant="secondary" loading={busy} onClick={() => input.current?.click()}>{value ? t("catalog.media.replace") : t("catalog.media.upload")}</Button>
        {value && <Button size="sm" variant="ghost" onClick={() => onChange(null)}><Trash2 size={14} />{t("catalog.media.remove")}</Button>}
      </div>
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Copy, ExternalLink, ImageOff, Trash2, UploadCloud, X } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, errMsg, qs } from "../lib/api";
import { MEDIA_ACCEPT, mediaUrl, uploadMedia, type MediaKind, type MediaResult } from "../lib/media";
import { dateOnly } from "../lib/format";
import { useT } from "../i18n";
import { Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, Loading, PageHeader, SelectField, Spinner, TextField, cx, useToast } from "../components/ui";

const KINDS: MediaKind[] = ["product", "banner", "og", "logo", "logo_dark", "favicon", "category"];
interface Item { id: string; kind: MediaKind; mime: string; size: number; alt: string | null; createdAt: string; url: string; suspect?: string }
interface Upload { key: number; name: string; state: "uploading" | "ok" | "failed"; result?: MediaResult; error?: string }
let seq = 0;

/** Alt text of one image, edited in place (Enter / click away saves, Esc cancels). */
function AltText({ item, onSaved }: { item: Item; onSaved: () => void }) {
  const { t } = useT(); const toast = useToast();
  const [editing, setEditing] = useState(false); const [val, setVal] = useState(item.alt ?? ""); const done = useRef(false);
  const save = async () => {
    if (done.current) return; done.current = true;
    if (val.trim() === (item.alt ?? "")) { setEditing(false); return; }
    try { await api.patch(`/api/admin/media/${item.id}`, { alt: val }); toast.success(t("catalog.mediaLib.alt.saved")); onSaved(); } catch (e) { toast.error(errMsg(e)); } finally { setEditing(false); }
  };
  if (!editing) return <button type="button" onClick={() => { done.current = false; setVal(item.alt ?? ""); setEditing(true); }} aria-label={t("catalog.mediaLib.alt.edit", { id: item.id.slice(0, 8) })} className="w-full truncate rounded px-1 text-left text-xs text-muted hover:bg-hover hover:text-ink">{item.alt || <span className="italic text-faint">{t("catalog.mediaLib.alt.none")}</span>}</button>;
  return <input autoFocus value={val} maxLength={300} aria-label={t("catalog.mediaLib.alt.edit", { id: item.id.slice(0, 8) })} onChange={(e) => setVal(e.target.value)} onBlur={() => void save()}
    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void save(); } else if (e.key === "Escape") { done.current = true; setEditing(false); } }} className="h-7 w-full rounded border border-brand-600 bg-surface px-1.5 text-xs outline-none ring-2 ring-brand-600/20" />;
}

export default function Media() {
  const { t } = useT(); const toast = useToast(); const qc = useQueryClient();
  const [kind, setKind] = useState<MediaKind>("product"); const [alt, setAlt] = useState(""); const [filter, setFilter] = useState("");
  const [uploads, setUploads] = useState<Upload[]>([]); const [over, setOver] = useState(false); const [del, setDel] = useState<Item | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useQuery({ queryKey: ["media", filter], queryFn: () => api.get<{ items: Item[] }>(`/api/admin/media${qs({ kind: filter, limit: 200 })}`) });

  const addFiles = useCallback(async (files: File[]) => {
    const imgs = files.filter((f) => f.type.startsWith("image/"));
    if (imgs.length === 0) return;
    const batch = imgs.map((f) => ({ key: ++seq, name: f.name || "image", state: "uploading" as const, file: f }));
    setUploads((u) => [...batch.map(({ file: _f, ...b }) => b), ...u].slice(0, 30));
    for (const b of batch) {
      try { const result = await uploadMedia(b.file, kind, alt); setUploads((u) => u.map((x) => (x.key === b.key ? { ...x, state: "ok", result } : x))); }
      catch (e) { setUploads((u) => u.map((x) => (x.key === b.key ? { ...x, state: "failed", error: errMsg(e) } : x))); }
    }
    qc.invalidateQueries({ queryKey: ["media"] });
  }, [kind, alt, qc]);

  // Paste screenshots / copied images straight from the clipboard (Ctrl/Cmd+V), unless the person is typing in a field.
  useEffect(() => {
    const on = (e: ClipboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName; if (tag === "INPUT" || tag === "TEXTAREA") return;
      const files = [...(e.clipboardData?.files ?? [])]; if (files.length) { e.preventDefault(); void addFiles(files); }
    };
    document.addEventListener("paste", on); return () => document.removeEventListener("paste", on);
  }, [addFiles]);

  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/api/admin/media/${id}`),
    onSuccess: () => { setDel(null); qc.invalidateQueries({ queryKey: ["media"] }); toast.success(t("catalog.mediaLib.deleted")); },
    onError: (e) => { setDel(null); toast.error(errMsg(e)); },
  });
  const copy = (id: string) => void navigator.clipboard?.writeText(id).then(() => toast.success(t("catalog.mediaLib.copied")));
  const items = list.data?.items ?? [];

  return (
    <>
      <PageHeader title={t("catalog.mediaLib.title")} description={t("catalog.mediaLib.description")} guide="catalog#urun-gorselleri" />
      <Card title={t("catalog.mediaLib.upload.title")}>
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField label={t("catalog.mediaLib.kind.label")} hint={t("catalog.mediaLib.kind.hint")} value={kind} onChange={(e) => setKind(e.target.value as MediaKind)}>{KINDS.map((k) => <option key={k} value={k}>{t(`catalog.mediaLib.kind.${k}`)}</option>)}</SelectField>
          <TextField label={t("catalog.mediaLib.alt.label")} hint={t("catalog.mediaLib.alt.hint")} maxLength={300} value={alt} onChange={(e) => setAlt(e.target.value)} />
        </div>
        <div onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); void addFiles([...e.dataTransfer.files]); }}
          className={cx("mt-4 flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-10 text-center transition-colors", over ? "border-brand-600 bg-brand-50" : "border-line-strong bg-canvas")}>
          <UploadCloud size={28} aria-hidden className="text-muted" />
          <p className="text-sm font-medium">{t("catalog.mediaLib.drop")}</p>
          <p className="max-w-md text-xs text-muted">{t("catalog.mediaLib.drop.hint")}</p>
          <Button type="button" variant="secondary" onClick={() => input.current?.click()}>{t("catalog.mediaLib.choose")}</Button>
          <input ref={input} type="file" multiple accept={MEDIA_ACCEPT} className="sr-only" aria-label={t("catalog.mediaLib.choose")} onChange={(e) => { void addFiles([...(e.target.files ?? [])]); e.target.value = ""; }} />
        </div>
        {uploads.length > 0 && (
          <ul className="mt-4 space-y-2" aria-label={t("catalog.mediaLib.upload.title")}>{uploads.map((u) => (
            <li key={u.key} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-line px-3 py-2 text-sm">
              <span className="min-w-0 flex-1 truncate font-medium">{u.name}</span>
              {u.state === "uploading" && <span className="flex items-center gap-1.5 text-muted"><Spinner className="h-4 w-4" />{t("catalog.mediaLib.status.uploading")}</span>}
              {u.state === "ok" && <span className="flex items-center gap-1.5 text-success"><Check size={14} aria-hidden />{t("catalog.mediaLib.status.ok")}{u.result?.width ? <span className="text-muted"> · {u.result.width}×{u.result.height}</span> : null}</span>}
              {u.state === "failed" && <span role="alert" className="flex items-center gap-1.5 text-danger"><X size={14} aria-hidden />{u.error}</span>}
              {u.result?.warnings?.map((w) => <p key={w} className="basis-full text-xs text-warn">{t("catalog.mediaLib.warn")}: {w}</p>)}
            </li>
          ))}</ul>
        )}
      </Card>

      <Card title={t("catalog.mediaLib.library.title")} className="mt-6" actions={<span className="text-xs text-muted">{t("catalog.mediaLib.count", { n: items.length })}</span>}>
        <div className="mb-4 max-w-xs"><SelectField label={t("catalog.mediaLib.filter.label")} value={filter} onChange={(e) => setFilter(e.target.value)}><option value="">{t("common.all")}</option>{KINDS.map((k) => <option key={k} value={k}>{t(`catalog.mediaLib.kind.${k}`)}</option>)}</SelectField></div>
        {list.isPending ? <Loading /> : list.isError ? <ErrorState error={list.error} retry={() => list.refetch()} /> : items.length === 0 ? <EmptyState icon={<ImageOff size={22} />} title={t("catalog.mediaLib.empty.title")} description={t("catalog.mediaLib.empty.body")} /> : (
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">{items.map((m) => (
            <li key={m.id} className="flex flex-col overflow-hidden rounded-xl border border-line bg-surface">
              <a href={mediaUrl(m.id)} target="_blank" rel="noopener noreferrer" aria-label={t("catalog.mediaLib.open")} className="block aspect-square bg-canvas"><img src={mediaUrl(m.id)} alt={m.alt ?? ""} loading="lazy" className="size-full object-contain" /></a>
              <div className="space-y-1.5 p-2.5">
                <div className="flex flex-wrap items-center gap-1.5"><Badge>{t(`catalog.mediaLib.kind.${m.kind}` as "catalog.mediaLib.kind.product")}</Badge>{m.suspect && <Badge tone="warning">{t("catalog.mediaLib.suspect")}</Badge>}</div>
                <AltText item={m} onSaved={() => qc.invalidateQueries({ queryKey: ["media"] })} />
                <p className="text-[11px] text-muted">{t("catalog.mediaLib.size", { kb: Math.max(1, Math.round(m.size / 1024)) })} · {dateOnly(m.createdAt)}</p>
                <div className="flex items-center gap-0.5 pt-0.5">
                  <Button type="button" size="sm" variant="ghost" aria-label={t("catalog.mediaLib.copyId")} title={t("catalog.mediaLib.copyId")} onClick={() => copy(m.id)}><Copy size={14} /></Button>
                  <a href={mediaUrl(m.id)} target="_blank" rel="noopener noreferrer" aria-label={t("catalog.mediaLib.open")} title={t("catalog.mediaLib.open")} className="inline-grid size-8 place-items-center rounded-lg text-muted hover:bg-hover hover:text-ink"><ExternalLink size={14} /></a>
                  <Button type="button" size="sm" variant="ghost" className="ml-auto" aria-label={t("catalog.mediaLib.delete")} title={t("catalog.mediaLib.delete")} onClick={() => setDel(m)}><Trash2 size={14} /></Button>
                </div>
              </div>
            </li>
          ))}</ul>
        )}
      </Card>

      <Card title={t("catalog.mediaLib.ai.title")} className="mt-6"><p className="max-w-3xl text-sm text-muted">{t("catalog.mediaLib.ai.body")}</p></Card>
      <ConfirmDialog open={!!del} danger title={t("catalog.mediaLib.delete.title")} message={t("catalog.mediaLib.delete.body")} confirmLabel={t("catalog.mediaLib.delete")} loading={remove.isPending} onConfirm={() => del && remove.mutate(del.id)} onClose={() => setDel(null)} />
    </>
  );
}

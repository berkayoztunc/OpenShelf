import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api, errMsg } from "../lib/api";
import { useT } from "../i18n";
import { Button, Card, ConfirmDialog, PageHeader, useToast } from "../components/ui";
import { HelpTip } from "../components/help/HelpTip";
import { TermStrip } from "./settings/TermStrip";

const EXPORTS = [
  { entity: "products", formats: ["csv", "json"], warn: false },
  { entity: "orders", formats: ["csv", "json"], warn: false },
  { entity: "customers", formats: ["csv", "json"], warn: true },
  { entity: "config", formats: ["json"], warn: false },
] as const;

type ImportResult = { imported?: number; created?: number; updated?: number; errors?: { slug?: string; message?: string }[] };

export default function DataPage() {
  const { t } = useT();
  const file = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [ask, setAsk] = useState(false);
  const [errs, setErrs] = useState<NonNullable<ImportResult["errors"]>>([]);
  const toast = useToast();
  const imp = useMutation({
    mutationFn: () => { const f = file.current?.files?.[0]; if (!f) throw new Error(t("data.import.chooseError")); const fd = new FormData(); fd.append("file", f); return api.upload<ImportResult>("/api/admin/import/products", fd); },
    onSuccess: (r) => {
      const failed = r?.errors?.length ? t("data.import.failedPart", { n: r.errors.length }) : "";
      toast.success(t("data.import.done", { created: r?.created ?? 0, updated: r?.updated ?? 0, failed }));
      setErrs(r?.errors ?? []); setAsk(false); setName(""); if (file.current) file.current.value = "";
    },
    onError: (e) => { setAsk(false); toast.error(errMsg(e)); },
  });
  return (
    <>
      <PageHeader title={t("data.title")} description={t("data.description")} guide="data#disa-aktarma" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title={<span className="inline-flex items-center gap-1">{t("data.export.title")}<HelpTip id="data.export" /></span>}>
          <p className="mb-4 text-sm text-muted">{t("data.export.intro")}</p>
          <ul className="space-y-4">{EXPORTS.map((x) => (
            <li key={x.entity} className="flex items-center justify-between gap-3">
              <div className="min-w-0"><p className="font-medium">{t(`data.export.${x.entity}`)}</p><p className="text-xs text-muted">{t(`data.export.${x.entity}.note`)}</p></div>
              <div className="flex shrink-0 gap-2">{x.formats.map((f) => (
                <a key={f} href={`/api/admin/export/${x.entity}.${f}`} download aria-label={t("data.export.download", { entity: t(`data.export.${x.entity}`), format: f.toUpperCase() })} className="rounded-xl border border-line bg-surface px-3 py-1.5 text-sm font-medium hover:bg-hover">{f.toUpperCase()}</a>
              ))}</div>
            </li>
          ))}</ul>
        </Card>
        <Card title={<span className="inline-flex items-center gap-1">{t("data.import.title")}<HelpTip id="data.import" /></span>}>
          <p className="mb-4 text-sm text-muted">{t("data.import.intro")}</p>
          <TermStrip ids={["sku", "slug", "variant"]} />
          <input ref={file} type="file" accept=".csv,text/csv" className="sr-only" aria-label={t("data.import.fileLabel")} onChange={(e) => setName(e.target.files?.[0]?.name ?? "")} />
          <div className="flex items-center gap-3">
            <Button variant="secondary" onClick={() => file.current?.click()}>{t("data.import.choose")}</Button>
            <span className="truncate text-sm text-muted">{name || t("data.import.noFile")}</span>
          </div>
          <Button className="mt-4" loading={imp.isPending} disabled={!name} onClick={() => setAsk(true)}>{t("data.import.button")}</Button>
          <div className="mt-5 space-y-1 rounded-xl border border-line bg-canvas p-4 text-xs text-muted">
            <p className="font-medium text-ink">{t("data.import.columns.title")}</p>
            <p>{t("data.import.columns.required")}</p>
            <p>{t("data.import.columns.optional")}</p>
          </div>
          {errs.length > 0 && (
            <div role="alert" className="mt-4 rounded-xl border border-danger-line bg-danger-soft p-3 text-xs text-danger">
              <p className="font-medium">{t("data.import.errorsTitle")}</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4">{errs.map((e, i) => <li key={i}><code className="font-mono">{e.slug}</code>: {e.message}</li>)}</ul>
            </div>
          )}
        </Card>
      </div>
      <ConfirmDialog open={ask} danger loading={imp.isPending} title={t("data.import.confirmTitle")} message={t("data.import.confirmMessage", { file: name })} confirmLabel={t("data.import.confirmAction")}
        onConfirm={() => imp.mutate()} onClose={() => setAsk(false)} />
    </>
  );
}

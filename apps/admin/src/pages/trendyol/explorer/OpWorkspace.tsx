import { useEffect, useMemo, useState } from "react";
import { BookOpen, Copy, Send, TriangleAlert } from "lucide-react";
import { Button, Card, Field, Tabs, cx, useToast } from "../../../components/ui";
import { Term } from "../../../components/help/Term";
import { EnvPill, MethodChip, OpFlags, RiskBadge } from "../../../components/trendyol/Chips";
import { ParamsForm } from "./ParamsForm";
import { BodyEditor } from "./BodyEditor";
import type { BodyFile } from "./BodyEditor";
import { ResponseViewer } from "./ResponseViewer";
import {
  buildCurl, buildRequest, checkJson, defaultValues, loadSaved, loc, maskSeller, prettyJson, saveSaved, useTrendyolCall,
} from "../../../lib/trendyol";
import type { ParamValues, TrendyolCatalog, TrendyolOperation } from "../../../lib/trendyol";
import { useT } from "../../../i18n";

type Tab = "params" | "body" | "preview";

interface Props { op: TrendyolOperation; cat: TrendyolCatalog; initialValues?: ParamValues }

/** Detail + request builder + response viewer of one operation. Mount with `key` = operation id (+ restore counter). */
export function OpWorkspace({ op, cat, initialValues }: Props) {
  const { t, locale } = useT(); const toast = useToast();
  const saved = useMemo(() => (initialValues ? null : loadSaved(op.id)), [op.id, initialValues]);
  const [values, setValues] = useState<ParamValues>(() => ({ ...defaultValues(op), ...(initialValues ?? saved?.values ?? {}) }));
  const [bodyText, setBodyText] = useState<string>(() => saved?.body ?? (op.body.example !== undefined ? prettyJson(op.body.example) : ""));
  const [file, setFile] = useState<BodyFile | null>(null);
  const [tab, setTab] = useState<Tab>("params");
  const [showMissing, setShowMissing] = useState(false);
  const call = useTrendyolCall();
  const hasBody = op.body.kind !== "none";
  const isRead = op.risk === "read";

  useEffect(() => { saveSaved(op.id, { values, body: bodyText }); }, [op.id, values, bodyText]);

  const req = useMemo(() => buildRequest(op, values, cat.env, cat.sellerId), [op, values, cat.env, cat.sellerId]);
  const bodyCheck = op.body.kind === "json" && bodyText.trim() ? checkJson(bodyText) : null;
  const bodyValue: unknown = op.body.kind === "multipart" ? (file ? { file } : undefined) : bodyCheck?.ok ? bodyCheck.value : undefined;
  const curl = useMemo(() => buildCurl(op, req, bodyValue === undefined && bodyCheck && !bodyCheck.ok ? bodyText : bodyValue, cat.sellerId), [op, req, bodyValue, bodyCheck, bodyText, cat.sellerId]);

  const blockers: string[] = [];
  if (req.missing.length) blockers.push(t("trendyol.send.missing", { names: req.missing.join(", ") }));
  if (bodyCheck && !bodyCheck.ok) blockers.push(t("trendyol.send.badJson"));
  if (op.body.kind === "multipart" && !file) blockers.push(t("trendyol.send.needFile"));
  const tooBig = bodyText.length > cat.limits.maxBodyBytes;
  if (tooBig) blockers.push(t("trendyol.send.tooBig"));

  const send = async (pageOverride?: number) => {
    if (blockers.length) { setShowMissing(true); toast.error(blockers[0]!); return; }
    setShowMissing(false);
    const query: Record<string, unknown> = { ...req.query };
    if (pageOverride !== undefined && op.pagination) query[op.pagination.pageParam] = pageOverride;
    await call.run(op, { path: req.path, query, body: bodyValue });
  };

  const canSend = cat.canSend;
  const sendLabel = t(cat.mode === "mock" ? "trendyol.send.mock" : "trendyol.send.live");
  const tabs: { id: Tab; label: string }[] = [{ id: "params", label: t("trendyol.tab.params") }, ...(hasBody ? [{ id: "body" as const, label: t("trendyol.tab.body") }] : []), { id: "preview", label: t("trendyol.tab.preview") }];

  return (
    <div className="space-y-5" onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && canSend && !call.isPending) { e.preventDefault(); void send(); } }}>
      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold leading-tight">{loc(op.title, locale)}</h2>
          <RiskBadge risk={op.risk} /> <OpFlags op={op} />
        </div>
        <p className="max-w-3xl text-sm text-muted">{loc(op.summary, locale)}</p>
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-canvas px-3 py-2">
          <MethodChip method={op.method} />
          <code data-testid="tdy-endpoint" className="min-w-0 break-all font-mono text-[12.5px]">{req.url}</code>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
          <code className="font-mono">{op.id}</code>
          <a href={op.docsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-brand-ink hover:underline"><BookOpen size={12} />{t("trendyol.op.docs")}</a>
          {op.rateLimit && <span>{t("trendyol.op.rateLimit")}: {loc(op.rateLimit, locale)}</span>}
          <span>{t("trendyol.op.sellerNote")} <Term id="sellerid" />{cat.sellerId ? ` ${maskSeller(cat.sellerId)}` : ""}</span>
        </div>
        {op.deprecated && <div role="alert" className="flex items-start gap-2 rounded-lg border border-warn-line bg-warn-soft px-3 py-2 text-sm text-warn"><TriangleAlert size={16} className="mt-0.5 shrink-0" /><span><strong>{t("trendyol.flag.deprecated")}.</strong> {loc(op.deprecated, locale)}</span></div>}
        {op.envs && op.envs.length === 1 && op.envs[0] === "stage" && <p className="rounded-lg border border-info-line bg-info-soft px-3 py-2 text-sm text-info">{t("trendyol.op.stageOnlyNote")} <Term id="stage" /></p>}
        {op.notes && <p className="rounded-lg bg-hover px-3 py-2 text-sm text-muted">{loc(op.notes, locale)}</p>}
      </header>

      <Card title={t("trendyol.request.title")} actions={<span className="text-xs text-muted">{t("trendyol.send.shortcut")}</span>}>
        <Tabs tabs={tabs} value={tab} onChange={setTab} label={t("trendyol.request.title")} />
        {tab === "params" && <ParamsForm op={op} values={values} onChange={setValues} />}
        {tab === "body" && <BodyEditor op={op} text={bodyText} onText={setBodyText} file={file} onFile={setFile} maxBytes={cat.limits.maxBodyBytes} />}
        {tab === "preview" && (
          <Field label={t("trendyol.preview.label")} hint={t("trendyol.preview.hint")} help="trendyol.curl">
            <div className="relative">
              <pre data-testid="tdy-curl" className="max-h-80 overflow-auto whitespace-pre rounded-lg border border-line bg-canvas p-3 pr-12 font-mono text-[12.5px]">{curl}</pre>
              <Button variant="secondary" size="sm" className="absolute right-2 top-2" aria-label={t("trendyol.preview.copy")} onClick={() => void navigator.clipboard?.writeText(curl).then(() => toast.success(t("common.copied")))}><Copy size={13} /></Button>
            </div>
          </Field>
        )}
        {showMissing && blockers.length > 0 && <ul role="alert" className="mt-4 list-disc space-y-0.5 pl-5 text-sm text-danger">{blockers.map((b) => <li key={b}>{b}</li>)}</ul>}
        <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-line pt-4">
          <Button variant={op.risk === "destructive" ? "danger" : "primary"} className={cx(op.risk === "write" && "!bg-warn !text-canvas hover:!opacity-90")} loading={call.isPending} disabled={!canSend} onClick={() => void send()}><Send size={14} />{sendLabel}</Button>
          {cat.mode === "mock" ? <span className="text-xs font-semibold text-danger">{t("trendyol.send.mockLabel")}</span>
            : cat.mode === "live" ? <span className="inline-flex items-center gap-2 text-xs text-muted"><EnvPill env={cat.env} />{!isRead && t("trendyol.send.confirmNote")}</span>
            : <span className="text-xs text-muted">{t("trendyol.send.disabledNote")}</span>}
        </div>
      </Card>

      <Card title={t("trendyol.response.title")}>
        {call.isPending && !call.result ? <p role="status" className="py-6 text-center text-sm text-muted">{t("trendyol.response.sending")}</p>
          : call.result ? <ResponseViewer key={call.result.durationMs + call.result.status + String(call.result.request.url)} op={op} result={call.result} busy={call.isPending} onPage={(p) => void send(p)} />
          : call.error ? <p role="alert" className="py-6 text-center text-sm text-danger">{t("trendyol.response.failed")}</p>
          : <p className="py-6 text-center text-sm text-muted">{t("trendyol.response.empty")}</p>}
      </Card>
      {call.confirmNode}
    </div>
  );
}

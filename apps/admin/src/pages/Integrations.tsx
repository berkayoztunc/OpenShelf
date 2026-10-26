import { useCallback, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Bell, Check, Circle, FlaskConical, Info, Plug, Search, Zap } from "lucide-react";
import { api, errMsg } from "../lib/api";
import { dateTime, timeAgo } from "../lib/format";
import { useT } from "../i18n";
import { localizeDetail } from "../components/TestResult";
import { CATEGORIES, CHECKLIST, INTEGRATIONS_KEY, categoryLabel, categoryOf, integrationDescription, integrationName, isConfigured, statusOf, useIntegrations } from "../lib/integrations";
import type { CategoryId, StatusKind } from "../lib/integrations";
import { useSettings } from "../lib/settings";
import type { Integration } from "../lib/types";
import { Badge, Button, Drawer, EmptyState, ErrorState, PageHeader, Skeleton, Toggle, cx, useToast } from "../components/ui";
import type { Tone } from "../components/ui";
import { IntegrationForm } from "../components/IntegrationForm";
import { TestResultPanel } from "../components/TestResult";
import type { TestResult } from "../components/TestResult";

const PILL: Record<StatusKind, { tone: Tone }> = {
  unconfigured: { tone: "neutral" }, configured: { tone: "info" }, connected: { tone: "success" }, error: { tone: "danger" }, mock: { tone: "danger" },
};
const MONO = ["bg-info-soft text-info ring-info-line", "bg-success-soft text-success ring-success-line", "bg-warn-soft text-warn ring-warn-line", "bg-danger-soft text-danger ring-danger-line"];
export const Monogram = ({ name, provider, size = "md" }: { name: string; provider: string; size?: "md" | "lg" }) => (
  <span aria-hidden className={cx("grid shrink-0 place-items-center rounded-lg font-display font-semibold ring-1 ring-inset", size === "lg" ? "size-11 text-xl" : "size-10 text-lg", MONO[[...provider].reduce((n, c) => n + c.charCodeAt(0), 0) % 4])}>{name.charAt(0).toUpperCase()}</span>
);

function StatusPill({ it, status }: { it: Integration; status: StatusKind }) {
  const { t } = useT();
  const { tone } = PILL[status]; const label = t(`integrations.status.${status}`);
  return <Badge tone={tone}>{label}{status === "connected" && it.health?.at ? ` · ${timeAgo(it.health.at)}` : ""}</Badge>;
}

/** Hook: run connection tests (single or sequential "test all") and keep per-provider progress/results. */
function useTests() {
  const qc = useQueryClient(); const toast = useToast(); const { t } = useT();
  const [results, setResults] = useState<Record<string, TestResult>>({});
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const busy = useRef(false);
  const run = useCallback(async (it: Integration, notify: "all" | "fail" = "all"): Promise<boolean> => {
    setResults((r) => ({ ...r, [it.provider]: { state: "running" } }));
    let res: TestResult;
    try {
      const r = await api.post<{ ok: boolean; detail?: string }>(`/api/admin/integrations/${it.provider}/test`);
      res = { state: r.ok ? "ok" : "fail", detail: r.detail?.replace(/^(mock mode: )+/i, "Mock mode: "), at: new Date().toISOString() };
    } catch (e) { res = { state: "fail", detail: errMsg(e), at: new Date().toISOString() }; }
    setResults((r) => ({ ...r, [it.provider]: res }));
    if (res.state === "ok" ? notify === "all" : true) { if (res.state === "ok") toast.success(t("integrations.toast.testOk", { name: integrationName(it) })); else toast.error(t("integrations.toast.testFail", { name: integrationName(it), detail: res.state === "fail" ? (res.detail ? localizeDetail(res.detail) : t("integrations.toast.failed")) : "" })); }
    return res.state === "ok";
  }, [toast, t]);
  const testOne = useCallback(async (it: Integration) => { await run(it); qc.invalidateQueries({ queryKey: INTEGRATIONS_KEY }); }, [run, qc]);
  const testAll = useCallback(async (targets: Integration[]) => {
    if (busy.current || !targets.length) return;
    busy.current = true; let pass = 0;
    for (let i = 0; i < targets.length; i++) { setProgress({ done: i, total: targets.length }); if (await run(targets[i]!, "fail")) pass++; }
    setProgress(null); busy.current = false;
    qc.invalidateQueries({ queryKey: INTEGRATIONS_KEY });
    (pass === targets.length ? toast.success : toast.error)(t("integrations.toast.testAll", { pass, total: targets.length }));
  }, [run, qc, toast, t]);
  return { results, progress, testOne, testAll };
}

function IntegrationCard({ it, mockMode, result, onConfigure, onTest, onToggle, toggling }: {
  it: Integration; mockMode: boolean; result?: TestResult; onConfigure: () => void; onTest: () => void; onToggle: (v: boolean) => void; toggling: boolean;
}) {
  const { t } = useT();
  const status = statusOf(it, mockMode);
  const canTest = mockMode || isConfigured(it);
  const name = integrationName(it);
  return (
    <article aria-label={name} data-provider={it.provider} data-status={status} className={cx("flex flex-col gap-4 rounded-xl border bg-surface p-5 shadow-soft transition", status === "error" ? "border-danger-line" : "border-line hover:border-line-strong")}>
      <header className="flex items-start gap-3">
        <Monogram name={name} provider={it.provider} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[15px] font-semibold leading-tight">{name}</h3>
          <p className="mt-1"><span className="rounded-md bg-hover px-1.5 py-0.5 text-[11px] font-medium text-muted">{categoryLabel(categoryOf(it.provider))}</span></p>
        </div>
        <Toggle hideLabel label={t("integrations.card.enable", { name })} checked={it.enabled} onChange={(v) => !mockMode && !toggling && onToggle(v)} />
      </header>
      <p className="line-clamp-2 min-h-10 text-sm text-muted">{integrationDescription(it) || t("integrations.card.noDescription")}</p>
      <div className="flex flex-wrap items-center gap-2"><StatusPill it={it} status={status} /></div>
      <TestResultPanel result={result} fallback={mockMode ? null : it.health} compact />
      <div className="mt-auto flex flex-wrap items-center gap-2">
        <Button variant={status === "unconfigured" ? "primary" : "secondary"} size="sm" onClick={onConfigure}>{t("integrations.card.configure")}</Button>
        <Button variant="secondary" size="sm" loading={result?.state === "running"} disabled={!canTest} title={canTest ? undefined : t("integrations.card.configureFirst")} onClick={onTest}><FlaskConical size={14} />{t("integrations.card.test")}</Button>
        <Link to={`/integration-events?provider=${it.provider}`} className="ml-auto inline-flex items-center gap-1 text-[13px] font-medium text-muted transition hover:text-ink"><Zap size={13} />{t("integrations.card.events")}</Link>
      </div>
    </article>
  );
}

function Checklist({ list, mockMode, onOpen }: { list: Integration[]; mockMode: boolean; onOpen: (provider: string) => void }) {
  const { t } = useT();
  const items = CHECKLIST.map((c) => {
    const ps = list.filter((i) => c.providers.includes(i.provider));
    const states = ps.map((p) => statusOf(p, mockMode));
    const done = states.some((s) => s === "connected");
    const target = ps.find((p) => statusOf(p, mockMode) === "connected") ?? ps.find((p) => isConfigured(p)) ?? ps[0];
    const next = t(mockMode ? "integrations.checklist.simulated" : done ? "integrations.checklist.connected" : states.includes("error") ? "integrations.checklist.fixError" : states.includes("configured") ? "integrations.checklist.runTest" : "integrations.checklist.setUp");
    return { ...c, done, mock: mockMode, target, next };
  }).filter((c) => c.target);
  if (!items.length) return null;
  const doneN = items.filter((i) => i.done).length;
  return (
    <section aria-label={t("integrations.checklist.title")} className="mb-6 rounded-xl border border-line bg-surface p-4 shadow-soft sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-3"><h2 className="text-sm font-semibold">{t("integrations.checklist.title")}</h2><p className="text-xs text-muted">{mockMode ? t("integrations.checklist.mock") : t("integrations.checklist.progress", { done: doneN, n: items.length })}</p></div>
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((c) => (
          <li key={c.id}>
            <button type="button" onClick={() => onOpen(c.target!.provider)} disabled={false}
              className="group flex w-full items-center gap-3 rounded-lg border border-line px-3 py-2.5 text-left transition hover:border-line-strong hover:bg-hover">
              <span aria-hidden className={cx("grid size-5 shrink-0 place-items-center rounded-full ring-1 ring-inset", c.done ? "bg-success-soft text-success ring-success-line" : c.mock ? "bg-warn-soft text-warn ring-warn-line" : "text-faint ring-line-strong")}>{c.done ? <Check size={12} strokeWidth={3} /> : c.mock ? <FlaskConical size={11} /> : <Circle size={0} />}</span>
              <span className="min-w-0 flex-1"><span className="block text-[13px] font-medium">{t(c.labelKey)}</span><span className="block truncate text-xs text-muted">{integrationName(c.target!)}</span></span>
              <span className={cx("inline-flex items-center gap-1 text-xs font-medium", c.done ? "text-success" : "text-brand-ink")}>{c.next}{!c.done && !c.mock && <ArrowRight size={12} className="transition group-hover:translate-x-0.5" />}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Summary({ list, mockMode, onTestAll, progress }: { list: Integration[]; mockMode: boolean; onTestAll: () => void; progress: { done: number; total: number } | null }) {
  const { t } = useT();
  const statuses = list.map((i) => statusOf(i, mockMode));
  const connected = statuses.filter((s) => s === "connected").length;
  const failing = statuses.filter((s) => s === "error").length;
  const lastAt = list.map((i) => i.health?.at).filter(Boolean).sort().pop();
  const Stat = ({ label, value, tone }: { label: string; value: string; tone?: string }) => (
    <div className="rounded-lg bg-canvas px-4 py-3 ring-1 ring-inset ring-line"><p className="text-xs text-muted">{label}</p><p className={cx("mt-0.5 font-display text-xl font-semibold tabular-nums", tone)}>{value}</p></div>
  );
  return (
    <section aria-label={t("integrations.summary.label")} className="mb-6 flex flex-wrap items-stretch gap-3">
      <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label={t("integrations.summary.connected")} value={mockMode ? t("integrations.summary.simulated", { n: list.length }) : t("integrations.summary.ofTotal", { c: connected, n: list.length })} />
        <Stat label={t("integrations.summary.healthy")} value={mockMode ? t("integrations.summary.allMock") : failing ? t("integrations.summary.failing", { c: connected, f: failing }) : `${connected}`} tone={failing ? "text-danger" : undefined} />
        <Stat label={t("integrations.summary.lastTested")} value={mockMode ? t("integrations.summary.na") : lastAt ? timeAgo(lastAt) : t("integrations.summary.never")} />
      </div>
      <div className="flex items-center">
        <Button onClick={onTestAll} loading={!!progress} disabled={!list.some((i) => mockMode || i.enabled)}><FlaskConical size={15} />{progress ? t("integrations.summary.testing", { i: Math.min(progress.done + 1, progress.total), n: progress.total }) : t("integrations.summary.testAll")}</Button>
      </div>
      {lastAt && !mockMode && <span className="sr-only">{t("integrations.summary.lastTestedAt", { date: dateTime(lastAt) })}</span>}
    </section>
  );
}

export default function Integrations() {
  const q = useIntegrations();
  const settings = useSettings();
  const qc = useQueryClient(); const toast = useToast(); const { t } = useT();
  const mockMode = !!settings.data?.system?.mockMode || !!q.data?.some((i) => i.mock);
  const [params, setParams] = useSearchParams();
  const [open, setOpen] = useState<string | null>(params.get("configure"));
  const [cat, setCat] = useState<CategoryId | "all">("all");
  const [search, setSearch] = useState("");
  const [toggling, setToggling] = useState<string | null>(null);
  const list = useMemo(() => q.data ?? [], [q.data]);
  const { results, progress, testOne, testAll } = useTests();

  const closeDrawer = () => { setOpen(null); if (params.has("configure")) { params.delete("configure"); setParams(params, { replace: true }); } };
  const toggle = async (it: Integration, enabled: boolean) => {
    setToggling(it.provider);
    try {
      await api.put(`/api/admin/integrations/${it.provider}`, { enabled, config: it.configPublic ?? {} });
      await qc.invalidateQueries({ queryKey: INTEGRATIONS_KEY }); toast.success(t(enabled ? "integrations.toast.enabled" : "integrations.toast.disabled", { name: integrationName(it) }));
    } catch (e) { toast.error(errMsg(e)); } finally { setToggling(null); }
  };

  const counts = useMemo(() => Object.fromEntries(CATEGORIES.map((c) => [c.id, list.filter((i) => categoryOf(i.provider) === c.id).length])) as Record<CategoryId, number>, [list]);
  const needle = search.trim().toLowerCase();
  const shown = list.filter((i) => (cat === "all" || categoryOf(i.provider) === cat) && (!needle || `${integrationName(i)} ${i.name} ${i.provider} ${integrationDescription(i) ?? ""} ${categoryLabel(categoryOf(i.provider))}`.toLowerCase().includes(needle)));
  const current = list.find((i) => i.provider === open);

  return (
    <>
      <PageHeader title={t("integrations.title")} description={t("integrations.description")} guide="integrations#entegrasyonlari-test-etme" />
      {mockMode && (
        <p role="status" data-testid="integrations-mock-note" className="mb-6 flex items-start gap-2.5 rounded-xl border border-info-line bg-info-soft px-4 py-3 text-sm text-info">
          <Info size={17} className="mt-0.5 shrink-0" /><span><strong className="font-semibold">{t("integrations.mockNote.title")}</strong> {t("integrations.mockNote.body")}</span>
        </p>
      )}
      {q.isPending ? (
        <div aria-busy role="status" aria-label={t("integrations.loading")}><Skeleton className="mb-6 h-20 rounded-xl" /><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-56 rounded-xl" />)}</div></div>
      ) : q.isError ? <ErrorState error={q.error} retry={() => q.refetch()} /> : (
        <>
          <Summary list={list} mockMode={mockMode} progress={progress} onTestAll={() => testAll(list.filter((i) => mockMode || i.enabled))} />
          <Checklist list={list} mockMode={mockMode} onOpen={setOpen} />
          <div className="mb-5 flex flex-wrap items-center gap-3">
            <div role="group" aria-label={t("integrations.filter.label")} className="flex flex-1 flex-wrap gap-2">
              {[{ id: "all" as const, label: t("integrations.filter.all"), n: list.length }, ...CATEGORIES.map((c) => ({ ...c, label: categoryLabel(c.id), n: counts[c.id] })).filter((c) => c.n > 0)].map((c) => (
                <button key={c.id} type="button" aria-pressed={cat === c.id} onClick={() => setCat(c.id)}
                  className={cx("inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-medium transition", cat === c.id ? "border-brand-600 bg-brand-50 text-brand-ink" : "border-line text-muted hover:border-line-strong hover:text-ink")}>
                  {c.label}<span className="text-xs opacity-70">{c.n}</span>
                </button>
              ))}
            </div>
            <label className="relative block w-full sm:w-64"><span className="sr-only">{t("integrations.filter.search")}</span>
              <Search size={15} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
              <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("integrations.filter.search")} className="w-full rounded-lg border border-line bg-surface py-2 pl-9 pr-3 text-sm text-ink placeholder:text-faint hover:border-line-strong focus:border-brand-600 focus:ring-4 focus:ring-brand-600/15 dark:bg-canvas" />
            </label>
          </div>
          {shown.length === 0 ? (
            <div className="rounded-xl border border-dashed border-line-strong"><EmptyState icon={<Plug size={22} />} title={list.length ? t("integrations.empty.noMatch") : t("integrations.empty.none")} description={list.length ? t("integrations.empty.tryOther") : t("integrations.empty.noAdapters")}
              action={list.length ? <Button variant="secondary" onClick={() => { setCat("all"); setSearch(""); }}>{t("integrations.filter.clear")}</Button> : undefined} /></div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {shown.map((it) => (
                <IntegrationCard key={it.provider} it={it} mockMode={mockMode} result={results[it.provider]} toggling={toggling === it.provider}
                  onConfigure={() => setOpen(it.provider)} onTest={() => testOne(it)} onToggle={(v) => toggle(it, v)} />
              ))}
              {(cat === "all" || cat === "messaging") && !needle && (
                <Link to="/settings/notifications" className="group flex flex-col justify-between gap-4 rounded-xl border border-dashed border-line-strong p-5 transition hover:border-brand-600 hover:bg-hover">
                  <span className="grid size-10 place-items-center rounded-lg bg-brand-50 text-brand-ink"><Bell size={18} /></span>
                  <span><span className="block text-[15px] font-semibold">{t("integrations.notifyCard.title")}</span><span className="mt-1 block text-sm text-muted">{t("integrations.notifyCard.body")}</span></span>
                  <span className="inline-flex items-center gap-1 text-[13px] font-medium text-brand-ink">{t("integrations.notifyCard.open")}<ArrowRight size={14} className="transition group-hover:translate-x-0.5" /></span>
                </Link>
              )}
            </div>
          )}
        </>
      )}
      <Drawer open={!!current} onClose={closeDrawer}
        title={current && <span className="flex items-center gap-3"><Monogram name={integrationName(current)} provider={current.provider} />{integrationName(current)}</span>}
        subtitle={current && <span className="flex flex-wrap items-center gap-2 pl-[3.25rem]"><StatusPill it={current} status={statusOf(current, mockMode)} /><span>{categoryLabel(categoryOf(current.provider))}</span></span>}>
        {current && <IntegrationForm key={current.provider + String(current.health?.at ?? "")} integration={current} mockMode={mockMode} testResult={results[current.provider]} onTest={() => testOne(current)} />}
      </Drawer>
    </>
  );
}

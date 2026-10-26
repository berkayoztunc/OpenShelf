import { useMemo, useState } from "react";
import { Pencil, RefreshCw } from "lucide-react";
import { Button, Card, EmptyState, SelectField, TextArea, cx } from "../../../components/ui";
import { InlineError, RangeFields, StatusBadge, TableSkeleton, Thumb, TyErrorBox, TyPager, ViewGate, num, paged, presetRange, rangeValid, rec, str, tsDate, useOps, useTyQuery, useTyWrite } from "../../../components/trendyol/views/shared";
import type { Range } from "../../../components/trendyol/views/shared";
import { timeAgo } from "../../../lib/format";
import { useT } from "../../../i18n";

/** Trendyol's documented answer length rule (answerQuestion notes). */
export const ANSWER_MIN = 10;
export const ANSWER_MAX = 2000;
export const answerProblem = (text: string): "empty" | "short" | "long" | null => {
  const n = text.trim().length;
  return n === 0 ? "empty" : n < ANSWER_MIN ? "short" : n > ANSWER_MAX ? "long" : null;
};
const TPL_KEY = "os_trendyol_q_templates";
const loadTpl = (): string[] | null => { try { const v = JSON.parse(localStorage.getItem(TPL_KEY) ?? "null") as unknown; return Array.isArray(v) && v.length === 3 && v.every((x) => typeof x === "string") ? (v as string[]) : null; } catch { return null; } };
const saveTpl = (v: string[]) => { try { localStorage.setItem(TPL_KEY, JSON.stringify(v)); } catch { /* storage unavailable */ } };
const STATUSES = ["WAITING_FOR_ANSWER", "ANSWERED", "REJECTED", "REPORTED"] as const;
const OPS = ["getQuestionFilter", "answerQuestion"];

export default function QuestionsView() { return <ViewGate><QuestionsBody /></ViewGate>; }

function QuestionsBody() {
  const { t } = useT();
  const { ops } = useOps(OPS);
  const w = useTyWrite();
  const [status, setStatus] = useState<string>("WAITING_FOR_ANSWER");
  const [useDates, setUseDates] = useState(false);
  const [range, setRange] = useState<Range>(() => presetRange("d7"));
  const [page, setPage] = useState(0);
  const defaults = [t("trendyolviews.questions.tpl1"), t("trendyolviews.questions.tpl2"), t("trendyolviews.questions.tpl3")];
  const [tpl, setTpl] = useState<string[]>(() => loadTpl() ?? defaults);
  const [editTpl, setEditTpl] = useState(false);
  const valid = !useDates || rangeValid(range, 14);
  const query = { page, size: 20, status, ...(useDates ? { startDate: range.start, endDate: range.end } : {}) };
  const q = useTyQuery(w.call.run, ops.getQuestionFilter, { query }, { enabled: valid });
  const data = useMemo(() => paged(q.data?.response.body), [q.data]);

  return (
    <div className="space-y-5">
      <Card title={t("trendyolviews.questions.filters")} actions={<Button size="sm" variant="secondary" loading={q.isFetching} onClick={() => void q.refetch()}><RefreshCw size={13} />{t("trendyolviews.common.refresh")}</Button>}>
        <div className="space-y-4">
          <div className="max-w-sm"><SelectField label={t("trendyolviews.questions.status")} hint={t("trendyolviews.questions.status.hint")} help="trendyolviews.questionStatus" value={status} onChange={(e) => { setPage(0); setStatus(e.target.value); }}>
            {STATUSES.map((s) => <option key={s} value={s}>{t(`trendyolviews.status.question.${s}`)}</option>)}
          </SelectField></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={useDates} onChange={(e) => { setPage(0); setUseDates(e.target.checked); }} />{t("trendyolviews.questions.useDates")}</label>
          {useDates && <RangeFields idPrefix="tyq" range={range} maxDays={14} presets={["today", "d3", "d7", "d14"]} onChange={(r) => { setPage(0); setRange(r); }} />}
        </div>
      </Card>

      <Card title={t("trendyolviews.questions.templates")} actions={<Button size="sm" variant="ghost" onClick={() => { if (editTpl) saveTpl(tpl); setEditTpl(!editTpl); }}><Pencil size={13} />{editTpl ? t("trendyolviews.questions.templates.save") : t("trendyolviews.questions.templates.edit")}</Button>}>
        <p className="mb-3 text-xs text-muted">{t("trendyolviews.questions.templates.hint")}</p>
        {editTpl ? <div className="grid gap-3 lg:grid-cols-3">{tpl.map((x, i) => <TextArea key={i} label={t("trendyolviews.questions.templates.n", { n: i + 1 })} help="trendyolviews.replyTemplate" value={x} onChange={(e) => setTpl(tpl.map((y, j) => (j === i ? e.target.value : y)))} />)}</div>
          : <ol className="grid gap-2 lg:grid-cols-3">{tpl.map((x, i) => <li key={i} className="rounded-lg border border-line bg-canvas p-3 text-xs text-muted">{x}</li>)}</ol>}
      </Card>

      {!valid ? <Card><EmptyState title={t("trendyolviews.questions.invalidRange")} /></Card>
        : q.isPending ? <TableSkeleton rows={4} />
        : q.error ? <TyErrorBox error={q.error} retry={() => void q.refetch()} />
        : data.content.length === 0 ? <Card><EmptyState title={t("trendyolviews.questions.empty.title")} description={t("trendyolviews.questions.empty.body")} action={status !== "WAITING_FOR_ANSWER" ? <Button variant="secondary" onClick={() => setStatus("WAITING_FOR_ANSWER")}>{t("trendyolviews.questions.empty.action")}</Button> : undefined} /></Card>
        : <><ul className="space-y-3" aria-label={t("trendyolviews.questions.title")}>{data.content.map((x) => <QuestionCard key={num(x.id)} q={x} tpl={tpl} w={w} ops={ops} />)}</ul><TyPager data={data} onPage={setPage} /></>}
      {w.call.confirmNode}
    </div>
  );
}

function QuestionCard({ q, tpl, w, ops }: { q: Record<string, unknown>; tpl: string[]; w: ReturnType<typeof useTyWrite>; ops: ReturnType<typeof useOps>["ops"] }) {
  const { t, td } = useT();
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [touched, setTouched] = useState(false);
  const waiting = str(q.status) === "WAITING_FOR_ANSWER";
  const answer = rec(q.answer);
  const problem = answerProblem(text);
  const n = text.trim().length;
  const send = async () => {
    setTouched(true);
    if (problem) return;
    const r = await w.exec(ops.answerQuestion, { path: { id: num(q.id) }, body: { text: text.trim() } });
    if (r?.ok) { setText(""); setOpen(false); }
  };
  return (
    <li className="rounded-xl border border-line bg-surface p-4 shadow-soft" data-testid="tdyv-question">
      <div className="flex gap-3">
        <Thumb src={str(q.imageUrl)} alt={str(q.productName)} size={56} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2"><p className="text-sm font-medium">{str(q.productName)}</p><StatusBadge group="question" value={str(q.status)} /></div>
          <p className="mt-1 text-sm">{str(q.text)}</p>
          <p className="mt-1 text-xs text-muted">{str(q.userName)} · <span title={tsDate(q.creationDate)}>{timeAgo(new Date(num(q.creationDate)).toISOString())}</span></p>
        </div>
      </div>
      {!waiting && answer.text !== undefined && (
        <div className="mt-3 rounded-lg bg-success-soft p-3 text-sm text-success"><p className="text-xs font-medium">{t("trendyolviews.questions.answered")} · {tsDate(answer.creationDate)}</p><p className="mt-1 text-ink">{str(answer.text)}</p></div>
      )}
      {waiting && !open && <div className="mt-3"><Button size="sm" onClick={() => setOpen(true)}>{t("trendyolviews.questions.answer")}</Button></div>}
      {waiting && open && (
        <div className="mt-3 space-y-2">
          <div className="flex flex-wrap gap-2" role="group" aria-label={t("trendyolviews.questions.templates")}>
            {tpl.map((x, i) => <Button key={i} size="sm" variant="secondary" onClick={() => setText(x)}>{t("trendyolviews.questions.templates.use", { n: i + 1 })}</Button>)}
          </div>
          <TextArea label={t("trendyolviews.questions.reply")} hint={t("trendyolviews.questions.reply.hint", { min: ANSWER_MIN, max: ANSWER_MAX })} help="trendyolviews.answerText" value={text} onChange={(e) => setText(e.target.value)}
            error={touched && problem ? td(`trendyolviews.questions.err.${problem}`, { min: ANSWER_MIN, max: ANSWER_MAX }) : undefined} />
          <p className={cx("text-right text-xs tabular-nums", problem === "long" || (touched && problem) ? "text-danger" : "text-muted")} aria-live="polite" data-testid="tdyv-counter">{n} / {ANSWER_MAX}</p>
          <InlineError text={w.err} />
          <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => { setOpen(false); setText(""); }}>{t("common.cancel")}</Button><Button loading={w.call.isPending} onClick={() => void send()}>{t("trendyolviews.questions.send")}</Button></div>
          <p className="text-xs text-muted">{t("trendyolviews.questions.irreversible")}</p>
        </div>
      )}
    </li>
  );
}

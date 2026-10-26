import { useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button, Card, ConfirmDialog, Drawer, EmptyState, Modal, SelectField, Table, Td, TextArea } from "../../../components/ui";
import { Field } from "../../../components/ui";
import { Term } from "../../../components/help/Term";
import { InlineError, KV, RangeFields, Section, StatusBadge, TableSkeleton, TyErrorBox, TyPager, ViewGate, arr, num, paged, presetRange, rangeValid, rec, str, tsDate, useOps, useTyQuery, useTyWrite } from "../../../components/trendyol/views/shared";
import type { Range } from "../../../components/trendyol/views/shared";
import { fileToBase64 } from "../../../lib/trendyol";
import { useT } from "../../../i18n";

const STATUSES = ["Created", "WaitingInAction", "WaitingFraudCheck", "Accepted", "Unresolved", "Rejected", "Cancelled", "InAnalysis"] as const;
/** Rejection reasons that do not need an evidence file (per the catalog notes). */
export const NO_FILE_REASONS = new Set([1651, 451, 2101]);
const OPS = ["getClaims", "approveClaimLineItems", "createClaimIssue", "getClaimIssueReasons", "getClaimItemAudits"];
const itemsOf = (c: Record<string, unknown>) => arr(c.items).flatMap((i) => arr(i.claimItems).map((ci) => ({ ci, line: rec(i.orderLine) })));
const statusOf = (ci: Record<string, unknown>) => str(rec(ci.claimItemStatus).name);

export default function ReturnsView() { return <ViewGate><ReturnsBody /></ViewGate>; }

function ReturnsBody() {
  const { t } = useT();
  const { ops } = useOps(OPS);
  const w = useTyWrite();
  const [status, setStatus] = useState(""); const [useDates, setUseDates] = useState(false);
  const [range, setRange] = useState<Range>(() => presetRange("d14"));
  const [page, setPage] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  const valid = !useDates || rangeValid(range, 90);
  const query = { page, size: 50, ...(status ? { claimItemStatus: status } : {}), ...(useDates ? { startDate: range.start, endDate: range.end } : {}) };
  const q = useTyQuery(w.call.run, ops.getClaims, { query }, { enabled: valid });
  const data = useMemo(() => paged(q.data?.response.body), [q.data]);
  // the open claim is fetched by id so it stays visible (and fresh) after a status change moves it out of the filtered list
  const one = useTyQuery(w.call.run, ops.getClaims, { query: { claimIds: [openId ?? ""], page: 0, size: 1 } }, { enabled: !!openId });
  const claim = openId ? paged(one.data?.response.body).content[0] ?? data.content.find((c) => str(c.id) === openId) ?? null : null;

  return (
    <div className="space-y-5">
      <Card title={t("trendyolviews.returns.filters")} actions={<Button size="sm" variant="secondary" loading={q.isFetching} onClick={() => void q.refetch()}><RefreshCw size={13} />{t("trendyolviews.common.refresh")}</Button>}>
        <div className="space-y-4">
          <div className="max-w-sm"><SelectField label={t("trendyolviews.returns.status")} hint={t("trendyolviews.returns.status.hint")} help="trendyolviews.claimStatus" value={status} onChange={(e) => { setPage(0); setStatus(e.target.value); }}>
            <option value="">{t("trendyolviews.common.all")}</option>
            {STATUSES.map((s) => <option key={s} value={s}>{t(`trendyolviews.status.claim.${s}`)}</option>)}
          </SelectField></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={useDates} onChange={(e) => { setPage(0); setUseDates(e.target.checked); }} />{t("trendyolviews.returns.useDates")}</label>
          {useDates && <RangeFields idPrefix="tyr" range={range} maxDays={90} presets={["d3", "d7", "d14"]} onChange={(r) => { setPage(0); setRange(r); }} />}
        </div>
      </Card>

      <Card>
        {!valid ? <EmptyState title={t("trendyolviews.returns.invalidRange")} />
          : q.isPending ? <TableSkeleton />
          : q.error ? <TyErrorBox error={q.error} retry={() => void q.refetch()} />
          : data.content.length === 0 ? <EmptyState title={t("trendyolviews.returns.empty.title")} description={t("trendyolviews.returns.empty.body")} action={status || useDates ? <Button variant="secondary" onClick={() => { setStatus(""); setUseDates(false); }}>{t("trendyolviews.returns.empty.action")}</Button> : undefined} />
          : <>
            <Table caption={t("trendyolviews.returns.title")} head={[t("trendyolviews.returns.col.order"), t("trendyolviews.returns.col.date"), t("trendyolviews.returns.col.customer"), t("trendyolviews.returns.col.product"), t("trendyolviews.returns.col.reason"), t("trendyolviews.returns.col.status")]}>
              {data.content.map((c) => {
                const its = itemsOf(c); const first = its[0];
                return (
                  <tr key={str(c.id)} className="cursor-pointer" onClick={() => setOpenId(str(c.id))}>
                    <Td><button type="button" className="font-mono text-[13px] font-medium text-brand-ink hover:underline focus-visible:underline" aria-label={t("trendyolviews.returns.open", { no: str(c.orderNumber) })} onClick={(e) => { e.stopPropagation(); setOpenId(str(c.id)); }}>{str(c.orderNumber)}</button></Td>
                    <Td className="whitespace-nowrap text-muted">{tsDate(c.claimDate)}</Td>
                    <Td>{[c.customerFirstName, c.customerLastName].filter(Boolean).join(" ")}</Td>
                    <Td className="max-w-56 truncate">{first ? str(first.line.productName) : "-"}{its.length > 1 ? ` +${its.length - 1}` : ""}</Td>
                    <Td className="max-w-48 truncate text-muted">{first ? str(rec(first.ci.customerClaimItemReason).name) : "-"}</Td>
                    <Td>{first ? <StatusBadge group="claim" value={statusOf(first.ci)} /> : "-"}</Td>
                  </tr>
                );
              })}
            </Table>
            <TyPager data={data} onPage={setPage} />
          </>}
      </Card>
      {w.call.confirmNode}
      {claim && <ClaimDrawer claim={claim} ops={ops} w={w} onClose={() => setOpenId(null)} />}
    </div>
  );
}

function ClaimDrawer({ claim, ops, w, onClose }: { claim: Record<string, unknown>; ops: ReturnType<typeof useOps>["ops"]; w: ReturnType<typeof useTyWrite>; onClose: () => void }) {
  const { t } = useT();
  const items = itemsOf(claim);
  const waiting = items.filter((x) => statusOf(x.ci) === "WaitingInAction");
  const [confirmIds, setConfirmIds] = useState<string[] | null>(null);
  const [rejecting, setRejecting] = useState<string[] | null>(null);
  const [auditFor, setAuditFor] = useState<string | null>(null);
  const claimId = str(claim.id);
  const approve = async () => { const ids = confirmIds ?? []; setConfirmIds(null); await w.exec(ops.approveClaimLineItems, { path: { claimId }, body: { claimLineItemIdList: ids, params: {} } }, { skipConfirm: true }); };
  return (
    <Drawer open onClose={onClose} title={<span className="font-mono">{str(claim.orderNumber)}</span>} subtitle={<span className="flex flex-wrap items-center gap-2"><Term id="claim" /><span>{tsDate(claim.claimDate)}</span></span>}
      footer={<><Button variant="ghost" onClick={onClose}>{t("common.close")}</Button>
        {waiting.length > 0 && <><Button variant="secondary" onClick={() => setRejecting(waiting.map((x) => str(x.ci.id)))}>{t("trendyolviews.returns.rejectAll")}</Button><Button variant="danger" onClick={() => setConfirmIds(waiting.map((x) => str(x.ci.id)))}>{t("trendyolviews.returns.approveAll")}</Button></>}</>}>
      <div className="space-y-6" data-testid="tdyv-claim-drawer">
        <InlineError text={w.err} />
        <Section title={t("trendyolviews.returns.customer")}>
          <p className="text-xs text-muted">{t("trendyolviews.orders.piiNote")}</p>
          <dl className="grid gap-3 sm:grid-cols-2">
            <KV label={t("trendyolviews.orders.name")}>{[claim.customerFirstName, claim.customerLastName].filter(Boolean).join(" ")}</KV>
            <KV label={t("trendyolviews.orders.cargo")}>{str(claim.cargoProviderName)}</KV>
            <KV label={t("trendyolviews.orders.tracking")} mono>{str(claim.cargoTrackingNumber)}</KV>
            <KV label={t("trendyolviews.returns.orderDate")}>{tsDate(claim.orderDate)}</KV>
          </dl>
        </Section>
        <Section title={t("trendyolviews.returns.items")}>
          <ul className="space-y-3">
            {items.map(({ ci, line }) => {
              const id = str(ci.id); const st = statusOf(ci);
              const images = arr(ci.images ?? ci.claimItemImages).map((i) => str(i.url)).filter(Boolean);
              return (
                <li key={id} className="space-y-2 rounded-xl border border-line p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><p className="text-sm font-medium">{str(line.productName)}</p><p className="text-xs text-muted"><Term id="barcode" />: <span className="font-mono">{str(line.barcode)}</span></p></div><StatusBadge group="claim" value={st} /></div>
                  <dl className="grid gap-2 sm:grid-cols-2"><KV label={t("trendyolviews.returns.reason")}>{str(rec(ci.customerClaimItemReason).name)}</KV><KV label={t("trendyolviews.returns.note")}>{str(ci.customerNote)}</KV></dl>
                  {images.length > 0 && <div className="flex flex-wrap gap-2" aria-label={t("trendyolviews.returns.images")}>{images.map((u) => <a key={u} href={u} target="_blank" rel="noopener noreferrer"><img src={u} alt="" className="size-16 rounded-lg object-cover ring-1 ring-line" /></a>)}</div>}
                  <div className="flex flex-wrap gap-2">
                    {st === "WaitingInAction" && <><Button size="sm" variant="danger" onClick={() => setConfirmIds([id])}>{t("trendyolviews.returns.approve")}</Button><Button size="sm" variant="secondary" onClick={() => setRejecting([id])}>{t("trendyolviews.returns.reject")}</Button></>}
                    <Button size="sm" variant="ghost" onClick={() => setAuditFor(auditFor === id ? null : id)} aria-expanded={auditFor === id}>{t("trendyolviews.returns.audit")}</Button>
                  </div>
                  {auditFor === id && <AuditTimeline id={id} ops={ops} w={w} />}
                </li>
              );
            })}
          </ul>
        </Section>
      </div>
      <ConfirmDialog open={!!confirmIds} danger title={t("trendyolviews.returns.approve.confirm.title")} message={t("trendyolviews.returns.approve.confirm.message", { n: confirmIds?.length ?? 0 })} confirmLabel={t("trendyolviews.returns.approve")} loading={w.call.isPending} onClose={() => setConfirmIds(null)} onConfirm={() => void approve()} />
      {rejecting && <RejectDialog claimId={claimId} ids={rejecting} ops={ops} w={w} onClose={() => setRejecting(null)} />}
    </Drawer>
  );
}

function AuditTimeline({ id, ops, w }: { id: string; ops: ReturnType<typeof useOps>["ops"]; w: ReturnType<typeof useTyWrite> }) {
  const { t } = useT();
  const q = useTyQuery(w.call.run, ops.getClaimItemAudits, { path: { claimItemsId: id } });
  if (q.isPending) return <TableSkeleton rows={2} />;
  if (q.error) return <TyErrorBox error={q.error} retry={() => void q.refetch()} />;
  const rows = arr(q.data?.response.body);
  return (
    <ol className="space-y-2 border-l border-line pl-4" aria-label={t("trendyolviews.returns.audit")}>
      {rows.map((a, i) => <li key={i} className="text-sm">{a.previousStatus ? <><StatusBadge group="claim" value={str(a.previousStatus)} /> → </> : null}<StatusBadge group="claim" value={str(a.newStatus)} /><span className="ml-2 text-xs text-muted">{tsDate(a.date)} · {str(rec(a.userInfoDocument).executorApp)}</span></li>)}
      {rows.length === 0 && <li className="text-sm text-muted">{t("trendyolviews.returns.audit.empty")}</li>}
    </ol>
  );
}

function RejectDialog({ claimId, ids, ops, w, onClose }: { claimId: string; ids: string[]; ops: ReturnType<typeof useOps>["ops"]; w: ReturnType<typeof useTyWrite>; onClose: () => void }) {
  const { t } = useT();
  const reasons = useTyQuery(w.call.run, ops.getClaimIssueReasons, {});
  const [reason, setReason] = useState(""); const [desc, setDesc] = useState("");
  const [file, setFile] = useState<{ name: string; type: string; base64: string } | null>(null);
  const [touched, setTouched] = useState(false);
  const list = arr(reasons.data?.response.body);
  // the console endpoint always sends multipart, so an attachment is needed even for reasons Trendyol itself treats as file-optional
  const needFile = !!reason;
  const fileOptionalAtTrendyol = NO_FILE_REASONS.has(Number(reason));
  const errs = { reason: !reason, desc: !desc.trim(), file: needFile && !file };
  const submit = async () => {
    setTouched(true);
    if (errs.reason || errs.desc || errs.file) return;
    const r = await w.exec(ops.createClaimIssue, { path: { claimId }, query: { claimIssueReasonId: Number(reason), claimItemIdList: ids.join(","), description: desc.trim() }, body: { file } });
    if (r?.ok) onClose();
  };
  return (
    <Modal open onClose={onClose} title={t("trendyolviews.returns.reject.title")} footer={<><Button variant="ghost" onClick={onClose}>{t("common.cancel")}</Button><Button loading={w.call.isPending} onClick={() => void submit()}>{t("trendyolviews.returns.reject.submit")}</Button></>}>
      <div className="space-y-4" data-testid="tdyv-reject">
        <p className="text-sm text-muted">{t("trendyolviews.returns.reject.body")}</p>
        <InlineError text={w.err} />
        {reasons.error ? <TyErrorBox error={reasons.error} retry={() => void reasons.refetch()} /> :
          <SelectField label={t("trendyolviews.returns.reject.reason")} hint={t("trendyolviews.returns.reject.reason.hint")} help="trendyolviews.rejectReason" value={reason} onChange={(e) => setReason(e.target.value)} error={touched && errs.reason ? t("trendyolviews.returns.reject.reason.required") : undefined} required>
            <option value="">{reasons.isPending ? t("ui.loading") : t("trendyolviews.returns.reject.reason.pick")}</option>
            {list.map((r) => <option key={num(r.id)} value={num(r.id)}>{str(r.name)}</option>)}
          </SelectField>}
        <TextArea label={t("trendyolviews.returns.reject.desc")} hint={t("trendyolviews.returns.reject.desc.hint")} help="trendyolviews.rejectDesc" value={desc} maxLength={500} onChange={(e) => setDesc(e.target.value)} error={touched && errs.desc ? t("trendyolviews.returns.reject.desc.required") : undefined} />
        <Field label={t("trendyolviews.returns.reject.file")} hint={fileOptionalAtTrendyol ? t("trendyolviews.returns.reject.file.optional") : t("trendyolviews.returns.reject.file.required")} help="trendyolviews.rejectFile" htmlFor="tyr-file" error={touched && errs.file ? t("trendyolviews.returns.reject.file.missing") : undefined}>
          <input id="tyr-file" type="file" accept="image/jpeg,image/png,application/pdf,video/mp4" className="text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-hover file:px-3 file:py-1.5 file:text-sm file:font-medium"
            onChange={async (e) => { const f = e.target.files?.[0]; setFile(f ? await fileToBase64(f) : null); }} />
        </Field>
      </div>
    </Modal>
  );
}

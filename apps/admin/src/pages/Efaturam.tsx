import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Check, ExternalLink, Minus, RefreshCw, X } from "lucide-react";
import { EFATURAM_GROUPS, type EfaturamCallResult, type EfaturamDiagnosisStep, type EfaturamOperation, type EfaturamOutgoingRow } from "@openshelf/shared";
import { Badge, Banner, Button, Card, Drawer, EmptyState, ErrorState, FilterBar, Loading, PageHeader, Pagination, Skeleton, SelectField, Table, Tabs, Td, TextArea, TextField, useDebounced } from "../components/ui";
import { OUTGOING_PAGE_SIZE, httpsUrl, invoiceAliases, isoDay, outgoingLink, pick, recordTone, rowsOf, statusKey, statusTone, useEfaturamCall, useEfaturamDiagnose, useEfaturamOutgoing, type EfaturamCall, type EfaturamInput } from "../lib/efaturam";
import { gloc } from "../lib/geliver";
import { dateTime, enumLabel, money } from "../lib/format";
import { JsonPanel } from "../components/geliver/JsonPanel";
import { useAdmin } from "../lib/auth";
import { useT } from "../i18n";

const pretty = (v: unknown) => { try { return JSON.stringify(v, null, 2); } catch { return String(v); } };
const TABS = ["check", "outgoing", "incoming", "explorer"] as const;
type TabId = (typeof TABS)[number];
type DocKind = "e_arsiv" | "e_fatura";

function StatusBar({ cat }: { cat: EfaturamCall["cat"] }) {
  const { t } = useT(); const admin = useAdmin(); const owner = admin?.role === "owner";
  if (cat.isPending) return <Skeleton className="mb-5 h-14" />;
  if (cat.error || !cat.mode) return null;
  if (cat.mode === "mock") return (
    <Banner tone="danger" testId="ef-mode"><Badge tone="danger">{t("efaturam.mode.mock")}</Badge><p className="min-w-0 flex-1 text-sm font-medium">{t("efaturam.mode.mockBody")}</p></Banner>
  );
  if (cat.mode === "live") return (
    <Banner tone={cat.environment === "live" ? "warning" : "success"} testId="ef-mode">
      <Badge tone="success">{t("efaturam.mode.connected")}</Badge>
      <Badge tone={cat.environment === "live" ? "warning" : "info"}>{t(cat.environment === "live" ? "efaturam.mode.envLive" : "efaturam.mode.envTest")}</Badge>
      <p className="min-w-0 flex-1 text-sm">{t(cat.environment === "live" ? "efaturam.mode.liveBody" : "efaturam.mode.testBody")}</p>
    </Banner>
  );
  return (
    <Banner tone="warning" testId="ef-mode" actions={<>
      <Link to="/integrations?configure=efaturam" className="inline-flex h-8 items-center rounded-lg bg-brand-600 px-3 text-[13px] font-medium text-white hover:bg-brand-700">{t("efaturam.mode.configure")}</Link>
      {owner && <Link to="/settings/system" className="inline-flex h-8 items-center rounded-lg border border-line bg-surface px-3 text-[13px] font-medium text-ink hover:bg-canvas">{t("trendyol.mode.enableMock")}</Link>}
    </>}>
      <Badge tone="warning">{t("efaturam.mode.disabled")}</Badge>
      <p className="text-sm font-medium">{t(cat.reason === "integration_disabled" ? "efaturam.mode.disabledOff" : "efaturam.mode.disabledNotConfigured")}</p>
      <p className="basis-full text-sm">{t("efaturam.mode.disabledBody")}</p>
    </Banner>
  );
}

function StatusBadge({ code }: { code: unknown }) {
  const { t } = useT();
  const key = statusKey(code);
  return <Badge tone={statusTone(code)}>{key ? `${String(code)} · ${t(key)}` : String(code ?? "—")}</Badge>;
}
/** "HTTP 401: Username or Password is wrong. [username-or-password-wrong]": status, provider text and the gateway's problem code. */
const failText = (r: EfaturamCallResult) => `HTTP ${r.status}${r.error?.message ? `: ${r.error.message}` : ""}${r.error?.code ? ` [${r.error.code}]` : ""}`;

/* ------------------------------------------------------------------ Try it */

const STEP_IDS = ["signIn", "token", "account", "apiCall"] as const;

/** Signs in and makes one harmless read call, then shows which step works: the first thing to run when a call fails. */
function ConnectionCard({ call }: { call: EfaturamCall }) {
  const { t } = useT();
  const diag = useEfaturamDiagnose();
  const d = diag.result;
  const failed = d?.steps.find((x) => !x.ok);
  const line = (id: (typeof STEP_IDS)[number]) => {
    const step: EfaturamDiagnosisStep | undefined = d?.steps.find((x) => x.id === id);
    const extra = !step ? "" : step.ok
      ? id === "account" && d?.companyId != null ? `companyId ${d.companyId}, userId ${d.userId}` : id === "token" && d?.expiresAt ? t("efaturam.conn.expires", { at: dateTime(d.expiresAt) }) : step.status ? `HTTP ${step.status}` : ""
      : [step.status ? `HTTP ${step.status}` : "", step.detail ?? "", step.code ? `[${step.code}]` : ""].filter(Boolean).join(" ");
    return (
      <li key={id} data-step={id} data-state={!step ? "skipped" : step.ok ? "ok" : "fail"} className="flex items-start gap-2 text-sm">
        <span className={`mt-0.5 shrink-0 ${!step ? "text-muted" : step.ok ? "text-success" : "text-danger"}`}>{!step ? <Minus size={15} /> : step.ok ? <Check size={15} /> : <X size={15} />}</span>
        <span className="min-w-0 flex-1"><span className={step && !step.ok ? "font-medium text-danger" : !step ? "text-muted" : "font-medium"}>{t(`efaturam.conn.step.${id}`)}</span>{extra && <span className="ml-2 break-words text-muted">{extra}</span>}</span>
      </li>
    );
  };
  return (
    <Card title={t("efaturam.conn.title")}>
      <p className="mb-3 text-sm text-muted">{t("efaturam.conn.body")}</p>
      <Button loading={diag.pending} disabled={!call.cat.canSend} onClick={() => void diag.run()}>{t("efaturam.conn.run")}</Button>
      {d && (
        <div data-testid="ef-conn" data-state={d.ok ? "ok" : "fail"} className="mt-4 space-y-3">
          <ul className="space-y-1.5">{STEP_IDS.map(line)}</ul>
          <p role="status" className={`rounded-lg px-3 py-2 text-sm ${d.ok ? "bg-success-soft text-success" : "bg-danger-soft text-danger"}`}>
            {d.ok ? t("efaturam.conn.ok") : t(`efaturam.conn.fail.${failed?.code === "blocked" ? "blocked" : failed?.id ?? "signIn"}`)}
          </p>
          {d.claims && d.claims.length > 0 && <p className="break-words text-xs text-muted">{t("efaturam.conn.claims")}: <span className="font-mono">{d.claims.join(", ")}</span></p>}
        </div>
      )}
    </Card>
  );
}

function TaxpayerCard({ call }: { call: EfaturamCall }) {
  const { t } = useT();
  const [taxId, setTaxId] = useState("");
  const [res, setRes] = useState<EfaturamCallResult | null>(null);
  const [busy, setBusy] = useState(false);
  const clean = taxId.replace(/\s/g, "");
  const valid = /^\d{10,11}$/.test(clean);
  const run = async () => { setBusy(true); setRes(await call.run("getTaxPayersByTaxId", { path: { taxId: clean } })); setBusy(false); };
  const aliases = invoiceAliases(res);
  const notUser = !!res && (res.status === 404 || (res.ok && aliases.length === 0));
  return (
    <Card title={t("efaturam.taxpayer.title")}>
      <p className="mb-3 text-sm text-muted">{t("efaturam.taxpayer.body")}</p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-48 flex-1"><TextField label={t("efaturam.taxpayer.taxId")} inputMode="numeric" placeholder="1234567890" value={taxId} onChange={(e) => setTaxId(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && valid && call.cat.canSend) void run(); }} /></div>
        <Button loading={busy} disabled={!call.cat.canSend || !valid} onClick={() => void run()}>{t("efaturam.taxpayer.run")}</Button>
      </div>
      {res && (
        <div role="status" data-testid="ef-taxpayer" className="mt-3 text-sm">
          {aliases.length > 0 ? (
            <>
              <p className="flex items-center gap-2 font-medium text-success"><Check size={15} />{t("efaturam.taxpayer.yes")}</p>
              {aliases[0]!.title && <p className="mt-1">{aliases[0]!.title}</p>}
              <ul className="mt-1 space-y-0.5">{aliases.map((a) => <li key={a.alias} className="break-all font-mono text-xs text-muted">{a.alias}</li>)}</ul>
            </>
          ) : notUser ? <p className="flex items-center gap-2 font-medium"><X size={15} />{t("efaturam.taxpayer.no")}</p>
            : <p className="flex items-center gap-2 text-danger"><X size={15} />{failText(res)}</p>}
        </div>
      )}
    </Card>
  );
}

function DocumentCard({ call }: { call: EfaturamCall }) {
  const { t } = useT();
  const [kind, setKind] = useState<DocKind>("e_arsiv");
  const [uuid, setUuid] = useState("");
  const [res, setRes] = useState<EfaturamCallResult | null>(null);
  const [link, setLink] = useState<EfaturamCallResult | null>(null);
  const [cancel, setCancel] = useState<EfaturamCallResult | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const id = uuid.trim();
  const valid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  const wrap = async (k: string, f: () => Promise<void>) => { setBusy(k); try { await f(); } finally { setBusy(null); } };
  const query = () => wrap("status", async () => { setLink(null); setCancel(null); setRes(await call.run(kind === "e_arsiv" ? "getEArchiveStatus" : "getOutgoingEInvoiceStatus", { path: { invoiceUuid: id } })); });
  const pdf = () => wrap("pdf", async () => setLink(await call.run("getPermanentDocumentDownloadUrl", { body: { documentType: kind === "e_arsiv" ? "EARCHIVE" : "EINVOICE", fileExtension: "pdf", invoiceUuid: id } })));
  const doCancel = () => wrap("cancel", async () => { const r = await call.run("cancelEArchive", { body: { invoiceUuid: id } }); if (r) { setCancel(r); if (r.ok) setRes(await call.run("getEArchiveStatus", { path: { invoiceUuid: id } })); } });
  const body = res?.response.body as any;
  const url = httpsUrl(link?.response.body);
  return (
    <Card title={t("efaturam.doc.title")}>
      <p className="mb-3 text-sm text-muted">{t("efaturam.doc.body")}</p>
      <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
        <SelectField label={t("efaturam.doc.kind")} value={kind} onChange={(e) => { setKind(e.target.value as DocKind); setRes(null); setLink(null); setCancel(null); }}>
          <option value="e_arsiv">{t("efaturam.doc.kind.e_arsiv")}</option><option value="e_fatura">{t("efaturam.doc.kind.e_fatura")}</option>
        </SelectField>
        <TextField label={t("efaturam.doc.uuid")} className="font-mono" placeholder="96a8b0f1-7e10-4a44-8d78-eb961539bb4b" value={uuid} onChange={(e) => setUuid(e.target.value)} />
      </div>
      <div className="mt-3"><Button loading={busy === "status"} disabled={!call.cat.canSend || !valid} onClick={() => void query()}>{t("efaturam.doc.run")}</Button></div>
      {res && (
        <div data-testid="ef-doc" className="mt-4 space-y-3 text-sm">
          {res.ok ? (
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge code={body?.status} />
              {body?.gibStatus && <Badge tone="neutral">GİB: {String(body.gibStatus)}</Badge>}
              {body?.gibStatusCode != null && <Badge tone="neutral">GİB: {String(body.gibStatusCode)}</Badge>}
            </div>
          ) : <p className="flex items-center gap-2 text-danger"><X size={15} />{failText(res)}</p>}
          {res.ok && (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" loading={busy === "pdf"} onClick={() => void pdf()}>{t("efaturam.doc.pdf")}</Button>
              {kind === "e_arsiv" && String(body?.status) !== "305" && <Button size="sm" variant="danger" loading={busy === "cancel"} onClick={() => void doCancel()}>{t("efaturam.doc.cancel")}</Button>}
            </div>
          )}
          {link && (url
            ? <p><a className="inline-flex items-center gap-1 break-all text-brand-700 underline" href={url} target="_blank" rel="noreferrer noopener">{t("efaturam.doc.open")} <ExternalLink size={12} /></a></p>
            : <p className="text-danger">{link.ok ? t("efaturam.doc.noLink") : failText(link)}</p>)}
          {cancel && (cancel.ok ? <p className="flex items-center gap-2 text-success"><Check size={15} />{t("efaturam.doc.cancelled")}</p> : <p className="text-danger">{failText(cancel)}</p>)}
        </div>
      )}
    </Card>
  );
}

/* ---------------------------------------------------------------- Outgoing */

type Live = { status?: EfaturamCallResult; link?: EfaturamCallResult };

/** The store's own record of invoices issued through e-Faturam; each row can be checked against the gateway. */
function Outgoing({ call }: { call: EfaturamCall }) {
  const { t } = useT();
  const [q, setQ] = useState(""); const dq = useDebounced(q);
  const [page, setPage] = useState(1);
  const list = useEfaturamOutgoing(dq, page, true);
  const [live, setLive] = useState<Record<string, Live>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const rows = list.data?.items ?? [];
  const key = (r: EfaturamOutgoingRow) => `${r.source}:${r.id}`;
  const put = (k: string, v: Live) => setLive((m) => ({ ...m, [k]: { ...m[k], ...v } }));
  const check = async (r: EfaturamOutgoingRow) => {
    if (!r.invoiceUuid) return;
    const res = await call.run(r.type === "e_fatura" ? "getOutgoingEInvoiceStatus" : "getEArchiveStatus", { path: { invoiceUuid: r.invoiceUuid } });
    if (res) put(key(r), { status: res });
  };
  const one = async (r: EfaturamOutgoingRow) => { setBusy(key(r)); await check(r); setBusy(null); };
  const all = async () => { setBusy("all"); for (const r of rows) await check(r); setBusy(null); };
  const pdf = async (r: EfaturamOutgoingRow) => {
    if (!r.invoiceUuid) return;
    setBusy(`pdf:${key(r)}`);
    const res = await call.run("getPermanentDocumentDownloadUrl", { body: { documentType: r.type === "e_fatura" ? "EINVOICE" : "EARCHIVE", fileExtension: "pdf", invoiceUuid: r.invoiceUuid } });
    if (res) put(key(r), { link: res }); setBusy(null);
  };
  const checkable = rows.some((r) => r.invoiceUuid);
  return (
    <Card title={t("efaturam.out.title")} description={t("efaturam.out.body")}
      actions={<Button size="sm" variant="secondary" loading={busy === "all"} disabled={!call.cat.canSend || !checkable || !!busy} onClick={() => void all()}><RefreshCw size={13} />{t("efaturam.out.checkAll")}</Button>}>
      <div className="mb-4 w-full sm:w-80"><TextField label={t("common.search")} type="search" placeholder={t("efaturam.out.search")} value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /></div>
      {list.isPending ? <Loading /> : list.error ? <ErrorState error={list.error} retry={() => void list.refetch()} /> : !rows.length ? <EmptyState title={t(dq ? "efaturam.out.noMatch" : "efaturam.out.empty")} description={dq ? undefined : t("efaturam.out.emptyBody")} /> : (
        <div className="space-y-3" data-testid="ef-outgoing">
          <Table caption={t("efaturam.out.title")} head={[t("efaturam.col.date"), t("efaturam.col.number"), t("efaturam.col.recipient"), t("efaturam.col.amount"), t("efaturam.col.record"), t("efaturam.col.gateway"), <span key="a" className="sr-only">{t("efaturam.col.actions")}</span>]}>
            {rows.map((r) => {
              const k = key(r); const st = live[k]?.status; const lk = live[k]?.link;
              const url = httpsUrl(lk?.response.body) ?? r.pdfUrl ?? undefined;
              const to = outgoingLink(r);
              const label = r.source === "manual" ? t("efaturam.out.manual") : r.orderNumber ? `#${r.orderNumber}` : t("efaturam.out.order");
              return (
                <tr key={k} data-row={k}>
                  <Td className="whitespace-nowrap text-[13px]">{dateTime(r.createdAt)}</Td>
                  <Td>
                    <div className="font-mono text-[13px]">{r.number ?? "—"}</div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-[12px] text-muted">{r.type && <Badge tone="neutral">{t(`efaturam.doc.kind.${r.type}`)}</Badge>}</div>
                  </Td>
                  <Td className="text-[13px]"><div>{r.customerName || "—"}</div><div className="text-muted">{to ? <Link className="text-brand-700 underline" to={to}>{label}</Link> : label}</div></Td>
                  <Td className="whitespace-nowrap tabular-nums">{r.total != null ? money(r.total, r.currency || "TRY") : "—"}</Td>
                  <Td><Badge tone={recordTone(r.status)}>{enumLabel("invoice", r.status)}</Badge></Td>
                  <Td>
                    {!r.invoiceUuid ? <span className="text-[12px] text-muted">{t("efaturam.out.noUuid")}</span>
                      : st ? (st.ok ? <StatusBadge code={(st.response.body as any)?.status} /> : <span className="text-[12px] text-danger">{failText(st)}</span>)
                        : <Button size="sm" variant="ghost" loading={busy === k} disabled={!call.cat.canSend || !!busy} onClick={() => void one(r)}>{t("efaturam.out.check")}</Button>}
                  </Td>
                  <Td className="text-right"><div className="flex justify-end gap-1">
                    {url ? <a className="inline-flex h-8 items-center gap-1 px-2 text-[13px] text-brand-700 underline" href={url} target="_blank" rel="noreferrer noopener">PDF <ExternalLink size={12} /></a>
                      : r.invoiceUuid ? <Button size="sm" variant="ghost" loading={busy === `pdf:${k}`} disabled={!call.cat.canSend || !!busy} onClick={() => void pdf(r)}>{t("efaturam.in.pdf")}</Button> : null}
                  </div>{lk && !url && <div className="text-[12px] text-danger">{lk.ok ? t("efaturam.doc.noLink") : failText(lk)}</div>}</Td>
                </tr>
              );
            })}
          </Table>
          <Pagination page={page} pageSize={OUTGOING_PAGE_SIZE} total={list.data?.total ?? 0} onPage={(p) => { setPage(p); setLive({}); }} />
        </div>
      )}
    </Card>
  );
}

/* ---------------------------------------------------------------- Incoming */

const PAGE_SIZE = 20;

function Incoming({ call }: { call: EfaturamCall }) {
  const { t } = useT();
  const [from, setFrom] = useState(() => isoDay(new Date(Date.now() - 30 * 86_400_000)));
  const [to, setTo] = useState(() => isoDay(new Date()));
  const [page, setPage] = useState(0);
  const [res, setRes] = useState<EfaturamCallResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState<Record<string, any> | null>(null);
  const [link, setLink] = useState<{ id: string; res: EfaturamCallResult } | null>(null);
  const load = async (p = page) => {
    setBusy(true);
    const r = await call.run("searchIncomingEInvoice", { body: { ...(from ? { startDate: from } : {}), ...(to ? { endDate: to } : {}), pagination: { page: p, size: PAGE_SIZE } } });
    if (r) setRes(r); setBusy(false);
  };
  const pdf = async (uuid: string) => { const r = await call.run("getTemporaryDocumentDownloadUrl", { body: { documentType: "INCOMING_EINVOICE", fileExtension: "pdf", invoiceUuid: uuid } }); if (r) setLink({ id: uuid, res: r }); };
  const rows = rowsOf(res);
  const body = res?.response.body as any;
  const pages = Number(body?.totalPageCount ?? 0);
  return (
    <Card title={t("efaturam.in.title")} actions={<Button size="sm" variant="secondary" loading={busy} disabled={!call.cat.canSend} onClick={() => { setPage(0); void load(0); }}><RefreshCw size={13} />{t(res ? "efaturam.in.refresh" : "efaturam.in.load")}</Button>}>
      <FilterBar>
        <TextField label={t("efaturam.in.from")} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <TextField label={t("efaturam.in.to")} type="date" value={to} onChange={(e) => setTo(e.target.value)} />
      </FilterBar>
      {!res ? <EmptyState title={t("efaturam.in.title")} description={t("efaturam.in.hint")} /> : res.error ? <p className="text-sm text-danger">{failText(res)}</p> : !rows.length ? <EmptyState title={t("efaturam.in.empty")} /> : (
        <div className="space-y-3" data-testid="ef-incoming">
          <Table caption={t("efaturam.in.title")} head={[t("efaturam.col.date"), t("efaturam.col.number"), t("efaturam.col.sender"), t("efaturam.col.status"), t("efaturam.col.amount"), <span key="a" className="sr-only">{t("efaturam.col.actions")}</span>]}>
            {rows.map((r, i) => {
              const uuid = String(pick(r, "invoiceUuid", "uuid") ?? "");
              const amount = pick(r, "payableAmount", "taxInclusiveAmount", "price");
              const url = link?.id === uuid ? httpsUrl(link.res.response.body) : undefined;
              return (
                <tr key={uuid || i}>
                  <Td className="whitespace-nowrap text-[13px]">{dateTime(pick(r, "issuedAt", "issueDate", "createdAt") as string | undefined)}</Td>
                  <Td><div className="font-mono text-[13px]">{String(pick(r, "invoiceId", "invoiceNumber") ?? "—")}</div><div className="text-[12px] text-muted">{String(pick(r, "scenario", "invoiceType") ?? "")}</div></Td>
                  <Td className="text-[13px]"><div>{String(pick(r, "senderTitle", "senderName", "recipientTitle") ?? "—")}</div><div className="font-mono text-muted">{String(pick(r, "senderTaxId") ?? "")}</div></Td>
                  <Td><StatusBadge code={r.status} /></Td>
                  <Td className="whitespace-nowrap tabular-nums">{typeof amount === "number" ? money(amount, typeof r.currency === "string" && r.currency ? r.currency : "TRY") : "—"}</Td>
                  <Td className="text-right"><div className="flex justify-end gap-1">
                    {url ? <a className="inline-flex h-8 items-center gap-1 px-2 text-[13px] text-brand-700 underline" href={url} target="_blank" rel="noreferrer noopener">PDF <ExternalLink size={12} /></a>
                      : uuid && <Button size="sm" variant="ghost" onClick={() => void pdf(uuid)}>{t("efaturam.in.pdf")}</Button>}
                    <Button size="sm" variant="ghost" onClick={() => setDetail(r)}>{t("efaturam.in.details")}</Button>
                  </div></Td>
                </tr>
              );
            })}
          </Table>
          {link && !link.res.ok && <p className="text-sm text-danger">{failText(link.res)}</p>}
          <div className="flex items-center justify-between gap-2 text-sm text-muted">
            <span>{body?.totalCount != null ? t("efaturam.in.total", { n: body.totalCount }) : ""}</span>
            {pages > 1 && (
              <span className="flex items-center gap-2">
                <Button size="sm" variant="ghost" disabled={page <= 0} onClick={() => { setPage(page - 1); void load(page - 1); }}>‹</Button>
                {t("efaturam.in.pager", { page: page + 1, pages })}
                <Button size="sm" variant="ghost" disabled={page + 1 >= pages} onClick={() => { setPage(page + 1); void load(page + 1); }}>›</Button>
              </span>
            )}
          </div>
        </div>
      )}
      <Drawer open={!!detail} onClose={() => setDetail(null)} title={t("efaturam.in.detailsTitle", { id: String(detail ? pick(detail, "invoiceId", "invoiceUuid") ?? "" : "") })}>
        {detail && <JsonPanel value={detail} />}
      </Drawer>
    </Card>
  );
}

/* ---------------------------------------------------------------- Explorer */

function Explorer({ call }: { call: EfaturamCall }) {
  const { t, locale } = useT();
  const ops = call.cat.operations;
  const [id, setId] = useState("getTaxPayersByTaxId");
  const op: EfaturamOperation | undefined = call.cat.byId.get(id) ?? ops[0];
  const [vals, setVals] = useState<Record<string, string>>({});
  const [bodyText, setBodyText] = useState<string | null>(null);
  const [res, setRes] = useState<EfaturamCallResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const grouped = useMemo(() => EFATURAM_GROUPS.map((g) => ({ g, ops: ops.filter((o) => o.group === g) })).filter((x) => x.ops.length), [ops]);
  const exampleOf = (o?: EfaturamOperation) => (o?.body.kind === "json" && o.body.example !== undefined ? pretty(o.body.example) : "");

  const choose = (nid: string) => {
    const o = call.cat.byId.get(nid); setId(nid); setRes(null); setErr(null);
    setVals(Object.fromEntries((o?.params ?? []).filter((p) => p.default !== undefined).map((p) => [p.name, String(p.default)])));
    setBodyText(exampleOf(o));
  };
  if (!op) return <EmptyState title={t("efaturam.tab.explorer")} />;
  const text = bodyText ?? exampleOf(op);
  const send = async () => {
    setErr(null);
    const input: EfaturamInput = { path: {}, query: {} };
    for (const p of op.params) { const v = (vals[p.name] ?? "").trim(); if (!v) continue; if (p.in === "path") input.path![p.name] = v; else input.query![p.name] = p.type === "boolean" ? v === "true" : v; }
    if (op.body.kind === "json" && text.trim()) { try { input.body = JSON.parse(text); } catch { setErr(t("efaturam.ex.badJson")); return; } }
    setBusy(true); const r = await call.run(op.id, input); setBusy(false); if (r) setRes(r);
  };
  return (
    <div className="space-y-5">
      <Card>
        <SelectField label={t("efaturam.ex.operation")} value={op.id} onChange={(e) => choose(e.target.value)}>
          {grouped.map(({ g, ops: list }) => <optgroup key={g} label={t(`efaturam.group.${g}`)}>{list.map((o) => <option key={o.id} value={o.id}>{gloc(o.title, locale)} — {o.method} {o.path}</option>)}</optgroup>)}
        </SelectField>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge tone={op.risk === "read" ? "success" : op.risk === "write" ? "warning" : "danger"}>{t(`efaturam.ex.risk.${op.risk}`)}</Badge>
          {op.billed && <Badge tone="warning">{t("efaturam.ex.billed")}</Badge>}
          <span className="break-all font-mono text-xs text-muted">{op.method} {op.path}</span>
        </div>
        <p className="mt-2 text-sm text-muted">{gloc(op.summary, locale)}</p>
        {op.notes && <p className="mt-1 text-xs text-muted">{gloc(op.notes, locale)}</p>}
      </Card>
      <Card title={t("efaturam.ex.params")}>
        <div className="grid gap-3 sm:grid-cols-2">
          {op.params.length === 0 && <p className="text-sm text-muted">—</p>}
          {op.params.map((p) => (
            <TextField key={`${op.id}:${p.name}`} label={`${p.name}${p.required ? ` (${t("efaturam.ex.required")})` : ""}`} hint={gloc(p.description, locale)} placeholder={p.example !== undefined ? String(p.example) : undefined}
              value={vals[p.name] ?? ""} onChange={(e) => setVals({ ...vals, [p.name]: e.target.value })} />
          ))}
        </div>
        {op.body.kind === "json" && <div className="mt-3"><TextArea label={t("efaturam.ex.body")} rows={12} className="font-mono text-xs" value={text} onChange={(e) => setBodyText(e.target.value)} error={err ?? undefined} /></div>}
        <div className="mt-3"><Button loading={busy} disabled={!call.cat.canSend} onClick={() => void send()}>{t("efaturam.ex.send")}</Button></div>
      </Card>
      {res && (
        <Card title={t("efaturam.ex.response")} testId="ef-response">
          <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
            <Badge tone={res.ok ? "success" : "danger"}>HTTP {res.status}</Badge><span className="text-muted">{res.durationMs} ms</span>{res.mock && <Badge tone="danger">{t("efaturam.ex.mockTag")}</Badge>}
            {res.error && <span className="text-danger">{res.error.message}</span>}
          </div>
          <p className="mb-1 break-all font-mono text-xs text-muted">{res.request.method} {res.request.url}</p>
          {res.request.body !== undefined && <details className="mb-3 text-sm"><summary className="cursor-pointer text-muted">{t("efaturam.ex.sentBody")}</summary><div className="mt-2"><JsonPanel value={res.request.body} maxHeight="30vh" /></div></details>}
          <JsonPanel value={res.response.body} />
        </Card>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------- page */

export default function Efaturam() {
  const { t } = useT();
  const admin = useAdmin();
  const call = useEfaturamCall();
  const [tab, setTab] = useState<TabId>("check");
  const header = <PageHeader title={t("efaturam.title")} description={t("efaturam.description")} />;
  if (admin && admin.role === "staff") return <>{header}<EmptyState title={t("efaturam.forbidden.title")} description={t("efaturam.forbidden.body")} /></>;
  return (
    <>
      {header}
      <StatusBar cat={call.cat} />
      {call.cat.error ? <ErrorState error={call.cat.error} retry={call.cat.refetch} /> : (
        <div className="space-y-5">
          <Tabs<TabId> tabs={TABS.map((x) => ({ id: x, label: t(`efaturam.tab.${x}`) }))} value={tab} onChange={setTab} label={t("efaturam.tabs.label")} />
          {tab === "check" && <div className="grid gap-5 lg:grid-cols-2"><div className="lg:col-span-2"><ConnectionCard call={call} /></div><TaxpayerCard call={call} /><DocumentCard call={call} /></div>}
          {tab === "outgoing" && <Outgoing call={call} />}
          {tab === "incoming" && <Incoming call={call} />}
          {tab === "explorer" && !call.cat.isPending && <Explorer call={call} />}
        </div>
      )}
      {call.confirmNode}
    </>
  );
}

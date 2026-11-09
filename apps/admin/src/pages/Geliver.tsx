import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Check, ExternalLink, RefreshCw, X } from "lucide-react";
import type { GeliverCallResult, GeliverOperation } from "@openshelf/shared";
import { Badge, Button, Card, EmptyState, ErrorState, Modal, PageHeader, Skeleton, SelectField, Table, Tabs, Td, TextArea, TextField } from "../components/ui";
import { fmtDate, gloc, moneyStr, offersOf, place, rowsOf, statusTone, useGeliverCall, type GeliverInput, type OfferView } from "../lib/geliver";
import { JsonPanel } from "../components/geliver/JsonPanel";
import { OffersTable } from "../components/geliver/Offers";
import { ShipmentDetail } from "../components/geliver/ShipmentDetail";
import { useAdmin } from "../lib/auth";
import { useT } from "../i18n";

const pretty = (v: unknown) => { try { return JSON.stringify(v, null, 2); } catch { return String(v); } };
const TABS = ["check", "shipments", "explorer"] as const;
type TabId = (typeof TABS)[number];
function StatusBar({ cat }: { cat: ReturnType<typeof useGeliverCall>["cat"] }) {
  const { t } = useT(); const admin = useAdmin(); const owner = admin?.role === "owner";
  if (cat.isPending) return <Skeleton className="mb-5 h-14" />;
  if (cat.error || !cat.mode) return null;
  if (cat.mode === "mock") return (
    <div role="status" data-testid="gl-mode" className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-danger-line bg-danger-soft px-4 py-3 text-danger">
      <Badge tone="danger">{t("geliver.mode.mock")}</Badge><p className="min-w-0 flex-1 text-sm font-medium">{t("geliver.mode.mockBody")}</p>
    </div>
  );
  if (cat.mode === "live") return (
    <div role="status" data-testid="gl-mode" className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3">
      <Badge tone="success">{t("geliver.mode.live")}</Badge>
      <Badge tone={cat.test ? "info" : "warning"}>{cat.test ? t("geliver.mode.test") : t("geliver.mode.notTest")}</Badge>
      {cat.senderAddressId && <p className="text-sm text-muted">{t("geliver.mode.sender")}: <span className="font-mono text-ink">{cat.senderAddressId}</span></p>}
    </div>
  );
  return (
    <div role="status" data-testid="gl-mode" className="mb-5 space-y-3 rounded-xl border border-warn-line bg-warn-soft px-4 py-3 text-warn">
      <div className="flex items-center gap-2"><Badge tone="warning">{t("geliver.mode.disabled")}</Badge><p className="text-sm font-medium">{t(cat.reason === "integration_disabled" ? "geliver.mode.disabledOff" : "geliver.mode.disabledNotConfigured")}</p></div>
      <p className="text-sm">{t("geliver.mode.disabledBody")}</p>
      <div className="flex flex-wrap gap-2">
        <Link to="/integrations?configure=geliver" className="inline-flex h-8 items-center rounded-lg bg-brand-600 px-3 text-[13px] font-medium text-white hover:bg-brand-700">{t("geliver.mode.configure")}</Link>
        {owner && <Link to="/settings/system" className="inline-flex h-8 items-center rounded-lg border border-line bg-surface px-3 text-[13px] font-medium text-ink hover:bg-canvas">{t("trendyol.mode.enableMock")}</Link>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Try it */

function ConnectionCard({ call }: { call: ReturnType<typeof useGeliverCall> }) {
  const { t } = useT();
  const [res, setRes] = useState<GeliverCallResult | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async () => { setBusy(true); setRes(await call.run("getAddress", { path: { id: call.cat.senderAddressId ?? "" } })); setBusy(false); };
  return (
    <Card title={t("geliver.check.title")}>
      <p className="mb-3 text-sm text-muted">{t("geliver.check.body")}</p>
      <Button loading={busy} disabled={!call.cat.canSend} onClick={() => void run()}>{t("geliver.check.run")}</Button>
      {res && (
        <p role="status" data-testid="gl-check" className={`mt-3 flex items-center gap-2 text-sm ${res.ok ? "text-success" : "text-danger"}`}>
          {res.ok ? <Check size={15} /> : <X size={15} />}
          {res.ok ? t("geliver.check.ok", { ms: res.durationMs }) : t("geliver.check.fail", { status: res.status, message: res.error?.message ?? "" })}
        </p>
      )}
    </Card>
  );
}

function QuoteCard({ call }: { call: ReturnType<typeof useGeliverCall> }) {
  const { t } = useT();
  const [v, setV] = useState({ length: "10", width: "10", height: "10", weight: "1" });
  const [res, setRes] = useState<GeliverCallResult | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async () => { setBusy(true); setRes(await call.run("priceList", { query: { paramType: "parcel", ...v } })); setBusy(false); };
  const offers = ((res?.response.body as any)?.priceList ?? []).flatMap((r: any) => offersOf(r));
  const f = (k: keyof typeof v, label: string) => <TextField key={k} label={label} type="number" min="0" step="any" value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} />;
  return (
    <Card title={t("geliver.quote.title")}>
      <p className="mb-3 text-sm text-muted">{t("geliver.quote.body")}</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{f("length", t("geliver.quote.length"))}{f("width", t("geliver.quote.width"))}{f("height", t("geliver.quote.height"))}{f("weight", t("geliver.quote.weight"))}</div>
      <div className="mt-3"><Button loading={busy} disabled={!call.cat.canSend} onClick={() => void run()}>{t("geliver.quote.run")}</Button></div>
      {res && !res.ok && <p className="mt-3 text-sm text-danger">{res.error?.message}</p>}
      {res?.ok && <div className="mt-4" data-testid="gl-offers">{offers.length ? <OffersTable offers={offers} caption={t("geliver.quote.title")} /> : <p className="text-sm text-muted">{t("geliver.quote.empty")}</p>}</div>}
    </Card>
  );
}

const DEMO_RECIPIENT = { name: "Test Alıcı", email: "test@example.com", phone: "+905051234567", address1: "Test Mah. 1. Sok. No:1", countryCode: "TR", cityCode: "34", cityName: "İstanbul", districtName: "Kadıköy", zip: "34000" };

function FlowCard({ call }: { call: ReturnType<typeof useGeliverCall> }) {
  const { t } = useT();
  const cat = call.cat;
  const allowed = cat.canSend && (cat.mode === "mock" || cat.test);
  const [shipment, setShipment] = useState<{ id: string; offers: OfferView[] } | null>(null);
  const [accepted, setAccepted] = useState<any | null>(null);
  const [tracking, setTracking] = useState<any | null>(null);
  const [cancelled, setCancelled] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const wrap = async <T,>(k: string, f: () => Promise<T>) => { setBusy(k); try { return await f(); } finally { setBusy(null); } };

  const create = () => wrap("create", async () => {
    const r = await call.run("createShipment", { body: { test: true, senderAddressID: cat.senderAddressId ?? "SENDER", recipientAddress: DEMO_RECIPIENT, length: "10", width: "10", height: "10", distanceUnit: "cm", weight: "1", massUnit: "kg", order: { sourceCode: "API", sourceIdentifier: "https://openshelf.local", orderNumber: `TEST-${Date.now()}`, totalAmount: "0", totalAmountCurrency: "TL" } } });
    const d = (r?.response.body as any)?.data;
    if (r?.ok && d?.id) { setShipment({ id: d.id, offers: offersOf(d) }); setAccepted(null); setTracking(null); setCancelled(false); }
  });
  const accept = (o: OfferView) => wrap("accept", async () => { const r = await call.run("acceptOffer", { body: { offerID: o.id } }); if (r?.ok) setAccepted((r.response.body as any)?.data?.shipment ?? {}); });
  const track = () => wrap("track", async () => { if (!shipment) return; const r = await call.run("getShipment", { path: { id: shipment.id } }); if (r?.ok) setTracking((r.response.body as any)?.data ?? {}); });
  const cancel = () => wrap("cancel", async () => { if (!shipment) return; const r = await call.run("cancelShipment", { path: { id: shipment.id } }); if (r?.ok) setCancelled(true); });
  const reset = () => { setShipment(null); setAccepted(null); setTracking(null); setCancelled(false); };

  return (
    <Card title={t("geliver.flow.title")}>
      <p className="mb-3 text-sm text-muted">{t("geliver.flow.body")}</p>
      {cat.mode === "live" && !cat.test && <p className="mb-3 rounded-lg bg-warn-soft p-3 text-sm text-warn">{t("geliver.flow.blocked")}</p>}
      {!shipment ? <Button loading={busy === "create"} disabled={!allowed} onClick={() => void create()}>{t("geliver.flow.create")}</Button> : (
        <div className="space-y-4" data-testid="gl-flow">
          <p className="text-sm">ID: <span className="font-mono">{shipment.id}</span></p>
          {!accepted && !cancelled && (shipment.offers.length ? <div><p className="mb-2 text-sm font-medium">{t("geliver.flow.offers")}</p><OffersTable offers={shipment.offers} caption={t("geliver.flow.offers")} onPick={(o) => void accept(o)} pickLabel={t("geliver.flow.accept")} busy={busy === "accept"} /></div> : <p className="text-sm text-muted">{t("geliver.flow.noOffers")}</p>)}
          {accepted && (
            <div className="space-y-1 rounded-lg bg-canvas p-3 text-sm" data-testid="gl-accepted">
              <p>{t("geliver.flow.tracking")}: <span className="font-mono">{accepted.trackingNumber ?? "—"}</span></p>
              {accepted.labelURL && <p>{t("geliver.flow.label")}: <a className="inline-flex items-center gap-1 text-brand-700 underline" href={accepted.labelURL} target="_blank" rel="noreferrer noopener">PDF <ExternalLink size={12} /></a></p>}
              {tracking && <p>{t("geliver.col.status")}: <span className="font-mono">{tracking.trackingStatus?.trackingStatusCode ?? tracking.statusCode ?? "—"}</span></p>}
            </div>
          )}
          {cancelled && <p className="flex items-center gap-2 text-sm text-success"><Check size={15} />{t("geliver.flow.cancelled")}</p>}
          <div className="flex flex-wrap gap-2">
            {accepted && !cancelled && <Button variant="secondary" loading={busy === "track"} onClick={() => void track()}>{t("geliver.flow.track")}</Button>}
            {!cancelled && <Button variant="danger" loading={busy === "cancel"} onClick={() => void cancel()}>{t("geliver.flow.cancel")}</Button>}
            <Button variant="ghost" onClick={reset}>{t("geliver.flow.reset")}</Button>
          </div>
        </div>
      )}
    </Card>
  );
}

/* --------------------------------------------------------------- Shipments */

function Shipments({ call }: { call: ReturnType<typeof useGeliverCall> }) {
  const { t, locale } = useT();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [res, setRes] = useState<GeliverCallResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState<GeliverCallResult | null>(null);
  const load = async (p = page) => {
    setBusy(true);
    const r = await call.run("listShipments", { query: { limit: 10, page: p, ...(status ? { statusFilter: status } : {}), ...(orderNumber.trim() ? { orderNumber: orderNumber.trim() } : {}) } });
    if (r) setRes(r); setBusy(false);
  };
  const rows = rowsOf(res);
  const body = res?.response.body as any;
  const show = async (id: string) => setDetail(await call.run("getShipment", { path: { id } }));
  const cancel = async (id: string) => { if (await call.run("cancelShipment", { path: { id } })) void load(); };
  const d = (detail?.response.body as any)?.data;
  return (
    <Card title={t("geliver.ship.title")} actions={<Button size="sm" variant="secondary" loading={busy} disabled={!call.cat.canSend} onClick={() => { setPage(1); void load(1); }}><RefreshCw size={13} />{t(res ? "geliver.ship.refresh" : "geliver.ship.load")}</Button>}>
      <div className="mb-3 grid gap-3 sm:grid-cols-2">
        <SelectField label={t("geliver.col.status")} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">—</option>{["PRE_TRANSIT", "TRANSIT", "DELIVERED", "RETURNED", "CANCELED"].map((x) => <option key={x} value={x}>{x}</option>)}
        </SelectField>
        <TextField label={t("geliver.col.order")} value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} />
      </div>
      {!res ? <EmptyState title={t("geliver.ship.title")} description={t("geliver.ship.empty")} /> : res.error ? <p className="text-sm text-danger">{res.error.message}</p> : !rows.length ? <EmptyState title={t("geliver.ship.empty")} /> : (
        <div className="space-y-3" data-testid="gl-ships">
          <Table caption={t("geliver.ship.title")} head={[t("geliver.col.date"), t("geliver.col.carrier"), t("geliver.col.tracking"), t("geliver.col.status"), t("geliver.col.recipient"), t("geliver.col.price"), <span key="a" className="sr-only">{t("geliver.col.actions")}</span>]}>
            {rows.map((s) => (
              <tr key={s.id}>
                <Td className="whitespace-nowrap text-[13px]">{fmtDate(s.createdAt, locale) || "—"}</Td>
                <Td><div className="font-medium">{s.providerCode ?? "—"}</div><div className="font-mono text-[12px] text-muted">{s.providerServiceCode}</div></Td>
                <Td className="font-mono text-[13px]">{s.trackingUrl && /^https:\/\//.test(s.trackingUrl) ? <a className="text-brand-700 underline" href={s.trackingUrl} target="_blank" rel="noreferrer noopener">{s.trackingNumber ?? "—"}</a> : s.trackingNumber ?? "—"}</Td>
                <Td><div className="flex flex-col items-start gap-1">{s.statusCode && <Badge tone={statusTone(s.statusCode)}>{s.statusCode}</Badge>}{s.trackingStatus?.trackingStatusCode && <Badge tone={statusTone(s.trackingStatus.trackingStatusCode)}>{s.trackingStatus.trackingStatusCode}</Badge>}</div></Td>
                <Td className="text-[13px]"><div>{s.recipientAddress?.name ?? "—"}</div><div className="text-muted">{place(s.recipientAddress)}</div></Td>
                <Td className="whitespace-nowrap tabular-nums">{moneyStr(s.totalAmount ?? s.amount, s.currency) || "—"}</Td>
                <Td className="text-right"><div className="flex justify-end gap-1"><Button size="sm" variant="ghost" onClick={() => void show(s.id)}>{t("geliver.ship.details")}</Button><Button size="sm" variant="ghost" onClick={() => void cancel(s.id)}>{t("geliver.ship.cancel")}</Button></div></Td>
              </tr>
            ))}
          </Table>
          <div className="flex items-center justify-between gap-2 text-sm text-muted">
            <span>{body?.totalRows != null ? t("geliver.ship.total", { n: body.totalRows }) : ""}</span>
            {body?.totalPages > 1 && (
              <span className="flex items-center gap-2">
                <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => { setPage(page - 1); void load(page - 1); }}>‹</Button>
                {t("geliver.ship.pager", { page, pages: body.totalPages })}
                <Button size="sm" variant="ghost" disabled={page >= body.totalPages} onClick={() => { setPage(page + 1); void load(page + 1); }}>›</Button>
              </span>
            )}
          </div>
        </div>
      )}
      <Modal open={!!detail} onClose={() => setDetail(null)} title={t("geliver.ship.detailsTitle", { id: String(d?.id ?? "") })} wide>
        {detail && (detail.ok && d ? <ShipmentDetail s={d} raw={detail.response.body} /> : <><p className="mb-2 text-sm text-danger">{detail.error?.message}</p><JsonPanel value={detail.response.body} /></>)}
      </Modal>
    </Card>
  );
}

/* ---------------------------------------------------------------- Explorer */

const GROUPS = ["shipments", "offers", "addresses", "account", "webhooks", "geo"] as const;

function Explorer({ call }: { call: ReturnType<typeof useGeliverCall> }) {
  const { t, locale } = useT();
  const ops = call.cat.operations;
  const [id, setId] = useState("priceList");
  const op: GeliverOperation | undefined = call.cat.byId.get(id) ?? ops[0];
  const [vals, setVals] = useState<Record<string, string>>({});
  const [bodyText, setBodyText] = useState<string>("");
  const [res, setRes] = useState<GeliverCallResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const grouped = useMemo(() => GROUPS.map((g) => ({ g, ops: ops.filter((o) => o.group === g) })).filter((x) => x.ops.length), [ops]);

  const choose = (nid: string) => {
    const o = call.cat.byId.get(nid); setId(nid); setRes(null); setErr(null);
    setVals(Object.fromEntries((o?.params ?? []).filter((p) => p.default !== undefined).map((p) => [p.name, String(p.default)])));
    setBodyText(o?.body.kind === "json" && o.body.example !== undefined ? pretty(o.body.example) : "");
  };
  if (!op) return <EmptyState title={t("geliver.tab.explorer")} />;
  const send = async () => {
    setErr(null);
    const input: GeliverInput = { path: {}, query: {} };
    for (const p of op.params) { const v = (vals[p.name] ?? "").trim(); if (!v) continue; if (p.in === "path") input.path![p.name] = v; else input.query![p.name] = p.type === "boolean" ? v === "true" : v; }
    if (op.body.kind === "json" && bodyText.trim()) { try { input.body = JSON.parse(bodyText); } catch { setErr(t("geliver.ex.badJson")); return; } }
    setBusy(true); const r = await call.run(op.id, input); setBusy(false); if (r) setRes(r);
  };
  return (
    <div className="space-y-5">
      <Card>
        <SelectField label={t("geliver.ex.operation")} value={op.id} onChange={(e) => choose(e.target.value)}>
          {grouped.map(({ g, ops: list }) => <optgroup key={g} label={t(`geliver.group.${g}`)}>{list.map((o) => <option key={o.id} value={o.id}>{gloc(o.title, locale)} — {o.method} {o.path}</option>)}</optgroup>)}
        </SelectField>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge tone={op.risk === "read" ? "success" : op.risk === "write" ? "warning" : "danger"}>{t(`geliver.ex.risk.${op.risk}`)}</Badge>
          {op.billed && <Badge tone="warning">{t("geliver.ex.billed")}</Badge>}
          <span className="font-mono text-xs text-muted">{op.method} {op.path}</span>
        </div>
        <p className="mt-2 text-sm text-muted">{gloc(op.summary, locale)}</p>
        {op.notes && <p className="mt-1 text-xs text-muted">{gloc(op.notes, locale)}</p>}
      </Card>
      <Card title={t("geliver.ex.params")}>
        <div className="grid gap-3 sm:grid-cols-2">
          {op.params.length === 0 && <p className="text-sm text-muted">—</p>}
          {op.params.map((p) => (
            <TextField key={`${op.id}:${p.name}`} label={`${p.name}${p.required ? ` (${t("geliver.ex.required")})` : ""}`} hint={gloc(p.description, locale)} placeholder={p.example !== undefined ? String(p.example) : undefined}
              value={vals[p.name] ?? ""} onChange={(e) => setVals({ ...vals, [p.name]: e.target.value })} />
          ))}
        </div>
        {op.body.kind === "json" && <div className="mt-3"><TextArea label={t("geliver.ex.body")} rows={10} className="font-mono text-xs" value={bodyText} onChange={(e) => setBodyText(e.target.value)} error={err ?? undefined} /></div>}
        {err && op.body.kind !== "json" && <p className="mt-2 text-sm text-danger">{err}</p>}
        <div className="mt-3"><Button loading={busy} disabled={!call.cat.canSend} onClick={() => void send()}>{t("geliver.ex.send")}</Button></div>
      </Card>
      {res && (
        <Card title={t("geliver.ex.response")} testId="gl-response">
          <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
            <Badge tone={res.ok ? "success" : "danger"}>HTTP {res.status}</Badge><span className="text-muted">{res.durationMs} ms</span>{res.mock && <Badge tone="danger">{t("geliver.ex.mockTag")}</Badge>}
            {res.error && <span className="text-danger">{res.error.message}</span>}
          </div>
          <p className="mb-1 break-all font-mono text-xs text-muted">{res.request.method} {res.request.url}</p>
          {res.ok && (res.operationId === "getShipment" || res.operationId === "acceptOffer") && ((res.response.body as any)?.data?.shipment ?? (res.response.body as any)?.data)?.id
            ? <ShipmentDetail s={(res.response.body as any).data.shipment ?? (res.response.body as any).data} raw={res.response.body} />
            : <JsonPanel value={res.response.body} />}
        </Card>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------- page */

export default function Geliver() {
  const { t } = useT();
  const admin = useAdmin();
  const call = useGeliverCall();
  const [tab, setTab] = useState<TabId>("check");
  const header = <PageHeader title={t("geliver.title")} description={t("geliver.description")} />;
  if (admin && admin.role === "staff") return <>{header}<EmptyState title={t("geliver.forbidden.title")} description={t("geliver.forbidden.body")} /></>;
  return (
    <>
      {header}
      <StatusBar cat={call.cat} />
      {call.cat.error ? <ErrorState error={call.cat.error} retry={call.cat.refetch} /> : (
        <div className="space-y-5">
          <Tabs<TabId> tabs={TABS.map((x) => ({ id: x, label: t(`geliver.tab.${x}`) }))} value={tab} onChange={setTab} label={t("geliver.tabs.label")} />
          {tab === "check" && <div className="space-y-5"><ConnectionCard call={call} /><QuoteCard call={call} /><FlowCard call={call} /></div>}
          {tab === "shipments" && <Shipments call={call} />}
          {tab === "explorer" && !call.cat.isPending && <Explorer call={call} />}
        </div>
      )}
      {call.confirmNode}
    </>
  );
}

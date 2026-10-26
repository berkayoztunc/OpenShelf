import { useMemo, useState } from "react";
import { Download, RefreshCw, Search } from "lucide-react";
import { Button, Card, EmptyState, SelectField, Table, Tabs, Td, TextField } from "../../../components/ui";
import { Term } from "../../../components/help/Term";
import { RangeFields, Stat, TableSkeleton, TyErrorBox, TyPager, ViewGate, dig, downloadText, num, paged, presetRange, rangeValid, str, toCsv, tryMoney, tsDate, useOps, useTyQuery, useTyWrite } from "../../../components/trendyol/views/shared";
import type { Range } from "../../../components/trendyol/views/shared";
import { useT } from "../../../i18n";

const SETTLEMENT_TYPES = ["Sale", "Return", "Discount", "DiscountCancel", "Coupon", "CouponCancel", "ProvisionPositive", "ProvisionNegative", "ManuelRefund", "ManualRefundCancel", "TYDiscount", "TYDiscountCancel", "TYCoupon", "TYCouponCancel", "SellerRevenuePositive", "SellerRevenueNegative", "CommissionPositive", "CommissionNegative", "SellerRevenuePositiveCancel", "SellerRevenueNegativeCancel", "CommissionPositiveCancel", "CommissionNegativeCancel"] as const;
const OTHER_TYPES = ["Stoppage", "CashAdvance", "WireTransfer", "IncomingTransfer", "ReturnInvoice", "CommissionAgreementInvoice", "PaymentOrder", "DeductionInvoices", "FinancialItem"] as const;
const OPS = ["getSettlements", "getOtherFinancials", "getCargoInvoiceItems"];
type TabId = "settlements" | "other" | "cargo";
type Kind = "money" | "date" | "text";
interface Col { key: string; kind: Kind }
const COLS: Record<TabId, Col[]> = {
  settlements: [{ key: "transactionDate", kind: "date" }, { key: "transactionType", kind: "text" }, { key: "orderNumber", kind: "text" }, { key: "description", kind: "text" }, { key: "debt", kind: "money" }, { key: "credit", kind: "money" }, { key: "commissionAmount", kind: "money" }, { key: "sellerRevenue", kind: "money" }],
  other: [{ key: "transactionDate", kind: "date" }, { key: "transactionType", kind: "text" }, { key: "id", kind: "text" }, { key: "description", kind: "text" }, { key: "debt", kind: "money" }, { key: "credit", kind: "money" }, { key: "paymentOrderId", kind: "text" }],
  cargo: [{ key: "orderNumber", kind: "text" }, { key: "shipmentPackageType", kind: "text" }, { key: "parcelUniqueId", kind: "text" }, { key: "amount", kind: "money" }, { key: "desi", kind: "text" }],
};

export default function FinanceView() { return <ViewGate><FinanceBody /></ViewGate>; }

function FinanceBody() {
  const { t } = useT();
  const [tab, setTab] = useState<TabId>("settlements");
  return (
    <div className="space-y-5">
      <Tabs<TabId> label={t("trendyolviews.finance.tabs")} value={tab} onChange={setTab} tabs={[
        { id: "settlements", label: t("trendyolviews.finance.tab.settlements") }, { id: "other", label: t("trendyolviews.finance.tab.other") }, { id: "cargo", label: t("trendyolviews.finance.tab.cargo") }]} />
      <FinTab key={tab} tab={tab} />
    </div>
  );
}

/** One finance list: filters, table, totals (settlements) and CSV export of the loaded rows. */
function FinTab({ tab }: { tab: TabId }) {
  const { t, td, locale } = useT();
  const { ops } = useOps(OPS);
  const w = useTyWrite();
  const [range, setRange] = useState<Range>(() => presetRange("d7"));
  const [type, setType] = useState(tab === "settlements" ? "Sale" : "Stoppage");
  const [size, setSize] = useState("500");
  const [page, setPage] = useState(0);
  const [serial, setSerial] = useState(""); const [appliedSerial, setAppliedSerial] = useState("");
  const [lookup, setLookup] = useState(false);
  const op = ops[tab === "settlements" ? "getSettlements" : tab === "other" ? "getOtherFinancials" : "getCargoInvoiceItems"];
  const needRange = tab !== "cargo";
  const valid = needRange ? rangeValid(range, 15) : !!appliedSerial;
  const input = tab === "cargo" ? { path: { invoiceSerialNumber: appliedSerial }, query: { page, size: Number(size) } }
    : { query: { transactionType: type, startDate: range.start, endDate: range.end, page, size: Number(size) } };
  const q = useTyQuery(w.call.run, op, input, { enabled: valid });
  const data = useMemo(() => paged(q.data?.response.body), [q.data]);
  const rows = data.content;
  const cols = COLS[tab];
  const label = (c: Col) => t(`trendyolviews.finance.col.${c.key}` as never);

  // invoice finder for the cargo tab: DeductionInvoices rows whose type is a cargo invoice
  const finder = useTyQuery(w.call.run, ops.getOtherFinancials, { query: { transactionType: "DeductionInvoices", startDate: range.start, endDate: range.end, size: 500 } }, { enabled: lookup && tab === "cargo" && rangeValid(range, 15) });
  const found = paged(finder.data?.response.body).content.filter((r) => /kargo/i.test(str(r.transactionType)));

  const totals = useMemo(() => {
    const s = (k: string) => rows.reduce((a, r) => a + num(r[k]), 0);
    return { sales: s("credit"), returns: s("debt"), commission: s("commissionAmount"), net: s("sellerRevenue") };
  }, [rows]);

  const cellText = (c: Col, r: Record<string, unknown>): string => {
    const v = dig(r, c.key);
    if (c.kind === "money") return tryMoney(v);
    if (c.kind === "date") return tsDate(v);
    if (c.key === "transactionType") { const k = `trendyolviews.finance.type.${str(v)}`; const l = td(k); return l === k ? str(v) : l; }
    return str(v);
  };
  const exportCsv = () => {
    const sep = locale === "tr" ? ";" : ",";
    const dec = (n: number) => (locale === "tr" ? String(n).replace(".", ",") : String(n));
    const body = rows.map((r) => cols.map((c) => c.kind === "money" ? (dig(r, c.key) === undefined || dig(r, c.key) === null ? "" : dec(num(dig(r, c.key)))) : c.kind === "date" ? (dig(r, c.key) ? new Date(num(dig(r, c.key))).toISOString() : "") : str(dig(r, c.key))));
    downloadText(`trendyol-${tab}-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(cols.map(label), body, sep));
  };

  return (
    <div className="space-y-5">
      <Card title={t("trendyolviews.finance.filters")} actions={<Button size="sm" variant="secondary" loading={q.isFetching} disabled={!valid} onClick={() => void q.refetch()}><RefreshCw size={13} />{t("trendyolviews.common.refresh")}</Button>}>
        <div className="space-y-4">
          {needRange && <RangeFields idPrefix={`tyf-${tab}`} range={range} maxDays={15} presets={["today", "d3", "d7", "d14"]} onChange={(r) => { setPage(0); setRange(r); }} />}
          <div className="grid gap-3 sm:grid-cols-2">
            {tab === "settlements" && <SelectField label={t("trendyolviews.finance.type")} hint={t("trendyolviews.finance.type.hint")} help="trendyolviews.settlementType" value={type} onChange={(e) => { setPage(0); setType(e.target.value); }}>
              {SETTLEMENT_TYPES.map((x) => <option key={x} value={x}>{td(`trendyolviews.finance.stype.${x}`)}</option>)}</SelectField>}
            {tab === "other" && <SelectField label={t("trendyolviews.finance.type")} hint={t("trendyolviews.finance.otherType.hint")} help="trendyolviews.otherType" value={type} onChange={(e) => { setPage(0); setType(e.target.value); }}>
              {OTHER_TYPES.map((x) => <option key={x} value={x}>{td(`trendyolviews.finance.otype.${x}`)}</option>)}</SelectField>}
            <SelectField label={t("trendyolviews.finance.size")} hint={t("trendyolviews.finance.size.hint")} help="trendyolviews.financeSize" value={size} onChange={(e) => { setPage(0); setSize(e.target.value); }}>
              <option value="500">500</option><option value="1000">1000</option></SelectField>
          </div>
          {tab === "cargo" && (
            <form className="space-y-3" role="search" onSubmit={(e) => { e.preventDefault(); setPage(0); setAppliedSerial(serial.trim()); }}>
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-56 flex-1"><TextField label={t("trendyolviews.finance.serial")} hint={t("trendyolviews.finance.serial.hint")} help="trendyolviews.invoiceSerial" value={serial} onChange={(e) => setSerial(e.target.value)} /></div>
                <Button type="submit" variant="secondary" disabled={!serial.trim()}><Search size={14} />{t("trendyolviews.common.search")}</Button>
                <Button variant="ghost" onClick={() => setLookup(true)} loading={finder.isFetching}>{t("trendyolviews.finance.findInvoices")}</Button>
              </div>
              {lookup && !finder.isFetching && (found.length ? <div className="flex flex-wrap gap-2" role="group" aria-label={t("trendyolviews.finance.findInvoices")}>{found.map((r) => <Button key={str(r.id)} size="sm" variant="secondary" onClick={() => { setSerial(str(r.id)); setAppliedSerial(str(r.id)); setPage(0); }}>{str(r.id)} · {tsDate(r.transactionDate)}</Button>)}</div> : <p className="text-xs text-muted">{t("trendyolviews.finance.findInvoices.none")}</p>)}
            </form>
          )}
        </div>
      </Card>

      {tab === "settlements" && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="tdyv-totals">
          <Stat label={t("trendyolviews.finance.total.sales")} value={tryMoney(totals.sales)} hint={t("trendyolviews.finance.total.hint", { n: rows.length })} />
          <Stat label={t("trendyolviews.finance.total.returns")} value={tryMoney(totals.returns)} />
          <Stat label={t("trendyolviews.finance.total.commission")} value={tryMoney(totals.commission)} />
          <Stat label={t("trendyolviews.finance.total.net")} value={tryMoney(totals.net)} />
        </div>
      )}
      {tab === "settlements" && <p className="text-xs text-muted"><Term id="settlement" />: {t("trendyolviews.finance.settlementNote")}</p>}

      <Card title={t(`trendyolviews.finance.tab.${tab}` as never)} actions={<Button size="sm" variant="secondary" disabled={rows.length === 0} onClick={exportCsv}><Download size={13} />{t("trendyolviews.finance.export")}</Button>}>
        {!valid ? <EmptyState title={t(needRange ? "trendyolviews.finance.invalidRange" : "trendyolviews.finance.cargo.start")} description={needRange ? undefined : t("trendyolviews.finance.cargo.startBody")} />
          : q.isPending ? <TableSkeleton />
          : q.error ? <TyErrorBox error={q.error} retry={() => void q.refetch()} />
          : rows.length === 0 ? <EmptyState title={t("trendyolviews.finance.empty.title")} description={t("trendyolviews.finance.empty.body")} />
          : <>
            <Table caption={t(`trendyolviews.finance.tab.${tab}` as never)} head={cols.map((c) => label(c))}>
              {rows.map((r, i) => <tr key={i}>{cols.map((c) => <Td key={c.key} className={c.kind === "money" ? "whitespace-nowrap text-right tabular-nums" : c.kind === "date" ? "whitespace-nowrap text-muted" : undefined}>{cellText(c, r)}</Td>)}</tr>)}
            </Table>
            <TyPager data={data} onPage={setPage} />
            <p className="mt-2 text-xs text-muted">{t("trendyolviews.finance.export.note")}</p>
          </>}
      </Card>
      {w.call.confirmNode}
    </div>
  );
}

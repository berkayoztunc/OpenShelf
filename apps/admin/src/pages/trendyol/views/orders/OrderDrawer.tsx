import { useState } from "react";
import { AlertTriangle, ExternalLink, FileText, PackageCheck, Tag, Truck } from "lucide-react";
import { Badge, Button, ConfirmDialog, Drawer, SelectField, TextField, Toggle } from "../../../../components/ui";
import { Term } from "../../../../components/help/Term";
import { CodeBlock, InlineError, KV, Section, StatusBadge, arr, num, rec, str, tryMoney, tsDate } from "../../../../components/trendyol/views/shared";
import type { useTyWrite } from "../../../../components/trendyol/views/shared";
import { getByPath, prettyJson } from "../../../../lib/trendyol";
import type { TrendyolOperation } from "../../../../lib/trendyol";
import { useT } from "../../../../i18n";

export const CANCEL_REASONS = [500, 501, 502, 504, 505, 506] as const;
type Write = ReturnType<typeof useTyWrite>;

const addrLine = (a: unknown) => str(rec(a).fullAddress) || [rec(a).address1, rec(a).district, rec(a).city].filter(Boolean).join(", ");

/** Order (shipment package) detail: customer, lines, history timeline and the order actions. */
export function OrderDrawer({ pkg, ops, w, onClose }: { pkg: Record<string, unknown> | null; ops: Record<string, TrendyolOperation | undefined>; w: Write; onClose: () => void }) {
  const { t, td } = useT();
  const [invoiceNo, setInvoiceNo] = useState("");
  const [trackInfo, setTrackInfo] = useState(""); const [isPhone, setIsPhone] = useState(false);
  const [boxQty, setBoxQty] = useState("1"); const [deci, setDeci] = useState("");
  const [invLink, setInvLink] = useState("");
  const [cancelLine, setCancelLine] = useState(""); const [cancelQty, setCancelQty] = useState("1"); const [reason, setReason] = useState("500");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [label, setLabel] = useState<string | null>(null);
  if (!pkg) return null;

  const id = num(pkg.shipmentPackageId);
  const status = str(pkg.status);
  const lines = arr(pkg.lines);
  const liveLines = lines.filter((l) => !str(l.cancelledBy) && str(l.orderLineItemStatusName) !== "Cancelled");
  const lineBody = liveLines.map((l) => ({ lineId: l.lineId, quantity: l.quantity }));
  const tracking = str(pkg.cargoTrackingNumber);
  const history = arr(pkg.packageHistories);
  const name = [pkg.customerFirstName, pkg.customerLastName].filter(Boolean).join(" ");
  const path = { packageId: id };
  const missing = (k: string) => !ops[k];
  const sel = lines.find((l) => str(l.lineId) === cancelLine) ?? liveLines[0];

  const setStatus = (to: "Picking" | "Invoiced") =>
    w.exec(ops.updatePackage, { path, body: { lines: lineBody, params: to === "Invoiced" ? { invoiceNumber: invoiceNo.trim() } : {}, status: to } });
  const loadLabel = async () => {
    const r = await w.exec(ops.getCommonLabel, { path: { cargoTrackingNumber: tracking } }, { refresh: false });
    if (r?.ok) { const d = getByPath(r.response.body, "data"); setLabel(typeof d === "string" ? d : prettyJson(r.response.body)); }
  };

  return (
    <Drawer open onClose={onClose} title={<span className="font-mono">{str(pkg.orderNumber)}</span>}
      subtitle={<span className="flex flex-wrap items-center gap-2"><StatusBadge group="order" value={status} /><span>{tsDate(pkg.orderDate)}</span><span className="font-mono text-xs">#{id}</span></span>}
      footer={<Button variant="ghost" onClick={onClose}>{t("common.close")}</Button>}>
      <div className="space-y-6" data-testid="tdyv-order-drawer">
        <InlineError text={w.err} />

        <Section title={t("trendyolviews.orders.customer")} note={<Badge tone="warning">{t("trendyolviews.orders.pii")}</Badge>}>
          <p className="text-xs text-muted">{t("trendyolviews.orders.piiNote")}</p>
          <dl className="grid gap-3 sm:grid-cols-2">
            <KV label={t("trendyolviews.orders.name")}>{name}</KV>
            <KV label={t("trendyolviews.orders.email")}>{str(pkg.customerEmail)}</KV>
            <KV label={t("trendyolviews.orders.phone")}>{str(rec(pkg.shipmentAddress).phone)}</KV>
            <KV label={t("trendyolviews.orders.payment")}>{str(pkg.paymentMethod)}</KV>
            <div className="sm:col-span-2"><KV label={t("trendyolviews.orders.shipAddress")}>{addrLine(pkg.shipmentAddress)}</KV></div>
            <div className="sm:col-span-2"><KV label={t("trendyolviews.orders.invoiceAddress")}>{addrLine(pkg.invoiceAddress)}</KV></div>
          </dl>
        </Section>

        <Section title={t("trendyolviews.orders.lines")}>
          <ul className="divide-y divide-line rounded-xl border border-line">
            {lines.map((l, i) => (
              <li key={i} className="flex flex-wrap items-start justify-between gap-2 px-3 py-2.5 text-sm">
                <div className="min-w-0"><p className="font-medium">{str(l.productName)} <span className="text-muted">×{num(l.quantity)}</span></p>
                  <p className="text-xs text-muted"><Term id="barcode" />: <span className="font-mono">{str(l.barcode)}</span> · {str(l.stockCode)}</p></div>
                <div className="text-right tabular-nums"><p>{tryMoney(num(l.lineGrossAmount) - num(l.lineTotalDiscount))}</p>
                  {num(l.lineTotalDiscount) > 0 && <p className="text-xs text-muted">{t("trendyolviews.orders.discount")} −{tryMoney(l.lineTotalDiscount)}</p>}</div>
              </li>
            ))}
          </ul>
          <p className="text-right text-sm font-semibold tabular-nums">{t("trendyolviews.orders.total")}: {tryMoney(pkg.packageTotalPrice)}</p>
        </Section>

        <Section title={<><Term id="carrier" />{" · "}<Term id="trackingno" /></>}>
          <dl className="grid gap-3 sm:grid-cols-2">
            <KV label={t("trendyolviews.orders.cargo")}>{str(pkg.cargoProviderName)}</KV>
            <KV label={t("trendyolviews.orders.tracking")} mono>{tracking}</KV>
            <KV label={t("trendyolviews.orders.deci")}>{str(pkg.deci)}</KV>
            <KV label={t("trendyolviews.orders.boxes")}>{str(pkg.boxQuantity)}</KV>
          </dl>
          {str(pkg.cargoTrackingLink) && <a href={str(pkg.cargoTrackingLink)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-brand-ink underline-offset-2 hover:underline"><ExternalLink size={13} />{t("trendyolviews.orders.trackLink")}</a>}
        </Section>

        <Section title={t("trendyolviews.orders.history")}>
          <ol className="relative space-y-3 border-l border-line pl-4" aria-label={t("trendyolviews.orders.history")}>
            {[...history].reverse().map((h, i) => (
              <li key={i} className="relative"><span aria-hidden className="absolute -left-[21px] top-1.5 size-2.5 rounded-full bg-brand-600 ring-4 ring-surface" />
                <StatusBadge group="order" value={str(h.status)} /> <span className="ml-2 text-xs text-muted">{tsDate(h.createdDate)}</span></li>
            ))}
            {history.length === 0 && <li className="text-sm text-muted">{t("trendyolviews.orders.historyEmpty")}</li>}
          </ol>
        </Section>

        <Section title={t("trendyolviews.orders.actions")}>
          <div className="space-y-5">
            <div className="space-y-2 rounded-xl border border-line p-3">
              <p className="text-sm font-medium">{t("trendyolviews.orders.flow")}</p>
              <p className="text-xs text-muted">{t("trendyolviews.orders.flowNote")}</p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" disabled={status !== "Created" || missing("updatePackage")} loading={w.call.isPending} onClick={() => void setStatus("Picking")}><PackageCheck size={14} />{t("trendyolviews.orders.markPicking")}</Button>
              </div>
              <TextField label={t("trendyolviews.orders.invoiceNo")} hint={t("trendyolviews.orders.invoiceNo.hint")} help="trendyolviews.invoiceNo" value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} placeholder="EME2018000025208" disabled={status !== "Picking"} />
              <Button size="sm" disabled={status !== "Picking" || !invoiceNo.trim() || missing("updatePackage")} loading={w.call.isPending} onClick={() => void setStatus("Invoiced")}>{t("trendyolviews.orders.markInvoiced")}</Button>
            </div>

            <div className="space-y-2 rounded-xl border border-line p-3">
              <p className="flex items-center gap-1.5 text-sm font-medium"><FileText size={14} />{t("trendyolviews.orders.invoiceLink")}</p>
              <TextField label={t("trendyolviews.orders.invoiceLink.field")} hint={t("trendyolviews.orders.invoiceLink.hint")} help="trendyolviews.invoiceLink" type="url" value={invLink} onChange={(e) => setInvLink(e.target.value)} placeholder="https://" />
              <Button size="sm" variant="secondary" disabled={!/^https:\/\//.test(invLink.trim()) || missing("sendInvoiceLink")}
                onClick={() => void w.exec(ops.sendInvoiceLink, { body: { invoiceLink: invLink.trim(), shipmentPackageId: id, ...(invoiceNo.trim() ? { invoiceNumber: invoiceNo.trim() } : {}), invoiceDateTime: Math.floor(Date.now() / 1000) } })}>{t("trendyolviews.orders.invoiceLink.send")}</Button>
            </div>

            <div className="space-y-2 rounded-xl border border-line p-3">
              <p className="flex items-center gap-1.5 text-sm font-medium"><Truck size={14} />{t("trendyolviews.orders.altDelivery")}</p>
              <p className="text-xs text-muted">{t("trendyolviews.orders.altDelivery.note")}</p>
              <TextField label={t("trendyolviews.orders.trackInfo")} hint={t("trendyolviews.orders.trackInfo.hint")} help="trendyolviews.trackInfo" value={trackInfo} onChange={(e) => setTrackInfo(e.target.value)} />
              <Toggle checked={isPhone} onChange={setIsPhone} label={t("trendyolviews.orders.isPhone")} hint={t("trendyolviews.orders.isPhone.hint")} help="trendyolviews.isPhone" />
              <Button size="sm" variant="secondary" disabled={!trackInfo.trim() || missing("processAlternativeDelivery")}
                onClick={() => void w.exec(ops.processAlternativeDelivery, { path, body: { isPhoneNumber: isPhone, trackingInfo: trackInfo.trim(), params: {}, ...(num(boxQty) ? { boxQuantity: num(boxQty) } : {}), ...(num(deci) ? { deci: num(deci) } : {}) } })}>{t("trendyolviews.orders.altDelivery.send")}</Button>
            </div>

            <div className="space-y-2 rounded-xl border border-line p-3">
              <p className="flex items-center gap-1.5 text-sm font-medium"><Tag size={14} />{t("trendyolviews.orders.boxLabel")}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <TextField label={t("trendyolviews.orders.deci")} hint={t("trendyolviews.orders.deci.hint")} help="trendyolviews.deci" inputMode="decimal" value={deci} onChange={(e) => setDeci(e.target.value)} />
                <TextField label={t("trendyolviews.orders.boxes")} hint={t("trendyolviews.orders.boxes.hint")} help="trendyolviews.boxQuantity" inputMode="numeric" value={boxQty} onChange={(e) => setBoxQty(e.target.value)} />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" disabled={!num(deci) || !num(boxQty) || missing("updateBoxInfo")} onClick={() => void w.exec(ops.updateBoxInfo, { path, body: { deci: num(deci), boxQuantity: num(boxQty) } })}>{t("trendyolviews.orders.boxInfo.save")}</Button>
                <Button size="sm" variant="secondary" disabled={!tracking || missing("createCommonLabel")} onClick={() => void w.exec(ops.createCommonLabel, { path: { cargoTrackingNumber: tracking }, body: { format: "ZPL", boxQuantity: num(boxQty) || 1 } }, { refresh: false })}>{t("trendyolviews.orders.label.create")}</Button>
                <Button size="sm" variant="ghost" disabled={!tracking || missing("getCommonLabel")} onClick={() => void loadLabel()}>{t("trendyolviews.orders.label.get")}</Button>
              </div>
              <p className="text-xs text-muted"><Term id="commonlabel" />: {t("trendyolviews.orders.label.note")}</p>
              {label && <CodeBlock label={t("trendyolviews.orders.label.get")}>{label}</CodeBlock>}
            </div>

            <div className="space-y-2 rounded-xl border border-danger-line p-3">
              <p className="flex items-center gap-1.5 text-sm font-medium text-danger"><AlertTriangle size={14} />{t("trendyolviews.orders.cancelItem")}</p>
              <p className="text-xs text-muted">{t("trendyolviews.orders.cancelItem.note")}</p>
              <SelectField label={t("trendyolviews.orders.cancelLine")} hint={t("trendyolviews.orders.cancelLine.hint")} help="trendyolviews.cancelLine" value={cancelLine || str(sel?.lineId)} onChange={(e) => { setCancelLine(e.target.value); setCancelQty("1"); }}>
                {liveLines.map((l) => <option key={str(l.lineId)} value={str(l.lineId)}>{str(l.productName)} ×{num(l.quantity)}</option>)}
              </SelectField>
              <div className="grid gap-3 sm:grid-cols-2">
                <TextField label={t("trendyolviews.orders.cancelQty")} hint={t("trendyolviews.orders.cancelQty.hint")} help="trendyolviews.cancelQty" inputMode="numeric" value={cancelQty} onChange={(e) => setCancelQty(e.target.value)} />
                <SelectField label={t("trendyolviews.orders.cancelReason")} hint={t("trendyolviews.orders.cancelReason.hint")} help="trendyolviews.cancelReason" value={reason} onChange={(e) => setReason(e.target.value)}>
                  {CANCEL_REASONS.map((r) => <option key={r} value={r}>{td(`trendyolviews.orders.reason.${r}`)}</option>)}
                </SelectField>
              </div>
              <Button size="sm" variant="danger" disabled={!sel || num(cancelQty) < 1 || num(cancelQty) > num(sel?.quantity) || missing("cancelOrderPackageItem")} onClick={() => setConfirmCancel(true)}>{t("trendyolviews.orders.cancelItem.button")}</Button>
            </div>
          </div>
        </Section>
      </div>
      <ConfirmDialog open={confirmCancel} danger title={t("trendyolviews.orders.cancelItem.confirm.title")} message={t("trendyolviews.orders.cancelItem.confirm.message")} confirmLabel={t("trendyolviews.orders.cancelItem.button")} loading={w.call.isPending}
        onClose={() => setConfirmCancel(false)}
        onConfirm={() => { setConfirmCancel(false); void w.exec(ops.cancelOrderPackageItem, { path, body: { lines: [{ lineId: sel?.lineId, quantity: num(cancelQty) }], reasonId: Number(reason) } }, { skipConfirm: true }); }} />
    </Drawer>
  );
}

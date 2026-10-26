import { computeInvoiceTotals } from "@openshelf/shared";
import { dateOnly, enumLabel, money } from "../../lib/format";
import { translate, useT } from "../../i18n";
import type { Locale } from "../../i18n";
import { fullName, orderInvoiceLines, streetOf } from "../../lib/rawOrder";
import type { RawAddress, RawOrder } from "../../lib/rawOrder";
import type { InvoiceFull } from "../../lib/invoices";
import { Code128 } from "./Barcode";

export interface Seller { name: string; address?: string; phone?: string; email?: string; taxId?: string }

/** Dates follow the active admin language (numeric timestamps are unix seconds). */
const day = (v?: string | number | null) => { if (v == null) return ""; const d = new Date(typeof v === "number" && v < 1e12 ? v * 1000 : v); return Number.isNaN(d.getTime()) ? String(v) : dateOnly(d.toISOString()); };
const typeName = (t?: string | null) => (t === "e_fatura" ? "e-Fatura" : t === "e_arsiv" ? "e-Arşiv" : "");
/** Dual-language heading: the active language first, the other one after the slash ("Gönderici / Sender" or "Sender / Gönderici"). */
const biFor = (locale: Locale) => (key: string) => { const other: Locale = locale === "tr" ? "en" : "tr"; const a = translate(locale, key), b = translate(other, key); return a === b ? a : `${a} / ${b}`; };
function useBi() { const { t, locale } = useT(); return { t, locale, bi: biFor(locale) }; }
const cityLine = (a?: RawAddress | null) => [a?.district, [a?.zip, a?.city].filter(Boolean).join(" ")].filter(Boolean).join(" / ");

function AddressBlock({ a, name }: { a?: RawAddress | null; name?: string }) {
  const { t } = useT();
  return (
    <address className="pr-addr">
      <strong>{name ?? fullName(a)}</strong>
      {a?.isCompany && a.taxId && <span>{t("print.vkn", { id: a.taxId })}{a.taxOffice ? ` / ${a.taxOffice}` : ""}</span>}
      {a?.phone && <span>{a.phone}</span>}
      {streetOf(a) && <span>{streetOf(a)}</span>}
      {cityLine(a) && <span>{cityLine(a)}</span>}
      {a?.country && a.country !== "TR" && <span>{a.country}</span>}
    </address>
  );
}

/* ---------- 100x150mm shipping label ---------- */
export function LabelDoc({ order, seller }: { order: RawOrder; seller: Seller }) {
  const { bi } = useBi();
  const ship = order.shipments.find((s) => s.trackingNumber) ?? order.shipments[0];
  const a = order.shippingAddress;
  const code = ship?.trackingNumber?.trim() || order.number;
  const qty = order.items.reduce((n, i) => n + i.quantity, 0);
  return (
    <section className="pr-page pr-label" data-testid="label-doc">
      <div className="pr-label-from">
        <small>{bi("print.h.sender")}</small>
        <strong>{seller.name}</strong>
        <span>{[seller.address, seller.phone].filter(Boolean).join(" · ")}</span>
      </div>
      <div className="pr-label-to">
        <small>{bi("print.h.recipient")}</small>
        <div className="pr-label-name">{fullName(a) || order.email}</div>
        {a?.phone && <div className="pr-label-phone">{bi("print.h.phone")}: {a.phone}</div>}
        <div className="pr-label-street">{streetOf(a)}</div>
        <div className="pr-label-city">{[a?.district, a?.city].filter(Boolean).join(" / ")} {a?.zip}</div>
      </div>
      <div className="pr-label-code">
        <div className="pr-label-carrier"><span>{ship?.carrier ?? bi("print.h.carrier")}</span><span>{ship?.trackingNumber ? bi("print.h.tracking") : bi("print.h.noTracking")}</span></div>
        <Code128 value={code} height={64} />
        <div className="pr-label-codetext">{code}</div>
      </div>
      <div className="pr-label-foot">
        <div><small>{bi("print.h.order")}</small><strong>#{order.number}</strong></div>
        <div><small>{bi("print.h.items")}</small><strong>{qty}</strong></div>
        <div><small>{bi("print.h.date")}</small><strong>{day(order.createdAt)}</strong></div>
      </div>
    </section>
  );
}

/* ---------- A4 packing slip ---------- */
export function PackingDoc({ order, seller, showPrices }: { order: RawOrder; seller: Seller; showPrices: boolean }) {
  const { bi } = useBi();
  const ship = order.shippingAddress; const bill = order.billingAddress ?? order.shippingAddress;
  return (
    <section className="pr-page pr-a4" data-testid="packing-doc">
      <header className="pr-head"><div><h1>{bi("print.h.packingTitle")}</h1><p>{seller.name}</p></div><div className="pr-meta"><strong>#{order.number}</strong><span>{day(order.createdAt)}</span></div></header>
      <div className="pr-cols">
        <div><h2>{bi("print.h.shipTo")}</h2><AddressBlock a={ship} /></div>
        <div><h2>{bi("print.h.billTo")}</h2><AddressBlock a={bill} /></div>
      </div>
      <table className="pr-table"><thead><tr><th>{bi("print.h.item")}</th><th>{bi("print.h.sku")}</th><th className="r">{bi("print.h.qty")}</th>{showPrices && <><th className="r">{bi("print.h.unit")}</th><th className="r">{bi("print.h.total")}</th></>}</tr></thead>
        <tbody>{order.items.map((i) => <tr key={i.id}><td>{i.name}</td><td>{i.sku}</td><td className="r">{i.quantity}</td>{showPrices && <><td className="r">{money(i.unitPrice, order.currency)}</td><td className="r">{money(i.unitPrice * i.quantity, order.currency)}</td></>}</tr>)}</tbody></table>
      {showPrices && <p className="pr-total">{bi("print.h.total")}: <strong>{money(order.total, order.currency)}</strong></p>}
      {order.notes && <div className="pr-note"><h2>{bi("print.h.notes")}</h2><p>{order.notes}</p></div>}
      <footer className="pr-foot">{bi("print.h.thanks")}</footer>
    </section>
  );
}

/* ---------- Invoice (order copy + manual invoice share one template) ---------- */
export interface InvoiceDocData {
  number?: string | null; type?: string | null; date: string; currency: string; pricesIncludeTax: boolean; orderNumber?: string;
  seller: Seller; buyer: { name: string; email?: string; taxId?: string; taxOffice?: string; isCompany: boolean; address: string[] };
  lines: { name: string; sku?: string; quantity: number; unitPrice: number; taxRate: number; discount: number }[];
  notes?: string | null; pdfUrl?: string | null; issued: boolean;
}

export function orderInvoiceData(o: RawOrder, seller: Seller, defaultRate: number): InvoiceDocData {
  const inv = o.invoices.find((i) => i.number && i.status !== "failed" && i.status !== "cancelled") ?? o.invoices.find((i) => i.status === "issued");
  const b = o.billingAddress ?? o.shippingAddress;
  return {
    number: inv?.number ?? null, type: inv?.type ?? null, date: day(inv?.createdAt ?? o.createdAt), currency: o.currency, pricesIncludeTax: true, orderNumber: o.number,
    seller, buyer: { name: fullName(b) || o.email || "", email: o.email, taxId: b?.taxId, taxOffice: b?.taxOffice, isCompany: !!b?.isCompany, address: [streetOf(b), cityLine(b)].filter(Boolean) as string[] },
    lines: orderInvoiceLines(o, defaultRate), notes: o.notes, pdfUrl: inv?.pdfUrl ?? null, issued: !!inv,
  };
}
export function manualInvoiceData(m: InvoiceFull, seller: Seller): InvoiceDocData {
  return {
    number: m.number, type: m.type, date: day(m.issueDate ?? m.issuedAt ?? m.createdAt), currency: m.currency, pricesIncludeTax: m.pricesIncludeTax,
    seller, buyer: { name: m.customer.name, email: m.customer.email, taxId: m.customer.taxId, taxOffice: m.customer.taxOffice, isCompany: !!m.customer.isCompany, address: [m.customer.address, m.customer.city].filter(Boolean) },
    lines: m.lines.map((l) => ({ name: l.name, sku: l.sku, quantity: l.quantity, unitPrice: l.unitPrice, taxRate: l.taxRate, discount: l.discount ?? 0 })),
    notes: m.notes, pdfUrl: m.pdfUrl, issued: m.status === "issued",
  };
}

export function InvoiceDoc({ data }: { data: InvoiceDocData }) {
  const { t, locale, bi } = useBi();
  const other: Locale = locale === "tr" ? "en" : "tr";
  const c = data.currency;
  const tot = computeInvoiceTotals(data.lines.map((l) => ({ ...l })), data.pricesIncludeTax);
  const byRate = new Map<number, { net: number; tax: number }>();
  data.lines.forEach((l, i) => { const r = byRate.get(l.taxRate) ?? { net: 0, tax: 0 }; r.net += tot.lines[i]!.net; r.tax += tot.lines[i]!.tax; byRate.set(l.taxRate, r); });
  const discount = data.lines.reduce((s, l) => s + l.discount, 0);
  return (
    <section className="pr-page pr-a4 pr-invoice" data-testid="invoice-doc">
      {!data.issued && <div className="pr-watermark" aria-hidden>{translate(locale, "print.notInvoiced")}<br />{translate(other, "print.notInvoiced")}</div>}
      <header className="pr-head">
        <div><h1>{bi("print.h.invoiceTitle")}</h1><p>{typeName(data.type)}{data.number ? ` · ${data.number}` : ""}</p></div>
        <div className="pr-meta">{data.number ? <strong data-testid="invoice-number">{data.number}</strong> : <strong data-testid="invoice-number">{t("print.notInvoiced")}</strong>}<span>{data.date}</span>{data.orderNumber && <span>{bi("print.h.order")} #{data.orderNumber}</span>}</div>
      </header>
      <div className="pr-cols">
        <div><h2>{bi("print.h.seller")}</h2><address className="pr-addr"><strong>{data.seller.name}</strong>{data.seller.address && <span>{data.seller.address}</span>}{data.seller.phone && <span>{data.seller.phone}</span>}{data.seller.email && <span>{data.seller.email}</span>}{data.seller.taxId && <span>{t("print.sellerTax", { id: data.seller.taxId })}</span>}</address></div>
        <div><h2>{bi("print.h.buyer")}</h2><address className="pr-addr"><strong>{data.buyer.name}</strong>{data.buyer.isCompany && data.buyer.taxId && <span>{t("print.vkn", { id: data.buyer.taxId })}</span>}{data.buyer.isCompany && data.buyer.taxOffice && <span>{bi("print.h.taxOffice")}: {data.buyer.taxOffice}</span>}{!data.buyer.isCompany && data.buyer.taxId && <span>{t("print.tckn", { id: data.buyer.taxId })}</span>}{data.buyer.address.map((l, i) => <span key={i}>{l}</span>)}{data.buyer.email && <span>{data.buyer.email}</span>}</address></div>
      </div>
      <table className="pr-table"><thead><tr><th>{bi("print.h.description")}</th><th className="r">{bi("print.h.qty")}</th><th className="r">{bi("print.h.unit")}</th><th className="r">{bi("print.h.kdv")}</th><th className="r">{bi("print.h.discount")}</th><th className="r">{bi("print.h.total")}</th></tr></thead>
        <tbody>{data.lines.map((l, i) => <tr key={i}><td>{l.name}{l.sku && <small> {l.sku}</small>}</td><td className="r">{l.quantity}</td><td className="r">{money(l.unitPrice, c)}</td><td className="r">%{l.taxRate}</td><td className="r">{l.discount ? `-${money(l.discount, c)}` : "-"}</td><td className="r">{money(tot.lines[i]!.total, c)}</td></tr>)}</tbody></table>
      <div className="pr-sum">
        <table><tbody>
          <tr><td>{bi("print.h.net")}</td><td className="r">{money(tot.net, c)}</td></tr>
          {[...byRate.entries()].sort((a, b) => a[0] - b[0]).map(([rate, v]) => <tr key={rate}><td>{bi("print.h.kdvRow")} %{rate} <small>({money(v.net, c)})</small></td><td className="r">{money(v.tax, c)}</td></tr>)}
          {discount > 0 && <tr><td>{bi("print.h.discountIncluded")}</td><td className="r">-{money(discount, c)}</td></tr>}
          <tr className="pr-grand"><td>{bi("print.h.grand")}</td><td className="r" data-testid="invoice-total">{money(tot.total, c)}</td></tr>
        </tbody></table>
      </div>
      {data.notes && <div className="pr-note"><h2>{bi("print.h.notes")}</h2><p>{data.notes}</p></div>}
      <p className="pr-disclaimer">{translate(locale, "print.disclaimer")}<br />{translate(other, "print.disclaimer")}</p>
      {data.pdfUrl && <p className="pr-screen-only"><a href={data.pdfUrl} target="_blank" rel="noopener noreferrer">{t("print.openPdf")}</a></p>}
    </section>
  );
}

/* ---------- A4 order summary ---------- */
export function SummaryDoc({ order, seller }: { order: RawOrder; seller: Seller }) {
  const { t, bi } = useBi();
  const c = order.currency; const bill = order.billingAddress ?? order.shippingAddress;
  return (
    <section className="pr-page pr-a4" data-testid="summary-doc">
      <header className="pr-head"><div><h1>{bi("print.h.summaryTitle")}</h1><p>{seller.name}</p></div><div className="pr-meta"><strong>#{order.number}</strong><span>{day(order.createdAt)}</span><span>{enumLabel("status", order.status)} · {enumLabel("source", order.source)}</span></div></header>
      <div className="pr-cols">
        <div><h2>{bi("print.h.customer")}</h2><address className="pr-addr"><strong>{fullName(order.shippingAddress) || order.email}</strong>{order.email && <span>{order.email}</span>}{order.shippingAddress?.phone && <span>{order.shippingAddress.phone}</span>}</address></div>
        <div><h2>{bi("print.h.shipTo")}</h2><AddressBlock a={order.shippingAddress} /></div>
        <div><h2>{bi("print.h.billTo")}</h2><AddressBlock a={bill} /></div>
      </div>
      <table className="pr-table"><thead><tr><th>{bi("print.h.item")}</th><th>{bi("print.h.sku")}</th><th className="r">{bi("print.h.qty")}</th><th className="r">{bi("print.h.unit")}</th><th className="r">{bi("print.h.total")}</th></tr></thead>
        <tbody>{order.items.map((i) => <tr key={i.id}><td>{i.name}</td><td>{i.sku}</td><td className="r">{i.quantity}</td><td className="r">{money(i.unitPrice, c)}</td><td className="r">{money(i.unitPrice * i.quantity, c)}</td></tr>)}</tbody></table>
      <div className="pr-sum"><table><tbody>
        <tr><td>{bi("print.h.subtotal")}</td><td className="r">{money(order.subtotal, c)}</td></tr>
        {order.discountTotal > 0 && <tr><td>{bi("print.h.discountRow")}{order.couponCode ? ` (${order.couponCode})` : ""}</td><td className="r">-{money(order.discountTotal, c)}</td></tr>}
        <tr><td>{bi("print.h.shipping")}</td><td className="r">{money(order.shippingTotal, c)}</td></tr>
        <tr><td>{bi("print.h.vatIncluded")}</td><td className="r">{money(order.taxTotal, c)}</td></tr>
        <tr className="pr-grand"><td>{bi("print.h.total")}</td><td className="r">{money(order.total, c)}</td></tr>
      </tbody></table></div>
      <div className="pr-cols pr-cols-3">
        <div><h2>{bi("print.h.payments")}</h2>{order.payments.length ? <ul>{order.payments.map((p) => <li key={p.id}>{enumLabel("provider", p.provider)} · {enumLabel("payment", p.status)} · {money(p.amount, c)}{p.isMock ? ` ${t("print.mock")}` : ""}</li>)}</ul> : <p>-</p>}</div>
        <div><h2>{bi("print.h.shipments")}</h2>{order.shipments.length ? <ul>{order.shipments.map((s) => <li key={s.id}>{s.carrier ?? "-"} · {s.trackingNumber ?? "-"} · {enumLabel("shipment", s.status)}</li>)}</ul> : <p>-</p>}</div>
        <div><h2>{bi("print.h.invoices")}</h2>{order.invoices.length ? <ul>{order.invoices.map((i) => <li key={i.id}>{typeName(i.type) || i.type} · {i.number ?? "-"} · {enumLabel("invoice", i.status)}</li>)}</ul> : <p>-</p>}</div>
      </div>
      {order.notes && <div className="pr-note"><h2>{bi("print.h.notes")}</h2><p>{order.notes}</p></div>}
    </section>
  );
}

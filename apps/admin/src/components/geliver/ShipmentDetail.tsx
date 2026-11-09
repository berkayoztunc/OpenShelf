import { ExternalLink } from "lucide-react";
import { useState } from "react";
import { Badge, Tabs } from "../ui";
import { JsonPanel } from "./JsonPanel";
import { OffersTable } from "./Offers";
import { fmtDate, moneyStr, offersOf, place, statusTone } from "../../lib/geliver";
import { useT } from "../../i18n";

type Tab = "summary" | "offers" | "json";

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  if (children === null || children === undefined || children === "" || children === false) return null;
  return <div className="flex justify-between gap-4 py-1 text-sm"><dt className="shrink-0 text-muted">{label}</dt><dd className="min-w-0 break-words text-right">{children}</dd></div>;
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="rounded-lg border border-line p-3"><h3 className="mb-1 text-[13px] font-semibold">{title}</h3><dl className="divide-y divide-line/60">{children}</dl></section>;
}
const link = (href: string, text: string) => <a className="inline-flex items-center gap-1 text-brand-700 underline" href={href} target="_blank" rel="noreferrer noopener">{text}<ExternalLink size={12} /></a>;
const httpsOnly = (u: unknown): string | undefined => (typeof u === "string" && /^https:\/\//.test(u) ? u : undefined);

function AddressCard({ title, a }: { title: string; a: any }) {
  const { t } = useT();
  if (!a) return null;
  return (
    <Section title={title}>
      <Item label={t("geliver.d.name")}>{a.name}</Item><Item label={t("geliver.d.phone")}>{a.phone}</Item><Item label={t("geliver.d.email")}>{a.email}</Item>
      <Item label={t("geliver.d.address")}><span className="whitespace-pre-line">{[a.address1, a.address2].filter(Boolean).join("\n")}</span></Item>
      <Item label={t("geliver.d.region")}>{[place(a), a.zip].filter(Boolean).join(" · ")}</Item>
    </Section>
  );
}

/** Structured view of one Geliver shipment (the `data` object of getShipment / list rows) + offers + raw JSON. */
export function ShipmentDetail({ s, raw }: { s: any; raw: unknown }) {
  const { t, locale } = useT();
  const [tab, setTab] = useState<Tab>("summary");
  const ts = s?.trackingStatus;
  const offers = offersOf(s);
  const label = httpsOnly(s?.labelURL), responsive = httpsOnly(s?.responsiveLabelURL), trackUrl = httpsOnly(s?.trackingUrl);
  const when = (v: unknown) => fmtDate(v, locale);
  return (
    <div className="space-y-4" data-testid="gl-detail">
      <div className="flex flex-wrap items-center gap-2">
        {s?.statusCode && <Badge tone={statusTone(s.statusCode)}>{s.statusCode}</Badge>}
        {ts?.trackingStatusCode && <Badge tone={statusTone(ts.trackingStatusCode)}>{ts.trackingStatusCode}</Badge>}
        {s?.providerCode && <Badge tone="neutral">{s.providerCode}</Badge>}
        {s?.test && <Badge tone="info">{t("geliver.d.testShipment")}</Badge>}
        {s?.isReturned && <Badge tone="danger">{t("geliver.d.returned")}</Badge>}
        {s?.productPaymentOnDelivery && <Badge tone="warning">{t("geliver.d.cod")}</Badge>}
        {s?.hasError && <Badge tone="danger">{t("geliver.d.hasError")}</Badge>}
      </div>
      {s?.hasError && s?.lastErrorMessage && <p className="rounded-lg bg-danger-soft p-3 text-sm text-danger">{s.lastErrorMessage}{s.lastErrorCode ? ` (${s.lastErrorCode})` : ""}</p>}
      <Tabs<Tab> label={t("geliver.d.tabs")} value={tab} onChange={setTab} tabs={[{ id: "summary", label: t("geliver.d.summary") }, { id: "offers", label: `${t("geliver.d.offers")} (${offers.length})` }, { id: "json", label: "JSON" }]} />
      {tab === "summary" && (
        <div className="grid gap-3 md:grid-cols-2">
          <Section title={t("geliver.d.tracking")}>
            <Item label={t("geliver.col.tracking")}><span className="font-mono">{s?.trackingNumber}</span></Item>
            <Item label={t("geliver.d.service")}><span className="font-mono">{s?.providerServiceCode}</span></Item>
            <Item label={t("geliver.d.lastEvent")}>{ts?.statusDetails}</Item>
            <Item label={t("geliver.d.location")}>{ts?.locationName}</Item>
            <Item label={t("geliver.d.eventDate")}>{when(ts?.statusDate)}</Item>
            <Item label={t("geliver.d.accepted")}>{when(s?.packageAcceptedAt)}</Item>
            <Item label={t("geliver.d.links")}><span className="flex flex-wrap justify-end gap-x-3">{trackUrl && link(trackUrl, t("geliver.d.trackPage"))}{label && link(label, t("geliver.flow.label"))}{responsive && link(responsive, t("geliver.d.responsiveLabel"))}</span></Item>
          </Section>
          <Section title={t("geliver.d.cost")}>
            <Item label={t("geliver.d.net")}>{moneyStr(s?.amount, s?.currency)}</Item>
            <Item label={t("geliver.d.vat")}>{moneyStr(s?.amountVat, s?.currency)}</Item>
            <Item label={t("geliver.d.total")}><strong>{moneyStr(s?.totalAmount, s?.currency)}</strong></Item>
            <Item label={t("geliver.d.bonus")}>{s?.bonusBalance && s.bonusBalance !== "0" ? moneyStr(s.bonusBalance, s.currency) : ""}</Item>
            <Item label={t("geliver.d.discount")}>{s?.discountRate && s.discountRate !== "0" ? `${s.discountRate}%` : ""}</Item>
          </Section>
          <Section title={t("geliver.d.parcel")}>
            <Item label={t("geliver.d.dimensions")}>{s?.length && s?.width && s?.height ? `${s.length} × ${s.width} × ${s.height} ${s.distanceUnit || "cm"}` : ""}</Item>
            <Item label="Desi">{s?.desi}</Item>
            <Item label={t("geliver.d.weight")}>{s?.weight && s.weight !== "0" ? `${s.weight} ${s.massUnit || "kg"}` : ""}</Item>
          </Section>
          <Section title={t("geliver.d.order")}>
            <Item label={t("geliver.col.order")}>{s?.order?.orderNumber}</Item>
            <Item label={t("geliver.d.source")}>{s?.order?.sourceCode}</Item>
            <Item label={t("geliver.d.notes")}>{s?.order?.notes}</Item>
            <Item label={t("geliver.d.created")}>{when(s?.createdAt)}</Item>
            <Item label={t("geliver.d.updated")}>{when(s?.updatedAt)}</Item>
            <Item label={t("geliver.d.shipDate")}>{when(s?.shipmentDate)}</Item>
            <Item label="ID"><span className="font-mono text-xs">{s?.id}</span></Item>
          </Section>
          <AddressCard title={t("geliver.d.sender")} a={s?.senderAddress} />
          <AddressCard title={t("geliver.d.recipient")} a={s?.recipientAddress} />
        </div>
      )}
      {tab === "offers" && (offers.length ? <OffersTable offers={offers} caption={t("geliver.d.offers")} /> : <p className="text-sm text-muted">{t("geliver.quote.empty")}</p>)}
      {tab === "json" && <JsonPanel value={raw} maxHeight="50vh" />}
    </div>
  );
}

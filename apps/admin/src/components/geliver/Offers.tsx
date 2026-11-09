import { Star } from "lucide-react";
import { Badge, Button, Table, Td } from "../ui";
import { useT } from "../../i18n";
import { moneyStr, type OfferView } from "../../lib/geliver";

/** Carrier offers: price, ETA, rating, cheapest/fastest/accepted tags; optional "accept" action. */
export function OffersTable({ offers, onPick, pickLabel, busy, caption }: { offers: OfferView[]; onPick?: (o: OfferView) => void; pickLabel?: string; busy?: boolean; caption: string }) {
  const { t } = useT();
  return (
    <Table caption={caption} head={[t("geliver.col.carrier"), t("geliver.col.eta"), t("geliver.col.rating"), t("geliver.col.price"), ...(onPick ? [<span key="a" className="sr-only">{t("geliver.col.actions")}</span>] : [])]}>
      {offers.map((o, i) => (
        <tr key={o.id ?? i} className={o.accepted ? "bg-success-soft/40" : undefined}>
          <Td>
            <div className="font-medium">{o.providerCode}</div>
            <div className="font-mono text-[12px] text-muted">{o.providerServiceCode}</div>
            <div className="mt-1 flex flex-wrap gap-1">
              {o.accepted && <Badge tone="success">{t("geliver.offer.accepted")}</Badge>}
              {o.tags.map((x) => <Badge key={x} tone="info">{t(`geliver.offer.${x}`)}</Badge>)}
              {o.pickup && <Badge tone="neutral">{t("geliver.offer.pickup")}</Badge>}
            </div>
          </Td>
          <Td>{o.eta ?? "—"}</Td>
          <Td>{o.rating != null ? <span className="inline-flex items-center gap-1 tabular-nums"><Star size={12} className="text-warn" />{o.rating}</span> : "—"}</Td>
          <Td className="tabular-nums"><div className="font-medium">{moneyStr(o.total, o.currency)}</div>{o.amount && o.amount !== o.total && <div className="text-xs text-muted">{t("geliver.offer.exVat", { amount: o.amount })}</div>}</Td>
          {onPick && <Td className="text-right"><Button size="sm" loading={busy} onClick={() => onPick(o)}>{pickLabel}</Button></Td>}
        </tr>
      ))}
    </Table>
  );
}

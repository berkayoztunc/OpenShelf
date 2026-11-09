import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Printer } from "lucide-react";
import { Badge, Button, Card, EmptyState, Table, Td, statusTone } from "../../../../components/ui";
import { TableSkeleton, TyErrorBox } from "../../../../components/trendyol/views/shared";
import { api, qs } from "../../../../lib/api";
import { dateTime, enumLabel, money } from "../../../../lib/format";
import { mapPaged, orderRowFromApi } from "../../../../lib/adapt";
import type { Paged } from "../../../../lib/types";
import { openPrint } from "../../../../lib/print";
import { useT } from "../../../../i18n";

/** Trendyol orders already mirrored into OpenShelf: open the local order or print the shipping slip from Trendyol's cargo data. */
export function MirroredOrders() {
  const { t } = useT();
  const q = useQuery({ queryKey: ["orders", "trendyol-mirror"], queryFn: async () => mapPaged(await api.get<Paged<unknown>>(`/api/admin/orders${qs({ source: "trendyol", page: 1, pageSize: 10 })}`), orderRowFromApi) });
  return (
    <Card title={t("trendyolviews.mirror.title")}>
      <p className="mb-3 text-sm text-muted">{t("trendyolviews.mirror.body")}</p>
      {q.isPending ? <TableSkeleton rows={3} /> : q.error ? <TyErrorBox error={q.error} retry={() => void q.refetch()} />
        : q.data.items.length === 0 ? <EmptyState title={t("trendyolviews.mirror.empty.title")} description={t("trendyolviews.mirror.empty.body")} />
        : <Table caption={t("trendyolviews.mirror.title")} head={[t("trendyolviews.mirror.col.order"), t("trendyolviews.mirror.col.date"), t("trendyolviews.mirror.col.status"), t("trendyolviews.mirror.col.total"), <span key="a" className="sr-only">{t("trendyolviews.common.actions")}</span>]}>
          {q.data.items.map((o) => (
            <tr key={o.id} data-testid="tdy-mirror-row">
              <Td><Link className="font-mono text-[13px] text-brand-ink underline" to={`/orders/${o.id}`}>{o.number}</Link></Td>
              <Td className="whitespace-nowrap text-muted">{dateTime(o.createdAt)}</Td>
              <Td><Badge tone={statusTone(o.status)}>{enumLabel("status", o.status)}</Badge></Td>
              <Td className="tabular-nums">{money(o.total, o.currency)}</Td>
              <Td className="text-right"><Button size="sm" variant="secondary" onClick={() => openPrint("label", [o.id])}><Printer size={13} />{t("trendyolviews.mirror.slip")}</Button></Td>
            </tr>
          ))}
        </Table>}
    </Card>
  );
}

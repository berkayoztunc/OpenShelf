import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { dateTime, enumLabel } from "../lib/format";
import { useT } from "../i18n";
import { Badge, Card, EmptyState, Loading, Table, Td, type Tone } from "./ui";
import { HelpTip } from "./help/HelpTip";

interface Row { id: number; event: string; channel: string; to: string | null; provider: string | null; status: string; error: string | null; at: string }
const tone = (s: string): Tone => (s === "sent" ? "success" : s === "failed" ? "danger" : s === "pending" ? "warning" : "neutral");

/** Notification (SMS / e-mail) history for one order. Recipients are masked server-side. */
export function NotificationHistory({ orderId }: { orderId: string }) {
  const { t } = useT();
  const q = useQuery({ queryKey: ["order-notifications", orderId], queryFn: () => api.get<{ items: Row[] }>(`/api/admin/orders/${orderId}/notifications`) });
  return (
    <Card title={<span className="inline-flex items-center gap-1">{t("orders.notif.title")}<HelpTip id="orders.notifications" guide="orders#siparis-bildirimleri" /></span>}>
      {q.isPending ? <Loading /> : q.isError || !q.data?.items.length ? <EmptyState title={t("orders.notif.empty")} description={t("orders.notif.emptyBody")} /> : (
        <>
          <Table head={[t("orders.notif.col.event"), t("orders.notif.col.channel"), t("orders.notif.col.to"), t("orders.notif.col.status"), t("orders.notif.col.when")]}>
            {q.data.items.map((n) => (
              <tr key={n.id}>
                <Td>{enumLabel("notificationEvent", n.event)}</Td><Td>{enumLabel("channel", n.channel)}{n.provider ? ` (${enumLabel("provider", n.provider)})` : ""}</Td><Td>{n.to ?? "-"}</Td>
                <Td><Badge tone={tone(n.status)}>{n.status === "pending" ? t("orders.notif.pending") : enumLabel("notification", n.status)}</Badge>{n.error ? <span className="ml-2 text-xs text-muted">{n.error}</span> : null}</Td>
                <Td>{dateTime(n.at)}</Td>
              </tr>
            ))}
          </Table>
          <p className="mt-3 text-xs text-muted">{t("orders.notif.hint")}</p>
        </>
      )}
    </Card>
  );
}

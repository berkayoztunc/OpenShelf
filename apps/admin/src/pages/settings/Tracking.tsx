import { useQuery } from "@tanstack/react-query";
import { useGroupForm } from "../../lib/settings";
import { api } from "../../lib/api";
import { dateTime } from "../../lib/format";
import type { MarketingEvent, Paged } from "../../lib/types";
import { marketingEventFromApi, mapPaged } from "../../lib/adapt";
import { Badge, Card, EmptyState, ErrorState, Loading, statusTone, Table, Td, TextField, Toggle } from "../../components/ui";
import { Term } from "../../components/help/Term";
import { TermStrip } from "./TermStrip";
import { hasKey, useT } from "../../i18n";
import { enumLabel, statusLabel } from "../../lib/format";
import { SettingsForm } from "./SaveBar";
import { Link } from "react-router-dom";

export function MarketingEventsTable() {
  const { t } = useT();
  const q = useQuery({ queryKey: ["marketing-events", 1], queryFn: async () => mapPaged(await api.get<Paged<unknown>>("/api/admin/marketing-events?page=1"), marketingEventFromApi) as Paged<MarketingEvent>, refetchInterval: 30_000 });
  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const items = Array.isArray(q.data) ? q.data : q.data.items;
  if (!items.length) return <EmptyState title={t("settings.tracking.events.empty")} description={t("settings.tracking.events.emptyBody")} />;
  return <Table head={[t("settings.tracking.events.time"), t("settings.tracking.events.event"), <Term key="eid" id="eventid">{t("settings.tracking.events.eventId")}</Term>, t("settings.tracking.events.destination"), t("settings.tracking.events.status")]} caption={t("settings.tracking.events.caption")}>{items.map((e) => (
    <tr key={e.id}><Td>{dateTime(e.createdAt)}</Td><Td>{e.eventName}</Td><Td className="font-mono text-xs">{e.eventId}</Td><Td>{e.destination ? enumLabel("provider", e.destination) : "-"}</Td><Td>{e.status ? <Badge tone={statusTone(e.status)}>{statusLabel(e.status, hasKey(`enum.outbox.${e.status}`) ? "outbox" : "email")}</Badge> : "-"}</Td></tr>
  ))}</Table>;
}

export default function Tracking() {
  const { t } = useT();
  const { query, draft, patch, errors, save, dirty } = useGroupForm("tracking");
  return (
    <div className="space-y-6">
      <SettingsForm query={query} ready={!!draft} onSave={() => save.mutate()} saving={save.isPending} dirty={dirty}>
        {draft && <>
          <Card title={t("settings.tracking.card.ids")}>
            <TermStrip ids={["ga4", "measurementid", "gtm", "pixel"]} />
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField label={t("settings.tracking.ga4.label")} hint={t("settings.tracking.ga4.hint")} help="settings.ga4" placeholder="G-XXXXXXXXXX" value={draft.ga4MeasurementId} error={errors.ga4MeasurementId && t("settings.tracking.ga4.error")} onChange={(e) => patch({ ga4MeasurementId: e.target.value.trim() })} />
              <TextField label={t("settings.tracking.gtm.label")} hint={t("settings.tracking.gtm.hint")} help="settings.gtm" guide="analytics#google-analytics-4-kurulumu" placeholder="GTM-XXXXXXX" value={draft.gtmContainerId} error={errors.gtmContainerId && t("settings.tracking.gtm.error")} onChange={(e) => patch({ gtmContainerId: e.target.value.trim() })} />
              <TextField label={t("settings.tracking.pixel.label")} hint={t("settings.tracking.pixel.hint")} help="settings.pixel" inputMode="numeric" value={draft.metaPixelId} error={errors.metaPixelId && t("settings.tracking.pixel.error")} onChange={(e) => patch({ metaPixelId: e.target.value.trim() })} />
            </div>
          </Card>
          <Card title={t("settings.tracking.card.consent")}>
            <TermStrip ids={["consent", "testeventcode", "eventid"]} />
            <div className="space-y-4">
              <Toggle label={t("settings.tracking.consent.label")} hint={t("settings.tracking.consent.hint")} help="settings.consent" checked={draft.consentRequired} onChange={(v) => patch({ consentRequired: v })} />
              <p className="text-xs text-muted">{t("settings.tracking.testCode.moved")}</p>
            </div>
          </Card>
        </>}
      </SettingsForm>
      <Card title={t("settings.tracking.card.server")}>
        <p className="text-sm text-muted">{t("settings.tracking.server.body")}</p>
        <TermStrip ids={["apisecret", "accesstoken", "capi"]} />
        <div className="mt-4 flex flex-wrap gap-2">
          <Link to="/integrations?configure=ga4" className="inline-flex h-9 items-center rounded-lg border border-line bg-surface px-4 text-sm font-medium transition hover:border-line-strong hover:bg-hover dark:bg-raised">{t("settings.tracking.server.ga4")}</Link>
          <Link to="/integrations?configure=meta" className="inline-flex h-9 items-center rounded-lg border border-line bg-surface px-4 text-sm font-medium transition hover:border-line-strong hover:bg-hover dark:bg-raised">{t("settings.tracking.server.meta")}</Link>
        </div>
      </Card>
      <Card title={t("settings.tracking.card.events")}><MarketingEventsTable /></Card>
    </div>
  );
}

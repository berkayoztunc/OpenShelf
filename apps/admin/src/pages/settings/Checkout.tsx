import { useGroupForm } from "../../lib/settings";
import { toMajor, toMinor } from "../../lib/format";
import { TermStrip } from "./TermStrip";
import { Card, TextField, Toggle } from "../../components/ui";
import { useT } from "../../i18n";
import { SettingsForm } from "./SaveBar";

export default function Checkout() {
  const { t } = useT();
  const { query, draft, patch, errors, save, dirty } = useGroupForm("checkout");
  return (
    <SettingsForm query={query} ready={!!draft} onSave={() => save.mutate()} saving={save.isPending} dirty={dirty}>
      {draft && <Card title={t("settings.checkout.card.title")}>
        <TermStrip ids={["reservation", "safetystock", "freeshipping", "variant"]} />
        <div className="space-y-4">
          <Toggle label={t("settings.checkout.guest.label")} hint={t("settings.checkout.guest.hint")} help="settings.guest" checked={draft.guestCheckout} onChange={(v) => patch({ guestCheckout: v })} />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label={t("settings.checkout.reservation.label")} hint={t("settings.checkout.reservation.hint")} help="settings.reservation" type="number" min={5} max={120} value={draft.reservationMinutes} error={errors.reservationMinutes} onChange={(e) => patch({ reservationMinutes: Number(e.target.value) })} />
            <TextField label={t("settings.checkout.safetyStock.label")} type="number" min={0} value={draft.safetyStock} error={errors.safetyStock} hint={t("settings.checkout.safetyStock.hint")} help="settings.safetyStock" onChange={(e) => patch({ safetyStock: Number(e.target.value) })} />
            <TextField label={t("settings.checkout.flatFee.label")} hint={t("settings.checkout.flatFee.hint")} help="settings.flatFee" inputMode="decimal" value={toMajor(draft.flatShippingFee)} onChange={(e) => patch({ flatShippingFee: toMinor(e.target.value) })} />
            <TextField label={t("settings.checkout.freeShipping.label")} inputMode="decimal" hint={t("settings.checkout.freeShipping.hint")} help="settings.freeShipping" guide="store-settings#odeme-ve-siparis" value={draft.freeShippingThreshold === null ? "" : toMajor(draft.freeShippingThreshold)}
              onChange={(e) => patch({ freeShippingThreshold: e.target.value.trim() === "" ? null : toMinor(e.target.value) })} />
          </div>
        </div>
      </Card>}
    </SettingsForm>
  );
}

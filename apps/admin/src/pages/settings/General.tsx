import { useGroupForm } from "../../lib/settings";
import { Card, SelectField, TextArea, TextField, Toggle } from "../../components/ui";
import { useT } from "../../i18n";
import { SettingsForm } from "./SaveBar";
import { TermStrip } from "./TermStrip";

const CURRENCIES = ["TRY", "USD", "EUR", "GBP"];
const blankToUndef = (s?: string) => (s && s.trim() !== "" ? s : undefined);
const GUIDE = "store-settings#genel";

export default function General() {
  const { t } = useT();
  const { query, draft, patch, errors, save, dirty } = useGroupForm("general", (d) => ({
    ...d, contactEmail: blankToUndef(d.contactEmail), contactPhone: blankToUndef(d.contactPhone), address: blankToUndef(d.address), taxId: blankToUndef(d.taxId),
  }));
  return (
    <SettingsForm query={query} ready={!!draft} onSave={() => save.mutate()} saving={save.isPending} dirty={dirty}>
      {draft && <>
        <Card title={t("settings.general.card.store")}>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label={t("settings.general.storeName.label")} hint={t("settings.general.storeName.hint")} help="settings.storeName" guide={GUIDE} required value={draft.storeName} error={errors.storeName} onChange={(e) => patch({ storeName: e.target.value })} />
            <TextField label={t("settings.general.tagline.label")} hint={t("settings.general.tagline.hint")} help="settings.tagline" guide={GUIDE} value={draft.tagline} error={errors.tagline} onChange={(e) => patch({ tagline: e.target.value })} />
            <div className="sm:col-span-2"><TextArea label={t("settings.general.description.label")} hint={t("settings.general.description.hint")} help="settings.description" guide={GUIDE} value={draft.description} error={errors.description} onChange={(e) => patch({ description: e.target.value })} /></div>
          </div>
        </Card>
        <Card title={t("settings.general.card.contact")}>
          <TermStrip ids={["vkn", "tckn", "taxoffice"]} />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label={t("settings.general.contactEmail.label")} hint={t("settings.general.contactEmail.hint")} help="settings.contactEmail" guide={GUIDE} type="email" value={draft.contactEmail ?? ""} error={errors.contactEmail} onChange={(e) => patch({ contactEmail: e.target.value })} />
            <TextField label={t("settings.general.contactPhone.label")} hint={t("settings.general.contactPhone.hint")} help="settings.contactPhone" guide={GUIDE} type="tel" value={draft.contactPhone ?? ""} error={errors.contactPhone} onChange={(e) => patch({ contactPhone: e.target.value })} />
            <div className="sm:col-span-2"><TextArea label={t("settings.general.address.label")} hint={t("settings.general.address.hint")} help="settings.address" guide={GUIDE} value={draft.address ?? ""} error={errors.address} onChange={(e) => patch({ address: e.target.value })} /></div>
            <TextField label={t("settings.general.taxId.label")} hint={t("settings.general.taxId.hint")} help="settings.taxId" value={draft.taxId ?? ""} error={errors.taxId} onChange={(e) => patch({ taxId: e.target.value })} />
          </div>
        </Card>
        <Card title={t("settings.general.card.pricing")}>
          <TermStrip ids={["kdv"]} />
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField label={t("settings.general.currency.label")} hint={t("settings.general.currency.hint")} help="settings.currency" guide={GUIDE} value={draft.currency} onChange={(e) => patch({ currency: e.target.value })}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</SelectField>
            <TextField label={t("settings.general.taxRate.label")} hint={t("settings.general.taxRate.hint")} help="settings.taxRate" type="number" min={0} max={100} value={draft.defaultTaxRate} onChange={(e) => patch({ defaultTaxRate: Number(e.target.value) })} />
            <SelectField label={t("settings.general.locale.label")} hint={t("settings.general.locale.hint")} help="settings.locale" guide={GUIDE} value={draft.defaultLocale} onChange={(e) => patch({ defaultLocale: e.target.value as "tr" | "en" })}><option value="tr">{t("settings.general.locale.tr")}</option><option value="en">{t("settings.general.locale.en")}</option></SelectField>
            <TextField label={t("settings.general.timezone.label")} hint={t("settings.general.timezone.hint")} help="settings.timezone" guide={GUIDE} value={draft.timezone} onChange={(e) => patch({ timezone: e.target.value })} />
            <div className="sm:col-span-2"><Toggle label={t("settings.general.pricesIncludeTax.label")} hint={t("settings.general.pricesIncludeTax.hint")} help="settings.pricesIncludeTax" guide={GUIDE} checked={draft.pricesIncludeTax} onChange={(v) => patch({ pricesIncludeTax: v })} /></div>
          </div>
        </Card>
      </>}
    </SettingsForm>
  );
}

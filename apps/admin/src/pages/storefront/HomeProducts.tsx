import { SelectField, Card, TextField } from "../../components/ui";
import { useGroupForm } from "../../lib/settings";
import { ProductPicker, type PickerKeys } from "../../components/ProductPicker";
import { useT } from "../../i18n";
import { SettingsForm } from "../settings/SaveBar";

const KEYS: PickerKeys = {
  empty: "storefront.home.empty", missing: "settings.merch.pinned.missing", top: "storefront.home.top", up: "storefront.home.up", down: "storefront.home.down", remove: "storefront.home.remove",
  full: "storefront.home.full", searchLabel: "storefront.home.search.label", searchPlaceholder: "settings.merch.search.placeholder", searchHint: "settings.merch.search.hint", results: "settings.merch.search.results", none: "settings.merch.search.none",
  add: "storefront.home.add", addButton: "storefront.home.addButton",
};
const LIMITS = [4, 8, 12, 16, 24] as const;

export default function HomeProducts() {
  const { t } = useT();
  const { query, draft, patch, save, dirty } = useGroupForm("homepage");
  return (
    <SettingsForm query={query} ready={!!draft} onSave={() => save.mutate()} saving={save.isPending} dirty={dirty}>
      {draft && <>
        <Card title={t("storefront.home.mode.title")}>
          <div className="space-y-4">
            <SelectField label={t("storefront.home.mode.label")} value={draft.mode} hint={t(`storefront.home.mode.${draft.mode}.hint`)} onChange={(e) => patch({ mode: e.target.value as "auto" | "manual" })}>
              <option value="auto">{t("storefront.home.mode.auto")}</option><option value="manual">{t("storefront.home.mode.manual")}</option>
            </SelectField>
            {draft.mode === "auto" && <SelectField label={t("storefront.home.limit.label")} value={String(draft.limit)} hint={t("storefront.home.limit.hint")} onChange={(e) => patch({ limit: Number(e.target.value) })}>
              {LIMITS.map((n) => <option key={n} value={n}>{n}</option>)}
            </SelectField>}
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField label={t("storefront.home.title.label")} maxLength={60} placeholder={t("storefront.home.title.placeholder")} hint={t("storefront.home.title.hint")} value={draft.title} onChange={(e) => patch({ title: e.target.value })} />
              <TextField label={t("storefront.home.titleEn.label")} maxLength={60} value={draft.titleEn} onChange={(e) => patch({ titleEn: e.target.value })} />
            </div>
          </div>
        </Card>
        {draft.mode === "manual" && <Card title={t("storefront.home.picked.title")} description={t("storefront.home.picked.description")}>
          <ProductPicker ids={draft.productIds} onChange={(productIds) => patch({ productIds })} max={24} keys={KEYS} />
        </Card>}
      </>}
    </SettingsForm>
  );
}

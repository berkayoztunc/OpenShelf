import { SORT_KEYS } from "@openshelf/shared";
import { useGroupForm } from "../../lib/settings";
import { Card, SelectField, TextField, Toggle } from "../../components/ui";
import { ProductPicker, type PickerKeys } from "../../components/ProductPicker";
import { useT } from "../../i18n";
import { SettingsForm } from "../settings/SaveBar";

const PIN_KEYS: PickerKeys = {
  empty: "settings.merch.pinned.empty", missing: "settings.merch.pinned.missing", top: "settings.merch.pinned.top", up: "settings.merch.pinned.up", down: "settings.merch.pinned.down", remove: "settings.merch.pinned.remove",
  full: "settings.merch.pinned.full", searchLabel: "settings.merch.search.label", searchPlaceholder: "settings.merch.search.placeholder", searchHint: "settings.merch.search.hint", results: "settings.merch.search.results", none: "settings.merch.search.none",
  add: "settings.merch.pin", addButton: "settings.merch.pinButton",
};

export default function Merchandising() {
  const { t } = useT();
  const { query, draft, patch, errors, save, dirty } = useGroupForm("merchandising");
  return (
    <SettingsForm query={query} ready={!!draft} onSave={() => save.mutate()} saving={save.isPending} dirty={dirty}>
      {draft && <>
        <Card title={t("settings.merch.sort.title")}>
          <div className="space-y-4">
            <SelectField label={t("settings.merch.defaultSort.label")} value={draft.defaultSort} hint={t(`settings.merch.sort.${draft.defaultSort}.hint`)} onChange={(e) => patch({ defaultSort: e.target.value as typeof draft.defaultSort })}>
              {SORT_KEYS.map((s) => <option key={s} value={s}>{t(`settings.merch.sort.${s}`)}</option>)}
            </SelectField>
            {draft.defaultSort === "bestselling" && <TextField label={t("settings.merch.days.label")} type="number" min={7} max={365} hint={t("settings.merch.days.hint")} value={draft.bestsellerDays} error={errors.bestsellerDays} onChange={(e) => patch({ bestsellerDays: Number(e.target.value) })} />}
            <Toggle label={t("settings.merch.inStockFirst.label")} hint={t("settings.merch.inStockFirst.hint")} checked={draft.inStockFirst} onChange={(v) => patch({ inStockFirst: v })} />
          </div>
        </Card>
        <Card title={t("settings.merch.pinned.title")} description={t("settings.merch.pinned.description")}>
          {draft.defaultSort !== "featured" && <p role="note" className="mb-4 rounded-lg border border-warn-line bg-warn-soft px-3 py-2 text-sm text-warn">{t("settings.merch.pinned.notActive")}</p>}
          <ProductPicker ids={draft.pinned} onChange={(pinned) => patch({ pinned })} max={60} keys={PIN_KEYS} />
        </Card>
      </>}
    </SettingsForm>
  );
}

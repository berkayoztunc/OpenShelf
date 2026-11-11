import { Link } from "react-router-dom";
import { Check } from "lucide-react";
import { SelectField, Card, TextField } from "../../components/ui";
import { useCategories } from "../Categories";
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
  const cats = useCategories();
  const noPhoto = (cats.data ?? []).filter((c) => !c.imageMediaId).length;
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
        <Card title={t("storefront.home.cards.title")} description={t("storefront.home.cards.description")}>
          <div role="radiogroup" aria-label={t("storefront.home.cards.group")} className="grid gap-3 sm:grid-cols-2">
            {(["plain", "image"] as const).map((v) => {
              const on = draft.categoryCards === v;
              return (
                <button key={v} type="button" role="radio" aria-checked={on} onClick={() => patch({ categoryCards: v })}
                  className={`flex flex-col gap-3 rounded-xl border p-4 text-left transition ${on ? "border-brand-600 bg-brand-50 ring-2 ring-brand-600/20" : "border-line hover:border-line-strong"}`}>
                  <span aria-hidden className="flex gap-2">
                    {[0, 1, 2].map((i) => v === "plain"
                      ? <span key={i} className="flex h-16 flex-1 flex-col justify-between rounded-lg border border-line bg-surface p-2"><span className="h-1.5 w-8 rounded bg-ink/70" /><span className="h-1 w-5 rounded bg-line-strong" /></span>
                      : <span key={i} className="relative h-16 flex-1 overflow-hidden rounded-lg bg-gradient-to-br from-stone-400 to-stone-700"><span className="absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-black/70 to-transparent" /><span className="absolute bottom-1.5 left-2 h-1.5 w-8 rounded bg-white/90" /></span>)}
                  </span>
                  <span className="flex items-center justify-between gap-2"><span className="text-sm font-semibold">{t(v === "plain" ? "storefront.home.cards.plain" : "storefront.home.cards.image")}</span>{on && <Check size={16} className="text-brand-ink" aria-hidden />}</span>
                  <span className="text-xs text-muted">{t(v === "plain" ? "storefront.home.cards.plain.hint" : "storefront.home.cards.image.hint")}</span>
                </button>
              );
            })}
          </div>
          {draft.categoryCards === "image" && noPhoto > 0 && (
            <p role="note" className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-warn-line bg-warn-soft px-3 py-2 text-sm text-warn">{t("storefront.home.cards.missing", { n: noPhoto })}<Link to="/categories" className="font-medium underline">{t("storefront.home.cards.fix")}</Link></p>
          )}
        </Card>
        {draft.mode === "manual" && <Card title={t("storefront.home.picked.title")} description={t("storefront.home.picked.description")}>
          <ProductPicker ids={draft.productIds} onChange={(productIds) => patch({ productIds })} max={24} keys={KEYS} />
        </Card>}
      </>}
    </SettingsForm>
  );
}

import { useState } from "react";
import { announcementActive, type SettingsOf } from "@openshelf/shared";
import { Button, Card, SelectField, TextField, Toggle } from "../../components/ui";
import { useGroupForm } from "../../lib/settings";
import { useT } from "../../i18n";
import { SettingsForm } from "../settings/SaveBar";

type A = SettingsOf<"announcement">;

/** ISO -> value for <input type="datetime-local"> in the browser's time zone. */
const toLocal = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso); if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const fromLocal = (v: string) => (v ? new Date(v).toISOString() : null);
const endOfYear = () => new Date(new Date().getFullYear(), 11, 31, 23, 59, 0).toISOString();

const TONE: Record<A["tone"], string> = { brand: "bg-brand-600 text-white", dark: "bg-stone-900 text-stone-100", soft: "bg-brand-50 text-brand-700" };
const SPEED: Record<A["speed"], number> = { slow: 0.13, normal: 0.09, fast: 0.06 };

function Preview({ a }: { a: A }) {
  const { t } = useT();
  const text = a.text.trim() || t("storefront.ann.text.placeholder");
  const sep = "   •   ";
  const dur = Math.max(8, 4 * (text.length + sep.length) * SPEED[a.speed]);
  return (
    <div className="overflow-hidden rounded-lg border border-line">
      <div className={`py-2 text-[13px] font-medium ${TONE[a.tone]}`}>
        {a.style === "marquee" ? (
          <div className="os-marquee overflow-hidden whitespace-nowrap" aria-hidden>
            <div className="os-marquee-track" style={{ ["--os-marquee-dur" as string]: `${dur}s` }}>
              {[0, 1].map((h) => <span key={h} className="flex shrink-0">{[0, 1, 2, 3].map((i) => <span key={i} className="shrink-0 whitespace-pre">{text}{sep}</span>)}</span>)}
            </div>
          </div>
        ) : <p className="px-4 text-center">{text}</p>}
      </div>
      <div className="flex h-10 items-center gap-3 bg-surface px-4" aria-hidden><span className="h-2 w-16 rounded bg-line-strong" /><span className="ml-auto h-2 w-24 rounded bg-line" /></div>
    </div>
  );
}

/** Vitrin > Duyuru barı: the strip above the storefront header (e.g. a coupon code until year end). */
export default function Announcement() {
  const { t } = useT();
  const { query, draft, patch, errors, save, dirty } = useGroupForm("announcement");
  const [rangeErr, setRangeErr] = useState(false);
  const onSave = () => {
    const bad = !!draft?.startsAt && !!draft.endsAt && Date.parse(draft.startsAt) >= Date.parse(draft.endsAt);
    setRangeErr(bad);
    if (!bad) save.mutate();
  };
  const status = !draft || !draft.enabled ? "off"
    : !draft.text.trim() ? "empty"
    : draft.startsAt && Date.now() < Date.parse(draft.startsAt) ? "scheduled"
    : draft.endsAt && Date.now() >= Date.parse(draft.endsAt) ? "ended"
    : announcementActive(draft) ? "live" : "off";
  return (
    <SettingsForm query={query} ready={!!draft} onSave={onSave} saving={save.isPending} dirty={dirty}>
      {draft && <>
        <Card title={t("storefront.ann.card.title")} description={t("storefront.ann.card.description")}>
          <div className="space-y-4">
            <Toggle label={t("storefront.ann.enabled.label")} hint={t(`storefront.ann.status.${status}`)} checked={draft.enabled} onChange={(enabled) => patch({ enabled })} />
            <TextField label={t("storefront.ann.text.label")} maxLength={200} placeholder={t("storefront.ann.text.placeholder")} hint={t("storefront.ann.text.hint", { n: 200 - draft.text.length })} error={errors.text} value={draft.text} onChange={(e) => patch({ text: e.target.value })} />
            <TextField label={t("storefront.ann.textEn.label")} maxLength={200} hint={t("storefront.ann.textEn.hint")} error={errors.textEn} value={draft.textEn} onChange={(e) => patch({ textEn: e.target.value })} />
            <TextField label={t("storefront.ann.link.label")} maxLength={300} placeholder="/products" hint={t("storefront.ann.link.hint")} error={errors.link} value={draft.link} onChange={(e) => patch({ link: e.target.value })} />
          </div>
        </Card>
        <Card title={t("storefront.ann.look.title")}>
          <div className="grid gap-4 sm:grid-cols-3">
            <SelectField label={t("storefront.ann.style.label")} value={draft.style} onChange={(e) => patch({ style: e.target.value as A["style"] })}>
              <option value="marquee">{t("storefront.ann.style.marquee")}</option><option value="static">{t("storefront.ann.style.static")}</option>
            </SelectField>
            <SelectField label={t("storefront.ann.speed.label")} value={draft.speed} disabled={draft.style !== "marquee"} onChange={(e) => patch({ speed: e.target.value as A["speed"] })}>
              <option value="slow">{t("storefront.ann.speed.slow")}</option><option value="normal">{t("storefront.ann.speed.normal")}</option><option value="fast">{t("storefront.ann.speed.fast")}</option>
            </SelectField>
            <SelectField label={t("storefront.ann.tone.label")} value={draft.tone} onChange={(e) => patch({ tone: e.target.value as A["tone"] })}>
              <option value="brand">{t("storefront.ann.tone.brand")}</option><option value="dark">{t("storefront.ann.tone.dark")}</option><option value="soft">{t("storefront.ann.tone.soft")}</option>
            </SelectField>
          </div>
          <p className="mb-2 mt-5 text-xs font-medium text-muted">{t("storefront.ann.preview")}</p>
          <Preview a={draft} />
          <p className="mt-2 text-xs text-muted">{t("storefront.ann.preview.hint")}</p>
        </Card>
        <Card title={t("storefront.ann.when.title")} description={t("storefront.ann.when.description")}>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label={t("storefront.ann.startsAt.label")} type="datetime-local" hint={t("storefront.ann.startsAt.hint")} value={toLocal(draft.startsAt)} onChange={(e) => patch({ startsAt: fromLocal(e.target.value) })} />
            <TextField label={t("storefront.ann.endsAt.label")} type="datetime-local" hint={t("storefront.ann.endsAt.hint")} error={rangeErr ? t("storefront.ann.range.error") : errors.endsAt} value={toLocal(draft.endsAt)} onChange={(e) => { setRangeErr(false); patch({ endsAt: fromLocal(e.target.value) }); }} />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="ghost" type="button" onClick={() => { setRangeErr(false); patch({ endsAt: endOfYear() }); }}>{t("storefront.ann.endOfYear")}</Button>
            {(draft.startsAt || draft.endsAt) && <Button size="sm" variant="ghost" type="button" onClick={() => { setRangeErr(false); patch({ startsAt: null, endsAt: null }); }}>{t("storefront.ann.clearDates")}</Button>}
          </div>
        </Card>
      </>}
    </SettingsForm>
  );
}

import { useGroupForm } from "../../lib/settings";
import { mediaUrl } from "../../lib/media";
import { Button, Card, Field, TextField } from "../../components/ui";
import { HelpTip } from "../../components/help/HelpTip";
import { useT } from "../../i18n";
import { DropZone, MediaSlot } from "../../components/MediaPicker";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { SettingsForm } from "./SaveBar";

const HEX = /^#[0-9a-fA-F]{6}$/;

/** Puts a "?" help tip in the top-right corner of a block whose own label we do not control (MediaSlot). */
function TipBox({ help, children }: { help: string; children: React.ReactNode }) {
  return <div className="relative">{children}<div className="absolute right-0 -top-1"><HelpTip id={help} guide="store-settings#marka" /></div></div>;
}

export function ColorField({ label, value, onChange, error, hint, help }: { label: string; value: string; onChange: (v: string) => void; error?: string; hint?: string; help?: string }) {
  const { t } = useT();
  return (
    <Field label={label} hint={hint} help={help} guide="store-settings#marka">
      <div className="flex items-center gap-2">
        <input type="color" aria-label={t("settings.color.picker", { label })} value={HEX.test(value) ? value : "#000000"} onChange={(e) => onChange(e.target.value.toUpperCase())} className="size-10 cursor-pointer rounded-lg border border-line bg-surface p-1" />
        <input aria-label={t("settings.color.hex", { label })} value={value} onChange={(e) => onChange(e.target.value)} maxLength={7} className="w-32 rounded-lg border border-line bg-surface px-3 py-2 font-mono text-sm uppercase transition focus:border-brand-600 focus:ring-4 focus:ring-brand-600/10" />
      </div>
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
    </Field>
  );
}

export default function Branding() {
  const { t } = useT();
  const { query, draft, patch, errors, save, dirty } = useGroupForm("branding", (d) => ({
    ...d, social: Object.fromEntries(Object.entries(d.social).filter(([, v]) => v && v.trim() !== "")),
  }));

  const move = (i: number, dir: -1 | 1) => {
    if (!draft) return; const a = [...draft.bannerMediaIds]; const j = i + dir; if (j < 0 || j >= a.length) return;
    [a[i], a[j]] = [a[j]!, a[i]!]; patch({ bannerMediaIds: a });
  };

  return (
    <SettingsForm query={query} ready={!!draft} onSave={() => save.mutate()} saving={save.isPending} dirty={dirty}>
      {draft && <>
        <Card title={t("settings.branding.card.logo")}>
          <div className="grid gap-6 sm:grid-cols-3">
            <TipBox help="settings.logo"><MediaSlot label={t("settings.branding.logo.label")} kind="logo" value={draft.logoMediaId} onChange={(id) => patch({ logoMediaId: id })} hint={t("settings.branding.logo.hint")} /></TipBox>
            <TipBox help="settings.logoDark"><MediaSlot label={t("settings.branding.logoDark.label")} kind="logo_dark" value={draft.logoDarkMediaId} onChange={(id) => patch({ logoDarkMediaId: id })} hint={t("settings.branding.logoDark.hint")} /></TipBox>
            <TipBox help="settings.favicon"><MediaSlot label={t("settings.branding.favicon.label")} kind="favicon" value={draft.faviconMediaId} onChange={(id) => patch({ faviconMediaId: id })} hint={t("settings.branding.favicon.hint")} /></TipBox>
          </div>
        </Card>

        <Card title={<span className="inline-flex items-center gap-1">{t("settings.branding.card.banners")}<HelpTip id="settings.banners" guide="store-settings#marka" /></span>} actions={<span className="text-sm text-muted">{draft.bannerMediaIds.length} / 6</span>}>
          <ul className="mb-4 space-y-2">
            {draft.bannerMediaIds.map((id, i) => (
              <li key={id} className="flex items-center gap-3 rounded-xl border border-line bg-canvas p-2">
                <img src={mediaUrl(id)} alt={t("settings.branding.banner.alt", { n: i + 1 })} className="h-14 w-28 rounded-lg border border-line object-cover" />
                <span className="flex-1 text-sm font-medium">{t("settings.branding.banner.slide", { n: i + 1 })}</span>
                <Button size="sm" variant="ghost" aria-label={t("settings.branding.banner.up", { n: i + 1 })} disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp size={15} /></Button>
                <Button size="sm" variant="ghost" aria-label={t("settings.branding.banner.down", { n: i + 1 })} disabled={i === draft.bannerMediaIds.length - 1} onClick={() => move(i, 1)}><ArrowDown size={15} /></Button>
                <Button size="sm" variant="ghost" aria-label={t("settings.branding.banner.remove", { n: i + 1 })} onClick={() => patch({ bannerMediaIds: draft.bannerMediaIds.filter((x) => x !== id) })}><Trash2 size={15} /></Button>
              </li>
            ))}
          </ul>
          {draft.bannerMediaIds.length < 6 && <BannerAdd onAdd={(id) => patch({ bannerMediaIds: [...draft.bannerMediaIds, id] })} />}
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <TextField label={t("settings.branding.bannerTitle.label")} hint={t("settings.branding.bannerTitle.hint")} help="settings.bannerTitle" guide="store-settings#marka" value={draft.bannerTitle} error={errors.bannerTitle} onChange={(e) => patch({ bannerTitle: e.target.value })} />
            <TextField label={t("settings.branding.bannerSubtitle.label")} hint={t("settings.branding.bannerSubtitle.hint")} value={draft.bannerSubtitle} error={errors.bannerSubtitle} onChange={(e) => patch({ bannerSubtitle: e.target.value })} />
            <TextField label={t("settings.branding.bannerCtaLabel.label")} hint={t("settings.branding.bannerCtaLabel.hint")} help="settings.bannerCta" guide="store-settings#marka" value={draft.bannerCtaLabel} onChange={(e) => patch({ bannerCtaLabel: e.target.value })} />
            <TextField label={t("settings.branding.bannerCtaUrl.label")} hint={t("settings.branding.bannerCtaUrl.hint")} value={draft.bannerCtaUrl} placeholder={t("settings.branding.bannerCtaUrl.placeholder")} onChange={(e) => patch({ bannerCtaUrl: e.target.value })} />
          </div>
        </Card>

        <Card title={t("settings.branding.card.colors")}>
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-4">
              <ColorField label={t("settings.branding.primary.label")} hint={t("settings.branding.primary.hint")} help="settings.primaryColor" value={draft.primaryColor} error={errors.primaryColor ? t("settings.color.invalid", { example: "#3B3F8F" }) : undefined} onChange={(v) => patch({ primaryColor: v })} />
              <ColorField label={t("settings.branding.accent.label")} hint={t("settings.branding.accent.hint")} help="settings.accentColor" value={draft.accentColor} error={errors.accentColor ? t("settings.color.invalid", { example: "#E8A33D" }) : undefined} onChange={(v) => patch({ accentColor: v })} />
            </div>
            <div aria-label={t("settings.branding.preview.label")} data-testid="brand-preview" className="overflow-hidden rounded-xl border border-line bg-canvas shadow-soft"
              style={{ "--os-primary": HEX.test(draft.primaryColor) ? draft.primaryColor : undefined, "--os-accent": HEX.test(draft.accentColor) ? draft.accentColor : undefined } as React.CSSProperties}>
              <div className="flex items-center gap-1.5 border-b border-line bg-surface px-3 py-2"><span className="size-2 rounded-full bg-data-bad" /><span className="size-2 rounded-full bg-data-warn" /><span className="size-2 rounded-full bg-data-ok" />
                <span className="ml-3 flex-1 truncate rounded bg-canvas px-2 py-0.5 text-[10px] text-muted">{t("settings.branding.preview.domain")}</span></div>
              <div className="flex items-center justify-between border-b border-line bg-surface px-4 py-2.5">
                {draft.logoMediaId ? <img src={mediaUrl(draft.logoMediaId)} alt="" className="h-6 w-auto" /> : <span className="font-display text-sm font-semibold" style={{ color: HEX.test(draft.primaryColor) ? draft.primaryColor : "#3B3F8F" }}>{t("settings.branding.preview.storeName")}</span>}
                <span className="flex gap-3 text-[10px] text-muted"><span>{t("settings.branding.preview.nav.shop")}</span><span>{t("settings.branding.preview.nav.about")}</span><span>{t("settings.branding.preview.nav.cart")}</span></span>
              </div>
              <div className="relative flex h-36 flex-col justify-center gap-1 overflow-hidden px-5 text-white" style={{ background: HEX.test(draft.primaryColor) ? draft.primaryColor : "#3B3F8F" }}>
                {draft.bannerMediaIds[0] && <img src={mediaUrl(draft.bannerMediaIds[0])} alt="" className="absolute inset-0 h-full w-full object-cover opacity-40" />}
                <p className="relative font-display text-xl font-semibold">{draft.bannerTitle || t("settings.branding.preview.bannerTitle")}</p>
                <p className="relative text-sm opacity-90">{draft.bannerSubtitle || t("settings.branding.preview.bannerSubtitle")}</p>
                <span className="relative mt-2 w-fit rounded-lg px-4 py-1.5 text-sm font-medium text-stone-900" style={{ background: HEX.test(draft.accentColor) ? draft.accentColor : "#E8A33D" }}>{draft.bannerCtaLabel || t("settings.branding.preview.cta")}</span>
              </div>
              <div className="flex gap-2 p-4"><span className="rounded-lg px-3 py-1.5 text-sm text-white" style={{ background: HEX.test(draft.primaryColor) ? draft.primaryColor : "#3B3F8F" }}>{t("settings.branding.preview.primary")}</span>
                <span className="rounded-lg px-3 py-1.5 text-sm text-stone-900" style={{ background: HEX.test(draft.accentColor) ? draft.accentColor : "#E8A33D" }}>{t("settings.branding.preview.accent")}</span></div>
            </div>
          </div>
        </Card>

        <Card title={<span className="inline-flex items-center gap-1">{t("settings.branding.card.social")}<HelpTip id="settings.social" guide="store-settings#marka" /></span>}>
          <p className="mb-4 text-xs text-muted">{t("settings.branding.social.hint")}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            {(["instagram", "facebook", "x", "youtube", "tiktok"] as const).map((k) => (
              <TextField key={k} label={t(`settings.branding.social.${k}`)} type="url" placeholder="https://" value={draft.social[k] ?? ""}
                onChange={(e) => patch({ social: { ...draft.social, [k]: e.target.value } })} />
            ))}
          </div>
        </Card>
      </>}
    </SettingsForm>
  );
}

import { useState } from "react";
import { errMsg } from "../../lib/api";
import { MEDIA_ACCEPT, uploadMedia } from "../../lib/media";
import { useToast } from "../../components/ui";

function BannerAdd({ onAdd }: { onAdd: (id: string) => void }) {
  const { t } = useT();
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const upload = async (f: File) => {
    setBusy(true);
    try { onAdd((await uploadMedia(f, "banner")).id); } catch (err) { toast.error(errMsg(err)); } finally { setBusy(false); }
  };
  return (
    <div>
      <DropZone label={t("settings.branding.banner.zoneLabel")} inputLabel={t("settings.branding.banner.upload")} busy={busy} onFile={upload} className="min-h-28" />
      <p className="mt-1.5 text-xs text-muted">{t("settings.branding.banner.uploadHint")}</p>
    </div>
  );
}

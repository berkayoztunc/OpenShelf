import { useState } from "react";
import { AlertTriangle, ExternalLink, Plus, X } from "lucide-react";
import { useGroupForm, useSettings } from "../../lib/settings";
import { Button, Card, ConfirmDialog, TextField, Toggle } from "../../components/ui";
import { HelpTip } from "../../components/help/HelpTip";
import { useT } from "../../i18n";
import { MediaSlot } from "../../components/MediaPicker";
import { MeteredField, SerpPreview } from "../../components/Seo";
import { applyTitleTemplate, descMeter, DESC_MAX, titleMeter } from "../../lib/seo";
import { SettingsForm } from "./SaveBar";
import { TermStrip } from "./TermStrip";

const VARS: [string, "settings.seo.var.title" | "settings.seo.var.storeName"][] = [["%s", "settings.seo.var.title"], ["{storeName}", "settings.seo.var.storeName"]];
const G_TITLE = "seo#baslik-ve-aciklama";

export default function Seo() {
  const { t } = useT();
  const { query, draft, patch, errors, save, dirty } = useGroupForm("seo", (d) => ({ ...d, robotsDisallow: d.robotsDisallow.map((p) => p.trim()).filter(Boolean) }));
  const all = useSettings();
  const [path, setPath] = useState("");
  const storeName = all.data?.general?.storeName || t("settings.seo.fallbackStoreName");
  const [askHide, setAskHide] = useState(false);
  const tagline = all.data?.general?.tagline;
  const storeDesc = all.data?.general?.description ?? "";
  const origin = location.origin;

  const addPath = () => {
    if (!draft) return;
    const p = path.trim(); if (!p) return;
    const norm = p.startsWith("/") ? p : `/${p}`;
    if (!draft.robotsDisallow.includes(norm)) patch({ robotsDisallow: [...draft.robotsDisallow, norm] });
    setPath("");
  };

  // Turning indexing off on a store that is currently indexable hides it from Google: confirm the consequence first.
  const wasIndexable = all.data?.seo?.robotsIndex !== false;
  const onSave = () => { if (draft && !draft.robotsIndex && wasIndexable) setAskHide(true); else save.mutate(); };
  const [hintPre, hintPost] = t("settings.seo.titleTemplate.hint", { vars: "\u0001" }).split("\u0001");

  return (
    <SettingsForm query={query} ready={!!draft} onSave={onSave} saving={save.isPending} dirty={dirty}>
      {draft && <>
        <Card title={t("settings.seo.card.titles")}>
          <div className="space-y-4">
            <TextField label={t("settings.seo.titleTemplate.label")} help="settings.titleTemplate" value={draft.titleTemplate} error={errors.titleTemplate} onChange={(e) => patch({ titleTemplate: e.target.value })}
              hint={<span>{hintPre}{VARS.map(([v, d], i) => <span key={v}>{i > 0 && ", "}<code className="rounded bg-canvas px-1 font-mono">{v}</code> = {t(d)}</span>)}{hintPost}</span>} />
            <p className="text-sm text-muted">{t("settings.seo.titleTemplate.example")} <strong data-testid="title-example" className="font-medium text-ink">{applyTitleTemplate(draft.titleTemplate, t("settings.seo.titleTemplate.sampleProduct"), storeName)}</strong></p>
          </div>
        </Card>

        <Card title={t("settings.seo.card.home")}>
          <div className="grid gap-5 lg:grid-cols-2">
            <div className="space-y-4">
              <MeteredField label={t("settings.seo.homeTitle.label")} help="settings.homeTitle" value={draft.homeTitle} onChange={(v) => patch({ homeTitle: v })} meter={titleMeter(draft.homeTitle, t("settings.seo.homeTitle.empty"))} max={120} placeholder={tagline ? `${storeName} – ${tagline}` : storeName} error={errors.homeTitle} />
              <MeteredField multiline label={t("settings.seo.homeDescription.label")} help="settings.homeDescription" value={draft.homeDescription} onChange={(v) => patch({ homeDescription: v })} meter={descMeter(draft.homeDescription, t("settings.seo.homeDescription.empty"))} max={DESC_MAX} placeholder={storeDesc.slice(0, 155)} error={errors.homeDescription} />
            </div>
            <div className="space-y-3">
              <p className="text-[13px] font-medium">{t("settings.seo.serp.label")}</p>
              <SerpPreview title={draft.homeTitle || (tagline ? `${storeName} – ${tagline}` : storeName)} url={`${origin}/`} description={draft.homeDescription || storeDesc} />
            </div>
          </div>
        </Card>

        <Card title={t("settings.seo.card.social")}>
          <TermStrip ids={["ogimage"]} />
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="relative">
              <MediaSlot label={t("settings.seo.ogImage.label")} kind="og" wide value={draft.defaultOgMediaId} onChange={(id) => patch({ defaultOgMediaId: id })} hint={t("settings.seo.ogImage.hint")} />
              <div className="absolute right-0 -top-1"><HelpTip id="settings.ogImage" guide={G_TITLE} /></div>
            </div>
            <div className="space-y-4">
              <TextField label={t("settings.seo.twitter.label")} placeholder={t("settings.seo.twitter.placeholder")} help="settings.twitter" value={draft.twitterHandle} error={errors.twitterHandle && t("settings.seo.twitter.error")} onChange={(e) => patch({ twitterHandle: e.target.value })} hint={t("settings.seo.twitter.hint")} />
            </div>
          </div>
        </Card>

        <Card title={t("settings.seo.card.access")}>
          <TermStrip ids={["noindex", "canonical", "jsonld", "sitemap", "robots", "redirect301"]} />
          <div className="space-y-5">
            <Toggle label={t("settings.seo.robotsIndex.label")} hint={t("settings.seo.robotsIndex.hint")} help="settings.robotsIndex" checked={draft.robotsIndex} onChange={(v) => patch({ robotsIndex: v })} />
            {!draft.robotsIndex && (
              <p role="alert" data-testid="noindex-warning" className="flex gap-2.5 rounded-lg bg-danger-soft p-3 text-sm text-danger ring-1 ring-inset ring-danger-line">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
                <span><strong>{t("settings.seo.hidden.warning")}</strong> {t("settings.seo.hidden.body")}</span>
              </p>
            )}
            <Toggle label={t("settings.seo.jsonLd.label")} hint={t("settings.seo.jsonLd.hint")} help="settings.jsonLd" checked={draft.jsonLd} onChange={(v) => patch({ jsonLd: v })} />

            <div className="space-y-2">
              <div className="flex items-center gap-1"><p className="text-[13px] font-medium">{t("settings.seo.disallow.label")}</p><HelpTip id="settings.robotsDisallow" /></div>
              <p className="text-xs text-muted">{t("settings.seo.disallow.hint")}</p>
              {draft.robotsDisallow.length > 0 && (
                <ul className="space-y-1.5" aria-label={t("settings.seo.disallow.list")}>
                  {draft.robotsDisallow.map((p, i) => (
                    <li key={p} className="flex items-center gap-2 rounded-lg border border-line bg-canvas py-1 pl-3 pr-1 text-sm">
                      <code className="flex-1 font-mono text-[13px]">{p}</code>
                      {errors[`robotsDisallow.${i}`] && <span className="text-xs text-danger">{t("settings.seo.disallow.invalid")}</span>}
                      <Button size="sm" variant="ghost" aria-label={t("settings.seo.disallow.remove", { path: p })} onClick={() => patch({ robotsDisallow: draft.robotsDisallow.filter((x) => x !== p) })}><X size={14} /></Button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex items-end gap-2">
                <div className="max-w-xs flex-1"><TextField label={t("settings.seo.disallow.input")} placeholder={t("settings.seo.disallow.placeholder")} value={path} onChange={(e) => setPath(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addPath(); } }} /></div>
                <Button variant="secondary" disabled={!path.trim()} onClick={addPath}><Plus size={14} />{t("settings.seo.disallow.add")}</Button>
              </div>
            </div>

            <p className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
              <a href="/sitemap.xml" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-brand-700 hover:underline">/sitemap.xml<ExternalLink size={13} aria-hidden /></a>
              <a href="/robots.txt" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-brand-700 hover:underline">/robots.txt<ExternalLink size={13} aria-hidden /></a>
              <span className="text-xs text-muted">{t("settings.seo.sitemap.note")}</span>
            </p>
          </div>
        </Card>

        <Card title={t("settings.seo.card.verify")}>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label={t("settings.seo.google.label")} help="settings.googleVerify" value={draft.googleSiteVerification} placeholder={t("settings.seo.verify.placeholder")} onChange={(e) => patch({ googleSiteVerification: e.target.value })} hint={t("settings.seo.google.hint")} />
            <TextField label={t("settings.seo.bing.label")} help="settings.bingVerify" value={draft.bingSiteVerification} placeholder={t("settings.seo.verify.placeholder")} onChange={(e) => patch({ bingSiteVerification: e.target.value })} hint={t("settings.seo.bing.hint")} />
            <TextField label={t("settings.seo.facebook.label")} help="settings.facebookVerify" value={draft.facebookDomainVerification} placeholder={t("settings.seo.verify.placeholder")} onChange={(e) => patch({ facebookDomainVerification: e.target.value })} hint={t("settings.seo.facebook.hint")} />
          </div>
        </Card>

        <p className="rounded-xl border border-line bg-canvas p-4 text-sm text-muted">
          <strong className="font-medium text-ink">{t("settings.seo.slugNote.title")}</strong> {t("settings.seo.slugNote.body")}
        </p>
        <ConfirmDialog open={askHide} danger loading={save.isPending} title={t("settings.seo.confirmHide.title")} message={t("settings.seo.confirmHide.message")} confirmLabel={t("settings.seo.confirmHide.action")}
          onConfirm={() => { setAskHide(false); save.mutate(); }} onClose={() => setAskHide(false)} />
      </>}
    </SettingsForm>
  );
}

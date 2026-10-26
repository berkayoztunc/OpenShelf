import { useState } from "react";
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { api } from "../lib/api";
import { mediaUrl } from "../lib/media";
import { applyTitleTemplate, descMeter, DESC_MAX, isHttps, titleMeter, TITLE_MAX } from "../lib/seo";
import { MediaSlot } from "./MediaPicker";
import { MeteredField, SerpPreview, SocialPreview } from "./Seo";
import { Toggle, TextField } from "./ui";
import { useSettings } from "../lib/settings";
import { useT } from "../i18n";

export interface SeoValue { seoTitle?: string; seoDescription?: string; seoOgMediaId?: string | null; seoOgImageUrl?: string; seoNoindex?: boolean; seoCanonical?: string }

interface Resolved { title?: string; description?: string; canonical?: string; og?: { image?: string }; jsonLd?: unknown }
/** GET /api/admin/seo/preview: resolves what crawlers get for the SAVED entity. Absent endpoint (404) is not an error. */
function useServerPreview(type: "product" | "category", id?: string) {
  return useQuery({
    queryKey: ["seo-preview", type, id], enabled: !!id, retry: false, staleTime: 30_000,
    queryFn: async () => { try { return await api.get<Resolved>(`/api/admin/seo/preview?type=${type}&id=${encodeURIComponent(id!)}`); } catch { return null; } },
  });
}
const ldTypes = (ld: unknown): string[] => (Array.isArray(ld) ? ld : ld ? [ld] : []).map((x) => String((x as { "@type"?: string })["@type"] ?? "")).filter(Boolean);

/**
 * SEO fields shared by the product form and the category dialog: title/description with counters,
 * social image, noindex, optional canonical override, SERP + social previews.
 */
export function SeoFields({ type, id, value, onChange, fallbackTitle, fallbackDescription, fallbackImage, path, compact, withMedia, withCanonical, children }: {
  type: "product" | "category"; id?: string; value: SeoValue; onChange: (p: SeoValue) => void;
  fallbackTitle: string; fallbackDescription: string; fallbackImage?: string | null; path: string;
  compact?: boolean; withMedia?: boolean; withCanonical?: boolean; children?: ReactNode;
}) {
  const { t } = useT();
  const settings = useSettings();
  const server = useServerPreview(type, id);
  const [adv, setAdv] = useState(!!value.seoCanonical);
  const storeName = settings.data?.general?.storeName ?? t("catalog.seo.yourStore");
  const template = settings.data?.seo?.titleTemplate ?? "%s | {storeName}";
  const origin = typeof location !== "undefined" ? location.origin : "";
  const rawTitle = value.seoTitle?.trim() || fallbackTitle;
  const shownTitle = applyTitleTemplate(template, rawTitle, storeName);
  const shownDesc = value.seoDescription?.trim() || fallbackDescription;
  const url = value.seoCanonical?.trim() || `${origin}${path}`;
  const ogImage = value.seoOgMediaId ? mediaUrl(value.seoOgMediaId) : value.seoOgImageUrl?.trim() || fallbackImage || (settings.data?.seo?.defaultOgMediaId ? mediaUrl(settings.data.seo.defaultOgMediaId) : null);
  const urlErr = value.seoOgImageUrl && !isHttps(value.seoOgImageUrl) ? t("catalog.seo.ogUrl.error") : undefined;
  const canonErr = value.seoCanonical && !isHttps(value.seoCanonical) ? t("catalog.seo.canonical.error") : undefined;
  const set = (p: SeoValue) => onChange(p);
  const sp = server.data;

  return (
    <div className="space-y-5">
      <div className={compact ? "space-y-4" : "grid gap-5 lg:grid-cols-2"}>
        <div className="space-y-4">
          <MeteredField label={t("catalog.seo.title.label")} testId="SEO title" help="catalog.seoTitle" value={value.seoTitle ?? ""} onChange={(v) => set({ seoTitle: v })} meter={titleMeter(value.seoTitle ?? "", t(type === "product" ? "catalog.seo.meter.titleEmptyProduct" : "catalog.seo.meter.titleEmptyCategory"))} max={TITLE_MAX} placeholder={fallbackTitle} hint={t("catalog.seo.title.hint")} />
          <MeteredField multiline label={t("catalog.seo.desc.label")} testId="Meta description" help="catalog.seoDescription" hint={t("catalog.seo.desc.hint")} value={value.seoDescription ?? ""} onChange={(v) => set({ seoDescription: v })} meter={descMeter(value.seoDescription ?? "")} max={DESC_MAX} placeholder={fallbackDescription.slice(0, 155)} />
        </div>
        <div className="space-y-3">
          <p className="text-[13px] font-medium">{t("catalog.seo.serpHeading")}</p>
          <SerpPreview title={shownTitle} url={url} description={shownDesc} />
        </div>
      </div>

      <div className={compact ? "space-y-4" : "grid gap-5 lg:grid-cols-2"}>
        <div className="space-y-4">
          {withMedia && <MediaSlot label={t("catalog.seo.og.label")} help="catalog.seoImage" kind="og" wide value={value.seoOgMediaId ?? null} onChange={(mid) => set({ seoOgMediaId: mid })} hint={t("catalog.seo.og.hintProduct")} />}
          <TextField label={withMedia ? t("catalog.seo.ogUrl.labelWithMedia") : t("catalog.seo.ogUrl.label")} help={withMedia ? undefined : "catalog.seoImage"} type="url" placeholder="https://" value={value.seoOgImageUrl ?? ""} error={urlErr}
            hint={fallbackImage ? t("catalog.seo.ogUrl.hintFallback") : t("catalog.seo.ogUrl.hintDefault")} onChange={(e) => set({ seoOgImageUrl: e.target.value })} />
          <Toggle label={t("catalog.seo.noindex.label")} help="catalog.noindex" hint={t("catalog.seo.noindex.hint")} checked={!!value.seoNoindex} onChange={(v) => set({ seoNoindex: v })} />
          {withCanonical && (
            <div>
              <button type="button" aria-expanded={adv} onClick={() => setAdv(!adv)} className="flex items-center gap-1.5 text-[13px] font-medium text-muted transition hover:text-ink">
                <ChevronDown size={14} className={`transition ${adv ? "" : "-rotate-90"}`} aria-hidden />{t("catalog.seo.advanced")}
              </button>
              {adv && <div className="mt-3"><TextField label={t("catalog.seo.canonical.label")} help="catalog.canonical" type="url" placeholder={`${origin}${path}`} value={value.seoCanonical ?? ""} error={canonErr}
                hint={t("catalog.seo.canonical.hintProduct")} onChange={(e) => set({ seoCanonical: e.target.value })} /></div>}
            </div>
          )}
        </div>
        <div className="space-y-3">
          <p className="text-[13px] font-medium">{t("catalog.seo.socialHeading")}</p>
          <SocialPreview image={ogImage} title={rawTitle} description={shownDesc} host={(origin || url).replace(/^https?:\/\//, "")} />
        </div>
      </div>
      {children}
      {sp && (
        <p data-testid="server-preview" className="rounded-lg bg-canvas p-3 text-xs text-muted">
          <strong className="font-medium text-ink">{t("catalog.seo.server.heading")}</strong> {t("catalog.seo.server.canonical")} {sp.canonical ?? "-"}{ldTypes(sp.jsonLd).length > 0 && <> · {t("catalog.seo.server.structured")} {ldTypes(sp.jsonLd).join(", ")}</>}
        </p>
      )}
    </div>
  );
}

import { useEffect, useId, useState } from "react";
import { useI18n } from "../i18n";
import { Link } from "react-router-dom";
import { Cookie } from "lucide-react";
import { getConsent, hasDecision, onBannerRequest, onConsentChange, setConsent } from "../tracking";
import { legalTitle, useConfig } from "../store/ConfigContext";

/**
 * Consent panel: non-blocking bottom sheet on phones (full width, prominent) and a bottom-left card
 * on desktop. The page stays usable behind it. Reject and accept stay equal in size and weight side
 * by side, so rejecting is never harder than accepting. necessary (locked) / analytics / marketing.
 */
export function ConsentBanner() {
  const { t } = useI18n();
  const { config } = useConfig();
  const [open, setOpen] = useState(() => !hasDecision());
  const [custom, setCustom] = useState(false);
  const [analytics, setAnalytics] = useState(getConsent().analytics);
  const [marketing, setMarketing] = useState(getConsent().marketing);
  const id = useId();

  useEffect(() => onBannerRequest(() => { const c = getConsent(); setAnalytics(c.analytics); setMarketing(c.marketing); setCustom(true); setOpen(true); }), []);
  useEffect(() => onConsentChange(() => { if (hasDecision()) setOpen(false); }), []);
  if (!open || !config.tracking.consentRequired) return null;

  const decide = (a: boolean, m: boolean) => { setConsent({ analytics: a, marketing: m }); setOpen(false); setCustom(false); };
  const Toggle = ({ label, desc, checked, onChange, locked }: { label: string; desc: string; checked: boolean; onChange?: (v: boolean) => void; locked?: boolean }) => (
    <label className="flex items-start gap-3 rounded-xl border border-line p-3 transition hover:border-muted/60">
      <input type="checkbox" className="mt-0.5 size-5 accent-[var(--color-brand-600)]" checked={checked} disabled={locked} onChange={(e) => onChange?.(e.target.checked)} />
      <span><span className="block text-sm font-medium">{label}</span><span className="block text-xs leading-snug text-muted">{desc}</span></span>
    </label>
  );

  return (
    <section role="dialog" aria-modal="false" aria-labelledby={`${id}-t`} aria-describedby={`${id}-d`}
      className="sheet-in fixed inset-x-0 bottom-0 z-50 max-h-[75dvh] overflow-y-auto rounded-t-2xl border border-line bg-surface px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 shadow-lift sm:inset-x-auto sm:bottom-5 sm:left-5 sm:w-[24rem] sm:rounded-2xl sm:p-5">
      <div className="flex items-start gap-3">
        <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full bg-accent-500/20 text-accent-600"><Cookie size={20} /></span>
        <div>
          <h2 id={`${id}-t`} className="font-display text-lg font-semibold leading-tight">{t("consent.title")}</h2>
          <p id={`${id}-d`} className="mt-1 text-[13px] leading-relaxed text-muted">
            {t("consent.body")}{" "}
            {legalTitle(config, "cookies") && <Link to="/legal/cookies" className="underline underline-offset-2">{t("consent.more")}</Link>}
          </p>
        </div>
      </div>
      {custom && (
        <div className="mt-3 space-y-2">
          <Toggle label={t("consent.necessary")} desc={t("consent.necessaryDesc")} checked locked />
          <Toggle label={t("consent.analytics")} desc={t("consent.analyticsDesc")} checked={analytics} onChange={setAnalytics} />
          <Toggle label={t("consent.marketing")} desc={t("consent.marketingDesc")} checked={marketing} onChange={setMarketing} />
        </div>
      )}
      {/* Reject and accept are the same size and sit side by side. */}
      <div className="mt-3.5 grid grid-cols-2 gap-2">
        <button className="btn-ghost !min-h-11 !px-3 !text-sm !border-ink/25" onClick={() => decide(false, false)}>{t("consent.rejectAll")}</button>
        <button className="btn-primary !min-h-11 !px-3 !text-sm" onClick={() => decide(true, true)}>{t("consent.acceptAll")}</button>
      </div>
      {custom ? (
        <button className="btn-ghost mt-2 !min-h-11 w-full !text-sm" onClick={() => decide(analytics, marketing)}>{t("consent.save")}</button>
      ) : (
        <button className="mt-1.5 w-full cursor-pointer rounded-lg py-1.5 text-[13px] font-medium text-muted underline underline-offset-2 transition hover:text-ink" onClick={() => setCustom(true)}>{t("consent.customize")}</button>
      )}
    </section>
  );
}

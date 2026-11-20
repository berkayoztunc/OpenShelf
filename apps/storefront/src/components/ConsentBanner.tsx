import { useEffect, useId, useRef, useState } from "react";
import { useI18n } from "../i18n";
import { Link } from "react-router-dom";
import { Cookie } from "lucide-react";
import { getConsent, hasDecision, onBannerRequest, onConsentChange, setConsent } from "../tracking";
import { legalTitle, useConfig } from "../store/ConfigContext";

/**
 * Consent dialog: modal with a dimmed backdrop (bottom sheet on phones, centered card on desktop)
 * so visitors make an explicit choice instead of scrolling past it. Reject and accept stay equal
 * in size and weight side by side, so rejecting is never harder than accepting.
 * necessary (locked) / analytics / marketing.
 */
export function ConsentBanner() {
  const { t } = useI18n();
  const { config } = useConfig();
  const [open, setOpen] = useState(() => !hasDecision());
  const [custom, setCustom] = useState(false);
  const [analytics, setAnalytics] = useState(getConsent().analytics);
  const [marketing, setMarketing] = useState(getConsent().marketing);
  const id = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const visible = open && config.tracking.consentRequired;

  useEffect(() => onBannerRequest(() => { const c = getConsent(); setAnalytics(c.analytics); setMarketing(c.marketing); setCustom(true); setOpen(true); }), []);
  useEffect(() => onConsentChange(() => { if (hasDecision()) setOpen(false); }), []);

  // While the dialog is up: lock page scroll and move focus into the dialog.
  useEffect(() => {
    if (!visible) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();
    return () => { document.body.style.overflow = prev; };
  }, [visible]);

  if (!visible) return null;

  const decide = (a: boolean, m: boolean) => { setConsent({ analytics: a, marketing: m }); setOpen(false); setCustom(false); };
  const Toggle = ({ label, desc, checked, onChange, locked }: { label: string; desc: string; checked: boolean; onChange?: (v: boolean) => void; locked?: boolean }) => (
    <label className="flex items-start gap-3 rounded-xl border border-line p-3 transition hover:border-muted/60">
      <input type="checkbox" className="mt-0.5 size-5 accent-[var(--color-brand-600)]" checked={checked} disabled={locked} onChange={(e) => onChange?.(e.target.checked)} />
      <span><span className="block text-sm font-medium">{label}</span><span className="block text-xs leading-snug text-muted">{desc}</span></span>
    </label>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 backdrop-blur-[2px] sm:items-center sm:p-6">
      <section ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={`${id}-t`} aria-describedby={`${id}-d`}
        className="sheet-in max-h-[88dvh] w-full overflow-y-auto rounded-t-3xl border border-line bg-surface px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-6 shadow-lift outline-none sm:max-w-md sm:rounded-3xl sm:p-7">
        <div className="flex flex-col items-center text-center">
          <span aria-hidden className="grid size-14 place-items-center rounded-full bg-accent-500/20 text-accent-600"><Cookie size={28} /></span>
          <h2 id={`${id}-t`} className="mt-4 font-display text-xl font-semibold leading-tight sm:text-2xl">{t("consent.title")}</h2>
          <p id={`${id}-d`} className="mt-2.5 text-sm leading-relaxed text-muted">
            {t("consent.body")}{" "}
            {legalTitle(config, "cookies") && <Link to="/legal/cookies" className="underline underline-offset-2">{t("consent.more")}</Link>}
          </p>
        </div>
        {custom && (
          <div className="mt-4 space-y-2">
            <Toggle label={t("consent.necessary")} desc={t("consent.necessaryDesc")} checked locked />
            <Toggle label={t("consent.analytics")} desc={t("consent.analyticsDesc")} checked={analytics} onChange={setAnalytics} />
            <Toggle label={t("consent.marketing")} desc={t("consent.marketingDesc")} checked={marketing} onChange={setMarketing} />
          </div>
        )}
        {/* Reject and accept are the same size and sit side by side. */}
        <div className="mt-5 grid grid-cols-2 gap-2.5">
          <button className="btn-ghost !min-h-12 !px-3 !text-[15px] !border-ink/25" onClick={() => decide(false, false)}>{t("consent.rejectAll")}</button>
          <button className="btn-primary !min-h-12 !px-3 !text-[15px]" onClick={() => decide(true, true)}>{t("consent.acceptAll")}</button>
        </div>
        {custom ? (
          <button className="btn-ghost mt-2.5 !min-h-12 w-full !text-[15px]" onClick={() => decide(analytics, marketing)}>{t("consent.save")}</button>
        ) : (
          <button className="mt-2.5 w-full cursor-pointer rounded-lg py-2 text-sm font-medium text-muted underline underline-offset-2 transition hover:text-ink" onClick={() => setCustom(true)}>{t("consent.customize")}</button>
        )}
      </section>
    </div>
  );
}

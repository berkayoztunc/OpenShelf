import { LOCALES, useLocale, useT } from "../i18n";

/** TR | EN segmented control. Language is module-level state, so every component re-renders without a reload. */
export function LocaleSwitch({ className }: { className?: string }) {
  const [locale, setLocale] = useLocale();
  const { t } = useT();
  return (
    <div role="group" aria-label={t("common.language")} className={`inline-flex rounded-lg border border-line bg-surface p-0.5 text-xs font-semibold ${className ?? ""}`}>
      {LOCALES.map((l) => (
        <button key={l} type="button" onClick={() => setLocale(l)} aria-pressed={locale === l} lang={l} title={t(`common.lang.${l}`)}
          className={`rounded-md px-2 py-1 uppercase transition ${locale === l ? "bg-brand-600 text-white" : "text-muted hover:text-ink"}`}>{l}</button>
      ))}
    </div>
  );
}

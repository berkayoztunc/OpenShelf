import { useI18n } from "../i18n";
import { useConfig } from "../store/ConfigContext";

const TEXT = {
  tr: { label: "DEMO / MOCK ÖDEME", body: "Bu mağaza demo modunda: gerçek ödeme alınmaz, SMS/e-posta gönderilmez." },
  en: { label: "DEMO / MOCK PAYMENTS", body: "This store is in demo mode: no real payments are taken and no SMS/e-mail is sent." },
} as const;

/** Slim persistent strip shown only while the API reports mockMode. Fixed dark colours keep contrast in both themes. */
export function MockBanner() {
  const { config } = useConfig();
  const { locale } = useI18n();
  if (!config.mockMode) return null;
  const t = TEXT[locale] ?? TEXT.en;
  return (
    <div role="status" data-testid="mock-banner" className="flex items-center justify-center gap-2.5 border-b border-transparent bg-stone-900 px-3 py-1.5 text-[11px] leading-tight text-stone-300 dark:border-line dark:bg-raised dark:text-muted">
      <strong className="shrink-0 rounded bg-accent-400 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-stone-900">{t.label}</strong>
      <span className="truncate max-sm:hidden">{t.body}</span>
    </div>
  );
}

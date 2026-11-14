import { useI18n } from "../i18n";

/**
 * Official iyzico marks (public/iyzico). `band` = "iyzico ile Öde" + card schemes, for the footer;
 * `pay` = the localized "iyzico ile Öde / Pay with iyzico" lockup, for checkout.
 * Coloured art on light themes, white art on dark (same swap as the store logo).
 */
export function IyzicoLogo({ variant, className = "h-6" }: { variant: "band" | "pay"; className?: string }) {
  const { locale } = useI18n();
  const base = variant === "band" ? "band" : locale === "tr" ? "pay-tr" : "pay-en";
  const alt = variant === "band" ? "iyzico ile Öde · Mastercard · Visa · American Express · Troy" : locale === "tr" ? "iyzico ile Öde" : "Pay with iyzico";
  return (
    <span className="logo-has-dark inline-flex max-w-full">
      <img src={`/iyzico/${base}.svg`} alt={alt} loading="lazy" className={`logo-light w-auto max-w-full ${className}`} />
      <img src={`/iyzico/${base}-white.svg`} alt="" aria-hidden loading="lazy" className={`logo-dark w-auto max-w-full ${className}`} />
    </span>
  );
}

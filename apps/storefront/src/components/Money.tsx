import { useI18n } from "../i18n";
import { formatMoney } from "../lib/money";
import { useConfig } from "../store/ConfigContext";

export function useMoney() {
  const { locale } = useI18n();
  const { config } = useConfig();
  return (minor: number, currency?: string) => formatMoney(minor, currency ?? config.general.currency, locale);
}

import { useI18n } from "../i18n";
import { ReturnIcon, ShieldIcon, TruckIcon } from "../lib/Icons";
import { useConfig } from "../store/ConfigContext";
import { useMoney } from "./Money";

/** Reassurance row (shipping threshold, secure payment, returns) shown under the hero. */
export function TrustBar() {
  const { t } = useI18n();
  const { config } = useConfig();
  const money = useMoney();
  const th = config.checkout.freeShippingThreshold;
  const items = [
    { icon: <TruckIcon />, title: t("trust.shipping"), sub: th != null ? t("trust.shippingSub", { amount: money(th) }) : t("trust.shippingSubAny") },
    { icon: <ShieldIcon />, title: t("trust.secure"), sub: t("trust.secureSub") },
    { icon: <ReturnIcon />, title: t("trust.returns"), sub: t("trust.returnsSub") },
  ];
  return (
    <section aria-label={t("trust.secure")} className="border-b border-line bg-surface">
      <ul className="container-x grid grid-cols-1 divide-y divide-line sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        {items.map((i) => (
          <li key={i.title} className="flex items-center gap-3.5 py-4 sm:justify-center sm:px-4">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-ink">{i.icon}</span>
            <span><span className="block text-sm font-semibold">{i.title}</span><span className="block text-xs text-muted">{i.sub}</span></span>
          </li>
        ))}
      </ul>
    </section>
  );
}

import { useI18n } from "../i18n";
import { CheckIcon } from "../lib/Icons";

/** Cart > Details > Payment progress. `current` is 1-based. */
export function CheckoutSteps({ current }: { current: 1 | 2 | 3 }) {
  const { t } = useI18n();
  const steps = [t("checkout.step.cart"), t("checkout.step.details"), t("checkout.step.payment")];
  return (
    <ol aria-label={t("checkout.stepsLabel")} className="flex items-center gap-2 text-sm sm:gap-3">
      {steps.map((label, i) => {
        const n = i + 1; const done = n < current; const active = n === current;
        return (
          <li key={label} className="flex items-center gap-2 sm:gap-3" aria-current={active ? "step" : undefined}>
            <span className={`grid size-7 place-items-center rounded-full text-xs font-bold transition ${done ? "bg-data-ok text-white" : active ? "bg-brand-600 text-white shadow-[0_0_0_4px_color-mix(in_srgb,var(--color-brand-600)_20%,transparent)]" : "border border-line bg-surface text-muted"}`}>
              {done ? <CheckIcon size={14} strokeWidth={3} /> : n}
            </span>
            <span className={active ? "font-semibold" : "text-muted max-sm:sr-only"}>{label}</span>
            {n < steps.length && <span aria-hidden className="h-px w-6 bg-line sm:w-10" />}
          </li>
        );
      })}
    </ol>
  );
}

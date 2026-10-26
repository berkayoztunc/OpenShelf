import { Link } from "react-router-dom";
import { useConfig } from "../store/ConfigContext";

export function Logo({ className = "h-9" }: { className?: string }) {
  const { config } = useConfig();
  const { logoUrl, logoDarkUrl } = config.branding;
  const name = config.general.storeName;
  return (
    <Link to="/" className="group inline-flex shrink-0 items-center" aria-label={name}>
      {logoUrl ? (
        <span className={logoDarkUrl ? "logo-has-dark inline-flex" : "inline-flex"}>
          <img src={logoUrl} alt={name} className={`logo-light w-auto ${className}`} />
          {logoDarkUrl && <img src={logoDarkUrl} alt="" aria-hidden className={`logo-dark w-auto ${className}`} />}
        </span>
      ) : (
        <span className="inline-flex items-center gap-2.5">
          <span aria-hidden className="grid size-9 place-items-center rounded-xl bg-brand-600 font-display text-lg font-semibold text-white shadow-[0_6px_14px_-6px_var(--color-brand-600)] transition duration-300 group-hover:-rotate-6">
            {name.trim().charAt(0).toLocaleUpperCase()}
          </span>
          <span className="font-display text-xl font-semibold tracking-tight">{name}</span>
        </span>
      )}
    </Link>
  );
}

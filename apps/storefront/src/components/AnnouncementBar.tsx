import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { announcementActive } from "@openshelf/shared";
import { useI18n } from "../i18n";
import { useConfig } from "../store/ConfigContext";

const TONE = {
  brand: "bg-brand-600 text-white",
  dark: "bg-stone-900 text-stone-100 dark:bg-raised dark:text-ink",
  soft: "bg-brand-50 text-brand-ink",
} as const;
/** Seconds per character of one loop: keeps the pixel speed roughly constant whatever the text length. */
const SEC_PER_CHAR = { slow: 0.13, normal: 0.09, fast: 0.06 } as const;
/** Copies of the text per half of the track, so one half is wider than any screen. */
const REPS = 4;
const SEP = "   •   ";

function useReducedMotion() {
  const q = "(prefers-reduced-motion: reduce)";
  const [reduced, setReduced] = useState(() => typeof matchMedia !== "undefined" && matchMedia(q).matches);
  useEffect(() => {
    if (typeof matchMedia === "undefined") return;
    const m = matchMedia(q);
    const on = () => setReduced(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return reduced;
}

/** Re-render when the bar's window opens or closes, so an open tab hides it at endsAt without a reload. */
function useWindowTick(startsAt: string | null | undefined, endsAt: string | null | undefined) {
  const [, tick] = useState(0);
  useEffect(() => {
    const now = Date.now();
    const next = [startsAt, endsAt].map((d) => (d ? Date.parse(d) - now : -1)).filter((ms) => ms > 0).sort((a, b) => a - b)[0];
    if (next === undefined || next > 2 ** 31 - 1) return; // setTimeout caps at ~24.8 days; a reload will catch later ones
    const id = setTimeout(() => tick((n) => n + 1), next + 500);
    return () => clearTimeout(id);
  }, [startsAt, endsAt]);
}

/** Merchant-managed strip above the header on every page (Vitrin > Duyuru barı). */
export function AnnouncementBar() {
  const { config } = useConfig();
  const { locale, t } = useI18n();
  const reduced = useReducedMotion();
  const a = config.announcement;
  useWindowTick(a?.startsAt, a?.endsAt);
  if (!a || !announcementActive(a)) return null;

  const text = (locale === "en" && a.textEn.trim()) || a.text.trim();
  const moving = a.style === "marquee" && !reduced;
  const loopChars = REPS * (text.length + SEP.length);
  const duration = Math.max(8, loopChars * SEC_PER_CHAR[a.speed]);

  const body: ReactNode = moving ? (
    <span className="os-marquee block overflow-hidden whitespace-nowrap">
      <span className="sr-only">{text}</span>
      <span aria-hidden className="os-marquee-track" style={{ ["--os-marquee-dur" as string]: `${duration}s` }}>
        {[0, 1].map((half) => (
          <span key={half} className="flex shrink-0">
            {Array.from({ length: REPS }, (_, i) => <span key={i} className="shrink-0 whitespace-pre">{text}{SEP}</span>)}
          </span>
        ))}
      </span>
    </span>
  ) : (
    <span className="block px-4 text-center">{text}</span>
  );

  const cls = "block py-2 text-[13px] font-medium leading-snug";
  const link = a.link.trim();
  return (
    <div role="region" aria-label={t("announcement.label")} data-testid="announcement-bar" className={TONE[a.tone]}>
      {!link ? <div className={cls}>{body}</div>
        : link.startsWith("/") ? <Link to={link} className={`${cls} hover:underline focus-visible:underline`}>{body}</Link>
        : <a href={link} target="_blank" rel="noopener noreferrer" className={`${cls} hover:underline focus-visible:underline`}>{body}</a>}
    </div>
  );
}

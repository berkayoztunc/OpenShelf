import { Link, useInRouterContext } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";
import { guidePath } from "../../help/slug";

/** Link into the guide that also works when rendered outside a Router (tests, print views). */
export function GuideLink({ guide, children, className }: { guide: string; children: ReactNode; className?: string }) {
  const inRouter = useInRouterContext();
  const path = guidePath(guide);
  const cls = className ?? "inline-flex items-center gap-1 text-[13px] font-medium text-brand-ink hover:underline";
  return inRouter
    ? <Link to={path} className={cls}>{children}<ArrowRight size={13} aria-hidden /></Link>
    : <a href={`${import.meta.env.BASE_URL.replace(/\/$/, "")}${path}`} className={cls}>{children}<ArrowRight size={13} aria-hidden /></a>;
}

import { useEffect, useRef, useState } from "react";

const initials = (title: string) => {
  const w = title.replace(/[^\p{L}\p{N}\s]/gu, "").trim().split(/\s+/).filter(Boolean);
  return ((w[0]?.[0] ?? "?") + (w.length > 1 ? w[1]![0]! : "")).toLocaleUpperCase();
};
const hash = (s: string) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); };

/** Branded SVG placeholder: soft tinted tile with the product initials. Never a broken image, follows brand + dark mode. */
export function Placeholder({ title, className = "" }: { title: string; className?: string }) {
  const h = hash(title);
  const tone = ["var(--color-brand-100)", "color-mix(in srgb, var(--color-accent-500) 28%, var(--color-surface))", "var(--color-brand-50)", "var(--color-line)"][h % 4]!;
  const cx = 60 + (h % 5) * 70, cy = 90 + ((h >> 3) % 4) * 90;
  return (
    <svg role="img" aria-label={title} viewBox="0 0 400 500" preserveAspectRatio="xMidYMid slice" className={`size-full ${className}`}>
      <rect width="400" height="500" fill={tone} />
      <circle cx={cx} cy={cy} r="190" fill="var(--color-surface)" opacity=".38" />
      <circle cx={400 - cx / 2} cy={500 - cy / 2} r="110" fill="var(--color-brand-600)" opacity=".08" />
      <text x="200" y="272" textAnchor="middle" fontSize="92" fill="var(--color-brand-600)" opacity=".75" style={{ fontFamily: "var(--font-display)", fontWeight: 600 }}>{initials(title)}</text>
    </svg>
  );
}

/** Image that fades in once loaded, shows a shimmer meanwhile and falls back to the placeholder on error / missing url. */
export function ProductImage({ src, alt, title, className = "", eager = false, fetchPriority, width, height }: { width?: number; height?: number; src?: string | null; alt?: string | null; title: string; className?: string; eager?: boolean; fetchPriority?: "high" | "auto" }) {
  const [state, setState] = useState<"loading" | "ok" | "error">(src ? "loading" : "error");
  const ref = useRef<HTMLImageElement>(null);
  useEffect(() => { setState(src ? "loading" : "error"); }, [src]);
  // Covers images that finished (or failed) before hydration attached handlers.
  useEffect(() => {
    const el = ref.current;
    if (el?.complete) setState(el.naturalWidth > 0 ? "ok" : "error");
  }, [src]);
  if (state === "error" || !src) return <Placeholder title={alt || title} className={className} />;
  return (
    <>
      {state === "loading" && <span className="skeleton absolute inset-0 rounded-none" aria-hidden />}
      <img ref={ref} src={src} alt={alt || title} width={width} height={height} loading={eager ? "eager" : "lazy"} decoding={eager ? "sync" : "async"} {...(fetchPriority ? ({ fetchpriority: fetchPriority } as object) : {})} /* React 18 only knows the lowercase attribute */
        onLoad={() => setState("ok")} onError={() => setState("error")}
        className={`${className} transition-opacity duration-500 ${state === "ok" ? "opacity-100" : "opacity-0"}`} />
    </>
  );
}

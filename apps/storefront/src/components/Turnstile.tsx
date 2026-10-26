import { useEffect, useRef } from "react";

declare global { interface Window { turnstile?: { render: (el: HTMLElement, o: Record<string, unknown>) => string; remove: (id: string) => void } } }
const SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

/** Optional Cloudflare Turnstile widget. Only rendered when VITE_TURNSTILE_SITE_KEY is set (strictly-necessary security script). */
export function Turnstile({ onToken }: { onToken: (t: string | null) => void }) {
  const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY;
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!siteKey || !box.current) return;
    let id: string | undefined; let dead = false;
    const mount = () => { if (!dead && box.current && window.turnstile) id = window.turnstile.render(box.current, { sitekey: siteKey, callback: (t: string) => onToken(t), "expired-callback": () => onToken(null), "error-callback": () => onToken(null) }); };
    if (window.turnstile) mount();
    else {
      let s = document.querySelector<HTMLScriptElement>(`script[src="${SRC}"]`);
      if (!s) { s = document.createElement("script"); s.src = SRC; s.async = true; document.head.appendChild(s); }
      s.addEventListener("load", mount);
    }
    return () => { dead = true; if (id) window.turnstile?.remove(id); };
  }, [siteKey, onToken]);
  return siteKey ? <div ref={box} className="min-h-[65px]" /> : null;
}
export const turnstileEnabled = () => !!import.meta.env.VITE_TURNSTILE_SITE_KEY;

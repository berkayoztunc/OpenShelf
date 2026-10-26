import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Locale } from "../api/types";
import { MESSAGES, type MessageKey } from "./messages";

type Vars = Record<string, string | number>;
interface I18n { locale: Locale; setLocale: (l: Locale) => void; t: (k: MessageKey, v?: Vars) => string }
const Ctx = createContext<I18n | null>(null);

export function translate(locale: Locale, k: MessageKey, v?: Vars): string {
  const s = MESSAGES[locale][k] ?? MESSAGES.en[k] ?? k;
  return v ? s.replace(/\{(\w+)\}/g, (_, n: string) => String(v[n] ?? `{${n}}`)) : s;
}

export function I18nProvider({ defaultLocale, locales, children }: { defaultLocale: Locale; locales: Locale[]; children: ReactNode }) {
  const [locale, setLoc] = useState<Locale>(() => {
    try { const s = localStorage.getItem("os_locale") as Locale | null; if (s && locales.includes(s)) return s; } catch { /* ignore */ }
    return defaultLocale;
  });
  useEffect(() => { document.documentElement.lang = locale; }, [locale]);
  const setLocale = useCallback((l: Locale) => { setLoc(l); try { localStorage.setItem("os_locale", l); } catch { /* ignore */ } }, []);
  const value = useMemo<I18n>(() => ({ locale, setLocale, t: (k, v) => translate(locale, k, v) }), [locale, setLocale]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export function useI18n(): I18n { const c = useContext(Ctx); if (!c) throw new Error("I18nProvider missing"); return c; }

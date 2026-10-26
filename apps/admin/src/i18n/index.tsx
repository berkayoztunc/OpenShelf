import { useCallback, useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { tr } from "./tr";
import { en } from "./en";

/**
 * Admin i18n. Turkish is the default. Dictionaries are flat `key -> text` maps split by namespace file
 * (see docs/admin-i18n.md). Missing keys fall back EN -> TR -> the key itself, so a gap never crashes the UI.
 * The store lives at module level (not in React context) so non-component code (formatters, API errors) can translate too.
 */
export type Locale = "tr" | "en";
export const LOCALES: readonly Locale[] = ["tr", "en"];
export type MessageKey = keyof typeof tr;
type Vars = Record<string, string | number>;

const DICT: Record<Locale, Record<string, string>> = { tr, en };
export const STORAGE_KEY = "os_admin_locale";

function readStored(): Locale {
  try { const s = localStorage.getItem(STORAGE_KEY); if (s === "tr" || s === "en") return s; } catch { /* storage blocked */ }
  return "tr";
}
let current: Locale = readStored();
const listeners = new Set<() => void>();
const subscribe = (f: () => void) => { listeners.add(f); return () => { listeners.delete(f); }; };

export const getLocale = (): Locale => current;
/** BCP-47 tag for Intl formatting of dates and relative times. */
export const intlTag = (l: Locale = current) => (l === "tr" ? "tr-TR" : "en-US");

export function setLocale(l: Locale) {
  if (l === current) return;
  current = l;
  try { localStorage.setItem(STORAGE_KEY, l); } catch { /* ignore */ }
  if (typeof document !== "undefined") document.documentElement.lang = l;
  listeners.forEach((f) => f());
}

const fill = (s: string, v?: Vars) => (v ? s.replace(/\{(\w+)\}/g, (_, n: string) => String(v[n] ?? `{${n}}`)) : s);

/** Translate with an arbitrary string key (dynamic keys such as `enum.status.${s}`). Returns undefined when missing everywhere. */
export function lookup(locale: Locale, key: string): string | undefined {
  return DICT[locale][key] ?? DICT.en[key] ?? DICT.tr[key];
}
export function translate(locale: Locale, key: string, vars?: Vars): string {
  const s = lookup(locale, key);
  return s === undefined ? key : fill(s, vars);
}
export const hasKey = (key: string) => lookup(current, key) !== undefined;
/** Translate outside React (formatters, error mapping). */
export const tNow = (key: string, vars?: Vars) => translate(current, key, vars);

/** Plural helper: picks `${base}_one` / `${base}_other` (Intl.PluralRules) and injects `{n}`. */
export function plural(locale: Locale, base: string, n: number, vars?: Vars): string {
  const cat = new Intl.PluralRules(intlTag(locale)).select(n);
  const key = lookup(locale, `${base}_${cat}`) !== undefined ? `${base}_${cat}` : `${base}_other`;
  return translate(locale, key, { n, ...vars });
}

export function useLocale(): [Locale, (l: Locale) => void] {
  const locale = useSyncExternalStore(subscribe, getLocale, getLocale);
  return [locale, setLocale];
}

/**
 * `t(key)` for static, type-checked keys; `td(key)` for dynamic keys (falls back to the key text);
 * `tp(base, n)` for plurals. Re-renders every consumer when the language changes.
 */
export function useT() {
  const locale = useSyncExternalStore(subscribe, getLocale, getLocale);
  const t = useCallback((key: MessageKey, vars?: Vars) => translate(locale, key, vars), [locale]);
  const td = useCallback((key: string, vars?: Vars) => translate(locale, key, vars), [locale]);
  const tp = useCallback((base: string, n: number, vars?: Vars) => plural(locale, base, n, vars), [locale]);
  return useMemo(() => ({ t, td, tp, locale }), [t, td, tp, locale]);
}

/** Keeps <html lang> in sync. Language state itself is module-level, so the provider is optional in tests. */
export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale] = useLocale();
  useEffect(() => { document.documentElement.lang = locale; }, [locale]);
  return <>{children}</>;
}

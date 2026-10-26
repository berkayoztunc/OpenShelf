import type { BrandingSettings } from "@openshelf/shared";
import type { z } from "zod";

export function hexToRgbTriplet(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}
/** Apply store branding colors at runtime (called by storefront + admin after /config loads). */
export function applyBrandTheme(b: Pick<z.infer<typeof BrandingSettings>, "primaryColor" | "accentColor">, root: HTMLElement = document.documentElement) {
  root.style.setProperty("--os-primary", b.primaryColor);
  root.style.setProperty("--os-accent", b.accentColor);
}
export type ThemeMode = "light" | "dark" | "system";
export const THEME_MODES: readonly ThemeMode[] = ["system", "light", "dark"];
const THEME_KEY = "os-theme";
const isMode = (m: unknown): m is ThemeMode => m === "light" || m === "dark" || m === "system";

/** Stored preference (defaults to "system"). */
export function getThemeMode(): ThemeMode {
  try { const m = localStorage.getItem(THEME_KEY); return isMode(m) ? m : "system"; } catch { return "system"; }
}
/** The theme actually in effect right now. */
export function resolvedTheme(root: HTMLElement = document.documentElement): "light" | "dark" {
  const a = root.getAttribute("data-theme");
  if (a === "light" || a === "dark") return a;
  return typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
/** Apply + persist the mode. "system" removes data-theme so the media query decides. Notifies listeners (other toggles). */
export function setThemeMode(mode: ThemeMode, root: HTMLElement = document.documentElement) {
  if (mode === "system") root.removeAttribute("data-theme"); else root.setAttribute("data-theme", mode);
  try { localStorage.setItem(THEME_KEY, mode); } catch {}
  try { window.dispatchEvent(new CustomEvent("os-theme-change", { detail: mode })); } catch {}
}
export function initThemeMode() {
  const m = getThemeMode();
  if (m === "system") document.documentElement.removeAttribute("data-theme"); else document.documentElement.setAttribute("data-theme", m);
}
/** Subscribe to mode changes made anywhere (including other tabs). Returns an unsubscribe fn. */
export function onThemeModeChange(cb: (m: ThemeMode) => void): () => void {
  const a = (e: Event) => cb((e as CustomEvent<ThemeMode>).detail);
  const b = (e: StorageEvent) => { if (e.key === THEME_KEY) { cb(getThemeMode()); initThemeMode(); } };
  window.addEventListener("os-theme-change", a); window.addEventListener("storage", b);
  return () => { window.removeEventListener("os-theme-change", a); window.removeEventListener("storage", b); };
}

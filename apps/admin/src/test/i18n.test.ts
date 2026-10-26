import { describe, expect, it } from "vitest";
import { ORDER_STATUSES, NOTIFICATION_EVENTS, PROVIDER_IDS, ROLES, ORDER_SOURCES } from "@openshelf/shared";
import { tr } from "../i18n/tr";
import { en } from "../i18n/en";
import { GLOSSARY } from "../i18n/glossary";
import { enumLabel, timeAgo, dateTime } from "../lib/format";
import { plural, setLocale, translate, tNow } from "../i18n";

const T = tr as Record<string, string>; const E = en as Record<string, string>;
const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");

describe("dictionaries", () => {
  it("TR and EN have exactly the same keys", () => {
    const missingEn = Object.keys(T).filter((k) => !(k in E));
    const missingTr = Object.keys(E).filter((k) => !(k in T));
    expect({ missingEn, missingTr }).toEqual({ missingEn: [], missingTr: [] });
  });
  it("no empty values", () => {
    expect(Object.entries(T).filter(([, v]) => !v.trim()).map(([k]) => `tr:${k}`)).toEqual([]);
    expect(Object.entries(E).filter(([, v]) => !v.trim()).map(([k]) => `en:${k}`)).toEqual([]);
  });
  it("{placeholders} match between languages", () => {
    const bad = Object.keys(T).filter((k) => k in E && vars(T[k]!) !== vars(E[k]!));
    expect(bad).toEqual([]);
  });
  it("plural keys come in _one/_other pairs", () => {
    for (const d of [T, E]) for (const k of Object.keys(d)) {
      if (k.endsWith("_one")) expect(d[k.replace(/_one$/, "_other")], k).toBeTruthy();
      if (k.endsWith("_other")) expect(d[k.replace(/_other$/, "_one")], k).toBeTruthy();
    }
  });
  it("every glossary entry has term, short and long in both languages", () => {
    for (const g of GLOSSARY) for (const p of ["term", "short", "long"]) { expect(T[`glossary.${g.id}.${p}`], `tr ${g.id}.${p}`).toBeTruthy(); expect(E[`glossary.${g.id}.${p}`], `en ${g.id}.${p}`).toBeTruthy(); }
    const orphan = Object.keys(T).filter((k) => k.startsWith("glossary.") && !GLOSSARY.some((g) => k.startsWith(`glossary.${g.id}.`)));
    expect(orphan).toEqual([]);
  });
  it("every help.<id> has a body", () => {
    const ids = new Set(Object.keys(T).filter((k) => /^help\.[^.]+\.[^.]+\.(title|example|warn|guide)$/.test(k)).map((k) => k.split(".").slice(0, -1).join(".")));
    for (const id of ids) expect(T[`${id}.body`], `${id}.body`).toBeTruthy();
  });
  it("all code values from shared constants have a human label", () => {
    const missing: string[] = [];
    for (const s of ORDER_STATUSES) if (!T[`enum.status.${s}`]) missing.push(`status.${s}`);
    for (const s of NOTIFICATION_EVENTS) if (!T[`enum.notificationEvent.${s}`]) missing.push(`notificationEvent.${s}`);
    for (const s of PROVIDER_IDS) for (const g of ["provider", "providerRole"]) if (!T[`enum.${g}.${s}`]) missing.push(`${g}.${s}`);
    for (const s of ROLES) if (!T[`enum.role.${s}`]) missing.push(`role.${s}`);
    for (const s of ORDER_SOURCES) if (!T[`enum.source.${s}`]) missing.push(`source.${s}`);
    expect(missing).toEqual([]);
  });
});

describe("translate / format", () => {
  it("falls back EN -> TR -> key and fills variables", () => {
    expect(translate("tr", "common.page", { page: 2, pages: 5 })).toBe("Sayfa 2 / 5");
    expect(translate("en", "common.page", { page: 2, pages: 5 })).toBe("Page 2 of 5");
    expect(translate("tr", "does.not.exist")).toBe("does.not.exist");
  });
  it("plural + relative time follow the active language", () => {
    expect(plural("en", "common.time.minAgo", 5)).toBe("5 min ago");
    setLocale("tr");
    expect(timeAgo(new Date(Date.now() - 5 * 60_000).toISOString())).toBe("5 dk önce");
    expect(timeAgo(null)).toBe("hiç");
    setLocale("en");
    expect(timeAgo(null)).toBe("never");
  });
  it("enumLabel gives human text, never the raw code", () => {
    setLocale("tr");
    expect(enumLabel("status", "awaiting_payment")).toBe("Ödeme bekleniyor");
    expect(enumLabel("invoiceType", "e_arsiv")).toBe("e-Arşiv (bireysel)");
    expect(enumLabel("status", "some_new_state")).toBe("Some new state");
    expect(tNow("nav.orders")).toBe("Siparişler");
  });
  it("dates use the active language", () => {
    const iso = "2026-03-05T10:00:00Z";
    setLocale("tr"); const a = dateTime(iso);
    setLocale("en"); const b = dateTime(iso);
    expect(a).not.toBe(b);
  });
});

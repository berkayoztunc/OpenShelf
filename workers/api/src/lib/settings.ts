import { eq } from "drizzle-orm";
import { storeSettings } from "@openshelf/db";
import { SETTING_GROUPS, type SettingGroup, type SettingsOf } from "@openshelf/shared";
import type { Db } from "../env";

const TTL_MS = 30_000;
const cache = new Map<SettingGroup, { at: number; value: unknown }>();
export const clearSettingsCache = () => cache.clear();

export async function getSettings<G extends SettingGroup>(db: Db, group: G): Promise<SettingsOf<G>> {
  // `system` (mockMode) is never cached: it gates real-money vs mock behaviour and must flip instantly on every isolate.
  const hit = group === "system" ? undefined : cache.get(group);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value as SettingsOf<G>;
  const [row] = await db.select().from(storeSettings).where(eq(storeSettings.group, group)).limit(1);
  const schema = SETTING_GROUPS[group] as unknown as { parse(v: unknown): SettingsOf<G> };
  const parsed = schema.parse(row?.value ?? {}); // defaults fill gaps
  if (group !== "system") cache.set(group, { at: Date.now(), value: parsed });
  return parsed;
}
export async function getAllSettings(db: Db) {
  const out: Record<string, unknown> = {};
  for (const g of Object.keys(SETTING_GROUPS) as SettingGroup[]) out[g] = await getSettings(db, g);
  return out as { [G in SettingGroup]: SettingsOf<G> };
}
export async function saveSettings<G extends SettingGroup>(db: Db, group: G, value: SettingsOf<G>, adminId: string | null) {
  await db.insert(storeSettings).values({ group, value, updatedBy: adminId, updatedAt: new Date() })
    .onConflictDoUpdate({ target: storeSettings.group, set: { value, updatedBy: adminId, updatedAt: new Date() } });
  cache.delete(group);
  if (group === "system") clearSettingsCache();
}

const mediaUrl = (id: string | null | undefined) => (id ? `/media/${id}` : null);
export const LEGAL_TITLES: Record<string, string> = { kvkk: "KVKK Aydınlatma Metni", distanceSales: "Mesafeli Satış Sözleşmesi", returns: "İade ve Cayma Koşulları", cookies: "Çerez Politikası", privacy: "Gizlilik Politikası" };

/** Public subset for /api/store/config. No secrets; media ids resolved to URLs. */
export async function publicConfig(db: Db) {
  const s = await getAllSettings(db);
  const { tracking } = s;
  const legal: Record<string, string> = {};
  for (const [k, title] of Object.entries(LEGAL_TITLES)) if ((s.legal as Record<string, string>)[k]?.trim()) legal[k] = title;
  return {
    general: s.general,
    branding: {
      ...s.branding,
      logoUrl: mediaUrl(s.branding.logoMediaId), logoDarkUrl: mediaUrl(s.branding.logoDarkMediaId),
      faviconUrl: mediaUrl(s.branding.faviconMediaId), bannerUrls: s.branding.bannerMediaIds.map((id) => `/media/${id}`),
    },
    seo: { ...s.seo, defaultOgUrl: mediaUrl(s.seo.defaultOgMediaId) },
    checkout: { guestCheckout: s.checkout.guestCheckout, freeShippingThreshold: s.checkout.freeShippingThreshold, flatShippingFee: s.checkout.flatShippingFee },
    tracking: { ga4MeasurementId: tracking.ga4MeasurementId, gtmContainerId: tracking.gtmContainerId, metaPixelId: tracking.metaPixelId, consentRequired: tracking.consentRequired },
    legal,
    locales: { default: s.general.defaultLocale, available: s.general.locales },
    mockMode: s.system.mockMode === true,
  };
}

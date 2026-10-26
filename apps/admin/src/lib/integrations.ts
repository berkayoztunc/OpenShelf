import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
import { enumLabel } from "./format";
import { getLocale, hasKey, tNow, type MessageKey } from "../i18n";
import type { FieldDef, Integration } from "./types";

export const INTEGRATIONS_KEY = ["integrations"] as const;
export const useIntegrations = (enabled = true) =>
  useQuery({ queryKey: INTEGRATIONS_KEY, enabled, queryFn: () => api.get<Integration[]>("/api/admin/integrations").then((l) => l.filter((i) => i.available !== false)) });

export type CategoryId = "payments" | "shipping" | "invoicing" | "marketplace" | "analytics" | "messaging";
export const CATEGORIES: { id: CategoryId }[] = ["payments", "shipping", "invoicing", "marketplace", "analytics", "messaging"].map((id) => ({ id: id as CategoryId }));
const CATEGORY_OF: Record<string, CategoryId> = {
  iyzico: "payments", geliver: "shipping", efaturam: "invoicing", trendyol: "marketplace",
  meta: "analytics", ga4: "analytics", netgsm: "messaging", twilio: "messaging", cf_email: "messaging",
};
export const categoryOf = (provider: string): CategoryId => CATEGORY_OF[provider] ?? "marketplace";
export const categoryLabel = (id: CategoryId) => enumLabel("category", id);

/** Setup checklist: the integrations a fresh store needs, each satisfied by any provider in `providers`. */
export const CHECKLIST: { id: string; labelKey: MessageKey; providers: string[] }[] = [
  { id: "payment", labelKey: "integrations.checklist.payment", providers: ["iyzico"] },
  { id: "shipping", labelKey: "integrations.checklist.shipping", providers: ["geliver"] },
  { id: "invoicing", labelKey: "integrations.checklist.invoicing", providers: ["efaturam"] },
  { id: "email", labelKey: "integrations.checklist.email", providers: ["cf_email"] },
  { id: "sms", labelKey: "integrations.checklist.sms", providers: ["netgsm", "twilio"] },
  { id: "analytics", labelKey: "integrations.checklist.analytics", providers: ["ga4", "meta"] },
];

/** Guide anchors (section `integrations`) per provider; shown as "Setup guide" in the drawer. */
export const GUIDE_ANCHOR: Record<string, string> = {
  iyzico: "iyzico", trendyol: "trendyol", geliver: "geliver", efaturam: "e-faturam", meta: "meta-pixel-ve-donusum-api",
  ga4: "google-analytics-4", netgsm: "netgsm", twilio: "twilio", cf_email: "cloudflare-e-posta",
};
/** Glossary terms worth showing in each provider drawer (only ids that exist in the registry are rendered). */
export const PROVIDER_TERMS: Record<string, string[]> = {
  iyzico: ["hostedcheckout", "sandbox", "apikey", "refund"],
  trendyol: ["webhook", "sku", "barcode", "channelprice"],
  geliver: ["carrier", "trackingno", "sandbox"],
  efaturam: ["efatura", "earsiv", "vkn", "kdv"],
  meta: ["pixel", "capi", "eventid", "testeventcode", "accesstoken"],
  ga4: ["ga4", "measurementid", "apisecret", "consent"],
  netgsm: ["smsheader", "iys"],
  twilio: ["e164", "smsheader"],
  cf_email: ["domain", "apikey"],
};

/**
 * Manifest text (name, description, field label/help/placeholder/option) in the active language.
 * The API returns the manifest as authored: English for trendyol/meta/ga4/netgsm/twilio/cf_email (kept as-is in English),
 * Turkish for iyzico/geliver/efaturam. Turkish always uses the dictionary; any key missing there falls back to the server text.
 */
const ENGLISH_MANIFESTS = new Set(["trendyol", "meta", "ga4", "netgsm", "twilio", "cf_email"]);
export function manifestText(provider: string, path: string, server?: string): string | undefined {
  const key = `integration.${provider}.${path}`;
  if (getLocale() === "en" && server && ENGLISH_MANIFESTS.has(provider)) return server;
  return hasKey(key) ? tNow(key) : server;
}
export const integrationName = (it: Pick<Integration, "provider" | "name">) => manifestText(it.provider, "name", it.name) ?? it.name;
export const integrationDescription = (it: Pick<Integration, "provider" | "description">) => manifestText(it.provider, "description", it.description);
export const fieldLabel = (provider: string, f: FieldDef) => manifestText(provider, `field.${f.key}.label`, f.label) ?? f.label;
export const fieldHelp = (provider: string, f: FieldDef) => manifestText(provider, `field.${f.key}.help`, f.help);
export const fieldPlaceholder = (provider: string, f: FieldDef) => manifestText(provider, `field.${f.key}.placeholder`, f.placeholder);
export const optionLabel = (provider: string, f: FieldDef, value: string, server?: string) => manifestText(provider, `field.${f.key}.option.${value}`, server ?? value) ?? value;
/** Id for the rich "?" help of a field (`help.integration.<provider>.<key>.*`), or undefined when the dictionary has none. */
export const fieldHelpId = (provider: string, key: string) => (hasKey(`help.integration.${provider}.${key}.body`) ? `integration.${provider}.${key}` : undefined);

export type StatusKind = "mock" | "error" | "connected" | "configured" | "unconfigured";

/** All required fields present (public values filled, secrets set). Providers without required fields count as configured once enabled. */
export function isConfigured(it: Integration): boolean {
  const reqPublic = it.publicFields.filter((f) => f.required && f.type !== "boolean");
  const reqSecret = it.secretFields.filter((f) => f.required);
  if (!reqPublic.length && !reqSecret.length) return it.enabled || it.secretFields.some((f) => it.secretsSet?.[f.key]);
  return reqPublic.every((f) => { const v = it.configPublic?.[f.key]; return v !== undefined && v !== null && String(v).trim() !== ""; }) && reqSecret.every((f) => !!it.secretsSet?.[f.key]);
}
export function statusOf(it: Integration, mockMode: boolean): StatusKind {
  if (mockMode || it.mock) return "mock";
  if (it.enabled && it.health && !it.health.ok) return "error";
  if (it.enabled && it.health?.ok) return "connected";
  return isConfigured(it) ? "configured" : "unconfigured";
}
export const unhealthyCount = (list: Integration[], mockMode: boolean) => (mockMode ? 0 : list.filter((i) => statusOf(i, false) === "error").length);

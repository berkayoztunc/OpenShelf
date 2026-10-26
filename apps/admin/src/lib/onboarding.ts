import type { MessageKey } from "../i18n";

export interface OnboardingInput {
  storeName?: string | null;
  logoMediaId?: string | null;
  productCount?: number;
  paymentConnected?: boolean;
  shippingConnected?: boolean;
  invoicingConnected?: boolean;
  adminEmail?: string | null;
  originNotice?: string | null;
  totpEnabled?: boolean;
  mockMode?: boolean;
}
export interface OnboardingStep { id: string; done: boolean; to: string; guide: string; title: MessageKey; body: MessageKey }

/** Default store name from the shared settings schema; an unchanged default means the owner has not named the store yet. */
export const DEFAULT_STORE_NAME = "My Store";

/** The "first 10 steps" checklist for a fresh install; each step is derived from data the dashboard already has. */
export function buildOnboarding(i: OnboardingInput): OnboardingStep[] {
  const name = (i.storeName ?? "").trim();
  const s = (id: string, done: boolean, to: string, guide: string): OnboardingStep => ({ id, done, to, guide, title: `dashboard.onboarding.${id}.title` as MessageKey, body: `dashboard.onboarding.${id}.body` as MessageKey });
  return [
    s("storeName", name !== "" && name !== DEFAULT_STORE_NAME, "/settings/general", "store-settings#genel"),
    s("logo", !!i.logoMediaId, "/settings/branding", "store-settings#marka"),
    s("product", (i.productCount ?? 0) > 0, "/products/new", "catalog#urun-ekleme"),
    s("payment", !!i.paymentConnected, "/integrations?configure=iyzico", "integrations#iyzico"),
    s("shipping", !!i.shippingConnected, "/integrations?configure=geliver", "integrations#geliver"),
    s("invoicing", !!i.invoicingConnected, "/integrations?configure=efaturam", "integrations#e-faturam"),
    s("notify", !!(i.adminEmail ?? "").trim(), "/settings/notifications", "store-settings#bildirimler"),
    s("domain", !i.originNotice, "/settings/system", "going-live#alan-adi"),
    s("mfa", !!i.totpEnabled, "/security", "security#iki-adimli-dogrulama"),
    s("live", !i.mockMode, "/settings/system", "going-live#mock-u-kapatma"),
  ];
}

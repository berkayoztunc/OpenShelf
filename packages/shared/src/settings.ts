import { z } from "zod";

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const GeneralSettings = z.object({
  storeName: z.string().min(1).max(80).default("My Store"),
  tagline: z.string().max(160).default(""),
  description: z.string().max(500).default(""),
  contactEmail: z.string().email().optional(),
  contactPhone: z.string().max(30).optional(),
  address: z.string().max(300).optional(),
  taxId: z.string().max(30).optional(),
  currency: z.string().length(3).default("TRY"),
  pricesIncludeTax: z.boolean().default(true),
  defaultTaxRate: z.number().min(0).max(100).default(20),
  defaultLocale: z.enum(["tr", "en"]).default("tr"),
  locales: z.array(z.enum(["tr", "en"])).default(["tr", "en"]),
  timezone: z.string().default("Europe/Istanbul"),
});

export const BrandingSettings = z.object({
  logoMediaId: z.string().nullable().default(null),
  logoDarkMediaId: z.string().nullable().default(null),
  faviconMediaId: z.string().nullable().default(null),
  bannerMediaIds: z.array(z.string()).max(6).default([]),
  bannerTitle: z.string().max(120).default(""),
  bannerSubtitle: z.string().max(240).default(""),
  bannerCtaLabel: z.string().max(40).default(""),
  bannerCtaUrl: z.string().max(300).default(""),
  primaryColor: hex.default("#3B3F8F"),
  accentColor: hex.default("#E8A33D"),
  social: z.object({
    instagram: z.string().optional(), facebook: z.string().optional(),
    x: z.string().optional(), youtube: z.string().optional(), tiktok: z.string().optional(),
  }).default({}),
});

export const SeoSettings = z.object({
  titleTemplate: z.string().max(120).default("%s | {storeName}"),
  /** Home page <title>/description. Empty = derived from storeName + tagline/description. */
  homeTitle: z.string().max(120).default(""),
  homeDescription: z.string().max(320).default(""),
  defaultOgMediaId: z.string().nullable().default(null),
  robotsIndex: z.boolean().default(true),
  twitterHandle: z.string().regex(/^@?[A-Za-z0-9_]{1,15}$/).optional().or(z.literal("")).default(""),
  googleSiteVerification: z.string().max(120).default(""),
  bingSiteVerification: z.string().max(120).default(""),
  facebookDomainVerification: z.string().max(120).default(""),
  /** Extra Disallow paths for robots.txt (one per entry, must start with /). */
  robotsDisallow: z.array(z.string().regex(/^\//).max(200)).max(30).default([]),
  /** Emit JSON-LD (Organization, WebSite, Product, BreadcrumbList, ItemList). */
  jsonLd: z.boolean().default(true),
});

export const LegalSettings = z.object({
  kvkk: z.string().default(""), distanceSales: z.string().default(""),
  returns: z.string().default(""), cookies: z.string().default(""), privacy: z.string().default(""),
});

export const CheckoutSettings = z.object({
  guestCheckout: z.boolean().default(true),
  reservationMinutes: z.number().int().min(5).max(120).default(15),
  safetyStock: z.number().int().min(0).default(0),
  freeShippingThreshold: z.number().int().min(0).nullable().default(null), // minor units
  flatShippingFee: z.number().int().min(0).default(0),                     // minor units
});

/** Public tracking config (IDs only). Secrets (CAPI token, GA4 api_secret) live in integration_configs. */
export const TrackingSettings = z.object({
  ga4MeasurementId: z.string().regex(/^G-[A-Z0-9]+$/).optional().or(z.literal("")).default(""),
  gtmContainerId: z.string().regex(/^GTM-[A-Z0-9]+$/).optional().or(z.literal("")).default(""),
  metaPixelId: z.string().regex(/^\d{5,20}$/).optional().or(z.literal("")).default(""),
  metaTestEventCode: z.string().max(40).optional().default(""),
  consentRequired: z.boolean().default(true),
});

/** Global switch: swaps every external integration for an offline mock. Owner-only. */
export const SystemSettings = z.object({ mockMode: z.boolean().default(false) });

export const NOTIFICATION_EVENTS = ["order_paid", "order_shipped", "order_delivered", "order_cancelled", "order_refunded", "admin_new_order"] as const;
export type NotificationEvent = (typeof NOTIFICATION_EVENTS)[number];
export const NOTIFICATION_CHANNELS = ["sms", "email"] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];
/** Placeholders allowed in templates. Values are HTML-escaped for email, CR/LF-stripped for subjects. */
export const TEMPLATE_VARS = ["orderNumber", "customerName", "total", "trackingNumber", "trackingUrl", "storeName", "orderUrl"] as const;

const Template = z.object({
  subject: z.string().max(200).default(""),   // email only
  body: z.string().max(2000).default(""),     // SMS text / email body (plain text; HTML is generated)
});
const EventChannels = z.object({ sms: z.boolean().default(false), email: z.boolean().default(true) });

export const NotificationSettings = z.object({
  fromName: z.string().max(80).default(""),
  fromEmail: z.string().email().optional().or(z.literal("")).default(""),
  smsSenderId: z.string().max(11).default(""),            // Netgsm msgheader / Twilio alphanumeric sender
  adminEmail: z.string().email().optional().or(z.literal("")).default(""),  // recipient of admin_new_order
  adminPhone: z.string().regex(/^\+[1-9]\d{7,14}$/).optional().or(z.literal("")).default(""),
  /** SMS is only sent to numbers whose calling-code prefix is listed ("+90", "90" or ISO "TR"). Empty list = block all SMS. */
  smsAllowedCountries: z.array(z.string().trim().min(2).max(6)).max(50).default(["+90"]),
  /** Per-recipient daily caps (rolling 24h, all events) to limit SMS/email abuse and cost. 0 = unlimited. */
  smsDailyCapPerPhone: z.number().int().min(0).max(1000).default(3),
  emailDailyCapPerAddress: z.number().int().min(0).max(1000).default(5),
  events: z.object({
    order_paid: EventChannels.default({}), order_shipped: EventChannels.default({}), order_delivered: EventChannels.default({}),
    order_cancelled: EventChannels.default({}), order_refunded: EventChannels.default({}), admin_new_order: EventChannels.default({}),
  }).default({}),
  templates: z.object({ tr: z.record(z.string(), Template).default({}), en: z.record(z.string(), Template).default({}) }).default({}),
});

export const SETTING_GROUPS = {
  general: GeneralSettings, branding: BrandingSettings, seo: SeoSettings,
  legal: LegalSettings, checkout: CheckoutSettings, tracking: TrackingSettings,
  system: SystemSettings, notifications: NotificationSettings,
} as const;
export type SettingGroup = keyof typeof SETTING_GROUPS;
export type SettingsOf<G extends SettingGroup> = z.infer<(typeof SETTING_GROUPS)[G]>;

/** Subset safe to expose to storefront. */
export const PUBLIC_GROUPS: SettingGroup[] = ["general", "branding", "seo", "checkout", "tracking"];

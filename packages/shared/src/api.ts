import { z } from "zod";
import { ConsentState, TrackEvent } from "./events";

/** Shared request/response schemas for docs/api-contract.md. Money = integer minor units. */

export const ApiErrorBody = z.object({ error: z.object({ code: z.string(), message: z.string(), details: z.unknown().optional() }) });
export type ApiErrorBody = z.infer<typeof ApiErrorBody>;
export interface Paginated<T> { items: T[]; total: number; page: number; pageSize: number }

// ---------- auth ----------
export const SetupBody = z.object({
  setupToken: z.string().min(1), email: z.string().email().max(254), name: z.string().min(1).max(100), password: z.string().min(12).max(256),
});
export const LoginBody = z.object({
  email: z.string().email().max(254), password: z.string().min(1).max(256), totp: z.string().regex(/^\d{6}$/).optional(), turnstileToken: z.string().optional(),
});
export const PasswordChangeBody = z.object({ current: z.string().min(1).max(256), next: z.string().min(12).max(256) });
export const MfaEnableBody = z.object({ code: z.string().regex(/^\d{6}$/) });
export const MfaDisableBody = z.object({ password: z.string().min(1), code: z.string().regex(/^\d{6}$/) });
export const UserCreateBody = z.object({
  email: z.string().email().max(254), name: z.string().min(1).max(100), password: z.string().min(12).max(256), role: z.enum(["owner", "admin", "staff"]).default("admin"),
});
export const UserPatchBody = z.object({
  name: z.string().min(1).max(100).optional(), role: z.enum(["owner", "admin", "staff"]).optional(),
  disabled: z.boolean().optional(), password: z.string().min(12).max(256).optional(),
});
export interface AdminPublic { id: string; email: string; name: string; role: "owner" | "admin" | "staff"; totpEnabled: boolean; mfaEnrollmentRequired?: boolean }
export interface MeResponse { admin: AdminPublic; csrfToken: string }
export interface LoginResponse { admin?: AdminPublic; csrfToken?: string; mfaRequired?: true }

// ---------- integrations ----------
export const IntegrationPutBody = z.object({
  enabled: z.boolean(),
  config: z.record(z.unknown()).default({}),
  secrets: z.record(z.string().nullable()).optional(), // omitted/"" = keep, null = clear
});
export type IntegrationPutBody = z.infer<typeof IntegrationPutBody>;

// ---------- media ----------
export const MEDIA_KINDS = ["logo", "logo_dark", "favicon", "banner", "og", "product"] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];
export interface MediaUploadResponse { id: string; url: string; mime: string; size: number }

// ---------- catalog ----------
const minor = z.number().int().min(0);
/** Optional text field where "" means "unset". */
const optText = (max: number) => z.string().max(max).nullable().optional().transform((v) => (v == null || v.trim() === "" ? null : v.trim()));
/** Absolute https URL or empty (= unset). */
const httpsUrl = z.string().max(1000).nullable().optional().refine((v) => {
  if (v == null || v.trim() === "") return true;
  try { return new URL(v.trim()).protocol === "https:"; } catch { return false; }
}, { message: "must be an absolute https:// URL" }).transform((v) => (v == null || v.trim() === "" ? null : v.trim()));
export const SeoTitle = optText(70);
export const SeoDescription = optText(320);
export const CategoryInput = z.object({
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(100), parentId: z.string().nullable().optional(),
  nameTr: z.string().min(1).max(200), nameEn: z.string().max(200).nullable().optional(),
  descriptionTr: z.string().max(2000).nullable().optional(), descriptionEn: z.string().max(2000).nullable().optional(),
  position: z.number().int().default(0), active: z.boolean().default(true),
  seoTitle: SeoTitle, seoDescription: SeoDescription, seoOgImageUrl: httpsUrl, seoNoindex: z.boolean().default(false),
});
export const VariantInput = z.object({
  id: z.string().optional(), sku: z.string().min(1).max(100), barcode: z.string().max(64).nullable().optional(),
  title: z.string().max(200).nullable().optional(), options: z.record(z.string()).nullable().optional(),
  weightGrams: z.number().int().min(0).nullable().optional(), position: z.number().int().default(0), active: z.boolean().default(true),
  prices: z.object({ website: minor, trendyol: minor.nullable().optional() }),
  compareAtPrice: minor.nullable().optional(),
  stock: z.object({ total: minor, safetyStock: minor.optional() }).optional(),
});
export const ImageInput = z.object({
  id: z.string().optional(), mediaId: z.string().nullable().optional(),
  url: z.string().url().max(1000).nullable().optional(), alt: z.string().max(300).nullable().optional(), position: z.number().int().default(0),
}).refine((i) => !!(i.mediaId || i.url), { message: "mediaId or url required" });
export const ProductInput = z.object({
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120), categoryId: z.string().nullable().optional(),
  nameTr: z.string().min(1).max(300), nameEn: z.string().max(300).nullable().optional(),
  descriptionTr: z.string().max(20000).nullable().optional(), descriptionEn: z.string().max(20000).nullable().optional(),
  brand: z.string().max(100).nullable().optional(), status: z.enum(["draft", "active", "archived"]).default("draft"),
  seoTitle: SeoTitle, seoDescription: SeoDescription,
  seoOgMediaId: z.string().max(100).nullable().optional().transform((v) => v || null), seoOgImageUrl: httpsUrl, seoNoindex: z.boolean().default(false), seoCanonical: httpsUrl,
  taxRate: z.number().int().min(0).max(100).nullable().optional(),
  variants: z.array(VariantInput).min(1).max(200), images: z.array(ImageInput).max(30).default([]),
});
export type ProductInput = z.infer<typeof ProductInput>;
export const InventoryAdjustBody = z.object({ delta: z.number().int().refine((n) => n !== 0, "delta must be non-zero"), reason: z.string().min(1).max(200) });
export const CouponInput = z.object({
  code: z.string().min(2).max(40).regex(/^[A-Za-z0-9_-]+$/), type: z.enum(["percent", "fixed"]), value: z.number().int().min(1),
  minSubtotal: minor.default(0), maxUses: z.number().int().min(1).nullable().optional(), maxUsesPerCustomer: z.number().int().min(1).nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional(), active: z.boolean().default(true),
}).refine((c) => c.type !== "percent" || c.value <= 100, { message: "percent must be <= 100", path: ["value"] });

// ---------- orders ----------
export const OrderStatusBody = z.object({ status: z.enum(["pending", "awaiting_payment", "paid", "fulfilling", "shipped", "delivered", "cancelled", "refunded"]) });
export const RefundBody = z.object({ amount: z.number().int().min(1), reason: z.string().max(300).optional() });
export const ShipmentBody = z.object({ serviceId: z.string().min(1) });

// ---------- storefront ----------
export const ShippingAddress = z.object({
  name: z.string().min(1).max(100), surname: z.string().max(100).optional(), phone: z.string().min(5).max(30),
  line1: z.string().min(3).max(300), line2: z.string().max(300).optional(), city: z.string().min(1).max(100),
  district: z.string().max(100).optional(), zip: z.string().max(20).optional(), country: z.string().length(2).default("TR"),
  identityNumber: z.string().max(20).optional(), taxId: z.string().max(30).optional(), taxOffice: z.string().max(100).optional(),
  isCompany: z.boolean().optional(),
});
export type ShippingAddress = z.infer<typeof ShippingAddress>;
export const Attribution = z.object({
  utm_source: z.string().max(200).optional(), utm_medium: z.string().max(200).optional(), utm_campaign: z.string().max(200).optional(),
  utm_term: z.string().max(200).optional(), utm_content: z.string().max(200).optional(),
  fbc: z.string().max(300).optional(), fbp: z.string().max(300).optional(), fbclid: z.string().max(500).optional(),
  gclid: z.string().max(500).optional(), gaClientId: z.string().max(100).optional(), visitorId: z.string().max(100).optional(),
}).partial();
export type Attribution = z.infer<typeof Attribution>;
export const CartItemBody = z.object({ variantId: z.string().min(1), quantity: z.number().int().min(0).max(99) });
export const CartCouponBody = z.object({ code: z.string().max(40).nullable() });
export const CheckoutBody = z.object({
  cartId: z.string().min(1), email: z.string().email().max(254), shippingAddress: ShippingAddress, billingAddress: ShippingAddress.optional(),
  consent: z.object({ analytics: z.boolean().default(false), marketing: z.boolean().default(false) }),
  attribution: Attribution.optional(), turnstileToken: z.string().optional(), acceptedTerms: z.literal(true),
});
export type CheckoutBody = z.infer<typeof CheckoutBody>;
export interface CheckoutResponse { orderNumber: string; trackingToken: string; payment: { redirectUrl?: string; htmlContent?: string } }
export const ConsentBody = z.object({ visitorId: z.string().min(1).max(100), analytics: z.boolean(), marketing: z.boolean(), policyVersion: z.string().max(40).optional() });
export const TrackBody = z.object({ event: TrackEvent, consent: ConsentState.partial().optional(), attribution: Attribution.optional() });
export type TrackBody = z.infer<typeof TrackBody>;

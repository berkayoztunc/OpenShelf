import type { z } from "zod";
import type { BrandingSettings, GeneralSettings, CheckoutSettings, SeoSettings, TrackingSettings, OrderStatus } from "@openshelf/shared";

/** Response shapes for the frozen API contract (docs/api-contract.md). Fields marked "assumed" go beyond the doc. */

export type Locale = "tr" | "en";

export interface StoreConfig {
  general: z.infer<typeof GeneralSettings>;
  branding: z.infer<typeof BrandingSettings> & {
    logoUrl?: string | null;
    logoDarkUrl?: string | null;
    faviconUrl?: string | null;
    bannerUrls?: string[];
  };
  seo: z.infer<typeof SeoSettings> & { defaultOgUrl?: string | null }; // defaultOgUrl assumed
  checkout: z.infer<typeof CheckoutSettings>;
  tracking: z.infer<typeof TrackingSettings>;
  /** "titles only": either a string title or `{ title }` per legal key. Empty = page not available. */
  legal: Partial<Record<LegalKey, string | { title?: string }>>;
  locales?: Locale[];
  /** True while the API runs in mock mode (fake payments, nothing is sent). */
  mockMode?: boolean;
}

export const LEGAL_KEYS = ["distanceSales", "kvkk", "privacy", "returns", "cookies"] as const;
export type LegalKey = (typeof LEGAL_KEYS)[number];

/** Server-resolved SEO metadata (title already includes the site title template). */
export interface ResolvedSeo { title?: string; description?: string; image?: string | null; canonical?: string; noindex?: boolean }

export interface Category { id: string; slug: string; name: string; parentId?: string | null; imageUrl?: string | null; seo?: ResolvedSeo }

export interface ProductImage { id?: string; url: string; alt?: string | null }

export interface Variant {
  id: string;
  sku?: string;
  title: string;
  options?: Record<string, string>;
  price: number;            // minor units
  compareAtPrice?: number | null; // assumed
  available: number;        // total - reserved - safety
}

export interface ProductSummary {
  id: string;
  slug: string;
  title: string;
  images: ProductImage[];
  /** lowest variant price, minor units (derived from variants if absent) */
  price?: number;
  compareAtPrice?: number | null;
  currency?: string;
  category?: { slug: string; name: string } | null;
  categoryId?: string;
  available?: number; // total available over variants (assumed)
  variants?: Variant[];
  seo?: ResolvedSeo;
}

export interface ProductDetail extends ProductSummary {
  description?: string;
  variants: Variant[];
}

export interface Paged<T> { items: T[]; total: number; page: number; pageSize: number; seo?: ResolvedSeo }

export interface CartItem {
  variantId: string;
  quantity: number;
  title: string;          // assumed: product title
  variantTitle?: string;
  unitPrice: number;      // minor units
  imageUrl?: string | null;
  productSlug?: string;
  available?: number;
  category?: string;
}
export interface Cart {
  id: string;
  items: CartItem[];
  subtotal?: number;
  discount?: number;
  shipping?: number;
  total?: number;
  currency?: string;
  couponCode?: string | null;
}

export interface Address {
  fullName: string;
  phone: string;
  line1: string;
  line2?: string;
  city: string;
  district?: string;
  postalCode?: string;
  country: string;
}

export interface Attribution {
  utm_source?: string; utm_medium?: string; utm_campaign?: string; utm_term?: string; utm_content?: string;
  fbclid?: string; gclid?: string; fbc?: string; fbp?: string; gaClientId?: string; visitorId?: string;
}

export interface CheckoutRequest {
  cartId: string;
  email: string;
  shippingAddress: Address;
  billingAddress?: Address;
  consent: { analytics: boolean; marketing: boolean };
  attribution?: Attribution;
  turnstileToken?: string;
  acceptedTerms: true;
}
export interface CheckoutResponse {
  orderNumber: string;
  trackingToken: string;
  payment: { redirectUrl?: string; htmlContent?: string };
}

export interface OrderItemView {
  variantId: string; title: string; variantTitle?: string; quantity: number; unitPrice: number; imageUrl?: string | null; category?: string;
}
export interface OrderView {
  orderNumber: string;
  status: OrderStatus;
  currency: string;
  items: OrderItemView[];
  subtotal?: number; shipping?: number; discount?: number; tax?: number; total: number;
  createdAt?: string;
  shippingAddress?: Partial<Address>;
  shipment?: { carrier?: string; trackingNumber?: string; trackingUrl?: string; status?: string } | null;
  /** ASSUMED beyond contract: UUID the server uses for CAPI/MP purchase; browser reuses for dedup. */
  purchaseEventId?: string | null;
}

export interface LegalPage { key: string; title: string; content: string }

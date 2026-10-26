import type { OrderStatus, OrderSource } from "@openshelf/shared";

export interface Paged<T> { items: T[]; total: number; page: number; pageSize: number }
export interface Admin { id: string; email: string; name: string; role: "owner" | "admin" | "staff"; totpEnabled: boolean; mfaEnrollmentRequired?: boolean }

export interface Category {
  id: string; name: string; slug: string; parentId?: string | null; position?: number;
  seoTitle?: string; seoDescription?: string; seoOgImageUrl?: string; seoNoindex?: boolean;
}
export interface Variant {
  id?: string; sku: string; barcode?: string | null; title: string;
  options?: Record<string, string>;
  prices: { website: number; trendyol?: number | null };
  stock?: { total: number; reserved: number };
}
export interface ProductImage { id?: string; url?: string; mediaId?: string; alt?: string; position?: number }
export interface Product {
  id: string; name: string; slug: string; description?: string;
  status: "draft" | "active" | "archived"; categoryId?: string | null;
  variants: Variant[]; images: ProductImage[];
  seoTitle?: string; seoDescription?: string; seoOgMediaId?: string | null; seoOgImageUrl?: string; seoNoindex?: boolean; seoCanonical?: string;
}
export interface OrderRow { id: string; number: string; status: OrderStatus; source: OrderSource; total: number; currency: string; email?: string; customerName?: string; createdAt: string; isMock?: boolean }
export interface OrderDetail extends OrderRow {
  items: { id: string; title: string; sku?: string; quantity: number; unitPrice: number; total: number }[];
  payments: { id: string; provider: string; status: string; amount: number; createdAt?: string; isMock?: boolean }[];
  shipments: { id: string; carrier?: string; trackingNumber?: string; status: string; labelUrl?: string; createdAt?: string }[];
  invoices: { id: string; type: string; number?: string; status: string; url?: string; createdAt?: string }[];
  events: { id: string; type: string; detail?: string; createdAt: string }[];
  shippingAddress?: Record<string, string>;
}
export interface Customer { id: string; email: string; name?: string; phone?: string; ordersCount?: number; totalSpent?: number; createdAt?: string; anonymizedAt?: string | null }
export interface Coupon { id: string; code: string; type: "percent" | "fixed"; value: number; minSubtotal?: number | null; maxUses?: number | null; usedCount?: number; expiresAt?: string | null; active: boolean }

export interface FieldDef {
  key: string; label: string; type?: "text" | "url" | "number" | "boolean" | "select" | "password";
  required?: boolean; placeholder?: string; help?: string; options?: (string | { value: string; label: string })[];
}
export interface Integration {
  provider: string; name: string; description?: string; enabled: boolean;
  configPublic: Record<string, unknown>;
  secretsSet: Record<string, boolean>; secretsMasked: Record<string, string>;
  health: { ok: boolean; detail?: string; at?: string } | null;
  publicFields: FieldDef[]; secretFields: FieldDef[];
  docsUrl?: string; mock?: boolean; available?: boolean;
}
export interface MarketingEvent { id: string; eventName: string; eventId: string; destination?: string; status?: string; createdAt?: string }
export interface IntegrationEvent { id: string; provider: string; kind?: string; status?: string; message?: string; createdAt?: string }
export interface OutboxJob { id: string; kind: string; status: string; attempts: number; lastError?: string | null; nextRunAt?: string | null; createdAt?: string }
export interface AuditLog { id: string; actor?: string; action: string; entity?: string; entityId?: string; createdAt: string; detail?: unknown }
export interface AdminUser { id: string; email: string; name: string; role: "owner" | "admin" | "staff"; totpEnabled?: boolean; disabled?: boolean; createdAt?: string }

/**
 * Adapters between the API wire shapes (workers/api/src/routes/*, packages/shared/src/api.ts) and the admin UI types.
 * The API is the source of truth: names are `nameTr`/`descriptionTr`, coupons are keyed by `code`, timestamps are ISO strings
 * (D1 drizzle `timestamp` mode) except raw-integer columns (outbox next_run_at, unix seconds).
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { AuditLog, Category, Coupon, Customer, IntegrationEvent, MarketingEvent, OrderDetail, OrderRow, OutboxJob, Product } from "./types";

type W = any;
const iso = (v: unknown): string | undefined => (v == null ? undefined : typeof v === "number" ? new Date(v < 1e12 ? v * 1000 : v).toISOString() : String(v));

export const categoryFromApi = (c: W): Category => ({
  id: c.id, slug: c.slug, name: c.nameTr, parentId: c.parentId ?? null, position: c.position,
  seoTitle: c.seoTitle ?? "", seoDescription: c.seoDescription ?? "", seoOgImageUrl: c.seoOgImageUrl ?? "", seoNoindex: c.seoNoindex === true,
});
export const categoryToApi = (c: Partial<Category>) => ({
  slug: c.slug, nameTr: c.name, parentId: c.parentId ?? null, position: c.position ?? 0, active: true,
  seoTitle: c.seoTitle?.trim() || null, seoDescription: c.seoDescription?.trim() || null, seoOgImageUrl: c.seoOgImageUrl?.trim() || null, seoNoindex: !!c.seoNoindex,
});

export const productFromApi = (p: W): Product => ({
  id: p.id, name: p.nameTr, slug: p.slug, description: p.descriptionTr ?? undefined, status: p.status, categoryId: p.categoryId ?? null,
  variants: (p.variants ?? []).filter((v: W) => v.active !== false).map((v: W) => ({
    id: v.id, sku: v.sku, barcode: v.barcode ?? null, title: v.title ?? "", options: v.options ?? undefined,
    prices: { website: v.prices?.website ?? 0, trendyol: v.prices?.trendyol ?? null }, stock: v.stock ? { total: v.stock.total, reserved: v.stock.reserved } : undefined,
  })),
  images: (p.images ?? []).map((i: W) => ({ id: i.id, url: i.url ?? undefined, mediaId: i.mediaId ?? undefined, alt: i.alt ?? undefined, position: i.position })),
  seoTitle: p.seoTitle ?? "", seoDescription: p.seoDescription ?? "", seoOgMediaId: p.seoOgMediaId ?? null, seoOgImageUrl: p.seoOgImageUrl ?? "",
  seoNoindex: p.seoNoindex === true, seoCanonical: p.seoCanonical ?? "",
});
/** Body for POST/PUT /api/admin/products (ProductInput). Media-backed images send mediaId only (url must be absolute). */
export const productToApi = (f: { name: string; slug: string; description: string; status: string; categoryId: string | null; variants: W[]; images: W[]; seoTitle?: string; seoDescription?: string; seoOgMediaId?: string | null; seoOgImageUrl?: string; seoNoindex?: boolean; seoCanonical?: string }) => ({
  seoTitle: f.seoTitle?.trim() || null, seoDescription: f.seoDescription?.trim() || null, seoOgMediaId: f.seoOgMediaId || null,
  seoOgImageUrl: f.seoOgImageUrl?.trim() || null, seoNoindex: !!f.seoNoindex, seoCanonical: f.seoCanonical?.trim() || "",
  slug: f.slug, nameTr: f.name, descriptionTr: f.description || null, status: f.status, categoryId: f.categoryId,
  variants: f.variants.map((v: W, i: number) => ({ ...v, position: i })),
  images: f.images.map((im: W, i: number) => (im.mediaId ? { ...(im.id ? { id: im.id } : {}), mediaId: im.mediaId, alt: im.alt || null, position: i } : { ...(im.id ? { id: im.id } : {}), url: im.url, alt: im.alt || null, position: i })),
});

export const couponFromApi = (c: W): Coupon => ({ id: c.code, code: c.code, type: c.type, value: c.value, minSubtotal: c.minSubtotal ?? null, maxUses: c.maxUses ?? null, usedCount: c.used ?? 0, expiresAt: iso(c.expiresAt) ?? null, active: c.active });

export const orderRowFromApi = (o: W): OrderRow => ({ id: o.id, number: o.number, status: o.status, source: o.source, total: o.total, currency: o.currency, email: o.email, createdAt: iso(o.createdAt) ?? "", isMock: o.isMock === true });
export const orderDetailFromApi = (o: W): OrderDetail => ({
  ...orderRowFromApi(o),
  customerName: [o.shippingAddress?.name, o.shippingAddress?.surname].filter(Boolean).join(" ") || undefined,
  items: (o.items ?? []).map((i: W) => ({ id: i.id, title: i.name, sku: i.sku, quantity: i.quantity, unitPrice: i.unitPrice, total: i.unitPrice * i.quantity })),
  payments: (o.payments ?? []).map((p: W) => ({ id: p.id, provider: p.provider, status: p.status, amount: p.amount, createdAt: iso(p.createdAt), isMock: p.isMock === true })),
  shipments: (o.shipments ?? []).map((s: W) => ({ id: s.id, carrier: s.carrier ?? undefined, trackingNumber: s.trackingNumber ?? undefined, status: s.status, labelUrl: s.labelUrl ?? undefined, createdAt: iso(s.createdAt) })),
  invoices: (o.invoices ?? []).map((i: W) => ({ id: i.id, type: i.type, number: i.number ?? undefined, status: i.status, url: i.pdfUrl ?? undefined, createdAt: iso(i.createdAt) })),
  events: (o.events ?? []).map((e: W, n: number) => ({ id: String(n), type: e.type, detail: e.detail == null ? undefined : typeof e.detail === "string" ? e.detail : JSON.stringify(e.detail).slice(0, 200), createdAt: iso(e.at) ?? "" })),
  shippingAddress: o.shippingAddress,
});

export const customerFromApi = (c: W): Customer => ({
  id: c.id, email: c.email, name: [c.name, c.surname].filter(Boolean).join(" ") || undefined, phone: c.phone ?? undefined, createdAt: iso(c.createdAt), anonymizedAt: iso(c.anonymizedAt) ?? null,
});

export const integrationEventFromApi = (e: W): IntegrationEvent => ({ id: String(e.id), provider: e.provider, kind: e.level, status: e.level, message: e.message, createdAt: iso(e.at) });
export const marketingEventFromApi = (e: W): MarketingEvent => ({ id: String(e.id), eventName: e.name, eventId: e.eventId, destination: e.destination, status: e.status, createdAt: iso(e.at) });
export const outboxFromApi = (j: W): OutboxJob => ({ id: j.id, kind: j.kind, status: j.status, attempts: j.attempts, lastError: j.lastError ?? null, nextRunAt: iso(j.nextRunAt) ?? null, createdAt: iso(j.createdAt) });
export const auditFromApi = (l: W): AuditLog => ({ id: String(l.id), actor: l.adminId ?? undefined, action: l.action, entity: l.entity ?? undefined, entityId: l.entityId ?? undefined, createdAt: iso(l.at) ?? "", detail: l.meta });

export const mapPaged = <A, B>(r: { items: A[]; total: number; page: number; pageSize: number }, fn: (a: A) => B) => ({ ...r, items: r.items.map(fn) });
export const mapList = <A, B>(r: A[] | { items: A[] }, fn: (a: A) => B): B[] => (Array.isArray(r) ? r : r.items).map(fn);

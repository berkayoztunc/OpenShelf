import type {
  Address, Cart, Category, ProductImage, Variant, CheckoutRequest, CheckoutResponse, LegalPage, OrderView, Paged, ProductDetail, ProductSummary, StoreConfig, Locale,
} from "./types";

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) { super(message); }
}

async function request<T>(path: string, init: RequestInit & { json?: unknown; cartId?: string } = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.json !== undefined) headers.set("Content-Type", "application/json");
  if (init.cartId) headers.set("X-Cart-Id", init.cartId);
  const res = await fetch(path, { ...init, headers, body: init.json !== undefined ? JSON.stringify(init.json) : init.body, credentials: "same-origin" });
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let data: unknown = undefined;
  try { data = text ? JSON.parse(text) : undefined; } catch { /* non-JSON */ }
  if (!res.ok) {
    const err = (data as { error?: { code?: string; message?: string; details?: unknown } } | undefined)?.error;
    throw new ApiError(res.status, err?.code ?? "http_error", err?.message ?? res.statusText, err?.details);
  }
  return data as T;
}

const qs = (o: Record<string, string | number | undefined | null>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
};

export interface ProductQuery { category?: string; q?: string; sort?: string; page?: number; pageSize?: number }

// ---- adapters: API wire shapes (workers/api/src/routes/store.ts) -> UI types ----
/* eslint-disable @typescript-eslint/no-explicit-any */
type Wire = any;
const variantOf = (v: Wire): Variant => ({
  id: v.id, sku: v.sku, title: v.title ?? (v.options ? Object.values(v.options).join(" / ") : ""), options: v.options ?? undefined,
  price: v.price, compareAtPrice: v.compareAtPrice ?? null, available: v.available,
});
const productOf = (p: Wire): ProductSummary & { description?: string } => {
  const variants: Variant[] = (p.variants ?? []).map(variantOf);
  const images: ProductImage[] = p.images?.length ? p.images.map((i: Wire) => ({ id: i.id, url: i.url, alt: i.alt })) : p.image ? [{ url: p.image }] : [];
  return {
    id: p.id, slug: p.slug, title: p.name ?? p.nameTr, images, ...(p.categoryId && { categoryId: p.categoryId as string }), price: p.priceFrom ?? undefined, compareAtPrice: p.compareAtPrice ?? null,
    available: variants.reduce((n, v) => n + v.available, 0), variants, ...(p.description != null && { description: p.description }), ...(p.seo && { seo: p.seo }),
  };
};
const cartOf = (c: Wire): Cart => ({
  id: c.id, currency: c.currency, subtotal: c.subtotal, discount: c.discount, shipping: c.shipping, total: c.total, couponCode: c.couponCode ?? null,
  items: (c.lines ?? []).map((l: Wire) => ({
    variantId: l.variantId, quantity: l.quantity, title: l.name, variantTitle: l.variantTitle ?? undefined, unitPrice: l.unitPrice,
    imageUrl: l.imageUrl ?? null, productSlug: l.slug, available: l.available,
  })),
});
const orderOf = (o: Wire): OrderView => ({
  orderNumber: o.number, status: o.status, currency: o.currency, subtotal: o.subtotal, shipping: o.shippingTotal, discount: o.discountTotal, tax: o.taxTotal, total: o.total,
  createdAt: o.createdAt, purchaseEventId: o.purchaseEventId ?? null,
  items: (o.items ?? []).map((i: Wire) => ({ variantId: i.variantId, title: i.name, quantity: i.quantity, unitPrice: i.unitPrice })),
  shippingAddress: o.shippingAddress ? addressFromWire(o.shippingAddress) : undefined,
  shipment: o.shipments?.[0] ? { carrier: o.shipments[0].carrier ?? undefined, trackingNumber: o.shipments[0].trackingNumber ?? undefined, status: o.shipments[0].status } : null,
});
const addressFromWire = (a: Wire): Partial<Address> => ({
  fullName: [a.name, a.surname].filter(Boolean).join(" "), phone: a.phone, line1: a.line1, line2: a.line2, city: a.city, district: a.district, postalCode: a.zip, country: a.country,
});
const addressToWire = (a: Address) => {
  const o: Record<string, unknown> = { name: a.fullName.trim(), phone: a.phone.trim(), line1: a.line1.trim(), city: a.city.trim(), country: a.country };
  if (a.line2?.trim()) o.line2 = a.line2.trim();
  if (a.district?.trim()) o.district = a.district.trim();
  if (a.postalCode?.trim()) o.zip = a.postalCode.trim();
  return o;
};

export const api = {
  config: () => request<Wire>("/api/store/config").then((c): StoreConfig => ({ ...c, locales: c.locales?.available ?? c.locales })),
  categories: () => request<{ items: Wire[] }>("/api/store/categories").then((r) =>
    r.items.map((c): Category => ({ id: c.id, slug: c.slug, name: c.nameTr, parentId: c.parentId ?? null, ...(c.seo && { seo: c.seo }) }))),
  products: (q: ProductQuery) => request<Paged<Wire>>(`/api/store/products${qs({ ...q })}`).then((r): Paged<ProductSummary> => ({ ...r, items: r.items.map(productOf) })),
  product: (slug: string) => request<Wire>(`/api/store/products/${encodeURIComponent(slug)}`).then((p) => productOf(p) as ProductDetail),
  legal: (key: string, lang: Locale) => request<{ key: string; content: string }>(`/api/store/legal/${encodeURIComponent(key)}${qs({ lang })}`).then((r): LegalPage => ({ key: r.key, title: "", content: r.content })),
  createCart: () => request<{ id: string }>("/api/store/cart", { method: "POST", json: {} }),
  getCart: (id: string) => request<Wire>(`/api/store/cart/${id}`, { cartId: id }).then(cartOf),
  setItem: (id: string, variantId: string, quantity: number) =>
    request<Wire>(`/api/store/cart/${id}/items`, { method: "PUT", json: { variantId, quantity }, cartId: id }).then(cartOf),
  applyCoupon: (id: string, code: string) =>
    request<Wire>(`/api/store/cart/${id}/coupon`, { method: "POST", json: { code }, cartId: id }).then(cartOf),
  checkout: (body: CheckoutRequest) => request<CheckoutResponse>("/api/store/checkout", {
    method: "POST", cartId: body.cartId,
    json: { ...body, shippingAddress: addressToWire(body.shippingAddress), ...(body.billingAddress && { billingAddress: addressToWire(body.billingAddress) }) },
  }),
  order: (number: string, token: string) => request<Wire>(`/api/store/orders/${encodeURIComponent(number)}${qs({ t: token })}`).then(orderOf),
  postConsent: (body: { visitorId: string; analytics: boolean; marketing: boolean; policyVersion: string }) =>
    request<void>("/api/store/consent", { method: "POST", json: body, keepalive: true }),
  postTrack: (body: unknown) => request<void>("/api/store/track", { method: "POST", json: body, keepalive: true }),
};

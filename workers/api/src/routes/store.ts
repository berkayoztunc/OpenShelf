import { Hono } from "hono";
import type { Context } from "hono";
import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { cartItems, carts, categories, coupons, customerConsents, customers, marketingEvents, orderItems, orders, payments, products, productVariants, shipments, utmAttributions } from "@openshelf/db";
import { attachReservations, CouponError, evaluateCoupon, InsufficientStockError, InvalidTransitionError, priceItems, releaseReservationIds, reserveStock, transitionOrder, type PricedCart } from "@openshelf/core";
import type { ServerEventSink } from "@openshelf/integration-sdk";
import { CartCouponBody, CartItemBody, CheckoutBody, ConsentBody, EVENT_NAMES, META_EVENT_MAP, TrackBody } from "@openshelf/shared";
import type { AppEnv, Db } from "../env";
import { ApiError, body, likeEscape, notFound, paged, paging } from "../lib/http";
import { enforceRateLimit, verifyTurnstile } from "../middleware/security";
import { getAllSettings, getSettings, publicConfig } from "../lib/settings";
import { getAdapter, isMockModeFresh, logIntegrationEvent } from "../lib/integrations";
import { activePaymentProvider } from "../lib/payments";
import { purchaseEventId } from "../lib/eventId";
import { hydrateProducts, availableOf } from "../lib/catalog";
import { randomToken, timingSafeEqual } from "../lib/crypto";
import { SINK_PROVIDER_IDS } from "../integrations/registry";
import { log } from "../lib/log";
import { categorySeo, makeCx, productSeo, type SeoCx } from "../lib/seo";

export const store = new Hono<AppEnv>();

const cacheable = (c: Context<AppEnv>, seconds = 60) => c.header("Cache-Control", `public, max-age=${seconds}`);

store.get("/config", async (c) => { cacheable(c, 30); return c.json(await publicConfig(c.get("db"))); });
store.get("/legal/:key", async (c) => {
  const s = await getSettings(c.get("db"), "legal");
  const v = (s as Record<string, string>)[c.req.param("key")];
  if (!v?.trim()) throw notFound("Legal page");
  cacheable(c, 60);
  return c.json({ key: c.req.param("key"), content: v });
});

store.get("/categories", async (c) => {
  const rows = await c.get("db").select().from(categories).where(eq(categories.active, true)).orderBy(asc(categories.position), asc(categories.nameTr));
  cacheable(c, 60);
  const cx = await makeCx(c.get("db"), c.env.STOREFRONT_ORIGIN);
  return c.json({ items: rows.map((r) => ({ ...r, seo: categorySeo(cx, r) })) });
});

// ---------- products ----------
const minPriceSql = sql`(SELECT MIN(cp.price) FROM channel_prices cp JOIN product_variants v ON v.id = cp.variant_id WHERE v.product_id = products.id AND v.active = 1 AND cp.channel = 'website')`;

async function localeOf(c: Context<AppEnv>) {
  const q = c.req.query("locale");
  return q === "en" || q === "tr" ? q : (await getSettings(c.get("db"), "general")).defaultLocale;
}
function shape(p: Awaited<ReturnType<typeof hydrateProducts>>[number], locale: "tr" | "en", detail: boolean, cx: SeoCx) {
  const vs = p.variants.filter((v) => v.active && v.prices.website != null).map((v) => ({
    id: v.id, sku: v.sku, title: v.title, options: v.options, price: v.prices.website!, compareAtPrice: v.compareAtPrice, available: availableOf(v.stock),
  }));
  const prices = vs.map((v) => v.price);
  const cheapest = [...vs].sort((a, b) => a.price - b.price)[0];
  const pick = (tr: string | null, en: string | null) => (locale === "en" && en ? en : tr);
  return {
    id: p.id, slug: p.slug, name: pick(p.nameTr, p.nameEn), nameTr: p.nameTr, nameEn: p.nameEn, brand: p.brand, categoryId: p.categoryId,
    image: p.images[0]?.url ?? null, priceFrom: prices.length ? Math.min(...prices) : null, priceTo: prices.length ? Math.max(...prices) : null,
    compareAtPrice: cheapest?.compareAtPrice ?? null, inStock: vs.some((v) => v.available > 0), variants: vs, seo: productSeo(cx, p),
    ...(detail ? { description: pick(p.descriptionTr, p.descriptionEn), images: p.images, seoTitle: p.seoTitle, seoDescription: p.seoDescription, taxRate: p.taxRate } : {}),
  };
}

store.get("/products", async (c) => {
  const db = c.get("db"); const p = paging(c, 24, 60); const locale = await localeOf(c); const cx = await makeCx(db, c.env.STOREFRONT_ORIGIN, locale);
  const conds = [eq(products.status, "active")];
  const cat = c.req.query("category");
  if (cat) {
    const [cr] = await db.select({ id: categories.id }).from(categories).where(eq(categories.slug, cat)).limit(1);
    if (!cr) return c.json(paged([], 0, p));
    const kids = await db.select({ id: categories.id }).from(categories).where(eq(categories.parentId, cr.id));
    conds.push(inArray(products.categoryId, [cr.id, ...kids.map((k) => k.id)]));
  }
  const q = c.req.query("q")?.trim();
  if (q) { const l = `%${likeEscape(q.slice(0, 80))}%`; conds.push(sql`(${products.nameTr} LIKE ${l} ESCAPE '\\' OR ${products.nameEn} LIKE ${l} ESCAPE '\\' OR ${products.brand} LIKE ${l} ESCAPE '\\')`); }
  const sort = c.req.query("sort");
  const order = sort === "price_asc" ? sql`${minPriceSql} ASC` : sort === "price_desc" ? sql`${minPriceSql} DESC` : sort === "name" ? asc(products.nameTr) : desc(products.createdAt);
  const where = and(...conds);
  const rows = await db.select().from(products).where(where).orderBy(order).limit(p.pageSize).offset(p.offset);
  const [t] = await db.select({ n: sql<number>`count(*)` }).from(products).where(where);
  cacheable(c, 30);
  return c.json(paged((await hydrateProducts(db, rows)).map((x) => shape(x, locale, false, cx)), t?.n ?? 0, p));
});
store.get("/products/:slug", async (c) => {
  const db = c.get("db");
  const rows = await db.select().from(products).where(and(eq(products.slug, c.req.param("slug")), eq(products.status, "active"))).limit(1);
  if (!rows.length) throw notFound("Product");
  cacheable(c, 15);
  const locale = await localeOf(c);
  return c.json(shape((await hydrateProducts(db, rows))[0]!, locale, true, await makeCx(db, c.env.STOREFRONT_ORIGIN, locale)));
});
store.get("/search", async (c) => {
  await enforceRateLimit(c, "search", 60, 60);
  const q = c.req.query("q")?.trim();
  if (!q || q.length < 2) return c.json({ items: [] });
  const db = c.get("db"); const l = `%${likeEscape(q.slice(0, 80))}%`;
  const rows = await db.select().from(products).where(and(eq(products.status, "active"), sql`(${products.nameTr} LIKE ${l} ESCAPE '\\' OR ${products.nameEn} LIKE ${l} ESCAPE '\\' OR ${products.brand} LIKE ${l} ESCAPE '\\' OR ${products.id} IN (SELECT product_id FROM product_variants WHERE sku LIKE ${l} ESCAPE '\\' OR barcode = ${q}))`)).limit(20);
  const locale = await localeOf(c); const cx = await makeCx(db, c.env.STOREFRONT_ORIGIN, locale);
  return c.json({ items: (await hydrateProducts(db, rows)).map((x) => shape(x, locale, false, cx)) });
});

// ---------- cart ----------
async function pricedCart(c: Context<AppEnv>, cartId: string): Promise<{ cart: typeof carts.$inferSelect; priced: PricedCart }> {
  const db = c.get("db");
  const [cart] = await db.select().from(carts).where(eq(carts.id, cartId)).limit(1);
  if (!cart) throw notFound("Cart");
  const items = await db.select().from(cartItems).where(eq(cartItems.cartId, cartId));
  const s = await getAllSettings(db);
  const coupon = ((cart.utm as { coupon?: string } | null)?.coupon) ?? null;
  const priced = await priceItems(db, items, { settings: s.checkout, currency: s.general.currency, defaultTaxRate: s.general.defaultTaxRate, pricesIncludeTax: s.general.pricesIncludeTax, couponCode: coupon, locale: await localeOf(c) });
  return { cart, priced };
}
const cartJson = (id: string, p: PricedCart) => ({ id, ...p });

store.post("/cart", async (c) => {
  await enforceRateLimit(c, "cart-create", 30, 600);
  const id = crypto.randomUUID();
  await c.get("db").insert(carts).values({ id, currency: (await getSettings(c.get("db"), "general")).currency });
  return c.json({ id }, 201);
});
store.get("/cart/:id", async (c) => { const { priced } = await pricedCart(c, c.req.param("id")); return c.json(cartJson(c.req.param("id"), priced)); });
store.put("/cart/:id/items", async (c) => {
  const id = c.req.param("id"); const db = c.get("db");
  const b = await body(c, CartItemBody);
  const [cart] = await db.select().from(carts).where(eq(carts.id, id)).limit(1);
  if (!cart) throw notFound("Cart");
  if (b.quantity === 0) await db.delete(cartItems).where(and(eq(cartItems.cartId, id), eq(cartItems.variantId, b.variantId)));
  else {
    const [v] = await db.select({ id: productVariants.id }).from(productVariants).innerJoin(products, eq(products.id, productVariants.productId))
      .where(and(eq(productVariants.id, b.variantId), eq(productVariants.active, true), eq(products.status, "active"))).limit(1);
    if (!v) throw new ApiError(404, "variant_not_found", "Variant not available");
    const [cnt] = await db.select({ n: sql<number>`count(*)` }).from(cartItems).where(eq(cartItems.cartId, id));
    if ((cnt?.n ?? 0) >= 50) throw new ApiError(400, "cart_full", "Too many distinct items in cart");
    await db.insert(cartItems).values({ cartId: id, variantId: b.variantId, quantity: b.quantity }).onConflictDoUpdate({ target: [cartItems.cartId, cartItems.variantId], set: { quantity: b.quantity } });
  }
  await db.update(carts).set({ updatedAt: new Date() }).where(eq(carts.id, id));
  const { priced } = await pricedCart(c, id);
  return c.json(cartJson(id, priced));
});
store.post("/cart/:id/coupon", async (c) => {
  await enforceRateLimit(c, "coupon", 20, 600);
  const id = c.req.param("id"); const db = c.get("db");
  const b = await body(c, CartCouponBody);
  const { cart, priced } = await pricedCart(c, id);
  const utm = { ...((cart.utm as Record<string, unknown> | null) ?? {}) };
  if (!b.code) delete utm.coupon;
  else {
    try { const r = await evaluateCoupon(db, b.code.trim(), priced.subtotal); utm.coupon = r.code; }
    catch (e) { if (e instanceof CouponError) throw new ApiError(400, e.code, e.message); throw e; }
  }
  await db.update(carts).set({ utm, updatedAt: new Date() }).where(eq(carts.id, id));
  const r = await pricedCart(c, id);
  return c.json(cartJson(id, r.priced));
});

// ---------- checkout ----------
const orderNumber = () => `OS-${Date.now().toString(36).toUpperCase()}${crypto.randomUUID().slice(0, 4).toUpperCase()}`;

/** Max simultaneously held (awaiting_payment) orders within the reservation window: stock-hold DoS guard. */
export const MAX_PENDING_PER_EMAIL_IP = 3;
export const MAX_PENDING_PER_IP = 10;
/** Non-cancelled orders (other than `excludeOrderId`) that used this coupon with this email. */
async function couponUsesByEmail(db: Db, code: string, email: string, excludeOrderId: string) {
  const [r] = await db.select({ n: sql<number>`count(*)` }).from(orders).where(and(eq(orders.couponCode, code), eq(orders.email, email), sql`${orders.status} <> 'cancelled'`, sql`${orders.id} <> ${excludeOrderId}`));
  return r?.n ?? 0;
}

store.post("/checkout", async (c) => {
  await enforceRateLimit(c, "checkout", 10, 600);
  const db = c.get("db"); const env = c.env; const ip = c.get("ip");
  const mock = await isMockModeFresh(db); // uncached
  if (mock) await enforceRateLimit(c, "checkout-mock", 20, 600); // mock orders hold stock and write mock_messages: cap them
  const b = await body(c, CheckoutBody);
  // Turnstile is mandatory whenever TURNSTILE_SECRET is configured (verifyTurnstile fails closed without a token).
  if (!(await verifyTurnstile(env.TURNSTILE_SECRET, b.turnstileToken, ip))) throw new ApiError(403, "turnstile_failed", "Captcha verification failed");
  const s = await getAllSettings(db);
  if (!s.checkout.guestCheckout) throw new ApiError(403, "guest_checkout_disabled", "Guest checkout is disabled");

  const { cart, priced } = await pricedCart(c, b.cartId); // server recomputes everything from DB
  if (!priced.lines.length) throw new ApiError(400, "empty_cart", "Cart is empty");
  if (priced.invalid.length) throw new ApiError(409, "items_unavailable", "Some items are no longer available", { variantIds: priced.invalid });
  if (priced.couponError) throw new ApiError(409, priced.couponError, "Coupon is no longer valid");
  if (priced.total <= 0) throw new ApiError(400, "invalid_total", "Order total must be positive");
  const provider = await activePaymentProvider(env, db);
  if (!provider) throw new ApiError(503, "payment_unavailable", "No payment provider is enabled");

  const orderId = crypto.randomUUID(); const number = orderNumber(); const trackingToken = randomToken(24);
  const email = b.email.toLowerCase();

  // A cart can back only one live order: a consumed cart is rejected; an unpaid previous attempt is released first.
  const prevOrderId = cart.checkedOutOrderId ?? null;
  if (prevOrderId) {
    const [prev] = await db.select({ status: orders.status }).from(orders).where(eq(orders.id, prevOrderId)).limit(1);
    if (prev && !["pending", "awaiting_payment", "cancelled"].includes(prev.status)) throw new ApiError(409, "cart_already_checked_out", "This cart has already been checked out");
    if (prev && prev.status !== "cancelled") {
      try { await transitionOrder(db, prevOrderId, "cancelled"); } // releases reservations + coupon use
      catch (e) { if (e instanceof InvalidTransitionError) throw new ApiError(409, "cart_already_checked_out", "This cart has already been checked out"); throw e; }
    }
  }
  // Cap simultaneously held (unpaid) orders per email+IP and per IP within the reservation window.
  const windowStart = new Date(Date.now() - s.checkout.reservationMinutes * 60_000);
  const pending = (extra: SQL) => db.select({ n: sql<number>`count(*)` }).from(orders).where(and(extra, eq(orders.clientIp, ip), eq(orders.status, "awaiting_payment"), eq(orders.source, "website"), gte(orders.createdAt, windowStart)));
  const [byPair] = await pending(eq(orders.email, email));
  const [byIp] = await pending(sql`1 = 1`);
  if ((byPair?.n ?? 0) >= MAX_PENDING_PER_EMAIL_IP || (byIp?.n ?? 0) >= MAX_PENDING_PER_IP) throw new ApiError(429, "too_many_pending_orders", "Too many unpaid orders, complete or wait for them to expire", undefined, { "Retry-After": String(s.checkout.reservationMinutes * 60) });
  // Atomically claim the cart for this order (loses the race if a concurrent checkout already did).
  const claim = await c.env.DB.prepare("UPDATE carts SET checked_out_order_id = ?1, updated_at = unixepoch() WHERE id = ?2 AND checked_out_order_id IS ?3").bind(orderId, cart.id, prevOrderId).run();
  if (!claim.meta.changes) throw new ApiError(409, "cart_already_checked_out", "This cart has already been checked out");
  const unclaimCart = () => c.env.DB.prepare("UPDATE carts SET checked_out_order_id = ?1 WHERE id = ?2 AND checked_out_order_id = ?3").bind(prevOrderId, cart.id, orderId).run().catch(() => {});

  let reservationIds: string[] = [];
  try {
    reservationIds = await reserveStock(db, priced.lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })), { cartId: cart.id, ttlSeconds: s.checkout.reservationMinutes * 60 });
  } catch (e) {
    await unclaimCart();
    if (e instanceof InsufficientStockError) throw new ApiError(409, "insufficient_stock", "Not enough stock", { variantIds: e.variantIds });
    throw e;
  }
  let couponClaimed = false;

  try {
    if (priced.couponCode) {
      const [cp] = await db.select({ per: coupons.maxUsesPerCustomer }).from(coupons).where(eq(coupons.code, priced.couponCode)).limit(1);
      if ((await couponUsesByEmail(db, priced.couponCode, email, orderId)) >= (cp?.per ?? 1)) throw new ApiError(409, "coupon_already_used", "This coupon has already been used with this email");
      const r = await db.update(coupons).set({ used: sql`${coupons.used} + 1` }).where(and(eq(coupons.code, priced.couponCode), eq(coupons.active, true), sql`(${coupons.maxUses} IS NULL OR ${coupons.used} < ${coupons.maxUses})`)).returning({ c: coupons.code });
      if (!r.length) throw new ApiError(409, "coupon_exhausted", "Coupon usage limit reached");
      couponClaimed = true;
    }
    // customer
    let [cust] = await db.select().from(customers).where(and(eq(customers.email, email), sql`${customers.anonymizedAt} IS NULL`)).limit(1);
    const surname = b.shippingAddress.surname ?? b.shippingAddress.name.split(" ").slice(1).join(" ");
    const first = b.shippingAddress.surname ? b.shippingAddress.name : b.shippingAddress.name.split(" ")[0]!;
    if (!cust) { const id = crypto.randomUUID(); await db.insert(customers).values({ id, email, name: first, surname, phone: b.shippingAddress.phone }); cust = { id } as NonNullable<typeof cust>; }
    const consent = { analytics: b.consent.analytics, marketing: b.consent.marketing, at: new Date().toISOString() };
    const ua = (c.req.header("User-Agent") ?? "").slice(0, 300);
    await db.batch([
      db.insert(orders).values({
        id: orderId, number, source: "website", status: "awaiting_payment", customerId: cust!.id, email,
        shippingAddress: b.shippingAddress, billingAddress: b.billingAddress ?? null, currency: priced.currency, subtotal: priced.subtotal, discountTotal: priced.discount,
        shippingTotal: priced.shipping, taxTotal: priced.tax, total: priced.total, couponCode: priced.couponCode, trackingToken, consent, attribution: b.attribution ?? null, clientIp: ip, userAgent: ua,
      }),
      db.insert(orderItems).values(priced.lines.map((l) => ({ id: crypto.randomUUID(), orderId, variantId: l.variantId, sku: l.sku, name: l.variantTitle ? `${l.name} - ${l.variantTitle}` : l.name, quantity: l.quantity, unitPrice: l.unitPrice, taxRate: l.taxRate }))),
    ]);
    if (priced.couponCode) { // post-insert recheck closes the race between concurrent same-email checkouts
      const [cp] = await db.select({ per: coupons.maxUsesPerCustomer }).from(coupons).where(eq(coupons.code, priced.couponCode)).limit(1);
      if ((await couponUsesByEmail(db, priced.couponCode, email, orderId)) >= (cp?.per ?? 1)) throw new ApiError(409, "coupon_already_used", "This coupon has already been used with this email");
    }
    await attachReservations(db, reservationIds, orderId);
    await db.insert(customerConsents).values({ customerId: cust!.id, visitorId: b.attribution?.visitorId ?? null, analytics: b.consent.analytics, marketing: b.consent.marketing, ip });
    if (b.consent.marketing && b.attribution?.visitorId) {
      const a = b.attribution;
      await db.insert(utmAttributions).values({ visitorId: a.visitorId!, orderId, source: a.utm_source ?? null, medium: a.utm_medium ?? null, campaign: a.utm_campaign ?? null, term: a.utm_term ?? null, content: a.utm_content ?? null, fbclid: a.fbclid ?? null, gclid: a.gclid ?? null });
    }

    const addr = b.shippingAddress;
    let session;
    try {
      session = await provider.adapter.createCheckout({
        orderId, orderNumber: number, amount: priced.total, currency: priced.currency,
        buyer: { id: cust!.id, name: first, surname: surname || first, email: b.email, phone: addr.phone, ip, address: [addr.line1, addr.line2].filter(Boolean).join(" "), city: addr.city, country: addr.country === "TR" ? "Turkey" : addr.country, zip: addr.zip, identityNumber: addr.identityNumber },
        items: priced.lines.map((l) => ({ id: l.variantId, name: l.name, category: "General", price: l.lineTotal / l.quantity, quantity: l.quantity })),
        callbackUrl: `${env.API_ORIGIN}/api/store/payment/callback/${provider.id}`,
      });
    } catch (e) {
      log("error", "createCheckout failed", { provider: provider.id, error: e instanceof Error ? e.message : String(e) });
      await logIntegrationEvent(db, provider.id, "error", "createCheckout failed").catch(() => {});
      await transitionOrder(db, orderId, "cancelled").catch(() => {});
      throw new ApiError(502, "payment_provider_error", "Could not start payment, please try again");
    }
    await db.insert(payments).values({ id: crypto.randomUUID(), orderId, provider: provider.id, providerToken: session.providerToken, status: "pending", amount: priced.total, currency: priced.currency, isMock: mock });
    return c.json({ orderNumber: number, trackingToken, payment: { redirectUrl: session.redirectUrl, htmlContent: session.htmlContent } }, 201);
  } catch (e) {
    // compensation if we failed before an order row existed (after it exists, cancellation path above releases stock)
    const [o] = await db.select({ id: orders.id }).from(orders).where(eq(orders.id, orderId)).limit(1);
    if (!o) {
      await releaseReservationIds(db, reservationIds).catch(() => {});
      await unclaimCart();
      if (couponClaimed) await db.run(sql`UPDATE coupons SET used = MAX(used - 1, 0) WHERE code = ${priced.couponCode}`).catch(() => {});
    }
    else await transitionOrder(db, orderId, "cancelled").catch(() => {});
    throw e;
  }
});

// ---------- public order view ----------
store.get("/orders/:number", async (c) => {
  await enforceRateLimit(c, "order-view", 60, 60);
  const db = c.get("db");
  const [o] = await db.select().from(orders).where(eq(orders.number, c.req.param("number"))).limit(1);
  const t = c.req.query("t") ?? "";
  if (!o || !t || !timingSafeEqual(t, o.trackingToken)) throw notFound("Order");
  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, o.id));
  const ships = await db.select().from(shipments).where(eq(shipments.orderId, o.id));
  const paid = !["pending", "awaiting_payment", "cancelled"].includes(o.status);
  return c.json({
    number: o.number, status: o.status, currency: o.currency, createdAt: o.createdAt, email: o.email, shippingAddress: o.shippingAddress,
    subtotal: o.subtotal, discountTotal: o.discountTotal, shippingTotal: o.shippingTotal, taxTotal: o.taxTotal, total: o.total, consent: o.consent,
    items: items.map((i) => ({ variantId: i.variantId, sku: i.sku, name: i.name, quantity: i.quantity, unitPrice: i.unitPrice })),
    shipments: ships.map((s) => ({ carrier: s.carrier, trackingNumber: s.trackingNumber, status: s.status })),
    purchaseEventId: paid ? purchaseEventId(o.id) : null,
  });
});

// ---------- consent & tracking ----------
store.post("/consent", async (c) => {
  await enforceRateLimit(c, "consent", 60, 600);
  const b = await body(c, ConsentBody);
  await c.get("db").insert(customerConsents).values({ visitorId: b.visitorId, analytics: b.analytics, marketing: b.marketing, policyVersion: b.policyVersion ?? null, ip: c.get("ip") });
  return c.body(null, 204);
});

store.post("/track", async (c) => {
  await enforceRateLimit(c, "track", 300, 60);
  const b = await body(c, TrackBody);
  if (b.event.name === "purchase" || b.event.name === "refund") throw new ApiError(400, "server_only_event", "purchase/refund events are generated server-side only");
  if (!(EVENT_NAMES as readonly string[]).includes(b.event.name) || META_EVENT_MAP[b.event.name] === undefined) throw new ApiError(400, "unknown_event", "Unknown event name");
  const visitorId = b.attribution?.visitorId;
  if (!visitorId) throw new ApiError(400, "visitor_id_required", "attribution.visitorId is required");
  const db = c.get("db");
  const tracking = await getSettings(db, "tracking");
  // Client-supplied consent is advisory only: server sinks need a stored consent record (latest wins) when consent is required.
  const [stored] = tracking.consentRequired ? await db.select().from(customerConsents).where(eq(customerConsents.visitorId, visitorId)).orderBy(desc(customerConsents.id)).limit(1) : [];
  const consent = { analytics: stored?.analytics === true, marketing: stored?.marketing === true };
  const work = (async () => {
    for (const id of SINK_PROVIDER_IDS) {
      const a = await getAdapter<ServerEventSink>(c.env, db, id);
      if (!a || a.config.mirrorEvents === false) continue;
      const destination = id === "meta" ? "meta_capi" : "ga4_mp";
      const needed = id === "meta" ? consent.marketing : consent.analytics;
      const inserted = await db.insert(marketingEvents).values({ eventId: b.event.event_id, name: b.event.name, destination, status: !tracking.consentRequired || needed ? "sent" : "skipped_no_consent" }).onConflictDoNothing().returning({ id: marketingEvents.id });
      if (!inserted.length) continue; // dedup
      if (tracking.consentRequired && !needed) continue;
      try {
        const r = await a.adapter.send(b.event, { ip: c.get("ip"), userAgent: c.req.header("User-Agent"), fbc: b.attribution?.fbc, fbp: b.attribution?.fbp, gaClientId: b.attribution?.gaClientId, sourceUrl: b.event.page_url, externalId: visitorId });
        if (!r.ok) await db.update(marketingEvents).set({ status: "failed", detail: (r.detail ?? "").slice(0, 300) }).where(eq(marketingEvents.id, inserted[0]!.id));
      } catch (e) {
        await db.update(marketingEvents).set({ status: "failed", detail: (e instanceof Error ? e.message : "error").slice(0, 300) }).where(eq(marketingEvents.id, inserted[0]!.id));
      }
    }
  })().catch((e) => log("warn", "track mirror failed", { error: e instanceof Error ? e.message : String(e) }));
  try { c.executionCtx.waitUntil(work); } catch { await work; }
  return c.body(null, 204);
});
void asc;

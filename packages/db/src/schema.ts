import { sqliteTable, text, integer, blob, index, uniqueIndex, primaryKey } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

const id = () => text("id").primaryKey();
const createdAt = () => integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`);
const updatedAt = () => integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`);
/** All money columns are integer minor units (kuruş/cents). */

// ---------- settings / config ----------
export const stores = sqliteTable("stores", { id: id(), createdAt: createdAt() });

export const storeSettings = sqliteTable("store_settings", {
  group: text("group").primaryKey(),               // general|branding|seo|legal|checkout|tracking
  value: text("value", { mode: "json" }).notNull(), // validated by SETTING_GROUPS zod
  updatedBy: text("updated_by"), updatedAt: updatedAt(),
});

export const integrationConfigs = sqliteTable("integration_configs", {
  provider: text("provider").primaryKey(),          // ProviderId
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
  configPublic: text("config_public", { mode: "json" }).notNull().default(sql`'{}'`),
  secretsEnc: blob("secrets_enc", { mode: "buffer" }),   // AES-256-GCM ciphertext of JSON secrets
  secretsIv: blob("secrets_iv", { mode: "buffer" }),
  keyVersion: integer("key_version").notNull().default(1),
  lastHealthOk: integer("last_health_ok", { mode: "boolean" }),
  lastHealthDetail: text("last_health_detail"), lastHealthAt: integer("last_health_at", { mode: "timestamp" }),
  updatedBy: text("updated_by"), updatedAt: updatedAt(),
});

export const media = sqliteTable("media", {
  id: id(), kind: text("kind").notNull(),           // logo|logo_dark|favicon|banner|og|product
  mime: text("mime").notNull(), size: integer("size").notNull(), sha256: text("sha256").notNull(),
  r2Key: text("r2_key"), data: blob("data", { mode: "buffer" }), // one of r2Key/data set
  alt: text("alt"), createdBy: text("created_by"), createdAt: createdAt(),
});

// ---------- admin auth ----------
export const admins = sqliteTable("admins", {
  id: id(), email: text("email").notNull().unique(), name: text("name").notNull(),
  role: text("role").notNull().default("admin"),    // owner|admin|staff
  passwordHash: text("password_hash").notNull(),    // pbkdf2$iter$saltB64$hashB64
  totpSecretEnc: blob("totp_secret_enc", { mode: "buffer" }), totpIv: blob("totp_iv", { mode: "buffer" }),
  totpEnabled: integer("totp_enabled", { mode: "boolean" }).notNull().default(false),
  lastTotpStep: integer("last_totp_step"),          // highest accepted TOTP time-step (replay protection)
  disabled: integer("disabled", { mode: "boolean" }).notNull().default(false),
  createdAt: createdAt(), lastLoginAt: integer("last_login_at", { mode: "timestamp" }),
});
export const adminSessions = sqliteTable("admin_sessions", {
  tokenHash: text("token_hash").primaryKey(),       // sha256(token)
  adminId: text("admin_id").notNull().references(() => admins.id, { onDelete: "cascade" }),
  csrfToken: text("csrf_token").notNull(), mfaVerified: integer("mfa_verified", { mode: "boolean" }).notNull().default(false),
  ip: text("ip"), userAgent: text("user_agent"),
  createdAt: createdAt(), lastSeenAt: integer("last_seen_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
}, (t) => ({ byAdmin: index("sessions_admin_idx").on(t.adminId) }));
export const loginAttempts = sqliteTable("login_attempts", {
  id: integer("id").primaryKey({ autoIncrement: true }), email: text("email"), ip: text("ip"),
  success: integer("success", { mode: "boolean" }).notNull(), at: integer("at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
}, (t) => ({ byIp: index("login_ip_idx").on(t.ip, t.at), byEmail: index("login_email_idx").on(t.email, t.at) }));
export const rateLimits = sqliteTable("rate_limits", {
  key: text("key").primaryKey(), count: integer("count").notNull(), windowStart: integer("window_start").notNull(),
});
export const setupTokens = sqliteTable("setup_tokens", {
  tokenHash: text("token_hash").primaryKey(), usedAt: integer("used_at", { mode: "timestamp" }), createdAt: createdAt(),
});
export const auditLogs = sqliteTable("audit_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }), adminId: text("admin_id"), action: text("action").notNull(),
  entity: text("entity"), entityId: text("entity_id"), meta: text("meta", { mode: "json" }), ip: text("ip"), at: createdAt(),
}, (t) => ({ byAt: index("audit_at_idx").on(t.at) }));

// ---------- customers ----------
export const customers = sqliteTable("customers", {
  id: id(), email: text("email").notNull(), name: text("name"), surname: text("surname"), phone: text("phone"),
  anonymizedAt: integer("anonymized_at", { mode: "timestamp" }), createdAt: createdAt(),
}, (t) => ({ email: index("customers_email_idx").on(t.email) }));
export const addresses = sqliteTable("addresses", {
  id: id(), customerId: text("customer_id").references(() => customers.id, { onDelete: "cascade" }),
  name: text("name").notNull(), phone: text("phone"), line1: text("line1").notNull(), line2: text("line2"),
  city: text("city").notNull(), district: text("district"), zip: text("zip"), country: text("country").notNull().default("TR"),
  taxId: text("tax_id"), taxOffice: text("tax_office"), isCompany: integer("is_company", { mode: "boolean" }).notNull().default(false),
});
export const customerConsents = sqliteTable("customer_consents", {
  id: integer("id").primaryKey({ autoIncrement: true }), customerId: text("customer_id"), visitorId: text("visitor_id"),
  analytics: integer("analytics", { mode: "boolean" }).notNull(), marketing: integer("marketing", { mode: "boolean" }).notNull(),
  policyVersion: text("policy_version"), ip: text("ip"), at: createdAt(),
});

// ---------- catalog ----------
export const categories = sqliteTable("categories", {
  id: id(), parentId: text("parent_id"), slug: text("slug").notNull().unique(), nameTr: text("name_tr").notNull(), nameEn: text("name_en"),
  descriptionTr: text("description_tr"), descriptionEn: text("description_en"), position: integer("position").notNull().default(0),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  seoTitle: text("seo_title"), seoDescription: text("seo_description"), seoOgImageUrl: text("seo_og_image_url"),
  seoNoindex: integer("seo_noindex", { mode: "boolean" }).notNull().default(false),
});
export const products = sqliteTable("products", {
  id: id(), slug: text("slug").notNull().unique(), categoryId: text("category_id").references(() => categories.id),
  nameTr: text("name_tr").notNull(), nameEn: text("name_en"), descriptionTr: text("description_tr"), descriptionEn: text("description_en"),
  brand: text("brand"), status: text("status").notNull().default("draft"), // draft|active|archived
  seoTitle: text("seo_title"), seoDescription: text("seo_description"),
  seoOgMediaId: text("seo_og_media_id"), seoOgImageUrl: text("seo_og_image_url"), // optional social image override (media id or external url)
  seoNoindex: integer("seo_noindex", { mode: "boolean" }).notNull().default(false),
  seoCanonical: text("seo_canonical"), // optional absolute canonical override
  taxRate: integer("tax_rate"), // percent, null = store default
  createdAt: createdAt(), updatedAt: updatedAt(),
}, (t) => ({ cat: index("products_cat_idx").on(t.categoryId), status: index("products_status_idx").on(t.status) }));
export const productVariants = sqliteTable("product_variants", {
  id: id(), productId: text("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  sku: text("sku").notNull().unique(), barcode: text("barcode"), title: text("title"), options: text("options", { mode: "json" }), // {size:"M",color:"Red"}
  weightGrams: integer("weight_grams"), position: integer("position").notNull().default(0), active: integer("active", { mode: "boolean" }).notNull().default(true),
}, (t) => ({ prod: index("variants_prod_idx").on(t.productId) }));
export const productImages = sqliteTable("product_images", {
  id: id(), productId: text("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  mediaId: text("media_id"), url: text("url"), alt: text("alt"), position: integer("position").notNull().default(0), // external url OR media
}, (t) => ({ prod: index("images_prod_idx").on(t.productId) }));

// ---------- inventory ----------
export const inventory = sqliteTable("inventory", {
  variantId: text("variant_id").primaryKey().references(() => productVariants.id, { onDelete: "cascade" }),
  total: integer("total").notNull().default(0), reserved: integer("reserved").notNull().default(0),
  safetyStock: integer("safety_stock").notNull().default(0), updatedAt: updatedAt(),
});
export const inventoryMovements = sqliteTable("inventory_movements", {
  id: integer("id").primaryKey({ autoIncrement: true }), variantId: text("variant_id").notNull(),
  delta: integer("delta").notNull(), reason: text("reason").notNull(), // adjustment|sale|return|trendyol_sale|reservation|release
  refType: text("ref_type"), refId: text("ref_id"), at: createdAt(),
}, (t) => ({ v: index("movements_variant_idx").on(t.variantId) }));
export const inventoryReservations = sqliteTable("inventory_reservations", {
  id: id(), variantId: text("variant_id").notNull(), cartId: text("cart_id"), orderId: text("order_id"), quantity: integer("quantity").notNull(),
  status: text("status").notNull().default("active"), // active|converted|released|expired
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(), createdAt: createdAt(),
}, (t) => ({ exp: index("reservations_exp_idx").on(t.status, t.expiresAt) }));

// ---------- channels ----------
export const channelPrices = sqliteTable("channel_prices", {
  variantId: text("variant_id").notNull().references(() => productVariants.id, { onDelete: "cascade" }),
  channel: text("channel").notNull(), // website|trendyol
  price: integer("price").notNull(), compareAtPrice: integer("compare_at_price"), currency: text("currency").notNull().default("TRY"),
}, (t) => ({ pk: primaryKey({ columns: [t.variantId, t.channel] }) }));
export const channelListings = sqliteTable("channel_listings", {
  variantId: text("variant_id").notNull(), channel: text("channel").notNull(), enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  externalId: text("external_id"), lastSyncedStock: integer("last_synced_stock"), lastSyncedAt: integer("last_synced_at", { mode: "timestamp" }), lastError: text("last_error"),
}, (t) => ({ pk: primaryKey({ columns: [t.variantId, t.channel] }) }));
export const productMappings = sqliteTable("product_mappings", {
  id: id(), variantId: text("variant_id").notNull(), provider: text("provider").notNull(), externalSku: text("external_sku"), externalBarcode: text("external_barcode"), externalId: text("external_id"),
}, (t) => ({ u: uniqueIndex("mapping_u").on(t.provider, t.variantId) }));

// ---------- cart / orders ----------
export const carts = sqliteTable("carts", {
  id: id(), customerId: text("customer_id"), currency: text("currency").notNull().default("TRY"),
  utm: text("utm", { mode: "json" }), checkedOutOrderId: text("checked_out_order_id"), // set once the cart is consumed by a checkout
  createdAt: createdAt(), updatedAt: updatedAt(),
});
export const cartItems = sqliteTable("cart_items", {
  cartId: text("cart_id").notNull().references(() => carts.id, { onDelete: "cascade" }),
  variantId: text("variant_id").notNull(), quantity: integer("quantity").notNull(),
}, (t) => ({ pk: primaryKey({ columns: [t.cartId, t.variantId] }) }));
export const coupons = sqliteTable("coupons", {
  code: text("code").primaryKey(), type: text("type").notNull(), // percent|fixed
  value: integer("value").notNull(), minSubtotal: integer("min_subtotal").notNull().default(0),
  maxUses: integer("max_uses"), maxUsesPerCustomer: integer("max_uses_per_customer"), used: integer("used").notNull().default(0), expiresAt: integer("expires_at", { mode: "timestamp" }),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
});
export const orders = sqliteTable("orders", {
  id: id(), number: text("number").notNull().unique(), source: text("source").notNull().default("website"), externalOrderId: text("external_order_id"),
  status: text("status").notNull().default("pending"), customerId: text("customer_id"), email: text("email").notNull(),
  shippingAddress: text("shipping_address", { mode: "json" }).notNull(), billingAddress: text("billing_address", { mode: "json" }),
  currency: text("currency").notNull().default("TRY"), subtotal: integer("subtotal").notNull(), discountTotal: integer("discount_total").notNull().default(0),
  shippingTotal: integer("shipping_total").notNull().default(0), taxTotal: integer("tax_total").notNull().default(0), total: integer("total").notNull(),
  couponCode: text("coupon_code"), trackingToken: text("tracking_token").notNull(), // for guest order tracking
  consent: text("consent", { mode: "json" }), attribution: text("attribution", { mode: "json" }), // consent snapshot + utm/fbc/fbp/gaClientId
  clientIp: text("client_ip"), userAgent: text("user_agent"), notes: text("notes"),
  createdAt: createdAt(), updatedAt: updatedAt(),
}, (t) => ({ ext: uniqueIndex("orders_source_ext_u").on(t.source, t.externalOrderId), status: index("orders_status_idx").on(t.status), created: index("orders_created_idx").on(t.createdAt) }));
export const orderItems = sqliteTable("order_items", {
  id: id(), orderId: text("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }), variantId: text("variant_id"),
  sku: text("sku").notNull(), name: text("name").notNull(), quantity: integer("quantity").notNull(), unitPrice: integer("unit_price").notNull(), taxRate: integer("tax_rate").notNull().default(0),
}, (t) => ({ o: index("order_items_order_idx").on(t.orderId) }));

// ---------- payments ----------
export const payments = sqliteTable("payments", {
  id: id(), orderId: text("order_id").notNull().references(() => orders.id), provider: text("provider").notNull(), providerTxId: text("provider_tx_id"),
  providerToken: text("provider_token"), status: text("status").notNull().default("pending"), amount: integer("amount").notNull(), currency: text("currency").notNull(),
  /** true when created while mock mode was on (no real money moved); refunds are blocked across mock/real boundaries. */
  isMock: integer("is_mock", { mode: "boolean" }).notNull().default(false),
  createdAt: createdAt(), updatedAt: updatedAt(),
}, (t) => ({ tx: uniqueIndex("payments_provider_tx_u").on(t.provider, t.providerTxId), tok: index("payments_token_idx").on(t.providerToken) }));
export const paymentEvents = sqliteTable("payment_events", {
  id: integer("id").primaryKey({ autoIncrement: true }), paymentId: text("payment_id"), type: text("type").notNull(), payload: text("payload", { mode: "json" }), at: createdAt(),
});
export const refunds = sqliteTable("refunds", {
  id: id(), paymentId: text("payment_id").notNull(), orderId: text("order_id").notNull(), amount: integer("amount").notNull(), reason: text("reason"),
  status: text("status").notNull().default("pending"), providerRefundId: text("provider_refund_id"), createdBy: text("created_by"), createdAt: createdAt(),
});

// ---------- shipping / invoicing ----------
export const shipments = sqliteTable("shipments", {
  id: id(), orderId: text("order_id").notNull(), provider: text("provider").notNull(), providerShipmentId: text("provider_shipment_id"),
  carrier: text("carrier"), trackingNumber: text("tracking_number"), labelUrl: text("label_url"), status: text("status").notNull().default("created"), createdAt: createdAt(),
});
export const shipmentEvents = sqliteTable("shipment_events", {
  id: integer("id").primaryKey({ autoIncrement: true }), shipmentId: text("shipment_id").notNull(), status: text("status").notNull(), detail: text("detail"), at: createdAt(),
});
export const invoices = sqliteTable("invoices", {
  id: id(), orderId: text("order_id").notNull(), type: text("type").notNull(), // e_fatura|e_arsiv
  provider: text("provider").notNull(), providerInvoiceId: text("provider_invoice_id"), number: text("number"), pdfUrl: text("pdf_url"),
  status: text("status").notNull().default("pending"), createdAt: createdAt(),
}, (t) => ({ u: uniqueIndex("invoices_order_type_u").on(t.orderId, t.type) }));
export const invoiceEvents = sqliteTable("invoice_events", {
  id: integer("id").primaryKey({ autoIncrement: true }), invoiceId: text("invoice_id").notNull(), type: text("type").notNull(), detail: text("detail"), at: createdAt(),
});

// ---------- integration infra ----------
export const integrationEvents = sqliteTable("integration_events", {
  id: integer("id").primaryKey({ autoIncrement: true }), provider: text("provider").notNull(), level: text("level").notNull().default("info"),
  message: text("message").notNull(), meta: text("meta", { mode: "json" }), at: createdAt(),
}, (t) => ({ p: index("int_events_idx").on(t.provider, t.at) }));
export const outboxJobs = sqliteTable("outbox_jobs", {
  id: id(), kind: text("kind").notNull(), payload: text("payload", { mode: "json" }).notNull(), dedupeKey: text("dedupe_key").unique(),
  status: text("status").notNull().default("pending"), // pending|running|done|failed|dead
  attempts: integer("attempts").notNull().default(0), maxAttempts: integer("max_attempts").notNull().default(8),
  nextRunAt: integer("next_run_at").notNull().default(sql`(unixepoch())`), lastError: text("last_error"), createdAt: createdAt(), updatedAt: updatedAt(),
}, (t) => ({ due: index("outbox_due_idx").on(t.status, t.nextRunAt) }));
export const syncCursors = sqliteTable("sync_cursors", { key: text("key").primaryKey(), value: text("value").notNull(), updatedAt: updatedAt() });
export const webhookReceipts = sqliteTable("webhook_receipts", {
  id: integer("id").primaryKey({ autoIncrement: true }), provider: text("provider").notNull(), eventId: text("event_id").notNull(),
  receivedAt: createdAt(), status: text("status").notNull().default("received"),
}, (t) => ({ u: uniqueIndex("webhook_receipts_u").on(t.provider, t.eventId) }));

// ---------- marketing ----------
export const marketingEvents = sqliteTable("marketing_events", {
  id: integer("id").primaryKey({ autoIncrement: true }), eventId: text("event_id").notNull(), name: text("name").notNull(),
  destination: text("destination").notNull(), // meta_capi|ga4_mp
  orderId: text("order_id"), status: text("status").notNull(), // sent|failed|skipped_no_consent
  detail: text("detail"), at: createdAt(),
}, (t) => ({ u: uniqueIndex("marketing_events_u").on(t.eventId, t.name, t.destination) }));
export const utmAttributions = sqliteTable("utm_attributions", {
  id: integer("id").primaryKey({ autoIncrement: true }), visitorId: text("visitor_id").notNull(), orderId: text("order_id"),
  source: text("source"), medium: text("medium"), campaign: text("campaign"), term: text("term"), content: text("content"),
  fbclid: text("fbclid"), gclid: text("gclid"), at: createdAt(),
});

// ---------- mock mode ----------
export const mockMessages = sqliteTable("mock_messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  channel: text("channel").notNull(),          // sms|email|event|invoice|shipment|payment
  to: text("to"), subject: text("subject"), body: text("body"), meta: text("meta", { mode: "json" }),
  at: createdAt(),
}, (t) => ({ at: index("mock_messages_at_idx").on(t.at) }));

// ---------- notifications ----------
export const notificationLog = sqliteTable("notification_log", {
  id: integer("id").primaryKey({ autoIncrement: true }), orderId: text("order_id").notNull(),
  event: text("event").notNull(), channel: text("channel").notNull(), to: text("to"), provider: text("provider"),
  status: text("status").notNull(), // sent|failed|skipped
  error: text("error"), at: createdAt(),
}, (t) => ({ u: uniqueIndex("notification_log_u").on(t.orderId, t.event, t.channel) }));

// ---------- SEO ----------
/** When a product/category slug changes the old path 301-redirects to the new one. */
export const slugRedirects = sqliteTable("slug_redirects", {
  oldPath: text("old_path").primaryKey(), newPath: text("new_path").notNull(), createdAt: createdAt(),
});

// ---------- manual invoices (admin-composed, not tied to an order checkout) ----------
export const manualInvoices = sqliteTable("manual_invoices", {
  id: id(), status: text("status").notNull().default("draft"), // draft|issuing|issued|failed|cancelled
  type: text("type"),                                        // e_fatura|e_arsiv (resolved at issue time)
  orderId: text("order_id"),                                 // optional link to an order
  customer: text("customer", { mode: "json" }).notNull(),    // {name,email?,taxId?,taxOffice?,address,city,isCompany}
  lines: text("lines", { mode: "json" }).notNull(),          // [{variantId?,sku?,name,quantity,unitPrice(minor, tax-inclusive?),taxRate,discount?}]
  pricesIncludeTax: integer("prices_include_tax", { mode: "boolean" }).notNull().default(true),
  currency: text("currency").notNull().default("TRY"),
  issueDate: text("issue_date"), notes: text("notes"),
  total: integer("total").notNull().default(0), taxTotal: integer("tax_total").notNull().default(0),
  provider: text("provider"), providerInvoiceId: text("provider_invoice_id"), number: text("number"), pdfUrl: text("pdf_url"),
  error: text("error"), createdBy: text("created_by"), issuedBy: text("issued_by"), issuedAt: integer("issued_at", { mode: "timestamp" }),
  createdAt: createdAt(), updatedAt: updatedAt(),
}, (t) => ({ st: index("manual_invoices_status_idx").on(t.status, t.createdAt) }));

// ---------- admin-composed outbound email ----------
export const outboundEmails = sqliteTable("outbound_emails", {
  id: id(), to: text("to").notNull(), cc: text("cc"), replyTo: text("reply_to"), subject: text("subject").notNull(),
  bodyText: text("body_text").notNull(), bodyHtml: text("body_html").notNull(),
  status: text("status").notNull().default("queued"),        // queued|sent|failed
  provider: text("provider"), providerMessageId: text("provider_message_id"), error: text("error"),
  orderId: text("order_id"), customerId: text("customer_id"), manualInvoiceId: text("manual_invoice_id"),
  createdBy: text("created_by"), createdAt: createdAt(), sentAt: integer("sent_at", { mode: "timestamp" }),
}, (t) => ({ at: index("outbound_emails_at_idx").on(t.createdAt) }));

// ---------- Trendyol API console ----------
export const trendyolCalls = sqliteTable("trendyol_calls", {
  id: integer("id").primaryKey({ autoIncrement: true }), operationId: text("operation_id").notNull(), method: text("method").notNull(),
  env: text("env").notNull(), mock: integer("mock", { mode: "boolean" }).notNull().default(false), risk: text("risk").notNull(),
  status: integer("status").notNull(), durationMs: integer("duration_ms").notNull(), adminId: text("admin_id"),
  requestSummary: text("request_summary", { mode: "json" }), responseSummary: text("response_summary"), at: createdAt(),
}, (t) => ({ at: index("trendyol_calls_at_idx").on(t.at), op: index("trendyol_calls_op_idx").on(t.operationId) }));
/** Offline Trendyol simulation state (products, orders, claims, questions…). Only touched in mock mode. */
export const mockState = sqliteTable("mock_state", {
  key: text("key").primaryKey(), value: text("value", { mode: "json" }).notNull(), updatedAt: updatedAt(),
});

import { z } from "zod";
import {
  BrandingSettings, CategoryInput, CheckoutSettings, ComposeEmailBody, GeneralSettings, LegalSettings, MenuSettings, MerchandisingSettings, NotificationSettings, SeoSettings, TrackingSettings, CouponInput, GeliverCallBody, InventoryAdjustBody, ManualInvoiceBody, OrderStatusBody, ProductBulkBody, ProductInput, RefundBody, SETTING_GROUPS, VariantPriceBody,
  ShipmentBody, TrendyolCallBody,
} from "@openshelf/shared";
import { CampaignBody } from "../lib/campaigns";

export type Level = "read" | "write" | "full";
export const LEVEL_RANK: Record<Level, number> = { read: 1, write: 2, full: 3 };

export interface ToolDef {
  name: string; title: string; description: string; level: Level;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** path relative to /api/admin, `:param` segments are filled from the arguments of the same name */
  path: string;
  /** zod shape of the tool arguments (path params + query params + optional `body`) */
  shape: z.ZodRawShape;
  query?: string[];
  /** argument holding the JSON request body (default "body" when the shape has it) */
  bodyArg?: string;
  /** "csv": send `csv` argument as a multipart file upload (product import) */
  upload?: "csv" | "base64";
  /** full-level tools need `confirm: true` unless the API itself has a confirm rule (raw Trendyol/Geliver calls) */
  noConfirm?: boolean;
  /** route pattern this tool covers when `path` is concrete (e.g. path "/settings/seo" covers "PATCH /settings/:group") */
  coverAs?: string;
  /** forward the caller's `body` argument as sent (no defaults/transforms applied here): the API merges + validates it (PATCH tools) */
  rawBody?: boolean;
}

/* ---------- shared argument pieces ---------- */
const id = (what: string) => z.string().min(1).describe(`${what} id`);
const page = { page: z.number().int().min(1).optional().describe("page number, default 1"), pageSize: z.number().int().min(1).max(100).optional().describe("items per page, max 100") };
const q = (what: string) => z.string().optional().describe(what);
const SETTING_KEYS = Object.keys(SETTING_GROUPS).filter((k) => k !== "system") as [string, ...string[]];
const channelEnum = z.enum(["email", "sms"]);
const filters = z.object({ minOrders: z.number().int().min(0).optional(), orderedWithinDays: z.number().int().min(1).optional(), city: z.string().optional() }).default({});

const t = (d: ToolDef) => d;
const SENSITIVE = "Customer data in the result is personal data: do not repeat more of it than needed.";

export const TOOLS: ToolDef[] = [
  /* ================= overview / read ================= */
  t({ name: "store_overview", title: "Store overview", level: "read", method: "GET", path: "/dashboard", shape: {},
    description: "Dashboard numbers: orders by status, revenue, low stock and recent activity. Start here for 'how is the store doing?'. Money values are minor units (kuruş: 1999 = 19.99 TRY)." }),
  t({ name: "list_orders", title: "List orders", level: "read", method: "GET", path: "/orders", query: ["q", "status", "source", "payment", "shipping", "invoice", "from", "to", "minTotal", "maxTotal", "page", "pageSize"],
    shape: {
      q: q("search order number, customer name/e-mail/phone/city, product name or SKU, or shipment tracking number"),
      status: q("one status or a comma-separated list: pending|awaiting_payment|paid|fulfilling|shipped|delivered|cancelled|refunded"), source: q("channel: website or trendyol"),
      payment: q("payment state: succeeded|pending|failed|refunded, or none (no payment yet)"), shipping: q("shipment state: created|in_transit|delivered|returned|cancelled, or none (not shipped yet)"),
      invoice: q("invoice state: draft|issuing|issued|failed|cancelled, or none (not invoiced yet)"),
      from: q("created on/after this date (YYYY-MM-DD)"), to: q("created on/before this date (YYYY-MM-DD)"), minTotal: q("minimum total in minor units (kuruş)"), maxTotal: q("maximum total in minor units (kuruş)"), ...page },
    description: `Search/list orders (newest first). Each row includes the process state: latest payment, shipment (carrier + tracking number) and invoice, item lines, customer name and city. Use payment=succeeded&shipping=none to find orders waiting to ship. source=trendyol are marketplace orders (Trendyol ships and invoices them). ${SENSITIVE}` }),
  t({ name: "get_order", title: "Get order", level: "read", method: "GET", path: "/orders/:id", shape: { id: id("order") },
    description: `Full order: items, payments, shipments (incl. Trendyol cargo), invoices, events. ${SENSITIVE}` }),
  t({ name: "order_notifications", title: "Order notifications", level: "read", method: "GET", path: "/orders/:id/notifications", shape: { id: id("order") }, description: "E-mail/SMS notifications sent for an order and their status." }),
  t({ name: "list_customers", title: "List customers", level: "read", method: "GET", path: "/customers", query: ["q", "page", "pageSize"], shape: { q: q("search name/e-mail"), ...page }, description: `List customers. ${SENSITIVE}` }),
  t({ name: "get_customer", title: "Get customer", level: "read", method: "GET", path: "/customers/:id", shape: { id: id("customer") }, description: `Customer with addresses and orders. ${SENSITIVE}` }),
  t({ name: "list_products", title: "List products", level: "read", method: "GET", path: "/products", query: ["q", "status", "category", "stock", "image", "channel", "sort", "ids", "page", "pageSize"],
    shape: {
      q: q("search name/slug/brand/sku/barcode"), status: q("draft|active|archived"), category: q("category id, or none for uncategorised"),
      stock: q("out (sold out) | low (1-5 available) | in (more than 5)"), image: q("none = products without any image"), channel: q("trendyol = listed on Trendyol, website_only"),
      sort: q("newest|oldest|updated|name|name-desc|price|price-desc|stock|stock-desc|sold (most units sold in the last 30 days first)"), ids: q("comma-separated product ids (max 100)"), ...page,
    }, description: "List products with variants, stock, category name and whether they are mapped to Trendyol." }),
  t({ name: "get_product", title: "Get product", level: "read", method: "GET", path: "/products/:id", shape: { id: id("product") }, description: "Full product: variants (sku, barcode, prices per channel in minor units, stock), images, SEO." }),
  t({ name: "list_categories", title: "List categories", level: "read", method: "GET", path: "/categories", shape: {}, description: "All categories (tree via parentId)." }),
  t({ name: "list_coupons", title: "List coupons", level: "read", method: "GET", path: "/coupons", shape: {}, description: "All coupons with usage." }),
  t({ name: "get_settings", title: "Get all settings", level: "read", method: "GET", path: "/settings", shape: {}, description: "All setting groups: general, branding, seo, legal, checkout, tracking, notifications, menu (storefront top menu), merchandising (product order on the storefront), system. Read before update_settings (updates replace a whole group)." }),
  t({ name: "get_settings_group", title: "Get one settings group", level: "read", method: "GET", path: "/settings/:group",
    shape: { group: z.enum(SETTING_KEYS).describe("general (store name, contact, currency, tax) | branding | seo | legal | checkout | tracking | notifications | menu (storefront top menu) | merchandising (product order, pinned products)") },
    description: "Read ONE settings group (smaller than get_settings)." }),
  t({ name: "list_integrations", title: "List integrations", level: "read", method: "GET", path: "/integrations", shape: {}, description: "Integration status (enabled, configured). Secrets are always masked." }),
  t({ name: "list_integration_events", title: "Integration events", level: "read", method: "GET", path: "/integration-events", query: ["provider", "page", "pageSize"], shape: { provider: q("e.g. trendyol, geliver, outbox"), ...page }, description: "Integration log (warnings/errors from background jobs): first place to look when something fails." }),
  t({ name: "list_marketing_events", title: "Marketing events", level: "read", method: "GET", path: "/marketing-events", query: ["page", "pageSize"], shape: { ...page }, description: "Server-side analytics/ads events sent (Meta, GA4) and their status." }),
  t({ name: "list_outbox_jobs", title: "Background jobs", level: "read", method: "GET", path: "/outbox", query: ["status", "page", "pageSize"], shape: { status: q("pending|running|done|failed|dead"), ...page }, description: "Queued/failed background jobs (stock push, order import, campaigns...)." }),
  t({ name: "list_audit_logs", title: "Audit log", level: "read", method: "GET", path: "/audit-logs", query: ["page", "pageSize"], shape: { ...page }, description: "Who did what: admin actions, including MCP tool calls." }),
  t({ name: "mock_status", title: "Mock mode status", level: "read", method: "GET", path: "/mock/status", shape: {}, description: "Whether mock (demo) mode is allowed/enabled. In mock mode no real payments, e-mails or SMS are sent." }),
  t({ name: "list_media", title: "List media", level: "read", method: "GET", path: "/media", query: ["kind"], shape: { kind: q("product|banner|og|logo|logo_dark|favicon") }, description: "Uploaded media library (newest first, 200 max): id, kind, mime, size, alt, createdAt, url. After the human uploaded files in the admin panel, call this with the kind to find the new ids." }),
  t({ name: "get_image_specs", title: "Image requirements", level: "read", method: "GET", path: "/media/specs", shape: {},
    description: "ALWAYS call this before generating an image for the store. Returns, per kind (product, banner, og, logo, logo_dark, favicon): recommended pixel size and aspect ratio, minimum size, max file size actually enforced, transparency, preferred formats, where/how the image is shown (and cropped), composition/safe-area guidance and how to attach it after upload." }),
  t({ name: "export_data", title: "Export data", level: "read", method: "GET", path: "/export/:file", shape: { file: z.enum(["products.csv", "products.json", "orders.csv", "orders.json", "customers.csv", "customers.json", "config.json"]).describe("export file name") },
    description: `Bulk export (up to 10000 rows). config.json is the configuration backup without secrets. ${SENSITIVE}` }),
  t({ name: "seo_preview", title: "SEO preview", level: "read", method: "GET", path: "/seo/preview", query: ["type", "id"], shape: { type: z.enum(["product", "category", "home"]).describe("page type"), id: q("product/category id (not needed for home)") },
    description: "Exactly what search engines and social networks will see for a page: resolved <title>, description, canonical URL, robots, Open Graph/Twitter card and JSON-LD. Use after changing SEO fields to verify." }),
  t({ name: "seo_audit", title: "SEO audit", level: "read", method: "GET", path: "/seo/audit", shape: {},
    description: "SEO health check of the whole store: site-wide problems (store hidden from search, default store name, no home title/description, no default social image, JSON-LD off, no Search Console code...) plus every active product/category with gaps (no SEO title/description, thin description, noindex, images without alt text, duplicate titles). Start here for 'improve my SEO', then fix with update_product_seo / update_category_seo / update_seo_settings / update_store_profile and verify with seo_preview." }),
  t({ name: "catalog_lookup", title: "Catalog lookup", level: "read", method: "GET", path: "/catalog-lookup", query: ["q"], shape: { q: q("sku/name") }, description: "Find variants by sku/name (for invoices, mappings)." }),
  t({ name: "customer_lookup", title: "Customer lookup", level: "read", method: "GET", path: "/customer-lookup", query: ["q"], shape: { q: q("name/e-mail") }, description: `Find customers by name/e-mail. ${SENSITIVE}` }),
  /* e-mail / SMS / campaigns (read) */
  t({ name: "list_emails", title: "Sent e-mails", level: "read", method: "GET", path: "/emails", query: ["q", "status", "page", "pageSize"], shape: { q: q("recipient/subject"), status: q("queued|sent|failed"), ...page }, description: "Manually composed e-mails and delivery status." }),
  t({ name: "get_email", title: "Get e-mail", level: "read", method: "GET", path: "/emails/:id", shape: { id: id("e-mail") }, description: "One composed e-mail with body." }),
  t({ name: "list_email_templates", title: "E-mail templates", level: "read", method: "GET", path: "/emails/templates", shape: {}, description: "Notification templates (tr/en) and their placeholders." }),
  t({ name: "preview_email", title: "Preview e-mail", level: "read", method: "POST", path: "/emails/preview", shape: { body: z.object({ subject: z.string().default(""), body: z.string().default(""), manualInvoiceId: z.string().optional() }) }, description: "Render an e-mail without sending." }),
  t({ name: "list_sms", title: "Sent SMS", level: "read", method: "GET", path: "/sms", query: ["page", "pageSize"], shape: { ...page }, description: "One-off SMS history (recipients masked)." }),
  t({ name: "list_campaigns", title: "List campaigns", level: "read", method: "GET", path: "/campaigns", query: ["page", "pageSize"], shape: { ...page }, description: "E-mail/SMS campaigns with progress." }),
  t({ name: "get_campaign", title: "Get campaign", level: "read", method: "GET", path: "/campaigns/:id", shape: { id: id("campaign") }, description: "Campaign content, filters, progress, failures. Poll this while status=sending." }),
  t({ name: "campaign_audience", title: "Campaign audience size", level: "read", method: "POST", path: "/campaigns/audience", shape: { body: z.object({ channel: channelEnum, filters }) }, description: "How many customers WITH marketing consent match the filters (masked sample). Marketing consent is mandatory: nobody without it is ever included." }),
  t({ name: "preview_campaign", title: "Preview campaign", level: "read", method: "POST", path: "/campaigns/:id/preview", shape: { id: id("campaign") }, description: "Rendered subject/HTML/text of a saved campaign." }),
  /* manual invoices (read) */
  t({ name: "list_manual_invoices", title: "Manual invoices", level: "read", method: "GET", path: "/manual-invoices", query: ["q", "status", "page", "pageSize"], shape: { q: q("number/customer"), status: q("draft|issued|cancelled"), ...page }, description: "Manually created invoices." }),
  t({ name: "get_manual_invoice", title: "Get manual invoice", level: "read", method: "GET", path: "/manual-invoices/:id", shape: { id: id("manual invoice") }, description: "One manual invoice with lines and totals." }),
  t({ name: "preview_manual_invoice", title: "Preview manual invoice", level: "read", method: "POST", path: "/manual-invoices/preview", shape: { body: ManualInvoiceBody }, description: "Compute totals/HTML for an invoice that is not saved yet." }),
  t({ name: "preview_saved_manual_invoice", title: "Preview saved manual invoice", level: "read", method: "POST", path: "/manual-invoices/:id/preview", shape: { id: id("manual invoice") }, description: "Rendered HTML/totals of a saved manual invoice." }),
  /* Trendyol / Geliver (read) */
  t({ name: "trendyol_health", title: "Trendyol sync health", level: "read", method: "GET", path: "/trendyol/health", shape: {}, description: "Trendyol: orders mirrored, orders awaiting cargo info, stock drift, last syncs, recent errors." }),
  t({ name: "trendyol_list_operations", title: "Trendyol API operations", level: "read", method: "GET", path: "/trendyol/catalog", shape: {}, description: "Catalog of Trendyol API operations the console can call (ids, parameters, risk) + mode (mock/live/disabled). Use with trendyol_call." }),
  t({ name: "trendyol_mappings", title: "Trendyol mappings", level: "read", method: "GET", path: "/trendyol/mappings", shape: {}, description: "Local variants linked to Trendyol barcodes." }),
  t({ name: "trendyol_import_status", title: "Trendyol import status", level: "read", method: "GET", path: "/trendyol/import", shape: {}, description: "Progress/result of the last Trendyol product import." }),
  t({ name: "trendyol_call_history", title: "Trendyol call history", level: "read", method: "GET", path: "/trendyol/history", query: ["page", "pageSize"], shape: { ...page }, description: "Recent Trendyol API console calls (status/duration; no customer data)." }),
  t({ name: "geliver_list_operations", title: "Geliver API operations", level: "read", method: "GET", path: "/geliver/catalog", shape: {}, description: "Catalog of Geliver (shipping) operations, mode and sender address. Use with geliver_call." }),

  /* ================= write ================= */
  t({ name: "create_product", title: "Create product", level: "write", method: "POST", path: "/products", shape: { body: ProductInput },
    description: "Create a product with variants. Prices are minor units (kuruş). status=draft keeps it off the storefront. Look at an existing product (get_product) for the exact shape. Images: images:[{mediaId (from upload_media_from_url) or https url, alt}], first = cover; recommended 1600×2000 (4:5): see get_image_specs." }),
  t({ name: "update_product", title: "Update product", level: "write", method: "PUT", path: "/products/:id", shape: { id: id("product"), body: ProductInput }, description: "Replace a product (send the FULL product, e.g. from get_product with your changes)." }),
  t({ name: "create_category", title: "Create category", level: "write", method: "POST", path: "/categories", shape: { body: CategoryInput }, description: "Create a category (parentId for nesting)." }),
  t({ name: "update_category", title: "Update category", level: "write", method: "PUT", path: "/categories/:id", shape: { id: id("category"), body: CategoryInput }, description: "Replace a category." }),
  t({ name: "create_coupon", title: "Create coupon", level: "write", method: "POST", path: "/coupons", shape: { body: CouponInput }, description: "Create a coupon: type percent (value 1-100) or fixed (minor units)." }),
  t({ name: "update_coupon", title: "Update coupon", level: "write", method: "PUT", path: "/coupons/:code", shape: { code: z.string().min(1).describe("coupon code"), body: CouponInput }, description: "Replace a coupon." }),
  t({ name: "adjust_stock", title: "Adjust stock", level: "write", method: "POST", path: "/inventory/:variantId/adjust", shape: { variantId: id("variant"), body: InventoryAdjustBody },
    description: "Change stock by a signed delta (+10 / -3) with a reason. Local stock is the source of truth and is pushed to Trendyol automatically." }),
  t({ name: "update_variant_price", title: "Update variant price", level: "write", method: "PATCH", path: "/variants/:variantId/price", shape: { variantId: id("variant"), body: VariantPriceBody },
    description: "Set the website price of one variant in minor units (kuruş: 1999 = 19.99 TRY); compareAtPrice (optional, must be higher) is the strike-through price. Pushed to Trendyol automatically." }),
  t({ name: "bulk_update_products", title: "Bulk update products", level: "write", method: "POST", path: "/products/bulk", shape: { body: ProductBulkBody },
    description: "Up to 100 products at once: action status (draft|active|archived), category (categoryId or null) or price (percent, e.g. 10 = +10%, -15 = -15%, applied to every active variant's website price and compare-at price)." }),
  t({ name: "update_order_status", title: "Update order status", level: "write", method: "POST", path: "/orders/:id/status", shape: { id: id("order"), body: OrderStatusBody },
    description: "Move an order along its allowed transitions (paid/refunded are set by payment flows and are rejected). Trendyol orders are managed by Trendyol." }),
  t({ name: "update_settings", title: "Update settings group", level: "write", method: "PUT", path: "/settings/:group",
    shape: { group: z.enum(SETTING_KEYS).describe("setting group (system/mock settings are not available)"), value: z.record(z.unknown()).describe("the COMPLETE new value of the group (get_settings first, change fields, send everything back)") }, bodyArg: "value",
    description: "REPLACE a whole settings group (every field must be present). Prefer the typed patch tools (update_store_profile, update_seo_settings, update_branding, update_legal_pages, update_checkout_settings, update_tracking_settings, update_notification_settings, update_menu, update_merchandising) which change only the fields you send. Does not touch integration secrets." }),
  /* --- store settings: PATCH = send only the fields to change (nested objects merge); the merged group is validated as a whole --- */
  t({ name: "update_store_profile", title: "Update store profile (name, contact, currency, tax)", level: "write", method: "PATCH", path: "/settings/general", coverAs: "/settings/:group", rawBody: true, shape: { body: GeneralSettings.partial() },
    description: "Change store-wide basics: storeName (the brand shown in header, e-mails, SEO titles), tagline, description (home/SEO fallback, max 500), contactEmail/Phone, address, taxId, currency (TRY), pricesIncludeTax, defaultTaxRate (percent), defaultLocale (tr|en), locales, timezone. Send ONLY the fields to change." }),
  t({ name: "update_seo_settings", title: "Update store SEO settings", level: "write", method: "PATCH", path: "/settings/seo", coverAs: "/settings/:group", rawBody: true, shape: { body: SeoSettings.partial() },
    description: "Site-wide SEO: titleTemplate (\"%s | {storeName}\"), homeTitle (≤120), homeDescription (≤320), defaultOgMediaId (1200×630 image from upload_media), robotsIndex (false hides the WHOLE store from search engines: be careful), twitterHandle, Google/Bing/Facebook verification codes, robotsDisallow paths, jsonLd (structured data). Send ONLY the fields to change; verify with seo_preview type=home." }),
  t({ name: "update_branding", title: "Update branding", level: "write", method: "PATCH", path: "/settings/branding", coverAs: "/settings/:group", rawBody: true, shape: { body: BrandingSettings.partial() },
    description: "Logo/dark logo/favicon (media ids from upload_media_from_url; see get_image_specs), home banners (bannerMediaIds ≤6, bannerTitle, bannerSubtitle, bannerCtaLabel, bannerCtaUrl), primaryColor/accentColor (#RRGGBB) and social links (instagram, facebook, x, youtube, tiktok: nested object merges). Send ONLY the fields to change." }),
  t({ name: "update_legal_pages", title: "Update legal pages", level: "write", method: "PATCH", path: "/settings/legal", coverAs: "/settings/:group", rawBody: true, shape: { body: LegalSettings.partial() },
    description: "Legal page texts shown in the storefront footer: kvkk, distanceSales (mesafeli satış), returns (iade), cookies, privacy. Plain text/markdown. Sending a key replaces that whole text." }),
  t({ name: "update_checkout_settings", title: "Update checkout settings", level: "write", method: "PATCH", path: "/settings/checkout", coverAs: "/settings/:group", rawBody: true, shape: { body: CheckoutSettings.partial() },
    description: "Checkout: guestCheckout, reservationMinutes (5-120 stock hold), safetyStock (units never sold), freeShippingThreshold (minor units/kuruş, null = off), flatShippingFee (minor units)." }),
  t({ name: "update_tracking_settings", title: "Update tracking/analytics IDs", level: "write", method: "PATCH", path: "/settings/tracking", coverAs: "/settings/:group", rawBody: true, shape: { body: TrackingSettings.partial() },
    description: "Public tracking IDs only: ga4MeasurementId (G-XXXX), gtmContainerId (GTM-XXXX), metaPixelId (digits), metaTestEventCode, consentRequired. API secrets are not settable here." }),
  t({ name: "update_menu", title: "Update storefront top menu", level: "write", method: "PATCH", path: "/settings/menu", coverAs: "/settings/:group", rawBody: true, shape: { body: MenuSettings.partial() },
    description: "The storefront's top menu. auto=true (default) shows 'All products' + the first 4 top-level categories; to build your own set auto=false and send the COMPLETE items list (arrays replace, max 12, in display order). Item: {id (any unique short string), type: 'category'|'link', categoryId (from list_categories; category items only), label (link text: required for links, optional rename for categories), labelEn, url (links: '/path' on the site or 'https://…'; nothing else is accepted), newTab, showChildren (categories: show sub-categories in a dropdown)}. showProductsLink adds the 'All products' link first. Read get_settings_group menu first, use list_categories for ids (children have parentId; only top-level categories normally belong in the menu), and tell the owner the proposed menu before saving. Takes about a minute to appear on the storefront." }),
  t({ name: "update_merchandising", title: "Update storefront product order", level: "write", method: "PATCH", path: "/settings/merchandising", coverAs: "/settings/:group", rawBody: true, shape: { body: MerchandisingSettings.partial() },
    description: "How products are ordered on the storefront (home + lists). defaultSort: featured (pinned products first in the given order, then newest) | newest | bestselling | price_asc | price_desc | name. pinned: product ids in display order (max 60, replaces the list; only used by 'featured'; use list_products to find ids). inStockFirst: sold-out products always last. bestsellerDays: window for 'bestselling' (7-365; counts paid-or-later orders only). To see what sells, list_products with sort=sold (units sold in the last 30 days) and stock=in/out. Tell the owner the plan before saving. Takes about a minute to appear." }),
  t({ name: "update_notification_settings", title: "Update notification settings", level: "write", method: "PATCH", path: "/settings/notifications", coverAs: "/settings/:group", rawBody: true, shape: { body: NotificationSettings.partial() },
    description: "Order e-mail/SMS notifications: fromName, fromEmail, smsSenderId (≤11), adminEmail/adminPhone (+E.164), smsAllowedCountries, daily caps, per-event channels (events.order_paid.sms/email …) and templates (templates.tr.order_paid.subject/body with {{orderNumber}} {{customerName}} {{total}} {{trackingNumber}} {{trackingUrl}} {{storeName}} {{orderUrl}}). Nested objects merge: send only what changes." }),
  t({ name: "update_product_seo", title: "Update product SEO", level: "write", method: "PATCH", path: "/products/:id/seo", coverAs: "/products/:id/seo", rawBody: true,
    shape: { id: id("product"), body: ProductInput.pick({ seoTitle: true, seoDescription: true, seoOgMediaId: true, seoOgImageUrl: true, seoNoindex: true, seoCanonical: true }).partial() },
    description: "Set a product's search/social fields without touching anything else: seoTitle (≤70, ideally 50-60 chars, include the main keyword), seoDescription (≤320, ideally 120-160, benefit + call to action), seoOgMediaId (1200×630 from upload_media_from_url) or seoOgImageUrl (https), seoNoindex (true hides it from search), seoCanonical (absolute https URL). Empty string clears a field. Verify with seo_preview type=product." }),
  t({ name: "update_category_seo", title: "Update category SEO", level: "write", method: "PATCH", path: "/categories/:id/seo", coverAs: "/categories/:id/seo", rawBody: true,
    shape: { id: id("category"), body: CategoryInput.pick({ seoTitle: true, seoDescription: true, seoOgImageUrl: true, seoNoindex: true }).partial() },
    description: "Set a category's seoTitle (≤70), seoDescription (≤320), seoOgImageUrl (https) and seoNoindex without touching anything else. Verify with seo_preview type=category." }),
  t({ name: "retry_outbox_job", title: "Retry background job", level: "write", method: "POST", path: "/outbox/:id/retry", shape: { id: id("job") }, description: "Re-queue a failed/dead background job." }),
  t({ name: "test_integration", title: "Test integration", level: "write", method: "POST", path: "/integrations/:provider/test", shape: { provider: z.string().min(1).describe("provider id, e.g. trendyol, geliver, iyzico") }, description: "Run the provider's health check (one outbound API call, nothing is changed)." }),
  t({ name: "upload_media_from_url", title: "Import image from a URL (recommended)", level: "write", method: "POST", path: "/media/import",
    shape: { body: z.object({ kind: z.enum(["product", "banner", "og", "logo", "logo_dark", "favicon"]).describe("what the image is for; see get_image_specs"), url: z.string().url().describe("public https URL of the image (e.g. the link of the generated image); the SERVER downloads it"), alt: z.string().max(300).optional().describe("alt text (describe the image)") }) },
    description: "BEST WAY to put a generated or existing image into the store at full size: pass its public https URL and the server downloads it (png/jpeg/webp/gif/avif, within the size limit of its kind; redirects followed, private/internal hosts refused). Returns id, url, size, width, height and `warnings` when it does not fit the slot (wrong aspect ratio / too small): regenerate if so. Use this instead of upload_media for anything bigger than a few KB: chat clients truncate long base64 arguments. If you have no public URL, ask the human to upload the file in the admin panel (product images / Settings → Branding) and then find its id with list_media. Then attach the id (product images mediaId, branding logoMediaId/faviconMediaId/bannerMediaIds, seoOgMediaId)." }),
  t({ name: "upload_media", title: "Upload image (small, base64)", level: "write", method: "POST", path: "/media", upload: "base64",
    shape: { kind: z.enum(["product", "banner", "og", "logo", "logo_dark", "favicon"]).describe("what the image is for; see get_image_specs"), data: z.string().min(20).describe("the image file as base64 (no data: prefix)"), filename: z.string().max(120).optional().describe("optional, e.g. hero.webp"), alt: z.string().max(300).optional().describe("alt text (describe the image; important for SEO/accessibility)") },
    description: "Upload an image given as base64 in the arguments. ONLY for small images (a few KB, e.g. a favicon): long base64 strings are truncated by most chat clients, producing broken files; for real product/banner/logo images use upload_media_from_url (a public https link). png/jpeg/webp/gif/avif only (no SVG), within the size limit of its kind. Returns id, url, size, width, height and `warnings` when it does not fit the slot (wrong aspect ratio / too small): if warnings appear, regenerate to the recommended size. Then attach the id (product images mediaId, branding logoMediaId/faviconMediaId/bannerMediaIds, product seoOgMediaId). Call get_image_specs first." }),
  t({ name: "create_campaign", title: "Create campaign draft", level: "write", method: "POST", path: "/campaigns", shape: { body: CampaignBody },
    description: "Create an e-mail or SMS campaign DRAFT (nothing is sent). Placeholders {{name}}, {{storeName}}. An unsubscribe link is added automatically. Next: campaign_audience, preview_campaign, test_campaign, then send_campaign." }),
  t({ name: "update_campaign", title: "Update campaign draft", level: "write", method: "PUT", path: "/campaigns/:id", shape: { id: id("campaign"), body: CampaignBody }, description: "Edit a campaign (drafts only)." }),
  t({ name: "test_campaign", title: "Send campaign test", level: "write", method: "POST", path: "/campaigns/:id/test", shape: { id: id("campaign"), body: z.object({ to: z.string().describe("e-mail address or phone (+905...) of the tester") }) }, description: "Send the campaign ONCE to a single test address/number, marked [TEST]. Max 10/hour." }),
  t({ name: "cancel_campaign", title: "Cancel running campaign", level: "write", method: "POST", path: "/campaigns/:id/cancel", shape: { id: id("campaign") }, description: "Stop a sending campaign; pending recipients are skipped." }),
  t({ name: "create_manual_invoice", title: "Create manual invoice draft", level: "write", method: "POST", path: "/manual-invoices", shape: { body: ManualInvoiceBody }, description: "Save a manual invoice DRAFT (not issued to the tax system)." }),
  t({ name: "update_manual_invoice", title: "Update manual invoice draft", level: "write", method: "PUT", path: "/manual-invoices/:id", shape: { id: id("manual invoice"), body: ManualInvoiceBody }, description: "Edit a draft manual invoice." }),
  t({ name: "trendyol_map_variant", title: "Map variant to Trendyol barcode", level: "write", method: "POST", path: "/trendyol/mappings", shape: { body: z.object({ variantId: z.string(), barcode: z.string() }) }, description: "Link a local variant to a Trendyol barcode and enable its listing." }),
  t({ name: "trendyol_delete_mapping", title: "Remove Trendyol mapping", level: "write", method: "DELETE", path: "/trendyol/mappings", query: ["variantId"], shape: { variantId: id("variant") }, description: "Remove the Trendyol link of a variant (stock push stops for it)." }),
  t({ name: "trendyol_start_import", title: "Import products from Trendyol", level: "write", method: "POST", path: "/trendyol/import", shape: { body: z.object({ createMissing: z.boolean().optional().describe("create unknown products as drafts"), dryRun: z.boolean().optional().describe("only count, write nothing") }).default({}) },
    description: "Queue a Trendyol product import (links existing, optionally creates missing as drafts; never overwrites local stock/price). Track with trendyol_import_status. Try dryRun first." }),
  t({ name: "trendyol_clean_descriptions", title: "Clean HTML descriptions", level: "write", method: "POST", path: "/trendyol/import/clean-descriptions", shape: {}, description: "Convert HTML left in product descriptions to plain text (idempotent)." }),

  /* ================= full (consequential: money, customers, deletion, outbound messages) ================= */
  t({ name: "refund_order", title: "Refund order", level: "full", method: "POST", path: "/orders/:id/refund", shape: { id: id("order"), body: RefundBody }, description: "REFUND money to the customer via the payment provider (amount in minor units; full amount = order total). Irreversible." }),
  t({ name: "create_shipment", title: "Create shipment", level: "full", method: "POST", path: "/orders/:id/shipment", shape: { id: id("order"), body: ShipmentBody }, description: "Buy a shipping label for a WEBSITE order (billed by the carrier). serviceId comes from a quote. Trendyol orders are rejected (409)." }),
  t({ name: "create_invoice", title: "Issue order invoice", level: "full", method: "POST", path: "/orders/:id/invoice", shape: { id: id("order") }, description: "Queue the e-invoice/e-archive for a WEBSITE order (legal document). Trendyol orders are rejected (409)." }),
  t({ name: "anonymize_customer", title: "Anonymize customer", level: "full", method: "POST", path: "/customers/:id/anonymize", shape: { id: id("customer") }, description: "Irreversibly erase a customer's personal data (KVKK/GDPR request)." }),
  t({ name: "delete_product", title: "Delete product", level: "full", method: "DELETE", path: "/products/:id", shape: { id: id("product") }, description: "Delete a product (fails if it has orders; archive instead)." }),
  t({ name: "delete_category", title: "Delete category", level: "full", method: "DELETE", path: "/categories/:id", shape: { id: id("category") }, description: "Delete a category." }),
  t({ name: "delete_coupon", title: "Delete coupon", level: "full", method: "DELETE", path: "/coupons/:code", shape: { code: z.string().min(1).describe("coupon code") }, description: "Delete a coupon." }),
  t({ name: "delete_media", title: "Delete media", level: "full", method: "DELETE", path: "/media/:id", shape: { id: id("media") }, description: "Delete an uploaded file." }),
  t({ name: "delete_campaign", title: "Delete campaign", level: "full", method: "DELETE", path: "/campaigns/:id", shape: { id: id("campaign") }, description: "Delete a campaign and its delivery list (not while sending)." }),
  t({ name: "delete_manual_invoice", title: "Delete manual invoice", level: "full", method: "DELETE", path: "/manual-invoices/:id", shape: { id: id("manual invoice") }, description: "Delete a DRAFT manual invoice." }),
  t({ name: "send_campaign", title: "Send campaign", level: "full", method: "POST", path: "/campaigns/:id/send", shape: { id: id("campaign") },
    description: "SEND the campaign to every customer with marketing consent that matches its filters (real e-mails/SMS, costs money, cannot be recalled). Check campaign_audience + test_campaign first. Runs in the background (~40/min): poll get_campaign." }),
  t({ name: "send_email", title: "Send e-mail", level: "full", method: "POST", path: "/emails", shape: { body: ComposeEmailBody }, description: "Send ONE e-mail now (rate limited: 30/hour per admin, 5/day per recipient). Plain text body; unresolved {{placeholders}} are rejected." }),
  t({ name: "resend_email", title: "Resend failed e-mail", level: "full", method: "POST", path: "/emails/:id/resend", shape: { id: id("e-mail") }, description: "Resend an e-mail whose status is failed." }),
  t({ name: "send_sms", title: "Send SMS", level: "full", method: "POST", path: "/sms/send", shape: { body: z.object({ to: z.string().describe("+905301234567 or 05301234567"), text: z.string().min(1).max(1000) }) }, description: "Send ONE SMS now (billed per segment; 30/hour per admin, 300/day). Not for marketing to many people: use campaigns (consent)." }),
  t({ name: "issue_manual_invoice", title: "Issue manual invoice", level: "full", method: "POST", path: "/manual-invoices/:id/issue", shape: { id: id("manual invoice") }, description: "Issue a manual invoice to the e-invoice provider (legal document)." }),
  t({ name: "cancel_manual_invoice", title: "Cancel issued invoice", level: "full", method: "POST", path: "/manual-invoices/:id/cancel", shape: { id: id("manual invoice") }, description: "Cancel an issued manual invoice at the provider." }),
  t({ name: "test_notification", title: "Send test notification", level: "full", method: "POST", path: "/notifications/test", shape: { body: z.object({ channel: z.enum(["sms", "email"]), to: z.string(), lang: z.enum(["tr", "en"]).default("tr") }) }, description: "Send a [TEST] SMS/e-mail to one address (costs a segment). 5/hour." }),
  t({ name: "import_products_csv", title: "Import products from CSV", level: "full", method: "POST", path: "/import/products", upload: "csv", shape: { csv: z.string().min(1).describe("CSV text; must have slug and sku columns (see export_data products.csv for the format)") },
    description: "Create/update many products from CSV text (max 2 MB). Overwrites matching slugs. Export first as a backup." }),
  t({ name: "trendyol_call", title: "Raw Trendyol API call", level: "full", noConfirm: true, method: "POST", path: "/trendyol/call", shape: { body: TrendyolCallBody },
    description: "Call any Trendyol operation from the catalog (trendyol_list_operations). Read operations just run; write/destructive operations on the LIVE environment need body.confirm equal to the operationId. Mock mode returns fake data." }),
  t({ name: "geliver_call", title: "Raw Geliver API call", level: "full", noConfirm: true, method: "POST", path: "/geliver/call", shape: { body: GeliverCallBody },
    description: "Call any Geliver (shipping) operation from the catalog (geliver_list_operations). Billed operations (acceptOffer) and destructive ones need body.confirm equal to the operationId on LIVE accounts." }),
];

export const TOOL_BY_NAME = new Map(TOOLS.map((x) => [x.name, x]));

/** Routes deliberately NOT reachable through MCP (account takeover, secrets, mock state, factory reset). Format: "METHOD /path-pattern". */
export const EXCLUDED_ROUTES = [
  "GET /setup/status", "GET /orders/counts", "POST /setup", "POST /auth/login", "GET /auth/me", "POST /auth/logout", "POST /auth/logout-all", "POST /auth/password",
  "POST /auth/mfa/setup", "POST /auth/mfa/enable", "POST /auth/mfa/disable",
  "GET /users", "POST /users", "PATCH /users/:id", "DELETE /users/:id",
  "GET /tokens", "POST /tokens", "DELETE /tokens/:id", "GET /mcp/tools", "PUT /mcp/tools",
  "GET /oauth/authorize-info", "POST /oauth/authorize", "GET /oauth/grants", "DELETE /oauth/grants/:id", "GET /oauth/clients", "POST /oauth/clients", "DELETE /oauth/clients/:id",
  "PUT /settings/system", "DELETE /mock/messages", "GET /mock/messages", "PUT /integrations/:provider",
  "POST /system/reset", "DELETE /trendyol/history", "POST /trendyol/mock/reset", "GET /media/:id",
] as const;

/** JSON-Schema-friendly top-level object for a tool. */
export const inputSchema = (d: ToolDef) => {
  const shape: z.ZodRawShape = { ...d.shape };
  if (d.level === "full" && !d.noConfirm) shape["confirm"] = z.boolean().optional().describe("must be true to actually perform this action; without it the tool only describes what it would do");
  return z.object(shape);
};

/* ---------- grouping for the admin screen ---------- */
export const TOOL_GROUPS = ["overview", "orders", "customers", "catalog", "seo", "messaging", "invoices", "trendyol", "geliver", "system"] as const;
export type ToolGroup = (typeof TOOL_GROUPS)[number];
const GROUP_BY_SEGMENT: Record<string, ToolGroup> = {
  dashboard: "overview", orders: "orders", customers: "customers", "customer-lookup": "customers",
  products: "catalog", categories: "catalog", coupons: "catalog", inventory: "catalog", "catalog-lookup": "catalog", media: "catalog", export: "catalog", import: "catalog", seo: "catalog",
  emails: "messaging", sms: "messaging", campaigns: "messaging", notifications: "messaging",
  "manual-invoices": "invoices", trendyol: "trendyol", geliver: "geliver",
};
export const groupOf = (d: ToolDef): ToolGroup => (/seo/.test(d.name) ? "seo" : GROUP_BY_SEGMENT[d.path.split("/")[1] ?? ""] ?? "system");

/** Static knowledge the AI client reads once: how OpenShelf works, so tool use is correct without trial and error. */
export const GUIDE_URI = "openshelf://guide";

export const GUIDE = `# OpenShelf store management guide

You manage an e-commerce store (Turkish market) through these tools. Everything goes through the real admin API: the same validation, permissions and audit log apply.

## Conventions
- **Money is in minor units** (kuruş): 1999 = 19.99 TRY. Never send decimals.
- Customer-facing language is Turkish (tr) with English (en) alternatives. Currency is TRY.
- Lists are paged: page (from 1), pageSize (max 100). Look at "total" in the result.
- Ids are opaque strings; get them from list_* tools. Never invent ids.
- Tool results are JSON. A failed call returns the API error code and message: read it and correct the input.

## Safety model
- Your token has a level: read (look only), write (create/edit, reversible), full (also money, customer messages, deletion).
- Tools marked destructive need confirm: true. Without it they only describe what would happen. Ask the human before confirming anything that spends money, messages customers or deletes data.
- Never reveal personal data (names, phones, e-mails, addresses) beyond what the question needs.

## Domain rules
- **Orders**: statuses pending → awaiting_payment → paid → fulfilling → shipped → delivered; cancelled/refunded are terminal-ish. paid/refunded are set by payment flows, not by update_order_status.
- **Channels** (orders.source): "website" orders are shipped via Geliver and invoiced via the e-invoice provider (create_shipment / create_invoice). "trendyol" orders are shipped and invoiced BY Trendyol; OpenShelf only mirrors them (cargo info appears on the order) and prints a shipping slip. Shipping/invoice tools reject Trendyol orders with channel_managed.
- **Stock**: OpenShelf is always the source of truth. Changing stock (adjust_stock) is pushed to Trendyol automatically; Trendyol never overwrites local stock.
- **Products**: draft products are invisible on the storefront; archived are hidden. A product has variants (sku, barcode, per-channel prices website/trendyol, stock).
- **Marketing**: campaigns and any bulk message only reach customers whose latest consent is "marketing: yes". Unsubscribe links are added automatically and honoured immediately. Workflow: create_campaign (draft) → campaign_audience → preview_campaign → test_campaign → ask the human → send_campaign → poll get_campaign.
- **Settings**: use the typed patch tools (update_store_profile for the store name/contact/tax, update_seo_settings, update_branding, update_legal_pages, update_checkout_settings, update_tracking_settings, update_notification_settings): send ONLY the fields to change, nested objects merge. update_settings replaces a whole group (avoid). Read with get_settings_group.
- **SEO**: start with seo_audit (site-wide + per-product gaps), fix per item with update_product_seo / update_category_seo (title ≤70 ideally 50-60 chars, description ≤320 ideally 120-160) and site-wide with update_seo_settings / update_store_profile, then verify with seo_preview. Social images: 1200×630 (get_image_specs). robotsIndex=false hides the whole store from search engines.
- **Images**: before generating ANY image call get_image_specs (sizes, aspect ratios, safe areas, file limits per kind). Typical: product 1600×2000 (4:5), home banner 2400×1050 (16:7, subject in the central 35%), social/OG 1200×630, logo 600×144 transparent, favicon 512×512. Upload full-size images with upload_media_from_url (public https link; the server downloads it) or create_upload_link (one-time PUT link); upload_media (base64) is only for tiny files because chat clients truncate long arguments. Read the warnings (wrong ratio/too small → regenerate), then attach the returned id (product images, branding settings, seoOgMediaId). No text baked into product photos or banners.
- **Mock mode**: when enabled nothing real is sent/charged (check mock_status). Results are labelled mock.
- **Problems**: look at list_integration_events and list_outbox_jobs (retry with retry_outbox_job), trendyol_health for marketplace sync.
`;

export const PROMPTS: { name: string; description: string; text: string }[] = [
  { name: "generate_product_images", description: "Plan and upload images for a product that fit the store", text: "Ask me which product. Call get_image_specs and get_product. Describe the images you would generate (angles, background, 1600×2000 4:5, subject centred with margin, no text). After I approve, generate them, upload each with upload_media (kind=product, with alt text), check the warnings, then update_product to attach the media ids (best shot first). Do not delete existing images without asking." },
  { name: "daily_report", description: "Summarise how the store is doing today", text: "Use store_overview and list_orders (newest first) to write a short daily report: orders and revenue today, orders waiting to ship (website vs Trendyol), low-stock products, failed background jobs or integration errors. Money in TRY with 2 decimals. Be concise." },
  { name: "low_stock_review", description: "Find products running out of stock", text: "List active products (list_products, status=active) and find variants with low or zero stock. Return a table: product, sku, stock. Do NOT change stock; suggest what to reorder." },
  { name: "unshipped_orders", description: "Which paid orders still need action", text: "List orders with status paid or fulfilling (list_orders). Split them into website orders (need a shipment: create_shipment) and Trendyol orders (Trendyol ships them; check cargo info via get_order). Report counts and the oldest ones. Do not create shipments without asking." },
  { name: "draft_campaign", description: "Draft a marketing campaign (does not send)", text: "Ask me for the goal and channel (email or sms). Then create_campaign as a DRAFT with a short Turkish message using {{name}}, run campaign_audience, preview_campaign and tell me the audience size. Do NOT call send_campaign; I will confirm separately." },
];

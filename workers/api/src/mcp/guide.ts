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
- **Settings**: update_settings replaces a whole group. Always get_settings first and send back the complete group.
- **Mock mode**: when enabled nothing real is sent/charged (check mock_status). Results are labelled mock.
- **Problems**: look at list_integration_events and list_outbox_jobs (retry with retry_outbox_job), trendyol_health for marketplace sync.
`;

export const PROMPTS: { name: string; description: string; text: string }[] = [
  { name: "daily_report", description: "Summarise how the store is doing today", text: "Use store_overview and list_orders (newest first) to write a short daily report: orders and revenue today, orders waiting to ship (website vs Trendyol), low-stock products, failed background jobs or integration errors. Money in TRY with 2 decimals. Be concise." },
  { name: "low_stock_review", description: "Find products running out of stock", text: "List active products (list_products, status=active) and find variants with low or zero stock. Return a table: product, sku, stock. Do NOT change stock; suggest what to reorder." },
  { name: "unshipped_orders", description: "Which paid orders still need action", text: "List orders with status paid or fulfilling (list_orders). Split them into website orders (need a shipment: create_shipment) and Trendyol orders (Trendyol ships them; check cargo info via get_order). Report counts and the oldest ones. Do not create shipments without asking." },
  { name: "draft_campaign", description: "Draft a marketing campaign (does not send)", text: "Ask me for the goal and channel (email or sms). Then create_campaign as a DRAFT with a short Turkish message using {{name}}, run campaign_audience, preview_campaign and tell me the audience size. Do NOT call send_campaign; I will confirm separately." },
];

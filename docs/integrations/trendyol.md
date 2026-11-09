# Trendyol (marketplace)

[Türkçe](trendyol.tr.md)

## What it does

Pushes stock and price (the `trendyol` channel price) to Trendyol through the outbox, pulls Trendyol orders by cron reconciliation (and webhook if configured), maps products by SKU/barcode, and records stock decrements as `trendyol_sale` ledger movements.

## Keys needed

Seller (supplier) ID, API key and API secret from the Trendyol seller panel integration section. Enter in Admin → Settings → Integrations → Trendyol; key/secret are encrypted. Then map variants (Products → channel listings) and set the Trendyol channel price.

## Webhook

If you use Trendyol webhooks, point them to `<API_ORIGIN>/webhooks/trendyol`. Cron reconciliation works without it.

## Sandbox

Trendyol provides a stage/test environment on request for some integrations; availability and hosts are Trendyol's. Confirm in their current docs. Without it, test with a small number of real SKUs and low stock.

## Caveats

Trendyol Express or any Trendyol-specific shipping is NOT assumed or implemented; shipment info is updated only through supported APIs. Rate limits and category/attribute requirements are Trendyol's. Order import creates source=`trendyol` orders unique on external id. Stock drift is visible on the admin dashboard; use reconcile before trusting numbers. Adapter tested with mocks, not live accounts.

## Importing products from Trendyol (OpenShelf stays the source of truth)

Admin → **Trendyol console → Products → Mappings → Import from Trendyol** (or `POST /api/admin/trendyol/import`) pages through your **approved** Trendyol products (`filterApprovedProducts`, 100 contents per page, one outbox job per page) and applies them locally:

1. **Match** each Trendyol variant to a local variant: existing Trendyol mapping (barcode), then local `barcode`, then local `sku` = Trendyol stock code (or barcode).
2. **Matched**: the mapping and the Trendyol channel listing are created/updated. Existing local title, prices and stock are never overwritten.
3. **Unmatched**: skipped, or created as **draft** products when "Create products that do not exist yet" is on (category by name, images, variants, stock, `trendyol` and `website` prices). Ids derive from the Trendyol ids, so re-running never duplicates.
4. **Preview** (dry run) only counts what would happen. The last run's result is shown on the page (`sync_cursors[trendyol:products:last]`).

**Source of truth is always OpenShelf.** Stock changes made here (sales, admin edits, imports of Trendyol orders) are pushed to Trendyol through `trendyol.stock_push`; Trendyol never overwrites local stock, price or content. The old *Source of truth: Trendyol* option was removed (stored values are ignored). The import is a one-off action that links products and, with *create missing*, adds unknown ones as drafts with their initial stock. After Trendyol orders are imported (they decrement local stock) a stock push is queued so Trendyol follows OpenShelf.

**Orders and fulfilment.** Orders are channel-aware (`orders.source`). Website orders: Geliver ships and efaturam invoices them. Trendyol orders: Trendyol ships and invoices them; OpenShelf mirrors the order and its cargo data (carrier, tracking number and link, package id, stored as a `shipments` row with `provider = "trendyol"`, filled in as soon as Trendyol assigns it) and prints a **Trendyol shipping slip** (label print, 100x150 mm) from it. Manual shipment/invoice actions are hidden and the API answers `409 channel_managed` for non-website orders; queued `shipment.create` / `invoice.issue` jobs skip them.

**Categories.** Imported products get their Trendyol category with its full parent chain (`ty-cat-<id>`, e.g. Giyim → Erkek Giyim → Tişört), created parents-first from Trendyol's category tree. The tree is fetched only when a needed category does not exist locally yet, so normal syncs do not download it. A local category with the same name is reused instead of creating a duplicate. If the tree cannot be fetched, a flat category without a parent is created.

Not imported: unapproved/rejected products, product attributes beyond variant options, Like the rest of the adapter, this was tested against mocks and the documented response shape, not a live seller account.

## API console

Admin → **Trendyol console** (owner/admin only) is a hands-on console for the whole public marketplace API (83 operations): task views for products (with a create-product wizard), recent sales, returns, questions and finance, plus an API explorer with risk levels, a `confirm` step for live writes and a 30-day call history (no personal data stored). Mock Mode runs it offline with demo data; stage needs Trendyol-side IP whitelisting and separate credentials. Like the adapter, it has not been verified against a live seller account. User guide: [EN](../../apps/admin/src/help/en/15-trendyol.md) · [TR](../../apps/admin/src/help/tr/15-trendyol.md) (also in the admin Help page). Contract: [api-contract.md](../api-contract.md).

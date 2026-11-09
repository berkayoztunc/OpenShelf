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

## Importing products from Trendyol (Trendyol as source of truth)

Admin → **Trendyol console → Products → Mappings → Import from Trendyol** (or `POST /api/admin/trendyol/import`) pages through your **approved** Trendyol products (`filterApprovedProducts`, 100 contents per page, one outbox job per page) and applies them locally:

1. **Match** each Trendyol variant to a local variant: existing Trendyol mapping (barcode), then local `barcode`, then local `sku` = Trendyol stock code (or barcode).
2. **Matched**: the mapping and the Trendyol channel listing are created/updated. Nothing else is touched unless the source of truth is Trendyol (below).
3. **Unmatched**: skipped, or created as **draft** products when "Create products that do not exist yet" is on (category by name, images, variants, stock, `trendyol` and `website` prices). Ids derive from the Trendyol ids, so re-running never duplicates.
4. **Preview** (dry run) only counts what would happen. The last run's result is shown on the page (`sync_cursors[trendyol:products:last]`).

**Source of truth.** In Settings → Integrations → Trendyol set *Source of truth* to **Trendyol**. Then, every 15 minutes (cron), the import also overwrites title, description, brand, images, active flag, prices (`trendyol` and `website`; list price becomes the compare-at price) and stock of linked products, and creates missing ones as drafts. Stock is written through the ledger as `trendyol_sync` movements so that `available = total - reserved - safety_stock` equals the Trendyol quantity. In this mode OpenShelf **stops pushing** stock and price to Trendyol (`trendyol.stock_push` is a no-op); orders are still imported and decrement stock, and the next import restores Trendyol's number. Website sales therefore do not reach Trendyol: use this mode only when Trendyol is where you manage inventory.

Not imported: unapproved/rejected products, product attributes beyond variant options, Trendyol categories (matched by name only). Like the rest of the adapter, this was tested against mocks and the documented response shape, not a live seller account.

## API console

Admin → **Trendyol console** (owner/admin only) is a hands-on console for the whole public marketplace API (83 operations): task views for products (with a create-product wizard), recent sales, returns, questions and finance, plus an API explorer with risk levels, a `confirm` step for live writes and a 30-day call history (no personal data stored). Mock Mode runs it offline with demo data; stage needs Trendyol-side IP whitelisting and separate credentials. Like the adapter, it has not been verified against a live seller account. User guide: [EN](../../apps/admin/src/help/en/15-trendyol.md) · [TR](../../apps/admin/src/help/tr/15-trendyol.md) (also in the admin Help page). Contract: [api-contract.md](../api-contract.md).

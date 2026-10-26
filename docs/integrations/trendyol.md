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

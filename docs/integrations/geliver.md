# Geliver (shipping)

[Türkçe](geliver.tr.md)

## What it does

Gets shipping quotes, creates shipments and labels, tracks parcels and cancels shipments from the admin order page (`POST /api/admin/orders/:id/shipment`). Tracking events update `shipments` and `shipment_events`.

## Keys needed

A Geliver API token from your Geliver account. Enter in Admin → Settings → Integrations → Geliver (stored encrypted). Also fill sender/store address and phone in Settings → General.

## Sandbox

Check Geliver's documentation for a test environment or test token; use it for the first shipments and cancel them. Hosts and availability are Geliver's.

## Caveats

Available carriers, prices and cash-on-delivery support depend on your Geliver contract. Parcel weight/desi come from variant `weight_grams` (set it for real products). Label generation may be billed by the carrier. Adapter tested with mocks, not live accounts.

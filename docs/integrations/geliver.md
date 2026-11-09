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

## Geliver console

Admin → **Geliver console** (owner/admin only; shipping data contains customer addresses) is where you check that the integration works before real orders depend on it:

- **Try it**: (1) *Connection test* reads your sender address, so a pass proves token and address ID; (2) *Price quote* asks for carrier offers for a parcel size; (3) *Test shipment* creates a shipment to a demo recipient, accepts an offer (label + tracking number), checks tracking and cancels it. The end-to-end flow only runs in Geliver **test mode** (or Mock Mode) and never buys real labels.
- **Shipments**: paged list from Geliver with details and cancel.
- **API explorer**: 18 operations (shipments, offers/labels, addresses, account, webhooks, cities/districts) with generated parameter forms, JSON body editor and response viewer. Live write/destructive calls ask for confirmation first and the server requires `confirm = operationId`; calls that can be charged are marked. Calls are audit-logged and live changes also appear in *Integration events*.
- **Mock Mode** answers every operation offline with deterministic fake data (same input validation), so you can try the whole screen without a Geliver account.

Paths for webhooks, cities and districts come from the official SDKs and are not verified against a live account; the console is the quickest way to check them in test mode. Like the adapter, the console is tested with mocks, not a live account.

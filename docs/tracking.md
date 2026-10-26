# Tracking: GA4 + Meta with Consent Mode v2

[Türkçe](tracking.tr.md)

## Model

- Public IDs (GA4 Measurement ID, GTM container, Meta Pixel ID, Meta test event code) go in Admin → Settings → Tracking.
- Secrets (GA4 Measurement Protocol `api_secret`, Meta Conversions API access token) go in Admin → Settings → Integrations (encrypted).
- The storefront loads nothing until consent is decided (when `consentRequired` is on). Consent state `{necessary, analytics, marketing}` is stored client-side and recorded via `POST /api/store/consent` (`customer_consents`).
- Consent Mode v2: defaults are `denied` for `ad_storage`, `ad_user_data`, `ad_personalization`, `analytics_storage` before the banner choice; the banner updates them (analytics maps to `analytics_storage`; marketing maps to the three ad signals).
- Server-side: purchase events are sent by the Worker only from a verified payment and only if the order's stored consent snapshot allows it. Otherwise the attempt is recorded as `skipped_no_consent`.

## Events

| Canonical (GA4) | Meta | Notes |
|---|---|---|
| `page_view` | `PageView` | |
| `view_item_list` | none | GA4 only |
| `view_item` | `ViewContent` | `content_ids` = variant id |
| `search` | `Search` | |
| `add_to_cart` | `AddToCart` | |
| `begin_checkout` | `InitiateCheckout` | |
| `add_payment_info` | `AddPaymentInfo` | |
| `purchase` | `Purchase` | server-generated only, on verified payment |
| `refund` | none | GA4 only |

Item id = product variant id everywhere (GA4 `item_id`, Meta `content_ids`), and matches the Meta catalog feed (`/feeds/meta.xml`, `/feeds/meta.csv`). Money values in events are major units (e.g. 199.90), unlike the database.

## Deduplication via `event_id`

Each event carries a UUID `event_id`. The browser pixel sends it as `eventID`; the server (CAPI) sends the same value as `event_id`. Meta dedupes browser+server pairs with the same event name and id (within its window). For GA4, the Measurement Protocol `transaction_id` plus our `marketing_events` unique key `(event_id, name, destination)` prevent double server sends; avoid also firing a browser `purchase` with a different id. The order page does not fire a browser purchase when the server is the source of truth (see storefront implementation notes).

Attribution (`fbc`, `fbp`, `fbclid`, `gclid`, GA client id, UTM) is captured at checkout and stored with the order for server events. Customer identifiers sent to Meta are SHA-256 hashed after normalization.

## Testing

Meta:
1. Events Manager → your Pixel → Test events; copy the test code to Admin → Settings → Tracking → Meta test event code.
2. Browse the storefront (accept marketing consent), confirm browser events appear. Place a sandbox order and confirm a server `Purchase` shows as "Server" and is deduplicated against a browser event when both exist.
3. Remove the test code before launch.

GA4:
1. Add `?debug_mode=1` or use the GA Debugger extension; open Admin → DebugView.
2. Verify events and parameters, and that no events fire before consent. Measurement Protocol server events appear in DebugView only when validated with debug endpoint; check Realtime/Reports for server purchases.
3. In Admin → Marketing events (OpenShelf) check statuses: `sent`, `failed`, `skipped_no_consent`.

## Caveats

- Consent banner wording and legality are your responsibility ([legal-notes.md](legal-notes.md)).
- Ad blockers and consent denial reduce browser event volume; that is expected.
- Meta/GA4 UIs and requirements change; confirm against current vendor docs.

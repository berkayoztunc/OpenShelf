# Google Analytics 4

[Türkçe](ga4.tr.md)

## What it does

Browser GA4 events with Consent Mode v2, plus server-side purchase via the Measurement Protocol for verified payments.

## Keys needed

Measurement ID (`G-XXXXXXX`): Admin → Settings → Tracking (public); optional GTM container ID. Measurement Protocol API secret (GA4 Admin → Data streams → your stream → Measurement Protocol API secrets): Admin → Settings → Integrations → GA4 (secret, encrypted).

## Testing

GA4 Admin → DebugView; see [../tracking.md](../tracking.md).

## Caveats

Nothing loads before analytics consent when consent is required. Server purchases need the browser's GA client id captured at checkout; without it attribution is limited. GA4 processing delays and thresholds apply. Adapter tested with mocks, not live accounts.

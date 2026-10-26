# Meta (Pixel + Conversions API)

[Türkçe](meta.tr.md)

## What it does

Browser Pixel events (after marketing consent) plus server-side Conversions API for verified purchases, deduplicated by `event_id`. Also a product catalog feed at `/feeds/meta.xml` and `/feeds/meta.csv`.

## Keys needed

Pixel ID: Admin → Settings → Tracking (public). Conversions API access token (generated in Events Manager → Settings): Admin → Settings → Integrations → Meta (secret, encrypted). Optional Test Events code: Settings → Tracking.

## Testing

Use Events Manager → Test events with the test code; see [../tracking.md](../tracking.md). Remove the test code before launch.

## Caveats

Server events are sent only when the order consent snapshot allows marketing. Customer data is normalized and SHA-256 hashed before sending. Graph API versions and Meta requirements change; confirm against current docs. Catalog feed: add it as a scheduled feed URL in Commerce Manager. Adapter tested with mocks, not live accounts.

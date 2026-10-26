# Architecture

[Türkçe](architecture.tr.md)

```
 Browser                          Cloudflare (ONE Worker)
 ┌──────────────┐  /  (static assets)   ┌───────────────────────────────┐        ┌──────────┐
 │ Storefront   │◄─────────────────────►│ Worker (Hono)                 │◄──────►│ D1       │
 │ (React/Vite) │  /api/store/*         │  /            storefront      │        │ (SQLite) │
 └──────────────┘──────────────────────►│  /admin/      admin panel     │        └──────────┘
 ┌──────────────┐  /admin/, /api/admin/*│  /api/*  /webhooks/*  /media  │
 │ Admin (React)│──────────────────────►│  /feeds/*  /mock/* (if on)    │
 └──────────────┘  cookie + CSRF        │  scheduled(): cron every min  │──┐ outbox jobs
                                        └───────────┬───────────────────┘  ▼
                                                    │ optional    ┌────────────────────────┐
                                               ┌────▼────┐        │ Adapters               │
                                               │ R2      │        │ iyzico, Trendyol,      │
                                               │ (media) │        │ Geliver, e-Faturam,    │
                                               └─────────┘        │ Meta CAPI, GA4 MP,     │
                                                                  │ Netgsm, Twilio,        │
                                                                  │ Cloudflare Email       │
                                                                  └────────────────────────┘
```

Single tenant: one store per deployment, one D1 database. **One Worker** serves everything (static assets for the storefront and admin, plus the API), configured by the root `wrangler.jsonc`. Required: Worker + D1. Optional: R2 (media; otherwise small files are stored as D1 blobs), Queues (not required). There is no separate Pages project and no cross-origin setup.

## Notifications

Order events enqueue outbox jobs `notify.<event>` (SMS via Netgsm or Twilio, e-mail via Cloudflare Email Service). Templates, channel switches, country allowlist and daily caps are described in [notifications.md](notifications.md).

## Mock Mode

A global owner-only switch (`system.mockMode`, requires the `ALLOW_MOCK` variable on a deployed Worker) that resolves every adapter to an offline mock: fake payment page under `/mock/*`, and SMS/e-mail/invoice/shipment/event records in the `mock_messages` table (Mock Inbox). It is exclusive with real payments. See [mock-mode.md](mock-mode.md).

## Settings and secrets

`store_settings` holds public settings per group (general, branding, seo, legal, checkout, tracking), validated by Zod. `integration_configs` holds per-provider public config plus secrets as AES-256-GCM ciphertext (`secrets_enc`, `secrets_iv`, `key_version`). The master key is the Worker secret `APP_ENCRYPTION_KEY`. The admin API never returns secret values, only masked hints.

## Inventory ledger

- `inventory(total, reserved, safety_stock)` is the current state; `available = total - reserved - safety_stock`.
- `inventory_movements` is an append-only ledger (adjustment, sale, return, trendyol_sale, reservation, release). Every change to `total` has a movement row, so drift can be audited and reconciled.
- Reservations (`inventory_reservations`) are created at checkout with `expires_at`. Reserve and convert run in one `db.batch()` transaction guarded by `UPDATE ... WHERE total - reserved >= qty` and a rows-changed check, which prevents overselling under concurrency. The cron releases expired reservations.

## Purchase flow

1. Storefront builds a server-side cart; `POST /api/store/checkout` validates input (Zod, optional Turnstile), prices from D1 (never client prices), reserves stock, creates order (`pending`) and a payment via the active PaymentProvider (iyzico hosted checkout form; card data never touches OpenShelf).
2. Customer pays on the provider page and returns to the callback; the provider also calls the webhook.
3. The Worker verifies the signature on the raw body, then re-retrieves the payment server-to-server and checks amount/currency/order match. Replays are rejected via `webhook_receipts (provider, event_id)` and `payments (provider, provider_tx_id)` uniqueness.
4. On verified success, one transaction: payment to `succeeded`, order to `paid`, reservation to `converted`, inventory movements written.
5. Then outbox jobs are enqueued (never blocking the webhook response): `marketing.purchase`, `invoice.issue`, `shipment.create` (if auto), `trendyol.stock_push`.

Purchase events for analytics are generated only server-side from verified payments.

## Outbox

`outbox_jobs(kind, payload, dedupe_key UNIQUE, status, attempts, next_run_at)`. The cron (every minute) claims due jobs, runs the registered handler (`registerJobHandler(kind, fn)`), marks `done`, or retries with exponential backoff up to `max_attempts`, then `dead`. `dedupe_key` makes enqueueing idempotent; handlers must be idempotent too (e.g. invoices unique on `(order_id, type)`). Failures show in Admin → integration events and outbox, with manual retry. External calls only happen here, never inside request-critical paths.

## Event dedup (tracking)

Browser and server send the same `event_id` (UUID) for the same action, so Meta and GA4 can dedupe. Server sends are recorded in `marketing_events` with a unique key `(event_id, name, destination)`, so retries cannot double-send. Details: [tracking.md](tracking.md).

## Marketplace sync

Trendyol: stock/price pushes through the outbox; orders pulled by cron reconciliation (and webhook if configured), inserted with `orders (source, external_order_id)` uniqueness; stock decrements recorded as `trendyol_sale` movements.

## Security boundaries

Admin: HttpOnly `__Host-` session cookie, CSRF token + Origin check, optional TOTP, RBAC, audit log. Public API: rate limits, Zod, CORS to known origins. Outbound: fixed host allowlist per adapter. See [security.md](security.md).

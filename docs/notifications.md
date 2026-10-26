# Notifications

[Türkçe](notifications.tr.md)

OpenShelf sends **transactional** messages only (order updates). There is no marketing or bulk sending.

## Providers

| Channel | Provider | Guide |
|---|---|---|
| SMS | Netgsm | [integrations/netgsm.md](integrations/netgsm.md) |
| SMS | Twilio | [integrations/twilio.md](integrations/twilio.md) |
| E-mail | Cloudflare Email Service (Beta) | [integrations/cloudflare-email.md](integrations/cloudflare-email.md) |

Enable a provider under **Settings, Integrations**. A channel only fires if its provider is enabled (or Mock Mode is on, in which case messages go to the Mock Inbox, see [mock-mode.md](mock-mode.md)). All providers are implemented but UNVERIFIED against live accounts.

## Events

| Event | Recipient |
|---|---|
| `order_paid` | customer |
| `order_shipped` | customer |
| `order_delivered` | customer |
| `order_cancelled` | customer |
| `order_refunded` | customer |
| `admin_new_order` | store admin (`adminEmail` / `adminPhone` in settings) |

In **Settings, Notifications** pick SMS, e-mail or both per event (defaults: e-mail on, SMS off). Messages are queued as outbox jobs (`notify.<event>`), so a slow provider never blocks checkout; failures retry with backoff and show up in Integration events. Per-order history is available at `GET /api/admin/orders/:id/notifications`.

## Settings

| Field | Meaning |
|---|---|
| From name / From e-mail | sender of e-mails (domain must be onboarded to Cloudflare Email Sending) |
| SMS sender ID | up to 11 characters (Netgsm `msgheader`, Twilio alphanumeric sender); overrides the provider's own setting |
| Admin e-mail / phone | recipient of `admin_new_order`; phone in E.164 (`+905301234567`) |

## Templates

Per language (TR/EN) and event, subject (e-mail only) and body, up to 2000 characters. Empty fields fall back to built-in defaults. Allowed variables:

`{{orderNumber}}` `{{customerName}}` `{{total}}` `{{trackingNumber}}` `{{trackingUrl}}` `{{storeName}}` `{{orderUrl}}`

Unknown variables render empty. The editor shows a live preview and, for SMS, the encoding (GSM-7 or UCS-2) and segment count: Turkish characters such as ç, ğ, ı, ş switch a message to UCS-2 (70 characters per segment instead of 160), which costs more. Values are HTML-escaped in e-mail and stripped of line breaks in subjects.

## Abuse and cost protection

Intended behaviour of the current release:

- **Country allowlist:** SMS is only sent to numbers whose country code is allowed; the default is `+90` (Turkey). Others are skipped and recorded.
- **Per-recipient daily caps** for SMS and e-mail.
- Phone numbers must be valid E.164; Turkish local formats (`05301234567`) are normalized.
- Test sends are limited to 5 per hour per admin and 10 per hour per IP.
- Provider credentials are encrypted at rest and scrubbed from errors and logs.

## Test send

**Settings, Notifications, Send test**: choose channel, recipient and language. The message is marked `[TEST]`. API: `POST /api/admin/notifications/test` with `{ "channel": "sms" | "email", "to": "...", "lang": "tr" | "en" }` (admin role). Returns `503 no_provider` if no provider of that kind is enabled.

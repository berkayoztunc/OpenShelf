# Cloudflare Email Service (e-mail)

[Türkçe](cloudflare-email.tr.md)

## What it does

Sends transactional order e-mails through Cloudflare Email Sending (REST API on `api.cloudflare.com`, the only allowed host). See [../notifications.md](../notifications.md).

> **Beta, with plan limits.** Cloudflare Email Sending is in Beta. Sending to arbitrary recipients requires the **Workers Paid** plan. On the **Free** plan you can only send to verified destination addresses. Check Cloudflare's current documentation and pricing.

## Keys needed

Enter in Admin, Settings, Integrations, Cloudflare Email Service (stored encrypted):

| Field | Meaning |
|---|---|
| `accountId` | your 32-character Cloudflare account ID |
| `apiToken` (secret) | API token allowed to send e-mail (Email Sending: Send/Edit) |
| `fromEmail` | default From address, e.g. `orders@yourdomain.com` |

Settings, Notifications, From e-mail overrides `fromEmail`. The sender domain must be onboarded to Email Sending and its DNS records verified, otherwise the From address is rejected.

## Sandbox and testing

On the Free plan, add your own address as a verified destination and send a test from Settings, Notifications. For demos without any account use Mock Mode ([../mock-mode.md](../mock-mode.md)).

## Caveats

- Status: implemented from vendor docs, **UNVERIFIED against a live account**; the Beta API may change.
- Subjects are stripped of control characters; the HTML body is fully escaped. Plain-text and HTML parts are both sent.
- Deliverability (SPF, DKIM, DMARC) depends on your domain setup.

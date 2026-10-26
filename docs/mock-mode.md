# Mock Mode

[Türkçe](mock-mode.tr.md)

Mock Mode replaces every external provider (payment, shipping, invoicing, marketplace, analytics, SMS, e-mail) with an offline stand-in. Use it to demo the shop, develop, or walk through the full order flow without any provider account. It is global and **owner-only**.

## What changes

| Area | In Mock Mode |
|---|---|
| Checkout | redirects to a fake payment page at `/mock/pay/<token>` with **Success**, **Fail** and **Cancel** buttons |
| SMS and e-mail | not sent; recorded in the **Mock Inbox** |
| Invoices and shipping labels | placeholder PDFs served from `/mock/doc/...`, recorded in the Mock Inbox |
| Analytics and marketing events | recorded in the Mock Inbox, not sent |
| Integration forms | render the same fields as the real ones, but need no real credentials |

`/mock/*` answers `404` whenever Mock Mode is off.

## Enable it

1. On a deployed Worker, set the variable `ALLOW_MOCK` (Dashboard, Workers, your Worker, Settings, Variables and Secrets; or `vars` in `wrangler.jsonc`) to `true`. Local dev: the example in `.dev.vars.example` sets it.
2. Log in as an **owner** and switch on **Settings, System, Mock mode** (confirm the dialog). The API call is `PUT /api/admin/settings/system`.
3. A **Mock inbox** entry appears in the admin sidebar.

`node tooling/setup/setup.mjs --mock` prints these steps after a deploy.

## Safety rules

These are enforced by the API (intended behaviour of the current release):

- **`ALLOW_MOCK` is required.** A deployed Worker without it refuses to turn Mock Mode on.
- **Mock and real are exclusive.** Mock Mode cannot be enabled while a real payment provider is enabled, or while real paid orders exist. Orders paid through the fake page are flagged with `payments.is_mock`.
- **Owner only**, audited as `mock_mode.enabled` / `mock_mode.disabled`.
- **Bounded inbox:** the Mock Inbox keeps 7 days and at most 2000 rows; an owner can clear it.
- Fake payment tokens are signed with `APP_ENCRYPTION_KEY`; the mock page has a strict CSP and no scripts.

Switch Mock Mode off, and remove `ALLOW_MOCK`, before you take real orders.

## Mock Inbox

Admin sidebar, **Mock inbox**. Filter by channel (`sms`, `email`, `event`, `invoice`, `shipment`, `payment`). Read-only for admins; clearing is owner-only (`DELETE /api/admin/mock/messages`).

## Demo walkthrough

```bash
pnpm install
pnpm setup:local
pnpm seed          # demo store "OpenShelf Demo"
pnpm dev
```

1. Open `http://localhost:5174/admin/setup`, create the owner (token from `workers/api/.dev.vars`).
2. Settings, System: enable Mock mode.
3. Settings, Notifications: enable `order_paid` for e-mail (and SMS if you like).
4. Open the storefront (`http://localhost:5173`), add a product, check out with a Turkish phone number (`+90...`).
5. On the fake payment page press **Success**.
6. In the admin: the order is `paid`; the Mock inbox holds the payment, e-mail/SMS, and (if configured) invoice and shipping entries.

Related: [notifications.md](notifications.md), [deploy-cloudflare.md](deploy-cloudflare.md), [security.md](security.md).

# iyzico (payments)

[Türkçe](iyzico.tr.md)

## What it does

Hosted checkout form: customers pay on iyzico's page, card data never touches OpenShelf. The Worker verifies the callback/webhook signature and re-retrieves the payment server-to-server before marking an order paid. Refunds from the admin order page.

## Keys needed

API key and Secret key from your iyzico merchant panel (separate sandbox and production sets), and the environment selection (sandbox/production). Enter in Admin → Settings → Integrations → iyzico; the secret key is stored encrypted and shown masked afterwards. Use "Test connection" to run the health check.

## Webhook / callback

Callback URL: `<API_ORIGIN>/api/store/payment/callback/iyzico`. Webhook URL: `<API_ORIGIN>/webhooks/payment/iyzico`. Configure the webhook in the iyzico panel if your account supports it.

## Sandbox

Start with sandbox keys and iyzico's published test cards (see iyzico docs). Switch to production keys only after a full test order and refund.

## Caveats

Requires an approved iyzico merchant account. Buyer identity/address fields required by iyzico may need to be collected at checkout. Installments, fees and settlement are iyzico's terms. Adapter is tested with mocks and contract tests, not live accounts.

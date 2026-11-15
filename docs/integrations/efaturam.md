# e-Faturam (e-Invoice / e-Archive)

[Türkçe](efaturam.tr.md)

## What it does

Issues e-Fatura or e-Arşiv invoices for orders (only on demand: the **Issue invoice** button on the order page queues the `invoice.issue` outbox job; there is NO automatic invoice after payment), stores number and PDF/URL. Idempotent per `(order_id, type)` so retries cannot create duplicates.

## Keys needed

The e-mail address and password you sign in to e-Faturam with (Admin → Settings → Integrations → e-Faturam; secret fields are encrypted). OpenShelf signs in at `POST /api/auth/signin` and sends the returned `x-access-token` on every request. `companyId` and `userId` are read from that token; if "Test connection" says they could not be found, enter them in the two optional fields. Set seller tax ID and legal address in Settings → General.

## Sandbox

Pick the environment in the form. Live is `https://apigateway.trendyolecozum.com`, test is `https://stage-apigateway.trendyolefaturam.com`; no other host is accepted. The test gateway needs your IP whitelisted by e-Faturam and uses separate credentials. e-Faturam's FAQ for individual integrations says the API only works from registered IP addresses, while the marketplace reference says the live gateway has no IP restriction. A Cloudflare Worker has no fixed egress IP, so an environment that needs a registered IP is not reachable from a deployed Worker; a blocked request answers 403 and the console reports it as an IP block.

## Caveats

**Coverage must be verified by contract.** Do not assume e-Faturam covers invoicing for orders that came from non-Trendyol channels (your website, other marketplaces) or every taxpayer type. Confirm with e-Faturam, in writing, which order sources, document types and customer types your contract allows, before enabling automatic invoicing. Trendyol orders may already be invoiced through Trendyol's own flows; avoid duplicate invoicing. Invoicing obligations depend on your tax status: consult your accountant. The adapter follows the public API reference (developers.trendyolefaturam.com) but is tested with mocks, not live accounts.

## Console

Admin → e-Faturam console (owner and admins only) is for trying the connection by hand:

- **Try it → Connection diagnosis**: signs in and makes one harmless query; shows which of sign-in, session token, company/user ID and API call is stuck, with e-Faturam's error code. "Test connection" only tries the sign-in; run this when sign-in works but calls answer 401.
- **Outgoing invoices**: invoices the store issued through e-Faturam (order invoices and manual ones). e-Faturam has no call that lists outgoing invoices, so the list is the store's own record; each row's status and PDF can be looked up at e-Faturam.
- **Try it**: checks whether a VKN / TCKN is an e-Fatura user; looks up an invoice by ETTN, gets its PDF link, cancels an e-Arşiv invoice.
- **Incoming e-Fatura**: lists the e-Fatura invoices issued to you for a date range (read only).
- **API explorer**: runs every catalog operation with its example body. `companyId` and `userId` are added from the signed-in account when left out.

On the live gateway every call that changes data asks for confirmation; calls that create an invoice issue a real one, reported to GİB. In Mock mode nothing reaches e-Faturam: answers are fake but validation is the same (a 10-digit VKN starting with "1" counts as an e-Fatura user). Partner endpoints, despatch advices and the file-upload endpoints are not in the console.

## Known gaps

- Since 1 July 2024 internet-sale e-Arşiv invoices must carry payment and shipment details (`paymentInfo`, `deliveryInfo`). The adapter does not send them yet, because the invoice input has no carrier or payment data.
- The names of the `companyId` / `userId` claims inside the token are not documented; the adapter tries `companyId` and `userId`.
- Only e-Arşiv invoices can be cancelled through the API.
- Retries reuse the same ETTN (derived from order id and type), so a lost answer cannot produce a second invoice.

# e-Faturam (e-Invoice / e-Archive)

[Türkçe](efaturam.tr.md)

## What it does

Issues e-Fatura or e-Arşiv invoices for orders (automatically via the `invoice.issue` outbox job or from the order page), stores number and PDF/URL. Idempotent per `(order_id, type)` so retries cannot create duplicates.

## Keys needed

The credentials your e-Faturam account/contract provides (see the fields shown in Admin → Settings → Integrations → e-Faturam; secret fields are encrypted). Set seller tax ID and legal address in Settings → General. Use "Test connection".

## Sandbox

Use a test/sandbox account if e-Faturam provides one; test invoices must not be sent to the tax authority as real documents. Confirm with the provider.

## Caveats

**Coverage must be verified by contract.** Do not assume e-Faturam covers invoicing for orders that came from non-Trendyol channels (your website, other marketplaces) or every taxpayer type. Confirm with e-Faturam, in writing, which order sources, document types and customer types your contract allows, before enabling automatic invoicing. Trendyol orders may already be invoiced through Trendyol's own flows; avoid duplicate invoicing. Invoicing obligations depend on your tax status: consult your accountant. Adapter tested with mocks, not live accounts.

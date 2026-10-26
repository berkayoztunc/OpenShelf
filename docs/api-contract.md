# OpenShelf API Contract (frozen — agents A/B/C/D/E build against this)

Base: Worker `API_ORIGIN`. JSON everywhere. Errors: `{ "error": { "code": string, "message": string, "details"?: any } }` with proper HTTP status. Money = integer minor units. IDs = strings (nanoid/uuid). Lists: `?page=1&pageSize=20` → `{ items: T[], total: number, page, pageSize }`.
Zod schemas for settings/events live in `@openshelf/shared`; request/response schemas for the endpoints below go in `@openshelf/shared/src/api.ts` (Agent A creates; B/C import — until it exists, code against this doc).

## Auth (admin) — cookie `__Host-os_session` (HttpOnly, Secure, SameSite=Lax, Path=/)
Mutating admin requests (POST/PUT/PATCH/DELETE) require header `X-CSRF-Token` (value from `GET /api/admin/auth/me`) AND matching `Origin` ∈ ADMIN_ORIGIN.
`GET /api/admin/auth/me` / login return `admin.mfaEnrollmentRequired` (owner/admin without TOTP; the admin UI shows a persistent banner linking to /security). TOTP codes are single-use (`admins.last_totp_step`). Login lockout is keyed on email+IP (5 failures / 15 min), plus a looser per-IP ceiling (20); distributed failures on one email require Turnstile instead of locking the account.
Admin SPA calls with `credentials: "include"`. In dev, Vite proxies `/api`, `/media`, `/feeds` to the worker so cookies are same-origin.

| Method Path | Body → Response |
|---|---|
| GET `/api/admin/setup/status` | → `{ needsSetup: boolean }` |
| POST `/api/admin/setup` | `{ setupToken, email, name, password(min 12) }` → 201 (only while no admin exists) |
| POST `/api/admin/auth/login` | `{ email, password, totp? }` → `{ admin, csrfToken, mfaRequired?: true }` |
| POST `/api/admin/auth/logout` · `/logout-all` | → 204 |
| GET `/api/admin/auth/me` | → `{ admin:{id,email,name,role,totpEnabled}, csrfToken }` or 401 |
| POST `/api/admin/auth/mfa/setup` → `{ secret, otpauthUrl }`; POST `/mfa/enable` `{code}`; POST `/mfa/disable` `{password,code}` |
| POST `/api/admin/auth/password` | `{ current, next }` |
| GET/POST `/api/admin/users`, PATCH/DELETE `/api/admin/users/:id` | owner only |

## Settings (admin)
- GET `/api/admin/settings` → `{ general, branding, seo, legal, checkout, tracking }` (shapes = `SETTING_GROUPS`)
- PUT `/api/admin/settings/:group` body = group object → saved object (zod-validated, audited)
- GET `/api/admin/integrations` → `[{ provider, name, description, enabled, configPublic, secretsSet: {key:boolean}, secretsMasked: {key:"••••1234"}, health:{ok,detail,at}|null, publicFields[], secretFields[] }]` (manifest-driven; secret values NEVER returned)
- PUT `/api/admin/integrations/:provider` `{ enabled, config: {...}, secrets?: {key: value} }` — omitted/empty secret key = keep existing; `null` = clear
- POST `/api/admin/integrations/:provider/test` → `{ ok, detail }` (runs `healthCheck()`, stores result)
- GET `/api/admin/integration-events?provider=&page=` · GET `/api/admin/marketing-events?page=` · GET `/api/admin/outbox?status=` · POST `/api/admin/outbox/:id/retry`
- GET `/api/admin/audit-logs?page=`
- GET `/api/admin/export/:entity.(csv|json)` entity ∈ products|orders|customers|config (config export excludes secrets) ; POST `/api/admin/import/products` (CSV multipart)

## Media
- POST `/api/admin/media` multipart `file`, field `kind` ∈ logo|logo_dark|favicon|banner|og|product → `{ id, url:"/media/:id", mime, size }` (limits: logo/favicon ≤512KB, banner ≤1.5MB when stored in D1; png/jpeg/webp/gif/avif; svg REJECTED; magic-byte checked)
- DELETE `/api/admin/media/:id` · GET `/api/admin/media?kind=`
- GET `/media/:id` public, `Cache-Control: public, max-age=31536000, immutable`, ETag=sha256, `X-Content-Type-Options: nosniff`

## Catalog / orders (admin)
- `/api/admin/categories` CRUD · `/api/admin/products` CRUD (product incl. `variants[]` {id,sku,barcode,title,options,prices:{website,trendyol},stock:{total,reserved}} and `images[]` {id,url|mediaId,alt,position})
- POST `/api/admin/inventory/:variantId/adjust` `{ delta, reason }`
- GET `/api/admin/orders?status=&source=&q=` · GET `/api/admin/orders/:id` (items, payments, shipments, invoices, events) · POST `/:id/status` `{status}` (state machine from `ORDER_TRANSITIONS`) · POST `/:id/refund` `{amount,reason}` · POST `/:id/shipment` `{serviceId}` · POST `/:id/invoice`
- GET `/api/admin/customers` · GET `/:id` · POST `/:id/anonymize`
- GET `/api/admin/dashboard` → `{ salesToday, salesWeek, ordersByStatus, lowStock[], integrationHealth[], stockDrift[] }`
- `/api/admin/coupons` CRUD

## Storefront (public, no auth; rate-limited)
- GET `/api/store/config` → `{ general, branding(+logoUrl,logoDarkUrl,faviconUrl,bannerUrls[]), seo, checkout, tracking, legal(titles only), locales }` — NO secrets
- GET `/api/store/categories` · GET `/api/store/products?category=&q=&sort=&page=` · GET `/api/store/products/:slug` (variants with `price`, `available` = total-reserved-safety) · GET `/api/store/search?q=`
- Cart (server cart, id in body/header `X-Cart-Id`): POST `/api/store/cart` → `{id}`; GET `/api/store/cart/:id`; PUT `/api/store/cart/:id/items` `{variantId,quantity}`; POST `/api/store/cart/:id/coupon`
- POST `/api/store/checkout` `{ cartId, email, shippingAddress, billingAddress?, consent:{analytics,marketing}, attribution?:{utm_*,fbc,fbp,fbclid,gclid,gaClientId,visitorId}, turnstileToken?, acceptedTerms:true }` → reserves stock, creates order+payment via active PaymentProvider → `{ orderNumber, trackingToken, payment:{ redirectUrl?|htmlContent? } }`
  - Checkout hardening: **Turnstile is mandatory** whenever the worker secret `TURNSTILE_SECRET` is set (missing/invalid `turnstileToken` → 403 `turnstile_failed`; unset = disabled, dev only). A cart backs one live order: re-checkout cancels the previous unpaid order (stock + coupon released); a paid cart → 409 `cart_already_checked_out`. Max 3 unpaid orders per email+IP (10 per IP) per reservation window → 429 `too_many_pending_orders`. Coupons: one use per email unless `maxUsesPerCustomer` is set (409 `coupon_already_used`); `used` is released when the order is cancelled unpaid or its reservation expires.
- POST `/webhooks/payment/iyzico` (raw body, signature verified, idempotent) — also GET/POST callback `/api/store/payment/callback/:provider` → 302 to storefront `/order/:number?t=:trackingToken`
- GET `/api/store/orders/:number?t=:trackingToken` → public order view (+shipment tracking)
- POST `/api/store/consent` `{visitorId,analytics,marketing,policyVersion}`
- POST `/api/store/track` `{ event: TrackEvent, consent, attribution }` (`attribution.visitorId` required; client `consent` is advisory only: with `tracking.consentRequired` the Meta/GA4 server sinks fire only if the latest stored `/consent` row for that visitorId grants the needed flag) → 204 (server-side mirror for non-purchase events; purchase is ONLY server-generated on verified payment)
- GET `/feeds/meta.xml` · `/feeds/meta.csv` · `/sitemap.xml` · `/robots.txt`
- POST `/webhooks/trendyol` · scheduled(): cron every minute → outbox runner, reservation expiry, Trendyol reconcile

## Server-side purchase flow (contract between A, D, E)
On verified `PaymentEvent{status:"succeeded"}`: (1) tx: payment→succeeded, order→paid, reservation→converted, inventory movements; (2) enqueue outbox jobs: `marketing.purchase` (E consumes: Meta CAPI + GA4 MP, skipped if order.consent lacks needed flag), `invoice.issue`, `shipment.create` (if auto), `trendyol.stock_push`; (3) never block webhook response on external calls.
Outbox job kinds are registered by handlers: `registerJobHandler(kind, (job, ctx) => Promise<void>)` exported from `workers/api/src/outbox.ts` (Agent A creates; D/E export handler maps from their packages: `export const jobHandlers: Record<string, JobHandler>`).
Adapter lookup: `workers/api/src/integrations/registry.ts` maps `ProviderId → AdapterFactory` (A creates, imports factories exported as `factory` from each `@openshelf/integration-<id>` package: `export const factory: AdapterFactory<...>`).

## Manual invoices (admin) — e-Faturam without a checkout order
Roles: owner/admin write; staff read + preview + lookups. All behind `adminGuard`; writes audited (`manual_invoice.create|update|delete|issue|cancel`, no customer PII in meta).
Body = `ManualInvoiceBody` (`packages/shared/src/manual.ts`). **Client totals are ignored**: the server stores `total`/`taxTotal` from `computeInvoiceTotals`.
- GET `/api/admin/catalog-lookup?q=` → `{ items:[{variantId,sku,productName,variantTitle,unitPrice(website, minor),taxRate(product ?? store default),stock(available)}] }` (max 20, staff+)
- GET `/api/admin/customer-lookup?q=` → `{ items:[{id,name,email,phone,address,city,taxId,taxOffice,isCompany}] }` (max 10, staff+; last known address, prefers one with taxId)
- GET `/api/admin/manual-invoices?status=&q=&page=` → paged `{id,status,type,number,customerName,total,taxTotal,currency,orderId,pdfUrl,createdAt,issuedAt}`; status ∈ draft|issuing|issued|failed|cancelling|cancelled
- GET `/:id` → row + `computed:{lines:[{net,tax,total}],net,tax,total}` · POST `/` (draft, 201) · PUT `/:id` (draft|failed only, else 409 `not_editable`) · DELETE `/:id` (draft only, else 409 `not_deletable`)
- POST `/manual-invoices/preview` (body = ManualInvoiceBody, stateless, nothing saved) and POST `/manual-invoices/:id/preview` → `{lines:[{name,quantity,unitPrice,taxRate,discount,net,tax,total}],net,taxTotal,total,currency,pricesIncludeTax,type:"e_fatura"|"e_arsiv",typeSource:"provider"|"rule",warnings:[{code,message,line?}]}`. Warning codes: company_tax_id_missing, company_tax_id_not_vkn, tax_office_missing, vkn_on_individual, zero_total, customer_email_missing, zero_tax_without_note, negative_line, zero_price, not_e_fatura_user.
- POST `/:id/issue` (admin+) → row (200). Atomic claim `UPDATE … WHERE status IN ('draft','failed')` (stale `issuing` > 5 min is reclaimable); concurrent callers get 409 `issue_in_progress`; already issued → 409 `already_issued`; no enabled provider → 409 `no_invoicing_provider` (mock mode counts as enabled); total 0 → 400 `zero_total`; provider error → status `failed`, `error` stored (secrets scrubbed), HTTP 502 `issue_failed`; retry allowed. Idempotency key to the adapter: `manual:<id>`.
- POST `/:id/cancel` (admin+; issued only, else 409 `invalid_state`) → adapter.cancel; refusal/error → stays `issued`, 502 `cancel_failed`.
- Issue/cancel share a 30/hour/admin limit (429 `rate_limited`).
- **Line mapping** to `InvoiceInput` (unitPrice is KDV-inclusive minor, like order items): gross = computeInvoiceTotals line total (discount folded in; works for pricesIncludeTax true or false). Integer qty dividing gross evenly → `{quantity, unitPrice: gross/qty}`; else one line `{quantity:1, unitPrice: gross, name:"<name> (<qty> x)"}` so nothing is lost to rounding. `orderId="manual:<id>"`, `orderNumber` = linked order number or `MAN-<id8>`, `issuedAt` = issueDate (12:00Z) or now. Type (e_fatura/e_arsiv) comes from the adapter's `resolveInvoiceType` (fallback rule: company + 10-digit VKN ⇒ e_fatura).

## Mail compose (admin)
Roles: owner/admin send/resend; staff read/preview/templates. Audit `email.compose.send` (recipient masked `a***@domain`).
- POST `/api/admin/emails` `ComposeEmailBody {to,cc?,replyTo?,subject,body,orderId?,customerId?,manualInvoiceId?}` → 201 `{id,status:"sent",provider,sentAt}`. CR/LF/`<>",;` in to/cc/replyTo, CR/LF in subject → 400. From = notifications `fromEmail`/`fromName` (fallback `general.contactEmail`/storeName); any client `from` is ignored. `{{storeName}}` is substituted; other `{{vars}}` → 400 `unresolved_placeholders`. No enabled EmailProvider → 409 `no_email_provider` (mock mode OK → recorded in mock_messages). Row persisted `queued` BEFORE send, then `sent`/`failed`; provider failure → 502 `send_failed` with `details:{id,detail}` (provider text verbatim but scrubbed, e.g. Cloudflare Free-plan "verified destinations only").
- Rate limits (429, codes `rate_limited_admin` 30/h per admin, `rate_limited_total` 100/day, `rate_limited_recipient` 5/day per recipient, case-insensitive).
- POST `/emails/preview` `{subject,body,manualInvoiceId?}` → `{subject,html,text,from,fromName,warnings[]}` — same renderer as send (byte-identical html).
- GET `/emails?page=&q=&status=` (no bodies) · GET `/emails/:id` (full `bodyText`/`bodyHtml`) · POST `/emails/:id/resend` (failed only, else 409; same rate limits).
- GET `/emails/templates` → `{items:[{id:"<event>:<lang>",event,lang,subject,body,isDefault}],variables:[...],note}`.
- Body rendering: plain text, blank line = paragraph, `**bold**`, only `https://` URLs auto-linked (`rel="noopener noreferrer nofollow"`), everything else HTML-escaped; branded wrapper (store name header, footer with store/contact); issued invoice link appended when `manualInvoiceId` is issued.

## Trendyol API console (admin) — contract

Types: `packages/shared/src/trendyol.ts` (`TrendyolOperation`, `TrendyolCallBody`, `TrendyolCallResult`, `TrendyolCatalogResponse`, `MockHandler`, `MockState`). Catalog data: `packages/integrations/trendyol/src/catalog/ops/*.ts` (every public Trendyol marketplace API of docs **v2.0 / Turkey**, V1 product APIs excluded because they were switched off 10 Aug 2026) and offline handlers `catalog/mock/*.ts`. Hosts: production `https://apigw.trendyol.com`, stage `https://stageapigw.trendyol.com` (stage needs Trendyol-side IP whitelisting; 503 = not whitelisted). Auth: `Authorization: Basic base64(apiKey:apiSecret)` + mandatory `User-Agent: <sellerId> - SelfIntegration`. Trendyol limit: 50 requests / 10 s per endpoint (429 `too.many.requests`), product groups have per-minute limits.

All routes: owner/admin only (orders/claims contain customer PII), behind `adminGuard`.

| Method Path | Body → Response |
|---|---|
| GET `/api/admin/trendyol/catalog` | → `TrendyolCatalogResponse` (`mode`: `mock` when Mock Mode is on; `live` when the trendyol integration is enabled with credentials; else `disabled` + `reason`) |
| POST `/api/admin/trendyol/call` | `TrendyolCallBody` → `TrendyolCallResult` (HTTP 200 even when Trendyol answers 4xx/5xx: see `result.status`/`result.error`). Our own failures: 404 `unknown_operation`, 400 `invalid_params` (missing required path/query/body, bad JSON), 403 role, 409 `confirm_required` (live write/destructive without `confirm === operationId`), 409 `integration_unavailable`, 413 `body_too_large`, 429 `rate_limited` |
| GET `/api/admin/trendyol/history?page=&operationId=` | → `{ items: [{id,operationId,method,env,mock,risk,status,durationMs,adminId,requestSummary,responseSummary,at}], total }` (last 30 days / 2000 rows) |
| DELETE `/api/admin/trendyol/history` | owner only → 204 |
| GET/POST/DELETE `/api/admin/trendyol/mappings` | link a local variant to a Trendyol barcode: `{ variantId, barcode, externalId?, listingEnabled? }` → writes `product_mappings` (+ `channel_listings` enabled) so stock/price push knows the variant; GET lists `{items:[{variantId,sku,productName,variantTitle,barcode,externalId}]}` |

Rules: path = catalog `path` with `{sellerId}` from the integration config and other `{params}` from `call.path` (validated `^[A-Za-z0-9._~-]+$`, URL-encoded); query serialised per `OpParam.arrayStyle`; body must be JSON ≤ 2 MB; response truncated at 2 MB (`response.truncated`). The URL is ALWAYS built from the catalog + the two allowlisted hosts, never from user input. Credentials never leave the Worker and are not echoed (`result.request.url` contains no secrets). Live write/destructive calls require `confirm`; mock calls never reach the network and never need it. Each call is audited (`trendyol.call`: operationId, risk, env, status — no bodies) and summarised in `trendyol_calls`. Mock mode: handlers from `TRENDYOL_MOCKS` run against D1-backed `mock_state` (products, orders, claims, questions, webhooks are stateful: create → list shows it; status updates mutate); unknown operations fall back to a generic `{ "mock": true }` 200 and a test fails if a catalog operation lacks a handler.

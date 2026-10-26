# Security

[Türkçe](security.tr.md) · Vulnerability reporting: [../SECURITY.md](../SECURITY.md)

## Threat model summary

| Threat | Mitigation |
|---|---|
| Admin account takeover | PBKDF2-SHA256 password hashes, optional TOTP MFA, login rate limiting, random 256-bit session tokens stored only as SHA-256 hashes, `__Host-` HttpOnly Secure SameSite=Lax cookie, idle + absolute timeout, logout-all |
| CSRF / cross-origin abuse | `X-CSRF-Token` plus `Origin` check on all admin mutations; CORS limited to configured origins |
| Forged payment/webhook calls | Signature verification on the raw body, server-to-server re-retrieve, amount/order match, replay protection via `webhook_receipts` |
| Overselling / double processing | Transactional reservations, unique constraints, idempotent outbox handlers |
| Card data exposure | Hosted payment form; card data never reaches OpenShelf |
| Injection / XSS | Zod on all input, parameterized queries (Drizzle), strict CSP, no SVG uploads, magic-byte checks |
| SSRF / data exfiltration through adapters | Fixed outbound host allowlist per adapter |
| Secret leakage | Secrets never in client bundles, logs redacted, never returned by API, encrypted at rest |
| Bot abuse | Rate limits on login/checkout/coupon/search, optional Turnstile |
| Insider/mistakes | RBAC, audit log of all writes |

Out of scope: a compromised Cloudflare account, a compromised admin device, vendor-side breaches.

## Secrets at rest

- Worker secrets (`APP_ENCRYPTION_KEY`, `SETUP_TOKEN`, `TURNSTILE_SECRET`) live in Cloudflare's secret store. `.dev.vars` is local only and git-ignored.
- Integration secrets are encrypted with AES-256-GCM (random IV per write) using `APP_ENCRYPTION_KEY`, stored in `integration_configs`, shown only masked in admin ("write-only, replace to change").
- CI runs gitleaks and `pnpm audit`. Use a least-privilege Cloudflare API token for deployments.

## Rotating `APP_ENCRYPTION_KEY`

Impact: integration secrets in D1 are unreadable without the key that encrypted them (`key_version` tracks this). If the key is lost, you must re-enter integration secrets; no customer or order data is affected.

Safe procedure:

1. Export config (Admin → Settings → Backup/Export, config export excludes secrets) and note which integrations are enabled. Keep the original provider credentials available (you will re-enter them).
2. Take a D1 export (see Backup below).
3. Generate a new key: `openssl rand -base64 32`, then `npx wrangler secret put APP_ENCRYPTION_KEY` (from `workers/api`) and paste it. Deploy so the Worker picks it up.
4. Integrations that cannot be decrypted will report unhealthy. In Admin → Settings → Integrations, re-enter each secret and press "Test connection". Writing a secret re-encrypts it with the new key and the new `key_version`.
5. Revoke/rotate the provider-side credentials too if the old master key may have been exposed (the old key plus a D1 copy could decrypt old ciphertexts).
6. Verify all integrations are healthy and the outbox has no dead jobs from the interval.

If a future admin release offers in-place re-encryption (decrypt with old key, encrypt with new), prefer it and follow its release notes.

`SETUP_TOKEN`: single use; rotate any time before the first admin exists with `wrangler secret put SETUP_TOKEN`. Rotate the Cloudflare deploy token regularly.

## Backup and export

- Admin → Settings → Backup/Export: CSV/JSON for products, orders, customers; config export (no secrets).
- Full database: `npx wrangler d1 export openshelf --remote --output=backup.sql` (run from `workers/api`). The file contains personal data: store it encrypted, restrict access, delete old copies. Cloudflare D1 Time Travel can restore recent points in time; check its current retention for your plan.
- Test a restore into a scratch database periodically.

## Personal data

Customer anonymization (`POST /api/admin/customers/:id/anonymize`) supports KVKK/GDPR erasure requests where legally possible (invoices and accounting records may need to be retained). See [legal-notes.md](legal-notes.md).

## Operator checklist

MFA for every admin; unique 12+ char passwords; origins set to exact production URLs; Turnstile on; keep dependencies updated (Dependabot); review audit logs; limit who has Cloudflare account access.

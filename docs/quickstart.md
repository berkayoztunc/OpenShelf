# Quickstart

[Türkçe](quickstart.tr.md)

## Local development

Requirements: Node >= 20, pnpm.

```bash
pnpm install
pnpm setup:local                        # creates .dev.vars + workers/api/.dev.vars, applies local migrations
pnpm seed                               # optional: demo store "OpenShelf Demo" (12 products, 2 coupons)
pnpm dev                                # storefront :5173, admin :5174/admin/, API :8787
```

Preview what the setup script would do without changing anything: `node tooling/setup/setup.mjs --dry-run`.

### First admin

Open `http://localhost:5174/admin/setup`, enter the `SETUP_TOKEN` from `workers/api/.dev.vars`, and create the owner account (password at least 12 characters). The token works once; the endpoint locks after the first admin exists. Enable TOTP MFA under your profile.

The seed creates no admin on purpose.

### Try it without provider accounts

Turn on [Mock Mode](mock-mode.md) (set `ALLOW_MOCK`, then Settings, System) to get a fake payment page and a Mock Inbox for SMS/e-mail. Notifications are described in [notifications.md](notifications.md).

### Useful commands

| Command | Purpose |
|---|---|
| `pnpm typecheck` / `lint` / `test` / `build` | quality gates (same as CI) |
| `pnpm db:generate` | generate a migration after editing the schema |
| `pnpm db:migrate:local` | apply migrations to local D1 |
| `pnpm seed` | load demo data into local D1 (refuses remote) |
| `pnpm dev:site` | build and preview the real single-Worker layout |

## Going live

Follow [deploy-cloudflare.md](deploy-cloudflare.md). Before taking real orders: configure legal texts ([legal-notes.md](legal-notes.md)), enable iyzico in sandbox first ([integrations/iyzico.md](integrations/iyzico.md)), place a test order, then switch to production keys.

## Launch checklist

- [ ] Store name, contact, tax details in Settings → General
- [ ] Legal texts reviewed by you (and a professional)
- [ ] Payment tested in sandbox, then production
- [ ] Origin variables pinned to your real `https://` URLs (optional but recommended; see [deploy-cloudflare.md](deploy-cloudflare.md))
- [ ] Mock Mode off and `ALLOW_MOCK` removed
- [ ] MFA enabled for all admins
- [ ] Backup/export tested ([security.md](security.md))
- [ ] Test order, refund and e-mail/shipping flow completed

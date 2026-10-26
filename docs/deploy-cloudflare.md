# Deploy to Cloudflare

[Türkçe](deploy-cloudflare.tr.md)

OpenShelf deploys as **one Cloudflare Worker**: the storefront is served at `/`, the admin at `/admin/`, and the API under `/api/*` (plus `/webhooks/*`, `/media/*`, `/feeds/*`, `/sitemap.xml`, `/robots.txt`). Static pages come from Workers Static Assets, data lives in **D1**. Because everything is one origin, no CORS or cross-site cookie setup is needed. The canonical config is the root [`wrangler.jsonc`](../wrangler.jsonc); `workers/api/wrangler.toml` is only for local API-only development.

> Cost note: the core (Workers + D1 + static assets) targets Cloudflare's free plan for small shops, but limits and billing are Cloudflare's to define and can change. R2 and Queues are optional and may incur charges (R2 is an opt-in paid add-on). Cloudflare Email sending is a paid/beta feature. Check current pricing and set billing alerts.

## 1. Deploy to Cloudflare button (easiest)

The repo must be **public on GitHub or GitLab**. Button URL (the repo root, not a subdirectory):

```
https://deploy.workers.cloudflare.com/?url=https://github.com/<ORG>/openshelf
```

Flow: click the button, authorize Cloudflare to access your GitHub, and review the form. Cloudflare clones the repo into your account, **creates the D1 database automatically** from the `DB` binding in `wrangler.jsonc` (no IDs to copy), and asks for the secrets declared in `.dev.vars.example` / `package.json` (`cloudflare.bindings`):

| Form field | What to enter |
|---|---|
| `APP_ENCRYPTION_KEY` | `openssl rand -base64 32` (must be base64 of exactly 32 random bytes) |
| `SETUP_TOKEN` | `openssl rand -hex 24` (write it down; you type it once at `/admin/setup`) |
| `TURNSTILE_SECRET` | optional; leave empty |

Then it runs the build (`pnpm build`) and the deploy (`pnpm run deploy` = `wrangler d1 migrations apply DB --remote && wrangler deploy`), which applies the database migrations. Afterwards every push to the repo redeploys through Workers Builds.

## 2. Guided CLI setup

```bash
pnpm install
node tooling/setup/setup.mjs --dry-run   # review planned commands
node tooling/setup/setup.mjs
```

Idempotent. It checks `wrangler whoami` (runs `wrangler login` if needed), creates or reuses D1 `openshelf` and patches `database_id` into the root `wrangler.jsonc`, optionally pins a custom domain, asks before enabling R2, builds, applies migrations (`--remote`), deploys, then sets `APP_ENCRYPTION_KEY` and `SETUP_TOKEN` with `wrangler secret put` through stdin (existing secrets are never overwritten; the one-time `SETUP_TOKEN` is shown once at the end).

Flags: `--yes` (non-interactive, paid add-ons stay off), `--enable-r2`, `--skip-deploy`, `--domain=https://shop.example.com`, `--db-name=NAME`, `--local` (write `.dev.vars` + local migrations), `--dry-run`, `--mock` (print the steps to enable Mock Mode after deploy).

## 3. Manual equivalent

```bash
pnpm install && pnpm build                        # builds everything into dist-site/
npx wrangler d1 create openshelf                  # add the printed database_id to wrangler.jsonc
npx wrangler d1 migrations apply DB --remote
npx wrangler deploy
openssl rand -base64 32 | npx wrangler secret put APP_ENCRYPTION_KEY
openssl rand -hex 24    | npx wrangler secret put SETUP_TOKEN   # note it once
```

GitHub Actions (`.github/workflows/deploy.yml`, manual) does `pnpm build`, applies migrations and runs `wrangler deploy` using the repo secrets `CLOUDFLARE_API_TOKEN` (Workers Scripts + D1 edit) and `CLOUDFLARE_ACCOUNT_ID`.

## 4. First run: `/admin/setup`

Open `https://<your-worker>.workers.dev/admin/setup`, enter the `SETUP_TOKEN`, create the owner account and enable MFA. If `APP_ENCRYPTION_KEY` is missing or malformed, setup and login answer with a clear `503 misconfigured` error telling you to set it.

Want to try everything without real providers? Enable **Mock Mode** (see [mock-mode.md](mock-mode.md); requires the `ALLOW_MOCK` variable): mock payment page at `/mock/pay/...`, SMS/e-mail land in a Mock Inbox. Switch it off before real orders.

## 5. Secrets and variables

| Name | Kind | Notes |
|---|---|---|
| `APP_ENCRYPTION_KEY` | secret | base64, 32 bytes. Encrypts integration secrets in D1. Do not lose or leak; see [security.md](security.md) |
| `SETUP_TOKEN` | secret | one-time, first admin creation |
| `TURNSTILE_SECRET` | secret, optional | bot protection |
| `ALLOW_MOCK` | var, optional | required to enable Mock Mode on a deployed Worker; leave unset in production |
| `STOREFRONT_ORIGIN`, `ADMIN_ORIGIN`, `API_ORIGIN` | vars, optional | empty by default: derived from the request origin. Set exact `https://` origins to pin a strict allowlist (recommended in production) |

Integration API keys (iyzico, Trendyol, ...) are NOT Worker secrets; enter them in Admin, Settings, Integrations (stored AES-256-GCM encrypted in D1).

## 6. Custom domain

Dashboard: Workers, your Worker, Settings, Domains & Routes, add your domain (it must be on Cloudflare DNS). No config change is needed (origins follow the request). If you do pin origins, update all three to the new domain. Admin cookies are `__Host-` prefixed and need HTTPS.

## 7. Cron

`"triggers": { "crons": ["* * * * *"] }` runs the outbox, reservation expiry and Trendyol reconcile every minute. If you hit free-plan limits, lower the frequency (e.g. `*/5 * * * *`) at the cost of slower retries and stock-hold expiry.

## 8. Local preview of the single Worker

```bash
cp .dev.vars.example .dev.vars   # fill the two secrets
pnpm dev:site                    # build + wrangler dev (local D1: run `pnpm setup:local` once for migrations)
```

`pnpm dev` still starts the API plus both Vite apps (admin at `http://localhost:5174/admin/`).

## 9. Updating

Pull new code, `pnpm install --frozen-lockfile`, `pnpm run deploy` (builds are done by `pnpm build` first; Workers Builds does both). Export your data first ([security.md](security.md)).

## Troubleshooting

- **`/admin/setup` says `misconfigured`**: set `APP_ENCRYPTION_KEY` (`openssl rand -base64 32`) as a Worker secret and retry.
- **Deploy button: build fails**: the build runs `pnpm build` at the repo root (monorepo). Check the Workers Builds log; Node 20+ and pnpm are required.
- **`database_id` / D1 errors when deploying by hand**: create the database first (`wrangler d1 create openshelf`) and put its id in `wrangler.jsonc`.
- **Admin shows the storefront or blank page**: ensure `dist-site/admin/` exists (`pnpm build`) and you open `/admin/` (trailing slash redirects automatically).
- **403 "Origin not allowed" on admin actions**: you pinned `ADMIN_ORIGIN` to a different domain than the one you browse; fix or clear it.
- **Prerender warning in build logs** ("API unreachable"): expected on the first build; product pages hydrate at runtime.

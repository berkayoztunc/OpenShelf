# @openshelf/help-shots

Captures the screenshots used by the in-app guide (`apps/admin/src/help/<locale>/*.md`, referenced as `help/<locale>/<name>.png`) in every admin language.

## Prerequisites
- Seeded local server running with Mock Mode on: `pnpm build && npx wrangler dev -c wrangler.jsonc --local --port 8787` (demo products, orders `DEMO-1001..`, an issued invoice, a sent e-mail).
- Demo admin `admin@openshelf.local` / `openshelf-demo-2026`. If login shows "too many attempts", run from the repo root:
  `npx wrangler d1 execute DB --local -c wrangler.jsonc --command "DELETE FROM login_attempts; DELETE FROM rate_limits;"`
- A Chromium binary: set `CHROMIUM_PATH` (default: the Playwright headless shell under `~/Library/Caches/ms-playwright/chromium_headless_shell-1228/...`).

## Run
```
pnpm --filter @openshelf/help-shots capture
pnpm --filter @openshelf/help-shots capture -- --locales=tr --only=login,dashboard
# options: --base=http://localhost:8787 --out=../../apps/admin/public/help --locales=tr,en --only=a,b
```
Output: `apps/admin/public/help/{tr,en}/<name>.png`, 1280x800 light theme (print views 900x1200), palette-quantised PNG.

## Editing
`shots.mjs` is the manifest (one entry per name: path, optional `wait` selector, `run(page, ctx)` steps, `element` / `full` / `maxHeight` crop rules, `anon`, `viewport`). Prefer hrefs and locale-independent selectors; `ctx.locale` is `tr|en`. Toasts are hidden, motion disabled.

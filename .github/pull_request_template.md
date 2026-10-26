## What and why

<!-- Short description. Link issues: Fixes #123 -->

## Checklist

- [ ] `pnpm typecheck && pnpm lint && pnpm test` pass locally
- [ ] Tests added/updated (adapters: mocked contract tests)
- [ ] DB changes include a generated migration (`pnpm db:generate`), never edited by hand
- [ ] No secrets, tokens or real customer data in code, tests, logs or screenshots
- [ ] Docs updated (EN + TR if user-facing)
- [ ] Security impact considered (auth, CSRF, webhooks, PII, outbound hosts)

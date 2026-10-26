# Contributing to OpenShelf / Katkı Rehberi

Thanks for helping. Türkçe özet aşağıda.

## Setup

```bash
pnpm install
node tooling/setup/setup.mjs --local
pnpm seed       # optional demo data
pnpm dev
```

Requirements: Node >= 20, pnpm (see `packageManager` in `package.json`).

## Workflow

1. Open or claim an issue (look for `good first issue`, `adapter`).
2. Branch from `main`, keep PRs focused.
3. Run `pnpm typecheck && pnpm lint && pnpm test && pnpm build`.
4. Open a PR using the template.

## Rules

- TypeScript strict. Validate all external input with Zod.
- Money is integer minor units (kuruş/cents), never floats.
- DB changes: edit `packages/db/src/schema.ts`, run `pnpm db:generate`, commit the generated migration. Never edit applied migrations.
- Never commit secrets or real customer data. Never log secrets, tokens, card data or full PII.
- Adapters: follow [docs/adapter-guide.md](docs/adapter-guide.md); tests use mocked HTTP only (no live calls in CI); outbound hosts are allowlisted.
- User-facing docs need English and Turkish (`.tr.md`).
- Do not claim the project is "free forever" anywhere. Describe free-tier fit honestly.

## Commits

Short imperative subject (Conventional Commits welcome: `feat:`, `fix:`, `docs:`).

## Versioning and migrations

Semver after 1.0. Migrations are forward-only and must be safe to apply on an existing store; breaking changes are called out in release notes.

## Security

Do not file vulnerabilities as public issues; see [SECURITY.md](SECURITY.md).

## Türkçe özet

Issue açın/üstlenin, `main`'den dal oluşturun, `pnpm typecheck && pnpm lint && pnpm test && pnpm build` çalıştırın, PR şablonunu doldurun. Para birimi tam sayı (kuruş). Secret veya gerçek müşteri verisi commit etmeyin. Kullanıcıya dönük dokümanlar TR + EN olmalı. "Sonsuza dek ücretsiz" ifadesi kullanmayın.

# @openshelf/storefront

Vite + React 18 + TypeScript + Tailwind v4 storefront. Dev: `pnpm --filter @openshelf/storefront dev` (http://localhost:5173, proxies `/api /media /feeds /webhooks` to `http://localhost:8787`).

- `pnpm build` = typecheck + `vite build` + `scripts/prerender.mjs`; `pnpm test`; `pnpm build:spa` skips prerender.
- Optional env: `VITE_TURNSTILE_SITE_KEY` (checkout Turnstile), `VITE_API_ORIGIN` (dev proxy target), `PRERENDER_API_ORIGIN`, `PRERENDER_SITE_ORIGIN`, `PRERENDER_STRICT=1`.
- SPA fallback is required on the host (Cloudflare Pages: default for SPAs): unknown paths -> `/index.html`.

## SEO: prerender + runtime hydration (tradeoff)
`prerender.mjs` snapshots the catalog at build time into static HTML shells (`/`, `/category/*`, `/product/*`) with title, description, OG, canonical and Product JSON-LD plus a small static body. React then replaces `#root` (createRoot, not hydrate) and fetches live price/stock from the API.
- Pro: crawlers/social scrapers get per-product meta with no SSR runtime, free-tier friendly.
- Con: snapshot goes stale until the next build (new products have no shell until rebuild; they still work via SPA fallback and the API `/sitemap.xml`), a brief content swap on load, and prices in the snapshot are never authoritative. Trigger a rebuild (CI/Pages deploy hook) after catalog changes if SEO freshness matters.
- If the API is down at build time the script warns and ships the plain SPA (set `PRERENDER_STRICT=1` to fail instead).

## Tracking (src/tracking)
Single `track(name, payload)`: new `event_id` per call, GA4 (needs analytics consent) + Meta Pixel (needs marketing consent, `eventID` = same id) + server mirror `POST /api/store/track` (any consent; never for `purchase`). Scripts load lazily only after consent; Consent Mode v2 defaults are denied. Browser `purchase` fires only from the order page for a paid order with the API's `purchaseEventId`, once per order (sessionStorage).

# Writing an adapter

[Türkçe](adapter-guide.tr.md)

Adapters live in `packages/integrations/<id>` and implement contracts from `@openshelf/integration-sdk`. The API worker discovers them through `workers/api/src/integrations/registry.ts`, which maps `ProviderId` to the `factory` export of each package.

## Pick a contract

| Kind | Interface | Core methods |
|---|---|---|
| Payment | `PaymentProvider` | `createCheckout`, `verifyWebhook`, `retrieve`, `refund?` |
| Shipping | `ShippingProvider` | `quote`, `createShipment`, `track`, `cancel` |
| Invoicing | `InvoicingProvider` | `issue(input, idempotencyKey)`, `cancel` |
| Marketplace | `MarketplaceProvider` | `pushStockAndPrice`, `fetchOrders`, `updateShipment?`, `verifyWebhook?` |
| Analytics/Ads | `ServerEventSink` | `send(event, ctx)` |
| SMS | `SmsProvider` | `send({ to, text, senderId? })` |
| E-mail | `EmailProvider` | `send({ to, from, subject, html, text })` |

All extend `OpenShelfIntegration`: `id`, `validateConfig()`, `healthCheck(): Promise<{ok, detail?}>`.

## Steps

1. Add a provider id to `ProviderId` in `@openshelf/shared`.
2. Create `packages/integrations/<id>` (copy an existing adapter's `package.json`/`tsconfig`).
3. Export a manifest and factory:

```ts
import { z } from "zod";
import type { AdapterFactory, PaymentProvider } from "@openshelf/integration-sdk";

const schema = z.object({
  config: z.object({ environment: z.enum(["sandbox", "production"]) }),
  secrets: z.object({ apiKey: z.string().min(1), secretKey: z.string().min(1) }),
});

export const factory: AdapterFactory<PaymentProvider> = {
  manifest: {
    id: "myprovider", name: "My Provider", description: "...",
    publicFields: [{ key: "environment", label: "Environment", type: "select",
      options: [{ value: "sandbox", label: "Sandbox" }, { value: "production", label: "Production" }] }],
    secretFields: [{ key: "apiKey", label: "API key", secret: true, required: true },
                   { key: "secretKey", label: "Secret key", secret: true, required: true }],
    schema,
  },
  create(creds, deps) {
    // creds.config / creds.secrets are decrypted for this call. Never log them.
    // Use deps.fetch (not global fetch) and deps.now() so tests can mock both.
    return { id: "myprovider", /* ... */ } as PaymentProvider;
  },
};
```

The admin form is generated from `publicFields`/`secretFields`; secrets are write-only.

## Rules

- **Hosts**: call only a fixed allowlist of the vendor's hosts (sandbox and production). Never fetch a URL taken from user input or from vendor responses without checking its host.
- **Secrets**: never log, throw, or put them in error messages; redact request/response dumps.
- **Webhooks**: verify the signature on the raw body (`rawBody` is passed in), check timestamps if available, then re-retrieve from the vendor; return a normalized event with a stable `eventId`. The core handles replay protection.
- **Idempotency**: handlers can run more than once (outbox retries). Use the provided idempotency key / vendor idempotency features.
- **Money**: integer minor units in the SDK; convert at the vendor boundary only.
- **Errors**: throw typed, secret-free errors; transient failures should throw so the outbox retries with backoff.
- **No live calls in CI**: tests use a mocked `fetch` with recorded or hand-written fixtures from vendor docs.

## Testing

Write contract tests with Vitest: inject a fake `deps.fetch`, assert request shape (URL host, headers, body), parse fixtures for success/error/signature-failure cases, and assert `healthCheck` and `validateConfig` behavior. Run `pnpm --filter @openshelf/integration-<id> test`.

## Register and document

Add the factory to the registry (API worker owners will review), add `docs/integrations/<id>.md` and `.tr.md` (keys needed, where to enter them, sandbox notes, caveats), and open a PR with the adapter template.

import { applyD1Migrations, env } from "cloudflare:test";
import type { D1Migration } from "cloudflare:test";

declare module "cloudflare:test" {
  interface ProvidedEnv { DB: D1Database; TEST_MIGRATIONS: D1Migration[]; APP_ENCRYPTION_KEY: string; SETUP_TOKEN: string; ADMIN_ORIGIN: string; STOREFRONT_ORIGIN: string; API_ORIGIN: string }
}
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);

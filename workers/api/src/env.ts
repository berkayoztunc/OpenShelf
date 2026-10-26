import type { DrizzleD1Database } from "drizzle-orm/d1";
import type * as schema from "@openshelf/db";
import type { Role } from "@openshelf/shared";

export interface Env {
  DB: D1Database;
  MEDIA?: R2Bucket;
  /** Static assets (storefront + admin SPA). Present only in the single-Worker deployment (root wrangler.jsonc). */
  ASSETS?: Fetcher;
  /** Origins: when unset/empty, baseMiddleware derives them from the request origin (same-origin deployment). */
  STOREFRONT_ORIGIN: string;
  ADMIN_ORIGIN: string;
  API_ORIGIN: string;
  APP_ENCRYPTION_KEY?: string;
  SETUP_TOKEN?: string;
  TURNSTILE_SECRET?: string;
  /** Mock mode can only be enabled when "true" (or ENVIRONMENT === "development"). Unset on deployed Workers = not allowed. */
  ALLOW_MOCK?: string;
  ENVIRONMENT?: string;
}
export type Db = DrizzleD1Database<typeof schema>;
export interface AdminCtx { id: string; email: string; name: string; role: Role; totpEnabled: boolean; sessionHash: string; csrfToken: string }
export interface Vars { db: Db; admin?: AdminCtx; ip: string; requestId: string; /** true when origins were derived from the request on a *.workers.dev host */ derivedWorkersDev?: boolean }
export type AppEnv = { Bindings: Env; Variables: Vars };

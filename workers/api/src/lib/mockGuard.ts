import { and, eq, inArray, sql } from "drizzle-orm";
import { integrationConfigs, orders } from "@openshelf/db";
import type { Db, Env } from "../env";
import { PAYMENT_PROVIDER_IDS } from "../integrations/registry";
import { ApiError } from "./http";

/** Mock mode is a deployment decision: ALLOW_MOCK=true (secret/var) or ENVIRONMENT=development (local dev). */
export const mockAllowedByConfig = (env: Pick<Env, "ALLOW_MOCK" | "ENVIRONMENT">): boolean => env.ALLOW_MOCK === "true" || env.ENVIRONMENT === "development";
export const MOCK_DISABLED_MESSAGE = "Mock mode is disabled by configuration on this deployment. Set ALLOW_MOCK=true (Worker var or secret) to allow it; never do this on a store that takes real payments.";

/** Throws unless it is safe to switch mock mode ON (config allows it, no real payment provider, no real paid orders). */
export async function assertMockEnableAllowed(env: Env, db: Db): Promise<void> {
  if (!mockAllowedByConfig(env)) throw new ApiError(403, "mock_not_allowed", MOCK_DISABLED_MESSAGE);
  const [pp] = await db.select({ p: integrationConfigs.provider }).from(integrationConfigs)
    .where(and(inArray(integrationConfigs.provider, PAYMENT_PROVIDER_IDS), eq(integrationConfigs.enabled, true))).limit(1);
  if (pp) throw new ApiError(409, "real_payment_enabled", `A real payment provider (${pp.p}) is enabled. Disable it in Integrations before turning on mock mode.`);
  const [real] = await db.select({ n: sql<number>`count(*)` }).from(orders)
    .where(and(inArray(orders.status, ["paid", "fulfilling", "shipped"]), sql`NOT EXISTS (SELECT 1 FROM payments p WHERE p.order_id = ${orders.id} AND p.is_mock = 1)`));
  if ((real?.n ?? 0) > 0) throw new ApiError(409, "real_orders_in_flight", `There are ${real!.n} real paid/fulfilling/shipped order(s). Finish or deliver them before turning on mock mode.`);
}

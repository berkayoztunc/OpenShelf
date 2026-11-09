import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { integrationConfigs } from "@openshelf/db";
import { GELIVER_OPERATIONS, GeliverConsoleError } from "@openshelf/integration-geliver";
import { GeliverCallBody, type GeliverCatalogResponse } from "@openshelf/shared";
import type { AppEnv } from "../env";
import { ApiError, body } from "../lib/http";
import { audit } from "../lib/audit";
import { requireRole } from "../middleware/auth";
import { hit } from "../middleware/security";
import { getAdapter, isIntegrationEnabled, isMockModeFresh, logIntegrationEvent } from "../lib/integrations";
import { scrub } from "../lib/log";
import { runGeliverMock } from "../lib/geliverMock";

/** Shipping data holds customer names/addresses and live writes buy labels: owner/admin only. */
export const adminGeliver = new Hono<AppEnv>();
adminGeliver.use("/geliver/*", requireRole("admin"));

const CALLS_PER_MIN = 60;
type ConsoleAdapter = { consoleCall(op: unknown, call: unknown): Promise<unknown> };

interface State { mode: GeliverCatalogResponse["mode"]; reason?: GeliverCatalogResponse["reason"]; test: boolean; senderAddressId?: string }
async function resolveState(c: { env: AppEnv["Bindings"]; get: (k: "db") => AppEnv["Variables"]["db"] }): Promise<State> {
  const db = c.get("db");
  // Public config only: secrets are never selected here.
  const [row] = await db.select({ configPublic: integrationConfigs.configPublic, hasSecrets: integrationConfigs.secretsEnc }).from(integrationConfigs).where(eq(integrationConfigs.provider, "geliver")).limit(1);
  const cfg = (row?.configPublic as Record<string, unknown> | undefined) ?? {};
  const test = cfg.test !== false;
  const senderAddressId = typeof cfg.senderAddressId === "string" && cfg.senderAddressId ? cfg.senderAddressId : undefined;
  if (await isMockModeFresh(db)) return { mode: "mock", test, senderAddressId };
  if (!row || !row.hasSecrets || !senderAddressId) return { mode: "disabled", reason: "not_configured", test, senderAddressId };
  if (!(await isIntegrationEnabled(c.env, db, "geliver"))) return { mode: "disabled", reason: "integration_disabled", test, senderAddressId };
  return { mode: "live", test, senderAddressId };
}

adminGeliver.get("/geliver/catalog", async (c) => {
  const st = await resolveState(c);
  const res: GeliverCatalogResponse = { mode: st.mode, ...(st.reason ? { reason: st.reason } : {}), test: st.test, ...(st.senderAddressId ? { senderAddressId: st.senderAddressId } : {}), operations: GELIVER_OPERATIONS };
  return c.json(res);
});

adminGeliver.post("/geliver/call", async (c) => {
  const b = await body(c, GeliverCallBody);
  const db = c.get("db"); const admin = c.get("admin")!;
  const op = GELIVER_OPERATIONS.find((o) => o.id === b.operationId);
  if (!op) throw new ApiError(404, "unknown_operation", `Unknown operation: ${b.operationId}`);
  const st = await resolveState(c);
  if (st.mode === "disabled") throw new ApiError(409, "integration_unavailable", st.reason === "integration_disabled" ? "Geliver integration is disabled" : "Geliver integration is not configured");
  if (st.mode === "live" && op.risk !== "read" && b.confirm !== op.id) {
    throw new ApiError(409, "confirm_required", `This ${op.risk} call changes data on your real Geliver account${op.billed ? " and can be charged" : ""}: send confirm="${op.id}"`, { confirm: op.id, risk: op.risk, billed: !!op.billed });
  }
  const minute = await hit(c.env.DB, `gl:admin:${admin.id}`, 60);
  if (minute.count > CALLS_PER_MIN) throw new ApiError(429, "rate_limited", "Too many Geliver console calls, slow down", undefined, { "Retry-After": String(minute.resetIn) });

  let result;
  let secrets: string[] = [];
  try {
    if (st.mode === "mock") result = runGeliverMock(op, b);
    else {
      const live = await getAdapter(c.env, db, "geliver");
      const a = live?.adapter as unknown as ConsoleAdapter | undefined;
      if (!live || !a || typeof a.consoleCall !== "function") throw new ApiError(409, "integration_unavailable", "Geliver credentials are not available");
      secrets = Object.values(live.secrets);
      result = (await a.consoleCall(op, b)) as ReturnType<typeof runGeliverMock>;
    }
  } catch (e) {
    if (e instanceof GeliverConsoleError) throw new ApiError(e.code === "body_too_large" ? 413 : 400, e.code, scrub(e.message, secrets), e.details);
    throw e;
  }
  if (result.error) result.error = { ...result.error, message: scrub(result.error.message, secrets) };
  await audit(c, "geliver.call", "geliver_call", op.id, { operationId: op.id, risk: op.risk, status: result.status, mock: result.mock });
  // live changes are also visible in Admin → integration events
  if (!result.mock && op.risk !== "read") await logIntegrationEvent(db, "geliver", result.ok ? "info" : "warn", `console ${op.id}: HTTP ${result.status}`, { operationId: op.id, ok: result.ok }).catch(() => {});
  return c.json(result);
});

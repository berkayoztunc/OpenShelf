import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { integrationConfigs } from "@openshelf/db";
import { EFATURAM_OPERATIONS, EfaturamConsoleError, STAGE_BASE_URL } from "@openshelf/integration-efaturam";
import { EfaturamCallBody, type EfaturamCatalogResponse } from "@openshelf/shared";
import type { AppEnv } from "../env";
import { ApiError, body } from "../lib/http";
import { audit } from "../lib/audit";
import { requireRole } from "../middleware/auth";
import { hit } from "../middleware/security";
import { getAdapter, isIntegrationEnabled, isMockModeFresh, logIntegrationEvent } from "../lib/integrations";
import { scrub } from "../lib/log";
import { runEfaturamMock } from "../lib/efaturamMock";

/** Invoice data holds customer names, tax numbers and addresses, and live writes issue real invoices: owner/admin only. */
export const adminEfaturam = new Hono<AppEnv>();
adminEfaturam.use("/efaturam/*", requireRole("admin"));

const CALLS_PER_MIN = 60;
type ConsoleAdapter = { consoleCall(op: unknown, call: unknown): Promise<unknown> };

interface State { mode: EfaturamCatalogResponse["mode"]; reason?: EfaturamCatalogResponse["reason"]; environment: EfaturamCatalogResponse["environment"] }
async function resolveState(c: { env: AppEnv["Bindings"]; get: (k: "db") => AppEnv["Variables"]["db"] }): Promise<State> {
  const db = c.get("db");
  // Public config only: secrets are never selected here.
  const [row] = await db.select({ configPublic: integrationConfigs.configPublic, hasSecrets: integrationConfigs.secretsEnc }).from(integrationConfigs).where(eq(integrationConfigs.provider, "efaturam")).limit(1);
  const cfg = (row?.configPublic as Record<string, unknown> | undefined) ?? {};
  const environment = cfg.baseUrl === STAGE_BASE_URL ? "test" : "live";
  if (await isMockModeFresh(db)) return { mode: "mock", environment };
  if (!row || !row.hasSecrets) return { mode: "disabled", reason: "not_configured", environment };
  if (!(await isIntegrationEnabled(c.env, db, "efaturam"))) return { mode: "disabled", reason: "integration_disabled", environment };
  return { mode: "live", environment };
}

adminEfaturam.get("/efaturam/catalog", async (c) => {
  const st = await resolveState(c);
  const res: EfaturamCatalogResponse = { mode: st.mode, ...(st.reason ? { reason: st.reason } : {}), environment: st.environment, operations: EFATURAM_OPERATIONS };
  return c.json(res);
});

adminEfaturam.post("/efaturam/call", async (c) => {
  const b = await body(c, EfaturamCallBody);
  const db = c.get("db"); const admin = c.get("admin")!;
  const op = EFATURAM_OPERATIONS.find((o) => o.id === b.operationId);
  if (!op) throw new ApiError(404, "unknown_operation", `Unknown operation: ${b.operationId}`);
  const st = await resolveState(c);
  if (st.mode === "disabled") throw new ApiError(409, "integration_unavailable", st.reason === "integration_disabled" ? "e-Faturam integration is disabled" : "e-Faturam integration is not configured");
  if (st.mode === "live" && op.risk !== "read" && b.confirm !== op.id) {
    throw new ApiError(409, "confirm_required", `This ${op.risk} call changes data on your real e-Faturam account${op.billed ? " and issues a real invoice" : ""}: send confirm="${op.id}"`, { confirm: op.id, risk: op.risk, billed: !!op.billed });
  }
  const minute = await hit(c.env.DB, `ef:admin:${admin.id}`, 60);
  if (minute.count > CALLS_PER_MIN) throw new ApiError(429, "rate_limited", "Too many e-Faturam console calls, slow down", undefined, { "Retry-After": String(minute.resetIn) });

  let result;
  let secrets: string[] = [];
  try {
    if (st.mode === "mock") result = runEfaturamMock(op, b);
    else {
      const live = await getAdapter(c.env, db, "efaturam");
      const a = live?.adapter as unknown as ConsoleAdapter | undefined;
      if (!live || !a || typeof a.consoleCall !== "function") throw new ApiError(409, "integration_unavailable", "e-Faturam credentials are not available");
      secrets = Object.values(live.secrets);
      result = (await a.consoleCall(op, b)) as ReturnType<typeof runEfaturamMock>;
    }
  } catch (e) {
    if (e instanceof EfaturamConsoleError) throw new ApiError(e.code === "body_too_large" ? 413 : 400, e.code, scrub(e.message, secrets), e.details);
    throw e;
  }
  if (result.error) result.error = { ...result.error, message: scrub(result.error.message, secrets) };
  await audit(c, "efaturam.call", "efaturam_call", op.id, { operationId: op.id, risk: op.risk, status: result.status, mock: result.mock });
  // live changes are also visible in Admin → integration events
  if (!result.mock && op.risk !== "read") await logIntegrationEvent(db, "efaturam", result.ok ? "info" : "warn", `console ${op.id}: HTTP ${result.status}`, { operationId: op.id, ok: result.ok }).catch(() => {});
  return c.json(result);
});

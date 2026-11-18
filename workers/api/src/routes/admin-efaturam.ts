import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { integrationConfigs } from "@openshelf/db";
import { EFATURAM_OPERATIONS, EfaturamConsoleError, STAGE_BASE_URL } from "@openshelf/integration-efaturam";
import { EfaturamCallBody, type EfaturamCatalogResponse, type EfaturamDiagnosis, type EfaturamOutgoingRow } from "@openshelf/shared";
import type { AppEnv } from "../env";
import { ApiError, body, likeEscape, paged, paging } from "../lib/http";
import { audit } from "../lib/audit";
import { requireRole } from "../middleware/auth";
import { hit } from "../middleware/security";
import { getAdapter, isIntegrationEnabled, isMockModeFresh, logIntegrationEvent } from "../lib/integrations";
import { scrub } from "../lib/log";
import { MOCK_IDS, runEfaturamMock } from "../lib/efaturamMock";

/** Invoice data holds customer names, tax numbers and addresses, and live writes issue real invoices: owner/admin only. */
export const adminEfaturam = new Hono<AppEnv>();
adminEfaturam.use("/efaturam/*", requireRole("admin"));

const CALLS_PER_MIN = 60;
type ConsoleAdapter = { consoleCall(op: unknown, call: unknown): Promise<unknown>; diagnose(): Promise<EfaturamDiagnosis> };

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

/** Signs in and makes one harmless read call, reporting every step. Read-only at e-Faturam; nothing is stored. */
adminEfaturam.post("/efaturam/diagnose", async (c) => {
  const db = c.get("db"); const admin = c.get("admin")!;
  const st = await resolveState(c);
  if (st.mode === "disabled") throw new ApiError(409, "integration_unavailable", st.reason === "integration_disabled" ? "e-Faturam integration is disabled" : "e-Faturam integration is not configured");
  const minute = await hit(c.env.DB, `ef:admin:${admin.id}`, 60);
  if (minute.count > CALLS_PER_MIN) throw new ApiError(429, "rate_limited", "Too many e-Faturam console calls, slow down", undefined, { "Retry-After": String(minute.resetIn) });
  let res: EfaturamDiagnosis;
  if (st.mode === "mock") {
    res = { ok: true, mock: true, environment: st.environment, steps: [{ id: "signIn", ok: true, status: 200 }, { id: "token", ok: true, detail: "3 parts, mock" }, { id: "account", ok: true }, { id: "apiCall", ok: true, status: 404 }], claims: ["companyId", "exp", "userId"], ...MOCK_IDS };
  } else {
    const live = await getAdapter(c.env, db, "efaturam");
    const a = live?.adapter as unknown as ConsoleAdapter | undefined;
    if (!live || !a || typeof a.diagnose !== "function") throw new ApiError(409, "integration_unavailable", "e-Faturam credentials are not available");
    res = await a.diagnose();
    const secrets = Object.values(live.secrets);
    res.steps = res.steps.map((x) => (x.detail ? { ...x, detail: scrub(x.detail, secrets) } : x));
  }
  await audit(c, "efaturam.diagnose", "efaturam_call", "diagnose", { ok: res.ok, mock: res.mock, failed: res.steps.find((x) => !x.ok)?.id });
  return c.json(res);
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
interface OutgoingSqlRow { source: "order" | "manual"; id: string; type: string | null; status: string; provider_invoice_id: string | null; number: string | null; pdf_url: string | null; order_id: string | null; order_number: string | null; customer_name: string | null; total: number | null; currency: string | null; at: number }

/**
 * Invoices OpenShelf issued through e-Faturam, newest first: order invoices and manual invoices in one list.
 * (The gateway has no "list my outgoing invoices" call, so this is the store's own record of them.)
 */
adminEfaturam.get("/efaturam/outgoing", async (c) => {
  const p = paging(c);
  const q = c.req.query("q")?.trim();
  const like = q ? `%${likeEscape(q)}%` : null;
  const base = `
    SELECT 'order' AS source, i.id AS id, i.type AS type, i.status AS status, i.provider_invoice_id AS provider_invoice_id, i.number AS number, i.pdf_url AS pdf_url,
           i.order_id AS order_id, o.number AS order_number, COALESCE(json_extract(o.billing_address, '$.name'), json_extract(o.shipping_address, '$.name')) AS customer_name,
           o.total AS total, o.currency AS currency, i.created_at AS at
      FROM invoices i LEFT JOIN orders o ON o.id = i.order_id WHERE i.provider = 'efaturam'
    UNION ALL
    SELECT 'manual', m.id, m.type, m.status, m.provider_invoice_id, m.number, m.pdf_url,
           m.order_id, mo.number, json_extract(m.customer, '$.name'), m.total, m.currency, COALESCE(m.issued_at, m.created_at)
      FROM manual_invoices m LEFT JOIN orders mo ON mo.id = m.order_id WHERE m.provider = 'efaturam'`;
  const where = like ? ` WHERE (number LIKE ?1 ESCAPE '\\' OR order_number LIKE ?1 ESCAPE '\\' OR customer_name LIKE ?1 ESCAPE '\\' OR provider_invoice_id LIKE ?1 ESCAPE '\\')` : "";
  const args = like ? [like] : [];
  const rows = await c.env.DB.prepare(`SELECT * FROM (${base})${where} ORDER BY at DESC, id DESC LIMIT ${p.pageSize} OFFSET ${p.offset}`).bind(...args).all<OutgoingSqlRow>();
  const total = await c.env.DB.prepare(`SELECT count(*) AS n FROM (${base})${where}`).bind(...args).first<{ n: number }>();
  const items: EfaturamOutgoingRow[] = (rows.results ?? []).map((r) => ({
    source: r.source, id: r.id, type: r.type === "e_fatura" || r.type === "e_arsiv" ? r.type : null, status: r.status,
    // only a real ETTN can be looked up at the gateway (older rows may hold ids from before the adapter spoke to it)
    invoiceUuid: r.provider_invoice_id && UUID_RE.test(r.provider_invoice_id) ? r.provider_invoice_id : null,
    number: r.number, pdfUrl: r.pdf_url && /^https:\/\//.test(r.pdf_url) ? r.pdf_url : null,
    orderId: r.order_id, orderNumber: r.order_number, customerName: r.customer_name, total: r.total, currency: r.currency,
    createdAt: new Date(r.at * 1000).toISOString(),
  }));
  return c.json(paged(items, total?.n ?? 0, p));
});

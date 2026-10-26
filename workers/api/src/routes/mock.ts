import { Hono } from "hono";
import { and, desc, eq, sql } from "drizzle-orm";
import { mockMessages, orders, payments } from "@openshelf/db";
import { SystemSettings } from "@openshelf/shared";
import { MOCK_SIGNATURE_HEADER, parseMockPayToken, placeholderPdf, recordMock, signMockEvent, type MockPaymentEvent } from "@openshelf/integration-mock";
import type { PaymentProvider } from "@openshelf/integration-sdk";
import type { AppEnv } from "../env";
import { ApiError, body, forbidden, notFound, paged, paging } from "../lib/http";
import { audit } from "../lib/audit";
import { requireRole } from "../middleware/auth";
import { enforceRateLimit } from "../middleware/security";
import { saveSettings } from "../lib/settings";
import { getAdapter, isMockModeFresh } from "../lib/integrations";
import { assertMockEnableAllowed, mockAllowedByConfig, MOCK_DISABLED_MESSAGE } from "../lib/mockGuard";
import { handlePaymentEvent } from "../lib/payments";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

// ---------------------------------------------------------------- public /mock/* (404 unless mock mode is on)
export const mockRoutes = new Hono<AppEnv>();
mockRoutes.use("*", async (c, next) => {
  if (!(await isMockModeFresh(c.get("db")))) throw notFound("Route");
  c.header("Cache-Control", "no-store");
  await next();
});

const page = (c: { env: AppEnv["Bindings"] }, html: string, status: 200 | 404 = 200) =>
  new Response(html, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      // inline style only, no scripts/images/fonts; redirects after form submit must be allowed to reach the storefront
      "Content-Security-Policy": `default-src 'none'; style-src 'unsafe-inline'; form-action 'self' ${c.env.STOREFRONT_ORIGIN ?? ""}; base-uri 'none'; frame-ancestors 'none'`,
    },
  });

const CSS = `:root{color-scheme:light dark;--bg:#f5f5f7;--fg:#1d1d1f;--card:#fff;--bd:#d2d2d7;--mut:#6e6e73}@media(prefers-color-scheme:dark){:root{--bg:#111114;--fg:#f5f5f7;--card:#1c1c20;--bd:#3a3a40;--mut:#a1a1a6}}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--fg);font:16px/1.5 system-ui,sans-serif;padding:16px}
main{width:100%;max-width:420px;background:var(--card);border:1px solid var(--bd);border-radius:12px;padding:24px}
.badge{display:inline-block;background:#c62828;color:#fff;font-weight:700;font-size:12px;letter-spacing:.06em;padding:2px 8px;border-radius:4px}
h1{font-size:20px;margin:12px 0 4px}dl{margin:16px 0;display:grid;grid-template-columns:auto 1fr;gap:4px 12px}dt{color:var(--mut)}dd{margin:0;text-align:right;font-variant-numeric:tabular-nums}
.row{display:grid;gap:8px}button{font:inherit;font-weight:600;padding:12px;border-radius:8px;border:1px solid var(--bd);background:transparent;color:var(--fg);cursor:pointer;min-height:44px}
button:focus-visible{outline:3px solid #1a73e8;outline-offset:2px}button.ok{background:#2e7d32;color:#fff;border-color:#2e7d32}button.bad{background:#c62828;color:#fff;border-color:#c62828}p.note{color:var(--mut);font-size:13px}`;

async function loadPayment(c: { get(k: "db"): AppEnv["Variables"]["db"]; env: AppEnv["Bindings"] }, token: string) {
  const parsed = await parseMockPayToken(c.env.APP_ENCRYPTION_KEY, token).catch(() => null);
  if (!parsed) return null;
  const db = c.get("db");
  const [pay] = await db.select().from(payments).where(and(eq(payments.orderId, parsed.orderId), eq(payments.providerToken, token))).orderBy(desc(payments.createdAt)).limit(1);
  if (!pay) return null;
  const [o] = await db.select({ id: orders.id, number: orders.number, status: orders.status, trackingToken: orders.trackingToken }).from(orders).where(eq(orders.id, pay.orderId)).limit(1);
  return o ? { pay, order: o } : null;
}
const money = (minor: number, cur: string) => `${(minor / 100).toFixed(2)} ${cur}`;

mockRoutes.get("/pay/:token", async (c) => {
  await enforceRateLimit(c, "mock-pay-view", 120, 60);
  const token = c.req.param("token");
  const found = await loadPayment(c, token);
  if (!found) return page(c, `<!doctype html><meta charset="utf-8"><title>Not found</title><style>${CSS}</style><main><span class="badge">MOCK</span><h1>Payment not found</h1></main>`, 404);
  const { pay, order } = found;
  const open = pay.status === "pending" && ["pending", "awaiting_payment"].includes(order.status);
  const form = open
    ? `<form method="post" action="/mock/pay/${encodeURIComponent(token)}/complete" class="row">
<button class="ok" type="submit" name="result" value="success">Success</button>
<button class="bad" type="submit" name="result" value="fail">Fail</button>
<button type="submit" name="result" value="cancel">Cancel</button></form>`
    : `<p role="status">This payment is already <strong>${esc(pay.status)}</strong> (order ${esc(order.status)}).</p>`;
  return page(c, `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Mock payment</title><style>${CSS}</style>
<main><span class="badge">MOCK MODE</span><h1>Mock payment page</h1><p class="note">No real card is charged. This simulates the payment provider.</p>
<dl><dt>Order</dt><dd>${esc(order.number)}</dd><dt>Amount</dt><dd>${esc(money(pay.amount, pay.currency))}</dd></dl>${form}</main></html>`);
});

mockRoutes.post("/pay/:token/complete", async (c) => {
  await enforceRateLimit(c, "mock-pay", 60, 60);
  const origin = c.req.header("Origin"); // required: the mock page is a same-origin form post (browsers always send Origin)
  if (!origin || origin !== new URL(c.req.url).origin) throw forbidden("Cross-origin submit rejected");
  const token = c.req.param("token");
  const found = await loadPayment(c, token);
  if (!found) throw notFound("Payment");
  const db = c.get("db");
  let result = "";
  try { result = String(((await c.req.parseBody()) as Record<string, unknown>).result ?? ""); } catch { /* handled below */ }
  if (!["success", "fail", "cancel"].includes(result)) throw new ApiError(400, "bad_request", "result must be success, fail or cancel");
  const { pay, order } = found;
  const status = result === "success" ? "succeeded" : "failed";
  // Amount/currency come from OUR payment row; handlePaymentEvent re-checks them exactly like for a real provider.
  const ev: MockPaymentEvent = { eventId: `mock:${token}:${result === "success" ? "succeeded" : result === "fail" ? "failed" : "cancelled"}`, providerTxId: `mock_tx_${order.id}`, orderId: order.id, status, amount: pay.amount, currency: pay.currency };
  const sig = await signMockEvent(c.env.APP_ENCRYPTION_KEY, ev);
  const raw = JSON.stringify(ev);
  const a = await getAdapter<PaymentProvider>(c.env, db, "iyzico");
  if (!a) throw notFound("Payment provider");
  let verified;
  try { verified = await a.adapter.verifyWebhook(new Request(c.req.url, { method: "POST", headers: { [MOCK_SIGNATURE_HEADER]: sig, "Content-Type": "application/json" }, body: raw }), raw); }
  catch { throw new ApiError(401, "invalid_signature", "Mock verification failed"); }
  const r = await handlePaymentEvent(c.env, db, "iyzico", verified);
  await recordMock(db, { channel: "payment", subject: `Mock payment ${result}: ${order.number}`, body: `${money(pay.amount, pay.currency)} -> ${r.result}`, meta: { orderId: order.id, result, handled: r.result } });
  const sf = c.env.STOREFRONT_ORIGIN;
  if (result === "cancel") return c.redirect(`${sf}/checkout?payment=cancelled`, 302);
  return c.redirect(`${sf}/order/${encodeURIComponent(order.number)}?t=${encodeURIComponent(order.trackingToken)}`, 302);
});

/** Placeholder label / invoice documents referenced by mock shipments and invoices. */
mockRoutes.get("/doc/:name", (c) => {
  const name = c.req.param("name");
  if (!/^(label|invoice)-[0-9a-f]{8}\.pdf$/.test(name)) throw notFound("Document");
  return new Response(placeholderPdf(name) as unknown as BodyInit, { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${name}"`, "Content-Security-Policy": "default-src 'none'; sandbox" } });
});

// ---------------------------------------------------------------- admin API (mounted under /api/admin)
export const mockAdmin = new Hono<AppEnv>();

/** Registered before the generic PUT /settings/:group: only an owner may flip mock mode. */
mockAdmin.put("/settings/system", requireRole("owner"), async (c) => {
  const db = c.get("db");
  const value = await body(c, SystemSettings);
  const before = await isMockModeFresh(db);
  if (value.mockMode && !before) await assertMockEnableAllowed(c.env, db);
  await saveSettings(db, "system", value, c.get("admin")!.id); // invalidates the 30s settings cache
  await audit(c, value.mockMode === before ? "settings.update" : value.mockMode ? "mock_mode.enabled" : "mock_mode.disabled", "settings", "system", { mockMode: value.mockMode });
  return c.json(value);
});

/** Lets the admin System tab explain why the switch is unavailable (config) without trial and error. */
mockAdmin.get("/mock/status", requireRole("staff"), async (c) => {
  const allowed = mockAllowedByConfig(c.env);
  return c.json({ allowed, enabled: await isMockModeFresh(c.get("db")), reason: allowed ? null : MOCK_DISABLED_MESSAGE });
});

const CHANNELS = ["sms", "email", "event", "invoice", "shipment", "payment"];
mockAdmin.get("/mock/messages", requireRole("admin"), async (c) => {
  const db = c.get("db"); const p = paging(c, 50);
  const ch = c.req.query("channel");
  const where = ch && CHANNELS.includes(ch) ? eq(mockMessages.channel, ch) : undefined;
  const items = await db.select().from(mockMessages).where(where).orderBy(desc(mockMessages.id)).limit(p.pageSize).offset(p.offset);
  const [t] = await db.select({ n: sql<number>`count(*)` }).from(mockMessages).where(where);
  return c.json(paged(items, t?.n ?? 0, p));
});
mockAdmin.delete("/mock/messages", requireRole("owner"), async (c) => {
  const r = await c.env.DB.prepare("DELETE FROM mock_messages").run();
  await audit(c, "mock_messages.clear", "mock", undefined, { deleted: r.meta.changes });
  return c.json({ ok: true, deleted: r.meta.changes });
});

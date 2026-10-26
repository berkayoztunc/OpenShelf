import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { orders } from "@openshelf/db";
import type { PaymentProvider } from "@openshelf/integration-sdk";
import type { AppEnv, Env } from "../env";
import { ApiError, notFound } from "../lib/http";
import { getAdapter, logIntegrationEvent } from "../lib/integrations";
import { PAYMENT_PROVIDER_IDS } from "../integrations/registry";
import { handlePaymentEvent } from "../lib/payments";
import { enforceRateLimit } from "../middleware/security";
import { log } from "../lib/log";
import type { ProviderId } from "@openshelf/shared";
import type { Context } from "hono";

async function verifyAndHandle(c: Context<AppEnv>, providerParam: string) {
  const id = providerParam as ProviderId;
  if (!(PAYMENT_PROVIDER_IDS as string[]).includes(id)) throw notFound("Payment provider");
  const db = c.get("db");
  const a = await getAdapter<PaymentProvider>(c.env as Env, db, id);
  if (!a) throw notFound("Payment provider");
  const raw = c.req.method === "GET" ? "" : await c.req.text();
  const req = new Request(c.req.url, { method: c.req.method, headers: c.req.raw.headers, ...(c.req.method === "GET" ? {} : { body: raw }) });
  let ev;
  try { ev = await a.adapter.verifyWebhook(req, raw); }
  catch (e) {
    log("warn", "payment webhook verification failed", { provider: id, reason: e instanceof Error ? e.message : "unknown" });
    await logIntegrationEvent(db, id, "warn", "Rejected webhook: signature/verification failed").catch(() => {});
    throw new ApiError(401, "invalid_signature", "Webhook verification failed");
  }
  const r = await handlePaymentEvent(c.env as Env, db, id, ev);
  return { id, result: r.result, orderId: r.orderId ?? ev.orderId };
}

export const webhooks = new Hono<AppEnv>();
webhooks.post("/payment/:provider", async (c) => {
  await enforceRateLimit(c, "webhook", 600, 60);
  const r = await verifyAndHandle(c, c.req.param("provider"));
  return c.json({ ok: true, result: r.result });
});
webhooks.post("/trendyol", async (c) => {
  await enforceRateLimit(c, "webhook", 600, 60);
  const a = await getAdapter<import("@openshelf/integration-sdk").MarketplaceProvider>(c.env, c.get("db"), "trendyol");
  if (!a || !a.adapter.verifyWebhook) throw notFound("Marketplace provider");
  const raw = await c.req.text();
  let order;
  try { order = await a.adapter.verifyWebhook(new Request(c.req.url, { method: "POST", headers: c.req.raw.headers, body: raw }), raw); }
  catch { throw new ApiError(401, "invalid_signature", "Webhook verification failed"); }
  if (order) {
    const { enqueueJob } = await import("@openshelf/core");
    // Verified signal only: the reconcile handler pulls + imports orders (single, idempotent ingestion path).
    await enqueueJob(c.get("db"), { kind: "trendyol.reconcile_orders", payload: {}, dedupeKey: `trendyol.reconcile_orders:wh:${order.externalId}:${order.status}` });
  }
  return c.json({ ok: true });
});

/** Browser redirect target after hosted payment: verify server-side then 302 to storefront order page. */
export const paymentCallback = new Hono<AppEnv>();
paymentCallback.all("/:provider", async (c) => {
  if (c.req.method !== "GET" && c.req.method !== "POST") throw new ApiError(405, "method_not_allowed", "GET or POST only");
  await enforceRateLimit(c, "pay-callback", 120, 60);
  const sf = c.env.STOREFRONT_ORIGIN;
  try {
    const r = await verifyAndHandle(c, c.req.param("provider"));
    if (r.orderId) {
      const [o] = await c.get("db").select({ number: orders.number, token: orders.trackingToken }).from(orders).where(eq(orders.id, r.orderId));
      if (o) return c.redirect(`${sf}/order/${encodeURIComponent(o.number)}?t=${encodeURIComponent(o.token)}`, 302);
    }
    return c.redirect(`${sf}/checkout?payment=unknown`, 302);
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return c.redirect(`${sf}/checkout?payment=failed`, 302);
    throw e;
  }
});

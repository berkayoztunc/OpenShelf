import { env } from "cloudflare:test";
import { afterAll, describe, expect, it } from "vitest";
import type { PaymentEvent } from "@openshelf/integration-sdk";
import { admin, checkout, createProduct, enablePayment, ensureOwner, fakePay, freshIp, j, newCart } from "./helpers";

const orderOf = (number: string) => env.DB.prepare("SELECT * FROM orders WHERE number = ?1").bind(number).first<any>();
const inv = (v: string) => env.DB.prepare("SELECT total, reserved FROM inventory WHERE variant_id = ?1").bind(v).first<{ total: number; reserved: number }>();
const ev = (o: any, status: PaymentEvent["status"] = "succeeded", over: Partial<PaymentEvent> = {}): PaymentEvent =>
  ({ eventId: `fake:${o.id}:${status}`, providerTxId: `tx_${o.id}`, orderId: o.id, status, amount: o.total, currency: o.currency, ...over });
async function place(stock = 5, qty = 2) {
  const s = await ensureOwner(); await enablePayment(s);
  const { variantId } = await createProduct(s, { price: 7000, stock });
  const r = await checkout(await newCart(freshIp(), variantId, qty), freshIp(), `recheck-${crypto.randomUUID()}@example.com`);
  expect(r.status).toBe(201);
  const order = await orderOf((await j<any>(r)).orderNumber);
  return { s, variantId, order };
}
const recheck = async (s: any, id: string) => { const r = await admin(s, `/orders/${id}/payment/recheck`, "POST", {}); return { status: r.status, body: await j<any>(r) }; };
afterAll(() => { fakePay.retrieve = null; });

describe("POST /orders/:id/payment/recheck", () => {
  it("unpaid at the provider: nothing changes", async () => {
    const { s, order, variantId } = await place();
    fakePay.retrieve = () => ev(order, "failed", { amount: 0 });
    expect((await recheck(s, order.id)).body).toMatchObject({ result: "not_paid", orderStatus: "awaiting_payment" });
    expect(await inv(variantId)).toEqual({ total: 5, reserved: 2 });
  });

  it("lost callback: provider says paid -> order paid, stock sold; pressing again is harmless", async () => {
    const { s, order, variantId } = await place();
    fakePay.retrieve = () => ev(order);
    expect((await recheck(s, order.id)).body).toMatchObject({ result: "paid", orderStatus: "paid" });
    expect(await inv(variantId)).toEqual({ total: 3, reserved: 0 });
    const pay = await env.DB.prepare("SELECT status, provider_tx_id AS tx FROM payments WHERE order_id = ?1").bind(order.id).first<any>();
    expect(pay).toEqual({ status: "succeeded", tx: `tx_${order.id}` });
    expect((await recheck(s, order.id)).body.result).toBe("already_paid");
    expect(await inv(variantId)).toEqual({ total: 3, reserved: 0 });
  });

  it("order already cancelled (reservation expired) but paid: revived and completed", async () => {
    const { s, order, variantId } = await place();
    expect((await admin(s, `/orders/${order.id}/status`, "POST", { status: "cancelled" })).status).toBe(200);
    expect(await inv(variantId)).toEqual({ total: 5, reserved: 0 });
    // an earlier late callback left a rejected receipt behind
    await env.DB.prepare("INSERT INTO webhook_receipts (provider, event_id, status) VALUES ('iyzico', ?1, 'late_payment')").bind(`fake:${order.id}:succeeded`).run();
    fakePay.retrieve = () => ev(order);
    expect((await recheck(s, order.id)).body).toMatchObject({ result: "paid", orderStatus: "paid" });
    expect(await inv(variantId)).toEqual({ total: 3, reserved: 0 });
  });

  it("cancelled + paid but stock is gone: stays cancelled, asks for a refund", async () => {
    const { s, order, variantId } = await place(2, 2);
    await admin(s, `/orders/${order.id}/status`, "POST", { status: "cancelled" });
    await env.DB.prepare("UPDATE inventory SET total = 1 WHERE variant_id = ?1").bind(variantId).run();
    fakePay.retrieve = () => ev(order);
    expect((await recheck(s, order.id)).body).toMatchObject({ result: "out_of_stock", orderStatus: "cancelled" });
    expect(await inv(variantId)).toEqual({ total: 1, reserved: 0 });
  });

  it("amount mismatch is refused; provider errors become 502 with the reason; unknown order 404", async () => {
    const { s, order } = await place();
    fakePay.retrieve = () => ev(order, "succeeded", { amount: 1 });
    expect((await recheck(s, order.id)).body).toMatchObject({ result: "amount_mismatch", orderStatus: "awaiting_payment" });
    fakePay.retrieve = () => { throw new Error("provider timeout"); };
    const r = await recheck(s, order.id);
    expect(r.status).toBe(502); expect(r.body.error.message).toContain("provider timeout");
    expect((await recheck(s, "nope")).status).toBe(404);
  });
});

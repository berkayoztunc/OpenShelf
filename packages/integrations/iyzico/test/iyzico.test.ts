import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { factory, iyzicoAuthHeader, webhookSignature, IyzicoAdapter, PaymentMismatchError, WebhookSignatureError } from "../src/index";

const secrets = { apiKey: "sandbox-apikey1", secretKey: "sandbox-secret1" };
const mk = (fetchFn: any, config: any = { environment: "sandbox" }) =>
  factory.create({ config, secrets }, { fetch: fetchFn, now: () => new Date(1700000000000) }) as IyzicoAdapter;
const json = (o: unknown) => new Response(JSON.stringify(o), { status: 200 });

describe("IYZWSv2", () => {
  it("known-answer signature + header", async () => {
    const rnd = "123456789", path = "/payment/bin/check", body = '{"binNumber":"589004"}';
    const sig = createHmac("sha256", secrets.secretKey).update(rnd + path + body).digest("hex");
    const h = await iyzicoAuthHeader(secrets.apiKey, secrets.secretKey, rnd, path, body);
    expect(h.startsWith("IYZWSv2 ")).toBe(true);
    expect(Buffer.from(h.slice(8), "base64").toString()).toBe(`apiKey:${secrets.apiKey}&randomKey:${rnd}&signature:${sig}`);
  });
  it("webhook V3 HPP signature known-answer", async () => {
    const p = { iyziEventType: "CHECKOUT_FORM_AUTH", iyziPaymentId: 123, token: "tok", paymentConversationId: "o1", status: "SUCCESS" };
    expect(await webhookSignature(secrets.secretKey, p)).toBe(createHmac("sha256", secrets.secretKey).update(secrets.secretKey + "CHECKOUT_FORM_AUTH" + "123" + "tok" + "o1" + "SUCCESS").digest("hex"));
  });
});

describe("config", () => {
  it("rejects bad config", () => {
    expect(() => factory.create({ config: { environment: "mars" }, secrets }, { fetch: fetch as any, now: () => new Date() })).toThrow();
    expect(() => factory.create({ config: {}, secrets: { apiKey: "x" } }, { fetch: fetch as any, now: () => new Date() })).toThrow();
  });
  it("uses sandbox/prod hosts", async () => {
    const urls: string[] = [];
    const f = async (u: string) => { urls.push(u); return json({ status: "failure" }); };
    await mk(f).healthCheck(); await mk(f, { environment: "production" }).healthCheck();
    expect(urls[0]).toMatch(/^https:\/\/sandbox-api\.iyzipay\.com/); expect(urls[1]).toMatch(/^https:\/\/api\.iyzipay\.com/);
  });
});

const input = {
  orderId: "o1", orderNumber: "100", amount: 15050, currency: "TRY", callbackUrl: "https://shop.example/cb",
  buyer: { id: "c1", name: "A", surname: "B", email: "a@b.c", ip: "1.1.1.1", address: "x", city: "Istanbul", country: "Turkey" },
  items: [{ id: "i1", name: "P", category: "c", price: 5000, quantity: 2 }, { id: "i2", name: "Q", category: "c", price: 5050, quantity: 1 }],
};

describe("createCheckout", () => {
  it("sends decimal amounts and basketId=orderId; returns token", async () => {
    let sent: any, hdr: any;
    const a = mk(async (_u: string, init: any) => { sent = JSON.parse(init.body); hdr = init.headers; return json({ status: "success", token: "T", paymentPageUrl: "https://x" }); });
    const s = await a.createCheckout(input);
    expect(s.providerToken).toBe("T"); expect(sent.price).toBe("150.50"); expect(sent.basketId).toBe("o1");
    expect(hdr.Authorization).toMatch(/^IYZWSv2 /);
  });
  it("rejects basket sum mismatch", async () => {
    const a = mk(async () => json({}));
    await expect(a.createCheckout({ ...input, amount: 15000 })).rejects.toBeInstanceOf(PaymentMismatchError);
  });
});

const retrieveOk = { status: "success", paymentStatus: "SUCCESS", fraudStatus: 1, paymentId: "999", price: "150.5", paidPrice: "150.5", currency: "TRY", basketId: "o1", conversationId: "o1" };

describe("retrieve / webhook", () => {
  it("maps success, and rejects amount mismatch vs expected", async () => {
    const a = mk(async () => json(retrieveOk));
    const ev = await a.retrieve("T", { orderId: "o1", amount: 15050, currency: "TRY" });
    expect(ev).toMatchObject({ status: "succeeded", amount: 15050, orderId: "o1", providerTxId: "999" });
    await expect(a.retrieve("T", { orderId: "o1", amount: 100, currency: "TRY" })).rejects.toBeInstanceOf(PaymentMismatchError);
  });
  it("rejects paidPrice != price and basketId mismatch", async () => {
    await expect(mk(async () => json({ ...retrieveOk, paidPrice: "160" })).retrieve("T")).rejects.toBeInstanceOf(PaymentMismatchError);
    await expect(mk(async () => json({ ...retrieveOk, basketId: "zzz" })).retrieve("T")).rejects.toBeInstanceOf(PaymentMismatchError);
  });
  it("fraud review => pending", async () => {
    expect((await mk(async () => json({ ...retrieveOk, fraudStatus: 0 })).retrieve("T")).status).toBe("pending");
  });
  const payload = { iyziEventType: "CHECKOUT_FORM_AUTH", iyziPaymentId: 999, token: "T", paymentConversationId: "o1", status: "SUCCESS", iyziReferenceCode: "r1" };
  const req = (sig: string | null, body: string) => new Request("https://w/x", { method: "POST", headers: { "content-type": "application/json", ...(sig ? { "x-iyz-signature-v3": sig } : {}) }, body });
  it("rejects bad / missing signature without calling iyzico", async () => {
    let calls = 0;
    const a = mk(async () => { calls++; return json(retrieveOk); });
    const body = JSON.stringify(payload);
    await expect(a.verifyWebhook(req("deadbeef", body), body)).rejects.toBeInstanceOf(WebhookSignatureError);
    await expect(a.verifyWebhook(req(null, body), body)).rejects.toBeInstanceOf(WebhookSignatureError);
    expect(calls).toBe(0);
  });
  it("accepts valid signature then re-retrieves", async () => {
    const a = mk(async () => json(retrieveOk));
    const body = JSON.stringify(payload);
    const sig = await webhookSignature(secrets.secretKey, payload);
    expect((await a.verifyWebhook(req(sig, body), body)).status).toBe("succeeded");
  });
  it("form callback goes through retrieve", async () => {
    const a = mk(async () => json(retrieveOk));
    const r = new Request("https://w/cb", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "token=T" });
    expect((await a.verifyWebhook(r, "token=T")).orderId).toBe("o1");
  });
});

describe("refund", () => {
  it("calls v2 refund", async () => {
    let url = "", sent: any;
    const a = mk(async (u: string, i: any) => { url = u; sent = JSON.parse(i.body); return json({ status: "success", refundHostReference: "rf1" }); });
    const r = await a.refund({ providerTxId: "999", amount: 1000, currency: "TRY", ip: "1.1.1.1" });
    expect(r).toEqual({ ok: true, refundId: "rf1" }); expect(url).toContain("/v2/payment/refund"); expect(sent.price).toBe("10.00");
  });
});

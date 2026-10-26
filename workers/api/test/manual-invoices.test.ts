import { env } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import type { AdapterFactory, InvoiceInput, InvoicingProvider } from "@openshelf/integration-sdk";
import { computeInvoiceTotals } from "@openshelf/shared";
import { registerFactory } from "../src/integrations/registry";
import { toInvoiceLines } from "../src/lib/manual-invoice";
import { admin, createProduct, ensureOwner, freshIp, j, loginAs, type Session } from "./helpers";

const permissive = z.object({ config: z.record(z.unknown()), secrets: z.record(z.string()) });
const calls: { input: InvoiceInput; key: string }[] = [];
const cancels: string[] = [];
const beh = { fail: false, failMsg: "boom", delayMs: 0, cancelOk: true };
const efaturamFactory: AdapterFactory<InvoicingProvider> = {
  manifest: { id: "efaturam", name: "Fake e-Faturam", description: "t", publicFields: [], secretFields: [{ key: "k", label: "k", secret: true }], schema: permissive },
  create: ({ secrets }) => ({
    id: "efaturam", async validateConfig() {}, async healthCheck() { return { ok: true }; },
    async issue(input, key) {
      calls.push({ input, key });
      if (beh.delayMs) await new Promise((r) => setTimeout(r, beh.delayMs));
      if (beh.fail) throw new Error(`${beh.failMsg} ${secrets.k}`);
      return { providerInvoiceId: `inv_${key}`, number: "EA2026000001", type: input.customer.isCompany && input.customer.taxId ? "e_fatura" : "e_arsiv", pdfUrl: "https://pdf.test/inv.pdf" };
    },
    async cancel(id) { cancels.push(id); return { ok: beh.cancelOk }; },
  }),
};

let owner: Session; let staff: Session;
const line = (o: Record<string, unknown> = {}) => ({ name: "Widget", quantity: 2, unitPrice: 12000, taxRate: 20, discount: 0, ...o });
const body = (o: Record<string, unknown> = {}) => ({
  customer: { name: "Ayşe Yılmaz", email: "ayse@example.com", address: "Atatürk Cad. 1", city: "İstanbul", isCompany: false },
  lines: [line()], pricesIncludeTax: true, currency: "TRY", ...o,
});
const create = async (o: Record<string, unknown> = {}) => j<any>(await admin(owner, "/manual-invoices", "POST", body(o)));
const setProvider = async (enabled: boolean) => {
  registerFactory("efaturam", efaturamFactory as never);
  expect((await admin(owner, "/integrations/efaturam", "PUT", { enabled, config: {}, secrets: { k: "secret-value-1" } })).status).toBe(200);
};
const resetRealState = async () => {
  await env.DB.exec("UPDATE integration_configs SET enabled = 0 WHERE provider = 'iyzico'");
  await env.DB.exec("UPDATE orders SET status = 'delivered' WHERE status IN ('paid','fulfilling','shipped') AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.order_id = orders.id AND p.is_mock = 1)");
};
const mockOff = async () => { await admin(owner, "/settings/system", "PUT", { mockMode: false }); };

beforeAll(async () => {
  owner = await ensureOwner();
  await mockOff();
  await admin(owner, "/users", "POST", { email: "staff-inv@example.com", name: "Staff", password: "staff password 12345", role: "staff" });
  staff = await loginAs("staff-inv@example.com", "staff password 12345");
});
beforeEach(async () => { calls.length = 0; cancels.length = 0; beh.fail = false; beh.delayMs = 0; beh.cancelOk = true; await setProvider(true); });

describe("manual invoices: drafts and totals", () => {
  it("creates a draft; server recomputes totals and ignores client-supplied ones", async () => {
    const r = await admin(owner, "/manual-invoices", "POST", { ...body({ lines: [line({ quantity: 3, unitPrice: 9999, discount: 500 }), line({ name: "Free text", unitPrice: 5000, taxRate: 10 })] }), total: 1, taxTotal: 999999 });
    expect(r.status).toBe(201);
    const inv = await j<any>(r);
    const exp = computeInvoiceTotals(inv.lines, true);
    expect(inv.status).toBe("draft");
    expect(inv.total).toBe(exp.total); expect(inv.taxTotal).toBe(exp.tax);
    expect(inv.computed.total).toBe(exp.total);
    expect(inv.total).not.toBe(1);
  });
  it("tax-inclusive vs exclusive totals differ as computeInvoiceTotals says", async () => {
    const inc = await create({ pricesIncludeTax: true });
    const exc = await create({ pricesIncludeTax: false });
    expect(inc.total).toBe(24000); expect(inc.taxTotal).toBe(4000);
    expect(exc.total).toBe(28800); expect(exc.taxTotal).toBe(4800);
  });
  it("validates body and rejects a discount larger than the line", async () => {
    expect((await admin(owner, "/manual-invoices", "POST", { ...body(), lines: [] })).status).toBe(400);
    expect((await admin(owner, "/manual-invoices", "POST", body({ lines: [line({ discount: 99999999 })] }))).status).toBe(400);
    expect((await admin(owner, "/manual-invoices", "POST", body({ customer: { name: "A", address: "xxx", city: "Ist", taxId: "12" } }))).status).toBe(400);
    expect((await admin(owner, "/manual-invoices", "POST", body({ orderId: "nope" }))).status).toBe(400);
  });
  it("edits drafts, recomputes, deletes drafts only", async () => {
    const inv = await create();
    const up = await j<any>(await admin(owner, `/manual-invoices/${inv.id}`, "PUT", body({ lines: [line({ unitPrice: 1000, quantity: 1 })] })));
    expect(up.total).toBe(1000);
    expect((await admin(owner, `/manual-invoices/${inv.id}`, "DELETE")).status).toBe(200);
    expect((await admin(owner, `/manual-invoices/${inv.id}`)).status).toBe(404);
    const issued = await create();
    expect((await admin(owner, `/manual-invoices/${issued.id}/issue`, "POST")).status).toBe(200);
    expect((await admin(owner, `/manual-invoices/${issued.id}`, "PUT", body())).status).toBe(409);
    expect((await admin(owner, `/manual-invoices/${issued.id}`, "DELETE")).status).toBe(409);
  });
  it("lists with status filter and search", async () => {
    const inv = await create({ customer: { name: "Zebra Findable Ltd", address: "Some street 1", city: "Ankara", isCompany: false } });
    const l = await j<any>(await admin(owner, "/manual-invoices?status=draft&q=Findable"));
    expect(l.items.map((x: any) => x.id)).toContain(inv.id);
    expect((await admin(owner, "/manual-invoices?status=bogus")).status).toBe(400);
  });
});

describe("manual invoices: preview", () => {
  it("returns per-line numbers equal to computeInvoiceTotals, type and warnings", async () => {
    const inv = await create({ customer: { name: "Acme", address: "Addr 12", city: "Izmir", isCompany: true }, lines: [line({ taxRate: 0 }), line({ unitPrice: 0 })] });
    const p = await j<any>(await admin(owner, `/manual-invoices/${inv.id}/preview`, "POST"));
    const exp = computeInvoiceTotals(inv.lines, true);
    expect(p.lines.map((l: any) => [l.net, l.tax, l.total])).toEqual(exp.lines.map((l) => [l.net, l.tax, l.total]));
    expect(p.total).toBe(exp.total); expect(p.taxTotal).toBe(exp.tax);
    expect(p.type).toBe("e_arsiv");
    const codes = p.warnings.map((w: any) => w.code);
    expect(codes).toEqual(expect.arrayContaining(["company_tax_id_missing", "zero_tax_without_note", "zero_price"]));
  });
  it("resolves e_fatura for a company with a VKN and supports stateless preview + zero-total warning", async () => {
    const p = await j<any>(await admin(owner, "/manual-invoices/preview", "POST", body({ customer: { name: "Acme", address: "Addr 12", city: "Izmir", isCompany: true, taxId: "1234567890", taxOffice: "Kadikoy" }, lines: [line({ unitPrice: 0 })] })));
    expect(p.type).toBe("e_fatura");
    expect(p.warnings.map((w: any) => w.code)).toContain("zero_total");
  });
  it("staff may preview but not create", async () => {
    expect((await admin(staff, "/manual-invoices/preview", "POST", body())).status).toBe(200);
    expect((await admin(staff, "/manual-invoices", "POST", body())).status).toBe(403);
  });
});

describe("manual invoices: line mapping", () => {
  it("maps to KDV-inclusive unit prices, folds discounts, never loses a cent", () => {
    const inc = toInvoiceLines([{ name: "A", quantity: 2, unitPrice: 12000, taxRate: 20, discount: 0 }], true);
    expect(inc).toEqual([{ name: "A", quantity: 2, unitPrice: 12000, taxRate: 20 }]);
    const exc = toInvoiceLines([{ name: "A", quantity: 2, unitPrice: 12000, taxRate: 20, discount: 0 }], false);
    expect(exc[0]).toMatchObject({ quantity: 2, unitPrice: 14400 });
    const odd = toInvoiceLines([{ name: "B", quantity: 3, unitPrice: 1000, taxRate: 20, discount: 1 }], true);
    expect(odd[0]).toMatchObject({ quantity: 1, unitPrice: 2999, name: "B (3 x)" });
    const frac = toInvoiceLines([{ name: "C", quantity: 1.5, unitPrice: 1000, taxRate: 10, discount: 0 }], true);
    expect(frac[0]).toMatchObject({ quantity: 1, unitPrice: 1500 });
  });
});

describe("manual invoices: issue / cancel", () => {
  it("issues with idempotency key manual:<id>, stores provider data, audits without PII", async () => {
    const inv = await create();
    const r = await admin(owner, `/manual-invoices/${inv.id}/issue`, "POST");
    expect(r.status).toBe(200);
    const out = await j<any>(r);
    expect(out).toMatchObject({ status: "issued", number: "EA2026000001", provider: "efaturam", type: "e_arsiv", pdfUrl: "https://pdf.test/inv.pdf" });
    expect(out.issuedBy).toBeTruthy(); expect(out.issuedAt).toBeTruthy();
    expect(calls).toHaveLength(1);
    expect(calls[0]!.key).toBe(`manual:${inv.id}`);
    expect(calls[0]!.input.lines[0]).toMatchObject({ quantity: 2, unitPrice: 12000, taxRate: 20 });
    const a = await env.DB.prepare("SELECT meta FROM audit_logs WHERE action = 'manual_invoice.issue' AND entity_id = ?1").bind(inv.id).first<{ meta: string }>();
    expect(a?.meta).not.toContain("ayse@example.com"); expect(a?.meta).not.toContain("Ayşe");
    expect((await admin(owner, `/manual-invoices/${inv.id}/issue`, "POST")).status).toBe(409);
    expect(calls).toHaveLength(1);
  });
  it("concurrent double issue calls the adapter exactly once", async () => {
    beh.delayMs = 50;
    const inv = await create();
    const rs = await Promise.all([1, 2, 3].map(() => admin(owner, `/manual-invoices/${inv.id}/issue`, "POST")));
    const statuses = rs.map((r) => r.status).sort();
    expect(statuses).toEqual([200, 409, 409]);
    expect(calls).toHaveLength(1);
  });
  it("failed issue -> failed + scrubbed error + 502; retry succeeds; edit allowed while failed", async () => {
    beh.fail = true;
    const inv = await create();
    const r = await admin(owner, `/manual-invoices/${inv.id}/issue`, "POST");
    expect(r.status).toBe(502);
    const msg = JSON.stringify(await j(r));
    expect(msg).toContain("boom"); expect(msg).not.toContain("secret-value-1");
    const row = await j<any>(await admin(owner, `/manual-invoices/${inv.id}`));
    expect(row.status).toBe("failed"); expect(row.error).toContain("boom"); expect(row.error).not.toContain("secret-value-1");
    expect((await admin(owner, `/manual-invoices/${inv.id}`, "PUT", body({ lines: [line({ unitPrice: 5000 })] }))).status).toBe(200);
    beh.fail = false;
    const ok = await j<any>(await admin(owner, `/manual-invoices/${inv.id}/issue`, "POST"));
    expect(ok.status).toBe("issued"); expect(ok.error).toBeNull();
    expect(calls.map((c) => c.key)).toEqual([`manual:${inv.id}`, `manual:${inv.id}`]);
  });
  it("zero total cannot be issued", async () => {
    const inv = await create({ lines: [line({ unitPrice: 0 })] });
    expect((await admin(owner, `/manual-invoices/${inv.id}/issue`, "POST")).status).toBe(400);
    expect(calls).toHaveLength(0);
  });
  it("cancel: only issued; calls adapter; provider refusal keeps it issued", async () => {
    const inv = await create();
    expect((await admin(owner, `/manual-invoices/${inv.id}/cancel`, "POST")).status).toBe(409); // draft
    await admin(owner, `/manual-invoices/${inv.id}/issue`, "POST");
    beh.cancelOk = false;
    expect((await admin(owner, `/manual-invoices/${inv.id}/cancel`, "POST")).status).toBe(502);
    expect((await j<any>(await admin(owner, `/manual-invoices/${inv.id}`))).status).toBe("issued");
    beh.cancelOk = true;
    const c = await j<any>(await admin(owner, `/manual-invoices/${inv.id}/cancel`, "POST"));
    expect(c.status).toBe("cancelled");
    expect(cancels).toContain(`inv_manual:${inv.id}`);
    expect(await env.DB.prepare("SELECT 1 FROM audit_logs WHERE action = 'manual_invoice.cancel' AND entity_id = ?1").bind(inv.id).first()).toBeTruthy();
    expect((await admin(owner, `/manual-invoices/${inv.id}/cancel`, "POST")).status).toBe(409);
  });
  it("no enabled invoicing provider -> clear 409", async () => {
    const inv = await create();
    await setProvider(false);
    const r = await admin(owner, `/manual-invoices/${inv.id}/issue`, "POST");
    expect(r.status).toBe(409);
    expect((await j<any>(r)).error.code).toBe("no_invoicing_provider");
  });
  it("staff cannot issue/cancel/create/delete but can read", async () => {
    const inv = await create();
    expect((await admin(staff, `/manual-invoices/${inv.id}/issue`, "POST")).status).toBe(403);
    expect((await admin(staff, `/manual-invoices/${inv.id}/cancel`, "POST")).status).toBe(403);
    expect((await admin(staff, `/manual-invoices/${inv.id}`, "DELETE")).status).toBe(403);
    expect((await admin(staff, `/manual-invoices/${inv.id}`)).status).toBe(200);
    expect((await admin(staff, "/manual-invoices")).status).toBe(200);
    expect(calls).toHaveLength(0);
  });
  it("issue/cancel are rate limited to 30/hour/admin", async () => {
    const inv = await create();
    await env.DB.exec("DELETE FROM rate_limits WHERE key LIKE 'minv-op:%'");
    let last = 0;
    for (let i = 0; i < 31; i++) last = (await admin(owner, `/manual-invoices/${inv.id}/cancel`, "POST")).status; // 409 draft never reaches the limiter
    expect(last).toBe(409);
    const iss = await create({ lines: [line({ unitPrice: 0 })] });
    for (let i = 0; i < 30; i++) expect((await admin(owner, `/manual-invoices/${iss.id}/issue`, "POST")).status).toBe(400);
    expect((await admin(owner, `/manual-invoices/${iss.id}/issue`, "POST")).status).toBe(429);
    await env.DB.exec("DELETE FROM rate_limits WHERE key LIKE 'minv-op:%'");
  });
});

describe("lookups", () => {
  it("catalog-lookup returns website price, tax rate and stock; limited", async () => {
    const { variantId, product } = await createProduct(owner, { price: 12345, stock: 7 });
    const r = await j<any>(await admin(owner, `/catalog-lookup?q=${encodeURIComponent(product.variants[0].sku)}`));
    expect(r.items).toHaveLength(1);
    expect(r.items[0]).toMatchObject({ variantId, unitPrice: 12345, taxRate: 20, stock: 7 });
    expect(r.items[0].productName).toBeTruthy();
    expect((await j<any>(await admin(owner, "/catalog-lookup"))).items.length).toBeLessThanOrEqual(20);
  });
  it("customer-lookup finds customers with their last tax details", async () => {
    await env.DB.exec("INSERT OR REPLACE INTO customers (id, email, name, surname, phone) VALUES ('cust-look-1','lookup@example.com','Lola','Lookup','+905550001122')");
    await env.DB.exec("INSERT OR REPLACE INTO addresses (id, customer_id, name, line1, city, country, tax_id, tax_office, is_company) VALUES ('addr-look-1','cust-look-1','Lola','Main st 1','Bursa','TR','1234567890','Osmangazi',1)");
    const r = await j<any>(await admin(owner, "/customer-lookup?q=lookup%40example"));
    expect(r.items[0]).toMatchObject({ id: "cust-look-1", name: "Lola Lookup", email: "lookup@example.com", taxId: "1234567890", taxOffice: "Osmangazi", isCompany: true, city: "Bursa" });
  });
});

describe("manual invoices in mock mode", () => {
  it("issues through the mock adapter without any enabled provider", async () => {
    await setProvider(false); await resetRealState();
    expect((await admin(owner, "/settings/system", "PUT", { mockMode: true })).status).toBe(200);
    try {
      const inv = await create({ customer: { name: "Acme", address: "Addr 12", city: "Izmir", isCompany: true, taxId: "1234567890", taxOffice: "X" } });
      const out = await j<any>(await admin(owner, `/manual-invoices/${inv.id}/issue`, "POST"));
      expect(out.status).toBe("issued"); expect(out.number).toMatch(/^MOCK/); expect(out.type).toBe("e_fatura");
      expect(await env.DB.prepare("SELECT 1 FROM mock_messages WHERE channel = 'invoice' AND subject LIKE ?1").bind(`%${out.number}`).first()).toBeTruthy();
    } finally { await mockOff(); }
  });
});
void freshIp;

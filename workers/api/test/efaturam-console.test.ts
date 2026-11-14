import { env } from "cloudflare:test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { clearSettingsCache } from "../src/lib/settings";
import { admin, ensureOwner, j, loginAs, type Session } from "./helpers";

let owner: Session; let staff: Session;
const UUID = "96a8b0f1-7e10-4a44-8d78-eb961539bb4b";
const setMock = (on: boolean) => env.DB.prepare(`INSERT INTO store_settings ("group", value, updated_at) VALUES ('system', ?1, unixepoch()) ON CONFLICT("group") DO UPDATE SET value = ?1`).bind(JSON.stringify({ mockMode: on })).run().then(() => clearSettingsCache());
const call = (s: Session, json: unknown) => admin(s, "/efaturam/call", "POST", json);
const wipe = () => env.DB.exec("DELETE FROM integration_configs WHERE provider = 'efaturam'");
const configure = async (enabled: boolean, config: Record<string, unknown> = {}) => {
  await wipe();
  const { encryptJson } = await import("../src/lib/crypto");
  const e = await encryptJson(env as never, { username: "shop@example.com", password: "EFATURAM-PASSWORD-1234" }, "integration:efaturam");
  await env.DB.prepare("INSERT INTO integration_configs (provider, enabled, config_public, secrets_enc, secrets_iv, key_version, updated_at) VALUES ('efaturam', ?1, ?2, ?3, ?4, 1, unixepoch())")
    .bind(enabled ? 1 : 0, JSON.stringify(config), e.ciphertext, e.iv).run();
};

beforeAll(async () => {
  owner = await ensureOwner();
  const email = `staff-ef-${Date.now()}@example.com`;
  expect((await admin(owner, "/users", "POST", { email, name: "S", password: "staff password 12345", role: "staff" })).status).toBe(201);
  staff = await loginAs(email, "staff password 12345");
});
afterAll(async () => { await setMock(false); await wipe(); });

describe("efaturam console", () => {
  it("staff gets 403", async () => {
    expect((await admin(staff, "/efaturam/catalog")).status).toBe(403);
    expect((await call(staff, { operationId: "getTaxPayersByTaxId", path: { taxId: "1234567890" } })).status).toBe(403);
  });

  it("catalog modes: disabled -> disabled(off) -> live (live/test environment) -> mock", async () => {
    await setMock(false); await wipe();
    let c = await j<any>(await admin(owner, "/efaturam/catalog"));
    expect(c).toMatchObject({ mode: "disabled", reason: "not_configured", environment: "live" });
    expect(c.operations.length).toBeGreaterThan(10);
    await configure(false);
    expect((await j<any>(await admin(owner, "/efaturam/catalog"))).reason).toBe("integration_disabled");
    await configure(true);
    c = await j<any>(await admin(owner, "/efaturam/catalog"));
    expect(c).toMatchObject({ mode: "live", environment: "live" });
    expect(JSON.stringify(c)).not.toContain("EFATURAM-PASSWORD-1234");
    await configure(true, { baseUrl: "https://stage-apigateway.trendyolefaturam.com" });
    expect((await j<any>(await admin(owner, "/efaturam/catalog"))).environment).toBe("test");
    await setMock(true);
    expect((await j<any>(await admin(owner, "/efaturam/catalog"))).mode).toBe("mock");
  });

  it("disabled integration refuses calls", async () => {
    await setMock(false); await wipe();
    expect((await call(owner, { operationId: "getTaxPayersByTaxId", path: { taxId: "1234567890" } })).status).toBe(409);
  });

  it("live write/destructive calls need confirm before anything is sent", async () => {
    await setMock(false); await configure(true);
    const r = await call(owner, { operationId: "createEArchive", body: {} });
    expect(r.status).toBe(409);
    expect((await j<any>(r)).error).toMatchObject({ code: "confirm_required", details: { confirm: "createEArchive", billed: true } });
    const c = await call(owner, { operationId: "cancelEArchive", body: { invoiceUuid: UUID } });
    expect(c.status).toBe(409);
    expect((await j<any>(c)).error).toMatchObject({ code: "confirm_required", details: { risk: "destructive", billed: false } });
    expect((await call(owner, { operationId: "replyIncomingEInvoice", body: { invoiceUuid: UUID, responseType: "DENIED", note: "x" } })).status).toBe(409);
  });

  it("mock mode: offline answers with the same validation, no confirm needed, nothing leaves the Worker", async () => {
    await setMock(true);
    const yes = await j<any>(await call(owner, { operationId: "getTaxPayersByTaxId", path: { taxId: "1234567890" } }));
    expect(yes).toMatchObject({ ok: true, mock: true, status: 200 });
    expect(yes.response.body[0]).toMatchObject({ aliasType: "INVOICE" });
    const no = await j<any>(await call(owner, { operationId: "getTaxPayersByTaxId", path: { taxId: "22222222222" } }));
    expect(no).toMatchObject({ ok: false, mock: true, status: 404, error: { code: "tax-payer-not-found" } });

    const created = await j<any>(await call(owner, { operationId: "createEArchive", body: { invoiceInfo: { invoiceType: "EARSIVFATURA" }, invoiceTotal: { payableAmount: 12000 } } }));
    expect(created.ok).toBe(true);
    expect(created.request.body).toMatchObject({ companyId: 1000001, userId: 2000001 }); // account ids are filled in
    const uuid = created.response.body.invoiceUuid;
    expect(uuid).toMatch(/^[0-9a-f-]{36}$/); expect(created.response.body.invoiceId).toHaveLength(16);
    expect((await j<any>(await call(owner, { operationId: "getEArchiveStatus", path: { invoiceUuid: uuid } }))).response.body).toMatchObject({ status: "205", invoiceUuid: uuid });
    const link = await j<any>(await call(owner, { operationId: "getPermanentDocumentDownloadUrl", body: { documentType: "EARCHIVE", fileExtension: "pdf", invoiceUuid: uuid } }));
    expect(link.response.body).toBe(`https://mock.invalid/efaturam/${uuid}.pdf`);
    expect((await j<any>(await call(owner, { operationId: "cancelEArchive", body: { invoiceUuid: uuid } }))).ok).toBe(true);
    const list = await j<any>(await call(owner, { operationId: "searchIncomingEInvoice", body: { pagination: { page: 0, size: 20 } } }));
    expect(list.response.body.content).toHaveLength(2);
    expect((await j<any>(await call(owner, { operationId: "getSentReply", path: { invoiceUuid: UUID } }))).request.url).toContain("/sent-reply/1000001/");

    expect((await call(owner, { operationId: "getEArchiveStatus" })).status).toBe(400); // missing path param
    expect((await call(owner, { operationId: "getTaxPayersByTaxId", path: { taxId: "1" }, query: { evil: 1 } })).status).toBe(400);
    expect((await call(owner, { operationId: "cancelEArchive", body: "{not json" })).status).toBe(400);
    expect((await call(owner, { operationId: "nope" })).status).toBe(404);
  });
  it("diagnose: mock answers offline, disabled refuses, staff is blocked", async () => {
    await setMock(true);
    const d = await j<any>(await admin(owner, "/efaturam/diagnose", "POST", {}));
    expect(d).toMatchObject({ ok: true, mock: true, companyId: 1000001, userId: 2000001 });
    expect(d.steps.map((x: any) => x.id)).toEqual(["signIn", "token", "account", "apiCall"]);
    expect((await admin(staff, "/efaturam/diagnose", "POST", {})).status).toBe(403);
    await setMock(false); await wipe();
    expect((await admin(owner, "/efaturam/diagnose", "POST", {})).status).toBe(409);
  });

  it("outgoing: lists order and manual invoices issued through e-Faturam, newest first, searchable", async () => {
    await env.DB.exec("DELETE FROM invoices WHERE id LIKE 'ef-test-%'"); await env.DB.exec("DELETE FROM manual_invoices WHERE id LIKE 'ef-test-%'"); await env.DB.exec("DELETE FROM orders WHERE id LIKE 'ef-test-%'");
    await env.DB.prepare(`INSERT INTO orders (id, number, email, shipping_address, billing_address, subtotal, total, tracking_token, created_at) VALUES ('ef-test-o1', 'EF-9001', 'a@example.com', ?1, ?2, 24000, 24000, 'tok-ef-1', 1700000000)`)
      .bind(JSON.stringify({ name: "Kargo Alıcı" }), JSON.stringify({ name: "Ayşe Yılmaz" })).run();
    await env.DB.prepare(`INSERT INTO invoices (id, order_id, type, provider, provider_invoice_id, number, pdf_url, status, created_at) VALUES ('ef-test-i1', 'ef-test-o1', 'e_arsiv', 'efaturam', ?1, 'ABC2026000000001', 'https://files.example/1.pdf', 'issued', 1700000100)`).bind(UUID).run();
    await env.DB.prepare(`INSERT INTO invoices (id, order_id, type, provider, provider_invoice_id, number, status, created_at) VALUES ('ef-test-i2', 'ef-test-o1', 'e_fatura', 'efaturam', 'old-fake-id', NULL, 'pending', 1700000050)`).run();
    await env.DB.prepare(`INSERT INTO invoices (id, order_id, type, provider, provider_invoice_id, status, created_at) VALUES ('ef-test-i3', 'ef-test-o1x', 'e_arsiv', 'other', 'x', 'issued', 1700000300)`).run();
    await env.DB.prepare(`INSERT INTO manual_invoices (id, status, type, customer, lines, total, tax_total, provider, provider_invoice_id, number, pdf_url, issued_at, created_at) VALUES ('ef-test-m1', 'issued', 'e_fatura', ?1, '[]', 60000, 10000, 'efaturam', '11111111-2222-4333-8444-555555555555', 'EFT2026000000007', 'javascript:alert(1)', 1700000200, 1700000000)`)
      .bind(JSON.stringify({ name: "Acme A.Ş." })).run();
    await env.DB.prepare(`INSERT INTO manual_invoices (id, status, customer, lines, created_at) VALUES ('ef-test-m2', 'draft', '{}', '[]', 1700000400)`).run(); // never sent: not listed

    const all = await j<any>(await admin(owner, "/efaturam/outgoing"));
    const mine = all.items.filter((x: any) => x.id.startsWith("ef-test-"));
    expect(mine.map((x: any) => x.id)).toEqual(["ef-test-m1", "ef-test-i1", "ef-test-i2"]);
    expect(mine[0]).toMatchObject({ source: "manual", type: "e_fatura", status: "issued", invoiceUuid: "11111111-2222-4333-8444-555555555555", number: "EFT2026000000007", customerName: "Acme A.Ş.", total: 60000, pdfUrl: null, createdAt: "2023-11-14T22:16:40.000Z" });
    expect(mine[1]).toMatchObject({ source: "order", type: "e_arsiv", invoiceUuid: UUID, orderId: "ef-test-o1", orderNumber: "EF-9001", customerName: "Ayşe Yılmaz", total: 24000, currency: "TRY", pdfUrl: "https://files.example/1.pdf" });
    expect(mine[2]).toMatchObject({ status: "pending", invoiceUuid: null, number: null }); // not an ETTN: cannot be looked up
    const found = await j<any>(await admin(owner, "/efaturam/outgoing?q=EF-9001&pageSize=1"));
    expect(found).toMatchObject({ total: 2, pageSize: 1 }); expect(found.items).toHaveLength(1);
    expect((await j<any>(await admin(owner, "/efaturam/outgoing?q=acme"))).items.map((x: any) => x.id).filter((x: string) => x.startsWith("ef-test-"))).toEqual(["ef-test-m1"]);
    expect((await j<any>(await admin(owner, "/efaturam/outgoing?q=%25"))).total).toBe(0); // % is escaped, not a wildcard
    expect((await admin(staff, "/efaturam/outgoing")).status).toBe(403);
    await env.DB.exec("DELETE FROM invoices WHERE id LIKE 'ef-test-%'"); await env.DB.exec("DELETE FROM manual_invoices WHERE id LIKE 'ef-test-%'"); await env.DB.exec("DELETE FROM orders WHERE id LIKE 'ef-test-%'");
  });
});

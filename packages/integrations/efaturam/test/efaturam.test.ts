import { describe, expect, it } from "vitest";
import { factory, invoiceIssueHandler, buildAmounts, uuidFromKey, EfaturamAdapter } from "../src/index";
import type { InvoiceRepo } from "../src/index";

const PROD = "https://apigateway.trendyolecozum.com";
const secrets = { username: "shop@example.com", password: "p" };
const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const jwt = (claims: Record<string, unknown> = { companyId: 77, userId: 5, exp: 4102444800 }) => `${b64({ alg: "none" })}.${b64(claims)}.sig`;
type Call = { method: string; path: string; headers: Record<string, string>; body: any };
type Route = (c: Call) => { status?: number; json?: unknown; text?: string } | undefined;
/** Fake gateway: sign-in is answered here, everything else by `route`. */
function mk(route: Route = () => ({}), config: any = {}, token = jwt()) {
  const calls: Call[] = [];
  const adapter = factory.create({ config, secrets }, {
    now: () => new Date("2026-01-01T00:00:00Z"),
    fetch: async (u: string, i: any = {}) => {
      const c: Call = { method: i.method ?? "GET", path: u.replace(PROD, ""), headers: i.headers ?? {}, body: i.body ? JSON.parse(i.body) : undefined };
      calls.push(c);
      if (c.path === "/api/auth/signin") return new Response("5", { status: 200, headers: { "x-access-token": token } });
      const r = route(c) ?? {};
      return new Response(r.text ?? JSON.stringify(r.json ?? {}), { status: r.status ?? 200 });
    },
  }) as EfaturamAdapter;
  return { adapter, calls };
}
const base = { orderId: "o1", orderNumber: "100", issuedAt: "2026-01-01T00:00:00Z", currency: "TRY", lines: [{ name: "P", quantity: 2, unitPrice: 12000, taxRate: 20 }] };
const person = { name: "Ayşe Nur Yılmaz", address: "x", city: "Ist", isCompany: false };
const company = { ...person, name: "Acme A.Ş.", isCompany: true, taxId: "1234567890" };
const taxpayers = (list: unknown[] | null): Route => (c) => c.path.startsWith("/api/invoice/taxpayers/") ? (list ? { json: list } : { status: 404, json: { title: "tax-payer-not-found" } }) : undefined;

describe("efaturam", () => {
  it("config validation incl. SSRF host", () => {
    const d = { now: () => new Date(), fetch: fetch as any };
    expect(() => factory.create({ config: { baseUrl: "https://evil.example.com" }, secrets }, d)).toThrow();
    expect(() => factory.create({ config: { baseUrl: "https://efaturam.trendyol.com/api" }, secrets }, d)).toThrow();
    expect(() => factory.create({ config: { baseUrl: "http://apigateway.trendyolecozum.com" }, secrets }, d)).toThrow();
    expect(() => factory.create({ config: { baseUrl: "https://evil.apigateway.trendyolecozum.com" }, secrets }, d)).toThrow();
    expect(() => factory.create({ config: {}, secrets: {} }, d)).toThrow();
    expect(() => factory.create({ config: {}, secrets }, d)).not.toThrow();
    expect(() => factory.create({ config: { baseUrl: "https://stage-apigateway.trendyolefaturam.com", companyId: "", userId: "" }, secrets }, d)).not.toThrow();
  });
  it("signs in once and sends the token header", async () => {
    const { adapter, calls } = mk(taxpayers([]));
    expect(await adapter.healthCheck()).toEqual({ ok: true, detail: "signed in (live): companyId 77, userId 5" });
    await adapter.resolveInvoiceType({ ...base, customer: company });
    await adapter.resolveInvoiceType({ ...base, customer: company });
    expect(calls.filter((c) => c.path === "/api/auth/signin")).toHaveLength(1);
    expect(calls[0]!.body).toEqual({ email: "shop@example.com", password: "p" });
    expect(calls[1]!.headers["Authorization"]).toBe(`Bearer ${jwt()}`);
  });
  it("health check reports missing ids; config ids fill the gap", async () => {
    const bare = jwt({ exp: 4102444800 });
    expect((await mk(undefined, {}, bare).adapter.healthCheck()).ok).toBe(false);
    expect((await mk(undefined, { companyId: "77", userId: "5" }, bare).adapter.healthCheck()).ok).toBe(true);
  });
  it("health check tells an IP block from rejected credentials", async () => {
    const hc = (res: Response, baseUrl = PROD) => (factory.create({ config: { baseUrl }, secrets }, { now: () => new Date(), fetch: async () => res }) as EfaturamAdapter).healthCheck();
    expect(await hc(new Response("<html>Attention Required! | Cloudflare</html>", { status: 403 }), "https://stage-apigateway.trendyolefaturam.com")).toEqual({ ok: false, detail: "sign-in blocked (test): HTTP 403" });
    expect(await hc(new Response(JSON.stringify({ title: "Username or Password is wrong.", detail: "Invalid credentials." }), { status: 401 }))).toEqual({ ok: false, detail: "sign-in rejected (live): HTTP 401: Username or Password is wrong." });
    expect(await hc(new Response(JSON.stringify({ title: "User account is locked out." }), { status: 403 }))).toEqual({ ok: false, detail: "sign-in rejected (live): HTTP 403: User account is locked out." });
    expect((await hc(new Response("{}", { status: 500 }))).detail).toMatch(/^sign-in failed \(live\): e-faturam HTTP 500/);
  });
  it("type selection", async () => {
    const alias = [{ alias: "urn:mail:pk@acme.com", aliasType: "INVOICE" }];
    expect(await mk().adapter.resolveInvoiceType({ ...base, customer: person })).toBe("e_arsiv");
    expect(await mk(taxpayers(alias)).adapter.resolveInvoiceType({ ...base, customer: company })).toBe("e_fatura");
    expect(await mk(taxpayers([{ ...alias[0], deletedAt: "2025-01-01T00:00:00Z" }])).adapter.resolveInvoiceType({ ...base, customer: company })).toBe("e_arsiv");
    expect(await mk(taxpayers([{ alias: "x", aliasType: "DESPATCH_ADVICE" }])).adapter.resolveInvoiceType({ ...base, customer: company })).toBe("e_arsiv");
    expect(await mk(taxpayers(null)).adapter.resolveInvoiceType({ ...base, customer: company })).toBe("e_arsiv");
    expect(await mk(undefined, { verifyTaxpayer: false }).adapter.resolveInvoiceType({ ...base, customer: company })).toBe("e_fatura");
    expect(await mk().adapter.resolveInvoiceType({ ...base, customer: { ...company, taxId: "123" } })).toBe("e_arsiv");
  });
  it("amounts are kuruş, split from KDV-inclusive prices, and a discount line is spread", () => {
    const a = buildAmounts([{ name: "A", quantity: 2, unitPrice: 12000, taxRate: 20 }, { name: "B", quantity: 1, unitPrice: 11000, taxRate: 10 }, { name: "İndirim", quantity: 1, unitPrice: -3500, taxRate: 20 }]);
    expect(a.invoiceLines).toHaveLength(2);
    expect(a.invoiceTotal.payableAmount).toBe(24000 + 11000 - 3500);
    expect(a.invoiceTotal.taxInclusiveAmount).toBe(a.invoiceTotal.taxExclusiveAmount + a.totalTax.totalTaxAmount);
    expect(a.totalTax.subTotalTaxes.map((t) => t.percent)).toEqual([20, 10]);
    expect(a.totalTax.subTotalTaxes.reduce((x, t) => x + t.taxAmount, 0)).toBe(a.totalTax.totalTaxAmount);
    for (const l of a.invoiceLines) { expect(Number.isInteger(l.taxableAmount) && Number.isInteger(l.taxAmount)).toBe(true); expect(l.taxableAmount).toBeGreaterThan(0); }
    expect(() => buildAmounts([{ name: "A", quantity: 1, unitPrice: 100, taxRate: 20 }, { name: "İndirim", quantity: 1, unitPrice: -100, taxRate: 20 }])).toThrow();
  });
  it("issues an e-Arşiv and maps the result", async () => {
    const { adapter, calls } = mk((c) => c.path === "/api/invoice/documents/earchive" ? { json: { invoiceId: "ABC2026000000001", status: "30" } } : c.path.endsWith("/permanent-url") ? { text: "https://files.example/inv.pdf" } : undefined);
    const uuid = await uuidFromKey("o1:e_arsiv");
    const r = await adapter.issue({ ...base, customer: person }, "o1:e_arsiv");
    expect(r).toEqual({ providerInvoiceId: uuid, number: "ABC2026000000001", type: "e_arsiv", pdfUrl: "https://files.example/inv.pdf" });
    const body = calls.find((c) => c.path === "/api/invoice/documents/earchive")!.body;
    expect(body).toMatchObject({
      autoInvoiceId: true, companyId: 77, userId: 5, source: "WEB", localReferenceId: "100",
      recipientInfo: { taxId: "11111111111", name: "Ayşe Nur", surname: "Yılmaz", city: "Ist" },
      invoiceInfo: { invoiceType: "EARSIVFATURA", invoiceTypeCode: "SATIS", invoiceUuid: uuid },
      invoiceLines: [{ quantity: 2, unitPriceAmount: 10000, totalAmount: 20000, taxableAmount: 20000, taxAmount: 4000, taxPercent: 20 }],
      invoiceTotal: { taxExclusiveAmount: 20000, taxInclusiveAmount: 24000, payableAmount: 24000 },
    });
    expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(calls.find((c) => c.path.endsWith("/permanent-url"))!.body).toMatchObject({ documentType: "EARCHIVE", fileExtension: "pdf", invoiceUuid: uuid, companyId: 77 });
  });
  it("issues an e-Fatura to the taxpayer's alias", async () => {
    const { adapter, calls } = mk((c) => taxpayers([{ alias: "urn:mail:pk@acme.com", aliasType: "INVOICE" }])(c) ?? (c.path === "/api/invoice/documents/outgoing-einvoice" ? { json: { invoiceId: "EFT2026000000001" } } : { status: 404 }));
    const r = await adapter.issue({ ...base, customer: company }, "o1:e_fatura");
    expect(r).toMatchObject({ type: "e_fatura", number: "EFT2026000000001", pdfUrl: undefined });
    expect(calls.find((c) => c.path === "/api/invoice/documents/outgoing-einvoice")!.body).toMatchObject({
      targetAlias: "urn:mail:pk@acme.com", recipientInfo: { taxId: "1234567890", name: "Acme A.Ş." }, invoiceInfo: { invoiceType: "TEMELFATURA" },
    });
  });
  it("a retry that hits 'uuid already used' counts as issued, unless the first attempt failed", async () => {
    const conflict = (status: string | null): Route => (c) => c.path === "/api/invoice/documents/earchive" ? { status: 409, json: { detail: "Invoice Uuid Can't be used" } }
      : c.path.includes("/earchive/status/") ? (status ? { json: { status } } : { status: 404 }) : c.path.endsWith("/permanent-url") ? { status: 404 } : undefined;
    const ok = await mk(conflict("205")).adapter.issue({ ...base, customer: person }, "o1:e_arsiv");
    expect(ok).toMatchObject({ providerInvoiceId: await uuidFromKey("o1:e_arsiv"), type: "e_arsiv" });
    await expect(mk(conflict("405")).adapter.issue({ ...base, customer: person }, "o1:e_arsiv")).rejects.toThrow("409");
    await expect(mk(conflict(null)).adapter.issue({ ...base, customer: person }, "o1:e_arsiv")).rejects.toThrow("409");
  });
  it("re-signs in once on 401 and cancels an e-Arşiv", async () => {
    let n = 0;
    const { adapter, calls } = mk((c) => c.path.endsWith("/earchive/cancel") && n++ === 0 ? { status: 401 } : {});
    expect(await adapter.cancel("uuid-1")).toEqual({ ok: true });
    expect(calls.filter((c) => c.path === "/api/auth/signin")).toHaveLength(2);
    expect(calls[calls.length - 1]!.body).toEqual({ invoiceUuid: "uuid-1", companyId: 77 });
  });
});

function memRepo() {
  const rows = new Map<string, { id: string; status: string }>(); const events: string[] = [];
  const repo: InvoiceRepo = {
    loadOrder: async () => ({ ...base, customer: person }),
    claim: async (o, t) => { const k = o + t; if (!rows.has(k)) rows.set(k, { id: k, status: "pending" }); return rows.get(k)!; },
    markIssued: async (id) => { for (const r of rows.values()) if (r.id === id) r.status = "issued"; },
    event: async (_i, t) => { events.push(t); },
  };
  return { repo, rows, events };
}

describe("invoice.issue handler", () => {
  it("is idempotent; failure leaves pending and retry succeeds", async () => {
    const { repo, rows, events } = memRepo();
    let issues = 0, fail = true;
    const adapter = { resolveInvoiceType: async () => "e_arsiv", issue: async () => { issues++; if (fail) { fail = false; throw new Error("boom"); } return { providerInvoiceId: "i", type: "e_arsiv" }; } };
    const ctx = { db: {}, env: {}, getAdapter: async () => adapter, log: async () => {} };
    const h = invoiceIssueHandler(() => repo);
    const job = { id: "j", kind: "invoice.issue", payload: { orderId: "o1" }, attempts: 0 };
    await expect(h(job, ctx)).rejects.toThrow("boom");
    expect([...rows.values()][0]!.status).toBe("pending");
    await h(job, ctx); await h(job, ctx);
    expect(issues).toBe(2); expect(rows.size).toBe(1); expect(events).toEqual(["failed", "issued"]);
  });
  it("skips marketplace (Trendyol) orders: Trendyol issues that invoice", async () => {
    const { repo, rows } = memRepo();
    let issues = 0;
    const adapter = { resolveInvoiceType: async () => "e_arsiv", issue: async () => { issues++; return { providerInvoiceId: "i", type: "e_arsiv" }; } };
    const logs: string[] = [];
    const ctx = { db: {}, env: {}, getAdapter: async () => adapter, log: async (_l: string, m: string) => { logs.push(m); } };
    await invoiceIssueHandler(() => ({ ...repo, sourceOf: async () => "trendyol" }))({ id: "j", kind: "invoice.issue", payload: { orderId: "o1" }, attempts: 0 }, ctx);
    expect(issues).toBe(0); expect(rows.size).toBe(0); expect(logs[0]).toContain("channel-managed");
  });
});

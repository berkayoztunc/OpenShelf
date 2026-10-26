import { describe, expect, it } from "vitest";
import { factory, invoiceIssueHandler, EfaturamAdapter } from "../src/index";
import type { InvoiceRepo } from "../src/index";

const secrets = { username: "u", password: "p" };
const mk = (fn: (u: string, i: any) => any, config: any = {}) =>
  factory.create({ config, secrets }, { now: () => new Date(), fetch: async (u: string, i: any) => new Response(JSON.stringify(fn(u, i)), { status: 200 }) }) as EfaturamAdapter;
const base = { orderId: "o1", orderNumber: "100", issuedAt: "2026-01-01T00:00:00Z", currency: "TRY", lines: [{ name: "P", quantity: 2, unitPrice: 12000, taxRate: 20 }] };
const person = { name: "A", address: "x", city: "Ist", isCompany: false };
const company = { ...person, isCompany: true, taxId: "1234567890" };

describe("efaturam", () => {
  it("config validation incl. SSRF host", () => {
    const d = { now: () => new Date(), fetch: fetch as any };
    expect(() => factory.create({ config: { baseUrl: "https://evil.example.com" }, secrets }, d)).toThrow();
    expect(() => factory.create({ config: { baseUrl: "http://efaturam.trendyol.com" }, secrets }, d)).toThrow();
    expect(() => factory.create({ config: {}, secrets: {} }, d)).toThrow();
    expect(() => factory.create({ config: {}, secrets }, d)).not.toThrow();
  });
  it("type selection", async () => {
    expect(await mk(() => ({})).resolveInvoiceType({ ...base, customer: person })).toBe("e_arsiv");
    expect(await mk(() => ({ eInvoiceUser: true })).resolveInvoiceType({ ...base, customer: company })).toBe("e_fatura");
    expect(await mk(() => ({ eInvoiceUser: false })).resolveInvoiceType({ ...base, customer: company })).toBe("e_arsiv");
    expect(await mk(() => ({}), { verifyTaxpayer: false }).resolveInvoiceType({ ...base, customer: company })).toBe("e_fatura");
    expect(await mk(() => ({})).resolveInvoiceType({ ...base, customer: { ...company, taxId: "123" } })).toBe("e_arsiv");
  });
  it("issue sends idempotency key and maps result", async () => {
    let hdr: any, body: any;
    const a = mk((u, i) => { if (i.method === "POST") { hdr = i.headers; body = JSON.parse(i.body); } return { id: "inv1", number: "ABC2026000001", pdfUrl: "https://pdf" }; });
    const r = await a.issue({ ...base, customer: person }, "o1:e_arsiv");
    expect(r).toEqual({ providerInvoiceId: "inv1", number: "ABC2026000001", type: "e_arsiv", pdfUrl: "https://pdf" });
    expect(hdr["Idempotency-Key"]).toBe("o1:e_arsiv"); expect(body.lines[0].unitPrice).toBe("120.00");
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
});

import { z } from "zod";
import type {
  AdapterDeps, AdapterFactory, HealthResult, IntegrationCredentials, IntegrationManifest, InvoiceInput, InvoiceResult, InvoicingProvider,
} from "@openshelf/integration-sdk";
import { ALLOWED_HOST_SUFFIXES, DEFAULT_BASE_URL, authHeader, paths, type IssueRequest, type IssueResponse } from "./endpoints";

export { jobHandlers, invoiceIssueHandler, drizzleInvoiceRepo } from "./jobs";
export type { JobHandler, InvoiceRepo } from "./jobs";

const hostOk = (u: string) => { try { const x = new URL(u); return x.protocol === "https:" && ALLOWED_HOST_SUFFIXES.some((s) => x.hostname === s || x.hostname.endsWith("." + s)); } catch { return false; } };

export const configSchema = z.object({
  config: z.object({
    baseUrl: z.string().url().default(DEFAULT_BASE_URL).refine(hostOk, "baseUrl must be https on trendyol.com"),
    verifyTaxpayer: z.boolean().default(true), // look up whether a company VKN is an e-Fatura user; else fall back to e-Arşiv
    seriesPrefixEFatura: z.string().max(3).optional(),
    seriesPrefixEArsiv: z.string().max(3).optional(),
  }),
  secrets: z.object({ username: z.string().min(1), password: z.string().min(1) }),
});
type Parsed = z.infer<typeof configSchema>;

export const manifest: IntegrationManifest = {
  id: "efaturam", name: "Trendyol e-Faturam", description: "e-Fatura / e-Arşiv fatura kesme. Web siparişi kapsamı için e-Faturam sözleşmenizi doğrulayın.",
  publicFields: [
    { key: "baseUrl", label: "Servis URL", type: "url", required: true },
    { key: "verifyTaxpayer", label: "Vergi no e-Fatura mükellefi sorgula", type: "boolean" },
    { key: "seriesPrefixEFatura", label: "e-Fatura seri (3 harf)", type: "text" },
    { key: "seriesPrefixEArsiv", label: "e-Arşiv seri (3 harf)", type: "text" },
  ],
  secretFields: [
    { key: "username", label: "Kullanıcı adı", secret: true, required: true, type: "password" },
    { key: "password", label: "Şifre", secret: true, required: true, type: "password" },
  ],
  schema: configSchema,
};

export class EfaturamError extends Error { constructor(m: string) { super(m); this.name = "EfaturamError"; } }
const money = (minor: number) => (minor / 100).toFixed(2);

export class EfaturamAdapter implements InvoicingProvider {
  readonly id = "efaturam" as const;
  constructor(private p: Parsed, private deps: AdapterDeps) {
    if (!hostOk(p.config.baseUrl)) throw new EfaturamError("host not allowlisted");
  }
  async validateConfig() { configSchema.parse({ config: this.p.config, secrets: this.p.secrets }); }

  private async call(method: string, path: string, body?: unknown, extra: Record<string, string> = {}): Promise<any> {
    const res = await this.deps.fetch(this.p.config.baseUrl.replace(/\/$/, "") + path, {
      method,
      headers: { Authorization: authHeader(this.p.secrets.username, this.p.secrets.password), Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}), ...extra },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const text = await res.text();
    let j: any = {};
    try { j = text ? JSON.parse(text) : {}; } catch { /* non-JSON */ }
    if (!res.ok) throw new EfaturamError(`e-faturam HTTP ${res.status}: ${String(j?.message ?? j?.error ?? "").slice(0, 200)}`);
    return j;
  }

  async healthCheck(): Promise<HealthResult> {
    try { await this.call("GET", paths.ping); return { ok: true }; } catch (e) { return { ok: false, detail: (e as Error).message }; }
  }

  /** e_fatura only for companies with a 10-digit VKN that are registered e-Fatura users; everything else is e_arsiv. */
  async resolveInvoiceType(input: InvoiceInput): Promise<"e_fatura" | "e_arsiv"> {
    const c = input.customer;
    const vkn = c.taxId?.replace(/\s/g, "");
    if (!c.isCompany || !vkn || !/^\d{10}$/.test(vkn)) return "e_arsiv";
    if (!this.p.config.verifyTaxpayer) return "e_fatura";
    try {
      const r = await this.call("GET", paths.taxpayer(vkn));
      return r?.eInvoiceUser === true ? "e_fatura" : "e_arsiv";
    } catch { return "e_arsiv"; }
  }

  async issue(input: InvoiceInput, idempotencyKey: string): Promise<InvoiceResult> {
    const type = await this.resolveInvoiceType(input);
    const body: IssueRequest = {
      type, orderNumber: input.orderNumber, issueDate: input.issuedAt, currency: input.currency,
      seriesPrefix: type === "e_fatura" ? this.p.config.seriesPrefixEFatura : this.p.config.seriesPrefixEArsiv,
      customer: { name: input.customer.name, email: input.customer.email, taxId: input.customer.taxId, taxOffice: input.customer.taxOffice, address: input.customer.address, city: input.customer.city },
      lines: input.lines.map((l) => ({ name: l.name, quantity: l.quantity, unitPrice: money(l.unitPrice), vatRate: l.taxRate })),
    };
    const r: IssueResponse = await this.call("POST", paths.issue, body, { "Idempotency-Key": idempotencyKey });
    const id = r.id ?? r.invoiceId;
    if (!id) throw new EfaturamError("e-faturam: no invoice id in response");
    return { providerInvoiceId: String(id), number: r.number ?? r.invoiceNumber, type, pdfUrl: r.pdfUrl ?? r.pdf };
  }

  async cancel(providerInvoiceId: string): Promise<{ ok: boolean }> {
    try { await this.call("POST", paths.cancel(providerInvoiceId), {}); return { ok: true }; } catch { return { ok: false }; }
  }
}

export const factory: AdapterFactory<EfaturamAdapter> = {
  manifest,
  create(creds: IntegrationCredentials, deps: AdapterDeps) {
    return new EfaturamAdapter(configSchema.parse({ config: creds.config, secrets: creds.secrets }), deps);
  },
};

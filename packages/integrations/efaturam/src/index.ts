import { z } from "zod";
import type {
  AdapterDeps, AdapterFactory, HealthResult, IntegrationCredentials, IntegrationManifest, InvoiceInput, InvoiceResult, InvoicingProvider,
} from "@openshelf/integration-sdk";
import {
  ALLOWED_HOSTS, ANONYMOUS_TCKN, DEFAULT_BASE_URL, FAILED_STATUSES, KDV, PROD_BASE_URL, STAGE_BASE_URL, TOKEN_HEADER, UNIT_PIECE, paths,
  type CreateInvoiceRequest, type CreateInvoiceResponse, type TaxPayer, type TaxSubtotal,
} from "./endpoints";

import type { EfaturamCallResult, EfaturamOperation } from "@openshelf/shared";
import { buildEfaturamRequest, runEfaturamCall, signInFailure, type ConsoleCall } from "./console";

export { jobHandlers, invoiceIssueHandler, drizzleInvoiceRepo } from "./jobs";
export type { JobHandler, InvoiceRepo } from "./jobs";
export { EFATURAM_OPERATIONS } from "./catalog";
export { EfaturamConsoleError, buildEfaturamRequest, runEfaturamCall } from "./console";
export { PROD_BASE_URL, STAGE_BASE_URL } from "./endpoints";

const hostOk = (u: string) => { try { const x = new URL(u); return x.protocol === "https:" && ALLOWED_HOSTS.includes(x.hostname); } catch { return false; } };
const numericId = z.string().regex(/^\d+$/).optional().or(z.literal("").transform(() => undefined));

export const configSchema = z.object({
  config: z.object({
    baseUrl: z.string().url().default(DEFAULT_BASE_URL).refine(hostOk, "baseUrl must be the e-Faturam gateway: " + ALLOWED_HOSTS.join(" or ")),
    verifyTaxpayer: z.boolean().default(true), // look up whether a company VKN is an e-Fatura user; else fall back to e-Arşiv
    seriesPrefixEFatura: z.string().max(3).optional(),
    seriesPrefixEArsiv: z.string().max(3).optional(),
    companyId: numericId, // only needed when the sign-in token does not carry them
    userId: numericId,
  }),
  secrets: z.object({ username: z.string().min(1), password: z.string().min(1) }),
});
type Parsed = z.infer<typeof configSchema>;

export const manifest: IntegrationManifest = {
  id: "efaturam", name: "Trendyol e-Faturam", description: "e-Fatura / e-Arşiv fatura kesme. Web siparişi kapsamı için e-Faturam sözleşmenizi doğrulayın.",
  docsUrl: "https://developers.trendyolefaturam.com/",
  publicFields: [
    { key: "baseUrl", label: "Ortam", type: "select", required: true, options: [{ value: PROD_BASE_URL, label: "Canlı" }, { value: STAGE_BASE_URL, label: "Test" }], help: "Test ortamı e-Faturam tarafında IP izni ister; canlı ortam istemez." },
    { key: "verifyTaxpayer", label: "Vergi no e-Fatura mükellefi sorgula", type: "boolean" },
    { key: "seriesPrefixEFatura", label: "e-Fatura seri (3 harf)", type: "text" },
    { key: "seriesPrefixEArsiv", label: "e-Arşiv seri (3 harf)", type: "text" },
    { key: "companyId", label: "Firma ID (companyId)", type: "text", help: "Boş bırakın; bağlantı testi bulunamadığını söylerse e-Faturam'dan aldığınız değeri girin." },
    { key: "userId", label: "Kullanıcı ID (userId)", type: "text", help: "Boş bırakın; bağlantı testi bulunamadığını söylerse e-Faturam'dan aldığınız değeri girin." },
  ],
  secretFields: [
    { key: "username", label: "E-posta", secret: true, required: true, type: "password" },
    { key: "password", label: "Şifre", secret: true, required: true, type: "password" },
  ],
  schema: configSchema,
};

/** `blocked`: the answer was not the gateway's JSON (a firewall / IP block page), so the request never reached e-Faturam. */
export class EfaturamError extends Error { constructor(m: string, readonly status?: number, readonly blocked = false) { super(m); this.name = "EfaturamError"; } }

const jwtClaims = (token: string): Record<string, unknown> => {
  try { const p = token.split(".")[1]!.replace(/-/g, "+").replace(/_/g, "/"); return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(p), (c) => c.charCodeAt(0)))); } catch { return {}; }
};
const claimNum = (c: Record<string, unknown>, keys: string[]) => { for (const k of keys) { const n = Number(c[k]); if (c[k] != null && c[k] !== "" && Number.isFinite(n)) return n; } return undefined; };

/** Deterministic UUID from the idempotency key, so a retry reuses the same ETTN and cannot create a second invoice. */
export async function uuidFromKey(key: string): Promise<string> {
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode("openshelf:efaturam:" + key))).slice(0, 16);
  h[6] = (h[6]! & 0x0f) | 0x50; h[8] = (h[8]! & 0x3f) | 0x80;
  const x = [...h].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}

/**
 * Turn KDV-inclusive minor-unit lines into the kuruş breakdown the gateway wants. Negative lines (order discount)
 * are spread over the positive lines in proportion, so every invoice line stays positive and the total still matches the order.
 */
export function buildAmounts(lines: InvoiceInput["lines"]) {
  const pos = lines.filter((l) => l.unitPrice * l.quantity > 0);
  const gross = pos.map((l) => l.unitPrice * l.quantity);
  const grossSum = gross.reduce((a, b) => a + b, 0);
  const discount = -lines.filter((l) => l.unitPrice * l.quantity < 0).reduce((a, l) => a + l.unitPrice * l.quantity, 0);
  if (!pos.length || discount >= grossSum) throw new EfaturamError("e-faturam: invoice total must be positive");
  let left = discount;
  const invoiceLines = pos.map((l, i) => {
    const cut = i === pos.length - 1 ? left : Math.min(left, Math.round((discount * gross[i]!) / grossSum));
    left -= cut;
    const inclusive = gross[i]! - cut;
    const taxableAmount = Math.round(inclusive / (1 + l.taxRate / 100));
    return {
      unitCode: UNIT_PIECE, quantity: l.quantity, itemName: l.name, unitPriceAmount: Math.round((taxableAmount / l.quantity) * 100) / 100,
      totalAmount: taxableAmount, taxableAmount, taxAmount: inclusive - taxableAmount, taxPercent: l.taxRate, taxName: KDV.name, taxCode: KDV.taxCode, totalDiscountAmount: 0,
    };
  });
  const byRate = new Map<number, TaxSubtotal>();
  for (const l of invoiceLines) {
    const s = byRate.get(l.taxPercent) ?? { taxableAmount: 0, taxAmount: 0, percent: l.taxPercent, ...KDV };
    s.taxableAmount += l.taxableAmount; s.taxAmount += l.taxAmount; byRate.set(l.taxPercent, s);
  }
  const net = invoiceLines.reduce((a, l) => a + l.taxableAmount, 0), tax = invoiceLines.reduce((a, l) => a + l.taxAmount, 0);
  return {
    invoiceLines,
    totalTax: { totalTaxAmount: tax, subTotalTaxes: [...byRate.values()] },
    invoiceTotal: { lineExtensionAmount: net, taxExclusiveAmount: net, taxInclusiveAmount: net + tax, payableAmount: net + tax, allowanceTotalAmount: 0 },
  };
}

export class EfaturamAdapter implements InvoicingProvider {
  readonly id = "efaturam" as const;
  private session?: { token: string; exp: number; companyId: number; userId: number };
  constructor(private p: Parsed, private deps: AdapterDeps) {
    if (!hostOk(p.config.baseUrl)) throw new EfaturamError("host not allowlisted");
  }
  async validateConfig() { configSchema.parse({ config: this.p.config, secrets: this.p.secrets }); }

  private url(path: string) { return this.p.config.baseUrl.replace(/\/+$/, "") + path; }

  private static async fail(res: Response): Promise<never> {
    const text = await res.text();
    let j: any;
    try { j = text ? JSON.parse(text) : undefined; } catch { /* non-JSON */ }
    const blocked = res.status === 403 && (j === undefined || typeof j !== "object");
    throw new EfaturamError(`e-faturam HTTP ${res.status}: ${blocked ? "blocked before reaching the gateway" : String(j?.title ?? j?.detail ?? j?.message ?? "").slice(0, 300)}`, res.status, blocked);
  }

  private async signIn() {
    const now = this.deps.now().getTime();
    if (this.session && this.session.exp - 60_000 > now) return this.session;
    const res = await this.deps.fetch(this.url(paths.signIn), {
      method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ email: this.p.secrets.username, password: this.p.secrets.password }),
    });
    if (!res.ok) await EfaturamAdapter.fail(res);
    const token = res.headers.get(TOKEN_HEADER);
    if (!token) throw new EfaturamError(`e-faturam: sign-in answered without ${TOKEN_HEADER}`);
    const c = jwtClaims(token);
    // UNVERIFIED: the docs say companyId and userId are inside the token but do not name the claims.
    const companyId = this.p.config.companyId ? Number(this.p.config.companyId) : claimNum(c, ["companyId", "company_id"]);
    const userId = this.p.config.userId ? Number(this.p.config.userId) : claimNum(c, ["userId", "user_id"]);
    if (companyId == null || userId == null) throw new EfaturamError("e-faturam: companyId/userId not found in the token; set them in the integration settings");
    const exp = typeof c.exp === "number" ? c.exp * 1000 : now + 10 * 60_000;
    return (this.session = { token, exp, companyId, userId });
  }

  private async call(method: string, path: string, body?: unknown, retry = true): Promise<{ json: any; text: string; session: NonNullable<EfaturamAdapter["session"]> }> {
    const session = await this.signIn();
    const res = await this.deps.fetch(this.url(path), {
      method,
      headers: { [TOKEN_HEADER]: session.token, Accept: "application/json, text/plain", ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (res.status === 401 && retry) { this.session = undefined; return this.call(method, path, body, false); }
    if (!res.ok) await EfaturamAdapter.fail(res);
    const text = await res.text();
    let json: any;
    try { json = text ? JSON.parse(text) : undefined; } catch { /* plain text answer */ }
    return { json, text, session };
  }

  /** API console: runs one catalog operation as the signed-in account (one re-sign-in when the token has expired). */
  async consoleCall(op: EfaturamOperation, call: ConsoleCall): Promise<EfaturamCallResult> {
    const base = this.p.config.baseUrl;
    buildEfaturamRequest(op, call, base); // reject bad input before spending a sign-in
    for (let attempt = 0; ; attempt++) {
      let s: Awaited<ReturnType<EfaturamAdapter["signIn"]>>;
      try { s = await this.signIn(); }
      catch (e) { const x = e as EfaturamError; return signInFailure(op, buildEfaturamRequest(op, call, base), x.status, x.blocked ? "Blocked before reaching the gateway (IP not allowed)" : x.message); }
      const r = await runEfaturamCall({ fetch: this.deps.fetch }, s.token, op, buildEfaturamRequest(op, call, base, s));
      if (r.status !== 401 || attempt > 0) return r;
      this.session = undefined;
    }
  }

  async healthCheck(): Promise<HealthResult> {
    // Stable phrases: the admin panel translates them (apps/admin TestResult.localizeDetail).
    const env = this.p.config.baseUrl.includes("stage-") ? "test" : "live";
    try {
      this.session = undefined;
      const s = await this.signIn();
      return { ok: true, detail: `signed in (${env}): companyId ${s.companyId}, userId ${s.userId}` };
    } catch (e) {
      const x = e as EfaturamError;
      if (x.blocked) return { ok: false, detail: `sign-in blocked (${env}): HTTP ${x.status}` };
      if (x.status === 401 || x.status === 403) return { ok: false, detail: `sign-in rejected (${env}): ${x.message.replace(/^e-faturam /, "")}` };
      return { ok: false, detail: `sign-in failed (${env}): ${x.message}` };
    }
  }

  /** Active e-Fatura alias of a VKN, or undefined when the taxpayer is not an e-Fatura user. */
  private async invoiceAlias(vkn: string): Promise<string | undefined> {
    try {
      const { json } = await this.call("GET", paths.taxpayer(vkn));
      const hit = (Array.isArray(json) ? (json as TaxPayer[]) : []).find((t) => t.aliasType === "INVOICE" && !t.deletedAt && t.alias);
      return hit?.alias;
    } catch (e) { if ((e as EfaturamError).status === 404) return undefined; throw e; }
  }

  /** e_fatura only for companies with a 10-digit VKN that are registered e-Fatura users; everything else is e_arsiv. */
  async resolveInvoiceType(input: InvoiceInput): Promise<"e_fatura" | "e_arsiv"> {
    const c = input.customer;
    const vkn = c.taxId?.replace(/\s/g, "");
    if (!c.isCompany || !vkn || !/^\d{10}$/.test(vkn)) return "e_arsiv";
    if (!this.p.config.verifyTaxpayer) return "e_fatura";
    try { return (await this.invoiceAlias(vkn)) ? "e_fatura" : "e_arsiv"; } catch { return "e_arsiv"; }
  }

  private async pdfUrl(type: "e_fatura" | "e_arsiv", invoiceUuid: string, companyId: number): Promise<string | undefined> {
    try {
      const { text } = await this.call("POST", paths.permanentUrl, { documentType: type === "e_fatura" ? "EINVOICE" : "EARCHIVE", fileExtension: "pdf", invoiceUuid, companyId });
      const u = text.trim().replace(/^"|"$/g, "");
      return /^https:\/\//.test(u) ? u : undefined;
    } catch { return undefined; } // the document may still be rendering; the invoice itself is issued
  }

  async issue(input: InvoiceInput, idempotencyKey: string): Promise<InvoiceResult> {
    const type = await this.resolveInvoiceType(input);
    const { companyId, userId } = await this.signIn();
    const invoiceUuid = await uuidFromKey(idempotencyKey);
    const c = input.customer;
    const taxId = c.taxId?.replace(/\s/g, "") || ANONYMOUS_TCKN;
    const fullName = c.name.trim().replace(/\s+/g, " ");
    const cut = c.isCompany ? -1 : fullName.lastIndexOf(" "); // a person's last word is the surname; a company keeps its title whole
    const alias = type === "e_fatura" && this.p.config.verifyTaxpayer ? await this.invoiceAlias(taxId) : undefined;
    const prefix = type === "e_fatura" ? this.p.config.seriesPrefixEFatura : this.p.config.seriesPrefixEArsiv;
    const body: CreateInvoiceRequest = {
      autoInvoiceId: true, companyId, userId, source: "WEB", localReferenceId: input.orderNumber, issuedAt: input.issuedAt,
      ...(prefix ? { prefix: prefix.toUpperCase() } : {}),
      ...(alias ? { targetAlias: alias } : {}),
      recipientInfo: {
        taxId, name: cut > 0 ? fullName.slice(0, cut) : fullName, ...(cut > 0 ? { surname: fullName.slice(cut + 1) } : {}),
        city: c.city, address: c.address.slice(0, 255), ...(c.taxOffice ? { taxOffice: c.taxOffice } : {}), ...(c.email ? { email: c.email } : {}), countryCode: "TR",
      },
      invoiceInfo: { invoiceType: type === "e_fatura" ? "TEMELFATURA" : "EARSIVFATURA", invoiceTypeCode: "SATIS", invoiceUuid },
      ...buildAmounts(input.lines),
      orderInfo: { orderId: input.orderNumber, orderDate: input.issuedAt.slice(0, 10) },
    };
    let number: string | undefined;
    try {
      const { json } = await this.call("POST", type === "e_fatura" ? paths.eInvoice : paths.eArchive, body);
      number = (json as CreateInvoiceResponse | undefined)?.invoiceId;
    } catch (e) {
      // 409 also covers "this invoiceUuid is already used": a retry after a lost answer. Then the invoice exists, unless it failed.
      if ((e as EfaturamError).status !== 409) throw e;
      const st = await this.call("GET", (type === "e_fatura" ? paths.eInvoiceStatus : paths.eArchiveStatus)(invoiceUuid)).catch(() => undefined);
      if (!st?.json?.status || FAILED_STATUSES.includes(String(st.json.status))) throw e;
    }
    return { providerInvoiceId: invoiceUuid, number, type, pdfUrl: await this.pdfUrl(type, invoiceUuid, companyId) };
  }

  /** Only e-Arşiv can be cancelled through the gateway; an e-Fatura is reversed by the receiver's rejection or a return invoice. */
  async cancel(providerInvoiceId: string): Promise<{ ok: boolean }> {
    try { const { companyId } = await this.signIn(); await this.call("POST", paths.eArchiveCancel, { invoiceUuid: providerInvoiceId, companyId }); return { ok: true }; } catch { return { ok: false }; }
  }
}

export const factory: AdapterFactory<EfaturamAdapter> = {
  manifest,
  create(creds: IntegrationCredentials, deps: AdapterDeps) {
    return new EfaturamAdapter(configSchema.parse({ config: creds.config, secrets: creds.secrets }), deps);
  },
};

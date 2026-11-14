import type { EfaturamCallResult, EfaturamOperation } from "@openshelf/shared";
import { PROD_BASE_URL, buildEfaturamRequest } from "@openshelf/integration-efaturam";

/** FNV-1a: deterministic short ids so repeated mock calls look stable. */
const h = (s: string) => { let x = 0x811c9dc5; for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 0x01000193); } return (x >>> 0).toString(16).padStart(8, "0"); };
const uuidOf = (seed: string) => { const x = (h(seed) + h(seed + "a") + h(seed + "b") + h(seed + "c")); return `${x.slice(0, 8)}-${x.slice(8, 12)}-4${x.slice(13, 16)}-8${x.slice(17, 20)}-${x.slice(20, 32)}`; };

export const MOCK_IDS = { companyId: 1000001, userId: 2000001 };
const NOW = "2026-01-10T09:00:00Z";
const problem = (status: number, slug: string, title: string) => ({ status, body: { type: `https://api.trendyol.com/etransformation/gateway/${slug}`, title, status, detail: title } });

const created = (b: any, scenario: string, prefix: string) => {
  const uuid = b?.invoiceInfo?.invoiceUuid ?? uuidOf(JSON.stringify(b ?? {}));
  return {
    id: parseInt(h(uuid).slice(0, 6), 16), autoInvoiceId: true, currency: "TRY", localReferenceId: b?.localReferenceId ?? null, invoiceUuid: uuid, invoiceId: `${b?.prefix ?? prefix}2026${String(parseInt(h(uuid).slice(0, 5), 16) % 1e9).padStart(9, "0")}`,
    prefix: b?.prefix ?? prefix, year: 2026, userId: b?.userId, source: b?.source ?? "WEB", status: "30", taxExcludedPrice: b?.invoiceTotal?.taxExclusiveAmount ?? 0, taxAmount: b?.totalTax?.totalTaxAmount ?? 0, discountAmount: 0,
    payableAmount: b?.invoiceTotal?.payableAmount ?? 0, taxInclusiveAmount: b?.invoiceTotal?.taxInclusiveAmount ?? 0, recipientName: b?.recipientInfo?.name, recipientSurname: b?.recipientInfo?.surname, recipientTaxId: b?.recipientInfo?.taxId,
    scenario, invoiceTypeCode: b?.invoiceInfo?.invoiceTypeCode ?? "SATIS", issuedAt: b?.issuedAt ?? NOW, createdAt: NOW, lastUpdatedAt: NOW,
  };
};
const incoming = (n: number, status: string) => ({
  id: 5000 + n, invoiceUuid: uuidOf(`incoming-${n}`), invoiceId: `TED202600000000${n}`, scenario: n === 1 ? "TICARIFATURA" : "TEMELFATURA", invoiceTypeCode: "SATIS", status,
  senderTitle: n === 1 ? "Örnek Tedarik A.Ş." : "Deneme Lojistik Ltd. Şti.", senderTaxId: n === 1 ? "1234567890" : "9876543210", currency: "TRY",
  taxExcludedPrice: 100000 * n, taxAmount: 20000 * n, payableAmount: 120000 * n, issuedAt: `2026-01-0${n}T10:00:00Z`, createdAt: `2026-01-0${n}T10:05:00Z`,
});

/**
 * Offline stand-in for the e-Faturam gateway. Requests are validated exactly like live ones; nothing leaves the Worker.
 * A VKN starting with "1" is an e-Fatura user, every other tax number is not (404), so both branches can be tried.
 */
export function runEfaturamMock(op: EfaturamOperation, call: { path: Record<string, string | number>; query: Record<string, string | number | boolean>; body?: unknown }): EfaturamCallResult {
  const req = buildEfaturamRequest(op, call, PROD_BASE_URL, MOCK_IDS);
  const body = req.body !== undefined ? (JSON.parse(req.body) as any) : undefined;
  let status = 200; let data: unknown = null;
  const fail = (p: ReturnType<typeof problem>) => { status = p.status; data = p.body; };
  switch (op.id) {
    case "getTaxPayersByTaxId": {
      const taxId = String(call.path.taxId);
      if (taxId.startsWith("1") && taxId.length === 10) data = [{ taxId, alias: "urn:mail:defaultpk@example.invalid", title: "Örnek Ticaret A.Ş.", gibUserType: "OZEL", aliasType: "INVOICE", postBoxType: "PK", createdAt: NOW, aliasCreationTime: NOW }];
      else fail(problem(404, "tax-payer-not-found", "Tax payer not found."));
      break;
    }
    case "createEArchive": data = created(body, "EARSIVFATURA", "MCK"); break;
    case "createOutgoingEInvoice": data = { ...created(body, body?.invoiceInfo?.invoiceType ?? "TEMELFATURA", "MCF"), targetAlias: body?.targetAlias ?? "urn:mail:defaultpk@example.invalid", envelopeId: uuidOf("env" + JSON.stringify(body ?? {})) }; break;
    case "getEArchiveStatus": data = { status: "205", gibStatus: "REPORTED", invoiceUuid: String(call.path.invoiceUuid) }; break;
    case "getOutgoingEInvoiceStatus": data = { status: "205", gibStatusCode: 1300, invoiceUuid: String(call.path.invoiceUuid) }; break;
    case "cancelEArchive": case "reSendOutgoingEInvoice": case "replyIncomingEInvoice":
      if (!body?.invoiceUuid) fail(problem(422, "invalid-request", "invoiceUuid is required."));
      break;
    case "getReceivedReply": data = { uuid: uuidOf("rr" + call.path.invoiceUuid), envelopeId: uuidOf("re" + call.path.invoiceUuid), invoiceUuid: String(call.path.invoiceUuid), issuedAt: NOW, senderTaxId: "1234567890", note: "Kabul edildi", responseType: "APPROVED" }; break;
    case "getSentReply": data = { uuid: uuidOf("sr" + call.path.invoiceUuid), envelopeId: uuidOf("se" + call.path.invoiceUuid), invoiceUuid: String(call.path.invoiceUuid), issuedAt: NOW, receiverTaxId: "1234567890", note: "Kabul edildi", responseType: "APPROVED", gibStatus: 1300, replyStatus: 205 }; break;
    case "searchIncomingEInvoice": data = { content: [incoming(1, "50"), incoming(2, "205")], pageSize: body?.pagination?.size ?? 20, currentPage: body?.pagination?.page ?? 0, totalPageCount: 1, totalCount: 2 }; break;
    case "getTemporaryDocumentDownloadUrl": case "getPermanentDocumentDownloadUrl":
      if (!body?.invoiceUuid) fail(problem(422, "invalid-request", "invoiceUuid is required."));
      else data = `https://mock.invalid/efaturam/${body.invoiceUuid}.${body.fileExtension ?? "pdf"}`;
      break;
    default: data = null;
  }
  const ok = status < 400;
  return {
    ok, status, durationMs: 0, mock: true, operationId: op.id, risk: op.risk,
    request: { method: req.method, url: req.url, query: req.query, ...(body !== undefined ? { body } : {}) },
    response: { body: data },
    ...(ok ? {} : { error: { message: (data as { title: string }).title, code: (data as { type: string }).type.split("/").pop()! } }),
  };
}

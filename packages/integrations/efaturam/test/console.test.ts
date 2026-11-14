import { describe, expect, it } from "vitest";
import { EFATURAM_GROUPS } from "@openshelf/shared";
import { EFATURAM_OPERATIONS, EfaturamConsoleError, buildEfaturamRequest, factory, EfaturamAdapter } from "../src/index";

const PROD = "https://apigateway.trendyolecozum.com";
const op = (id: string) => EFATURAM_OPERATIONS.find((o) => o.id === id)!;
const ids = { companyId: 77, userId: 5 };
const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const TOKEN = `${b64({ alg: "none" })}.${b64({ ...ids, exp: 4102444800 })}.sig`;
const UUID = "96a8b0f1-7e10-4a44-8d78-eb961539bb4b";

type Seen = { url: string; method: string; headers: Record<string, string>; body: any };
function mk(answer: (s: Seen, n: number) => Response, signIn: () => Response = () => new Response("5", { status: 200, headers: { "x-access-token": TOKEN } })) {
  const seen: Seen[] = []; let signIns = 0;
  const adapter = factory.create({ config: {}, secrets: { username: "shop@example.com", password: "SECRET-PW" } }, {
    now: () => new Date("2026-01-01T00:00:00Z"),
    fetch: async (u: string, i: any = {}) => {
      if (u.endsWith("/api/auth/signin")) { signIns++; return signIn(); }
      const s = { url: u, method: i.method ?? "GET", headers: i.headers ?? {}, body: i.body ? JSON.parse(i.body) : undefined };
      seen.push(s); return answer(s, seen.length);
    },
  }) as EfaturamAdapter;
  return { adapter, seen, signIns: () => signIns };
}

describe("efaturam console catalog", () => {
  it("is well formed", () => {
    expect(new Set(EFATURAM_OPERATIONS.map((o) => o.id)).size).toBe(EFATURAM_OPERATIONS.length);
    for (const o of EFATURAM_OPERATIONS) {
      expect(EFATURAM_GROUPS).toContain(o.group);
      expect(o.path.startsWith("/api/")).toBe(true);
      const placeholders = [...o.path.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]);
      expect(o.params.filter((p) => p.in === "path").map((p) => p.name).sort()).toEqual([...placeholders].sort());
      if (o.method === "GET") expect(o.body.kind).toBe("none");
      if (o.body.kind === "json") expect(o.body.example).toBeTypeOf("object");
      expect(o.title.tr && o.title.en && o.summary.tr && o.summary.en).toBeTruthy();
    }
    // every call that creates or destroys a document needs a confirmation on the live gateway
    expect(EFATURAM_OPERATIONS.filter((o) => o.billed).every((o) => o.risk === "write")).toBe(true);
    expect(op("cancelEArchive").risk).toBe("destructive");
    expect(op("searchIncomingEInvoice").risk).toBe("read");
  });
});

describe("efaturam console request building", () => {
  it("fills path, query and the signed-in account's ids", () => {
    expect(buildEfaturamRequest(op("getTaxPayersByTaxId"), { path: { taxId: " 1234567890 " }, query: { showDeleted: true } }, PROD + "/").url).toBe(`${PROD}/api/invoice/taxpayers/1234567890?showDeleted=true`);
    const cancel = buildEfaturamRequest(op("cancelEArchive"), { path: {}, query: {}, body: { invoiceUuid: UUID } }, PROD, ids);
    expect(JSON.parse(cancel.body!)).toEqual({ invoiceUuid: UUID, companyId: 77 });
    expect(JSON.parse(buildEfaturamRequest(op("createEArchive"), { path: {}, query: {}, body: { companyId: 9 } }, PROD, ids).body!)).toEqual({ companyId: 9, userId: 5 });
    expect(buildEfaturamRequest(op("getSentReply"), { path: { invoiceUuid: UUID }, query: {} }, PROD, ids).url).toBe(`${PROD}/api/invoice/documents/sent-reply/77/${UUID}`);
    expect(buildEfaturamRequest(op("getSentReply"), { path: { invoiceUuid: UUID, companyId: 12 }, query: {} }, PROD, ids).url).toContain("/sent-reply/12/");
    expect(JSON.parse(buildEfaturamRequest(op("searchIncomingEInvoice"), { path: {}, query: {}, body: '{"startDate":"2026-01-01"}' }, PROD, ids).body!)).toEqual({ startDate: "2026-01-01", companyId: 77 });
  });
  it("rejects what is not part of the operation", () => {
    const bad = (f: () => unknown) => expect(f).toThrow(EfaturamConsoleError);
    bad(() => buildEfaturamRequest(op("getTaxPayersByTaxId"), { path: {}, query: {} }, PROD));
    bad(() => buildEfaturamRequest(op("getTaxPayersByTaxId"), { path: { taxId: "1" }, query: { evil: "x" } }, PROD));
    bad(() => buildEfaturamRequest(op("cancelEArchive"), { path: {}, query: {}, body: "{not json" }, PROD));
    bad(() => buildEfaturamRequest(op("cancelEArchive"), { path: {}, query: {}, body: [1] }, PROD));
    bad(() => buildEfaturamRequest(op("cancelEArchive"), { path: {}, query: {}, body: { x: "a".repeat(1024 * 1024 + 1) } }, PROD));
    expect(buildEfaturamRequest(op("getTaxPayersByTaxId"), { path: { taxId: "../../admin" }, query: {} }, PROD).url).toBe(`${PROD}/api/invoice/taxpayers/..%2F..%2Fadmin`);
  });
});

describe("efaturam adapter consoleCall", () => {
  it("sends the token header and never returns it", async () => {
    const { adapter, seen } = mk(() => new Response(JSON.stringify([{ alias: "urn:mail:pk@x", aliasType: "INVOICE" }]), { status: 200 }));
    const r = await adapter.consoleCall(op("getTaxPayersByTaxId"), { path: { taxId: "1234567890" }, query: {} });
    expect(r).toMatchObject({ ok: true, status: 200, mock: false, operationId: "getTaxPayersByTaxId", risk: "read" });
    expect(seen[0]!.headers["x-access-token"]).toBe(TOKEN);
    expect(JSON.stringify(r)).not.toContain(TOKEN); expect(JSON.stringify(r)).not.toContain("SECRET-PW");
  });
  it("keeps a plain-text answer (download link) and maps gateway problems", async () => {
    const link = await mk(() => new Response("https://files.example/a.pdf", { status: 200 })).adapter.consoleCall(op("getPermanentDocumentDownloadUrl"), { path: {}, query: {}, body: { documentType: "EARCHIVE", fileExtension: "pdf", invoiceUuid: UUID } });
    expect(link.response.body).toBe("https://files.example/a.pdf");
    expect(link.request.body).toMatchObject({ companyId: 77 });
    const nf = await mk(() => new Response(JSON.stringify({ type: "https://api.trendyol.com/etransformation/gateway/tax-payer-not-found", title: "Tax payer not found." }), { status: 404 })).adapter.consoleCall(op("getTaxPayersByTaxId"), { path: { taxId: "2" }, query: {} });
    expect(nf).toMatchObject({ ok: false, status: 404, error: { message: "Tax payer not found.", code: "tax-payer-not-found" } });
    const blocked = await mk(() => new Response("<html>Attention Required!</html>", { status: 403 })).adapter.consoleCall(op("getTaxPayersByTaxId"), { path: { taxId: "2" }, query: {} });
    expect(blocked).toMatchObject({ ok: false, status: 403, response: { body: null }, error: { code: "blocked" } });
  });
  it("re-signs in once on 401, and reports a failed sign-in without calling the operation", async () => {
    const a = mk((_s, n) => (n === 1 ? new Response("{}", { status: 401 }) : new Response("null", { status: 200 })));
    expect((await a.adapter.consoleCall(op("cancelEArchive"), { path: {}, query: {}, body: { invoiceUuid: UUID } })).ok).toBe(true);
    expect(a.signIns()).toBe(2); expect(a.seen).toHaveLength(2);
    const b = mk(() => new Response("{}"), () => new Response(JSON.stringify({ title: "Username or Password is wrong." }), { status: 401 }));
    const r = await b.adapter.consoleCall(op("cancelEArchive"), { path: {}, query: {}, body: { invoiceUuid: UUID } });
    expect(r).toMatchObject({ ok: false, status: 401, error: { code: "sign_in_failed" } }); expect(b.seen).toHaveLength(0);
    await expect(b.adapter.consoleCall(op("getTaxPayersByTaxId"), { path: {}, query: {} })).rejects.toThrow(EfaturamConsoleError);
  });
});

describe("efaturam adapter diagnose", () => {
  const steps = (d: Awaited<ReturnType<EfaturamAdapter["diagnose"]>>) => d.steps.map((x) => `${x.id}:${x.ok ? "ok" : x.code ?? x.status}`);
  it("all steps pass; found and not-found both prove the token works; no secret is returned", async () => {
    for (const status of [200, 404]) {
      const { adapter, seen } = mk(() => new Response(status === 200 ? "[]" : JSON.stringify({ title: "Tax payer not found." }), { status }));
      const d = await adapter.diagnose();
      expect(d).toMatchObject({ ok: true, mock: false, environment: "live", companyId: 77, userId: 5, claims: ["companyId", "exp", "userId"], expiresAt: "2100-01-01T00:00:00.000Z" });
      expect(steps(d)).toEqual(["signIn:ok", "token:ok", "account:ok", "apiCall:ok"]);
      expect(seen[0]!.url).toContain("/api/invoice/taxpayers/"); expect(seen[0]!.headers["x-access-token"]).toBe(TOKEN);
      expect(JSON.stringify(d)).not.toContain(TOKEN); expect(JSON.stringify(d)).not.toContain("SECRET-PW");
    }
  });
  it("names the step that fails", async () => {
    const wrong = await mk(() => new Response("[]"), () => new Response(JSON.stringify({ type: "https://api.trendyol.com/etransformation/gateway/username-or-password-wrong", title: "Username or Password is wrong." }), { status: 401 })).adapter.diagnose();
    expect(wrong.ok).toBe(false); expect(wrong.steps).toEqual([{ id: "signIn", ok: false, status: 401, code: "username-or-password-wrong", detail: "Username or Password is wrong." }]);
    const blocked = await mk(() => new Response("[]"), () => new Response("<html>Attention Required!</html>", { status: 403 })).adapter.diagnose();
    expect(steps(blocked)).toEqual(["signIn:blocked"]);
    const noHeader = await mk(() => new Response("[]"), () => new Response("5", { status: 200 })).adapter.diagnose();
    expect(steps(noHeader)).toEqual(["signIn:ok", "token:missing"]);
    // signed in fine, but the gateway refuses the token on a real call: the case the health check cannot see
    const refused = await mk(() => new Response(JSON.stringify({ type: "https://api.trendyol.com/etransformation/gateway/unauthorized", title: "Unauthorized." }), { status: 401 })).adapter.diagnose();
    expect(steps(refused)).toEqual(["signIn:ok", "token:ok", "account:ok", "apiCall:unauthorized"]);
    expect(refused).toMatchObject({ ok: false, companyId: 77 });
    const bare = `${b64({ alg: "none" })}.${b64({ exp: 4102444800 })}.sig`;
    const noIds = await mk(() => new Response("[]"), () => new Response("5", { status: 200, headers: { "x-access-token": bare } })).adapter.diagnose();
    expect(steps(noIds)).toEqual(["signIn:ok", "token:ok", "account:ids_missing", "apiCall:ok"]);
  });
  it("a repeated token header is reduced to one token", async () => {
    const { adapter, seen } = mk(() => new Response("[]"), () => new Response("5", { status: 200, headers: { "x-access-token": `${TOKEN}, ${TOKEN}` } }));
    const d = await adapter.diagnose();
    expect(d.ok).toBe(true); expect(d.steps[1]!.detail).toContain("header repeated");
    expect(seen[0]!.headers["x-access-token"]).toBe(TOKEN);
    await adapter.consoleCall(op("getTaxPayersByTaxId"), { path: { taxId: "1" }, query: {} });
    expect(seen[1]!.headers["x-access-token"]).toBe(TOKEN);
  });
});

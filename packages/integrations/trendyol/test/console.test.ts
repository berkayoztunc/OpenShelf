import { describe, it, expect, vi } from "vitest";
import type { TrendyolOperation } from "@openshelf/shared";
import { buildRequest, execute, mapError, runCall, ConsoleError, MAX_BODY_BYTES } from "../src/console";

const creds = { sellerId: "12345", apiKey: "KEYKEY-secret", apiSecret: "SECRETSECRET" };
const t = (s: string) => ({ tr: s, en: s });
const base = { group: "orders", area: "returns", title: t("x"), summary: t("x"), docsUrl: "https://developers.trendyol.com/v2.0/reference/x", risk: "read" } as const;
const getOp: TrendyolOperation = {
  ...base, id: "getThing", method: "GET", path: "/integration/order/sellers/{sellerId}/things/{thingId}",
  params: [
    { name: "thingId", in: "path", type: "string", required: true, description: t("") },
    { name: "status", in: "query", type: "array", description: t(""), enum: ["A", "B"] },
    { name: "ids", in: "query", type: "array", arrayStyle: "repeat", description: t("") },
    { name: "size", in: "query", type: "integer", default: 50, description: t("") },
    { name: "must", in: "query", type: "string", required: true, description: t("") },
  ],
  body: { kind: "none" },
};
const jsonOp: TrendyolOperation = { ...base, id: "postThing", method: "POST", risk: "write", path: "/integration/x/sellers/{sellerId}/things", params: [], body: { kind: "json" } };
const mpOp: TrendyolOperation = { ...base, id: "upload", method: "POST", risk: "write", path: "/integration/x/sellers/{sellerId}/files", params: [], body: { kind: "multipart", file: { field: "file", accept: ["application/pdf"] } } };
const stageOnly: TrendyolOperation = { ...getOp, id: "stageOnly", envs: ["stage"] };

const details = (fn: () => unknown) => { try { fn(); } catch (e) { return (e as ConsoleError).details; } return []; };

describe("buildRequest", () => {
  it("builds URL, auth, user-agent; arrays comma/repeat; defaults", () => {
    const r = buildRequest(getOp, creds, "production", { path: { thingId: "a b".replace(" ", "-") }, query: { status: ["A", "B"], ids: [1, 2], must: "x" } });
    expect(r.url).toBe("https://apigw.trendyol.com/integration/order/sellers/12345/things/a-b?status=A,B&ids=1&ids=2&size=50&must=x");
    expect(r.headers.Authorization).toBe(`Basic ${btoa("KEYKEY-secret:SECRETSECRET")}`);
    expect(r.headers["User-Agent"]).toBe("12345 - SelfIntegration");
    expect(r.echo.url).toBe(r.url);
    expect(JSON.stringify(r.echo)).not.toContain("SECRETSECRET");
  });
  it("uses the stage host and enforces availability", () => {
    expect(buildRequest(getOp, creds, "stage", { path: { thingId: "1" }, query: { must: "1" } }).url.startsWith("https://stageapigw.trendyol.com/")).toBe(true);
    expect(() => buildRequest(stageOnly, creds, "production", { path: {}, query: {} })).toThrow(/not available/);
  });
  it("validates path/query params", () => {
    expect(details(() => buildRequest(getOp, creds, "production", { path: {}, query: {} })).map((d) => d.field).sort()).toEqual(["path.thingId", "query.must"]);
    expect(details(() => buildRequest(getOp, creds, "production", { path: { thingId: "../admin" }, query: { must: "1" } })).map((d) => d.field)).toEqual(["path.thingId"]);
    expect(details(() => buildRequest(getOp, creds, "production", { path: { thingId: ".." }, query: { must: "1" } }))).toHaveLength(1);
    expect(details(() => buildRequest(getOp, creds, "production", { path: { thingId: "1" }, query: { must: "1", status: ["C"] } })).map((d) => d.field)).toEqual(["query.status"]);
    expect(details(() => buildRequest(getOp, creds, "production", { path: { thingId: "1" }, query: { must: "1", size: "abc" } })).map((d) => d.field)).toEqual(["query.size"]);
  });
  it("cannot be redirected to another host", () => {
    const evil = { ...getOp, path: "//evil.com/x" };
    expect(() => buildRequest(evil, creds, "production", { path: { thingId: "1" }, query: { must: "1" } })).toThrow();
    expect(() => buildRequest({ ...getOp, path: "/a@evil.com" }, creds, "production", { path: { thingId: "1" }, query: { must: "1" } })).not.toThrow(); // still on apigw: origin asserted
    const r = buildRequest({ ...getOp, path: "/a@evil.com" }, creds, "production", { path: { thingId: "1" }, query: { must: "1" } });
    expect(new URL(r.url).hostname).toBe("apigw.trendyol.com");
  });
  it("json body: required, parsed from string, size-limited", () => {
    expect(details(() => buildRequest(jsonOp, creds, "production", { path: {}, query: {} })).map((d) => d.field)).toEqual(["body"]);
    expect(details(() => buildRequest(jsonOp, creds, "production", { path: {}, query: {}, body: "{nope" }))[0]!.message).toMatch(/JSON/);
    const ok = buildRequest(jsonOp, creds, "production", { path: {}, query: {}, body: '{"a":1}' });
    expect(ok.body).toBe('{"a":1}'); expect(ok.headers["Content-Type"]).toBe("application/json");
    expect(() => buildRequest(jsonOp, creds, "production", { path: {}, query: {}, body: { x: "a".repeat(MAX_BODY_BYTES) } })).toThrow(expect.objectContaining({ code: "body_too_large" }));
  });
  it("multipart upload", () => {
    const b64 = btoa("%PDF-1.4 hi");
    const r = buildRequest(mpOp, creds, "production", { path: {}, query: {}, body: { file: { name: "inv oice.pdf", type: "application/pdf", base64: b64 }, shipmentPackageId: 5 } });
    expect(r.body).toBeInstanceOf(FormData);
    const form = r.body as FormData;
    expect((form.get("file") as File).name).toBe("inv_oice.pdf");
    expect(form.get("shipmentPackageId")).toBe("5");
    expect(r.headers["Content-Type"]).toBeUndefined();
    expect(JSON.stringify(r.echo)).not.toContain(b64);
    expect(details(() => buildRequest(mpOp, creds, "production", { path: {}, query: {}, body: { file: { name: "a.exe", type: "application/x-msdownload", base64: b64 } } }))[0]!.field).toBe("body.file.type");
  });
});

describe("execute / mapError / runCall", () => {
  const op = { ...getOp, params: [] as TrendyolOperation["params"], path: "/integration/x/{sellerId}" };
  it("truncates large responses, filters headers, parses JSON", async () => {
    const big = "a".repeat(3 * 1024 * 1024);
    const f = vi.fn(async () => new Response(big, { status: 200, headers: { "content-type": "text/plain", "set-cookie": "s=1", "x-ratelimit-remaining": "9" } }));
    const r = await runCall({ fetch: f }, creds, "production", op, { path: {}, query: {} });
    expect(r.response.truncated).toBe(true);
    expect((r.response.body as string).length).toBe(2 * 1024 * 1024);
    expect(r.response.headers).toEqual({ "content-type": "text/plain", "x-ratelimit-remaining": "9" });
    const j = await runCall({ fetch: async () => new Response('{"a":[1]}', { headers: { "content-type": "application/json" } }) }, creds, "production", op, { path: {}, query: {} });
    expect(j.response.body).toEqual({ a: [1] }); expect(j.ok).toBe(true); expect(j.error).toBeUndefined();
  });
  it("maps Trendyol errors", () => {
    expect(mapError({ status: 401, headers: {}, body: { exception: "ClientApiAuthenticationException", message: "bad" } }, "production")).toMatchObject({ code: "ClientApiAuthenticationException", hint: "check apiKey/apiSecret and environment (prod and stage credentials differ)" });
    expect(mapError({ status: 403, headers: {}, body: "" }, "production")?.hint).toBe("User-Agent missing or IP blocked");
    expect(mapError({ status: 503, headers: {}, body: "" }, "stage")?.hint).toBe("stage IP not whitelisted by Trendyol");
    expect(mapError({ status: 503, headers: {}, body: "" }, "production")?.hint).not.toMatch(/whitelisted/);
    const e429 = mapError({ status: 429, headers: { "retry-after": "7" }, body: { message: "x" } }, "production");
    expect(e429?.code).toBe("too.many.requests"); expect(e429?.hint).toMatch(/7 s/);
    expect(mapError({ status: 400, headers: {}, body: { errors: [{ key: "items[0].barcode", message: "required", errorCode: "E1" }] } }, "production")?.message).toBe("items[0].barcode required (E1)");
    expect(mapError({ status: 200, headers: {}, body: {} }, "production")).toBeUndefined();
  });
  it("times out and reports network errors without throwing; no credentials in result", async () => {
    const hang = (_u: string, init?: RequestInit) => new Promise<Response>((_res, rej) => init?.signal?.addEventListener("abort", () => rej(new DOMException("aborted", "AbortError"))));
    const req = buildRequest(op, creds, "production", { path: {}, query: {} });
    const r = await execute(hang, req, { timeoutMs: 20 });
    expect(r.networkError).toBe("timeout");
    const res = await runCall({ fetch: async () => { throw new Error(`boom ${creds.apiSecret}`); } }, creds, "production", op, { path: {}, query: {} });
    expect(res.status).toBe(0); expect(res.error?.code).toBe("network_error");
    expect(JSON.stringify(res)).not.toMatch(/SECRETSECRET|KEYKEY|Basic /);
  });
});

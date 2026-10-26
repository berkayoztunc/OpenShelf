import { env } from "cloudflare:test";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { MockHandler, TrendyolOperation } from "@openshelf/shared";
import { __setTrendyolCatalog } from "../src/routes/admin-trendyol";
import { clearSettingsCache } from "../src/lib/settings";
import { hit } from "../src/middleware/security";
import { admin, call, createProduct, ensureOwner, freshIp, j, loginAs, type Session } from "./helpers";

const t = (s: string) => ({ tr: s, en: s });
const base = { group: "orders", area: "orders", title: t("x"), summary: t("x"), docsUrl: "https://developers.trendyol.com/v2.0/reference/x" } as const;
const READ: TrendyolOperation = { ...base, id: "tReadThing", method: "GET", risk: "read", path: "/integration/order/sellers/{sellerId}/things", params: [{ name: "size", in: "query", type: "integer", default: 10, description: t("") }], body: { kind: "none" } };
const WRITE: TrendyolOperation = { ...base, id: "tWriteThing", method: "POST", risk: "write", path: "/integration/order/sellers/{sellerId}/things", params: [], body: { kind: "json" } };
const STAGE: TrendyolOperation = { ...READ, id: "tStageOnly", envs: ["stage"] };
const mocks: Record<string, MockHandler> = {
  tReadThing: async (_r, st) => ({ status: 200, body: { items: [{ id: await st.nextId("thing") }] } }),
  tWriteThing: async (r, st) => { await st.set("ty:thing:last", r.body); return { status: 201, body: { ok: true } }; },
};

let owner: Session; let staff: Session;
const setMock = (on: boolean) => env.DB.prepare(`INSERT INTO store_settings ("group", value, updated_at) VALUES ('system', ?1, unixepoch()) ON CONFLICT("group") DO UPDATE SET value = ?1`).bind(JSON.stringify({ mockMode: on })).run().then(() => clearSettingsCache());
const callOp = (s: Session, json: unknown) => admin(s, "/trendyol/call", "POST", json);
const enableLive = async (enabled = true) => {
  await env.DB.exec("DELETE FROM integration_configs WHERE provider = 'trendyol'");
  const { encryptJson } = await import("../src/lib/crypto");
  const e = await encryptJson(env as never, { apiKey: "KEY-live-1234", apiSecret: "SECRET-live-5678" }, "integration:trendyol");
  await env.DB.prepare("INSERT INTO integration_configs (provider, enabled, config_public, secrets_enc, secrets_iv, key_version, updated_at) VALUES ('trendyol', ?1, ?2, ?3, ?4, 1, unixepoch())")
    .bind(enabled ? 1 : 0, JSON.stringify({ supplierId: "99887", environment: "production" }), e.ciphertext, e.iv).run();
};

beforeAll(async () => {
  owner = await ensureOwner();
  const email = `staff-ty-${Date.now()}@example.com`;
  const r = await admin(owner, "/users", "POST", { email, name: "S", password: "staff password 12345", role: "staff" });
  expect(r.status).toBe(201);
  staff = await loginAs(email, "staff password 12345");
  __setTrendyolCatalog({ ops: [READ, WRITE, STAGE], mocks });
});
afterEach(() => { vi.restoreAllMocks(); });
afterAll(async () => { __setTrendyolCatalog(null); await setMock(false); await env.DB.exec("DELETE FROM integration_configs WHERE provider = 'trendyol'"); });

describe("catalog modes", () => {
  it("disabled -> mock -> live", async () => {
    await setMock(false); await env.DB.exec("DELETE FROM integration_configs WHERE provider = 'trendyol'");
    let c = await j<any>(await admin(owner, "/trendyol/catalog"));
    expect(c).toMatchObject({ mode: "disabled", reason: "not_configured", env: "production" });
    expect(c.operations.map((o: any) => o.id)).toEqual(["tReadThing", "tWriteThing"]); // stage-only filtered
    await enableLive(false);
    expect((await j<any>(await admin(owner, "/trendyol/catalog"))).reason).toBe("integration_disabled");
    await enableLive(true);
    c = await j<any>(await admin(owner, "/trendyol/catalog"));
    expect(c).toMatchObject({ mode: "live", sellerId: "99887" });
    expect(c.limits.maxBodyBytes).toBe(2 * 1024 * 1024);
    await setMock(true);
    expect((await j<any>(await admin(owner, "/trendyol/catalog"))).mode).toBe("mock");
  });
});

describe("roles", () => {
  it("staff gets 403, unauthenticated 401", async () => {
    expect((await admin(staff, "/trendyol/catalog")).status).toBe(403);
    expect((await callOp(staff, { operationId: "tReadThing" })).status).toBe(403);
    expect((await call("/api/admin/trendyol/catalog")).status).toBe(401);
  });
});

describe("mock path", () => {
  it("never touches fetch, is stateful, recorded in history + audit", async () => {
    await setMock(true);
    await admin(owner, "/trendyol/mock/reset", "POST");
    const spy = vi.spyOn(globalThis, "fetch");
    const a = await j<any>(await callOp(owner, { operationId: "tReadThing" }));
    const b = await j<any>(await callOp(owner, { operationId: "tReadThing" }));
    expect(a).toMatchObject({ ok: true, mock: true, status: 200, risk: "read" });
    expect(a.response.body.items[0].id).toBe(1); expect(b.response.body.items[0].id).toBe(2);
    expect(a.request.url).toBe("https://apigw.trendyol.com/integration/order/sellers/99887/things?size=10");
    // writes need no confirm in mock mode
    const w = await callOp(owner, { operationId: "tWriteThing", body: { a: 1 } });
    expect(w.status).toBe(200); expect((await j<any>(w)).status).toBe(201);
    expect(spy).not.toHaveBeenCalled();
    const h = await j<any>(await admin(owner, "/trendyol/history?operationId=tReadThing"));
    expect(h.total).toBeGreaterThanOrEqual(2);
    expect(h.items[0]).toMatchObject({ operationId: "tReadThing", mock: true, status: 200 });
    expect(JSON.stringify(h)).not.toMatch(/Basic|apiSecret/);
    const au = await env.DB.prepare("SELECT meta FROM audit_logs WHERE action = 'trendyol.call' ORDER BY id DESC LIMIT 1").first<{ meta: string }>();
    expect(JSON.parse(au!.meta)).toMatchObject({ operationId: "tWriteThing", mock: true, status: 201 });
  });
  it("validation + unknown op", async () => {
    await setMock(true);
    expect((await callOp(owner, { operationId: "nope" })).status).toBe(404);
    const r = await callOp(owner, { operationId: "tWriteThing" });
    expect(r.status).toBe(400); expect((await j<any>(r)).error.code).toBe("invalid_params");
    expect((await callOp(owner, { operationId: "tReadThing", env: "stage" })).status).toBe(200);
    expect((await callOp(owner, { operationId: "tStageOnly" })).status).toBe(400); // production only configured
    expect((await callOp(owner, { operationId: "tStageOnly", env: "stage" })).status).toBe(200);
  });
  it("mock reset: owner only, mock mode only", async () => {
    await setMock(true);
    expect((await admin(staff, "/trendyol/mock/reset", "POST")).status).toBe(403);
    expect((await admin(owner, "/trendyol/mock/reset", "POST")).status).toBe(200);
    const after = await j<any>(await callOp(owner, { operationId: "tReadThing" }));
    expect(after.response.body.items[0].id).toBe(1);
    await setMock(false);
    expect((await admin(owner, "/trendyol/mock/reset", "POST")).status).toBe(409);
  });
});

describe("live path", () => {
  it("requires confirm for writes, sends auth + UA, never leaks credentials", async () => {
    await setMock(false); await enableLive(true);
    const spy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify({ ok: 1 }), { status: 200, headers: { "content-type": "application/json" } }));
    const denied = await callOp(owner, { operationId: "tWriteThing", body: { a: 1 } });
    expect(denied.status).toBe(409); expect((await j<any>(denied)).error.code).toBe("confirm_required");
    expect(spy).not.toHaveBeenCalled();
    const ok = await j<any>(await callOp(owner, { operationId: "tWriteThing", body: { a: 1 }, confirm: "tWriteThing" }));
    expect(ok).toMatchObject({ ok: true, mock: false, status: 200 });
    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://apigw.trendyol.com/integration/order/sellers/99887/things");
    const h = init.headers as Record<string, string>;
    expect(h.Authorization).toBe(`Basic ${btoa("KEY-live-1234:SECRET-live-5678")}`);
    expect(h["User-Agent"]).toBe("99887 - SelfIntegration");
    expect(JSON.stringify(ok)).not.toMatch(/KEY-live|SECRET-live|Basic /);
    const read = await callOp(owner, { operationId: "tReadThing" }); // read: no confirm
    expect(read.status).toBe(200);
    const hist = JSON.stringify(await j<any>(await admin(owner, "/trendyol/history")));
    expect(hist).not.toMatch(/KEY-live|SECRET-live/);
  });
  it("maps Trendyol 401 and reports disabled as 409", async () => {
    await setMock(false); await enableLive(true);
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify({ exception: "ClientApiAuthenticationException", message: "bad" }), { status: 401 }));
    const r = await j<any>(await callOp(owner, { operationId: "tReadThing" }));
    expect(r).toMatchObject({ ok: false, status: 401, error: { code: "ClientApiAuthenticationException" } });
    await enableLive(false);
    expect((await callOp(owner, { operationId: "tReadThing" })).status).toBe(409);
  });
  it("per-operation 50/10s limit returns 429 before calling out", async () => {
    await setMock(false); await enableLive(true);
    const spy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response("{}", { status: 200 }));
    for (let i = 0; i < 50; i++) await hit(env.DB, "ty:op:tReadThing", 10);
    const r = await callOp(owner, { operationId: "tReadThing" });
    expect(r.status).toBe(429); expect(r.headers.get("Retry-After")).toBeTruthy();
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("admin rate limit + history clear", () => {
  it("429 after 120 calls/min per admin; delete history owner only", async () => {
    await setMock(true);
    const me = await j<any>(await admin(owner, "/auth/me")).catch(() => null);
    void me;
    // exhaust the window directly for this admin
    const row = await env.DB.prepare("SELECT id FROM admins WHERE email = 'owner@example.com'").first<{ id: string }>();
    for (let i = 0; i < 125; i++) await hit(env.DB, `ty:admin:${row!.id}`, 60);
    const r = await callOp(owner, { operationId: "tReadThing" });
    expect(r.status).toBe(429); expect((await j<any>(r)).error.code).toBe("rate_limited");
    await env.DB.prepare("DELETE FROM rate_limits WHERE key LIKE 'ty:%'").run();
    expect((await admin(staff, "/trendyol/history", "DELETE")).status).toBe(403);
    expect((await admin(owner, "/trendyol/history", "DELETE")).status).toBe(204);
    expect((await j<any>(await admin(owner, "/trendyol/history"))).total).toBe(0);
  });
});

describe("mappings", () => {
  it("upserts mapping + channel listing, validates, lists and deletes", async () => {
    const { variantId } = await createProduct(owner);
    expect((await admin(owner, "/trendyol/mappings", "POST", { variantId, barcode: "bad barcode!" })).status).toBe(400);
    expect((await admin(owner, "/trendyol/mappings", "POST", { variantId: "missing", barcode: "BC-1" })).status).toBe(404);
    const r = await admin(owner, "/trendyol/mappings", "POST", { variantId, barcode: "868000.1-A", externalId: "ext1" });
    expect(r.status).toBe(200);
    await admin(owner, "/trendyol/mappings", "POST", { variantId, barcode: "868000.1-B", listingEnabled: false });
    const l = await env.DB.prepare("SELECT enabled FROM channel_listings WHERE variant_id = ?1 AND channel = 'trendyol'").bind(variantId).first<{ enabled: number }>();
    expect(l!.enabled).toBe(0);
    const list = await j<any>(await admin(owner, "/trendyol/mappings"));
    expect(list.items.find((i: any) => i.variantId === variantId)).toMatchObject({ barcode: "868000.1-B" });
    const other = await createProduct(owner);
    expect((await admin(owner, "/trendyol/mappings", "POST", { variantId: other.variantId, barcode: "868000.1-B" })).status).toBe(409);
    const au = await env.DB.prepare("SELECT 1 FROM audit_logs WHERE action = 'trendyol.mapping.upsert' AND entity_id = ?1").bind(variantId).first();
    expect(au).toBeTruthy();
    expect((await admin(owner, `/trendyol/mappings?variantId=${variantId}`, "DELETE")).status).toBe(204);
    expect((await j<any>(await admin(owner, "/trendyol/mappings"))).items.some((i: any) => i.variantId === variantId)).toBe(false);
  });
});

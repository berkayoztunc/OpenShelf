import { env } from "cloudflare:test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { clearSettingsCache } from "../src/lib/settings";
import { admin, ensureOwner, j, loginAs, type Session } from "./helpers";

let owner: Session; let staff: Session;
const setMock = (on: boolean) => env.DB.prepare(`INSERT INTO store_settings ("group", value, updated_at) VALUES ('system', ?1, unixepoch()) ON CONFLICT("group") DO UPDATE SET value = ?1`).bind(JSON.stringify({ mockMode: on })).run().then(() => clearSettingsCache());
const call = (s: Session, json: unknown) => admin(s, "/geliver/call", "POST", json);
const configure = async (enabled: boolean) => {
  await env.DB.exec("DELETE FROM integration_configs WHERE provider = 'geliver'");
  const { encryptJson } = await import("../src/lib/crypto");
  const e = await encryptJson(env as never, { apiToken: "GELIVER-TOKEN-1234" }, "integration:geliver");
  await env.DB.prepare("INSERT INTO integration_configs (provider, enabled, config_public, secrets_enc, secrets_iv, key_version, updated_at) VALUES ('geliver', ?1, ?2, ?3, ?4, 1, unixepoch())")
    .bind(enabled ? 1 : 0, JSON.stringify({ test: true, senderAddressId: "SENDER-1" }), e.ciphertext, e.iv).run();
};

beforeAll(async () => {
  owner = await ensureOwner();
  const email = `staff-gl-${Date.now()}@example.com`;
  expect((await admin(owner, "/users", "POST", { email, name: "S", password: "staff password 12345", role: "staff" })).status).toBe(201);
  staff = await loginAs(email, "staff password 12345");
});
afterAll(async () => { await setMock(false); await env.DB.exec("DELETE FROM integration_configs WHERE provider = 'geliver'"); });

describe("geliver console", () => {
  it("staff gets 403", async () => {
    expect((await admin(staff, "/geliver/catalog")).status).toBe(403);
    expect((await call(staff, { operationId: "priceList" })).status).toBe(403);
  });

  it("catalog modes: disabled -> disabled(off) -> live -> mock", async () => {
    await setMock(false); await env.DB.exec("DELETE FROM integration_configs WHERE provider = 'geliver'");
    let c = await j<any>(await admin(owner, "/geliver/catalog"));
    expect(c).toMatchObject({ mode: "disabled", reason: "not_configured", test: true });
    expect(c.operations.length).toBeGreaterThan(10);
    await configure(false);
    expect((await j<any>(await admin(owner, "/geliver/catalog"))).reason).toBe("integration_disabled");
    await configure(true);
    c = await j<any>(await admin(owner, "/geliver/catalog"));
    expect(c).toMatchObject({ mode: "live", senderAddressId: "SENDER-1" });
    expect(JSON.stringify(c)).not.toContain("GELIVER-TOKEN-1234");
    await setMock(true);
    expect((await j<any>(await admin(owner, "/geliver/catalog"))).mode).toBe("mock");
  });

  it("disabled integration refuses calls", async () => {
    await setMock(false); await env.DB.exec("DELETE FROM integration_configs WHERE provider = 'geliver'");
    const r = await call(owner, { operationId: "priceList", query: { length: 1, width: 1, height: 1, weight: 1 } });
    expect(r.status).toBe(409);
  });

  it("live write/destructive calls need confirm before anything is sent", async () => {
    await setMock(false); await configure(true);
    const r = await call(owner, { operationId: "acceptOffer", body: { offerID: "X" } });
    expect(r.status).toBe(409);
    expect((await j<any>(r)).error).toMatchObject({ code: "confirm_required", details: { confirm: "acceptOffer", billed: true } });
    expect((await call(owner, { operationId: "cancelShipment", path: { id: "s1" } })).status).toBe(409);
  });

  it("mock mode: offline answers with the same validation, no confirm needed, nothing leaves the Worker", async () => {
    await setMock(true);
    const q = await j<any>(await call(owner, { operationId: "priceList", query: { length: 10, width: 10, height: 10, weight: 2 } }));
    expect(q).toMatchObject({ ok: true, mock: true, status: 200 });
    expect(q.response.body.priceList[0].offers.length).toBeGreaterThan(1);
    const created = await j<any>(await call(owner, { operationId: "createShipment", body: { weight: "2" } }));
    expect(created.response.body.data.offers.list.length).toBeGreaterThan(1); // real shape: offers is { cheapest, fastest, list }
    expect(created.response.body.data.offers.cheapest.id).toBeTruthy();
    const accepted = await j<any>(await call(owner, { operationId: "acceptOffer", body: { offerID: created.response.body.data.offers.list[0].id } }));
    expect(accepted.response.body.data.shipment.labelURL).toContain("mock-label");
    expect(accepted.response.body.data.shipment.acceptedOffer.providerCode).toBeTruthy();
    expect(accepted.response.body.data.shipment.trackingStatus.trackingStatusCode).toBe("PRE_TRANSIT");
    expect((await call(owner, { operationId: "getShipment" })).status).toBe(400); // missing path param
    expect((await call(owner, { operationId: "priceList", query: { length: 1 } })).status).toBe(400); // missing required query
    expect((await call(owner, { operationId: "nope" })).status).toBe(404);
  });
});

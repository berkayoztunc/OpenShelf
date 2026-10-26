import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { admin, ensureOwner, installFakes, j } from "./helpers";
import { decryptJson, encryptJson, toBytes } from "../src/lib/crypto";

describe("integration secrets", () => {
  it("AES-GCM round trip, tamper and wrong-key detection", async () => {
    const e = await encryptJson(env, { apiKey: "abc" }, "aad");
    expect(await decryptJson(env, e.ciphertext, e.iv, 1, "aad")).toEqual({ apiKey: "abc" });
    await expect(decryptJson(env, e.ciphertext, e.iv, 1, "other-aad")).rejects.toThrow();
    const t = new Uint8Array(e.ciphertext); t[0] = t[0]! ^ 1;
    await expect(decryptJson(env, t, e.iv, 1, "aad")).rejects.toThrow();
    await expect(decryptJson({ APP_ENCRYPTION_KEY: btoa(String.fromCharCode(...new Uint8Array(32).fill(1))) }, e.ciphertext, e.iv, 1, "aad")).rejects.toThrow();
  });

  it("stores ciphertext, returns masked values only, keeps/clears secrets per contract", async () => {
    installFakes();
    const s = await ensureOwner();
    const put = await admin(s, "/integrations/iyzico", "PUT", { enabled: true, config: { sandbox: true }, secrets: { apiKey: "SUPERSECRET-APIKEY-9876", secretKey: "another-secret-4321" } });
    expect(put.status).toBe(200);
    const putBody = await put.text();
    expect(putBody).not.toContain("SUPERSECRET"); expect(putBody).toContain("••••9876");

    const row = await env.DB.prepare("SELECT secrets_enc, secrets_iv, key_version, config_public FROM integration_configs WHERE provider='iyzico'").first<any>();
    const raw = Buffer.from(toBytes(row.secrets_enc)).toString("latin1");
    expect(raw).not.toContain("SUPERSECRET");
    expect(row.key_version).toBe(1);
    expect(row.config_public).not.toContain("SUPERSECRET");

    const list = await admin(s, "/integrations");
    const text = await list.text();
    expect(text).not.toContain("SUPERSECRET"); expect(text).not.toContain("another-secret");
    const item = (JSON.parse(text) as any[]).find((i) => i.provider === "iyzico");
    expect(item.secretsSet).toEqual({ apiKey: true, secretKey: true });
    expect(item.secretsMasked.apiKey).toBe("••••9876");
    expect(item.secretFields.length).toBe(2);

    // omitted / empty = keep
    await admin(s, "/integrations/iyzico", "PUT", { enabled: true, config: { sandbox: true }, secrets: { apiKey: "", secretKey: "brand-new-secret-0000" } });
    const again = (await j<any[]>(await admin(s, "/integrations"))).find((i) => i.provider === "iyzico");
    expect(again.secretsMasked.apiKey).toBe("••••9876"); expect(again.secretsMasked.secretKey).toBe("••••0000");
    // null = clear (disabled so validation does not require it)
    await admin(s, "/integrations/iyzico", "PUT", { enabled: false, config: {}, secrets: { secretKey: null } });
    const cleared = (await j<any[]>(await admin(s, "/integrations"))).find((i) => i.provider === "iyzico");
    expect(cleared.secretsSet.secretKey).toBe(false);
    // enabling with missing required secret is rejected
    expect((await admin(s, "/integrations/iyzico", "PUT", { enabled: true, config: {} })).status).toBe(400);
    // unknown secret key rejected
    expect((await admin(s, "/integrations/iyzico", "PUT", { enabled: false, config: {}, secrets: { bogus: "x" } })).status).toBe(400);
    // audit log never contains secret values
    const logs = JSON.stringify(await j<any>(await admin(s, "/audit-logs?pageSize=100")));
    expect(logs).not.toContain("brand-new-secret"); expect(logs).not.toContain("SUPERSECRET");
  });

  it("test endpoint runs healthCheck, persists result and scrubs secrets", async () => {
    installFakes();
    const s = await ensureOwner();
    await admin(s, "/integrations/iyzico", "PUT", { enabled: true, config: {}, secrets: { apiKey: "key-123456", secretKey: "secret-abcdef" } });
    const ok = await j<any>(await admin(s, "/integrations/iyzico/test", "POST"));
    expect(ok.ok).toBe(true);
    await admin(s, "/integrations/iyzico", "PUT", { enabled: true, config: {}, secrets: { apiKey: "bad", secretKey: "secret-abcdef" } });
    const bad = await j<any>(await admin(s, "/integrations/iyzico/test", "POST"));
    expect(bad.ok).toBe(false);
    const item = (await j<any[]>(await admin(s, "/integrations"))).find((i) => i.provider === "iyzico");
    expect(item.health.ok).toBe(false);
    expect(item.health.at).toBeTruthy();
    await admin(s, "/integrations/iyzico", "PUT", { enabled: true, config: {}, secrets: { apiKey: "key-123456", secretKey: "secret-abcdef" } });
  });
});

import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import worker from "../src/index";
import { withDerivedOrigins, encryptionKeyProblem, rememberOrigin, recallOrigin, resetRememberedOrigin } from "../src/lib/origins";
import type { Env } from "../src/env";

async function fetchWith(e: Partial<Env>, path: string, init: RequestInit = {}) {
  const ctx = createExecutionContext();
  const res = await worker.fetch(new Request(`https://shop.example.org${path}`, init), { ...env, ...e } as Env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}
const unset = { ADMIN_ORIGIN: "", STOREFRONT_ORIGIN: "", API_ORIGIN: "" };
const post = (origin?: string, path = "/api/admin/auth/logout") =>
  fetchWith(unset, path, { method: "POST", headers: { ...(origin ? { Origin: origin } : {}), "Content-Type": "application/json", "CF-Connecting-IP": "198.51.100.7" }, body: "{}" });

describe("origin derivation (single-Worker, same-origin)", () => {
  it("fills unset origins from the request, keeps explicit ones", () => {
    const d = withDerivedOrigins({ ...env, ...unset } as Env, "https://a.example/x?y=1");
    expect([d.ADMIN_ORIGIN, d.STOREFRONT_ORIGIN, d.API_ORIGIN]).toEqual(Array(3).fill("https://a.example"));
    const e = withDerivedOrigins({ ...env, ...unset, ADMIN_ORIGIN: "https://admin.pin" } as Env, "https://a.example/");
    expect(e.ADMIN_ORIGIN).toBe("https://admin.pin");
  });
  it("same-origin admin mutation passes the Origin check (reaches auth -> 401), cross-origin / missing Origin fail (403)", async () => {
    expect((await post("https://shop.example.org")).status).toBe(401);
    expect((await post("https://evil.example")).status).toBe(403);
    expect((await post(undefined)).status).toBe(403);
  });
  it("explicit allowlist stays strict", async () => {
    const r = await fetchWith({ ...unset, ADMIN_ORIGIN: "https://admin.pin" }, "/api/admin/auth/logout", { method: "POST", headers: { Origin: "https://shop.example.org" }, body: "{}" });
    expect(r.status).toBe(403);
  });
  it("CORS allows the derived origin only", async () => {
    const ok = await fetchWith(unset, "/api/store/config", { headers: { Origin: "https://shop.example.org" } });
    expect(ok.headers.get("Access-Control-Allow-Origin")).toBe("https://shop.example.org");
    const bad = await fetchWith(unset, "/api/store/config", { headers: { Origin: "https://evil.example" } });
    expect(bad.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });
  it("admin path without bound assets is a clean 404 (API-only mode)", async () => {
    expect((await fetchWith({}, "/admin/products")).status).toBe(404);
  });
});

describe("APP_ENCRYPTION_KEY guard", () => {
  it("reports missing / malformed keys", () => {
    expect(encryptionKeyProblem({})).toMatch(/not set/);
    expect(encryptionKeyProblem({ APP_ENCRYPTION_KEY: "short" })).toMatch(/invalid/);
    expect(encryptionKeyProblem({ APP_ENCRYPTION_KEY: btoa("x".repeat(32)) })).toBeNull();
  });
  it("setup and login refuse with a friendly 503 JSON error", async () => {
    for (const path of ["/api/admin/setup", "/api/admin/auth/login"]) {
      const r = await fetchWith({ APP_ENCRYPTION_KEY: "" }, path, { method: "POST", headers: { Origin: "http://admin.test", "Content-Type": "application/json" }, body: "{}" });
      expect(r.status).toBe(503);
      expect((await r.json() as any).error.code).toBe("misconfigured");
    }
  });
});

describe("remembered origin for cron jobs", () => {
  it("persists the authenticated admin origin so background notifications can build links", async () => {
    resetRememberedOrigin();
    await rememberOrigin(env.DB, "https://shop.example.org/api/admin/auth/me");
    expect(await recallOrigin(env.DB)).toBe("https://shop.example.org");
  });
});

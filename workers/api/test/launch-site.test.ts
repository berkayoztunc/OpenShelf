import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { call, ensureOwner, j } from "./helpers";

describe("/health (deployment self-check used by the launch page)", () => {
  it("reports db, setup, key and token state without leaking secrets; open to cross-origin GET", async () => {
    await ensureOwner();
    const r = await call("/health");
    expect(r.status).toBe(200); expect(r.headers.get("access-control-allow-origin")).toBe("*"); expect(r.headers.get("cache-control")).toBe("no-store");
    const h = await j<any>(r);
    expect(h).toMatchObject({ ok: true, db: "ok", setup: "done", encryptionKey: "ok", setupToken: "set" });
    const text = JSON.stringify(h);
    expect(text).not.toContain(env.APP_ENCRYPTION_KEY); expect(text).not.toContain(env.SETUP_TOKEN);
  });
  it("a normal visit to / after setup is NOT redirected to the setup page", async () => {
    await ensureOwner();
    const r = await call("/", { headers: { Accept: "text/html" } });
    expect(r.status).not.toBe(302);
  });
});

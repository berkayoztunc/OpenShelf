import { describe, expect, it, vi } from "vitest";
import { ApiError, createApiClient } from "../lib/api";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("api client", () => {
  it("fetches csrf from /auth/me and sends it on mutations with credentials", async () => {
    const fetchImpl = vi.fn(async (url: RequestInfo | URL) =>
      String(url).endsWith("/auth/me") ? json({ admin: {}, csrfToken: "tok-1" }) : json({ ok: true }, 200)) as unknown as typeof fetch;
    const api = createApiClient({ fetchImpl });
    await api.post("/api/admin/coupons", { code: "X" });
    const calls = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls;
    expect(String(calls[0]![0])).toContain("/api/admin/auth/me");
    const [, init] = calls[1]!;
    expect(init.credentials).toBe("include");
    expect(init.headers["X-CSRF-Token"]).toBe("tok-1");
  });

  it("does not send csrf on GET", async () => {
    const fetchImpl = vi.fn(async () => json({ items: [] })) as unknown as typeof fetch;
    const api = createApiClient({ fetchImpl });
    api.setCsrf("abc");
    await api.get("/api/admin/products");
    const [, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(init.headers["X-CSRF-Token"]).toBeUndefined();
  });

  it("calls onUnauthorized on 401 and throws ApiError", async () => {
    const onUnauthorized = vi.fn();
    const fetchImpl = vi.fn(async () => json({ error: { code: "unauthorized", message: "nope" } }, 401)) as unknown as typeof fetch;
    const api = createApiClient({ fetchImpl, onUnauthorized });
    await expect(api.get("/api/admin/orders")).rejects.toMatchObject({ status: 401, code: "unauthorized" });
    expect(onUnauthorized).toHaveBeenCalledOnce();
  });

  it("does not redirect on failed login", async () => {
    const onUnauthorized = vi.fn();
    const fetchImpl = vi.fn(async (u: RequestInfo | URL) => String(u).endsWith("/me") ? json({ csrfToken: "t" }) : json({ error: { code: "invalid_credentials", message: "Bad" } }, 401)) as unknown as typeof fetch;
    const api = createApiClient({ fetchImpl, onUnauthorized });
    const err = await api.post("/api/admin/auth/login", { email: "a", password: "b" }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it("refreshes csrf once and retries on 403", async () => {
    let me = 0; let posts = 0;
    const fetchImpl = vi.fn(async (u: RequestInfo | URL, init?: RequestInit) => {
      if (String(u).endsWith("/auth/me")) return json({ csrfToken: `t${++me}` });
      posts++;
      return (init!.headers as Record<string, string>)["X-CSRF-Token"] === "t2" ? json({ ok: 1 }) : json({ error: { code: "csrf", message: "bad" } }, 403);
    }) as unknown as typeof fetch;
    const api = createApiClient({ fetchImpl });
    await expect(api.post("/api/admin/x", {})).resolves.toEqual({ ok: 1 });
    expect(posts).toBe(2);
  });

  it("handles 204", async () => {
    const api = createApiClient({ fetchImpl: (async () => new Response(null, { status: 204 })) as unknown as typeof fetch });
    api.setCsrf("t");
    await expect(api.post("/api/admin/auth/logout")).resolves.toBeUndefined();
  });
});

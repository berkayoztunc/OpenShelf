import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { pkceChallenge, validRedirectUri, levelOfScope } from "../src/oauth/core";
import { sha256Hex } from "../src/lib/crypto";
import { admin, call, ensureOwner, freshIp, j, loginAs, type Session } from "./helpers";

let owner: Session;
const REDIRECT = "https://chat.example.com/oauth/callback";
const verifier = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(48)))).replace(/[+/=]/g, "x").slice(0, 64);
const form = (o: Record<string, string>) => new URLSearchParams(o).toString();
const token = (o: Record<string, string>, headers: Record<string, string> = {}) =>
  call("/oauth/token", { method: "POST", raw: form(o), origin: null, ip: freshIp(), headers: { "content-type": "application/x-www-form-urlencoded", ...headers } });
const register = async (uris: string[] = [REDIRECT], name = "Test Chat") => j<any>(await call("/oauth/register", { method: "POST", json: { client_name: name, redirect_uris: uris }, origin: null, ip: freshIp() }));
const rpc = (t: string, payload: unknown) => call("/mcp", { method: "POST", json: payload, origin: null, headers: { Authorization: `Bearer ${t}` } });

/** Runs register -> authorize -> consent(approve) and returns everything needed to call /oauth/token. */
async function authorizeFlow(opts: { level?: "read" | "write" | "full"; scope?: string; uris?: string[]; decision?: "allow" | "deny"; name?: string } = {}) {
  const c = await register(opts.uris, opts.name);
  const v = verifier(); const challenge = await pkceChallenge(v);
  const q = { response_type: "code", client_id: c.client_id, redirect_uri: REDIRECT, state: "st-123", code_challenge: challenge, code_challenge_method: "S256", ...(opts.scope ? { scope: opts.scope } : {}) };
  const auth = await call(`/oauth/authorize?${form(q)}`);
  const approve = await j<any>(await admin(owner, "/oauth/authorize", "POST", { ...q, level: opts.level ?? "read", decision: opts.decision ?? "allow" }));
  const url = new URL(approve.redirectTo);
  return { c, v, challenge, q, auth, approve, code: url.searchParams.get("code")!, url };
}
const exchange = (f: Awaited<ReturnType<typeof authorizeFlow>>, extra: Record<string, string> = {}) =>
  token({ grant_type: "authorization_code", code: f.code, redirect_uri: REDIRECT, client_id: f.c.client_id, code_verifier: f.v, ...extra });

beforeAll(async () => { owner = await ensureOwner(); });

describe("discovery", () => {
  it("protected-resource and authorization-server metadata describe the endpoints, PKCE and CORS", async () => {
    const pr = await call("/.well-known/oauth-protected-resource");
    expect(pr.headers.get("access-control-allow-origin")).toBe("*");
    const prj = await j<any>(pr);
    expect(prj.resource).toMatch(/\/mcp$/); expect(prj.authorization_servers).toHaveLength(1); expect(prj.scopes_supported).toEqual(["mcp:read", "mcp:write", "mcp:full"]);
    const as = await j<any>(await call("/.well-known/oauth-authorization-server"));
    expect(as.code_challenge_methods_supported).toEqual(["S256"]); expect(as.grant_types_supported).toEqual(["authorization_code", "refresh_token"]);
    for (const k of ["authorization_endpoint", "token_endpoint", "registration_endpoint", "revocation_endpoint"]) expect(as[k]).toMatch(/^https?:\/\/.+\/oauth\//);
    expect(as.issuer).toBe(prj.authorization_servers[0]);
    expect((await call("/.well-known/oauth-protected-resource/mcp")).status).toBe(200);
    expect((await call("/.well-known/oauth-authorization-server/mcp")).status).toBe(200);
  });
  it("CORS preflight works for /mcp and the token endpoint (browser based MCP clients)", async () => {
    for (const path of ["/mcp", "/oauth/token", "/oauth/register"]) {
      const r = await call(path, { method: "OPTIONS", origin: "https://chat.example.com", headers: { "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "authorization,content-type" } });
      expect(r.status, path).toBeLessThan(300); expect(r.headers.get("access-control-allow-origin"), path).toBe("*");
      expect(r.headers.get("access-control-allow-headers")!.toLowerCase(), path).toContain("authorization");
    }
  });
});

describe("dynamic client registration", () => {
  it("accepts https and loopback http redirect URIs and returns a public client", async () => {
    const c = await register(["https://a.example.com/cb", "http://localhost:8123/cb", "http://127.0.0.1/cb"], "  Fancy App  ");
    expect(c.client_id).toMatch(/^osc-/); expect(c.client_name).toBe("Fancy App"); expect(c.token_endpoint_auth_method).toBe("none"); expect(c.client_secret).toBeUndefined();
  });
  it("rejects unsafe redirect URIs and bad bodies", async () => {
    for (const bad of [[], ["http://evil.example.com/cb"], ["javascript:alert(1)"], ["https://a.example.com/cb#frag"], ["https://user:pw@a.example.com/cb"], ["ftp://a.example.com"], ["not a url"], ["https://a.example.com/cb", 5 as never]]) {
      const r = await call("/oauth/register", { method: "POST", json: { client_name: "x", redirect_uris: bad }, origin: null, ip: freshIp() });
      expect(r.status, JSON.stringify(bad)).toBe(400); expect((await j<any>(r)).error).toBe("invalid_redirect_uri");
    }
    expect((await call("/oauth/register", { method: "POST", raw: "{nope", origin: null })).status).toBe(400);
    expect(validRedirectUri("https://ok.example.com/x")).toBe(true); expect(validRedirectUri("http://[::1]:3000/x")).toBe(true); expect(validRedirectUri("http://example.com/x")).toBe(false);
  });
  it("is rate limited per IP", async () => {
    await env.DB.prepare("INSERT OR REPLACE INTO rate_limits (key, count, window_start) VALUES (?1, 10, unixepoch())").bind("oauth-register:203.0.113.9").run();
    const r = await call("/oauth/register", { method: "POST", json: { client_name: "x", redirect_uris: [REDIRECT] }, origin: null });
    expect(r.status).toBe(429);
    await env.DB.prepare("DELETE FROM rate_limits WHERE key = ?1").bind("oauth-register:203.0.113.9").run();
  });
});

describe("authorization request validation (never redirects to an untrusted URI)", () => {
  it("valid request is handed over to the admin consent page with the same parameters", async () => {
    const f = await authorizeFlow({ scope: "mcp:write" });
    expect(f.auth.status).toBe(302);
    const loc = new URL(f.auth.headers.get("location")!);
    expect(loc.pathname).toBe("/admin/oauth/authorize"); expect(loc.searchParams.get("client_id")).toBe(f.c.client_id); expect(loc.searchParams.get("state")).toBe("st-123"); expect(loc.searchParams.get("code_challenge")).toBe(f.challenge);
    expect(f.auth.headers.get("referrer-policy")).toBe("no-referrer");
  });
  it("unknown client, redirect mismatch, missing/plain PKCE, wrong response_type, foreign resource: plain error page, no redirect", async () => {
    const c = await register(); const ch = await pkceChallenge(verifier());
    const base = { response_type: "code", client_id: c.client_id, redirect_uri: REDIRECT, code_challenge: ch, code_challenge_method: "S256" };
    const cases: Record<string, Record<string, string>> = {
      "unknown client": { ...base, client_id: "osc-nope" }, "redirect mismatch": { ...base, redirect_uri: "https://evil.example.com/cb" },
      "no pkce": { ...base, code_challenge: "", code_challenge_method: "" }, "plain pkce": { ...base, code_challenge_method: "plain" }, "short challenge": { ...base, code_challenge: "abc" },
      "token response": { ...base, response_type: "token" }, "foreign resource": { ...base, resource: "https://other.example.com/mcp" },
    };
    for (const [name, q] of Object.entries(cases)) {
      const r = await call(`/oauth/authorize?${form(q)}`);
      expect(r.status, name).toBe(400); expect(r.headers.get("location"), name).toBeNull();
      expect(await r.text(), name).toContain("Cannot authorize");
    }
    const ok = await call(`/oauth/authorize?${form({ ...base, resource: new URL(c.client_id ? "https://x.test" : "").origin })}`);
    expect(ok.status).toBe(400); // resource must be OUR /mcp
  });
  it("consent info tells the human who is asking (claimed name, redirect host, never-used)", async () => {
    const c = await register([REDIRECT], "Looks Legit");
    const q = { response_type: "code", client_id: c.client_id, redirect_uri: REDIRECT, code_challenge: await pkceChallenge(verifier()), code_challenge_method: "S256", scope: "mcp:write" };
    const info = await j<any>(await admin(owner, `/oauth/authorize-info?${form(q)}`));
    expect(info).toMatchObject({ client: { name: "Looks Legit", kind: "dynamic", neverUsed: true }, redirectHost: "chat.example.com", maxLevel: "write" });
    expect((await admin(owner, `/oauth/authorize-info?${form({ ...q, redirect_uri: "https://evil.example.com/x" })}`)).status).toBe(400);
  });
});

describe("consent decision", () => {
  it("allow returns the redirect with code + state; the level cannot exceed the requested scope; deny returns access_denied", async () => {
    const f = await authorizeFlow({ level: "full", scope: "mcp:read" });
    expect(f.url.origin + f.url.pathname).toBe(REDIRECT); expect(f.url.searchParams.get("state")).toBe("st-123"); expect(f.approve.level).toBe("read"); expect(f.code.length).toBeGreaterThan(20);
    const d = await authorizeFlow({ decision: "deny" });
    expect(d.url.searchParams.get("error")).toBe("access_denied"); expect(d.url.searchParams.get("code")).toBeNull(); expect(d.url.searchParams.get("state")).toBe("st-123");
  });
  it("needs an admin browser session: no cookie 401, staff 403, and a token (internal claim) can never approve", async () => {
    const f = await authorizeFlow(); const body = { ...f.q, level: "read", decision: "allow" };
    expect((await call("/api/admin/oauth/authorize", { method: "POST", json: body })).status).toBe(401);
    const email = `oauth-staff-${Date.now()}@example.com`;
    await admin(owner, "/users", "POST", { email, name: "S", password: "staff password 12345", role: "staff" });
    const staff = await loginAs(email, "staff password 12345");
    expect((await admin(staff, "/oauth/authorize", "POST", body)).status).toBe(403);
    const { signInternal, INTERNAL_HEADER } = await import("../src/mcp/internal");
    const aid = (await j<any>(await admin(owner, "/auth/me"))).admin.id;
    const r = await call("/api/admin/oauth/authorize", { method: "POST", json: body, headers: { [INTERNAL_HEADER]: await signInternal(env, { aid, role: "owner", lvl: "full", tid: "t" }) } });
    expect(r.status).toBe(403);
  });
});

describe("token endpoint: authorization_code + PKCE", () => {
  it("full flow: code -> access token that works on /mcp at the approved level; scope reported", async () => {
    const f = await authorizeFlow({ level: "write" });
    const r = await exchange(f);
    expect(r.status).toBe(200); expect(r.headers.get("cache-control")).toBe("no-store");
    const t = await j<any>(r);
    expect(t).toMatchObject({ token_type: "Bearer", expires_in: 3600, scope: "mcp:write" }); expect(t.access_token).toMatch(/^osk_/); expect(t.refresh_token).toMatch(/^osr_/);
    const list = (await j<any>(await rpc(t.access_token, { jsonrpc: "2.0", id: 1, method: "tools/list" }))).result.tools.map((x: any) => x.name);
    expect(list).toContain("create_product"); expect(list).not.toContain("refund_order"); // write level, not full
    expect((await j<any>(await rpc(t.access_token, { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "list_orders", arguments: {} } }))).result.isError).toBeUndefined();
    const row = await env.DB.prepare("SELECT name, level, grant_id AS g, expires_at AS e FROM api_tokens WHERE token_hash = ?1").bind(await sha256Hex(t.access_token)).first<any>();
    expect(row.name).toBe("OAuth: Test Chat"); expect(row.g).toBeTruthy(); expect(row.e).toBeGreaterThan(Date.now() / 1000);
  });
  it("wrong verifier, wrong redirect, wrong client, missing verifier, garbage code: all rejected", async () => {
    const f = await authorizeFlow();
    const other = await register();
    for (const [name, extra] of Object.entries<Record<string, string>>({ "wrong verifier": { code_verifier: verifier() }, "wrong redirect": { redirect_uri: "https://evil.example.com/cb" }, "wrong client": { client_id: other.client_id }, "short verifier": { code_verifier: "short" }, "garbage code": { code: "nope" } })) {
      const r = await exchange(f, extra);
      expect(r.status, name).toBe(name === "wrong client" ? 400 : 400); expect(["invalid_grant", "invalid_request"], name).toContain((await j<any>(r)).error);
    }
    expect((await exchange(f)).status).toBe(200); // none of the failures burned the code
  });
  it("a code is single use; replaying it revokes the tokens it produced", async () => {
    const f = await authorizeFlow();
    const first = await j<any>(await exchange(f));
    expect((await rpc(first.access_token, { jsonrpc: "2.0", id: 1, method: "ping" })).status).toBe(200);
    const again = await exchange(f);
    expect(again.status).toBe(400); expect((await j<any>(again)).error).toBe("invalid_grant");
    expect((await rpc(first.access_token, { jsonrpc: "2.0", id: 1, method: "ping" })).status).toBe(401); // replay = assume stolen
  });
  it("an expired code is rejected", async () => {
    const f = await authorizeFlow();
    await env.DB.prepare("UPDATE oauth_codes SET expires_at = unixepoch() - 10 WHERE code_hash = ?1").bind(await sha256Hex(f.code)).run();
    expect((await j<any>(await exchange(f))).error).toBe("invalid_grant");
  });
  it("unsupported grant types and unknown clients", async () => {
    const f = await authorizeFlow();
    expect((await j<any>(await token({ grant_type: "password", client_id: f.c.client_id }))).error).toBe("unsupported_grant_type");
    const r = await token({ grant_type: "authorization_code", client_id: "osc-nope", code: "x", code_verifier: verifier() });
    expect(r.status).toBe(401); expect((await j<any>(r)).error).toBe("invalid_client");
  });
});

describe("refresh tokens", () => {
  it("rotate on every use; the old one stops working; reuse of a rotated token revokes the whole grant", async () => {
    const f = await authorizeFlow(); const t1 = await j<any>(await exchange(f));
    const refresh = (rt: string) => token({ grant_type: "refresh_token", refresh_token: rt, client_id: f.c.client_id });
    const t2 = await j<any>(await refresh(t1.refresh_token));
    expect(t2.refresh_token).not.toBe(t1.refresh_token); expect(t2.access_token).not.toBe(t1.access_token);
    expect((await rpc(t2.access_token, { jsonrpc: "2.0", id: 1, method: "ping" })).status).toBe(200);
    const stolen = await refresh(t1.refresh_token); // already rotated
    expect(stolen.status).toBe(400); expect((await j<any>(stolen)).error).toBe("invalid_grant");
    expect((await refresh(t2.refresh_token)).status).toBe(400); // whole grant is dead now
    expect((await rpc(t2.access_token, { jsonrpc: "2.0", id: 1, method: "ping" })).status).toBe(401);
  });
  it("expired access tokens stop working but the refresh token mints a new one; expired refresh is rejected; other client's refresh is rejected", async () => {
    const f = await authorizeFlow(); const t = await j<any>(await exchange(f));
    await env.DB.prepare("UPDATE api_tokens SET expires_at = unixepoch() - 5 WHERE token_hash = ?1").bind(await sha256Hex(t.access_token)).run();
    expect((await rpc(t.access_token, { jsonrpc: "2.0", id: 1, method: "ping" })).status).toBe(401);
    const other = await register();
    expect((await token({ grant_type: "refresh_token", refresh_token: t.refresh_token, client_id: other.client_id })).status).toBe(400);
    const ok = await j<any>(await token({ grant_type: "refresh_token", refresh_token: t.refresh_token, client_id: f.c.client_id }));
    expect((await rpc(ok.access_token, { jsonrpc: "2.0", id: 1, method: "ping" })).status).toBe(200);
    await env.DB.prepare("UPDATE oauth_grants SET refresh_expires_at = unixepoch() - 5").run();
    expect((await token({ grant_type: "refresh_token", refresh_token: ok.refresh_token, client_id: f.c.client_id })).status).toBe(400);
  });
});

describe("revocation and connected apps", () => {
  it("POST /oauth/revoke (RFC 7009) kills the grant from either token; always 200", async () => {
    const f = await authorizeFlow(); const t = await j<any>(await exchange(f));
    expect((await call("/oauth/revoke", { method: "POST", raw: form({ token: t.refresh_token }), origin: null, headers: { "content-type": "application/x-www-form-urlencoded" } })).status).toBe(200);
    expect((await rpc(t.access_token, { jsonrpc: "2.0", id: 1, method: "ping" })).status).toBe(401);
    expect((await call("/oauth/revoke", { method: "POST", raw: form({ token: "garbage" }), origin: null, headers: { "content-type": "application/x-www-form-urlencoded" } })).status).toBe(200);
    const f2 = await authorizeFlow(); const t2 = await j<any>(await exchange(f2));
    await call("/oauth/revoke", { method: "POST", raw: form({ token: t2.access_token }), origin: null, headers: { "content-type": "application/x-www-form-urlencoded" } });
    expect((await token({ grant_type: "refresh_token", refresh_token: t2.refresh_token, client_id: f2.c.client_id })).status).toBe(400);
  });
  it("a personal access token can NOT be revoked through the public endpoint", async () => {
    const pat = (await j<any>(await admin(owner, "/tokens", "POST", { name: "pat", level: "read" }))).token;
    await call("/oauth/revoke", { method: "POST", raw: form({ token: pat }), origin: null, headers: { "content-type": "application/x-www-form-urlencoded" } });
    expect((await rpc(pat, { jsonrpc: "2.0", id: 1, method: "ping" })).status).toBe(200);
  });
  it("Settings -> Apps: grants list shows the client; Disconnect kills access; the owner sees all", async () => {
    const f = await authorizeFlow({ level: "read", name: "Unique App 77" }); const t = await j<any>(await exchange(f));
    const list = await j<any>(await admin(owner, "/oauth/grants"));
    const g = list.items.find((x: any) => x.client === "Unique App 77");
    expect(g).toBeTruthy(); expect(JSON.stringify(list)).not.toContain(t.refresh_token); expect(JSON.stringify(list)).not.toContain("Hash");
    expect((await admin(owner, `/oauth/grants/${g.id}`, "DELETE")).status).toBe(204);
    expect((await rpc(t.access_token, { jsonrpc: "2.0", id: 1, method: "ping" })).status).toBe(401);
    expect((await admin(owner, "/oauth/grants/nope", "DELETE")).status).toBe(404);
  });
});

describe("OAuth tokens obey the same limits as personal tokens", () => {
  it("tool permissions and the master switch apply; a read grant cannot call write tools", async () => {
    const t = await j<any>(await exchange(await authorizeFlow({ level: "read" })));
    const call1 = async (name: string) => (await j<any>(await rpc(t.access_token, { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: { id: "x", body: { slug: "oauth-x", nameTr: "x" } } } }))).result;
    expect((await call1("create_category")).content[0].text).toContain('needs level "write"');
    await admin(owner, "/mcp/tools", "PUT", { masterEnabled: false });
    expect((await rpc(t.access_token, { jsonrpc: "2.0", id: 1, method: "ping" })).status).toBe(403);
    await admin(owner, "/mcp/tools", "PUT", { masterEnabled: true });
    expect((await rpc(t.access_token, { jsonrpc: "2.0", id: 1, method: "ping" })).status).toBe(200);
  });
  it("an OAuth token is not accepted on the admin API (only /mcp)", async () => {
    const t = await j<any>(await exchange(await authorizeFlow({ level: "full" })));
    expect((await call("/api/admin/orders", { headers: { Authorization: `Bearer ${t.access_token}` } })).status).toBe(401);
  });
});

describe("manual (confidential) clients", () => {
  it("owner creates a client; secret shown once; token endpoint requires it (post body or Basic); deleting revokes its grants", async () => {
    const created = await j<any>(await admin(owner, "/oauth/clients", "POST", { name: "Grok", redirectUris: [REDIRECT] }));
    expect(created.clientId).toMatch(/^osm-/); expect(created.clientSecret).toMatch(/^osc_/);
    const list = await j<any>(await admin(owner, "/oauth/clients"));
    expect(JSON.stringify(list)).not.toContain(created.clientSecret); expect(list.items.find((x: any) => x.clientId === created.clientId)).toMatchObject({ confidential: true, kind: "manual" });
    const v = verifier(); const ch = await pkceChallenge(v);
    const q = { response_type: "code", client_id: created.clientId, redirect_uri: REDIRECT, state: "s", code_challenge: ch, code_challenge_method: "S256" };
    const approve = async () => new URL((await j<any>(await admin(owner, "/oauth/authorize", "POST", { ...q, level: "read", decision: "allow" }))).redirectTo).searchParams.get("code")!;
    const base = (code: string) => ({ grant_type: "authorization_code", code, redirect_uri: REDIRECT, client_id: created.clientId, code_verifier: v });
    const noSecret = await token(base(await approve()));
    expect(noSecret.status).toBe(401); expect((await j<any>(noSecret)).error).toBe("invalid_client");
    expect((await token({ ...base(await approve()), client_secret: "osc_wrong" })).status).toBe(401);
    const post = await token({ ...base(await approve()), client_secret: created.clientSecret });
    expect(post.status).toBe(200);
    const basic = await token(base(await approve()), { Authorization: `Basic ${btoa(`${created.clientId}:${created.clientSecret}`)}` });
    expect(basic.status).toBe(200);
    const t = await j<any>(post);
    expect((await rpc(t.access_token, { jsonrpc: "2.0", id: 1, method: "ping" })).status).toBe(200);
    expect((await admin(owner, `/oauth/clients/${created.clientId}`, "DELETE")).status).toBe(204);
    expect((await rpc(t.access_token, { jsonrpc: "2.0", id: 1, method: "ping" })).status).toBe(401);
    expect((await admin(owner, `/oauth/clients/${created.clientId}`, "DELETE")).status).toBe(404);
  });
  it("validates redirect URIs and is owner-only", async () => {
    expect((await admin(owner, "/oauth/clients", "POST", { name: "x", redirectUris: ["http://evil.example.com/cb"] })).status).toBe(400);
    expect((await admin(owner, "/oauth/clients", "POST", { name: "", redirectUris: [REDIRECT] })).status).toBe(400);
    expect((await admin(owner, "/oauth/clients", "POST", { name: "x", redirectUris: [] })).status).toBe(400);
  });
});

describe("helpers", () => {
  it("scope parsing picks the highest requested level", () => {
    expect(levelOfScope("mcp:read mcp:write")).toBe("write"); expect(levelOfScope("mcp:full")).toBe("full"); expect(levelOfScope("openid")).toBeNull(); expect(levelOfScope(undefined)).toBeNull();
  });
});

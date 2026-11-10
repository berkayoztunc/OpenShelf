import { describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import OauthConsent, { safeRedirect } from "../pages/OauthConsent";
import OauthApps from "../pages/settings/OauthApps";
import ApiTokens from "../pages/settings/ApiTokens";
import { LoginPage } from "../pages/Login";
import { safeNext } from "../lib/next";
import * as apiMod from "../lib/api";
import { asRole, mockApi, renderRoutes } from "./helpers";

const QS = "response_type=code&client_id=osc-abc&redirect_uri=https%3A%2F%2Fchat.example.com%2Fcb&state=s1&code_challenge=" + "a".repeat(43) + "&code_challenge_method=S256&scope=mcp%3Awrite";
const INFO = (o: object = {}) => ({ client: { id: "osc-abc", name: "Grok", kind: "dynamic", neverUsed: true }, redirectUri: "https://chat.example.com/cb", redirectHost: "chat.example.com", maxLevel: "write", scope: "mcp:write", ...o });

describe("safeNext / safeRedirect", () => {
  it("only in-app paths are accepted after login", () => {
    for (const ok of ["/", "/oauth/authorize?client_id=1&state=a", "/orders", "/settings/mcp"]) expect(safeNext(ok), ok).toBe(ok);
    for (const bad of ["//evil.com", "https://evil.com", "/\\evil.com", "javascript:alert(1)", "/https://evil.com", "", null, undefined, "evil", "/%2F%2Fevil.com"]) expect(safeNext(bad as never), String(bad)).toBe("/");
  });
  it("the consent page only navigates to the validated host", () => {
    expect(safeRedirect("https://chat.example.com/cb?code=1", "chat.example.com")).toBe("https://chat.example.com/cb?code=1");
    expect(safeRedirect("http://localhost:8123/cb?code=1", "localhost:8123")).toBe("http://localhost:8123/cb?code=1");
    for (const [u, h] of [["https://evil.com/cb", "chat.example.com"], ["javascript:alert(1)", "chat.example.com"], ["http://chat.example.com/cb", "chat.example.com"], ["nope", "x"]] as const) expect(safeRedirect(u, h), u).toBeNull();
  });
});

describe("OAuth consent page", () => {
  it("shows the claimed app name, the redirect host, defaults to read-only and limits choices to the requested scope", async () => {
    asRole("owner"); mockApi({ "GET /api/admin/oauth/authorize-info": () => INFO() });
    renderRoutes({ "/oauth/authorize": <OauthConsent /> }, `/oauth/authorize?${QS}`);
    const c = await screen.findByTestId("oauth-consent");
    expect(within(c).getAllByText(/Grok/).length).toBeGreaterThan(0);
    expect(screen.getByTestId("oauth-host")).toHaveTextContent("chat.example.com");
    expect(within(c).getByText(/name not verified|ad doğrulanmadı/)).toBeInTheDocument();
    expect(within(c).getByRole("note")).toHaveTextContent(/never connected|daha önce hiç bağlanmadı/);
    const sel = within(c).getByRole("combobox") as HTMLSelectElement;
    expect(sel.value).toBe("read"); expect([...sel.options].map((o) => o.value)).toEqual(["read", "write"]); // scope was mcp:write -> no "full"
  });
  it("allow posts the request params + chosen level and navigates to the validated redirect", async () => {
    asRole("owner");
    const posts: any[] = []; const assign = vi.fn();
    Object.defineProperty(window, "location", { value: { ...window.location, assign, origin: "https://shop.test" }, writable: true });
    mockApi({ "GET /api/admin/oauth/authorize-info": () => INFO(), "POST /api/admin/oauth/authorize": (_p, b) => { posts.push(b); return { redirectTo: "https://chat.example.com/cb?code=C1&state=s1" }; } });
    const u = userEvent.setup(); renderRoutes({ "/oauth/authorize": <OauthConsent /> }, `/oauth/authorize?${QS}`);
    const c = await screen.findByTestId("oauth-consent");
    await u.selectOptions(within(c).getByRole("combobox"), "write");
    await u.click(within(c).getByRole("button", { name: /^Allow$|^İzin ver$/ }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("https://chat.example.com/cb?code=C1&state=s1"));
    expect(posts[0]).toMatchObject({ client_id: "osc-abc", redirect_uri: "https://chat.example.com/cb", state: "s1", code_challenge_method: "S256", level: "write", decision: "allow" });
  });
  it("a tampered redirect from the server is NOT followed", async () => {
    asRole("owner"); const assign = vi.fn();
    Object.defineProperty(window, "location", { value: { ...window.location, assign }, writable: true });
    mockApi({ "GET /api/admin/oauth/authorize-info": () => INFO(), "POST /api/admin/oauth/authorize": () => ({ redirectTo: "https://evil.com/steal?code=1" }) });
    const u = userEvent.setup(); renderRoutes({ "/oauth/authorize": <OauthConsent /> }, `/oauth/authorize?${QS}`);
    await u.click(await screen.findByRole("button", { name: /^Allow$|^İzin ver$/ }));
    await waitFor(() => expect(screen.getByRole("button", { name: /^Deny$|^Reddet$/ })).toBeEnabled());
    expect(assign).not.toHaveBeenCalled();
  });
  it("deny posts decision=deny; invalid requests show the server's error; staff cannot approve", async () => {
    asRole("admin"); const posts: any[] = [];
    mockApi({ "GET /api/admin/oauth/authorize-info": () => INFO(), "POST /api/admin/oauth/authorize": (_p, b) => { posts.push(b); return { redirectTo: "https://chat.example.com/cb?error=access_denied&state=s1" }; } });
    Object.defineProperty(window, "location", { value: { ...window.location, assign: vi.fn() }, writable: true });
    const u = userEvent.setup(); const r = renderRoutes({ "/oauth/authorize": <OauthConsent /> }, `/oauth/authorize?${QS}`);
    await u.click(await screen.findByRole("button", { name: /^Deny$|^Reddet$/ }));
    await waitFor(() => expect(posts[0]).toMatchObject({ decision: "deny" }));
    r.unmount();
    asRole("staff"); mockApi({});
    renderRoutes({ "/oauth/authorize": <OauthConsent /> }, `/oauth/authorize?${QS}`);
    expect(await screen.findByRole("alert")).toHaveTextContent(/Only owner or admin|yalnızca owner veya admin/i);
    expect(screen.queryByRole("button", { name: /^Allow$|^İzin ver$/ })).toBeNull();
  });
  it("shows the API error for a bad request instead of a consent form", async () => {
    asRole("owner"); mockApi({ "GET /api/admin/oauth/authorize-info": () => new apiMod.ApiError(400, "invalid_authorization_request", "The redirect_uri does not match one registered for this application.") });
    renderRoutes({ "/oauth/authorize": <OauthConsent /> }, `/oauth/authorize?${QS}`);
    expect(await screen.findByText(/redirect_uri does not match/)).toBeInTheDocument();
    expect(screen.queryByTestId("oauth-consent")).toBeNull();
  });
});

describe("login brings you back (next)", () => {
  it("after a successful login the user lands on the safe next path", async () => {
    asRole("owner"); mockApi({ "GET /api/admin/setup/status": () => ({ needsSetup: false }), "POST /api/admin/auth/login": () => ({ admin: { id: "1", email: "a@b.c", name: "A", role: "owner", totpEnabled: true }, csrfToken: "c" }) });
    const u = userEvent.setup(); renderRoutes({ "/login": <LoginPage />, "/oauth/authorize": <p>consent page</p>, "/": <p>dashboard</p> }, `/login?next=${encodeURIComponent("/oauth/authorize?client_id=1")}`);
    await u.type(await screen.findByLabelText(/E-?mail/i), "a@b.c"); await u.type(screen.getByLabelText(/Password|Şifre/), "correct horse battery");
    await u.click(screen.getByRole("button", { name: /Sign in|Giriş/i }));
    expect(await screen.findByText("consent page")).toBeInTheDocument();
  });
  it("a hostile next falls back to the dashboard", async () => {
    asRole("owner"); mockApi({ "GET /api/admin/setup/status": () => ({ needsSetup: false }), "POST /api/admin/auth/login": () => ({ admin: { id: "1", email: "a@b.c", name: "A", role: "owner", totpEnabled: true }, csrfToken: "c" }) });
    const u = userEvent.setup(); renderRoutes({ "/login": <LoginPage />, "/": <p>dashboard</p>, "*": <p>other</p> }, `/login?next=${encodeURIComponent("//evil.com")}`);
    await u.type(await screen.findByLabelText(/E-?mail/i), "a@b.c"); await u.type(screen.getByLabelText(/Password|Şifre/), "correct horse battery");
    await u.click(screen.getByRole("button", { name: /Sign in|Giriş/i }));
    expect(await screen.findByText("dashboard")).toBeInTheDocument();
  });
});

describe("Connected apps tab", () => {
  const GRANTS = { items: [{ id: "g1", client: "Grok", kind: "dynamic", level: "read", createdAt: 1767000000, lastUsedAt: null }, { id: "g2", client: "Claude", kind: "dynamic", level: "write", createdAt: 1767000000, lastUsedAt: 1767000500 }] };
  it("lists grants, disconnects after confirmation, shows the server address to paste", async () => {
    asRole("owner"); const dels: string[] = [];
    mockApi({ "GET /api/admin/oauth/grants": () => GRANTS, "GET /api/admin/oauth/clients": () => ({ items: [] }) });
    const del = vi.spyOn(apiMod.api, "del").mockImplementation((async (p: string) => { dels.push(p); return null; }) as never);
    const u = userEvent.setup(); renderRoutes({ "/": <OauthApps /> }, "/");
    expect(await screen.findAllByTestId("grant-row")).toHaveLength(2);
    expect(screen.getByText(`${window.location.origin}/mcp`)).toBeInTheDocument();
    await u.click(screen.getAllByRole("button", { name: /^Disconnect$|^Bağlantıyı kes$/ })[0]!);
    await u.click(within(await screen.findByRole("dialog")).getByRole("button", { name: /^Disconnect$|^Bağlantıyı kes$/ }));
    await waitFor(() => expect(dels).toEqual(["/api/admin/oauth/grants/g1"]));
    del.mockRestore();
  });
  it("owner creates a manual client: secret shown once in the dialog, never in the list", async () => {
    asRole("owner"); const posts: unknown[] = [];
    mockApi({ "GET /api/admin/oauth/grants": () => ({ items: [] }), "GET /api/admin/oauth/clients": () => ({ items: [{ clientId: "osm-1", name: "Grok", kind: "manual", redirectUris: ["https://chat.example.com/cb"], confidential: true, createdAt: 1767000000, lastUsedAt: null }] }),
      "POST /api/admin/oauth/clients": (_p, b) => { posts.push(b); return { clientId: "osm-1", clientSecret: "osc_SECRETSECRET", name: "Grok", redirectUris: ["https://chat.example.com/cb"] }; } });
    const u = userEvent.setup(); renderRoutes({ "/": <OauthApps /> }, "/");
    await u.type(await screen.findByLabelText(/^Name|^Ad$/), "Grok"); await u.type(screen.getByLabelText(/Callback|Geri dönüş/), "https://chat.example.com/cb");
    await u.click(screen.getByRole("button", { name: /Create client|İstemci oluştur/ }));
    const dlg = await screen.findByTestId("client-created");
    expect(dlg).toHaveTextContent("osc_SECRETSECRET"); expect(dlg).toHaveTextContent("osm-1");
    expect(posts).toEqual([{ name: "Grok", redirectUris: ["https://chat.example.com/cb"] }]);
    expect(screen.getAllByTestId("client-row")).toHaveLength(1);
    expect(screen.getByTestId("client-row")).not.toHaveTextContent("SECRET");
  });
  it("admins cannot create clients; the Apps tab is reachable from the MCP page and has no URL-token box", async () => {
    asRole("admin"); mockApi({ "GET /api/admin/oauth/grants": () => ({ items: [] }), "GET /api/admin/oauth/clients": () => ({ items: [] }), "GET /api/admin/tokens": () => ({ items: [] }) });
    const u = userEvent.setup(); renderRoutes({ "/": <ApiTokens /> }, "/");
    await u.click(await screen.findByRole("tab", { name: /Connected apps|Bağlı uygulamalar/ }));
    expect(await screen.findByText(/Only the owner can create OAuth clients|yalnızca owner oluşturabilir/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Create client|İstemci oluştur/ })).toBeNull();
  });
});

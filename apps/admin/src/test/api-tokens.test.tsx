import { describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ApiTokens, { claudeCommand, jsonConfig } from "../pages/settings/ApiTokens";
import { asRole, mockApi, renderRoutes } from "./helpers";

const ROW = { id: "t1", name: "Claude Ayşe", prefix: "osk_abcd1234", level: "read", createdAt: 1767000000, lastUsedAt: null, expiresAt: null, revokedAt: null };

describe("config snippets", () => {
  it("builds the Claude Code command and a JSON config with the bearer header", () => {
    expect(claudeCommand("https://x.test/mcp", "osk_t")).toBe('claude mcp add --transport http openshelf https://x.test/mcp --header "Authorization: Bearer osk_t"');
    expect(JSON.parse(jsonConfig("https://x.test/mcp", "osk_t")).mcpServers.openshelf).toEqual({ type: "http", url: "https://x.test/mcp", headers: { Authorization: "Bearer osk_t" } });
  });
});

describe("MCP / API tokens tab", () => {
  it("staff cannot see it", async () => {
    asRole("staff"); mockApi({});
    renderRoutes({ "/": <ApiTokens /> }, "/");
    expect(await screen.findByText(/Admins only|Yalnızca yöneticiler/)).toBeInTheDocument();
  });

  it("creates a token: sends name/level/expiry, shows the secret + ready-made config once", async () => {
    asRole("owner");
    const posts: unknown[] = [];
    mockApi({
      "GET /api/admin/tokens": () => ({ items: [] }),
      "POST /api/admin/tokens": (_p, b) => { posts.push(b); return { ...ROW, id: "t9", name: "Yeni", level: "full", token: "osk_SECRETSECRET", mcpUrl: "https://shop.test/mcp" }; },
    });
    const u = userEvent.setup(); renderRoutes({ "/": <ApiTokens /> }, "/");
    const create = await screen.findByRole("button", { name: /Create token|Anahtar oluştur/ });
    expect(create).toBeDisabled();
    await u.type(screen.getByLabelText(/^Name|^Ad$/), "Yeni");
    await u.selectOptions(screen.getByLabelText(/Access level|Erişim seviyesi/), "full");
    await u.selectOptions(screen.getByLabelText(/^Expires|^Süre/), "never");
    await u.click(create);
    const dlg = await screen.findByTestId("token-created");
    expect(posts).toEqual([{ name: "Yeni", level: "full", expiresInDays: null }]);
    expect(within(dlg).getByText("osk_SECRETSECRET")).toBeInTheDocument();
    expect(dlg.textContent).toContain('claude mcp add --transport http openshelf https://shop.test/mcp --header "Authorization: Bearer osk_SECRETSECRET"');
    expect(dlg).toHaveTextContent(/only once|yalnızca bir kez/i);
  });

  it("lists tokens (prefix only, never the secret) and revokes after confirmation", async () => {
    asRole("admin");
    const dels: string[] = [];
    const { vi } = await import("vitest");
    const apiMod = await import("../lib/api");
    mockApi({ "GET /api/admin/tokens": () => ({ items: [ROW, { ...ROW, id: "t2", name: "Eski", revokedAt: 1767000100 }, { ...ROW, id: "t3", name: "Bitti", expiresAt: 1000 }] }) });
    const del = vi.spyOn(apiMod.api, "del").mockImplementation((async (p: string) => { dels.push(p); return null; }) as never);
    const u = userEvent.setup(); renderRoutes({ "/": <ApiTokens /> }, "/");
    expect(await screen.findAllByTestId("token-row")).toHaveLength(3);
    expect(screen.getAllByText("osk_abcd1234…").length).toBeGreaterThan(0);
    expect(screen.getByText(/^Revoked$|^İptal edildi$/)).toBeInTheDocument();
    expect(screen.getByText(/^Expired$|^Süresi doldu$/)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Revoke$|^İptal et$/ })).toHaveLength(2); // revoked row has no button
    await u.click(screen.getAllByRole("button", { name: /^Revoke$|^İptal et$/ })[0]!);
    await u.click(within(await screen.findByRole("dialog")).getByRole("button", { name: /^Revoke$|^İptal et$/ }));
    await waitFor(() => expect(dels).toEqual(["/api/admin/tokens/t1"]));
    del.mockRestore();
  });
});

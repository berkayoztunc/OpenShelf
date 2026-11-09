import { describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import McpTools, { diffTools, groupTools, type ToolRow } from "../pages/settings/McpTools";
import ApiTokens from "../pages/settings/ApiTokens";
import { asRole, mockApi, renderRoutes } from "./helpers";

const T = (name: string, level: ToolRow["level"], group: string, enabled = true): ToolRow => ({ name, title: name.replace(/_/g, " "), description: `[${level}] does ${name}`, level, group, method: level === "read" ? "GET" : "POST", path: `/${name}`, readOnly: level === "read", enabled });
const TOOLS = [T("list_orders", "read", "orders"), T("get_order", "read", "orders"), T("refund_order", "full", "orders"), T("create_product", "write", "catalog"), T("send_sms", "full", "messaging", false)];
const POLICY = (o: object = {}) => ({ masterEnabled: true, tools: TOOLS, ...o });

describe("pure helpers", () => {
  it("groups keep server order; diff only reports real changes", () => {
    expect(groupTools(TOOLS).map(([g, r]) => [g, r.length])).toEqual([["orders", 3], ["catalog", 1], ["messaging", 1]]);
    expect(diffTools(TOOLS, { list_orders: true, refund_order: false, send_sms: false, create_product: true })).toEqual({ refund_order: false });
    expect(diffTools(TOOLS, {})).toEqual({});
  });
});

describe("MCP tools screen", () => {
  it("owner: shows state, toggles a tool, sees the save bar, saves only the changed tool", async () => {
    asRole("owner");
    const puts: unknown[] = [];
    const { vi } = await import("vitest"); const apiMod = await import("../lib/api");
    mockApi({ "GET /api/admin/mcp/tools": () => POLICY() });
    const put = vi.spyOn(apiMod.api, "put").mockImplementation((async (_p: string, b: unknown) => { puts.push(b); return POLICY({ tools: TOOLS.map((t) => (t.name === "refund_order" ? { ...t, enabled: false } : t)) }); }) as never);
    const u = userEvent.setup(); renderRoutes({ "/": <McpTools /> }, "/");
    expect(await screen.findByTestId("mcp-count")).toHaveTextContent("4");
    expect(screen.getByRole("checkbox", { name: "send_sms" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "list_orders" })).toBeChecked();
    expect(screen.queryByTestId("mcp-savebar")).toBeNull();
    await u.click(screen.getByRole("checkbox", { name: "refund_order" }));
    const bar = await screen.findByTestId("mcp-savebar");
    expect(bar).toHaveTextContent("1");
    await u.click(within(bar).getByRole("button", { name: /Save changes|Değişiklikleri kaydet/ }));
    await waitFor(() => expect(puts).toEqual([{ tools: { refund_order: false } }]));
    await waitFor(() => expect(screen.queryByTestId("mcp-savebar")).toBeNull());
    put.mockRestore();
  });

  it("discard reverts; group checkbox toggles a whole group; presets set everything", async () => {
    asRole("owner"); mockApi({ "GET /api/admin/mcp/tools": () => POLICY() });
    const u = userEvent.setup(); renderRoutes({ "/": <McpTools /> }, "/");
    await screen.findByTestId("mcp-count");
    const orders = screen.getByTestId("mcp-group-orders");
    const groupBox = within(orders).getByRole("checkbox", { name: /Toggle all Orders tools|Tüm Siparişler araçlarını değiştir/ });
    expect(groupBox).toBeChecked();
    await u.click(groupBox); // all three off
    for (const n of ["list_orders", "get_order", "refund_order"]) expect(within(orders).getByRole("checkbox", { name: n })).not.toBeChecked();
    await u.click(within(orders).getByRole("checkbox", { name: "get_order" })); // one back on -> group is mixed
    expect((groupBox as HTMLInputElement).indeterminate).toBe(true);
    await u.click(screen.getByRole("button", { name: /Discard|Vazgeç/ }));
    expect(screen.queryByTestId("mcp-savebar")).toBeNull();
    expect(within(orders).getByRole("checkbox", { name: "refund_order" })).toBeChecked();
    await u.click(screen.getByRole("button", { name: /Only read tools|Yalnızca okuma araçları/ }));
    expect(screen.getByTestId("mcp-count")).toHaveTextContent(/2 of 5|5 araçtan 2/);
    expect(screen.getByRole("checkbox", { name: "refund_order" })).not.toBeChecked();
    await u.click(screen.getByRole("button", { name: /Allow all|Hepsine izin ver/ }));
    expect(screen.getByRole("checkbox", { name: "send_sms" })).toBeChecked();
  });

  it("filters by level and search", async () => {
    asRole("owner"); mockApi({ "GET /api/admin/mcp/tools": () => POLICY() });
    const u = userEvent.setup(); renderRoutes({ "/": <McpTools /> }, "/");
    await screen.findByTestId("mcp-count");
    await u.click(screen.getByRole("button", { name: /^Full$|^Tam$/ }));
    expect(screen.getAllByRole("checkbox", { name: /refund_order|send_sms/ })).toHaveLength(2);
    expect(screen.queryByRole("checkbox", { name: "list_orders" })).toBeNull();
    await u.click(screen.getByRole("button", { name: /^All$|^Tümü$/ }));
    await u.type(screen.getByRole("searchbox"), "product");
    expect(screen.getByRole("checkbox", { name: "create_product" })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "list_orders" })).toBeNull();
  });

  it("master switch is saved together with tool changes", async () => {
    asRole("owner");
    const puts: unknown[] = [];
    const { vi } = await import("vitest"); const apiMod = await import("../lib/api");
    mockApi({ "GET /api/admin/mcp/tools": () => POLICY() });
    const put = vi.spyOn(apiMod.api, "put").mockImplementation((async (_p: string, b: unknown) => { puts.push(b); return POLICY({ masterEnabled: false }); }) as never);
    const u = userEvent.setup(); renderRoutes({ "/": <McpTools /> }, "/");
    await screen.findByTestId("mcp-count");
    await u.click(screen.getByRole("switch"));
    await u.click(within(await screen.findByTestId("mcp-savebar")).getByRole("button", { name: /Save changes|Değişiklikleri kaydet/ }));
    await waitFor(() => expect(puts).toEqual([{ masterEnabled: false }]));
    put.mockRestore();
  });

  it("admin (not owner): read-only view, no save bar, checkboxes disabled", async () => {
    asRole("admin"); mockApi({ "GET /api/admin/mcp/tools": () => POLICY() });
    renderRoutes({ "/": <McpTools /> }, "/");
    await screen.findByTestId("mcp-count");
    expect(screen.getByRole("checkbox", { name: "list_orders" })).toBeDisabled();
    expect(screen.getByText(/Only the owner can change|yalnızca owner değiştirebilir/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Allow all|Hepsine izin ver/ })).toBeNull();
  });

  it("is reachable as a tab of the MCP settings page", async () => {
    asRole("owner"); mockApi({ "GET /api/admin/tokens": () => ({ items: [] }), "GET /api/admin/mcp/tools": () => POLICY() });
    const u = userEvent.setup(); renderRoutes({ "/": <ApiTokens /> }, "/");
    await u.click(await screen.findByRole("tab", { name: /^Tools$|^Araçlar$/ }));
    expect(await screen.findByTestId("mcp-count")).toBeInTheDocument();
  });
});

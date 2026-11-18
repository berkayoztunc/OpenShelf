import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useLocation } from "react-router-dom";
import { CommandPalette, fold, matches } from "../components/CommandPalette";
import * as integrationsLib from "../lib/integrations";
import { setLocale } from "../i18n";
import { asRole, mockApi, renderRoutes, withSettings } from "./helpers";

function Where() { return <p data-testid="where">{useLocation().pathname + useLocation().search}</p>; }
const page = () => <><CommandPalette /><Where /></>;

beforeEach(() => { asRole("owner"); withSettings(false); setLocale("tr"); vi.spyOn(integrationsLib, "useIntegrations").mockReturnValue({ data: [] } as never); });
afterEach(() => vi.restoreAllMocks());

describe("search text matching", () => {
  it("is Turkish- and accent-insensitive and needs every word", () => {
    expect(fold("SİPARİŞ Çiçek")).toBe("siparis cicek");
    expect(matches("siparis", "Siparişler")).toBe(true);
    expect(matches("kargo bild", "Bildirimler", "Kargo ayarları")).toBe(true);
    expect(matches("kupon yok", "Kuponlar")).toBe(false);
    expect(matches("", "x")).toBe(false);
  });
});

describe("command palette", () => {
  it("opens with Ctrl+K, finds a settings tab by name and navigates with Enter", async () => {
    mockApi({});
    const u = userEvent.setup();
    renderRoutes({ "*": page() }, "/");
    await u.keyboard("{Control>}k{/Control}");
    const box = await screen.findByRole("combobox", { name: "Panelde ara" });
    await u.type(box, "bildirim");
    const list = screen.getByRole("listbox");
    expect(within(list).getAllByRole("option")[0]).toHaveTextContent("Bildirimler");
    await u.keyboard("{Enter}");
    expect(screen.getByTestId("where")).toHaveTextContent("/settings/notifications");
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("searches products, orders and customers live and opens the picked order", async () => {
    const api = mockApi({
      "GET /api/admin/products": () => ({ page: 1, pageSize: 5, total: 1, items: [{ id: "p1", nameTr: "Seramik Vazo", status: "active", variants: [{ sku: "VAZ-1" }], images: [] }] }),
      "GET /api/admin/orders": () => ({ page: 1, pageSize: 5, total: 1, items: [{ id: "o1", number: "WEB-1042", status: "paid", source: "website", total: 129900, currency: "TRY", createdAt: 1767000000, customerName: "Ayşe Kaya" }] }),
      "GET /api/admin/customers": () => ({ page: 1, pageSize: 5, total: 1, items: [{ id: "c1", email: "ayse@example.com", name: "Ayşe", surname: "Kaya" }] }),
    });
    const u = userEvent.setup();
    renderRoutes({ "*": page() }, "/");
    await u.click(screen.getByRole("button", { name: /Ara/ }));
    await u.type(await screen.findByRole("combobox"), "ayse");
    expect(await screen.findByRole("option", { name: /#WEB-1042 · Ayşe Kaya/ })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Seramik Vazo/ })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /ayse@example.com/ })).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith(expect.stringMatching(/^\/api\/admin\/orders\?q=ayse&pageSize=5$/));
    await u.click(screen.getByRole("option", { name: /#WEB-1042/ }));
    await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent("/orders/o1"));
  });
});

import { describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Layout, NAV_GROUPS } from "../components/Layout";
import * as integrationsLib from "../lib/integrations";
import { translate } from "../i18n";
import { asRole, mockApi, renderRoutes, withSettings } from "./helpers";

const all = NAV_GROUPS.flatMap((g) => g.items);
const app = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");

describe("sidebar structure", () => {
  it("groups are in the intended order with the intended pages", () => {
    expect(NAV_GROUPS.map((g) => [g.id, g.items.map((i) => i.to)])).toEqual([
      ["home", ["/"]],
      ["sales", ["/orders", "/customers", "/invoices", "/coupons"]],
      ["catalog", ["/products", "/categories", "/storefront"]],
      ["communication", ["/campaigns", "/emails", "/sms"]],
      ["channels", ["/trendyol", "/geliver"]],
      ["integrations", ["/integrations", "/integration-events", "/mock-inbox"]],
      ["administration", ["/settings", "/security", "/data", "/audit", "/help"]],
    ]);
  });
  it("every page appears once, every nav target has a route, every top-level route is reachable from the menu", () => {
    const tos = all.map((i) => i.to);
    expect(new Set(tos).size).toBe(tos.length);
    const routes = [...app.matchAll(/<Route path="([a-z-]+)(?:\/\*)?"/g)].map((m) => `/${m[1]}`);
    for (const to of tos.filter((x) => x !== "/")) expect(routes, to).toContain(to);
    const hidden = new Set(["/login", "/setup", "/print"]); // pages that are not menu destinations
    const missing = [...new Set(routes)].filter((r) => !tos.includes(r) && !hidden.has(r) && !/^\/(print|login|setup)/.test(r));
    expect(missing).toEqual([]);
  });
  it("group titles and item labels exist in both languages", () => {
    for (const g of NAV_GROUPS) for (const k of [g.titleKey, ...g.items.map((i) => i.labelKey)]) if (k) for (const l of ["en", "tr"] as const) expect(translate(l, k), `${l} ${k}`).not.toBe(k);
  });
});

describe("sidebar rendering", () => {
  const render = (mock: boolean) => {
    asRole("owner"); withSettings(mock);
    vi.spyOn(integrationsLib, "useIntegrations").mockReturnValue({ data: [] } as never);
    mockApi({});
    return renderRoutes({ "/": <Layout /> }, "/");
  };
  it("shows the dashboard without a heading, then the titled groups; the mock inbox only in mock mode", () => {
    render(false);
    const nav = screen.getAllByRole("navigation").find((n) => n.querySelector("[data-nav-group]"))!;
    const groups = [...nav.querySelectorAll("[data-nav-group]")].map((g) => g.getAttribute("data-nav-group"));
    expect(groups).toEqual(["home", "sales", "catalog", "communication", "channels", "integrations", "administration"]);
    const home = nav.querySelector('[data-nav-group="home"]')!;
    expect(home.querySelector("p")).toBeNull(); // no heading for the dashboard
    expect(within(home as HTMLElement).getByRole("link")).toHaveAttribute("href", "/");
    expect(nav.querySelector('[data-nav-group="sales"] p')!.textContent).toMatch(/Sales|Satış/);
    expect(within(nav as HTMLElement).queryByRole("link", { name: /Mock inbox|Mock gelen/i })).toBeNull();
  });
  it("mock mode adds the mock inbox under integrations", () => {
    render(true);
    const g = document.querySelector('[data-nav-group="integrations"]') as HTMLElement;
    expect(within(g).getAllByRole("link")).toHaveLength(3);
  });
});

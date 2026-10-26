import { render } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { vi } from "vitest";
import type { ReactElement } from "react";
import { ToastProvider } from "../components/ui";
import * as settingsLib from "../lib/settings";
import * as auth from "../lib/auth";
import { api } from "../lib/api";

export const asRole = (role: string) => vi.spyOn(auth, "useAdmin").mockReturnValue({ id: "1", email: "a@b.c", name: "A", role, totpEnabled: true } as never);
export const withSettings = (mockMode = false, general: Record<string, unknown> = {}) => vi.spyOn(settingsLib, "useSettings").mockReturnValue({
  isPending: false, isError: false, data: { system: { mockMode }, general: { storeName: "Demo Store", currency: "TRY", pricesIncludeTax: true, defaultTaxRate: 20, address: "Store Street 1", contactPhone: "+90 212 000 00 00", taxId: "1111111111", ...general } },
} as never);

export function mockApi(routes: Record<string, (path: string, body?: unknown) => unknown>) {
  const run = (method: string) => async (path: string, body?: unknown) => {
    const hit = Object.entries(routes).filter(([k]) => { if (!k.startsWith(`${method} `)) return false; const p = k.slice(method.length + 1); const cur = path.split("?")[0]!; return p.endsWith("$") ? cur === p.slice(0, -1) : cur.startsWith(p); }).sort((a, b) => b[0].length - a[0].length)[0];
    if (!hit) throw new Error(`unmocked ${method} ${path}`);
    const out = hit[1](path, body);
    if (out instanceof Error) throw out;
    return out;
  };
  return { get: vi.spyOn(api, "get").mockImplementation(run("GET") as never), post: vi.spyOn(api, "post").mockImplementation(run("POST") as never), put: vi.spyOn(api, "put").mockImplementation(run("PUT") as never) };
}

export function renderRoutes(ui: Record<string, ReactElement>, initial: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}><ToastProvider><MemoryRouter initialEntries={[initial]}>
      <Routes>{Object.entries(ui).map(([p, el]) => <Route key={p} path={p} element={el} />)}<Route path="*" element={<p>other page</p>} /></Routes>
    </MemoryRouter></ToastProvider></QueryClientProvider>);
}

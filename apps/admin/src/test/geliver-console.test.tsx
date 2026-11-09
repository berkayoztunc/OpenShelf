import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { GeliverCallResult, GeliverCatalogResponse } from "@openshelf/shared";
import { GELIVER_OPERATIONS } from "../../../../packages/integrations/geliver/src/catalog";
import { mockApi, renderRoutes } from "./helpers";
import Geliver from "../pages/Geliver";

const cat = (mode: GeliverCatalogResponse["mode"] = "mock", extra: Partial<GeliverCatalogResponse> = {}): GeliverCatalogResponse =>
  ({ mode, test: true, senderAddressId: "SENDER-1", operations: GELIVER_OPERATIONS, ...extra });
const res = (id: string, body: unknown, o: Partial<GeliverCallResult> = {}): GeliverCallResult => ({
  ok: true, status: 200, durationMs: 7, mock: true, operationId: id, risk: GELIVER_OPERATIONS.find((x) => x.id === id)!.risk,
  request: { method: "GET", url: "https://api.geliver.io/api/v1/x", query: {} }, response: { body }, ...o,
});

type Call = { operationId: string; path?: Record<string, unknown>; query?: Record<string, unknown>; body?: any; confirm?: string };
function setup(handlers: Record<string, (c: Call) => GeliverCallResult>, mode: GeliverCatalogResponse["mode"] = "mock", extra: Partial<GeliverCatalogResponse> = {}) {
  const calls: Call[] = [];
  mockApi({
    "GET /api/admin/geliver/catalog": () => cat(mode, extra),
    "POST /api/admin/geliver/call": (_p, body) => { const c = body as Call; calls.push(c); const h = handlers[c.operationId]; return h ? h(c) : res(c.operationId, { result: true, data: [] }); },
  });
  return calls;
}
beforeEach(() => { sessionStorage.clear(); localStorage.clear(); });

describe("Geliver console", () => {
  it("shows the mock banner, and the disabled state without sending calls", async () => {
    setup({});
    const { unmount } = renderRoutes({ "/*": <Geliver /> }, "/");
    expect(await screen.findByTestId("gl-mode")).toHaveTextContent(/nothing is sent to geliver/i);
    unmount();
    const calls = setup({}, "disabled", { reason: "not_configured" });
    renderRoutes({ "/*": <Geliver /> }, "/");
    expect(await screen.findByTestId("gl-mode")).toHaveTextContent(/not configured/i);
    expect(screen.getByRole("link", { name: /configure geliver/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /test connection/i })).toBeDisabled();
    expect(calls).toHaveLength(0);
  });

  it("connection test reads the sender address and reports success", async () => {
    const calls = setup({ getAddress: () => res("getAddress", { result: true, data: { id: "SENDER-1" } }) });
    renderRoutes({ "/*": <Geliver /> }, "/");
    await userEvent.click(await screen.findByRole("button", { name: /test connection/i }));
    expect(await screen.findByTestId("gl-check")).toHaveTextContent(/connected/i);
    expect(calls[0]).toMatchObject({ operationId: "getAddress", path: { id: "SENDER-1" } });
  });

  it("connection test shows the Geliver error", async () => {
    setup({ getAddress: () => res("getAddress", {}, { ok: false, status: 401, error: { message: "invalid token" } }) });
    renderRoutes({ "/*": <Geliver /> }, "/");
    await userEvent.click(await screen.findByRole("button", { name: /test connection/i }));
    expect(await screen.findByTestId("gl-check")).toHaveTextContent(/HTTP 401.*invalid token/i);
  });

  it("price quote sends the parcel and lists offers", async () => {
    const calls = setup({ priceList: () => res("priceList", { result: true, priceList: [{ offers: [{ id: "o1", providerCode: "SURAT", providerServiceCode: "SURAT_STANDART", totalAmount: "101.50", currency: "TL" }] }] }) });
    renderRoutes({ "/*": <Geliver /> }, "/");
    await userEvent.click(await screen.findByRole("button", { name: /get offers/i }));
    const offers = await screen.findByTestId("gl-offers");
    expect(offers).toHaveTextContent("SURAT_STANDART"); expect(offers).toHaveTextContent("101.50");
    expect(calls[0]).toMatchObject({ operationId: "priceList", query: { paramType: "parcel", length: "10", weight: "1" } });
  });

  it("end-to-end test shipment: create -> accept -> label/tracking -> cancel", async () => {
    const calls = setup({
      createShipment: () => res("createShipment", { result: true, data: { id: "shp-1", offers: [{ id: "off-1", providerCode: "PTT", providerServiceCode: "PTT_STANDART", totalAmount: "80", currency: "TL" }] } }),
      acceptOffer: () => res("acceptOffer", { result: true, data: { shipment: { trackingNumber: "TRK123", labelURL: "https://example.invalid/l.pdf" } } }),
      getShipment: () => res("getShipment", { result: true, data: { trackingStatus: { trackingStatusCode: "TRANSIT" } } }),
      cancelShipment: () => res("cancelShipment", { result: true }),
    });
    renderRoutes({ "/*": <Geliver /> }, "/");
    await userEvent.click(await screen.findByRole("button", { name: /create test shipment/i }));
    const flow = await screen.findByTestId("gl-flow");
    expect(calls[0]!.body).toMatchObject({ test: true, senderAddressID: "SENDER-1" });
    await userEvent.click(await screen.findByRole("button", { name: /^accept$/i }));
    expect(await screen.findByTestId("gl-accepted")).toHaveTextContent("TRK123");
    expect(calls.find((c) => c.operationId === "acceptOffer")!.body).toEqual({ offerID: "off-1" });
    await userEvent.click(screen.getByRole("button", { name: /check tracking/i }));
    await waitFor(() => expect(flow).toHaveTextContent("TRANSIT"));
    await userEvent.click(screen.getByRole("button", { name: /cancel shipment/i }));
    expect(await screen.findByText(/shipment cancelled/i)).toBeInTheDocument();
  });

  it("live + test mode OFF: the end-to-end flow is blocked (never buys real labels)", async () => {
    setup({}, "live", { test: false });
    renderRoutes({ "/*": <Geliver /> }, "/");
    expect(await screen.findByText(/turn geliver test mode on/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /create test shipment/i })).toBeDisabled();
    expect(screen.getByTestId("gl-mode")).toHaveTextContent(/test mode is off/i);
  });

  it("live: write calls in the explorer ask for confirmation first and then send confirm", async () => {
    const calls = setup({ createWebhook: () => res("createWebhook", { result: true, data: { id: "w1" } }, { mock: false }) }, "live");
    renderRoutes({ "/*": <Geliver /> }, "/");
    await userEvent.click(await screen.findByRole("tab", { name: /api explorer/i }));
    await userEvent.selectOptions(await screen.findByLabelText(/^operation$/i), "createWebhook");
    await userEvent.click(screen.getByRole("button", { name: /send request/i }));
    expect(calls).toHaveLength(0); // nothing sent before confirming
    await userEvent.click(await screen.findByRole("button", { name: /yes, send it/i }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toMatchObject({ operationId: "createWebhook", confirm: "createWebhook" });
    expect(await screen.findByTestId("gl-response")).toHaveTextContent("HTTP 200");
  });

  it("explorer: path/query params and the body are sent; invalid JSON is rejected locally", async () => {
    const calls = setup({});
    renderRoutes({ "/*": <Geliver /> }, "/");
    await userEvent.click(await screen.findByRole("tab", { name: /api explorer/i }));
    const select = await screen.findByLabelText(/^operation$/i);
    await userEvent.selectOptions(select, "getShipment");
    fireEvent.change(screen.getByLabelText(/^id \(required\)/i), { target: { value: "abc" } });
    await userEvent.click(screen.getByRole("button", { name: /send request/i }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toMatchObject({ operationId: "getShipment", path: { id: "abc" } });
    await userEvent.selectOptions(select, "createWebhook");
    fireEvent.change(screen.getByLabelText(/request body/i), { target: { value: "{nope" } });
    await userEvent.click(screen.getByRole("button", { name: /send request/i }));
    expect(await screen.findByText(/not valid json/i)).toBeInTheDocument();
    expect(calls).toHaveLength(1);
  });
});

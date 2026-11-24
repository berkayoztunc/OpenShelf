import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ShipmentNew, { recipientIssues } from "../pages/ShipmentNew";
import Shipments from "../pages/Shipments";
import { asRole, mockApi, renderRoutes } from "./helpers";

const routes = { "/shipments/new": <ShipmentNew />, "/shipments": <Shipments /> };
const SOURCE = { source: "order", orderId: "o1", customerId: "c1", label: "OS-1 · Ayşe Yılmaz", detail: "Atatürk Cad. 1, Konak, İzmir",
  recipient: { name: "Ayşe", surname: "Yılmaz", phone: "5551112233", email: "ayse@example.com", line1: "Atatürk Cad. 1", city: "İzmir", district: "Konak" } };
const SHIP = { id: "ms1", reference: "MK-ABC234", status: "created", recipient: SOURCE.recipient, contents: "Hediye", note: null, customerId: "c1", orderId: "o1", weightKg: 0.5, desi: null,
  provider: "geliver", serviceId: "YURTICI_STD", carrier: "YURTICI", trackingNumber: null, trackingUrl: null, labelUrl: "https://labels.example/l.pdf", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), events: [] };

beforeEach(() => { asRole("owner"); });
afterEach(() => vi.restoreAllMocks());

describe("recipient checks", () => {
  it("needs name, phone, street and a listed province/district", () => {
    const ok = { name: "A", phone: "5551112233", line1: "Cad. 1", city: "İzmir", district: "Konak" };
    expect(recipientIssues(ok)).toEqual([]);
    expect(recipientIssues({ ...ok, city: "Izmir" })).toEqual(["city"]);
    expect(recipientIssues({ ...ok, district: "Moda" })).toEqual(["district"]);
    expect(recipientIssues({ ...ok, name: " ", phone: "1", email: "x" })).toEqual(["name", "phone", "email"]);
  });
});

describe("new shipment", () => {
  it("fills the address from an earlier order, loads offers and buys the label with the order link", async () => {
    const m = mockApi({
      "GET /api/admin/manual-shipments/recipients": () => ({ items: [SOURCE] }),
      "POST /api/admin/manual-shipments/quotes": () => ({ provider: "geliver", weightKg: 0.5, items: [{ carrier: "YURTICI", serviceId: "YURTICI_STD", price: 7500, currency: "TRY" }] }),
      "POST /api/admin/manual-shipments$": () => SHIP,
      "GET /api/admin/manual-shipments$": () => ({ items: [SHIP], total: 1, page: 1, pageSize: 20 }),
      "GET /api/admin/manual-shipments/ms1": () => SHIP,
    });
    const u = userEvent.setup(); renderRoutes(routes, "/shipments/new");
    await u.type(screen.getByRole("combobox", { name: /search a customer or order/i }), "ayse");
    await u.click(await screen.findByText("OS-1 · Ayşe Yılmaz"));
    expect(screen.getAllByLabelText(/^Address/)[0]).toHaveValue("Atatürk Cad. 1");
    await u.type(screen.getByLabelText(/^Contents/), "Hediye");
    await u.click(screen.getByRole("button", { name: "Load offers" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Buy label" })).toBeEnabled());
    await u.click(screen.getByRole("button", { name: "Buy label" }));
    await u.click(screen.getAllByRole("button", { name: "Buy label" }).at(-1)!);
    await waitFor(() => expect(m.post).toHaveBeenCalledWith("/api/admin/manual-shipments", expect.objectContaining({
      serviceId: "YURTICI_STD", contents: "Hediye", weightKg: 0.5, orderId: "o1", customerId: "c1",
      recipient: expect.objectContaining({ name: "Ayşe", surname: "Yılmaz", city: "İzmir", district: "Konak", line1: "Atatürk Cad. 1" }),
    })));
    // lands on the list with the new shipment open
    expect(await screen.findByRole("link", { name: "Open label" })).toHaveAttribute("href", "https://labels.example/l.pdf");
  });

  it("offers stay locked until the address is complete", async () => {
    mockApi({});
    renderRoutes(routes, "/shipments/new");
    expect(screen.getByRole("button", { name: "Load offers" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Buy label" })).toBeDisabled();
  });
});

import { describe, expect, it } from "vitest";
import type { OrderView } from "../api/types";
import { fbqCalls, freshTracking, gaEvents } from "../test/harness";

const EID = "11111111-2222-4333-8444-555555555555";
const order = (o: Partial<OrderView> = {}): OrderView => ({
  orderNumber: "OS-1001", status: "paid", currency: "TRY", total: 39980, purchaseEventId: EID,
  items: [{ variantId: "var_1", title: "Mug", quantity: 2, unitPrice: 19990 }], ...o,
});

describe("browser purchase", () => {
  it("fires once per order with the server-issued event_id, on both channels, and not on refresh", async () => {
    const t = await freshTracking();
    t.setConsent({ analytics: true, marketing: true });
    expect(t.trackPurchase(order())).toBe(true);
    expect(t.trackPurchase(order())).toBe(false);
    const ga = gaEvents().filter((e) => e[1] === "purchase");
    const fb = fbqCalls().filter((e) => e[1] === "Purchase");
    expect(ga).toHaveLength(1); expect(fb).toHaveLength(1);
    expect(ga[0]![2]).toMatchObject({ event_id: EID, transaction_id: "OS-1001", value: 399.8, currency: "TRY" });
    expect(fb[0]![3]).toEqual({ eventID: EID });
    // never mirrored to the API (server creates its own purchase)
    expect(t.fetchMock.mock.calls.some((c) => String(c[0]).endsWith("/api/store/track"))).toBe(false);
    expect(sessionStorage.getItem("os_purchase_OS-1001")).toBe("1");
  });

  it("survives a reload (sessionStorage guard) in a fresh module instance", async () => {
    const t1 = await freshTracking();
    t1.setConsent({ analytics: true, marketing: true });
    expect(t1.trackPurchase(order())).toBe(true);
    const guard = sessionStorage.getItem("os_purchase_OS-1001");
    const consent = localStorage.getItem("os_consent")!;
    const t2 = await freshTracking();
    sessionStorage.setItem("os_purchase_OS-1001", guard!); localStorage.setItem("os_consent", consent);
    expect(t2.trackPurchase(order())).toBe(false);
    expect(gaEvents().filter((e) => e[1] === "purchase")).toHaveLength(0);
  });

  it.each(["pending", "awaiting_payment", "cancelled", "refunded"] as const)("never fires for status %s", async (status) => {
    const t = await freshTracking();
    t.setConsent({ analytics: true, marketing: true });
    expect(t.trackPurchase(order({ status }))).toBe(false);
    expect(gaEvents().some((e) => e[1] === "purchase")).toBe(false);
  });

  it("needs purchaseEventId and consent; stays unguarded so it can fire after later consent", async () => {
    const t = await freshTracking();
    t.setConsent({ analytics: true, marketing: true });
    expect(t.trackPurchase(order({ purchaseEventId: null }))).toBe(false);
    const t2 = await freshTracking();
    expect(t2.trackPurchase(order())).toBe(false); // no consent
    expect(t2.scripts()).toEqual([]);
    t2.setConsent({ analytics: true, marketing: false });
    expect(t2.trackPurchase(order())).toBe(true);
  });
});

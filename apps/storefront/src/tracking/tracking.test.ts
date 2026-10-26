import { describe, expect, it } from "vitest";
import { fbqCalls, freshTracking, gaEvents } from "../test/harness";

const item = { id: "var_1", name: "Mug", price: 199.9, quantity: 2 };

describe("consent gating", () => {
  it("loads no script, fires nothing and makes no network call before consent", async () => {
    const t = await freshTracking();
    expect(t.track("page_view")).toBeNull();
    expect(t.track("add_to_cart", { currency: "TRY", value: 399.8, items: [item] })).toBeNull();
    expect(t.scripts()).toEqual([]);
    expect(t.fetchMock).not.toHaveBeenCalled();
    expect(gaEvents()).toHaveLength(0);
    expect((window as { fbq?: unknown }).fbq).toBeUndefined();
  });

  it("sets Consent Mode v2 defaults to denied without loading anything", async () => {
    await freshTracking();
    const dl = ((window as { dataLayer?: ArrayLike<unknown>[] }).dataLayer ?? []).map((a) => Array.from(a));
    const def = dl.find((a) => a[0] === "consent" && a[1] === "default");
    expect(def?.[2]).toMatchObject({ ad_storage: "denied", analytics_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" });
  });

  it("analytics consent loads GA4 only; marketing consent adds Meta Pixel", async () => {
    const t = await freshTracking();
    t.setConsent({ analytics: true, marketing: false });
    expect(t.scripts().some((s) => s.includes("googletagmanager.com/gtag/js?id=G-TEST123"))).toBe(true);
    expect(t.scripts().some((s) => s.includes("fbevents.js"))).toBe(false);
    t.track("view_item", { items: [item] });
    expect(gaEvents()).toHaveLength(1);
    expect(fbqCalls()).toHaveLength(0);

    t.setConsent({ analytics: true, marketing: true });
    expect(t.scripts().some((s) => s.includes("fbevents.js"))).toBe(true);
  });

  it("records the decision via POST /api/store/consent and marketing-only visitors send no GA event", async () => {
    const t = await freshTracking();
    t.setConsent({ analytics: false, marketing: true });
    const call = t.fetchMock.mock.calls.find((c) => String(c[0]).endsWith("/api/store/consent"));
    expect(call).toBeTruthy();
    expect(JSON.parse((call![1] as RequestInit).body as string)).toMatchObject({ analytics: false, marketing: true, policyVersion: t.POLICY_VERSION });
    t.track("add_to_cart", { items: [item] });
    expect(gaEvents()).toHaveLength(0);
    expect(fbqCalls()).toHaveLength(1);
  });

  it("revoking marketing stops Meta events", async () => {
    const t = await freshTracking();
    t.setConsent({ analytics: true, marketing: true });
    t.setConsent({ analytics: true, marketing: false });
    t.track("add_to_cart", { items: [item] });
    expect(fbqCalls()).toHaveLength(0);
    expect(gaEvents()).toHaveLength(1);
  });
});

describe("event_id sharing", () => {
  it("uses the same event_id for gtag, fbq and the server mirror", async () => {
    const t = await freshTracking();
    t.setConsent({ analytics: true, marketing: true });
    t.fetchMock.mockClear();
    const id = t.track("add_to_cart", { currency: "TRY", value: 399.8, items: [item] });
    expect(id).toMatch(/^[0-9a-f-]{36}$/);

    const ga = gaEvents().find((e) => e[1] === "add_to_cart")!;
    expect(ga[2].event_id).toBe(id);
    expect((ga[2].items as { item_id: string }[])[0]!.item_id).toBe("var_1");

    const fb = fbqCalls()[0]!;
    expect(fb[1]).toBe("AddToCart");
    expect(fb[3]).toEqual({ eventID: id });
    expect((fb[2] as { content_ids: string[] }).content_ids).toEqual(["var_1"]);

    const srv = t.fetchMock.mock.calls.find((c) => String(c[0]).endsWith("/api/store/track"))!;
    expect(JSON.parse((srv[1] as RequestInit).body as string).event.event_id).toBe(id);
  });

  it("dedupes per channel: granting marketing later never double-fires GA4", async () => {
    const t = await freshTracking();
    t.setConsent({ analytics: true, marketing: false });
    t.track("page_view", {}, { dedupeKey: "/a" });
    t.setConsent({ analytics: true, marketing: true });
    t.track("page_view", {}, { dedupeKey: "/a" });
    expect(gaEvents().filter((e) => e[1] === "page_view")).toHaveLength(1);
    expect(fbqCalls().filter((e) => e[1] === "PageView")).toHaveLength(1);
  });

  it("does not send events without a Meta mapping to the pixel (view_item_list is GA only)", async () => {
    const t = await freshTracking();
    t.setConsent({ analytics: true, marketing: true });
    t.track("view_item_list", { items: [item] });
    expect(gaEvents().some((e) => e[1] === "view_item_list")).toBe(true);
    expect(fbqCalls()).toHaveLength(0);
  });
});

describe("attribution", () => {
  it("is empty without marketing consent and populated with it", async () => {
    const t = await freshTracking();
    t.bufferLandingParams("?utm_source=ig&fbclid=abc&gclid=xyz");
    t.setConsent({ analytics: true, marketing: false });
    expect(t.getAttribution()).toEqual({});
    expect(localStorage.getItem("os_attr")).toBeNull();
    t.setConsent({ analytics: true, marketing: true });
    const a = t.getAttribution();
    expect(a).toMatchObject({ utm_source: "ig", fbclid: "abc", gclid: "xyz" });
    expect(a.fbc).toMatch(/^fb\.1\.\d+\.abc$/);
    expect(a.visitorId).toBeTruthy();
  });
});

import { env } from "cloudflare:test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { remoteVariants, suggestMatches, type LocalVariant } from "@openshelf/shared";
import { clearSettingsCache } from "../src/lib/settings";
import { admin, ensureOwner, j, loginAs, type Session } from "./helpers";

const local = (o: Partial<LocalVariant> & { variantId: string }): LocalVariant => ({ sku: o.variantId.toUpperCase(), barcode: null, label: o.variantId, mappedBarcode: null, ...o });
const approved = [{ title: "Neon Pop", productMainId: "M1", variants: [{ barcode: "111", stockCode: "A-1" }, { barcode: "222", stockCode: "" }] }];
const unapproved = [
  { barcode: "333", stockCode: "", title: "Wait", status: "pendingApproval", productMainId: "M2" },
  { barcode: "444", stockCode: "", title: "Bad", status: "rejected", rejectReasonDetails: [{ rejectReason: "Görselde Yasaklı Kelime" }] },
];

describe("suggestMatches (pure)", () => {
  const remote = remoteVariants(approved, unapproved);
  it("flattens approved variants and flags pending / rejected with the reason", () => {
    expect(remote.map((r) => [r.barcode, r.status])).toEqual([["111", "approved"], ["222", "approved"], ["333", "pending"], ["444", "rejected"]]);
    expect(remote[3]!.rejectReason).toBe("Görselde Yasaklı Kelime");
  });
  it("barcode first, then SKU = stock code; mapped variants are never suggested again", () => {
    const r = suggestMatches(remote, [
      local({ variantId: "v1", barcode: "222" }), local({ variantId: "v2", sku: "A-1" }), local({ variantId: "v3", barcode: "999" }),
      local({ variantId: "v4", mappedBarcode: "333" }),
    ]);
    expect(r.suggestions.map((s) => [s.variantId, s.barcode, s.by])).toEqual([["v1", "222", "barcode"], ["v2", "111", "sku"]]);
    expect(r.unmatchedLocal.map((x) => x.variantId)).toEqual(["v3"]);
    expect(r.unmatchedRemote.map((x) => x.barcode)).toEqual(["444"]);
  });
  it("two local variants for one barcode is a conflict, never a suggestion; a mapping to an unknown barcode is stale", () => {
    const r = suggestMatches(remote, [local({ variantId: "a", barcode: "111" }), local({ variantId: "b", barcode: "111" }), local({ variantId: "c", mappedBarcode: "000" })]);
    expect(r.suggestions).toEqual([]);
    expect(r.conflicts).toEqual([{ barcode: "111", variantIds: ["a", "b"] }]);
    expect(r.staleMappings.map((x) => x.variantId)).toEqual(["c"]);
    expect(r.unmatchedRemote.map((x) => x.barcode)).not.toContain("111");
  });
});

let owner: Session; let staff: Session;
const setMock = (on: boolean) => env.DB.prepare(`INSERT INTO store_settings ("group", value, updated_at) VALUES ('system', ?1, unixepoch()) ON CONFLICT("group") DO UPDATE SET value = ?1`).bind(JSON.stringify({ mockMode: on })).run().then(() => clearSettingsCache());
beforeAll(async () => {
  owner = await ensureOwner();
  const email = `staff-tymatch-${Date.now()}@example.com`;
  expect((await admin(owner, "/users", "POST", { email, name: "S", password: "staff password 12345", role: "staff" })).status).toBe(201);
  staff = await loginAs(email, "staff password 12345");
  await setMock(true);
});
afterAll(async () => { await setMock(false); });

describe("GET /trendyol/match-suggestions", () => {
  it("is admin only", async () => { expect((await admin(staff, "/trendyol/match-suggestions")).status).toBe(403); });
  it("answers the report shape in mock mode and writes nothing", async () => {
    const before = await env.DB.prepare("SELECT COUNT(*) n FROM product_mappings").first<{ n: number }>();
    const r = await admin(owner, "/trendyol/match-suggestions");
    expect(r.status).toBe(200);
    const b = await j<any>(r);
    for (const k of ["suggestions", "unmatchedRemote", "unmatchedLocal", "staleMappings", "conflicts"]) expect(Array.isArray(b[k])).toBe(true);
    expect(b.counts.remote).toBeGreaterThanOrEqual(0);
    expect((await env.DB.prepare("SELECT COUNT(*) n FROM product_mappings").first<{ n: number }>())!.n).toBe(before!.n);
  });
});

import { describe, expect, it, vi } from "vitest";
import { relayFetch } from "../src/index";

describe("relayFetch", () => {
  const mk = () => vi.fn(async (_u: string, _i?: RequestInit) => new Response("ok"));
  it("relays gateway hosts with the secret", async () => {
    const inner = mk();
    const f = relayFetch("https://r.example.com/", "s3", inner as never);
    await f("https://apigateway.trendyolecozum.com/api/auth/signin?x=1", { method: "POST", headers: { "Content-Type": "application/json" } });
    await f("https://stage-apigateway.trendyolefaturam.com/a");
    expect(inner.mock.calls[0]![0]).toBe("https://r.example.com/prod/api/auth/signin?x=1");
    expect(new Headers(inner.mock.calls[0]![1]!.headers).get("x-relay-secret")).toBe("s3");
    expect(new Headers(inner.mock.calls[0]![1]!.headers).get("content-type")).toBe("application/json");
    expect(inner.mock.calls[1]![0]).toBe("https://r.example.com/stage/a");
  });
  it("goes direct when no relay, and never relays other hosts", async () => {
    const inner = mk();
    expect(relayFetch(undefined, "s", inner as never)).toBe(inner);
    await relayFetch("https://r.example.com", "s", inner as never)("https://other.example.com/x");
    expect(inner.mock.calls[0]![0]).toBe("https://other.example.com/x");
  });
});

describe("useRelay switch", () => {
  it("is on by default and parses off", async () => {
    const { configSchema } = await import("../src/index");
    const base = { baseUrl: "https://apigateway.trendyolecozum.com", relayUrl: "https://r.example.com" };
    expect(configSchema.shape.config.parse(base).useRelay).toBe(true);
    expect(configSchema.shape.config.parse({ ...base, useRelay: false }).useRelay).toBe(false);
  });
});

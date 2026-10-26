import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8"); // vitest runs from the package dir

describe("storefront _headers (CSP)", () => {
  const h = read("public/_headers");
  it("sets the security headers and allows only the intended third parties", () => {
    expect(h).toContain("frame-ancestors 'self'");
    expect(h).toContain("X-Content-Type-Options: nosniff");
    expect(h).toContain("Referrer-Policy: no-referrer");
    expect(h).toContain("Strict-Transport-Security");
    for (const d of ["googletagmanager.com", "google-analytics.com", "connect.facebook.net", "challenges.cloudflare.com", "iyzipay.com"]) expect(h).toContain(d);
    expect(h).toContain("img-src 'self' data: https:");
    expect(h).toMatch(/frame-src https:\/\/challenges\.cloudflare\.com/);
  });
  it("whitelists the inline theme bootstrap script by hash (kept in sync with index.html)", () => {
    const m = /<script>([\s\S]*?)<\/script>/.exec(read("index.html"));
    const hash = createHash("sha256").update(m![1]!).digest("base64");
    expect(h).toContain(`'sha256-${hash}'`);
  });
  it("iyzico iframe sandbox does not allow unrestricted top navigation", () => {
    const src = read("src/pages/Checkout.tsx");
    expect(src).toContain("allow-top-navigation-by-user-activation");
    expect(src).not.toMatch(/allow-top-navigation[^-]/);
  });
});

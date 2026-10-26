import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..");
const PUBLIC_HELP = join(ROOT, "public", "help");
const NAMES = ["login", "dashboard", "products-list", "product-edit", "product-seo", "categories", "coupons", "customers", "orders-list", "order-detail", "order-print-label", "order-print-invoice", "invoices-list", "invoice-editor", "emails-compose", "emails-sent", "integrations-hub", "integration-drawer", "integration-events", "mock-inbox", "settings-general", "settings-branding", "settings-seo", "settings-legal", "settings-checkout", "settings-tracking", "settings-notifications", "settings-system", "security", "audit", "data", "help-page", "trendyol-products", "trendyol-wizard", "trendyol-orders", "trendyol-returns", "trendyol-questions", "trendyol-finance", "trendyol-explorer"];
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function assertPng(file: string) {
  expect(existsSync(file), `${file} missing`).toBe(true);
  expect(statSync(file).size, `${file} empty`).toBeGreaterThan(1000);
  const head = readFileSync(file).subarray(0, 8);
  expect([...head]).toEqual(PNG_MAGIC);
}

describe.each(["tr", "en"] as const)("help screenshots (%s)", (locale) => {
  it("every image referenced in the guide markdown exists and is a PNG", () => {
    const dir = join(ROOT, "src", "help", locale);
    const refs = new Set<string>();
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".md"))) {
      for (const m of readFileSync(join(dir, f), "utf8").matchAll(new RegExp(`help/${locale}/([A-Za-z0-9_-]+\\.png)`, "g"))) refs.add(m[1]!);
    }
    for (const name of refs) assertPng(join(PUBLIC_HELP, locale, name));
  });
  it("has all expected screenshot names", () => {
    for (const n of NAMES) assertPng(join(PUBLIC_HELP, locale, `${n}.png`));
  });
});

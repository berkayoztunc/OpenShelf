// Manifest of help screenshots. Fields: name, path (under /admin; string or fn(ctx)), anon, viewport,
// wait (selector), run(page, ctx), element (selector), full, maxHeight.
export const EMAIL = "admin@openshelf.local";
export const PASSWORD = "openshelf-demo-2026";

/** Looks up demo record ids through the admin API (session cookie from the logged-in page). */
export async function discover(page, base) {
  const get = async (u) => (await page.request.get(`${base}/api/admin/${u}`)).json();
  const orders = (await get("orders?pageSize=50")).items;
  const order = orders.find((o) => o.number === "DEMO-1001") ?? orders[0];
  const inv = (await get("manual-invoices")).items.find((i) => i.status === "issued") ?? (await get("manual-invoices")).items[0];
  const prod = (await get("products?pageSize=5")).items[0];
  return { orderId: order.id, invoiceId: inv?.id, productId: prod.id };
}


export const SHOTS = [
  { name: "login", path: "/login", anon: true, wait: 'input[type="password"]' },
  { name: "dashboard", full: true, maxHeight: 1000, path: "/" },
  { name: "products-list", full: true, maxHeight: 1000, path: "/products" },
  { name: "product-edit", full: true, maxHeight: 1000, path: (c) => `/products/${c.productId}`, wait: 'input' },
  { name: "product-seo", maxHeight: 1400, path: (c) => `/products/${c.productId}`, element: '[data-testid="product-seo-card"]' },
  { name: "categories", full: true, maxHeight: 1000, path: "/categories" },
  { name: "coupons", full: true, maxHeight: 1000, path: "/coupons" },
  { name: "customers", full: true, maxHeight: 1000, path: "/customers" },
  { name: "orders-list", full: true, maxHeight: 1000, path: "/orders" },
  { name: "order-detail", full: true, maxHeight: 1000, path: (c) => `/orders/${c.orderId}` },
  { name: "order-print-label", path: (c) => `/print/label?ids=${c.orderId}`, viewport: { width: 900, height: 1200 }, wait: "svg[role=img]" },
  { name: "order-print-invoice", path: (c) => `/print/invoice?ids=${c.orderId}`, viewport: { width: 900, height: 1200 } },
  { name: "invoices-list", full: true, maxHeight: 1000, path: "/invoices" },
  { name: "invoice-editor", full: true, maxHeight: 1000, path: (c) => `/invoices/${c.invoiceId}` },
  { name: "emails-compose", full: true, maxHeight: 1000, path: "/emails/compose", run: async (p, c) => {
    const tr = c.locale === "tr";
    await p.locator("main input").first().fill("elif.yilmaz@example.com");
    await p.locator('input[maxlength="200"]').fill(tr ? "Siparişiniz hakkında" : "About your order");
    await p.locator("#compose-body").fill(tr ? "Merhaba Elif Hanım,\n\nSiparişiniz hazırlanıyor, yarın kargoya vereceğiz.\n\nTeşekkürler!" : "Hello Elif,\n\nYour order is being prepared and will ship tomorrow.\n\nThank you!");
    await p.locator("#compose-body").click(); await p.keyboard.press("Escape"); await p.waitForTimeout(900);
  } },
  { name: "emails-sent", full: true, maxHeight: 1000, path: "/emails" },
  { name: "integrations-hub", full: true, maxHeight: 1000, path: "/integrations" },
  { name: "integration-drawer", path: "/integrations?configure=iyzico", wait: "dialog[open]" },
  { name: "integration-events", full: true, maxHeight: 1000, path: "/integration-events" },
  { name: "mock-inbox", full: true, maxHeight: 1000, path: "/mock-inbox" },
  { name: "settings-general", full: true, maxHeight: 1000, path: "/settings/general" },
  { name: "settings-branding", full: true, maxHeight: 1000, path: "/settings/branding" },
  { name: "settings-seo", full: true, maxHeight: 1000, path: "/settings/seo" },
  { name: "settings-legal", full: true, maxHeight: 1000, path: "/settings/legal", run: async (p, c) => { await p.getByRole("button", { name: c.locale === "tr" ? /Türkçe şablon/ : /Insert TR template/ }).click(); await p.waitForTimeout(500); } },
  { name: "settings-checkout", full: true, maxHeight: 1000, path: "/settings/checkout" },
  { name: "settings-tracking", full: true, maxHeight: 1000, path: "/settings/tracking" },
  { name: "settings-notifications", full: true, maxHeight: 1000, path: "/settings/notifications" },
  { name: "settings-system", full: true, maxHeight: 1000, path: "/settings/system" },
  { name: "security", full: true, maxHeight: 1000, path: "/security" },
  { name: "audit", full: true, maxHeight: 1000, path: "/audit" },
  { name: "data", full: true, maxHeight: 1000, path: "/data" },
  { name: "help-page", full: true, maxHeight: 1000, path: "/help" },
];

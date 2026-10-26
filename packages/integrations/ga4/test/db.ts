import { createRequire } from "node:module";
import type { DatabaseSync as DatabaseSyncT } from "node:sqlite";
// vite-node cannot resolve node:sqlite as an import; load via require.
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
type DatabaseSync = DatabaseSyncT;
import { drizzle } from "drizzle-orm/sqlite-proxy";
import * as schema from "@openshelf/db";

const DDL = `
CREATE TABLE orders (id TEXT PRIMARY KEY, number TEXT NOT NULL UNIQUE, source TEXT NOT NULL DEFAULT 'website', external_order_id TEXT,
 status TEXT NOT NULL DEFAULT 'pending', customer_id TEXT, email TEXT NOT NULL, shipping_address TEXT NOT NULL, billing_address TEXT,
 currency TEXT NOT NULL DEFAULT 'TRY', subtotal INTEGER NOT NULL, discount_total INTEGER NOT NULL DEFAULT 0, shipping_total INTEGER NOT NULL DEFAULT 0,
 tax_total INTEGER NOT NULL DEFAULT 0, total INTEGER NOT NULL, coupon_code TEXT, tracking_token TEXT NOT NULL, consent TEXT, attribution TEXT,
 client_ip TEXT, user_agent TEXT, notes TEXT, created_at INTEGER NOT NULL DEFAULT (unixepoch()), updated_at INTEGER NOT NULL DEFAULT (unixepoch()));
CREATE UNIQUE INDEX orders_source_ext_u ON orders (source, external_order_id);
CREATE TABLE order_items (id TEXT PRIMARY KEY, order_id TEXT NOT NULL, variant_id TEXT, sku TEXT NOT NULL, name TEXT NOT NULL,
 quantity INTEGER NOT NULL, unit_price INTEGER NOT NULL, tax_rate INTEGER NOT NULL DEFAULT 0);
CREATE TABLE marketing_events (id INTEGER PRIMARY KEY AUTOINCREMENT, event_id TEXT NOT NULL, name TEXT NOT NULL, destination TEXT NOT NULL,
 order_id TEXT, status TEXT NOT NULL, detail TEXT, created_at INTEGER NOT NULL DEFAULT (unixepoch()));
CREATE UNIQUE INDEX marketing_events_u ON marketing_events (event_id, name, destination);
`;

/** Real drizzle (sqlite-proxy) over node:sqlite in memory. */
export function makeDb() {
  const raw = new DatabaseSync(":memory:");
  raw.exec(DDL);
  const db = drizzle(async (sql, params, method) => {
    const stmt = raw.prepare(sql);
    if (method === "run") { stmt.run(...(params as any[])); return { rows: [] }; }
    stmt.setReturnArrays(true);
    if (method === "get") { const r = stmt.get(...(params as any[])) as any; return { rows: r ?? [] } as any; }
    return { rows: stmt.all(...(params as any[])) as any[] };
  }, { schema });
  return { db, raw };
}

export function seedOrder(raw: DatabaseSync, o: { id?: string; consent?: any } = {}) {
  const id = o.id ?? "ord_1";
  raw.prepare(`INSERT INTO orders (id, number, email, shipping_address, subtotal, total, tracking_token, consent, attribution, client_ip, user_agent, currency)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    id, "OS-1001", "Test@Example.com", JSON.stringify({ phone: "0532 123 45 67" }), 19990, 19990, "tok",
    JSON.stringify(o.consent ?? { necessary: true, analytics: true, marketing: true }),
    JSON.stringify({ fbc: "fb.1.1.abc", fbp: "fb.1.2.def", gaClientId: "123.456", sourceUrl: "https://shop.example/checkout" }),
    "1.2.3.4", "UA/1.0", "TRY");
  raw.prepare(`INSERT INTO order_items (id, order_id, variant_id, sku, name, quantity, unit_price) VALUES ('oi1',?, 'var_1','SKU1','Kupa',2,9995)`).run(id);
}

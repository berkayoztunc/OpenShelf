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
CREATE TABLE product_variants (id TEXT PRIMARY KEY, product_id TEXT NOT NULL, sku TEXT NOT NULL UNIQUE, barcode TEXT, title TEXT, options TEXT, weight_grams INTEGER, position INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE inventory (variant_id TEXT PRIMARY KEY, total INTEGER NOT NULL DEFAULT 0, reserved INTEGER NOT NULL DEFAULT 0, safety_stock INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL DEFAULT (unixepoch()));
CREATE TABLE inventory_movements (id INTEGER PRIMARY KEY AUTOINCREMENT, variant_id TEXT NOT NULL, delta INTEGER NOT NULL, reason TEXT NOT NULL, ref_type TEXT, ref_id TEXT, created_at INTEGER NOT NULL DEFAULT (unixepoch()));
CREATE TABLE channel_prices (variant_id TEXT NOT NULL, channel TEXT NOT NULL, price INTEGER NOT NULL, compare_at_price INTEGER, currency TEXT NOT NULL DEFAULT 'TRY', PRIMARY KEY (variant_id, channel));
CREATE TABLE channel_listings (variant_id TEXT NOT NULL, channel TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1, external_id TEXT, last_synced_stock INTEGER, last_synced_at INTEGER, last_error TEXT, PRIMARY KEY (variant_id, channel));
CREATE TABLE product_mappings (id TEXT PRIMARY KEY, variant_id TEXT NOT NULL, provider TEXT NOT NULL, external_sku TEXT, external_barcode TEXT, external_id TEXT);
CREATE TABLE sync_cursors (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL DEFAULT (unixepoch()));
CREATE UNIQUE INDEX marketing_events_u ON marketing_events (event_id, name, destination);
`;

/** Real drizzle (sqlite-proxy) over node:sqlite in memory. */
export function makeDb() {
  const raw = new DatabaseSync(":memory:");
  raw.exec(DDL);
  const exec = async (sql: string, params: unknown[], method: string) => {
    const stmt = raw.prepare(sql);
    if (method === "run") { stmt.run(...(params as any[])); return { rows: [] }; }
    stmt.setReturnArrays(true);
    if (method === "get") { const r = stmt.get(...(params as any[])) as any; return { rows: r ?? [] } as any; }
    return { rows: stmt.all(...(params as any[])) as any[] };
  };
  // batch = one transaction (like D1): any failing statement rolls everything back
  const batch = async (qs: { sql: string; params: unknown[]; method: string }[]) => {
    raw.exec("BEGIN");
    try { const out = []; for (const q of qs) out.push(await exec(q.sql, q.params, q.method)); raw.exec("COMMIT"); return out; }
    catch (e) { raw.exec("ROLLBACK"); throw e; }
  };
  const db = drizzle(exec, batch as any, { schema });
  return { db, raw };
}

export function seedVariants(raw: DatabaseSync, n = 3) {
  for (let i = 1; i <= n; i++) {
    raw.prepare("INSERT INTO product_variants (id, product_id, sku, barcode) VALUES (?,?,?,?)").run(`v${i}`, "p1", `SKU${i}`, `BC${i}`);
    raw.prepare("INSERT INTO inventory (variant_id, total, reserved, safety_stock) VALUES (?,?,?,?)").run(`v${i}`, 10 * i, i, 1);
    raw.prepare("INSERT INTO channel_prices (variant_id, channel, price) VALUES (?,?,?)").run(`v${i}`, "trendyol", 10000 * i + 990);
    raw.prepare("INSERT INTO channel_listings (variant_id, channel, enabled) VALUES (?,?,1)").run(`v${i}`, "trendyol");
  }
}

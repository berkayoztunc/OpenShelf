#!/usr/bin/env node
/**
 * Generates orders.sql: demo customers + orders in every status (with items, payments, shipments, invoices,
 * notification history) so the admin order screens, printing and refunds can be inspected.
 *
 * Additive and re-runnable: every row uses a `demo_` id and INSERT OR REPLACE, so only demo rows are touched.
 * Variants/prices are read from seed.sql, so run it after the catalog seed exists.
 *
 *   node generate-orders.mjs            # writes orders.sql
 *   node generate-orders.mjs --check    # validate only
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const seed = readFileSync(join(here, "seed.sql"), "utf8");

// ---- catalog lookup parsed from seed.sql ----
const productNames = new Map();
for (const m of seed.matchAll(/INSERT OR REPLACE INTO products \(([^)]*)\) VALUES \((.*)\);/g)) {
  const cols = m[1].split(",").map((c) => c.trim());
  const vals = [...m[2].matchAll(/'((?:[^']|'')*)'|(NULL|\d+)/g)].map((x) => (x[1] ?? x[2]).replace(/''/g, "'"));
  const row = Object.fromEntries(cols.map((c, i) => [c, vals[i]]));
  productNames.set(row.id, row.name_tr);
}
const prices = new Map();
for (const m of seed.matchAll(/INSERT OR REPLACE INTO channel_prices \(.*?\) VALUES \('([^']+)', 'website', (\d+)/g)) prices.set(m[1], Number(m[2]));
const variants = [];
for (const m of seed.matchAll(/INSERT OR REPLACE INTO product_variants \(.*?\) VALUES \('([^']+)', '([^']+)', '([^']+)', (?:'((?:[^']|'')*)'|NULL)/g)) {
  const [, id, productId, sku, title] = m;
  if (prices.has(id)) variants.push({ id, sku, name: `${productNames.get(productId) ?? sku}${title ? ` – ${title.replace(/''/g, "'")}` : ""}`, price: prices.get(id) });
}
if (variants.length < 6) throw new Error(`seed.sql has only ${variants.length} priced variants; run the catalog seed generator first`);
const v = (i) => variants[i % variants.length];

// ---- helpers ----
const q = (s) => (s == null ? "NULL" : `'${String(s).replace(/'/g, "''")}'`);
const json = (o) => q(JSON.stringify(o));
const day = (n, hour = 0) => `(unixepoch() - ${Math.round(n * 86400 + hour * 3600)})`;
const TAX = 20;
const taxOf = (gross) => gross - Math.round(gross / (1 + TAX / 100));

const customers = [
  { id: "demo_cus_1", name: "Elif", surname: "Yılmaz", email: "elif.yilmaz@example.com", phone: "+905551112233",
    addr: { name: "Elif Yılmaz", phone: "+905551112233", line1: "Moda Cad. No:14 D:6", line2: null, city: "İstanbul", district: "Kadıköy", zip: "34710", country: "TR" } },
  { id: "demo_cus_2", name: "Mehmet", surname: "Demir", email: "mehmet.demir@example.com", phone: "+905552223344",
    addr: { name: "Mehmet Demir", phone: "+905552223344", line1: "Atatürk Bulvarı 120/3", line2: null, city: "Ankara", district: "Çankaya", zip: "06680", country: "TR" } },
  { id: "demo_cus_3", name: "Zeynep", surname: "Kaya", email: "zeynep.kaya@example.com", phone: "+905553334455",
    addr: { name: "Zeynep Kaya", phone: "+905553334455", line1: "Alsancak Mah. 1471 Sk. No:5", line2: "Kat 2", city: "İzmir", district: "Konak", zip: "35220", country: "TR" } },
  { id: "demo_cus_4", name: "Atlas", surname: "Mobilya Ltd. Şti.", email: "muhasebe@atlasmobilya.example", phone: "+902125550101", company: true,
    addr: { name: "Atlas Mobilya Ltd. Şti.", phone: "+902125550101", line1: "Organize Sanayi Bölgesi 3. Cad. No:22", line2: null, city: "İstanbul", district: "Esenyurt", zip: "34510", country: "TR", taxId: "1234567890", taxOffice: "Esenyurt VD", isCompany: true } },
];
const cus = (id) => customers.find((c) => c.id === id);

// status: pending|awaiting_payment|paid|fulfilling|shipped|delivered|cancelled|refunded
const defs = [
  { n: "DEMO-1001", st: "paid", cus: "demo_cus_1", age: 0.3, items: [[0, 1], [3, 2]], ship: 0, pay: "succeeded" },
  { n: "DEMO-1002", st: "fulfilling", cus: "demo_cus_2", age: 1.2, items: [[1, 1]], ship: 4990, pay: "succeeded", inv: "e_arsiv", invNo: "OSH2026000000001", coupon: "HOSGELDIN10", disc: 0.1 },
  { n: "DEMO-1003", st: "shipped", cus: "demo_cus_3", age: 3, items: [[2, 2], [5, 1]], ship: 0, pay: "succeeded", inv: "e_arsiv", invNo: "OSH2026000000002", shipment: { carrier: "Yurtiçi Kargo", tn: "YK7845120033", status: "in_transit" } },
  { n: "DEMO-1004", st: "delivered", cus: "demo_cus_4", age: 7, items: [[4, 3], [6, 2], [7, 1]], ship: 0, pay: "succeeded", inv: "e_fatura", invNo: "OSF2026000000001", shipment: { carrier: "Aras Kargo", tn: "ARS5521098817", status: "delivered" }, notes: "Kurumsal sipariş — fatura VKN ile kesilecek." },
  { n: "DEMO-1005", st: "awaiting_payment", cus: "demo_cus_1", age: 0.05, items: [[8, 1]], ship: 4990, pay: "pending" },
  { n: "DEMO-1006", st: "cancelled", cus: "demo_cus_2", age: 5, items: [[9, 1]], ship: 4990, pay: "failed" },
  { n: "DEMO-1007", st: "refunded", cus: "demo_cus_3", age: 9, items: [[10, 1], [11, 1]], ship: 0, pay: "refunded", inv: "e_arsiv", invNo: "OSH2026000000003", refund: true, shipment: { carrier: "MNG Kargo", tn: "MNG9930021450", status: "returned" } },
  { n: "TY-DEMO-5001", st: "paid", cus: "demo_cus_2", age: 2, source: "trendyol", ext: "5001234567", items: [[0, 1], [1, 1]], ship: 0, pay: "succeeded", notes: "Trendyol siparişi (örnek)" },
];

const out = [`-- Generated by generate-orders.mjs — demo orders for local inspection. Safe to re-run (demo_ ids only).`];
for (const c of customers) {
  out.push(`INSERT OR REPLACE INTO customers (id, email, name, surname, phone, created_at) VALUES (${q(c.id)}, ${q(c.email)}, ${q(c.name)}, ${q(c.surname)}, ${q(c.phone)}, ${day(30)});`);
  out.push(`INSERT OR REPLACE INTO addresses (id, customer_id, name, phone, line1, line2, city, district, zip, country, tax_id, tax_office, is_company) VALUES (${q(`demo_adr_${c.id}`)}, ${q(c.id)}, ${q(c.addr.name)}, ${q(c.phone)}, ${q(c.addr.line1)}, ${q(c.addr.line2)}, ${q(c.addr.city)}, ${q(c.addr.district)}, ${q(c.addr.zip)}, 'TR', ${q(c.addr.taxId)}, ${q(c.addr.taxOffice)}, ${c.company ? 1 : 0});`);
}

let paidCount = 0;
for (const d of defs) {
  const c = cus(d.cus);
  const id = `demo_ord_${d.n.toLowerCase()}`;
  const lines = d.items.map(([i, qty]) => ({ ...v(i), qty }));
  const subtotal = lines.reduce((s, l) => s + l.price * l.qty, 0);
  const discount = d.disc ? Math.round(subtotal * d.disc) : 0;
  const total = subtotal - discount + d.ship;
  const ship = { ...c.addr }; delete ship.isCompany; delete ship.taxId; delete ship.taxOffice;
  const bill = c.company ? { ...c.addr } : { ...ship };
  const consent = { analytics: true, marketing: d.n.endsWith("1001") || d.n.endsWith("1003") };
  const attribution = d.source ? null : { utm_source: ["instagram", "google", "newsletter"][paidCount % 3], utm_medium: "social", utm_campaign: "demo-launch" };
  paidCount++;
  out.push(`INSERT OR REPLACE INTO orders (id, number, source, external_order_id, status, customer_id, email, shipping_address, billing_address, currency, subtotal, discount_total, shipping_total, tax_total, total, coupon_code, tracking_token, consent, attribution, client_ip, user_agent, notes, created_at, updated_at) VALUES (${q(id)}, ${q(d.n)}, ${q(d.source ?? "website")}, ${q(d.ext ?? null)}, ${q(d.st)}, ${q(c.id)}, ${q(c.email)}, ${json(ship)}, ${json(bill)}, 'TRY', ${subtotal}, ${discount}, ${d.ship}, ${taxOf(total)}, ${total}, ${q(d.coupon ?? null)}, ${q(`demo-track-${d.n.toLowerCase()}`)}, ${json(consent)}, ${attribution ? json(attribution) : "NULL"}, '203.0.113.7', 'Mozilla/5.0 (demo)', ${q(d.notes ?? null)}, ${day(d.age)}, ${day(Math.max(d.age - 0.1, 0))});`);
  lines.forEach((l, k) => out.push(`INSERT OR REPLACE INTO order_items (id, order_id, variant_id, sku, name, quantity, unit_price, tax_rate) VALUES (${q(`${id}_i${k}`)}, ${q(id)}, ${q(l.id)}, ${q(l.sku)}, ${q(l.name)}, ${l.qty}, ${l.price}, ${TAX});`));
  const payId = `${id}_pay`;
  out.push(`INSERT OR REPLACE INTO payments (id, order_id, provider, provider_tx_id, provider_token, status, amount, currency, created_at, updated_at) VALUES (${q(payId)}, ${q(id)}, ${q(d.source ? "trendyol" : "iyzico")}, ${q(d.pay === "pending" ? null : `demo_tx_${d.n.toLowerCase()}`)}, ${q(`demo_tok_${d.n.toLowerCase()}`)}, ${q(d.pay)}, ${total}, 'TRY', ${day(d.age)}, ${day(Math.max(d.age - 0.05, 0))});`);
  if (d.refund) out.push(`INSERT OR REPLACE INTO refunds (id, payment_id, order_id, amount, reason, status, provider_refund_id, created_by, created_at) VALUES (${q(`${id}_ref`)}, ${q(payId)}, ${q(id)}, ${total}, 'Müşteri iadesi (örnek)', 'succeeded', 'demo_refund_1', 'seed', ${day(d.age - 3)});`);
  if (d.shipment) out.push(`INSERT OR REPLACE INTO shipments (id, order_id, provider, provider_shipment_id, carrier, tracking_number, label_url, status, created_at) VALUES (${q(`${id}_shp`)}, ${q(id)}, 'geliver', ${q(`demo_shp_${d.n.toLowerCase()}`)}, ${q(d.shipment.carrier)}, ${q(d.shipment.tn)}, NULL, ${q(d.shipment.status)}, ${day(Math.max(d.age - 0.5, 0))});`);
  if (d.inv) out.push(`INSERT OR REPLACE INTO invoices (id, order_id, type, provider, provider_invoice_id, number, pdf_url, status, created_at) VALUES (${q(`${id}_inv`)}, ${q(id)}, ${q(d.inv)}, 'efaturam', ${q(`demo_inv_${d.n.toLowerCase()}`)}, ${q(d.invNo)}, NULL, 'issued', ${day(Math.max(d.age - 0.4, 0))});`);
  if (["paid", "fulfilling", "shipped", "delivered", "refunded"].includes(d.st) && !d.source) {
    out.push(`INSERT OR REPLACE INTO notification_log (order_id, event, channel, "to", provider, status, error, created_at) VALUES (${q(id)}, 'order_paid', 'email', ${q(c.email.replace(/^(.).*@/, "$1***@"))}, 'cf_email', 'sent', NULL, ${day(d.age)});`);
  }
}
const sql = out.join("\n") + "\n";
if (process.argv.includes("--check")) { console.log(`ok: ${defs.length} orders, ${sql.split("\n").length} statements`); process.exit(0); }
writeFileSync(join(here, "orders.sql"), sql);
console.log(`wrote orders.sql (${defs.length} orders, ${customers.length} customers)`);

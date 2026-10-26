import { Hono } from "hono";
import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { addresses, channelPrices, customers, inventory, manualInvoices, orders, productVariants, products } from "@openshelf/db";
import type { InvoiceInput, InvoicingProvider } from "@openshelf/integration-sdk";
import { ManualInvoiceBody, computeInvoiceTotals } from "@openshelf/shared";
import type { AppEnv } from "../env";
import { ApiError, body, likeEscape, notFound, paged, paging, parse } from "../lib/http";
import { audit } from "../lib/audit";
import { requireRole } from "../middleware/auth";
import { hit } from "../middleware/security";
import { getAdapter, isIntegrationEnabled } from "../lib/integrations";
import { getSettings } from "../lib/settings";
import { scrub } from "../lib/log";
import { INVOICING_PROVIDER_IDS } from "../integrations/registry";
import { availableOf } from "../lib/catalog";
import { buildPreview, ruleInvoiceType, toInvoiceLines, type InvoiceType } from "../lib/manual-invoice";

export const adminManualInvoices = new Hono<AppEnv>();

const STATUSES = ["draft", "issuing", "issued", "failed", "cancelled", "cancelling"];
const STALE_ISSUING_SEC = 300;
type Row = typeof manualInvoices.$inferSelect;

/** Rejects bodies that cannot be invoiced regardless of provider (negative line amounts). Totals are ALWAYS recomputed server-side. */
function checkBody(b: ManualInvoiceBody) {
  const t = computeInvoiceTotals(b.lines, b.pricesIncludeTax);
  const neg = t.lines.findIndex((l) => l.total < 0);
  if (neg >= 0) throw new ApiError(400, "validation_error", "Line discount exceeds the line amount", [{ path: `lines.${neg}.discount`, message: "Discount exceeds line amount" }]);
  return t;
}
async function assertOrder(db: AppEnv["Variables"]["db"], orderId?: string) {
  if (!orderId) return;
  const [o] = await db.select({ id: orders.id }).from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!o) throw new ApiError(400, "validation_error", "Linked order not found", [{ path: "orderId", message: "Order not found" }]);
}
const toRow = (b: ManualInvoiceBody, t: ReturnType<typeof computeInvoiceTotals>) => ({
  customer: b.customer, lines: b.lines, pricesIncludeTax: b.pricesIncludeTax, currency: b.currency.toUpperCase(), issueDate: b.issueDate ?? null,
  notes: b.notes || null, orderId: b.orderId ?? null, total: t.total, taxTotal: t.tax,
});
async function getRow(db: AppEnv["Variables"]["db"], id: string): Promise<Row> {
  const [r] = await db.select().from(manualInvoices).where(eq(manualInvoices.id, id)).limit(1);
  if (!r) throw notFound("Manual invoice");
  return r;
}
const asBody = (r: Row): ManualInvoiceBody => parse(ManualInvoiceBody, {
  customer: r.customer, lines: r.lines, pricesIncludeTax: r.pricesIncludeTax, currency: r.currency, issueDate: r.issueDate ?? undefined, notes: r.notes ?? "", orderId: r.orderId ?? undefined,
});
const view = (r: Row) => ({ ...r, computed: computeInvoiceTotals((r.lines as ManualInvoiceBody["lines"]) ?? [], r.pricesIncludeTax) });

async function invoicingAdapter(c: Parameters<typeof getAdapter>[0], db: AppEnv["Variables"]["db"]) {
  for (const id of INVOICING_PROVIDER_IDS) {
    if (!(await isIntegrationEnabled(c, db, id))) continue;
    const a = await getAdapter<InvoicingProvider>(c, db, id);
    if (a) return { id, ...a };
  }
  return null;
}
async function resolveType(c: Parameters<typeof getAdapter>[0], db: AppEnv["Variables"]["db"], input: InvoiceInput): Promise<{ type: InvoiceType; source: "provider" | "rule" }> {
  const a = await invoicingAdapter(c, db).catch(() => null);
  const fn = (a?.adapter as unknown as { resolveInvoiceType?: (i: InvoiceInput) => Promise<InvoiceType> } | undefined)?.resolveInvoiceType;
  if (a && fn) { try { return { type: await fn.call(a.adapter, input), source: "provider" }; } catch { /* fall through to the static rule */ } }
  return { type: ruleInvoiceType(input.customer), source: "rule" };
}
const invoiceNumberFor = (id: string, orderNumber?: string | null) => orderNumber ?? `MAN-${id.slice(0, 8).toUpperCase()}`;
async function buildInput(db: AppEnv["Variables"]["db"], id: string, b: ManualInvoiceBody): Promise<InvoiceInput> {
  let orderNumber: string | null = null;
  if (b.orderId) { const [o] = await db.select({ n: orders.number }).from(orders).where(eq(orders.id, b.orderId)).limit(1); orderNumber = o?.n ?? null; }
  const cu = b.customer;
  return {
    orderId: `manual:${id}`, orderNumber: invoiceNumberFor(id, orderNumber), currency: b.currency.toUpperCase(),
    issuedAt: b.issueDate ? `${b.issueDate}T12:00:00.000Z` : new Date().toISOString(),
    lines: toInvoiceLines(b.lines, b.pricesIncludeTax),
    customer: { name: cu.name, email: cu.email || undefined, taxId: cu.taxId || undefined, taxOffice: cu.taxOffice || undefined, address: cu.address, city: cu.city, isCompany: cu.isCompany },
  };
}
async function previewOf(c: Parameters<typeof getAdapter>[0], db: AppEnv["Variables"]["db"], id: string, b: ManualInvoiceBody) {
  const p = buildPreview(b);
  const r = await resolveType(c, db, await buildInput(db, id, b));
  if (r.type === "e_arsiv" && b.customer.isCompany && /^\d{10}$/.test(b.customer.taxId ?? "") && r.source === "provider") {
    p.warnings.push({ code: "not_e_fatura_user", message: "Tax number is not a registered e-Fatura user; issued as e-Arsiv." });
  }
  return { ...p, type: r.type, typeSource: r.source };
}
async function rateLimitOps(c: { env: { DB: D1Database }; get(k: "admin"): { id: string } | undefined }, name: string) {
  const r = await hit(c.env.DB, `${name}:${c.get("admin")!.id}`, 3600);
  if (r.count > 30) throw new ApiError(429, "rate_limited", "Too many invoice operations, try again later", undefined, { "Retry-After": String(r.resetIn) });
}

// ---------- lookups (staff+) ----------
adminManualInvoices.get("/catalog-lookup", requireRole("staff"), async (c) => {
  const db = c.get("db"); const q = c.req.query("q")?.trim() ?? "";
  const general = await getSettings(db, "general");
  const l = `%${likeEscape(q)}%`;
  const where = q
    ? and(ne(products.status, "archived"), eq(productVariants.active, true), sql`(${products.nameTr} LIKE ${l} ESCAPE '\\' OR ${products.nameEn} LIKE ${l} ESCAPE '\\' OR ${productVariants.sku} LIKE ${l} ESCAPE '\\' OR ${productVariants.title} LIKE ${l} ESCAPE '\\' OR ${productVariants.barcode} LIKE ${l} ESCAPE '\\')`)
    : and(ne(products.status, "archived"), eq(productVariants.active, true));
  const rows = await db.select({
    variantId: productVariants.id, sku: productVariants.sku, productName: products.nameTr, variantTitle: productVariants.title,
    price: channelPrices.price, taxRate: products.taxRate, total: inventory.total, reserved: inventory.reserved, safety: inventory.safetyStock,
  }).from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .leftJoin(channelPrices, and(eq(channelPrices.variantId, productVariants.id), eq(channelPrices.channel, "website")))
    .leftJoin(inventory, eq(inventory.variantId, productVariants.id))
    .where(where).orderBy(products.nameTr, productVariants.position).limit(20);
  return c.json({ items: rows.map((r) => ({
    variantId: r.variantId, sku: r.sku, productName: r.productName, variantTitle: r.variantTitle, unitPrice: r.price ?? 0,
    taxRate: r.taxRate ?? general.defaultTaxRate, stock: availableOf({ total: r.total ?? 0, reserved: r.reserved ?? 0, safetyStock: r.safety ?? 0 }),
  })) });
});

adminManualInvoices.get("/customer-lookup", requireRole("staff"), async (c) => {
  const db = c.get("db"); const q = c.req.query("q")?.trim() ?? "";
  const l = `%${likeEscape(q)}%`;
  const where = q ? sql`(${customers.email} LIKE ${l} ESCAPE '\\' OR ${customers.name} LIKE ${l} ESCAPE '\\' OR ${customers.surname} LIKE ${l} ESCAPE '\\' OR ${customers.phone} LIKE ${l} ESCAPE '\\')` : undefined;
  const rows = await db.select().from(customers).where(and(where, sql`${customers.anonymizedAt} IS NULL`)).orderBy(desc(customers.createdAt)).limit(10);
  const addrs = rows.length ? await db.select().from(addresses).where(inArray(addresses.customerId, rows.map((r) => r.id))) : [];
  return c.json({ items: rows.map((r) => {
    const mine = addrs.filter((a) => a.customerId === r.id);
    const a = [...mine].reverse().find((x) => x.taxId) ?? mine[mine.length - 1];
    return {
      id: r.id, name: [r.name, r.surname].filter(Boolean).join(" ") || r.email, email: r.email, phone: r.phone,
      address: a ? [a.line1, a.line2].filter(Boolean).join(" ") : null, city: a?.city ?? null,
      taxId: a?.taxId ?? null, taxOffice: a?.taxOffice ?? null, isCompany: a?.isCompany ?? false,
    };
  }) });
});

// ---------- manual invoices ----------
adminManualInvoices.get("/manual-invoices", requireRole("staff"), async (c) => {
  const db = c.get("db"); const p = paging(c);
  const conds = [];
  const status = c.req.query("status"); const q = c.req.query("q")?.trim();
  if (status) { if (!STATUSES.includes(status)) throw new ApiError(400, "validation_error", "Unknown status"); conds.push(eq(manualInvoices.status, status)); }
  if (q) { const l = `%${likeEscape(q)}%`; conds.push(sql`(${manualInvoices.number} LIKE ${l} ESCAPE '\\' OR ${manualInvoices.customer} LIKE ${l} ESCAPE '\\' OR ${manualInvoices.id} LIKE ${l} ESCAPE '\\')`); }
  const where = conds.length ? and(...conds) : undefined;
  const rows = await db.select().from(manualInvoices).where(where).orderBy(desc(manualInvoices.createdAt)).limit(p.pageSize).offset(p.offset);
  const [t] = await db.select({ n: sql<number>`count(*)` }).from(manualInvoices).where(where);
  return c.json(paged(rows.map((r) => ({
    id: r.id, status: r.status, type: r.type, number: r.number, customerName: (r.customer as { name?: string }).name ?? "", total: r.total, taxTotal: r.taxTotal,
    currency: r.currency, orderId: r.orderId, pdfUrl: r.pdfUrl, createdAt: r.createdAt, issuedAt: r.issuedAt,
  })), t?.n ?? 0, p));
});

// Stateless preview of an unsaved form (must be declared before /:id routes).
adminManualInvoices.post("/manual-invoices/preview", requireRole("staff"), async (c) => {
  const b = await body(c, ManualInvoiceBody); const db = c.get("db");
  checkBody(b);
  return c.json(await previewOf(c.env, db, "preview", b));
});

adminManualInvoices.get("/manual-invoices/:id", requireRole("staff"), async (c) => c.json(view(await getRow(c.get("db"), c.req.param("id")))));

adminManualInvoices.post("/manual-invoices", requireRole("admin"), async (c) => {
  const b = await body(c, ManualInvoiceBody); const db = c.get("db");
  const t = checkBody(b); await assertOrder(db, b.orderId);
  const id = crypto.randomUUID();
  await db.insert(manualInvoices).values({ id, status: "draft", ...toRow(b, t), createdBy: c.get("admin")!.id });
  await audit(c, "manual_invoice.create", "manual_invoice", id, { total: t.total, lines: b.lines.length, orderId: b.orderId });
  return c.json(view(await getRow(db, id)), 201);
});

adminManualInvoices.put("/manual-invoices/:id", requireRole("admin"), async (c) => {
  const id = c.req.param("id"); const db = c.get("db");
  const b = await body(c, ManualInvoiceBody);
  const t = checkBody(b); await assertOrder(db, b.orderId);
  await getRow(db, id);
  const res = await db.update(manualInvoices).set({ ...toRow(b, t), updatedAt: new Date() })
    .where(and(eq(manualInvoices.id, id), inArray(manualInvoices.status, ["draft", "failed"]))).returning({ id: manualInvoices.id });
  if (!res.length) throw new ApiError(409, "not_editable", "Only draft or failed invoices can be edited");
  await audit(c, "manual_invoice.update", "manual_invoice", id, { total: t.total, lines: b.lines.length });
  return c.json(view(await getRow(db, id)));
});

adminManualInvoices.delete("/manual-invoices/:id", requireRole("admin"), async (c) => {
  const id = c.req.param("id"); const db = c.get("db");
  await getRow(db, id);
  const res = await db.delete(manualInvoices).where(and(eq(manualInvoices.id, id), eq(manualInvoices.status, "draft"))).returning({ id: manualInvoices.id });
  if (!res.length) throw new ApiError(409, "not_deletable", "Only draft invoices can be deleted");
  await audit(c, "manual_invoice.delete", "manual_invoice", id);
  return c.json({ ok: true });
});

adminManualInvoices.post("/manual-invoices/:id/preview", requireRole("staff"), async (c) => {
  const id = c.req.param("id"); const db = c.get("db");
  const r = await getRow(db, id);
  return c.json({ id, status: r.status, ...(await previewOf(c.env, db, id, asBody(r))) });
});

adminManualInvoices.post("/manual-invoices/:id/issue", requireRole("admin"), async (c) => {
  const id = c.req.param("id"); const db = c.get("db"); const admin = c.get("admin")!;
  const existing = await getRow(db, id);
  if (existing.status === "issued") throw new ApiError(409, "already_issued", "Invoice is already issued");
  if (existing.status === "cancelled" || existing.status === "cancelling") throw new ApiError(409, "invalid_state", `Invoice is ${existing.status}`);
  const found = await invoicingAdapter(c.env, db);
  if (!found) throw new ApiError(409, "no_invoicing_provider", "No invoicing provider is enabled. Enable e-Faturam in Integrations (or turn on Mock Mode).");
  await rateLimitOps(c, "minv-op");
  const b = asBody(existing);
  const t = checkBody(b);
  if (t.total <= 0) throw new ApiError(400, "zero_total", "Invoice total must be greater than 0");

  // Atomic claim: exactly one concurrent caller flips draft|failed (or a stale 'issuing') -> issuing.
  const now = Math.floor(Date.now() / 1000);
  const claim = await c.env.DB.prepare(
    `UPDATE manual_invoices SET status = 'issuing', error = NULL, issued_by = ?2, updated_at = ?3
     WHERE id = ?1 AND (status IN ('draft','failed') OR (status = 'issuing' AND updated_at <= ?3 - ?4))`)
    .bind(id, admin.id, now, STALE_ISSUING_SEC).run();
  if (!claim.meta.changes) throw new ApiError(409, "issue_in_progress", "Invoice is being issued or is no longer issuable");

  const secrets = Object.values(found.secrets);
  try {
    const input = await buildInput(db, id, b);
    const res = await found.adapter.issue(input, `manual:${id}`);
    await db.update(manualInvoices).set({
      status: "issued", provider: found.id, providerInvoiceId: res.providerInvoiceId, number: res.number ?? null, pdfUrl: res.pdfUrl ?? null,
      type: res.type, issuedAt: new Date(), issuedBy: admin.id, error: null, updatedAt: new Date(),
    }).where(eq(manualInvoices.id, id));
    await audit(c, "manual_invoice.issue", "manual_invoice", id, { ok: true, provider: found.id, type: res.type, total: t.total, orderId: b.orderId });
    return c.json(view(await getRow(db, id)));
  } catch (e) {
    const msg = scrub(e instanceof Error ? e.message : "issue failed", secrets).slice(0, 300);
    await db.update(manualInvoices).set({ status: "failed", error: msg, updatedAt: new Date() }).where(eq(manualInvoices.id, id));
    await audit(c, "manual_invoice.issue", "manual_invoice", id, { ok: false, provider: found.id, error: msg });
    throw new ApiError(502, "issue_failed", `Invoice provider error: ${msg}`, { id });
  }
});

adminManualInvoices.post("/manual-invoices/:id/cancel", requireRole("admin"), async (c) => {
  const id = c.req.param("id"); const db = c.get("db");
  const r = await getRow(db, id);
  if (r.status !== "issued") throw new ApiError(409, "invalid_state", "Only issued invoices can be cancelled");
  const found = await invoicingAdapter(c.env, db);
  if (!found) throw new ApiError(409, "no_invoicing_provider", "No invoicing provider is enabled");
  if (!r.providerInvoiceId) throw new ApiError(409, "invalid_state", "Invoice has no provider id");
  await rateLimitOps(c, "minv-op");
  const claim = await c.env.DB.prepare(`UPDATE manual_invoices SET status = 'cancelling', updated_at = unixepoch() WHERE id = ?1 AND status = 'issued'`).bind(id).run();
  if (!claim.meta.changes) throw new ApiError(409, "invalid_state", "Invoice is no longer issued");
  try {
    const res = await found.adapter.cancel(r.providerInvoiceId);
    if (!res.ok) throw new Error("provider refused the cancellation");
    await db.update(manualInvoices).set({ status: "cancelled", updatedAt: new Date() }).where(eq(manualInvoices.id, id));
    await audit(c, "manual_invoice.cancel", "manual_invoice", id, { ok: true, provider: found.id });
    return c.json(view(await getRow(db, id)));
  } catch (e) {
    const msg = scrub(e instanceof Error ? e.message : "cancel failed", Object.values(found.secrets)).slice(0, 300);
    await db.update(manualInvoices).set({ status: "issued", error: msg, updatedAt: new Date() }).where(eq(manualInvoices.id, id));
    await audit(c, "manual_invoice.cancel", "manual_invoice", id, { ok: false, error: msg });
    throw new ApiError(502, "cancel_failed", `Invoice provider error: ${msg}`, { id });
  }
});

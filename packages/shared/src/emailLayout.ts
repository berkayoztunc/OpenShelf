import type { NotificationEvent } from "./settings";

/**
 * Branded, table-based transactional e-mail layout (works in Gmail / Outlook / Apple Mail; inline styles only).
 * The operator-edited template body stays plain text and is escaped; everything else (order summary, totals,
 * CTA, progress) is rendered from structured data here, so a template can never inject markup.
 */
type Lang = "tr" | "en";

/** Raw order data in minor units; formatted by {@link buildOrderSummary}. */
export interface OrderSummaryInput {
  currency: string;
  lines: { name: string; sku?: string | null; variant?: string | null; quantity: number; unitPrice: number; taxRate?: number | null }[];
  subtotal: number; discount: number; shipping: number; tax: number; total: number;
  couponCode?: string | null;
  /** Payment provider id (iyzico, mock, …) and status, if any. */
  payment?: { provider: string; status?: string | null } | null;
  /** Amount refunded (refund mails). */
  refunded?: number | null;
  shippingAddress?: { name?: string; surname?: string; phone?: string; line1?: string; line2?: string; district?: string; city?: string; zip?: string } | null;
  carrier?: string | null;
  trackingNumber?: string | null;
}

export interface OrderSummary {
  lines: { name: string; meta: string; quantity: number; unitPrice: string; total: string }[];
  rows: { label: string; value: string; tone?: "discount" | "muted" | "total" | "refund" }[];
  payment?: string;
  address?: string[];
  shipment?: string;
}

const T = {
  tr: {
    items: "Sipariş özeti", product: "Ürün", qty: "Adet", unit: "Birim", amount: "Tutar", sku: "SKU",
    subtotal: "Ara toplam", discount: "İndirim", coupon: "Kupon", shipping: "Kargo", free: "Ücretsiz",
    taxIncl: "KDV (fiyatlara dahil)", taxAdded: "KDV", total: "Genel toplam", refunded: "İade edilen tutar",
    payment: "Ödeme", address: "Teslimat adresi", shipment: "Kargo bilgisi", trackNo: "Takip no",
    card: "Kredi / banka kartı", paid: "ödendi", pending: "bekliyor", failed: "başarısız", refundedSt: "iade edildi",
    help: "Sorunuz mu var? Bu e-postayı yanıtlayabilir veya bizimle iletişime geçebilirsiniz.",
    auto: "Bu e-posta siparişinizle ilgili bilgilendirme amacıyla otomatik gönderilmiştir.",
    steps: ["Sipariş alındı", "Hazırlanıyor", "Kargoda", "Teslim edildi"],
  },
  en: {
    items: "Order summary", product: "Item", qty: "Qty", unit: "Unit", amount: "Amount", sku: "SKU",
    subtotal: "Subtotal", discount: "Discount", coupon: "Coupon", shipping: "Shipping", free: "Free",
    taxIncl: "VAT (included in prices)", taxAdded: "VAT", total: "Total", refunded: "Refunded amount",
    payment: "Payment", address: "Shipping address", shipment: "Shipment", trackNo: "Tracking no",
    card: "Credit / debit card", paid: "paid", pending: "pending", failed: "failed", refundedSt: "refunded",
    help: "Questions? Just reply to this e-mail or get in touch with us.",
    auto: "This is an automatic message about your order.",
    steps: ["Order placed", "Preparing", "Shipped", "Delivered"],
  },
} as const;

export function formatMinor(minor: number, currency: string, lang: Lang): string {
  try { return new Intl.NumberFormat(lang === "tr" ? "tr-TR" : "en-US", { style: "currency", currency }).format(minor / 100); }
  catch { return `${(minor / 100).toFixed(2)} ${currency}`; }
}

const PROVIDERS: Record<string, string> = { iyzico: "iyzico", paytr: "PayTR", stripe: "Stripe", mock: "Mock", trendyol: "Trendyol" };

export function buildOrderSummary(i: OrderSummaryInput, lang: Lang): OrderSummary {
  const t = T[lang]; const m = (v: number) => formatMinor(v, i.currency, lang);
  const lines = i.lines.map((l) => ({
    name: l.name, meta: [l.variant, l.sku ? `${t.sku}: ${l.sku}` : ""].filter(Boolean).join(" · "),
    quantity: l.quantity, unitPrice: m(l.unitPrice), total: m(l.unitPrice * l.quantity),
  }));
  const included = i.total === i.subtotal - i.discount + i.shipping;
  const rows: OrderSummary["rows"] = [{ label: t.subtotal, value: m(i.subtotal) }];
  if (i.discount > 0) rows.push({ label: i.couponCode ? `${t.discount} (${t.coupon}: ${i.couponCode})` : t.discount, value: `−${m(i.discount)}`, tone: "discount" });
  rows.push({ label: t.shipping, value: i.shipping > 0 ? m(i.shipping) : t.free });
  if (i.tax > 0) rows.push({ label: included ? t.taxIncl : t.taxAdded, value: m(i.tax), tone: included ? "muted" : undefined });
  rows.push({ label: t.total, value: m(i.total), tone: "total" });
  if (i.refunded && i.refunded > 0) rows.push({ label: t.refunded, value: `−${m(i.refunded)}`, tone: "refund" });

  let payment: string | undefined;
  if (i.payment) {
    const st = i.payment.status === "succeeded" ? t.paid : i.payment.status === "failed" ? t.failed : i.payment.status === "refunded" ? t.refundedSt : i.payment.status ? t.pending : "";
    payment = `${t.card} (${PROVIDERS[i.payment.provider] ?? i.payment.provider})${st ? ` — ${st}` : ""}`;
  }
  const a = i.shippingAddress;
  const address = a ? [
    [a.name, a.surname].filter(Boolean).join(" "), [a.line1, a.line2].filter(Boolean).join(" "),
    [a.zip, [a.district, a.city].filter(Boolean).join(" / ")].filter(Boolean).join(" "), a.phone ?? "",
  ].map((s) => s.trim()).filter(Boolean) : undefined;
  const shipment = i.carrier || i.trackingNumber ? [i.carrier, i.trackingNumber ? `${t.trackNo}: ${i.trackingNumber}` : ""].filter(Boolean).join(" · ") : undefined;
  return { lines, rows, payment, address: address?.length ? address : undefined, shipment };
}

/** Sample order used by the admin preview and the test send. */
export const SAMPLE_SUMMARY_INPUT: OrderSummaryInput = {
  currency: "TRY",
  lines: [
    { name: "Seramik Vazo", variant: "Mavi / Büyük", sku: "VZ-MAV-L", quantity: 1, unitPrice: 44990, taxRate: 20 },
    { name: "Keten Masa Örtüsü", variant: "Bej", sku: "KT-BEJ", quantity: 2, unitPrice: 17500, taxRate: 20 },
  ],
  subtotal: 79990, discount: 8000, shipping: 4990, tax: 12827, total: 76980, couponCode: "HOSGELDIN",
  payment: { provider: "iyzico", status: "succeeded" },
  shippingAddress: { name: "Ayşe", surname: "Yılmaz", phone: "+90 530 123 45 67", line1: "Atatürk Cad. No: 12 D: 4", district: "Kadıköy", city: "İstanbul", zip: "34710" },
  carrier: "Yurtiçi Kargo", trackingNumber: "TRK123456789",
};

export interface EmailChrome {
  storeName: string;
  lang: Lang;
  event?: NotificationEvent;
  primaryColor?: string;
  logoUrl?: string | null;
  cta?: { label: string; url: string } | null;
  summary?: OrderSummary | null;
  footer?: { address?: string; email?: string; phone?: string } | null;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const safeColor = (c?: string) => (c && /^#[0-9a-fA-F]{6}$/.test(c) ? c : "#3B3F8F");
const safeUrl = (u?: string | null) => (u && /^https?:\/\//i.test(u) ? u : null);

/** Which progress step (0-based) an event represents; null = no tracker. */
function stepOf(event?: NotificationEvent): number | null {
  switch (event) {
    case "order_paid": return 0;
    case "order_shipped": return 2;
    case "order_delivered": return 3;
    default: return null;
  }
}

const HEADINGS: Record<Lang, Record<NotificationEvent, string>> = {
  tr: { order_paid: "Siparişiniz alındı", order_shipped: "Siparişiniz yola çıktı", order_delivered: "Siparişiniz teslim edildi", order_cancelled: "Siparişiniz iptal edildi", order_refunded: "İadeniz yapıldı", admin_new_order: "Yeni sipariş" },
  en: { order_paid: "We received your order", order_shipped: "Your order is on its way", order_delivered: "Your order was delivered", order_cancelled: "Your order was cancelled", order_refunded: "Your refund was issued", admin_new_order: "New order" },
};
const CTA_LABEL: Record<Lang, { order: string; track: string; admin: string }> = {
  tr: { order: "Siparişi görüntüle", track: "Kargomu takip et", admin: "Siparişi yönetim panelinde aç" },
  en: { order: "View order", track: "Track my package", admin: "Open in admin" },
};
export const ctaLabel = (lang: Lang, kind: "order" | "track" | "admin") => CTA_LABEL[lang][kind];

/** Full HTML document. `bodyText` is the already-substituted template text (escaped here). */
export function renderEmailLayout(bodyText: string, c: EmailChrome): string {
  const t = T[c.lang]; const color = safeColor(c.primaryColor);
  const heading = c.event ? HEADINGS[c.lang][c.event] : "";
  // A line carrying the CTA link (e.g. "Order status: https://…") is shown as the button instead.
  const ctaUrl = c.cta?.url;
  const paragraphs = bodyText.split(/\n+/).map((p) => p.trim()).filter((p) => p && !(ctaUrl && p.includes(ctaUrl)))
    .map((p) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#333">${esc(p)}</p>`).join("");
  const logo = safeUrl(c.logoUrl);
  const header = logo
    ? `<img src="${esc(logo)}" alt="${esc(c.storeName)}" height="40" style="display:block;height:40px;max-width:200px;border:0">`
    : `<span style="font-size:20px;font-weight:700;color:#fff;letter-spacing:-.2px">${esc(c.storeName)}</span>`;

  const step = stepOf(c.event);
  const tracker = step === null ? "" : `<tr><td style="padding:4px 32px 20px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${t.steps.map((s, i) => {
    const on = i <= step;
    return `<td align="center" width="25%" style="padding:0 2px;vertical-align:top"><div style="height:6px;border-radius:3px;background:${on ? color : "#e5e5ea"}"></div><div style="margin-top:6px;font-size:11px;line-height:1.3;color:${on ? "#1a1a1a" : "#999"};font-weight:${i === step ? 700 : 400}">${esc(s)}</div></td>`;
  }).join("")}</tr></table></td></tr>`;

  const cta = c.cta && safeUrl(c.cta.url)
    ? `<tr><td style="padding:4px 32px 24px"><a href="${esc(c.cta.url)}" style="display:inline-block;background:${color};color:#fff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:8px">${esc(c.cta.label)}</a></td></tr>`
    : "";

  let summary = "";
  const s = c.summary;
  if (s && s.lines.length) {
    const items = s.lines.map((l) => `<tr>
<td style="padding:10px 0;border-bottom:1px solid #eee;vertical-align:top"><div style="font-size:14px;font-weight:600;color:#1a1a1a">${esc(l.name)}</div>${l.meta ? `<div style="font-size:12px;color:#888;margin-top:2px">${esc(l.meta)}</div>` : ""}<div style="font-size:12px;color:#888;margin-top:2px">${l.quantity} × ${esc(l.unitPrice)}</div></td>
<td align="right" style="padding:10px 0;border-bottom:1px solid #eee;vertical-align:top;font-size:14px;white-space:nowrap;color:#1a1a1a">${esc(l.total)}</td></tr>`).join("");
    const rows = s.rows.map((r) => {
      const total = r.tone === "total";
      const col = r.tone === "discount" ? "#1a7f37" : r.tone === "refund" ? "#b42318" : r.tone === "muted" ? "#888" : "#1a1a1a";
      return `<tr><td style="padding:${total ? "10px 0 0" : "4px 0"};font-size:${total ? 16 : 14}px;font-weight:${total ? 700 : 400};color:${col};${total ? "border-top:2px solid #1a1a1a;" : ""}">${esc(r.label)}</td><td align="right" style="padding:${total ? "10px 0 0" : "4px 0"};font-size:${total ? 16 : 14}px;font-weight:${total ? 700 : 400};color:${col};white-space:nowrap;${total ? "border-top:2px solid #1a1a1a;" : ""}">${esc(r.value)}</td></tr>`;
    }).join("");
    const boxes: [string, string][] = [];
    if (s.address) boxes.push([t.address, s.address.map(esc).join("<br>")]);
    if (s.payment) boxes.push([t.payment, esc(s.payment)]);
    if (s.shipment) boxes.push([t.shipment, esc(s.shipment)]);
    const w = boxes.length ? Math.floor(100 / boxes.length) : 100;
    const info = boxes.map(([title, body]) => `<td valign="top" style="padding:0 12px 12px 0;width:${w}%"><div style="font-size:11px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;color:#888;margin-bottom:6px">${esc(title)}</div><div style="font-size:13px;line-height:1.55;color:#333">${body}</div></td>`).join("");
    summary = `<tr><td style="padding:8px 32px 8px"><div style="font-size:11px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;color:#888;border-bottom:1px solid #eee;padding-bottom:8px">${esc(t.items)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${items}</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:10px">${rows}</table></td></tr>
${info ? `<tr><td style="padding:16px 32px 8px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fafafa;border-radius:8px"><tr><td style="padding:14px 8px 2px 16px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${info}</tr></table></td></tr></table></td></tr>` : ""}`;
  }

  const f = c.footer;
  const contact = [f?.email ? esc(f.email) : "", f?.phone ? esc(f.phone) : ""].filter(Boolean).join(" · ");
  const footer = `<tr><td style="padding:20px 32px 28px;border-top:1px solid #eee"><p style="margin:0 0 6px;font-size:12px;color:#888;line-height:1.5">${esc(c.event === "admin_new_order" ? t.auto : t.help)}</p>
<p style="margin:0;font-size:12px;color:#aaa;line-height:1.5"><strong style="color:#888">${esc(c.storeName)}</strong>${f?.address ? `<br>${esc(f.address)}` : ""}${contact ? `<br>${contact}` : ""}</p></td></tr>`;

  return `<!doctype html><html lang="${c.lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(heading || c.storeName)}</title></head>`
    + `<body style="margin:0;padding:0;background:#f2f2f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1a1a1a">`
    + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f2f5"><tr><td align="center" style="padding:24px 12px">`
    + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:12px;overflow:hidden">`
    + `<tr><td style="background:${color};padding:20px 32px">${header}</td></tr>`
    + (heading ? `<tr><td style="padding:28px 32px 8px"><h1 style="margin:0;font-size:22px;line-height:1.3;color:#1a1a1a">${esc(heading)}</h1></td></tr>` : "")
    + tracker
    + `<tr><td style="padding:${heading ? 8 : 28}px 32px 8px">${paragraphs}</td></tr>`
    + cta + summary + footer
    + `</table></td></tr></table></body></html>`;
}

/** Plain-text part: template text + the same summary, line by line. */
export function renderSummaryText(s: OrderSummary | null | undefined, lang: Lang): string {
  if (!s || !s.lines.length) return "";
  const t = T[lang];
  const out = ["", `— ${t.items} —`, ...s.lines.map((l) => `${l.quantity} × ${l.name}${l.meta ? ` (${l.meta})` : ""}: ${l.total}`), "", ...s.rows.map((r) => `${r.label}: ${r.value}`)];
  if (s.payment) out.push("", `${t.payment}: ${s.payment}`);
  if (s.shipment) out.push(`${t.shipment}: ${s.shipment}`);
  if (s.address) out.push("", `${t.address}:`, ...s.address);
  return out.join("\n");
}

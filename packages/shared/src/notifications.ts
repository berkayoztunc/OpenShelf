import { TEMPLATE_VARS, type NotificationEvent } from "./settings";

export type TemplateVar = (typeof TEMPLATE_VARS)[number];
export type TemplateVars = Partial<Record<TemplateVar, string>>;
export type NotificationLang = "tr" | "en";
export interface NotificationTemplate { subject: string; body: string }

/** E.164: '+', non-zero country digit, 8..15 digits total. */
export const E164 = /^\+[1-9]\d{7,14}$/;
export const isE164 = (v: unknown): v is string => typeof v === "string" && E164.test(v);

/** Best-effort normalisation of a Turkish/intl phone input to E.164; returns null if not plausible. */
export function toE164(raw: string | null | undefined, defaultCountry = "90"): string | null {
  if (!raw) return null;
  let s = raw.trim().replace(/[\s().-]/g, "");
  if (s.startsWith("00")) s = "+" + s.slice(2);
  else if (/^0\d{10}$/.test(s) && defaultCountry === "90") s = "+90" + s.slice(1);
  else if (/^5\d{9}$/.test(s) && defaultCountry === "90") s = "+90" + s;
  else if (/^90\d{10}$/.test(s)) s = "+" + s;
  return isE164(s) ? s : null;
}

const ISO_CALLING: Record<string, string> = {
  TR: "90", US: "1", CA: "1", GB: "44", DE: "49", FR: "33", NL: "31", IT: "39", ES: "34", AT: "43", CH: "41", BE: "32", SE: "46", NO: "47", DK: "45",
  FI: "358", IE: "353", PT: "351", PL: "48", GR: "30", BG: "359", RO: "40", CY: "357", AZ: "994", AE: "971", SA: "966", AU: "61", JP: "81", IN: "91",
};
/** Normalises an allow-list entry ("+90", "90", "tr") to a calling-code digit string, or null if unknown. */
export function callingPrefix(entry: string): string | null {
  const t = entry.trim().replace(/^\+/, "");
  if (/^\d{1,4}$/.test(t)) return t;
  return ISO_CALLING[t.toUpperCase()] ?? null;
}
/** True when the E.164 number starts with one of the allowed calling codes. An empty list allows nothing. */
export function smsCountryAllowed(e164: string, allowed: readonly string[]): boolean {
  const digits = e164.replace(/^\+/, "");
  return allowed.some((a) => { const p = callingPrefix(a); return !!p && digits.startsWith(p); });
}

// eslint-disable-next-line no-control-regex
const CTRL = /[\u0000-\u001f\u007f\u0085\u2028\u2029]/g;
/** For email subjects / any header value: removes CR, LF and other control chars (header injection). */
export const stripHeaderChars = (s: string): string => s.replace(CTRL, " ").replace(/\s{2,}/g, " ").trim();
/** SMS text: keep \n, drop other control chars. */
export const cleanSmsText = (s: string): string => s.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0009\u000b-\u001f\u007f\u2028\u2029]/g, "").trim();

export const escapeHtml = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const VAR_RE = /\{\{\s*([a-zA-Z]+)\s*\}\}/g;
const known = new Set<string>(TEMPLATE_VARS);
function substitute(tpl: string, vars: TemplateVars): string {
  return tpl.replace(VAR_RE, (_m, k: string) => (known.has(k) ? (vars[k as TemplateVar] ?? "") : ""));
}
/** Variables used in a template that are not allowed. */
export const unknownTemplateVars = (tpl: string): string[] =>
  [...tpl.matchAll(VAR_RE)].map((m) => m[1]!).filter((k) => !known.has(k));

export const renderSubject = (tpl: string, vars: TemplateVars): string => stripHeaderChars(substitute(tpl, vars)).slice(0, 200);
export const renderSms = (tpl: string, vars: TemplateVars): string => cleanSmsText(substitute(tpl, vars));
export const renderEmailText = (tpl: string, vars: TemplateVars): string => cleanSmsText(substitute(tpl, vars));
/** HTML part: the WHOLE substituted text (template + values) is escaped, newlines become <br>. */
export function renderEmailHtml(tpl: string, vars: TemplateVars, storeName = ""): string {
  const body = escapeHtml(cleanSmsText(substitute(tpl, vars))).replace(/\n/g, "<br>");
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#f5f5f7;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1a1a1a">`
    + `<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:8px;padding:24px;line-height:1.5;font-size:15px">${body}</div>`
    + (storeName ? `<p style="max-width:560px;margin:12px auto 0;font-size:12px;color:#888;text-align:center">${escapeHtml(storeName)}</p>` : "")
    + `</body></html>`;
}

const GSM7 = "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM7_EXT = "^{}\\[~]|€";
export function smsInfo(text: string): { length: number; encoding: "GSM-7" | "UCS-2"; segments: number; perSegment: number } {
  let units = 0; let gsm = true;
  for (const ch of text) {
    if (GSM7.includes(ch)) units += 1;
    else if (GSM7_EXT.includes(ch)) units += 2;
    else { gsm = false; break; }
  }
  if (gsm) {
    const segments = units === 0 ? 0 : units <= 160 ? 1 : Math.ceil(units / 153);
    return { length: units, encoding: "GSM-7", segments, perSegment: segments > 1 ? 153 : 160 };
  }
  const len = [...text].reduce((n, ch) => n + (ch.codePointAt(0)! > 0xffff ? 2 : 1), 0);
  const segments = len === 0 ? 0 : len <= 70 ? 1 : Math.ceil(len / 67);
  return { length: len, encoding: "UCS-2", segments, perSegment: segments > 1 ? 67 : 70 };
}

export const SAMPLE_VARS: Record<NotificationLang, Required<TemplateVars>> = {
  tr: { orderNumber: "OS-100234", customerName: "Ayşe Yılmaz", total: "749,90 ₺", trackingNumber: "TRK123456789", trackingUrl: "https://kargo.example/TRK123456789", storeName: "Mağazam", orderUrl: "https://magazam.example/order/OS-100234" },
  en: { orderNumber: "OS-100234", customerName: "Jane Doe", total: "TRY 749.90", trackingNumber: "TRK123456789", trackingUrl: "https://carrier.example/TRK123456789", storeName: "My Store", orderUrl: "https://mystore.example/order/OS-100234" },
};

/** Transactional only. No marketing content. */
export const DEFAULT_TEMPLATES: Record<NotificationLang, Record<NotificationEvent, NotificationTemplate>> = {
  tr: {
    order_paid: { subject: "Siparişiniz alındı: {{orderNumber}}", body: "Merhaba {{customerName}},\n{{orderNumber}} numaralı siparişiniz için ödemeniz alındı. Toplam: {{total}}.\nSipariş durumu: {{orderUrl}}\n{{storeName}}" },
    order_shipped: { subject: "Siparişiniz kargoya verildi: {{orderNumber}}", body: "Merhaba {{customerName}},\n{{orderNumber}} numaralı siparişiniz kargoya verildi. Takip no: {{trackingNumber}}\nTakip: {{trackingUrl}}\n{{storeName}}" },
    order_delivered: { subject: "Siparişiniz teslim edildi: {{orderNumber}}", body: "Merhaba {{customerName}},\n{{orderNumber}} numaralı siparişiniz teslim edildi. Bizi tercih ettiğiniz için teşekkürler.\n{{storeName}}" },
    order_cancelled: { subject: "Siparişiniz iptal edildi: {{orderNumber}}", body: "Merhaba {{customerName}},\n{{orderNumber}} numaralı siparişiniz iptal edildi. Ödeme yaptıysanız iade süreci başlatılacaktır.\n{{storeName}}" },
    order_refunded: { subject: "İadeniz yapıldı: {{orderNumber}}", body: "Merhaba {{customerName}},\n{{orderNumber}} numaralı siparişinizin {{total}} tutarındaki ödemesi iade edildi. Bankanıza bağlı olarak hesabınıza yansıması birkaç gün sürebilir.\n{{storeName}}" },
    admin_new_order: { subject: "Yeni sipariş: {{orderNumber}}", body: "{{storeName}}: yeni sipariş {{orderNumber}} ({{customerName}}), toplam {{total}}." },
  },
  en: {
    order_paid: { subject: "We received your order {{orderNumber}}", body: "Hi {{customerName}},\nWe received your payment for order {{orderNumber}}. Total: {{total}}.\nOrder status: {{orderUrl}}\n{{storeName}}" },
    order_shipped: { subject: "Your order {{orderNumber}} has shipped", body: "Hi {{customerName}},\nYour order {{orderNumber}} has shipped. Tracking number: {{trackingNumber}}\nTrack it: {{trackingUrl}}\n{{storeName}}" },
    order_delivered: { subject: "Your order {{orderNumber}} was delivered", body: "Hi {{customerName}},\nYour order {{orderNumber}} was delivered. Thank you for shopping with us.\n{{storeName}}" },
    order_cancelled: { subject: "Your order {{orderNumber}} was cancelled", body: "Hi {{customerName}},\nYour order {{orderNumber}} was cancelled. If you already paid, a refund will be issued.\n{{storeName}}" },
    order_refunded: { subject: "Refund issued for order {{orderNumber}}", body: "Hi {{customerName}},\nA refund of {{total}} for order {{orderNumber}} has been issued. It may take a few days to appear, depending on your bank.\n{{storeName}}" },
    admin_new_order: { subject: "New order {{orderNumber}}", body: "{{storeName}}: new order {{orderNumber}} ({{customerName}}), total {{total}}." },
  },
};

/** Stored template if non-empty, else the default. */
export function pickTemplate(stored: Record<string, { subject?: string; body?: string } | undefined> | undefined, lang: NotificationLang, event: NotificationEvent): NotificationTemplate {
  const d = DEFAULT_TEMPLATES[lang][event];
  const s = stored?.[event];
  return { subject: s?.subject?.trim() ? s.subject : d.subject, body: s?.body?.trim() ? s.body : d.body };
}

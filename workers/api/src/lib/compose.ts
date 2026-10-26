import { cleanSmsText, escapeHtml } from "@openshelf/shared";

/** Matches an https URL inside ALREADY-escaped text (stops at whitespace and at escaped < > " '). */
const URL_RE = /https:\/\/(?:(?!&lt;|&gt;|&quot;|&#39;)[^\s])+/g;
const TRAILING = /[.,;:!?)\]]+$/;

/** Inline formatting on escaped text: https auto-links + **bold**. Input MUST already be escaped. */
function inline(escaped: string): string {
  let out = ""; let last = 0;
  const bold = (s: string) => s.replace(/\*\*(?=\S)(.+?)(?<=\S)\*\*/g, "<strong>$1</strong>");
  for (const m of escaped.matchAll(URL_RE)) {
    let url = m[0]; const tail = url.match(TRAILING)?.[0] ?? "";
    if (tail) url = url.slice(0, -tail.length);
    const start = m.index!;
    out += bold(escaped.slice(last, start));
    out += `<a href="${url}" rel="noopener noreferrer nofollow" target="_blank">${url}</a>${tail}`;
    last = start + m[0].length;
  }
  return out + bold(escaped.slice(last));
}

/** Plain text -> safe HTML paragraphs. Everything is escaped first; only <p>, <br>, <strong>, <a href=https> are produced. */
export function textToHtml(text: string): string {
  const clean = cleanSmsText(text);
  return clean.split(/\n{2,}/).map((p) => `<p style="margin:0 0 14px">${inline(escapeHtml(p)).replace(/\n/g, "<br>")}</p>`).join("");
}

export interface ComposeLayout { storeName: string; contactEmail?: string; invoiceUrl?: string | null; invoiceNumber?: string | null }

/** Single renderer for preview AND send, so what the admin previews is byte-identical to what is sent. */
export function renderComposed(body: string, l: ComposeLayout): { html: string; text: string } {
  const store = escapeHtml(l.storeName || "");
  const invHtml = l.invoiceUrl
    ? `<p style="margin:0 0 14px">Invoice${l.invoiceNumber ? ` ${escapeHtml(l.invoiceNumber)}` : ""}: ${/^https:\/\//i.test(l.invoiceUrl) ? `<a href="${escapeHtml(l.invoiceUrl)}" rel="noopener noreferrer nofollow" target="_blank">${escapeHtml(l.invoiceUrl)}</a>` : escapeHtml(l.invoiceUrl)}</p>`
    : "";
  const footer = [l.storeName, l.contactEmail].filter(Boolean).map((x) => escapeHtml(x!)).join(" &middot; ");
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f5f5f7;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1a1a1a">`
    + `<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden">`
    + (store ? `<div style="padding:16px 24px;border-bottom:1px solid #eee;font-weight:600;font-size:16px">${store}</div>` : "")
    + `<div style="padding:24px;line-height:1.5;font-size:15px">${textToHtml(body)}${invHtml}</div></div>`
    + (footer ? `<p style="max-width:560px;margin:12px auto 0;font-size:12px;color:#888;text-align:center">${footer}</p>` : "")
    + `</body></html>`;
  const text = cleanSmsText(body)
    + (l.invoiceUrl ? `\n\nInvoice${l.invoiceNumber ? ` ${l.invoiceNumber}` : ""}: ${l.invoiceUrl}` : "")
    + ([l.storeName, l.contactEmail].filter(Boolean).length ? `\n\n--\n${[l.storeName, l.contactEmail].filter(Boolean).join(" - ")}` : "");
  return { html, text };
}

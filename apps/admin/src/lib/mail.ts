import { ApiError } from "./api";
import { tNow } from "../i18n";

/** Names of {{placeholders}} in the text that the server will NOT substitute (only {{storeName}} is). */
export function unresolvedPlaceholders(...texts: string[]): string[] {
  const out = new Set<string>();
  for (const t of texts) for (const m of t.matchAll(/\{\{\s*([^{}\s]+)\s*\}\}/g)) if (m[1] !== "storeName") out.add(m[1]!);
  return [...out];
}

/** Preview warning text: translated by `code` (the unresolved-placeholder message carries the variable name), else the server text. */
export function warningMessage(w: { code: string; message: string }): string {
  if (w.code === "unresolved_placeholder") { const m = /\{\{[^}]*\}\}/.exec(w.message); return tNow("emails.warning.unresolved_placeholder", { name: m ? m[0] : "" }); }
  return w.message;
}

export interface SendFailure { message: string; hint?: string; link?: { to: string; label: string } }
/** Maps POST /api/admin/emails (and resend) errors to messages. */
export function describeSendError(e: unknown): SendFailure {
  if (!(e instanceof ApiError)) return { message: e instanceof Error ? e.message : tNow("emails.error.generic") };
  switch (e.code) {
    case "rate_limited_admin": case "rate_limited_total": case "rate_limited_recipient": case "unresolved_placeholders":
      return { message: tNow(`emails.error.${e.code}`) };
    case "no_email_provider": return { message: tNow("emails.error.no_email_provider"), link: { to: "/integrations", label: tNow("emails.error.openIntegrations") } };
    case "send_failed": {
      const detail = (e.details as { detail?: string } | undefined)?.detail;
      return { message: tNow("emails.error.send_failed", { detail: detail ? `: ${detail}` : "." }), hint: tNow("emails.error.send_failed.hint") };
    }
    default: return { message: e.message };
  }
}

export interface ComposeDraft { to: string; cc: string; replyTo: string; subject: string; body: string; orderId?: string; customerId?: string; manualInvoiceId?: string }
export const emptyDraft = (): ComposeDraft => ({ to: "", cc: "", replyTo: "", subject: "", body: "" });
const KEY = "os.compose.draft";
export function loadDraft(): ComposeDraft | null {
  try { const s = sessionStorage.getItem(KEY); return s ? { ...emptyDraft(), ...(JSON.parse(s) as Partial<ComposeDraft>) } : null; } catch { return null; }
}
export function saveDraft(d: ComposeDraft) { try { sessionStorage.setItem(KEY, JSON.stringify(d)); } catch { /* storage unavailable */ } }
export function clearDraft() { try { sessionStorage.removeItem(KEY); } catch { /* storage unavailable */ } }

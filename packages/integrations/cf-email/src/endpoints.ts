export const ALLOWED_HOSTS = ["api.cloudflare.com"] as const;

export function assertAllowed(url: string): void {
  const u = new URL(url);
  if (u.protocol !== "https:" || !(ALLOWED_HOSTS as readonly string[]).includes(u.hostname)) {
    throw new Error(`cf-email: host not allowlisted: ${u.hostname}`);
  }
}

/** POST JSON { to, from, subject, html, text } with `Authorization: Bearer <API_TOKEN>`.
 *  Success: { success:true, result:{ delivered:[], permanent_bounces:[], queued:[] } } (recipient-grouped; no message id).
 *  Docs: https://developers.cloudflare.com/email-service/api/send-emails/rest-api/ */
export const sendUrl = (accountId: string) => `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/email/sending/send`;

/** UNVERIFIED: `from` as { address, name } object for display names (docs point to a "Specify recipients" page we did not read). We use the "Name <addr>" string form. */
/** UNVERIFIED: a dedicated, cheap token-validity/health endpoint for Email Sending. We use the generic token verify endpoint. */
export const verifyTokenUrl = "https://api.cloudflare.com/client/v4/user/tokens/verify";
/** UNVERIFIED: account-scoped token verify (for tokens created as Account API tokens). */
export const verifyAccountTokenUrl = (accountId: string) => `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/tokens/verify`;

export const ALLOWED_HOSTS = ["api.twilio.com"] as const;

export function assertAllowed(url: string): void {
  const u = new URL(url);
  if (u.protocol !== "https:" || !(ALLOWED_HOSTS as readonly string[]).includes(u.hostname)) {
    throw new Error(`twilio: host not allowlisted: ${u.hostname}`);
  }
}

const SID = /^AC[0-9a-fA-F]{32}$/;
export const isAccountSid = (s: string) => SID.test(s);

/** POST application/x-www-form-urlencoded: To, Body, and From | MessagingServiceSid. Basic auth AccountSid:AuthToken.
 *  201 -> { sid, status, error_code, ... }. Docs: https://www.twilio.com/docs/messaging/api/message-resource */
export const messagesUrl = (accountSid: string) => `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`;
/** GET account fetch -> { sid, status: "active"|"suspended"|"closed", ... } (used for healthCheck). */
export const accountUrl = (accountSid: string) => `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}.json`;
// UNVERIFIED: alphanumeric sender IDs are not supported in all countries (and not at all for US/CA); Twilio rejects with error 21612/21611.

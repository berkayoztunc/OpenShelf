export const ALLOWED_HOSTS = ["api.netgsm.com.tr"] as const;

export function assertAllowed(url: string): void {
  const u = new URL(url);
  if (u.protocol !== "https:" || !(ALLOWED_HOSTS as readonly string[]).includes(u.hostname)) {
    throw new Error(`netgsm: host not allowlisted: ${u.hostname}`);
  }
}

/** POST JSON { msgheader, messages:[{msg,no}], encoding:"TR", iysfilter:"0", appname } with Basic auth (usercode:password).
 *  Success: { code:"00", jobid, description }. Docs: https://www.netgsm.com.tr/dokuman/ (SMS Gonderimi REST v2). */
export const SEND_URL = "https://api.netgsm.com.tr/sms/rest/v2/send";

/** UNVERIFIED: balance query. Netgsm documents a credit-query ("stip=2") returning { code:"00", balance:"15" };
 *  the exact REST v2 URL/method for it could not be confirmed from the SPA docs, so this is the legacy-style endpoint. */
export const BALANCE_URL = "https://api.netgsm.com.tr/balance";
/** UNVERIFIED: body shape of the balance request. */
export const balanceBody = (usercode: string, password: string) => ({ usercode, password, stip: 2 });

/** UNVERIFIED: whether v2 /send accepts Basic auth only (vs. username/password in the body). We send Basic auth (the documented v2 scheme). */
export const SEND_ACCEPTS_BASIC_AUTH = true;

/** Documented error codes for /send ("code" field). */
export const ERROR_CODES: Record<string, string> = {
  "20": "message text problem or too long", "30": "invalid credentials or IP not allowed", "40": "sender header (msgheader) not registered",
  "50": "IYS-controlled sending not available", "51": "no IYS brand information", "70": "invalid parameter / missing field",
  "80": "send limit exceeded", "85": "duplicate-send limit exceeded",
};
/** Codes that will never succeed on retry. */
export const PERMANENT_CODES = new Set(["20", "30", "40", "50", "51", "70"]);

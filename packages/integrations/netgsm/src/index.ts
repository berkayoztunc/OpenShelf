import { z } from "zod";
import { isE164 } from "@openshelf/shared";
import type {
  AdapterDeps, AdapterFactory, HealthResult, IntegrationCredentials, IntegrationManifest, SmsMessage, SmsProvider,
} from "@openshelf/integration-sdk";
import { ERROR_CODES, PERMANENT_CODES, SEND_URL, BALANCE_URL, assertAllowed, balanceBody } from "./endpoints";

export const netgsmSchema = z.object({
  config: z.object({ msgheader: z.string().min(3).max(11).optional().or(z.literal("")) }),
  secrets: z.object({ usercode: z.string().min(3), password: z.string().min(1) }),
});

export const manifest: IntegrationManifest = {
  id: "netgsm",
  name: "Netgsm (SMS)",
  description: "Transactional order SMS via Netgsm REST v2 (Turkish characters supported).",
  docsUrl: "https://www.netgsm.com.tr/dokuman/",
  publicFields: [{ key: "msgheader", label: "Sender header (msgheader)", type: "text", placeholder: "MAGAZAM", help: "3-11 chars, must be registered in your Netgsm account. Overridden by Settings > Notifications > SMS sender ID if set." }],
  secretFields: [
    { key: "usercode", label: "Usercode (subscriber number)", secret: true, required: true, type: "password" },
    { key: "password", label: "API password", secret: true, required: true, type: "password", help: "Password of the Netgsm API sub-user." },
  ],
  schema: netgsmSchema,
};

/** E.164 -> Netgsm "no": Turkish mobile as 5xxxxxxxxx, international prefixed with 00. */
export function toNetgsmNumber(e164: string): string {
  if (!isE164(e164)) throw new Error("permanent:invalid_recipient");
  const d = e164.slice(1);
  return d.startsWith("90") && d.length === 12 ? d.slice(2) : `00${d}`;
}

export class NetgsmSms implements SmsProvider {
  readonly id = "netgsm" as const;
  private p: z.infer<typeof netgsmSchema>;
  constructor(creds: IntegrationCredentials, private deps: AdapterDeps) { this.p = netgsmSchema.parse({ config: creds.config, secrets: creds.secrets }); }
  private auth() { return "Basic " + btoa(`${this.p.secrets.usercode}:${this.p.secrets.password}`); }
  async validateConfig(): Promise<void> { /* parsed in constructor */ }

  async healthCheck(): Promise<HealthResult> {
    try {
      assertAllowed(BALANCE_URL);
      const res = await this.deps.fetch(BALANCE_URL, {
        method: "POST", headers: { "content-type": "application/json", authorization: this.auth() },
        body: JSON.stringify(balanceBody(this.p.secrets.usercode, this.p.secrets.password)),
      });
      if (!res.ok) return { ok: false, detail: `HTTP ${res.status}` };
      const j = (await res.json().catch(() => ({}))) as { code?: string; balance?: string };
      if (j.code === "00") return { ok: true, detail: `balance: ${String(j.balance ?? "?").slice(0, 20)}` };
      return { ok: false, detail: `code ${j.code ?? "?"}${j.code && ERROR_CODES[j.code] ? ": " + ERROR_CODES[j.code] : ""}` };
    } catch (e) { return { ok: false, detail: e instanceof Error ? e.message : "network error" }; }
  }

  async send(msg: SmsMessage): Promise<{ ok: boolean; providerMessageId?: string; detail?: string }> {
    if (!isE164(msg.to)) return { ok: false, detail: "permanent:invalid_recipient" };
    const text = msg.text.replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, "").trim();
    if (!text) return { ok: false, detail: "permanent:empty_message" };
    const header = (msg.senderId || this.p.config.msgheader || "").trim();
    if (header.length < 3 || header.length > 11) return { ok: false, detail: "permanent:invalid_msgheader" };
    assertAllowed(SEND_URL);
    const res = await this.deps.fetch(SEND_URL, {
      method: "POST", headers: { "content-type": "application/json", authorization: this.auth() },
      body: JSON.stringify({ msgheader: header, messages: [{ msg: text, no: toNetgsmNumber(msg.to) }], encoding: "TR", iysfilter: "0", appname: "openshelf" }),
    });
    const j = (await res.json().catch(() => ({}))) as { code?: string; jobid?: string; description?: string };
    if (res.ok && j.code === "00") return { ok: true, providerMessageId: j.jobid };
    const code = String(j.code ?? "");
    const permanent = (res.status >= 400 && res.status < 500 && res.status !== 429) || PERMANENT_CODES.has(code);
    return { ok: false, detail: `${permanent ? "permanent:" : ""}${code ? `code ${code}${ERROR_CODES[code] ? " " + ERROR_CODES[code] : ""}` : `HTTP ${res.status}`}` };
  }
}

export const factory: AdapterFactory<NetgsmSms> = { manifest, create: (creds, deps) => new NetgsmSms(creds, deps) };
export { ALLOWED_HOSTS } from "./endpoints";

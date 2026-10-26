import { z } from "zod";
import { isE164 } from "@openshelf/shared";
import type {
  AdapterDeps, AdapterFactory, HealthResult, IntegrationCredentials, IntegrationManifest, SmsMessage, SmsProvider,
} from "@openshelf/integration-sdk";
import { accountUrl, assertAllowed, isAccountSid, messagesUrl } from "./endpoints";

export const twilioSchema = z.object({
  config: z.object({
    accountSid: z.string().regex(/^AC[0-9a-fA-F]{32}$/, "Expected AC + 32 hex chars"),
    from: z.string().regex(/^\+[1-9]\d{7,14}$/, "E.164 number").optional().or(z.literal("")),
    messagingServiceSid: z.string().regex(/^MG[0-9a-fA-F]{32}$/, "Expected MG + 32 hex chars").optional().or(z.literal("")),
  }).refine((c) => !!(c.from || c.messagingServiceSid), { message: "Set either From number or Messaging Service SID" }),
  secrets: z.object({ authToken: z.string().min(8) }),
});

export const manifest: IntegrationManifest = {
  id: "twilio",
  name: "Twilio (SMS)",
  description: "Transactional order SMS via Twilio Programmable Messaging.",
  docsUrl: "https://www.twilio.com/docs/messaging/api/message-resource",
  publicFields: [
    { key: "accountSid", label: "Account SID", required: true, type: "text", placeholder: "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" },
    { key: "from", label: "From number (E.164)", type: "text", placeholder: "+15551234567", help: "Either this or a Messaging Service SID is required." },
    { key: "messagingServiceSid", label: "Messaging Service SID", type: "text", placeholder: "MGxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx", help: "If set, it takes precedence over From." },
  ],
  secretFields: [{ key: "authToken", label: "Auth Token", secret: true, required: true, type: "password" }],
  schema: twilioSchema,
};

export class TwilioSms implements SmsProvider {
  readonly id = "twilio" as const;
  private p: z.infer<typeof twilioSchema>;
  constructor(creds: IntegrationCredentials, private deps: AdapterDeps) { this.p = twilioSchema.parse({ config: creds.config, secrets: creds.secrets }); }
  private auth() { return "Basic " + btoa(`${this.p.config.accountSid}:${this.p.secrets.authToken}`); }
  async validateConfig(): Promise<void> { /* parsed in constructor */ }

  async healthCheck(): Promise<HealthResult> {
    try {
      if (!isAccountSid(this.p.config.accountSid)) return { ok: false, detail: "invalid account sid" };
      const url = accountUrl(this.p.config.accountSid);
      assertAllowed(url);
      const res = await this.deps.fetch(url, { method: "GET", headers: { authorization: this.auth() } });
      if (!res.ok) return { ok: false, detail: res.status === 401 ? "invalid credentials" : `HTTP ${res.status}` };
      const j = (await res.json().catch(() => ({}))) as { status?: string };
      return j.status === "active" ? { ok: true, detail: "account active" } : { ok: false, detail: `account status: ${String(j.status ?? "unknown").slice(0, 30)}` };
    } catch (e) { return { ok: false, detail: e instanceof Error ? e.message : "network error" }; }
  }

  async send(msg: SmsMessage): Promise<{ ok: boolean; providerMessageId?: string; detail?: string }> {
    if (!isE164(msg.to)) return { ok: false, detail: "permanent:invalid_recipient" };
    const text = msg.text.replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, "").trim();
    if (!text) return { ok: false, detail: "permanent:empty_message" };
    const form = new URLSearchParams();
    form.set("To", msg.to); form.set("Body", text);
    const { messagingServiceSid, from } = this.p.config;
    if (messagingServiceSid) form.set("MessagingServiceSid", messagingServiceSid);
    else form.set("From", msg.senderId && /^[A-Za-z0-9 ]{1,11}$/.test(msg.senderId) ? msg.senderId : (from as string));
    const url = messagesUrl(this.p.config.accountSid);
    assertAllowed(url);
    const res = await this.deps.fetch(url, { method: "POST", headers: { authorization: this.auth(), "content-type": "application/x-www-form-urlencoded" }, body: form.toString() });
    const j = (await res.json().catch(() => ({}))) as { sid?: string; code?: number; message?: string; status?: string; error_code?: number | null };
    if (res.ok && j.sid) return { ok: true, providerMessageId: j.sid };
    const permanent = res.status >= 400 && res.status < 500 && res.status !== 429;
    return { ok: false, detail: `${permanent ? "permanent:" : ""}HTTP ${res.status}${j.code ? ` code ${j.code}` : ""}` };
  }
}

export const factory: AdapterFactory<TwilioSms> = { manifest, create: (creds, deps) => new TwilioSms(creds, deps) };
export { ALLOWED_HOSTS } from "./endpoints";

import { z } from "zod";
import { stripHeaderChars } from "@openshelf/shared";
import type {
  AdapterDeps, AdapterFactory, EmailMessage, EmailProvider, HealthResult, IntegrationCredentials, IntegrationManifest,
} from "@openshelf/integration-sdk";
import { assertAllowed, sendUrl, verifyAccountTokenUrl } from "./endpoints";

export const cfEmailSchema = z.object({
  config: z.object({
    accountId: z.string().regex(/^[0-9a-f]{32}$/i, "32-char hex Cloudflare account ID"),
    fromEmail: z.string().email().optional().or(z.literal("")),
  }),
  secrets: z.object({ apiToken: z.string().min(20) }),
});

export const manifest: IntegrationManifest = {
  id: "cf_email",
  name: "Cloudflare Email Service",
  description: "Transactional order e-mails via Cloudflare Email Sending (REST).",
  docsUrl: "https://developers.cloudflare.com/email-service/api/send-emails/rest-api/",
  publicFields: [
    { key: "accountId", label: "Cloudflare Account ID", required: true, type: "text", placeholder: "32-character account id",
      help: "WARNING: Cloudflare Email Sending is in Beta. Sending to arbitrary recipients requires the Workers Paid plan; on the Free plan you can only send to verified destination addresses. The sender domain must be onboarded to Email Sending (DNS records verified) before the From address works." },
    { key: "fromEmail", label: "Default From address", type: "text", placeholder: "orders@yourdomain.com", help: "Must be on a domain onboarded to Cloudflare Email Sending. Settings > Notifications > From e-mail overrides it." },
  ],
  secretFields: [{ key: "apiToken", label: "API token", secret: true, required: true, type: "password", help: "Cloudflare API token with permission to send email (Email Sending: Send/Edit)." }],
  schema: cfEmailSchema,
};

const EMAIL = /^[^\s@<>",;]+@[^\s@<>",;]+\.[^\s@<>",;]+$/;
export const isPlainEmail = (s: string) => EMAIL.test(s) && !/[\r\n]/.test(s);

export class CfEmail implements EmailProvider {
  readonly id = "cf_email" as const;
  private p: z.infer<typeof cfEmailSchema>;
  constructor(creds: IntegrationCredentials, private deps: AdapterDeps) { this.p = cfEmailSchema.parse({ config: creds.config, secrets: creds.secrets }); }
  private headers() { return { authorization: `Bearer ${this.p.secrets.apiToken}`, "content-type": "application/json" }; }
  async validateConfig(): Promise<void> { /* parsed in constructor */ }

  async healthCheck(): Promise<HealthResult> {
    try {
      const url = verifyAccountTokenUrl(this.p.config.accountId);
      assertAllowed(url);
      const res = await this.deps.fetch(url, { method: "GET", headers: this.headers() });
      if (!res.ok) return { ok: false, detail: res.status === 401 || res.status === 403 ? "token rejected" : `HTTP ${res.status}` };
      const j = (await res.json().catch(() => ({}))) as { success?: boolean; result?: { status?: string } };
      return j.success && j.result?.status === "active" ? { ok: true, detail: "token active (sending permission not verified)" } : { ok: false, detail: `token status: ${String(j.result?.status ?? "unknown").slice(0, 30)}` };
    } catch (e) { return { ok: false, detail: e instanceof Error ? e.message : "network error" }; }
  }

  async send(msg: EmailMessage): Promise<{ ok: boolean; providerMessageId?: string; detail?: string }> {
    const from = (msg.from || this.p.config.fromEmail || "").trim();
    if (!isPlainEmail(msg.to)) return { ok: false, detail: "permanent:invalid_recipient" };
    if (!isPlainEmail(from)) return { ok: false, detail: "permanent:invalid_sender" };
    const subject = stripHeaderChars(msg.subject).slice(0, 200);
    if (!subject) return { ok: false, detail: "permanent:empty_subject" };
    const name = msg.fromName ? stripHeaderChars(msg.fromName).replace(/["<>\\]/g, "").slice(0, 80) : "";
    const url = sendUrl(this.p.config.accountId);
    assertAllowed(url);
    const res = await this.deps.fetch(url, {
      method: "POST", headers: this.headers(),
      body: JSON.stringify({
        to: msg.to, from: name ? `${name} <${from}>` : from, subject, html: msg.html, text: msg.text,
        ...(msg.cc && isPlainEmail(msg.cc) ? { cc: [msg.cc] } : {}), ...(msg.replyTo && isPlainEmail(msg.replyTo) ? { reply_to: msg.replyTo } : {}),
      }),
    });
    const j = (await res.json().catch(() => ({}))) as { success?: boolean; errors?: { code?: number; message?: string }[]; result?: { delivered?: string[]; permanent_bounces?: string[]; queued?: string[] } | null };
    if (res.ok && j.success) {
      if (j.result?.permanent_bounces?.length) return { ok: false, detail: "permanent:bounced" };
      return { ok: true, providerMessageId: j.result?.queued?.length ? "queued" : "delivered" };
    }
    const permanent = res.status >= 400 && res.status < 500 && res.status !== 429;
    const e = j.errors?.[0];
    return { ok: false, detail: `${permanent ? "permanent:" : ""}HTTP ${res.status}${e?.code ? ` code ${e.code}` : ""}${e?.message ? " " + String(e.message).slice(0, 120) : ""}` };
  }
}

export const factory: AdapterFactory<CfEmail> = { manifest, create: (creds, deps) => new CfEmail(creds, deps) };
export { ALLOWED_HOSTS } from "./endpoints";

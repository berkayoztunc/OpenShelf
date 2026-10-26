import { z } from "zod";
import type { IntegrationManifest } from "@openshelf/integration-sdk";
import type { ProviderId } from "@openshelf/shared";

/**
 * Copies of the real manifests' form fields (so admin forms render the same in mock mode). The worker overlays the real
 * manifest when the real package is installed. Schema is intentionally lenient: mock mode never needs real secrets.
 */
const lenient = z.object({ config: z.record(z.unknown()), secrets: z.record(z.string()) });
const m = (id: ProviderId, name: string, description: string, publicFields: IntegrationManifest["publicFields"], secretFields: IntegrationManifest["secretFields"], docsUrl?: string): IntegrationManifest =>
  ({ id, name, description, docsUrl, publicFields, secretFields, schema: lenient });
const pw = (key: string, label: string, help?: string) => ({ key, label, secret: true, required: true, type: "password" as const, ...(help ? { help } : {}) });

export const mockManifests: Record<ProviderId, IntegrationManifest> = {
  iyzico: m("iyzico", "iyzico", "iyzico CheckoutForm (hosted payment page). Card data never touches this server.", [
    { key: "environment", label: "Ortam", type: "select", required: true, options: [{ value: "sandbox", label: "Sandbox" }, { value: "production", label: "Canlı" }] },
    { key: "allowPaidPriceDiff", label: "Taksit komisyonuna izin ver (paidPrice > price)", type: "boolean" },
  ], [pw("apiKey", "API Key"), pw("secretKey", "Secret Key")], "https://docs.iyzico.com"),
  geliver: m("geliver", "Geliver", "Çoklu kargo firması: teklif, etiket, takip, iptal.", [
    { key: "test", label: "Test modu (ücretsiz test gönderileri)", type: "boolean" },
    { key: "senderAddressId", label: "Gönderici adres ID (Geliver)", type: "text", required: true },
    { key: "returnAddressId", label: "İade adres ID", type: "text" },
    { key: "storeUrl", label: "Mağaza URL", type: "url" },
  ], [pw("apiToken", "API Token")], "https://docs.geliver.io"),
  efaturam: m("efaturam", "Trendyol e-Faturam", "e-Fatura / e-Arşiv fatura kesme. Web siparişi kapsamı için e-Faturam sözleşmenizi doğrulayın.", [
    { key: "baseUrl", label: "Servis URL", type: "url", required: true },
    { key: "verifyTaxpayer", label: "Vergi no e-Fatura mükellefi sorgula", type: "boolean" },
    { key: "seriesPrefixEFatura", label: "e-Fatura seri (3 harf)", type: "text" },
    { key: "seriesPrefixEArsiv", label: "e-Arşiv seri (3 harf)", type: "text" },
  ], [pw("username", "Kullanıcı adı"), pw("password", "Şifre")]),
  trendyol: m("trendyol", "Trendyol Marketplace", "Stock/price push, order import and shipment updates for your Trendyol seller account.", [
    { key: "supplierId", label: "Supplier (Seller) ID", required: true, type: "text" },
    { key: "environment", label: "Environment", type: "select", options: [{ value: "production", label: "Production" }, { value: "stage", label: "Stage" }], help: "Stage needs Trendyol IP whitelisting and DIFFERENT credentials than production." },
  ], [pw("apiKey", "API key"), pw("apiSecret", "API secret"),
    { key: "webhookUsername", label: "Webhook username (Basic auth)", secret: true, type: "password" }, { key: "webhookPassword", label: "Webhook password", secret: true, type: "password" }], "https://developers.trendyol.com/"),
  meta: m("meta", "Meta Pixel & Conversions API", "Server-side conversion events (CAPI) with browser Pixel deduplication and catalog feed.", [
    { key: "pixelId", label: "Pixel / Dataset ID", required: true, type: "text", placeholder: "1234567890" },
    { key: "apiVersion", label: "Graph API version", type: "text" },
    { key: "testEventCode", label: "Test event code", type: "text" },
  ], [pw("accessToken", "Conversions API access token")], "https://developers.facebook.com/docs/marketing-api/conversions-api"),
  ga4: m("ga4", "Google Analytics 4 (Measurement Protocol)", "Server-side purchase events via GA4 Measurement Protocol.", [
    { key: "measurementId", label: "Measurement ID", required: true, type: "text", placeholder: "G-XXXXXXXXXX" },
  ], [pw("apiSecret", "Measurement Protocol API secret")], "https://developers.google.com/analytics/devguides/collection/protocol/ga4"),
  netgsm: m("netgsm", "Netgsm (SMS)", "Transactional order SMS via Netgsm REST v2 (Turkish characters supported).", [
    { key: "msgheader", label: "Sender header (msgheader)", type: "text", placeholder: "MAGAZAM" },
  ], [pw("usercode", "Usercode (subscriber number)"), pw("password", "API password")], "https://www.netgsm.com.tr/dokuman/"),
  twilio: m("twilio", "Twilio (SMS)", "Transactional order SMS via Twilio Messages API.", [
    { key: "from", label: "From number / sender", type: "text" }, { key: "messagingServiceSid", label: "Messaging Service SID", type: "text" },
  ], [pw("accountSid", "Account SID"), pw("authToken", "Auth Token")], "https://www.twilio.com/docs/messaging"),
  cf_email: m("cf_email", "Cloudflare Email (Beta)", "Transactional e-mail via Cloudflare Email Sending (Workers Paid + Beta).", [
    { key: "accountId", label: "Account ID", type: "text", required: true }, { key: "fromDomain", label: "Verified sender domain", type: "text" },
  ], [pw("apiToken", "API token")], "https://developers.cloudflare.com/email-service/"),
};

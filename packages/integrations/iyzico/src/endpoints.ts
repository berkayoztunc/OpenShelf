// Verified against docs.iyzico.com (CF-Initialize, CF-Retrieve, Refund V2, Webhook, HMAC auth) on 2026-10.
export const HOSTS = {
  sandbox: "https://sandbox-api.iyzipay.com",
  production: "https://api.iyzipay.com",
} as const;
export const ALLOWED_HOSTS: readonly string[] = ["sandbox-api.iyzipay.com", "api.iyzipay.com"];

export const PATHS = {
  checkoutInitialize: "/payment/iyzipos/checkoutform/initialize/auth/ecom",
  checkoutRetrieve: "/payment/iyzipos/checkoutform/auth/ecom/detail",
  refundV2: "/v2/payment/refund",
  binCheck: "/payment/bin/check", // used as credential health probe
} as const;

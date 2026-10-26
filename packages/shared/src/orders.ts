export const ORDER_STATUSES = ["pending", "awaiting_payment", "paid", "fulfilling", "shipped", "delivered", "cancelled", "refunded"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ["awaiting_payment", "cancelled"],
  awaiting_payment: ["paid", "cancelled"],
  paid: ["fulfilling", "refunded", "cancelled"],
  fulfilling: ["shipped", "refunded", "cancelled"],
  shipped: ["delivered", "refunded"],
  delivered: ["refunded"],
  cancelled: [],
  refunded: [],
};
export const ORDER_SOURCES = ["website", "trendyol"] as const;
export type OrderSource = (typeof ORDER_SOURCES)[number];
export const PROVIDER_IDS = ["iyzico", "trendyol", "geliver", "efaturam", "meta", "ga4", "netgsm", "twilio", "cf_email"] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];
export const ROLES = ["owner", "admin", "staff"] as const;
export type Role = (typeof ROLES)[number];

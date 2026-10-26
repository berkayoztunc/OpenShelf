import { z } from "zod";

/** Canonical commerce events. GA4 names; Meta mapping below. Every event carries an event_id for browser/server dedup. */
export const EVENT_NAMES = [
  "page_view", "view_item_list", "view_item", "search", "add_to_cart",
  "begin_checkout", "add_payment_info", "purchase", "refund",
] as const;
export type EventName = (typeof EVENT_NAMES)[number];

export const META_EVENT_MAP: Record<EventName, string | null> = {
  page_view: "PageView", view_item_list: null, view_item: "ViewContent", search: "Search",
  add_to_cart: "AddToCart", begin_checkout: "InitiateCheckout", add_payment_info: "AddPaymentInfo",
  purchase: "Purchase", refund: null,
};

/** item id == product variant id == Meta content_id == GA4 item_id */
export const TrackItem = z.object({
  id: z.string(), name: z.string(), price: z.number(), quantity: z.number().int().positive().default(1),
  category: z.string().optional(), variant: z.string().optional(),
});
export type TrackItem = z.infer<typeof TrackItem>;

export const TrackEvent = z.object({
  event_id: z.string().uuid(),
  name: z.enum(EVENT_NAMES),
  currency: z.string().length(3).optional(),
  value: z.number().optional(),          // major units (e.g. 199.90)
  items: z.array(TrackItem).optional(),
  transaction_id: z.string().optional(),
  search_term: z.string().optional(),
  page_url: z.string().url().optional(),
});
export type TrackEvent = z.infer<typeof TrackEvent>;

export const ConsentState = z.object({
  necessary: z.literal(true).default(true),
  analytics: z.boolean().default(false),
  marketing: z.boolean().default(false),
});
export type ConsentState = z.infer<typeof ConsentState>;

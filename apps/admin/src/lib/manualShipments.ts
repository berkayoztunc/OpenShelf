import type { Tone } from "../components/ui";

export const MANUAL_SHIPMENT_STATUSES = ["created", "in_transit", "delivered", "returned", "cancelled"] as const;

export interface ManualRecipient { name: string; surname?: string; phone: string; email?: string; line1: string; line2?: string; city: string; district?: string; zip?: string }
export interface ManualShipment {
  id: string; reference: string; status: string; recipient: ManualRecipient; contents: string; note: string | null;
  customerId: string | null; orderId: string | null; weightKg: number; desi: number | null;
  provider: string; serviceId: string; carrier: string | null; trackingNumber: string | null; trackingUrl: string | null; labelUrl: string | null;
  createdAt: string; updatedAt: string;
  events?: { id: number; status: string; detail: string | null; at: string }[];
}
export interface RecipientSource { source: "customer" | "order"; label: string; detail: string; customerId?: string; orderId?: string; recipient: ManualRecipient }
export interface ShippingQuotes { provider: string; weightKg: number; testMode?: boolean; items: { carrier: string; serviceId: string; price: number; currency: string; etaDays?: number }[] }

export const shipmentTone = (s: string): Tone =>
  ({ created: "info", in_transit: "warning", delivered: "success", returned: "danger", cancelled: "neutral" } as Record<string, Tone>)[s] ?? "neutral";
export const recipientName = (r: ManualRecipient) => [r.name, r.surname].filter(Boolean).join(" ");

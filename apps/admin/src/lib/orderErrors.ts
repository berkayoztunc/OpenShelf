import { ApiError, errMsg } from "./api";
import { hasKey, tNow } from "../i18n";

export interface OrderFailure { message: string; link?: { to: string; label: string } }

/** Maps order action errors (status / refund / shipment / invoice) to a translated message; falls back to the server text. */
export function describeOrderError(e: unknown): OrderFailure {
  if (!(e instanceof ApiError)) return { message: errMsg(e) };
  const key = `orders.error.${e.code}`;
  if (!hasKey(key)) return { message: errMsg(e) };
  const link = e.code === "shipping_unavailable" || e.code === "invoicing_unavailable" ? { to: "/integrations", label: tNow("orders.error.openIntegrations") } : undefined;
  if (e.code === "refund_failed") {
    const d = (e.details as { detail?: string } | undefined)?.detail;
    return { message: tNow(key, { detail: d ? ` (${d})` : "" }) };
  }
  return { message: tNow(key), ...(link ? { link } : {}) };
}

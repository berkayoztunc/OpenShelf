import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import type { OrderView } from "../api/types";
import { useCart } from "../cart/CartContext";
import { useMoney } from "../components/Money";
import { ProductImage } from "../components/ProductImage";
import { useI18n } from "../i18n";
import type { MessageKey } from "../i18n/messages";
import { useHead } from "../lib/head";
import { pageTitle } from "../lib/seo";
import { useConfig } from "../store/ConfigContext";
import { getConsent, onConsentChange, trackPurchase } from "../tracking";

const WAITING = new Set(["pending", "awaiting_payment"]);

/** Order result/tracking. Also the ONLY place the browser `purchase` event is sent. */
export default function Order() {
  const { number = "" } = useParams();
  const [sp] = useSearchParams();
  const token = sp.get("t") ?? "";
  const { t } = useI18n();
  const { config } = useConfig();
  const money = useMoney();
  const { forget } = useCart();
  useHead({ title: pageTitle(config, t("order.title", { number })), noindex: true });

  const q = useQuery({
    queryKey: ["order", number, token],
    queryFn: () => api.order(number, token),
    enabled: !!number && !!token,
    // The payment callback can beat the webhook: poll briefly until the order leaves "waiting".
    refetchInterval: (query) => (query.state.data && WAITING.has(query.state.data.status) && query.state.dataUpdateCount < 20 ? 3000 : false),
  });
  const order: OrderView | undefined = q.data;

  const [, bump] = useState(0);
  useEffect(() => onConsentChange(() => bump((n) => n + 1)), []);
  const c = getConsent();
  useEffect(() => {
    if (!order) return;
    if (!WAITING.has(order.status)) forget(); // cart is consumed once the order exists beyond payment wait
    trackPurchase(order); // guards: paid status + purchaseEventId + once per order (sessionStorage)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order, c.analytics, c.marketing]);

  if (!token || q.isError) return <div role="alert" className="container-x py-24 text-center text-muted">{t("order.missing")}</div>;
  if (!order) return <div className="container-x py-16"><div className="skeleton h-40 max-w-2xl" /></div>;

  const waiting = WAITING.has(order.status);
  const failed = order.status === "cancelled";
  const cur = order.currency;
  return (
    <div className="container-x max-w-3xl py-10">
      <p role="status" className={`rounded-2xl p-4 text-sm font-medium ${failed ? "bg-danger-soft text-danger" : waiting ? "bg-warn-soft text-warn" : "bg-success-soft text-success"}`}>
        {failed ? t("order.paymentFailed") : waiting ? t("order.pendingPayment") : t("order.thanks")}
      </p>
      <h1 className="mt-6 font-display text-3xl font-semibold tracking-tight sm:text-4xl">{t("order.title", { number: order.orderNumber })}</h1>
      <p className="mt-1 text-sm text-muted">{t(`status.${order.status}` as MessageKey)}</p>

      <section className="card mt-8 p-6" aria-labelledby="oi">
        <h2 id="oi" className="font-display text-xl">{t("order.items")}</h2>
        <ul className="mt-4 divide-y divide-line">
          {order.items.map((i) => (
            <li key={i.variantId} className="flex items-center gap-4 py-3 text-sm">
              <div className="relative size-16 shrink-0 overflow-hidden rounded-xl bg-line"><ProductImage src={i.imageUrl} alt="" title={i.title} className="absolute inset-0 size-full object-cover" /></div>
              <div className="flex-1"><p>{i.title}</p><p className="text-xs text-muted">{i.variantTitle} × {i.quantity}</p></div>
              <p className="font-medium">{money(i.unitPrice * i.quantity, cur)}</p>
            </li>
          ))}
        </ul>
        <dl className="mt-4 space-y-1 border-t border-line pt-4 text-sm">
          {order.shipping !== undefined && <div className="flex justify-between"><dt>{t("cart.shipping")}</dt><dd>{order.shipping === 0 ? t("cart.free") : money(order.shipping, cur)}</dd></div>}
          <div className="flex justify-between text-base font-semibold"><dt>{t("cart.total")}</dt><dd>{money(order.total, cur)}</dd></div>
        </dl>
      </section>

      {order.shipment && (
        <section className="card mt-6 p-6" aria-labelledby="os">
          <h2 id="os" className="font-display text-xl">{t("order.tracking")}</h2>
          <dl className="mt-3 space-y-1 text-sm">
            {order.shipment.carrier && <div className="flex justify-between"><dt className="text-muted">{t("order.carrier")}</dt><dd>{order.shipment.carrier}</dd></div>}
            {order.shipment.trackingNumber && <div className="flex justify-between"><dt className="text-muted">{t("order.trackingNo")}</dt><dd>{order.shipment.trackingNumber}</dd></div>}
          </dl>
          {order.shipment.trackingUrl && /^https?:\/\//.test(order.shipment.trackingUrl) && <a className="btn-ghost mt-4" href={order.shipment.trackingUrl} target="_blank" rel="noopener noreferrer">{t("order.trackLink")}</a>}
        </section>
      )}
      <Link to="/products" className="btn-primary mt-8">{t("cart.continue")}</Link>
    </div>
  );
}

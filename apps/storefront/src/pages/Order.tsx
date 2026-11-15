import { useEffect, useState, type ReactNode } from "react";
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
import { ArrowIcon, CheckIcon, CloseIcon, HomeIcon, PackageIcon, ReturnIcon, SupportIcon, TruckIcon } from "../lib/Icons";
import { pageTitle } from "../lib/seo";
import { useConfig } from "../store/ConfigContext";
import { getConsent, onConsentChange, trackPurchase } from "../tracking";

const WAITING = new Set(["pending", "awaiting_payment"]);
/** How far along the happy path each status is: index of the step that is currently active (4 = everything done). */
const PROGRESS: Partial<Record<OrderView["status"], number>> = { pending: 0, awaiting_payment: 0, paid: 1, fulfilling: 1, shipped: 2, delivered: 4 };
const STEPS = ["received", "preparing", "shipped", "delivered"] as const;

function Progress({ at }: { at: number }) {
  const { t } = useI18n();
  return (
    <ol aria-label={t("order.stepsLabel")} className="mt-7 grid grid-cols-4 gap-1">
      {STEPS.map((s, i) => {
        const done = i < at; const active = i === at;
        return (
          <li key={s} aria-current={active ? "step" : undefined} className="relative flex flex-col items-center text-center">
            {i > 0 && <span aria-hidden className={`absolute right-1/2 top-4 h-0.5 w-full -translate-y-1/2 ${done || active ? "bg-brand-600" : "bg-line"}`} />}
            <span className={`relative z-10 grid size-8 place-items-center rounded-full text-xs font-bold ${done ? "bg-brand-600 text-white" : active ? "bg-surface text-brand-ink ring-2 ring-brand-600" : "bg-surface text-faint ring-1 ring-line"}`}>
              {done ? <CheckIcon size={15} strokeWidth={3} /> : i + 1}
            </span>
            <span className={`mt-2 text-xs sm:text-sm ${done || active ? "font-medium text-ink" : "text-muted"}`}>{t(`order.step.${s}`)}</span>
          </li>
        );
      })}
    </ol>
  );
}

const Panel = ({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) => (
  <section className="card p-5">
    <h2 className="flex items-center gap-2 text-sm font-semibold"><span aria-hidden className="grid size-7 place-items-center rounded-full bg-brand-50 text-brand-ink">{icon}</span>{title}</h2>
    <div className="mt-3 text-sm">{children}</div>
  </section>
);

/** Order result/tracking. Also the ONLY place the browser `purchase` event is sent. */
export default function Order() {
  const { number = "" } = useParams();
  const [sp] = useSearchParams();
  const token = sp.get("t") ?? "";
  const { t, locale } = useI18n();
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
  if (!order) return <div className="container-x max-w-5xl py-12"><div className="skeleton h-44" /><div className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]"><div className="skeleton h-72" /><div className="skeleton h-72" /></div></div>;

  const waiting = WAITING.has(order.status);
  const failed = order.status === "cancelled";
  const refunded = order.status === "refunded";
  const kind = failed ? "failed" : refunded ? "refunded" : waiting ? "pending" : "thanks";
  const tone = failed ? "bg-danger-soft text-danger" : waiting || refunded ? "bg-warn-soft text-warn" : "bg-success-soft text-success";
  const cur = order.currency;
  const g = config.general;
  const a = order.shippingAddress;
  const date = order.createdAt ? new Intl.DateTimeFormat(locale === "tr" ? "tr-TR" : "en-GB", { dateStyle: "long", timeStyle: "short" }).format(new Date(order.createdAt)) : null;
  const at = PROGRESS[order.status];
  const discount = order.discount ?? 0; const tax = order.tax ?? 0;
  const trackUrl = order.shipment?.trackingUrl && /^https?:\/\//.test(order.shipment.trackingUrl) ? order.shipment.trackingUrl : null;
  return (
    <div className="container-x max-w-5xl py-8 sm:py-12">
      <section className="card p-6 sm:p-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <span aria-hidden className={`grid size-14 shrink-0 place-items-center rounded-full ${tone}`}>
            {failed ? <CloseIcon size={26} /> : refunded ? <ReturnIcon size={24} /> : waiting ? <span className="size-6 animate-spin rounded-full border-[3px] border-current border-t-transparent" /> : <CheckIcon size={28} strokeWidth={2.5} />}
          </span>
          <div className="min-w-0 flex-1">
            <p role="status" className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">{t(`order.${kind}Title`)}</p>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">{t(`order.${kind}Body`)}</p>
            {kind === "thanks" && order.email && <p className="mt-1 text-sm text-muted">{t("order.emailSent", { email: order.email })}</p>}
            <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-2 text-sm">
              <div><dt className="text-xs uppercase tracking-wide text-muted">{t("order.numberLabel")}</dt><dd className="font-mono font-medium"><h1 className="inline text-sm">{order.orderNumber}</h1></dd></div>
              {date && <div><dt className="text-xs uppercase tracking-wide text-muted">{t("order.dateLabel")}</dt><dd className="font-medium">{date}</dd></div>}
              <div><dt className="text-xs uppercase tracking-wide text-muted">{t("order.stepsLabel")}</dt><dd><span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${tone}`}>{t(`status.${order.status}` as MessageKey)}</span></dd></div>
            </dl>
          </div>
        </div>
        {at !== undefined && <Progress at={at} />}
      </section>

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[1fr_340px]">
        <section className="card p-5 sm:p-6" aria-labelledby="oi">
          <h2 id="oi" className="font-display text-xl font-semibold">{t("order.items")}</h2>
          <ul className="mt-2 divide-y divide-line">
            {order.items.map((i) => {
              const img = <div className="relative aspect-[4/5] w-20 shrink-0 overflow-hidden rounded-xl bg-line ring-1 ring-ink/[.07] sm:w-24"><ProductImage src={i.imageUrl} alt="" title={i.title} className="absolute inset-0 size-full object-cover" /></div>;
              return (
                <li key={i.variantId} className="flex gap-4 py-4">
                  {i.productSlug ? <Link to={`/product/${i.productSlug}`} aria-label={t("order.viewProduct", { name: i.title })} className="shrink-0 transition hover:opacity-90">{img}</Link> : img}
                  <div className="flex min-w-0 flex-1 flex-col justify-between gap-2 sm:flex-row sm:items-start">
                    <div className="min-w-0">
                      {i.productSlug ? <Link to={`/product/${i.productSlug}`} className="font-medium hover:underline">{i.title}</Link> : <p className="font-medium">{i.title}</p>}
                      {i.variantTitle && <p className="mt-0.5 text-sm text-muted">{i.variantTitle}</p>}
                      <p className="mt-1.5 text-sm text-muted">{t("order.qty", { n: i.quantity })}{i.quantity > 1 && <> · {t("order.each", { price: money(i.unitPrice, cur) })}</>}</p>
                    </div>
                    <p className="shrink-0 font-semibold tabular-nums">{money(i.unitPrice * i.quantity, cur)}</p>
                  </div>
                </li>
              );
            })}
          </ul>
          <dl className="space-y-2 border-t border-line pt-4 text-sm">
            {order.subtotal !== undefined && <div className="flex justify-between"><dt className="text-muted">{t("cart.subtotal")}</dt><dd className="tabular-nums">{money(order.subtotal, cur)}</dd></div>}
            {discount > 0 && <div className="flex justify-between text-success"><dt>{t("cart.discount")}{order.couponCode && <span className="ml-1.5 text-xs">({t("order.coupon", { code: order.couponCode })})</span>}</dt><dd className="tabular-nums">−{money(discount, cur)}</dd></div>}
            {order.shipping !== undefined && <div className="flex justify-between"><dt className="text-muted">{t("cart.shipping")}</dt><dd className="tabular-nums">{order.shipping === 0 ? t("cart.free") : money(order.shipping, cur)}</dd></div>}
            {tax > 0 && !g.pricesIncludeTax && <div className="flex justify-between"><dt className="text-muted">{t("order.tax")}</dt><dd className="tabular-nums">{money(tax, cur)}</dd></div>}
            <div className="flex items-baseline justify-between border-t border-line pt-3 text-base font-semibold"><dt>{t("cart.total")}</dt><dd className="text-2xl tabular-nums">{money(order.total, cur)}</dd></div>
            {tax > 0 && g.pricesIncludeTax && <p className="text-right text-xs text-muted">{t("order.taxIncluded", { amount: money(tax, cur) })}</p>}
          </dl>
        </section>

        <aside className="space-y-4">
          {a && (a.line1 || a.fullName) && (
            <Panel icon={<HomeIcon size={15} />} title={t("order.address")}>
              <address className="not-italic leading-relaxed text-muted">
                {a.fullName && <span className="block font-medium text-ink">{a.fullName}</span>}
                {a.line1 && <span className="block">{a.line1}</span>}
                {a.line2 && <span className="block">{a.line2}</span>}
                <span className="block">{[a.district, a.city].filter(Boolean).join(" / ")}{a.postalCode ? ` ${a.postalCode}` : ""}</span>
                {a.phone && <span className="mt-1 block">{a.phone}</span>}
              </address>
            </Panel>
          )}
          {!failed && !refunded && (
            <Panel icon={<TruckIcon size={15} />} title={t("order.tracking")}>
              {order.shipment && (order.shipment.carrier || order.shipment.trackingNumber) ? (
                <>
                  <dl className="space-y-1.5">
                    {order.shipment.carrier && <div className="flex justify-between gap-3"><dt className="text-muted">{t("order.carrier")}</dt><dd className="font-medium">{order.shipment.carrier}</dd></div>}
                    {order.shipment.trackingNumber && <div className="flex justify-between gap-3"><dt className="text-muted">{t("order.trackingNo")}</dt><dd className="font-mono font-medium">{order.shipment.trackingNumber}</dd></div>}
                  </dl>
                  {trackUrl && <a className="btn-ghost mt-4 w-full" href={trackUrl} target="_blank" rel="noopener noreferrer">{t("order.trackLink")}<ArrowIcon size={15} /></a>}
                </>
              ) : <p className="flex gap-2 text-muted"><PackageIcon size={16} className="mt-0.5 shrink-0" />{t("order.noTracking")}</p>}
            </Panel>
          )}
          {(g.contactEmail || g.contactPhone) && (
            <Panel icon={<SupportIcon size={15} />} title={t("order.help")}>
              <p className="text-muted">{t("order.helpBody")}</p>
              <ul className="mt-2 space-y-1">
                {g.contactEmail && <li><a className="font-medium underline-offset-2 hover:underline" href={`mailto:${g.contactEmail}?subject=${encodeURIComponent(order.orderNumber)}`}>{g.contactEmail}</a></li>}
                {g.contactPhone && <li><a className="font-medium underline-offset-2 hover:underline" href={`tel:${g.contactPhone.replace(/\s/g, "")}`}>{g.contactPhone}</a></li>}
              </ul>
            </Panel>
          )}
        </aside>
      </div>

      <div className="mt-8 flex flex-wrap gap-3">
        {failed && <Link to="/cart" className="btn-primary">{t("order.retry")}</Link>}
        <Link to="/products" className={failed ? "btn-ghost" : "btn-primary"}>{t("cart.continue")}</Link>
      </div>
    </div>
  );
}

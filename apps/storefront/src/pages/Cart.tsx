import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useCart } from "../cart/CartContext";
import { CartLines } from "../components/CartLines";
import { CheckoutSteps } from "../components/CheckoutSteps";
import { ShippingProgress } from "../components/CartDrawer";
import { BagIcon, LockIcon } from "../lib/Icons";
import { useMoney } from "../components/Money";
import { useI18n } from "../i18n";
import { useHead } from "../lib/head";
import { pageTitle } from "../lib/seo";
import { useConfig } from "../store/ConfigContext";

export default function CartPage() {
  const { t } = useI18n();
  const { config } = useConfig();
  const money = useMoney();
  const { cart, totals, currency, applyCoupon, busy } = useCart();
  const [code, setCode] = useState("");
  const [err, setErr] = useState(false);
  useHead({ title: pageTitle(config, t("cart.title")), noindex: true });
  const empty = !cart || cart.items.length === 0;
  const threshold = config.checkout.freeShippingThreshold;

  const coupon = async (e: FormEvent) => {
    e.preventDefault(); setErr(false);
    if (!code.trim()) return;
    try { await applyCoupon(code.trim()); setCode(""); } catch { setErr(true); }
  };

  return (
    <div className="container-x py-8 sm:py-12">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">{t("cart.title")}</h1>
        {!empty && <CheckoutSteps current={1} />}
      </div>
      {empty ? (
        <div className="py-20 text-center">
          <span className="mx-auto grid size-20 place-items-center rounded-full bg-brand-50 text-brand-ink"><BagIcon size={34} /></span>
          <p className="mt-6 font-display text-2xl">{t("cart.empty")}</p>
          <p className="mt-1 text-muted">{t("cart.emptyHint")}</p>
          <Link to="/products" className="btn-primary mt-7">{t("cart.continue")}</Link>
        </div>
      ) : (
        <div className="mt-8 grid items-start gap-8 lg:grid-cols-[1fr_400px] lg:gap-10">
          <div className="card px-5 sm:px-6"><CartLines /></div>
          <aside className="card h-fit space-y-5 p-6 lg:sticky lg:top-28" aria-label={t("cart.total")}>
            <ShippingProgress subtotal={totals.subtotal} />
            <form onSubmit={(e) => void coupon(e)} className="flex gap-2">
              <label htmlFor="coupon" className="sr-only">{t("cart.coupon")}</label>
              <input id="coupon" className="field" placeholder={t("cart.coupon")} value={code} onChange={(e) => setCode(e.target.value)} aria-invalid={err} aria-describedby={err ? "coupon-err" : undefined} />
              <button className="btn-ghost" disabled={busy}>{t("cart.apply")}</button>
            </form>
            {err && <p id="coupon-err" role="alert" className="text-sm text-danger">{t("cart.couponError")}</p>}
            <dl className="space-y-2.5 text-sm">
              <div className="flex justify-between"><dt className="text-muted">{t("cart.subtotal")}</dt><dd className="tabular-nums">{money(totals.subtotal, currency)}</dd></div>
              {totals.discount > 0 && <div className="flex justify-between text-success"><dt>{t("cart.discount")}</dt><dd className="tabular-nums">−{money(totals.discount, currency)}</dd></div>}
              <div className="flex justify-between"><dt className="text-muted">{t("cart.shipping")}</dt><dd className="tabular-nums">{totals.shipping === 0 ? t("cart.free") : money(totals.shipping, currency)}</dd></div>
              <div className="flex items-baseline justify-between border-t border-line pt-4 text-base font-semibold"><dt>{t("cart.total")}</dt><dd className="text-2xl tabular-nums">{money(totals.total, currency)}</dd></div>
            </dl>
            {threshold != null && totals.shipping > 0 && <p className="text-xs text-muted">{t("cart.freeFrom", { amount: money(threshold, currency) })}</p>}
            <Link to="/checkout" className="btn-primary w-full !min-h-12 !text-base">{t("cart.checkout")}</Link>
            <p className="flex items-center justify-center gap-1.5 text-xs text-muted"><LockIcon size={13} />{t("cart.secure")}</p>
          </aside>
        </div>
      )}
    </div>
  );
}

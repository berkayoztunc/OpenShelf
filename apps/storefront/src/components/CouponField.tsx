import { useId, useState, type KeyboardEvent } from "react";
import { useCart } from "../cart/CartContext";
import { useI18n } from "../i18n";

/**
 * Discount-code input. Deliberately not a <form>: the checkout summary already lives
 * inside the checkout <form>, and nested forms are invalid HTML. Enter applies the code.
 */
export function CouponField({ className }: { className?: string }) {
  const { t } = useI18n();
  const { cart, applyCoupon, removeCoupon, busy } = useCart();
  const [code, setCode] = useState("");
  const [err, setErr] = useState(false);
  const id = useId();
  const errId = `${id}-err`;

  const apply = async () => {
    setErr(false);
    if (!code.trim()) return;
    try { await applyCoupon(code.trim()); setCode(""); } catch { setErr(true); }
  };
  const remove = async () => {
    setErr(false);
    try { await removeCoupon(); } catch { setErr(true); }
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") { e.preventDefault(); void apply(); }
  };

  return (
    <div className={className}>
      <div className="flex gap-2">
        <label htmlFor={id} className="sr-only">{t("cart.coupon")}</label>
        <input id={id} className="field" placeholder={t("cart.coupon")} value={code} onChange={(e) => setCode(e.target.value)} onKeyDown={onKey} aria-invalid={err} aria-describedby={err ? errId : undefined} autoComplete="off" />
        <button type="button" className="btn-ghost" disabled={busy} onClick={() => void apply()}>{t("cart.apply")}</button>
      </div>
      {err && <p id={errId} role="alert" className="mt-2 text-sm text-danger">{t("cart.couponError")}</p>}
      {cart?.couponCode && (
        <div className="mt-2 flex items-center justify-between gap-3 text-sm">
          <span className="text-success">{t("order.coupon", { code: cart.couponCode })}</span>
          <button type="button" className="text-muted underline underline-offset-2 hover:text-ink disabled:opacity-50" disabled={busy} onClick={() => void remove()} aria-label={t("cart.removeCouponLabel", { code: cart.couponCode })}>{t("cart.removeCoupon")}</button>
        </div>
      )}
    </div>
  );
}

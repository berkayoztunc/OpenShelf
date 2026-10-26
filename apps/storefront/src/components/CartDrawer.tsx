import { useEffect, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import { useCart } from "../cart/CartContext";
import { useConfig } from "../store/ConfigContext";
import { useI18n } from "../i18n";
import { BagIcon, CheckIcon, CloseIcon, LockIcon, TruckIcon } from "../lib/Icons";
import { CartLines } from "./CartLines";
import { useMoney } from "./Money";

/** Free-shipping progress: nudges the shopper toward the configured threshold. */
export function ShippingProgress({ subtotal }: { subtotal: number }) {
  const { t } = useI18n();
  const money = useMoney();
  const { config } = useConfig();
  const th = config.checkout.freeShippingThreshold;
  if (th == null || th <= 0) return null;
  const left = Math.max(0, th - subtotal);
  const pct = Math.min(100, Math.round((subtotal / th) * 100));
  return (
    <div className="rounded-xl bg-brand-50 p-3.5">
      <p className="flex items-center gap-2 text-[13px] font-medium">
        {left === 0 ? <CheckIcon size={16} className="text-success" /> : <TruckIcon size={16} className="text-brand-ink" />}
        {left === 0 ? t("cart.freeReached") : t("cart.freeAway", { amount: money(left) })}
      </p>
      <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-line-strong" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={t("trust.shipping")}>
        <div className="h-full rounded-full bg-brand-600 transition-[width] duration-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** Native <dialog>: focus trap, Esc to close and inert background come from the platform. */
export function CartDrawer() {
  const { t } = useI18n();
  const money = useMoney();
  const { cart, totals, currency, drawerOpen, setDrawerOpen } = useCart();
  const ref = useRef<HTMLDialogElement>(null);
  const loc = useLocation();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (drawerOpen && !d.open) d.showModal();
    if (!drawerOpen && d.open) d.close();
  }, [drawerOpen]);
  useEffect(() => { setDrawerOpen(false); }, [loc.pathname, setDrawerOpen]);

  const empty = !cart || cart.items.length === 0;
  return (
    <dialog
      ref={ref} aria-labelledby="drawer-title" onClose={() => setDrawerOpen(false)}
      onClick={(e) => { if (e.target === ref.current) setDrawerOpen(false); }}
      className="drawer fixed inset-y-0 right-0 left-auto m-0 h-dvh max-h-none w-full max-w-md border-l border-line bg-raised p-0 shadow-lift"
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 id="drawer-title" className="font-display text-xl font-semibold">{t("cart.title")}{!empty && <span className="ml-2 align-middle text-sm font-normal text-muted">{t("cart.items", { n: totals.itemCount })}</span>}</h2>
          <button className="icon-btn -mr-2" aria-label={t("cart.close")} onClick={() => setDrawerOpen(false)}><CloseIcon /></button>
        </div>
        {!empty && <div className="px-5 pt-4"><ShippingProgress subtotal={totals.subtotal} /></div>}
        <div className="flex-1 overflow-y-auto px-5">
          {empty ? (
            <div className="grid h-full place-items-center py-12 text-center">
              <div>
                <span className="mx-auto grid size-16 place-items-center rounded-full bg-brand-50 text-brand-ink"><BagIcon size={28} /></span>
                <p className="mt-5 font-display text-xl">{t("cart.empty")}</p>
                <p className="mt-1 text-sm text-muted">{t("cart.emptyHint")}</p>
                <Link to="/products" className="btn-primary mt-6">{t("cart.continue")}</Link>
              </div>
            </div>
          ) : <CartLines />}
        </div>
        {!empty && (
          <div className="space-y-3 border-t border-line bg-canvas/60 p-5">
            <div className="flex items-baseline justify-between"><span className="text-sm text-muted">{t("cart.subtotal")}</span><span className="text-xl font-semibold tabular-nums">{money(totals.subtotal, currency)}</span></div>
            <Link to="/checkout" className="btn-primary w-full !min-h-12 !text-base">{t("cart.checkout")}</Link>
            <Link to="/cart" className="btn-ghost w-full">{t("cart.view")}</Link>
            <p className="flex items-center justify-center gap-1.5 text-xs text-muted"><LockIcon size={13} />{t("cart.secure")}</p>
          </div>
        )}
      </div>
    </dialog>
  );
}

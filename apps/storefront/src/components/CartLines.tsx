import { Link } from "react-router-dom";
import { useCart } from "../cart/CartContext";
import { useI18n } from "../i18n";
import { MinusIcon, PlusIcon } from "../lib/Icons";
import { useMoney } from "./Money";
import { ProductImage } from "./ProductImage";

export function CartLines() {
  const { t } = useI18n();
  const money = useMoney();
  const { cart, currency, setQuantity, busy } = useCart();
  return (
    <ul className="divide-y divide-line">
      {cart?.items.map((i) => (
        <li key={i.variantId} className="flex gap-4 py-5">
          <div className="relative size-24 shrink-0 overflow-hidden rounded-xl bg-line ring-1 ring-ink/[.07]"><ProductImage src={i.imageUrl} alt="" title={i.title} className="absolute inset-0 size-full object-cover" /></div>
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex justify-between gap-3">
              <div className="min-w-0">
                {i.productSlug ? <Link to={`/product/${i.productSlug}`} className="line-clamp-2 text-sm font-medium leading-snug hover:text-brand-ink">{i.title}</Link> : <p className="line-clamp-2 text-sm font-medium">{i.title}</p>}
                {i.variantTitle && <p className="mt-0.5 text-xs text-muted">{i.variantTitle}</p>}
              </div>
              <p className="text-sm font-semibold tabular-nums">{money(i.unitPrice * i.quantity, currency)}</p>
            </div>
            <div className="mt-auto flex items-center justify-between pt-2">
              <div className="inline-flex items-center rounded-full border border-line bg-canvas" role="group" aria-label={`${t("product.quantity")}: ${i.title}`}>
                <button className="icon-btn !size-9 !rounded-full" aria-label={t("cart.decrease")} disabled={busy} onClick={() => void setQuantity(i.variantId, i.quantity - 1)}><MinusIcon size={16} /></button>
                <span className="w-7 text-center text-sm font-medium tabular-nums" aria-live="polite">{i.quantity}</span>
                <button className="icon-btn !size-9 !rounded-full" aria-label={t("cart.increase")} disabled={busy || (i.available !== undefined && i.quantity >= i.available)} onClick={() => void setQuantity(i.variantId, i.quantity + 1)}><PlusIcon size={16} /></button>
              </div>
              <button className="cursor-pointer text-xs text-muted underline-offset-2 transition hover:text-danger hover:underline" disabled={busy} onClick={() => void setQuantity(i.variantId, 0)}>{t("cart.remove")}</button>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

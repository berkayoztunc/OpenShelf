import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../api/client";
import type { Address, CheckoutResponse } from "../api/types";
import { useCart } from "../cart/CartContext";
import { CheckoutSteps } from "../components/CheckoutSteps";
import { useMoney } from "../components/Money";
import { ProductImage } from "../components/ProductImage";
import { ChevronIcon, LockIcon } from "../lib/Icons";
import { Turnstile, turnstileEnabled } from "../components/Turnstile";
import { useI18n } from "../i18n";
import { useHead } from "../lib/head";
import { pageTitle } from "../lib/seo";
import { legalTitle, useConfig } from "../store/ConfigContext";
import { getAttribution, getConsent, track } from "../tracking";

const emptyAddr = (): Address => ({ fullName: "", phone: "", line1: "", line2: "", city: "", district: "", postalCode: "", country: "TR" });

function AddressFields({ prefix, value, onChange, errors }: { prefix: string; value: Address; onChange: (a: Address) => void; errors: Set<string> }) {
  const { t } = useI18n();
  const f = (k: keyof Address, label: string, o: { required?: boolean; auto?: string; type?: string; span?: boolean } = {}) => {
    const id = `${prefix}-${k}`; const bad = errors.has(`${prefix}.${k}`);
    return (
      <div className={o.span ? "sm:col-span-2" : ""}>
        <label className="label" htmlFor={id}>{label}{o.required && <span aria-hidden> *</span>}</label>
        <input id={id} name={id} className="field" type={o.type ?? "text"} autoComplete={o.auto} required={o.required} aria-invalid={bad} aria-describedby={bad ? `${id}-e` : undefined}
          value={value[k] ?? ""} onChange={(e) => onChange({ ...value, [k]: e.target.value })} />
        {bad && <p id={`${id}-e`} className="mt-1 text-xs text-danger">{t("checkout.required")}</p>}
      </div>
    );
  };
  const p = prefix === "ship" ? "shipping" : "billing";
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {f("fullName", t("checkout.fullName"), { required: true, auto: `${p} name`, span: true })}
      {f("phone", t("checkout.phone"), { required: true, auto: "tel", type: "tel" })}
      {f("country", t("checkout.country"), { required: true, auto: `${p} country` })}
      {f("line1", t("checkout.line1"), { required: true, auto: `${p} address-line1`, span: true })}
      {f("line2", t("checkout.line2"), { auto: `${p} address-line2`, span: true })}
      {f("city", t("checkout.city"), { required: true, auto: `${p} address-level1` })}
      {f("district", t("checkout.district"), { auto: `${p} address-level2` })}
      {f("postalCode", t("checkout.postalCode"), { auto: `${p} postal-code` })}
    </div>
  );
}

const Section = ({ title, n, children }: { title: string; n: number; children: ReactNode }) => (
  <section className="card p-5 sm:p-7">
    <h2 className="mb-5 flex items-center gap-3 font-display text-xl font-semibold"><span aria-hidden className="grid size-7 place-items-center rounded-full bg-brand-50 font-sans text-xs font-bold text-brand-ink">{n}</span>{title}</h2>
    {children}
  </section>
);

export default function Checkout() {
  const { t } = useI18n();
  const { config } = useConfig();
  const money = useMoney();
  const { cart, totals, currency } = useCart();
  const [email, setEmail] = useState("");
  const [ship, setShip] = useState<Address>(emptyAddr);
  const [bill, setBill] = useState<Address>(emptyAddr);
  const [same, setSame] = useState(true);
  const [terms, setTerms] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [errors, setErrors] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payment, setPayment] = useState<CheckoutResponse["payment"] | null>(null);
  useHead({ title: pageTitle(config, t("checkout.title")), noindex: true });

  const items = cart?.items ?? [];
  const trackItems = items.map((i) => ({ id: i.variantId, name: i.title, price: i.unitPrice / 100, quantity: i.quantity, ...(i.category && { category: i.category }), ...(i.variantTitle && { variant: i.variantTitle }) }));

  // begin_checkout once per cart view (client only; `purchase` is NEVER fired here).
  const cartId = cart?.id;
  useEffect(() => {
    if (!cartId || !items.length) return;
    track("begin_checkout", { currency, value: totals.total / 100, items: trackItems }, { dedupeKey: cartId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartId, items.length]);

  if (!config.checkout.guestCheckout) return <div className="container-x py-20 text-center text-muted">{t("checkout.guestOff")}</div>;
  if (!items.length) return <div className="container-x py-20 text-center"><p className="text-muted">{t("checkout.emptyCart")}</p><Link to="/products" className="btn-primary mt-6">{t("cart.continue")}</Link></div>;

  if (payment) {
    return (
      <div className="container-x max-w-3xl py-10">
        <CheckoutSteps current={3} />
        <h1 className="mt-6 font-display text-3xl font-semibold">{t("checkout.payment")}</h1>
        <p className="mt-2 text-sm text-muted">{t("checkout.secure")}</p>
        {/* Hosted iyzico form: sandboxed, no same-origin access to our storage/cookies. */}
        {payment.htmlContent && <iframe title={t("checkout.payment")} srcDoc={payment.htmlContent} sandbox="allow-scripts allow-forms allow-popups allow-top-navigation-by-user-activation" className="mt-6 h-[720px] w-full rounded-xl border border-line bg-white" />}
      </div>
    );
  }

  const required: (keyof Address)[] = ["fullName", "phone", "line1", "city", "country"];
  const validate = () => {
    const e = new Set<string>();
    for (const k of required) { if (!ship[k]?.trim()) e.add(`ship.${k}`); if (!same && !bill[k]?.trim()) e.add(`bill.${k}`); }
    if (!/^\S+@\S+\.\S+$/.test(email)) e.add("email");
    if (!terms) e.add("terms");
    if (turnstileEnabled() && !token) e.add("captcha");
    setErrors(e);
    return e.size === 0;
  };

  const submit = async (ev: FormEvent) => {
    ev.preventDefault(); setError(null);
    if (!validate() || !cart) { document.querySelector<HTMLElement>("[aria-invalid='true']")?.focus(); return; }
    setSubmitting(true);
    track("add_payment_info", { currency, value: totals.total / 100, items: trackItems }, { dedupeKey: cart.id });
    const c = getConsent();
    try {
      const res = await api.checkout({
        cartId: cart.id, email: email.trim(), shippingAddress: ship, ...(same ? {} : { billingAddress: bill }),
        // Consent snapshot is stored on the order; server events honour it.
        consent: { analytics: c.analytics, marketing: c.marketing },
        attribution: getAttribution(),
        ...(token && { turnstileToken: token }), acceptedTerms: true,
      });
      try { sessionStorage.setItem("os_last_order", JSON.stringify({ n: res.orderNumber, t: res.trackingToken })); } catch { /* ignore */ }
      if (res.payment.redirectUrl) { window.location.assign(res.payment.redirectUrl); return; }
      if (res.payment.htmlContent) { setPayment(res.payment); setSubmitting(false); window.scrollTo({ top: 0 }); return; }
      window.location.assign(`/order/${encodeURIComponent(res.orderNumber)}?t=${encodeURIComponent(res.trackingToken)}`);
    } catch (e) {
      setSubmitting(false);
      setError(e instanceof ApiError && e.status !== 500 ? e.message : t("checkout.error"));
    }
  };

  const termsLabel = legalTitle(config, "distanceSales") && legalTitle(config, "kvkk") ? (() => {
    const parts = t("checkout.terms", { distance: "\u0000", kvkk: "\u0001" }).split(/(\u0000|\u0001)/);
    return parts.map((p, i) => p === "\u0000" ? <Link key={i} className="underline" target="_blank" to="/legal/distanceSales">{legalTitle(config, "distanceSales")}</Link>
      : p === "\u0001" ? <Link key={i} className="underline" target="_blank" to="/legal/kvkk">{legalTitle(config, "kvkk")}</Link> : <span key={i}>{p}</span>);
  })() : t("checkout.termsPlain");

  return (
    <div className="container-x py-8 sm:py-12">
      <Link to="/cart" className="inline-flex items-center gap-1 text-sm text-muted transition hover:text-ink"><ChevronIcon dir="left" size={16} />{t("checkout.back")}</Link>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">{t("checkout.title")}</h1>
        <CheckoutSteps current={2} />
      </div>
      <form onSubmit={(e) => void submit(e)} noValidate className="mt-8 grid items-start gap-8 lg:grid-cols-[1fr_420px] lg:gap-10">
        <div className="space-y-6">
          <Section n={1} title={t("checkout.contact")}>
            <label className="label" htmlFor="email">{t("checkout.email")} *</label>
            <input id="email" name="email" type="email" className="field" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={errors.has("email")} />
            {errors.has("email") && <p className="mt-1 text-xs text-danger">{t("checkout.required")}</p>}
          </Section>
          <Section n={2} title={t("checkout.shipping")}><AddressFields prefix="ship" value={ship} onChange={setShip} errors={errors} /></Section>
          <Section n={3} title={t("checkout.billing")}>
            <label className="flex items-center gap-3 text-sm"><input type="checkbox" className="size-5 accent-[var(--color-brand-600)]" checked={same} onChange={(e) => setSame(e.target.checked)} />{t("checkout.sameBilling")}</label>
            {!same && <div className="mt-4"><AddressFields prefix="bill" value={bill} onChange={setBill} errors={errors} /></div>}
          </Section>
        </div>
        <aside className="card h-fit space-y-5 p-6 lg:sticky lg:top-28" aria-label={t("checkout.summary")}>
          <h2 className="font-display text-xl font-semibold">{t("checkout.summary")}</h2>
          <ul className="space-y-3 text-sm">
            {items.map((i) => (
              <li key={i.variantId} className="flex gap-3">
                <div className="relative size-16 shrink-0 overflow-hidden rounded-xl bg-line ring-1 ring-ink/[.07]"><ProductImage src={i.imageUrl} alt="" title={i.title} className="absolute inset-0 size-full object-cover" /><span aria-hidden className="absolute right-0.5 top-0.5 grid min-w-5 place-items-center rounded-full bg-ink px-1 text-[10px] font-bold text-canvas">{i.quantity}</span></div>
                <div className="min-w-0 flex-1"><p className="line-clamp-2">{i.title}</p><p className="text-xs text-muted">{i.variantTitle} × {i.quantity}</p></div>
                <p className="font-medium">{money(i.unitPrice * i.quantity, currency)}</p>
              </li>
            ))}
          </ul>
          <dl className="space-y-2.5 border-t border-line pt-5 text-sm">
            <div className="flex justify-between"><dt>{t("cart.subtotal")}</dt><dd>{money(totals.subtotal, currency)}</dd></div>
            {totals.discount > 0 && <div className="flex justify-between text-success"><dt>{t("cart.discount")}</dt><dd>−{money(totals.discount, currency)}</dd></div>}
            <div className="flex justify-between"><dt>{t("cart.shipping")}</dt><dd>{totals.shipping === 0 ? t("cart.free") : money(totals.shipping, currency)}</dd></div>
            <div className="flex items-baseline justify-between border-t border-line pt-4 text-base font-semibold"><dt>{t("cart.total")}</dt><dd className="text-2xl tabular-nums">{money(totals.total, currency)}</dd></div>
          </dl>
          <div>
            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" className="mt-0.5 size-5 shrink-0 accent-[var(--color-brand-600)]" checked={terms} onChange={(e) => setTerms(e.target.checked)} aria-invalid={errors.has("terms")} aria-describedby={errors.has("terms") ? "terms-e" : undefined} />
              <span>{termsLabel}</span>
            </label>
            {errors.has("terms") && <p id="terms-e" role="alert" className="mt-1 text-xs text-danger">{t("checkout.termsRequired")}</p>}
          </div>
          <Turnstile onToken={setToken} />
          {errors.has("captcha") && <p role="alert" className="text-xs text-danger">{t("checkout.captcha")}</p>}
          {error && <p role="alert" className="rounded-xl bg-danger-soft p-3 text-sm text-danger">{error}</p>}
          <button className="btn-primary w-full !min-h-12 !text-base" disabled={submitting}><LockIcon size={16} />{submitting ? t("checkout.paying") : t("checkout.pay")}</button>
          <p className="flex items-start gap-2 text-xs text-muted"><LockIcon size={14} className="mt-px shrink-0" />{t("checkout.secure")}</p>
        </aside>
      </form>
    </div>
  );
}

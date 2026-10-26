import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Eye, EyeOff, Info, Inbox, X } from "lucide-react";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { HelpTip } from "./help/HelpTip";
import { PageHelp } from "./help/PageHelp";
import { useT } from "../i18n";
import { errMsg } from "../lib/api";

export const cx = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(" ");

/* ---------- Button ---------- */
type Variant = "primary" | "secondary" | "ghost" | "danger";
const variants: Record<Variant, string> = {
  primary: "bg-brand-600 text-white shadow-[0_1px_0_rgb(255_255_255/.16)_inset,0_1px_2px_rgb(0_0_0/.12)] hover:bg-brand-700",
  secondary: "bg-surface text-ink border border-line shadow-[0_1px_2px_rgb(28_25_23/.05)] hover:border-line-strong hover:bg-canvas dark:bg-raised dark:hover:bg-hover",
  ghost: "text-ink hover:bg-hover",
  danger: "bg-red-600 text-white shadow-[0_1px_2px_rgb(0_0_0/.12)] hover:bg-red-700",
};
export function Button({ variant = "primary", size = "md", loading, className, children, disabled, type = "button", ...p }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md"; loading?: boolean }) {
  return (
    <button type={type} disabled={disabled || loading} aria-busy={loading || undefined}
      className={cx("inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium transition duration-150 active:scale-[.98] disabled:pointer-events-none disabled:opacity-50",
        size === "sm" ? "h-8 px-3 text-[13px]" : "h-9 px-4 text-sm", variants[variant], className)} {...p}>
      {loading && <Spinner className="h-4 w-4" />}{children}
    </button>
  );
}

export function Spinner({ className }: { className?: string }) {
  const { t } = useT();
  return <svg role="status" aria-label={t("ui.loading")} className={cx("animate-spin", className ?? "h-5 w-5")} viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity=".25" /><path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg>;
}

/* ---------- Form controls ---------- */
const control = "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink shadow-[0_1px_2px_rgb(28_25_23/.04)] transition placeholder:text-faint hover:border-line-strong focus:border-brand-600 focus:ring-4 focus:ring-brand-600/15 disabled:opacity-60 aria-[invalid=true]:border-danger aria-[invalid=true]:ring-danger/15 dark:bg-canvas dark:shadow-none";
export function Field({ label, hint, error, children, htmlFor, required, help, guide }: { label: string; hint?: ReactNode; error?: string; children: ReactNode; htmlFor?: string; required?: boolean; help?: string; guide?: string }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1">
        <label htmlFor={htmlFor} className="block text-[13px] font-medium">{label}{required && <span aria-hidden className="ml-0.5 text-danger"> *</span>}</label>
        {help && <HelpTip id={help} guide={guide} />}
      </div>
      {children}
      {hint && <p className="text-xs text-muted">{hint}</p>}
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
    </div>
  );
}
/** `help` = id of a `help.<id>.*` dictionary entry (rich "?" explanation); `guide` = optional "section#anchor" link into the guide. */
type FieldProps = { label: string; hint?: ReactNode; error?: string; help?: string; guide?: string };
export function TextField({ label, hint, error, help, guide, className, id, ...p }: FieldProps & InputHTMLAttributes<HTMLInputElement>) {
  const gen = useId(); const i = id ?? gen;
  return <Field label={label} hint={hint} error={error} help={help} guide={guide} htmlFor={i} required={p.required}><input id={i} aria-invalid={!!error || undefined} aria-required={p.required || undefined} className={cx(control, className)} {...p} required={undefined} /></Field>;
}
export function TextArea({ label, hint, error, help, guide, className, id, ...p }: FieldProps & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const gen = useId(); const i = id ?? gen;
  return <Field label={label} hint={hint} error={error} help={help} guide={guide} htmlFor={i}><textarea id={i} className={cx(control, "min-h-24", className)} {...p} /></Field>;
}
export function SelectField({ label, hint, error, help, guide, className, id, children, ...p }: FieldProps & SelectHTMLAttributes<HTMLSelectElement>) {
  const gen = useId(); const i = id ?? gen;
  return <Field label={label} hint={hint} error={error} help={help} guide={guide} htmlFor={i} required={p.required}><select id={i} aria-invalid={!!error || undefined} className={cx(control, className)} {...p} required={undefined}>{children}</select></Field>;
}
export const inputClass = control;

/** Password input with a proper show/hide toggle (button is keyboard reachable, announces state). */
export function PasswordField({ label, hint, error, help, guide, className, id, ...p }: FieldProps & Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  const gen = useId(); const i = id ?? gen;
  const [show, setShow] = useState(false);
  const { t } = useT();
  return (
    <Field label={label} hint={hint} error={error} help={help} guide={guide} htmlFor={i}>
      <div className="relative">
        <input id={i} type={show ? "text" : "password"} aria-invalid={!!error || undefined} className={cx(control, "pr-10", className)} {...p} />
        <button type="button" onClick={() => setShow((v) => !v)} aria-pressed={show} aria-label={show ? t("ui.password.hide") : t("ui.password.show")}
          className="absolute inset-y-0 right-0 grid w-10 place-items-center rounded-r-lg text-muted transition hover:text-ink">
          {show ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
    </Field>
  );
}

export function Toggle({ checked, onChange, label, hint, hideLabel, help, guide }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string; hideLabel?: boolean; help?: string; guide?: string }) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4">
      <div className={hideLabel ? "sr-only" : undefined}><div className="flex items-center gap-1"><label htmlFor={id} className="text-sm font-medium">{label}</label>{help && <HelpTip id={help} guide={guide} />}</div>{hint && <p className="text-xs text-muted">{hint}</p>}</div>
      <button id={id} type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
        className={cx("relative h-5 w-9 shrink-0 rounded-full transition-colors duration-200", checked ? "bg-brand-600" : "bg-line-strong")}>
        <span className={cx("absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200", checked && "translate-x-4")} />
      </button>
    </div>
  );
}

/* ---------- Layout bits ---------- */
export function Card({ title, actions, children, className, testId }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; testId?: string }) {
  return (
    <section data-testid={testId} className={cx("rounded-xl border border-line bg-surface shadow-soft", className)}>
      {(title || actions) && <header className="flex min-h-14 items-center justify-between gap-3 border-b border-line px-5 py-3"><h2 className="text-sm font-semibold">{title}</h2>{actions}</header>}
      <div className="p-5">{children}</div>
    </section>
  );
}
/** `guide="section#anchor"` adds the "How do I use this page?" button that opens that guide section. */
export function PageHeader({ title, description, actions, guide }: { title: string; description?: string; actions?: ReactNode; guide?: string }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div><h1 className="font-display text-[1.65rem] font-semibold leading-tight tracking-tight">{title}</h1>{description && <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p>}</div>
      {(actions || guide) && <div className="flex flex-wrap items-center gap-2 print:hidden">{guide && <PageHelp guide={guide} />}{actions}</div>}
    </div>
  );
}
const tones = {
  neutral: "bg-hover text-muted ring-line-strong",
  success: "bg-success-soft text-success ring-success-line",
  danger: "bg-danger-soft text-danger ring-danger-line",
  warning: "bg-warn-soft text-warn ring-warn-line",
  info: "bg-info-soft text-info ring-info-line",
};
export type Tone = keyof typeof tones;
export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={cx("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset", tones[tone])}><span aria-hidden className="size-1.5 rounded-full bg-current opacity-70" />{children}</span>;
}
export const statusTone = (s: string): Tone =>
  ({ paid: "success", delivered: "success", succeeded: "success", sent: "success", done: "success", active: "success", ok: "success",
    cancelled: "danger", refunded: "danger", failed: "danger", dead: "danger", error: "danger",
    pending: "warning", awaiting_payment: "warning", draft: "warning", retrying: "warning", queued: "warning",
    fulfilling: "info", shipped: "info", running: "info" } as Record<string, Tone>)[s] ?? "neutral";

export function Loading({ label }: { label?: string }) {
  const { t } = useT();
  return <div className="flex items-center justify-center gap-3 py-16 text-sm text-muted" role="status"><Spinner />{label ?? t("ui.loading")}...</div>;
}
export function EmptyState({ title, description, action, icon }: { title: string; description?: string; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="py-12 text-center">
      <span className="mx-auto grid size-12 place-items-center rounded-full bg-brand-50 text-brand-ink ring-8 ring-brand-50/50">{icon ?? <Inbox size={22} />}</span>
      <p className="mt-4 font-medium">{title}</p>{description && <p className="mx-auto mt-1 max-w-sm text-sm text-muted">{description}</p>}{action && <div className="mt-5">{action}</div>}
    </div>
  );
}
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cx("animate-pulse rounded-md bg-hover", className)} />;
}
export function ErrorState({ error, retry }: { error: unknown; retry?: () => void }) {
  const { t } = useT();
  return (
    <div role="alert" className="rounded-xl border border-danger-line bg-danger-soft p-4 text-sm text-danger">
      <p className="font-medium">{t("ui.error.title")}</p>
      <p className="mt-1">{error instanceof Error ? errMsg(error) : String(error)}</p>
      {retry && <Button variant="secondary" size="sm" className="mt-3" onClick={retry}>{t("common.retry")}</Button>}
    </div>
  );
}

/* ---------- Table ---------- */
export function Table({ head, children, caption }: { head: ReactNode[]; children: ReactNode; caption?: string }) {
  return (
    <div className="-mx-5 max-h-[70vh] overflow-auto border-y border-line">
      <table className="w-full min-w-[34rem] text-left text-sm">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead className="sticky top-0 z-10 bg-canvas/85 text-[11px] backdrop-blur-md uppercase tracking-wider text-muted shadow-[0_1px_0_var(--color-line)]"><tr>{head.map((h, i) => <th key={i} scope="col" className="px-5 py-2.5 font-semibold first:pl-5">{h}</th>)}</tr></thead>
        <tbody className="divide-y divide-line [&>tr]:transition-colors [&>tr:hover]:bg-hover">{children}</tbody>
      </table>
    </div>
  );
}
export const Td = ({ children, className }: { children?: ReactNode; className?: string }) => <td className={cx("px-5 py-3 align-middle", className)}>{children}</td>;

export function Pagination({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const { t } = useT();
  return (
    <nav aria-label={t("ui.pagination.label")} className="mt-4 flex items-center justify-between text-sm text-muted">
      <span>{t("ui.pagination.total", { n: total })}</span>
      <div className="flex items-center gap-2">
        <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>{t("common.previous")}</Button>
        <span aria-live="polite">{t("common.page", { page, pages })}</span>
        <Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>{t("common.next")}</Button>
      </div>
    </nav>
  );
}

/* ---------- Tabs (link-less, controlled) ---------- */
export function Tabs<T extends string>({ tabs, value, onChange, label }: { tabs: { id: T; label: string }[]; value: T; onChange: (t: T) => void; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="mb-6 flex gap-1 overflow-x-auto border-b border-line"
      onKeyDown={(e) => {
        const i = tabs.findIndex((t) => t.id === value);
        if (e.key === "ArrowRight") onChange(tabs[(i + 1) % tabs.length]!.id);
        if (e.key === "ArrowLeft") onChange(tabs[(i - 1 + tabs.length) % tabs.length]!.id);
      }}>
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} tabIndex={value === t.id ? 0 : -1} onClick={() => onChange(t.id)}
          className={cx("whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium -mb-px transition-colors", value === t.id ? "border-brand-600 text-brand-ink" : "border-transparent text-muted hover:text-ink")}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

/* ---------- Modal ---------- */
export function Modal({ open, onClose, title, children, footer, wide }: { wide?: boolean; open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current; if (!d) return;
    if (open && !d.open) { if (typeof d.showModal === "function") d.showModal(); else d.setAttribute("open", ""); }
    if (!open && d.open && typeof d.close === "function") d.close();
  }, [open]);
  if (!open) return null;
  return (
    <dialog ref={ref} aria-labelledby="modal-title" onClose={onClose} onCancel={onClose}
      className={cx("m-auto max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl border border-line bg-raised p-0 text-ink shadow-lift", wide ? "w-[min(40rem,calc(100vw-2rem))]" : "w-[min(32rem,calc(100vw-2rem))]")}>
      <div className="p-5"><h2 id="modal-title" className="mb-4 text-lg font-semibold">{title}</h2>{children}</div>
      {footer && <div className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
    </dialog>
  );
}
/** Right-side sheet built on <dialog>: native focus trap, Esc closes, focus returns to the opener. */
export function Drawer({ open, onClose, title, subtitle, children, footer }: { open: boolean; onClose: () => void; title: ReactNode; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const { t } = useT();
  useEffect(() => {
    const d = ref.current; if (!d) return;
    if (open && !d.open) { opener.current = document.activeElement as HTMLElement | null; if (typeof d.showModal === "function") d.showModal(); else d.setAttribute("open", ""); }
    if (!open && d.open && typeof d.close === "function") d.close();
  }, [open]);
  useEffect(() => () => { opener.current?.focus?.(); }, []);
  if (!open) return null;
  return (
    <dialog ref={ref} aria-labelledby="drawer-title" onClose={onClose} onCancel={onClose}
      onClick={(e) => { if (e.target === ref.current) onClose(); }}
      className="os-drawer fixed inset-y-0 right-0 left-auto m-0 flex h-dvh max-h-none w-full max-w-lg flex-col border-l border-line bg-raised p-0 text-ink shadow-lift">
      <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div className="min-w-0"><h2 id="drawer-title" className="text-base font-semibold">{title}</h2>{subtitle && <div className="mt-0.5 text-sm text-muted">{subtitle}</div>}</div>
        <button type="button" aria-label={t("common.close")} onClick={onClose} className="-mr-1.5 grid size-8 shrink-0 place-items-center rounded-lg text-muted transition hover:bg-hover hover:text-ink"><X size={18} /></button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>
      {footer && <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-surface px-5 py-3">{footer}</footer>}
    </dialog>
  );
}
export function ConfirmDialog({ open, title, message, confirmLabel, danger, loading, onConfirm, onClose }:
  { open: boolean; title: string; message: string; confirmLabel?: string; danger?: boolean; loading?: boolean; onConfirm: () => void; onClose: () => void }) {
  const { t } = useT();
  return (
    <Modal open={open} onClose={onClose} title={title}
      footer={<><Button variant="ghost" onClick={onClose}>{t("common.cancel")}</Button><Button variant={danger ? "danger" : "primary"} loading={loading} onClick={onConfirm}>{confirmLabel ?? t("common.confirm")}</Button></>}>
      <p className="text-sm text-muted">{message}</p>
    </Modal>
  );
}

/* ---------- Toasts ---------- */
interface Toast { id: number; tone: "success" | "error" | "info"; text: string }
const ToastCtx = createContext<{ push: (tone: Toast["tone"], text: string) => void }>({ push: () => {} });
export const useToast = () => {
  const { push } = useContext(ToastCtx);
  return useMemo(() => ({ success: (t: string) => push("success", t), error: (t: string) => push("error", t), info: (t: string) => push("info", t) }), [push]);
};
export function ToastProvider({ children }: { children: ReactNode }) {
  const { t: tr } = useT();
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((tone: Toast["tone"], text: string) => {
    const id = Date.now() + Math.random();
    setItems((s) => [...s, { id, tone, text }]);
    setTimeout(() => setItems((s) => s.filter((t) => t.id !== id)), 5000);
  }, []);
  return (
    <ToastCtx.Provider value={{ push }}>
      {children}
      <div aria-live="polite" role="status" className="fixed bottom-4 right-4 z-50 flex w-96 max-w-[calc(100vw-2rem)] flex-col gap-2">
        {items.map((t) => (
          <div key={t.id} className={cx("flex animate-[os-toast_.25s_ease-out] items-start gap-3 rounded-xl border bg-raised px-4 py-3 text-sm shadow-lift",
            t.tone === "success" && "border-success-line",
            t.tone === "error" && "border-danger-line",
            t.tone === "info" && "border-line")}>
            {t.tone === "success" ? <CheckCircle2 size={18} className="mt-px shrink-0 text-success" /> : t.tone === "error" ? <AlertCircle size={18} className="mt-px shrink-0 text-danger" /> : <Info size={18} className="mt-px shrink-0 text-brand-ink" />}
            <p className="flex-1">{t.text}</p>
            <button type="button" aria-label={tr("ui.dismiss")} onClick={() => setItems((s) => s.filter((x) => x.id !== t.id))} className="-m-1 rounded p-1 text-muted transition hover:text-ink"><X size={14} /></button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

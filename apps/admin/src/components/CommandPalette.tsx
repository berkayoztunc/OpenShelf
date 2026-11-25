import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, ClipboardList, CornerDownLeft, FilePlus2, Mail, Megaphone, Package, PackagePlus, Search, User } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { api, qs } from "../lib/api";
import { useSettings } from "../lib/settings";
import { customerFromApi, mapList, orderRowFromApi } from "../lib/adapt";
import { enumLabel, money } from "../lib/format";
import { useT, type MessageKey } from "../i18n";
import { NAV_GROUPS } from "./Layout";
import { cx, useDebounced } from "./ui";

/** Lower-case, Turkish-aware, accent-free text so "sipariş", "SIPARIS" and "siparis" match. */
export function fold(s: string): string {
  return s.toLocaleLowerCase("tr-TR").replace(/ı/g, "i").replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ş/g, "s").replace(/ö/g, "o").replace(/ç/g, "c").normalize("NFKD").replace(/[̀-ͯ]/g, "");
}
/** Every word of the query must appear somewhere in the haystack. */
export const matches = (query: string, ...hay: (string | undefined)[]) => {
  const words = fold(query).split(/\s+/).filter(Boolean);
  const h = fold(hay.filter(Boolean).join(" "));
  return words.length > 0 && words.every((w) => h.includes(w));
};

interface Entry { id: string; group: "pages" | "actions" | "products" | "orders" | "customers"; label: string; hint?: string; terms?: string; to: string; icon: LucideIcon }

/** `terms`: extra, unshown text the search also matches (e.g. a tab's description), so "kayan yazı" or "indirim kodu" finds the right tab. */
const SUB_PAGES: { base: string; parentKey: MessageKey; ids: readonly string[]; key: (id: string) => string; path: (id: string) => string; terms?: (id: string) => string }[] = [
  { base: "/settings", parentKey: "nav.settings", ids: ["general", "branding", "seo", "legal", "checkout", "tracking", "notifications", "system", "mcp"], key: (id) => `settings.tab.${id}`, path: (id) => `/settings/${id}` },
  { base: "/storefront", parentKey: "nav.storefront", ids: ["home", "menu", "order", "announcement"], key: (id) => `storefront.tab.${id}`, path: (id) => `/storefront/${id}`, terms: (id) => `storefront.tab.${id}.description` },
  { base: "/trendyol", parentKey: "nav.trendyol", ids: ["sync", "products", "orders", "returns", "questions", "finance", "explorer"], key: (id) => `trendyol.tab.${id}`, path: (id) => `/trendyol/${id}` },
];
const ACTIONS: { key: MessageKey; to: string; icon: LucideIcon }[] = [
  { key: "search.action.newProduct", to: "/products/new", icon: PackagePlus },
  { key: "search.action.newInvoice", to: "/invoices/new", icon: FilePlus2 },
  { key: "search.action.newCampaign", to: "/campaigns/new", icon: Megaphone },
  { key: "search.action.composeEmail", to: "/emails/compose", icon: Mail },
];
const GROUP_KEYS: Record<Entry["group"], MessageKey> = { pages: "search.group.pages", actions: "search.group.actions", products: "search.group.products", orders: "search.group.orders", customers: "search.group.customers" };

interface ProductHit { id: string; nameTr: string; status: string; variants?: { sku?: string }[] }

/** Admin-wide search: pages and settings, quick actions, and live product / order / customer lookup. Opens with Ctrl/⌘+K or "/". */
export function CommandPalette() {
  const { t } = useT();
  const nav = useNavigate();
  const settings = useSettings();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const dq = useDebounced(q.trim(), 200);
  const input = useRef<HTMLInputElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const listId = useId();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && (e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName));
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) { e.preventDefault(); setOpen((o) => !o); }
      else if (e.key === "/" && !typing && !open) { e.preventDefault(); setOpen(true); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  useEffect(() => {
    if (open) { opener.current = document.activeElement as HTMLElement | null; setTimeout(() => input.current?.focus(), 0); }
    else { setQ(""); setActive(0); opener.current?.focus?.(); }
  }, [open]);

  const live = open && dq.length >= 2;
  const products = useQuery({ queryKey: ["search", "products", dq], enabled: live, staleTime: 30_000,
    queryFn: async () => (await api.get<{ items: ProductHit[] }>(`/api/admin/products${qs({ q: dq, pageSize: 5 })}`)).items });
  const orders = useQuery({ queryKey: ["search", "orders", dq], enabled: live, staleTime: 30_000,
    queryFn: async () => mapList(await api.get<{ items: unknown[] }>(`/api/admin/orders${qs({ q: dq, pageSize: 5 })}`), orderRowFromApi) });
  const customers = useQuery({ queryKey: ["search", "customers", dq], enabled: live, staleTime: 30_000,
    queryFn: async () => mapList(await api.get<{ items: unknown[] }>(`/api/admin/customers${qs({ q: dq, pageSize: 5 })}`), customerFromApi) });

  const entries = useMemo<Entry[]>(() => {
    const query = q.trim();
    const out: Entry[] = [];
    const mock = !!settings.data?.system?.mockMode;
    const pages: Entry[] = [];
    for (const g of NAV_GROUPS) {
      const groupTitle = g.titleKey ? t(g.titleKey) : "";
      for (const n of g.items) {
        if (n.mockOnly && !mock) continue;
        pages.push({ id: `page:${n.to}`, group: "pages", label: t(n.labelKey), hint: groupTitle, to: n.to, icon: n.icon });
        const sub = SUB_PAGES.find((s) => s.base === n.to);
        if (sub) for (const id of sub.ids) pages.push({ id: `page:${sub.path(id)}`, group: "pages", label: t(sub.key(id) as MessageKey), hint: t(sub.parentKey), terms: sub.terms ? t(sub.terms(id) as MessageKey) : undefined, to: sub.path(id), icon: n.icon });
      }
    }
    const actions: Entry[] = ACTIONS.map((a) => ({ id: `action:${a.to}`, group: "actions", label: t(a.key), to: a.to, icon: a.icon }));
    if (!query) return [...actions, ...pages.filter((p) => !p.to.split("/")[2]).slice(0, 8)];
    // Label/parent matches rank first; description-only matches follow.
    const direct = pages.filter((p) => matches(query, p.label, p.hint));
    out.push(...[...direct, ...pages.filter((p) => !direct.includes(p) && matches(query, p.label, p.hint, p.terms))].slice(0, 8));
    out.push(...actions.filter((a) => matches(query, a.label)));
    for (const p of products.data ?? []) out.push({ id: `product:${p.id}`, group: "products", label: p.nameTr, hint: [p.variants?.[0]?.sku, enumLabel("productStatus", p.status)].filter(Boolean).join(" · "), to: `/products/${p.id}`, icon: Package });
    for (const o of orders.data ?? []) out.push({ id: `order:${o.id}`, group: "orders", label: `#${o.number}${o.customerName ? ` · ${o.customerName}` : ""}`, hint: `${money(o.total, o.currency)} · ${enumLabel("status", o.status)}`, to: `/orders/${o.id}`, icon: ClipboardList });
    for (const c of customers.data ?? []) out.push({ id: `customer:${c.id}`, group: "customers", label: c.name || c.email, hint: c.name ? c.email : undefined, to: `/customers${qs({ q: c.email })}`, icon: User });
    return out;
  }, [q, t, settings.data, products.data, orders.data, customers.data]);

  useEffect(() => { setActive(0); }, [q]);
  const go = (e?: Entry) => { if (!e) return; setOpen(false); nav(e.to); };
  const loading = live && (products.isFetching || orders.isFetching || customers.isFetching);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(i + 1, entries.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); go(entries[active]); }
    else if (e.key === "Escape") { e.preventDefault(); setOpen(false); }
  };
  useEffect(() => { document.getElementById(`${listId}-${active}`)?.scrollIntoView?.({ block: "nearest" }); }, [active, listId]);

  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
  let lastGroup: Entry["group"] | null = null;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={t("search.open")} aria-keyshortcuts="Control+K Meta+K"
        className="flex h-9 min-w-0 items-center gap-2 rounded-lg border border-line bg-surface px-2.5 text-sm text-muted transition hover:border-line-strong hover:text-ink sm:w-64">
        <Search size={16} className="shrink-0" /><span className="hidden truncate sm:inline">{t("search.placeholderShort")}</span>
        <kbd className="ml-auto hidden rounded border border-line px-1.5 py-0.5 font-sans text-[11px] sm:inline">{isMac ? "⌘K" : "Ctrl K"}</kbd>
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-[var(--os-scrim)] px-4 pt-[12vh] backdrop-blur-[2px]" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div role="dialog" aria-modal="true" aria-label={t("search.title")} className="w-full max-w-xl overflow-hidden rounded-2xl border border-line bg-raised text-ink shadow-lift">
            <div className="flex items-center gap-2.5 border-b border-line px-4">
              <Search size={18} className="shrink-0 text-muted" aria-hidden />
              <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKeyDown} placeholder={t("search.placeholder")}
                role="combobox" aria-expanded="true" aria-controls={listId} aria-autocomplete="list" aria-activedescendant={entries[active] ? `${listId}-${active}` : undefined} aria-label={t("search.title")}
                className="h-12 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-faint" />
              {loading && <span className="size-4 shrink-0 animate-spin rounded-full border-2 border-line border-t-brand-600" aria-hidden />}
              <kbd className="rounded border border-line px-1.5 py-0.5 text-[11px] text-muted">Esc</kbd>
            </div>
            <ul id={listId} role="listbox" aria-label={t("search.results")} className="max-h-[min(60vh,28rem)] overflow-y-auto p-2">
              {entries.length === 0 && <li className="px-3 py-8 text-center text-sm text-muted">{loading ? t("search.searching") : t("search.none", { q: q.trim() })}</li>}
              {entries.map((e, i) => {
                const head = e.group !== lastGroup ? t(GROUP_KEYS[e.group]) : null; lastGroup = e.group;
                const Icon = e.icon;
                return (
                  <li key={e.id} role="presentation">
                    {head && <p className="px-3 pb-1 pt-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted" aria-hidden>{head}</p>}
                    <div id={`${listId}-${i}`} role="option" aria-selected={i === active} onMouseMove={() => setActive(i)} onClick={() => go(e)}
                      className={cx("flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm", i === active ? "bg-brand-50 text-brand-700 dark:text-brand-ink" : "text-ink")}>
                      <Icon size={16} className={cx("shrink-0", i === active ? "" : "text-muted")} aria-hidden />
                      <span className="min-w-0 flex-1 truncate">{e.label}{e.hint && <span className="ml-2 text-xs text-muted">{e.hint}</span>}</span>
                      {i === active ? <CornerDownLeft size={14} aria-hidden /> : <ArrowRight size={14} className="text-faint" aria-hidden />}
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="flex items-center gap-4 border-t border-line px-4 py-2 text-[11px] text-muted">
              <span>↑↓ {t("search.hint.move")}</span><span>↵ {t("search.hint.open")}</span><span className="ml-auto">{t("search.hint.scope")}</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

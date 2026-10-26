import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowDown, ArrowUp, Info, Mail, Plus, Printer, Trash2 } from "lucide-react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../lib/api";
import { dateTime, enumLabel, money } from "../lib/format";
import { useT } from "../i18n";
import { Term } from "../components/help/Term";
import { HelpTip } from "../components/help/HelpTip";
import { useAdmin } from "../lib/auth";
import { useSettings } from "../lib/settings";
import { openPrint } from "../lib/print";
import { describeInvoiceError, emptyForm, emptyLine, formToBody, invoiceToForm, totalsOf, validateForm, warningText } from "../lib/invoices";
import type { CustomerForm, Described, InvoiceForm, InvoiceFull, InvoicePreview, LineForm } from "../lib/invoices";
import { orderToForm } from "../lib/rawOrder";
import type { RawOrder } from "../lib/rawOrder";
import { Typeahead } from "../components/Typeahead";
import { Badge, Button, Card, ConfirmDialog, cx, ErrorState, inputClass, Loading, Modal, PageHeader, TextArea, TextField, Toggle, useDebounced, useToast } from "../components/ui";
import { invoiceTone, typeLabel } from "./Invoices";

interface CatalogItem { variantId: string; sku: string; productName: string; variantTitle: string; unitPrice: number; taxRate: number; stock: number }
interface CustomerItem { id: string; name: string; email: string; phone?: string | null; address?: string | null; city?: string | null; taxId?: string | null; taxOffice?: string | null; isCompany?: boolean }

const cell = "!h-9 !px-1.5 text-right tabular-nums";

export function IssueErrorNotice({ err }: { err: Described }) {
  return (
    <div role="alert" className={cx("flex gap-2 rounded-lg border p-3 text-sm", err.tone === "danger" ? "border-danger-line bg-danger-soft text-danger" : "border-warn-line bg-warn-soft text-warn")}>
      <AlertTriangle size={16} className="mt-0.5 shrink-0" />
      <p>{err.message}{err.link && <> <Link to={err.link.to} className="font-semibold underline">{err.link.label}</Link></>}</p>
    </div>
  );
}

/** Visible label with a "?" for controls (Typeahead) that render their own sr-only label. */
function LabelRow({ label, help }: { label: string; help: string }) {
  return <div className="flex items-center gap-1"><span aria-hidden className="text-[13px] font-medium">{label}</span><HelpTip id={help} /></div>;
}

export default function InvoiceEditor() {
  const { t } = useT();
  const params = useParams(); const [sp] = useSearchParams();
  const nav = useNavigate(); const qc = useQueryClient(); const toast = useToast();
  const admin = useAdmin(); const settings = useSettings();
  const canWrite = admin?.role !== "staff";
  const [createdId, setCreatedId] = useState<string | null>(null);
  const id = params.id ?? createdId ?? undefined;
  const orderId = !params.id ? sp.get("orderId") ?? undefined : undefined;

  const [form, setForm] = useState<InvoiceForm>(() => emptyForm());
  const [showErrors, setShowErrors] = useState(false);
  const [issueOpen, setIssueOpen] = useState(false);
  const [issueErr, setIssueErr] = useState<Described | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [custSearch, setCustSearch] = useState(""); const [prodSearch, setProdSearch] = useState("");
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const loaded = useRef<string | null>(null);

  const general = settings.data?.general;
  const mock = !!settings.data?.system?.mockMode;
  const defaultRate = general?.defaultTaxRate ?? 20;

  const existing = useQuery({ queryKey: ["manual-invoice", params.id], enabled: !!params.id, queryFn: () => api.get<InvoiceFull>(`/api/admin/manual-invoices/${params.id}`) });
  const order = useQuery({ queryKey: ["order-raw", orderId], enabled: !!orderId, queryFn: () => api.get<RawOrder>(`/api/admin/orders/${orderId}`) });

  // Initialise the form once per loaded record (never clobber user edits on refetch).
  useEffect(() => {
    if (existing.data && loaded.current !== `i:${existing.data.id}`) { loaded.current = `i:${existing.data.id}`; setForm(invoiceToForm(existing.data)); }
  }, [existing.data]);
  useEffect(() => {
    if (order.data && settings.data && loaded.current !== `o:${order.data.id}`) { loaded.current = `o:${order.data.id}`; setForm(orderToForm(order.data, defaultRate)); }
  }, [order.data, settings.data, defaultRate]);
  useEffect(() => {
    if (!params.id && !orderId && general && loaded.current === null) { loaded.current = "new"; setForm((f) => ({ ...f, currency: general.currency, pricesIncludeTax: general.pricesIncludeTax })); }
  }, [general, params.id, orderId]);
  useEffect(() => {
    if (!focusKey) return;
    document.querySelector<HTMLInputElement>(`[data-line-name="${focusKey}"]`)?.focus(); setFocusKey(null);
  }, [focusKey, form.lines]);

  const status = existing.data?.status ?? "draft";
  const readOnly = !canWrite || ["issued", "cancelled", "issuing", "cancelling"].includes(status);
  const errors = useMemo(() => validateForm(form), [form]);
  const valid = Object.keys(errors).length === 0;
  const totals = useMemo(() => totalsOf(form), [form]);
  const body = useMemo(() => formToBody(form), [form]);
  const dBody = useDebounced(JSON.stringify(body), 600);

  const preview = useQuery({
    queryKey: ["manual-invoice-preview", dBody], enabled: valid && dBody === JSON.stringify(body) && !["issued", "cancelled"].includes(status), staleTime: 5_000, placeholderData: (p) => p,
    queryFn: () => api.post<InvoicePreview>("/api/admin/manual-invoices/preview", JSON.parse(dBody)),
  });
  const pv = valid ? preview.data : undefined;
  const type = existing.data?.type ?? pv?.type ?? null;

  const patch = (p: Partial<InvoiceForm>) => setForm((f) => ({ ...f, ...p }));
  const patchCustomer = (p: Partial<CustomerForm>) => setForm((f) => ({ ...f, customer: { ...f.customer, ...p } }));
  const patchLine = (key: string, p: Partial<LineForm>) => setForm((f) => ({ ...f, lines: f.lines.map((l) => (l.key === key ? { ...l, ...p } : l)) }));
  const moveLine = (i: number, d: -1 | 1) => setForm((f) => { const ls = [...f.lines]; const j = i + d; if (j < 0 || j >= ls.length) return f; [ls[i], ls[j]] = [ls[j]!, ls[i]!]; return { ...f, lines: ls }; });
  const addCustom = () => { const l = emptyLine({ taxRate: String(defaultRate) }); setForm((f) => ({ ...f, lines: [...f.lines, l] })); setFocusKey(l.key); };

  /** Create or update the draft; resolves with the invoice id. */
  async function persist(): Promise<string> {
    const cur = params.id ?? createdId;
    if (cur) { await api.put<InvoiceFull>(`/api/admin/manual-invoices/${cur}`, body); return cur; }
    const row = await api.post<InvoiceFull>("/api/admin/manual-invoices", body);
    setCreatedId(row.id); return row.id;
  }

  const save = useMutation({
    mutationFn: persist,
    onSuccess: (sid) => { qc.invalidateQueries({ queryKey: ["manual-invoices"] }); qc.invalidateQueries({ queryKey: ["manual-invoice", sid] }); toast.success(t("invoices.toast.draftSaved")); if (!params.id) nav(`/invoices/${sid}`, { replace: true }); },
    onError: (e) => toast.error(describeInvoiceError(e).message),
  });
  const issue = useMutation({
    mutationFn: async () => { const sid = await persist(); return api.post<InvoiceFull>(`/api/admin/manual-invoices/${sid}/issue`); },
    onSuccess: (row) => {
      qc.setQueryData(["manual-invoice", row.id], row); qc.invalidateQueries({ queryKey: ["manual-invoices"] });
      setIssueOpen(false); setIssueErr(null); toast.success(t("invoices.toast.issued", { number: row.number ?? "" }));
      if (!params.id) nav(`/invoices/${row.id}`, { replace: true });
    },
    onError: (e) => {
      setIssueErr(describeInvoiceError(e));
      if (e instanceof ApiError && ["issue_failed", "already_issued", "issue_in_progress"].includes(e.code)) {
        const cur = params.id ?? createdId; if (cur) qc.invalidateQueries({ queryKey: ["manual-invoice", cur] });
        qc.invalidateQueries({ queryKey: ["manual-invoices"] });
      }
    },
  });
  const cancel = useMutation({
    mutationFn: () => api.post<InvoiceFull>(`/api/admin/manual-invoices/${id}/cancel`),
    onSuccess: (row) => { qc.setQueryData(["manual-invoice", row.id], row); qc.invalidateQueries({ queryKey: ["manual-invoices"] }); setCancelOpen(false); toast.success(t("invoices.toast.cancelled")); },
    onError: (e) => { setCancelOpen(false); toast.error(describeInvoiceError(e).message); },
  });

  const closeIssue = () => { setIssueOpen(false); setIssueErr(null); if (!params.id && createdId) nav(`/invoices/${createdId}`, { replace: true }); };
  const openIssue = () => { setShowErrors(true); if (!valid) { toast.error(t("invoices.summary.fixFirst")); return; } setIssueErr(null); setIssueOpen(true); };
  const err = (k: string) => (showErrors ? errors[k] : undefined);
  const roleHint = !canWrite ? t("invoices.editor.roleHint") : undefined;

  if (params.id && existing.isPending) return <Loading />;
  if (params.id && existing.isError) return <ErrorState error={existing.error} retry={() => existing.refetch()} />;
  if (orderId && (order.isPending || settings.isPending)) return <Loading label={t("invoices.editor.loadingOrder")} />;
  if (orderId && order.isError) return <ErrorState error={order.error} retry={() => order.refetch()} />;

  const inv = existing.data;
  const title = inv?.number ? t("invoices.editor.titleNumber", { number: inv.number }) : params.id ? t("invoices.editor.titleExisting") : t("invoices.editor.titleNew");
  const cur = form.currency || "TRY";
  const customerEmail = form.customer.email;
  const composeHref = inv ? `/emails/compose?${new URLSearchParams({ ...(customerEmail ? { to: customerEmail } : {}), manualInvoiceId: inv.id, subject: t("invoices.summary.emailSubject", { number: inv.number ?? "" }).trim(), ...(inv.orderId ? { orderId: inv.orderId } : {}) })}` : "";

  return (
    <>
      <PageHeader title={title} description={readOnly && inv ? t("invoices.editor.descReadOnly") : orderId || form.orderId ? t("invoices.editor.descFromOrder") : t("invoices.editor.descDefault")} guide="invoices#manuel-fatura"
        actions={<><Link to="/invoices"><Button variant="ghost">{t("common.back")}</Button></Link>{inv && <Badge tone={invoiceTone(inv.status)}>{enumLabel("invoice", inv.status)}</Badge>}</>} />

      {mock && !readOnly && (
        <div role="note" className="mb-5 flex items-start gap-2 rounded-xl border border-info-line bg-info-soft px-4 py-3 text-sm text-info">
          <Info size={16} className="mt-0.5 shrink-0" /><p><strong>{t("invoices.editor.mockTitle")}</strong> {t("invoices.editor.mockBody")}</p>
        </div>
      )}
      {inv?.status === "failed" && inv.error && <div className="mb-5"><IssueErrorNotice err={{ tone: "danger", message: t("invoices.editor.lastFailed", { error: inv.error }) }} /></div>}
      {!canWrite && <div className="mb-5"><IssueErrorNotice err={{ tone: "warning", message: t("invoices.editor.readOnlyRole") }} /></div>}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <fieldset disabled={readOnly} className="ro min-w-0 space-y-6 border-0 p-0">
          <Card title={t("invoices.customer.title")}>
            <div className="space-y-4">
              {!readOnly && (
                <div className="space-y-1.5"><LabelRow label={t("invoices.customer.search")} help="invoices.customerSearch" />
                <Typeahead<CustomerItem> hideLabel label={t("invoices.customer.search")} path="/api/admin/customer-lookup" value={custSearch} onChange={setCustSearch} placeholder={t("invoices.customer.search.placeholder")} hint={t("invoices.customer.search.hint")}
                  render={(c) => <><span className="font-medium">{c.name}</span> <span className="text-muted">{c.email}</span>{c.taxId && <span className="ml-2 text-xs text-muted">{t("invoices.customer.taxIdOption", { id: c.taxId })}</span>}</>}
                  onPick={(c) => { setCustSearch(""); patchCustomer({ name: c.name ?? "", email: c.email ?? "", phone: c.phone ?? undefined, address: c.address ?? "", city: c.city ?? "", taxId: c.taxId ?? "", taxOffice: c.taxOffice ?? "", isCompany: !!c.isCompany }); }} /></div>
              )}
              <Toggle label={t("invoices.customer.company")} hint={t("invoices.customer.company.hint")} help="invoices.company" checked={form.customer.isCompany} onChange={(v) => patchCustomer({ isCompany: v })} />
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField label={form.customer.isCompany ? t("invoices.customer.companyName") : t("invoices.customer.fullName")} hint={form.customer.isCompany ? t("invoices.customer.companyName.hint") : t("invoices.customer.fullName.hint")} help="invoices.name" required value={form.customer.name} error={err("customer.name")} autoComplete="off" onChange={(e) => patchCustomer({ name: e.target.value })} />
                <TextField label={t("invoices.customer.email")} type="email" help="invoices.email" value={form.customer.email} error={err("customer.email")} hint={t("invoices.customer.email.hint")} onChange={(e) => patchCustomer({ email: e.target.value })} />
                <TextField label={form.customer.isCompany ? t("invoices.customer.vkn") : t("invoices.customer.tckn")} hint={form.customer.isCompany ? t("invoices.customer.vkn.hint") : t("invoices.customer.tckn.hint")} help={form.customer.isCompany ? "invoices.taxIdCompany" : "invoices.taxIdPerson"} inputMode="numeric" value={form.customer.taxId} error={err("customer.taxId")} onChange={(e) => patchCustomer({ taxId: e.target.value.replace(/\D/g, "").slice(0, 11) })} />
                {form.customer.isCompany && <TextField label={t("invoices.customer.taxOffice")} hint={t("invoices.customer.taxOffice.hint")} help="invoices.taxOffice" value={form.customer.taxOffice} onChange={(e) => patchCustomer({ taxOffice: e.target.value })} />}
                <div className="sm:col-span-2"><TextField label={t("invoices.customer.address")} hint={t("invoices.customer.address.hint")} help="invoices.address" required value={form.customer.address} error={err("customer.address")} onChange={(e) => patchCustomer({ address: e.target.value })} /></div>
                <TextField label={t("invoices.customer.city")} hint={t("invoices.customer.city.hint")} help="invoices.city" required value={form.customer.city} error={err("customer.city")} onChange={(e) => patchCustomer({ city: e.target.value })} />
              </div>
            </div>
          </Card>

          <Card title={t("invoices.lines.title")} actions={!readOnly && <Button size="sm" variant="secondary" onClick={addCustom}><Plus size={14} />{t("invoices.lines.addCustom")}</Button>}>
            {!readOnly && (
              <div className="mb-4 space-y-1.5">
                <LabelRow label={t("invoices.lines.productSearch")} help="invoices.productSearch" />
                <Typeahead<CatalogItem> hideLabel label={t("invoices.lines.productSearch")} path="/api/admin/catalog-lookup" value={prodSearch} onChange={setProdSearch} placeholder={t("invoices.lines.productSearch.placeholder")} hint={t("invoices.lines.productSearch.hint")} minChars={1}
                  render={(p) => <span className="flex items-center justify-between gap-3"><span><span className="font-medium">{p.productName}</span>{p.variantTitle && <span className="text-muted"> - {p.variantTitle}</span>}<span className="ml-2 text-xs text-muted">{p.sku}</span></span><span className="shrink-0 tabular-nums">{money(p.unitPrice, cur)}</span></span>}
                  onPick={(p) => { const l = emptyLine({ variantId: p.variantId, sku: p.sku, name: p.variantTitle && p.variantTitle !== "Default" ? `${p.productName} - ${p.variantTitle}` : p.productName, price: (p.unitPrice / 100).toFixed(2), taxRate: String(p.taxRate) }); setForm((f) => ({ ...f, lines: [...f.lines, l] })); setProdSearch(""); }} />
              </div>
            )}
            {form.lines.length === 0 ? (
              <p className={cx("rounded-lg border border-dashed px-4 py-8 text-center text-sm", err("lines") ? "border-danger text-danger" : "border-line text-muted")}>{err("lines") ?? t("invoices.lines.empty")}</p>
            ) : (
              <div className="-mx-5 overflow-x-auto px-5">
                <table className="w-full min-w-[40rem] text-sm">
                  <caption className="sr-only">{t("invoices.lines.caption")}</caption>
                  <thead className="text-left text-[11px] uppercase tracking-wider text-muted"><tr>
                    <th scope="col" className="min-w-44 pb-2 pr-2 font-semibold">{t("invoices.lines.col.item")}</th>
                    <th scope="col" className="w-20 pb-2 pr-2 text-right font-semibold"><span className="inline-flex items-center justify-end gap-0.5 whitespace-nowrap">{t("invoices.lines.col.qty")}<HelpTip id="invoices.qty" /></span></th>
                    <th scope="col" className="w-28 pb-2 pr-2 text-right font-semibold"><span className="inline-flex items-center justify-end gap-0.5 whitespace-nowrap">{t("invoices.lines.col.unitPrice")}<HelpTip id="invoices.unitPrice" /></span></th>
                    <th scope="col" className="w-24 pb-2 pr-2 text-right font-semibold"><span className="inline-flex items-center justify-end gap-0.5 whitespace-nowrap"><Term id="kdv">{t("invoices.lines.col.kdv")}</Term><HelpTip id="invoices.kdv" /></span></th>
                    <th scope="col" className="w-24 pb-2 pr-2 text-right font-semibold"><span className="inline-flex items-center justify-end gap-0.5 whitespace-nowrap">{t("invoices.lines.col.discount")}<HelpTip id="invoices.discount" /></span></th>
                    <th scope="col" className="w-24 pb-2 pr-2 text-right font-semibold">{t("invoices.lines.col.total")}</th><th scope="col" className="w-[5.5rem] pb-2"><span className="sr-only">{t("invoices.lines.col.actions")}</span></th>
                  </tr></thead>
                  <tbody className="divide-y divide-line">
                    {form.lines.map((l, i) => (
                      <tr key={l.key} className="align-top">
                        <td className="py-2 pr-2">
                          <input data-line-name={l.key} aria-label={t("invoices.lines.nameAria", { n: i + 1 })} aria-invalid={!!err(`line.${i}.name`) || undefined} className={cx(inputClass, "!h-9 !px-2")} value={l.name} title={l.name} placeholder={t("invoices.lines.descPlaceholder")} onChange={(e) => patchLine(l.key, { name: e.target.value })} />
                          {l.sku && <span className="mt-0.5 block text-xs text-muted">{t("invoices.lines.skuLine", { sku: l.sku })}</span>}
                        </td>
                        <td className="py-2 pr-2"><input aria-label={t("invoices.lines.qtyAria", { n: i + 1 })} aria-invalid={!!err(`line.${i}.quantity`) || undefined} inputMode="decimal" className={cx(inputClass, cell)} value={l.quantity} onChange={(e) => patchLine(l.key, { quantity: e.target.value })} /></td>
                        <td className="py-2 pr-2"><input aria-label={t("invoices.lines.priceAria", { n: i + 1 })} inputMode="decimal" className={cx(inputClass, cell)} value={l.price} onChange={(e) => patchLine(l.key, { price: e.target.value })} onBlur={(e) => { const v = Number(e.target.value.replace(",", ".")); if (Number.isFinite(v)) patchLine(l.key, { price: v.toFixed(2) }); }} /></td>
                        <td className="py-2 pr-2"><input aria-label={t("invoices.lines.kdvAria", { n: i + 1 })} aria-invalid={!!err(`line.${i}.taxRate`) || undefined} inputMode="decimal" className={cx(inputClass, cell)} value={l.taxRate} onChange={(e) => patchLine(l.key, { taxRate: e.target.value })} /></td>
                        <td className="py-2 pr-2"><input aria-label={t("invoices.lines.discountAria", { n: i + 1 })} inputMode="decimal" className={cx(inputClass, cell)} value={l.discount} onChange={(e) => patchLine(l.key, { discount: e.target.value })} onBlur={(e) => { const v = Number(e.target.value.replace(",", ".")); if (Number.isFinite(v)) patchLine(l.key, { discount: v.toFixed(2) }); }} /></td>
                        <td className="py-2 pr-2 pt-[.9rem] text-right font-medium tabular-nums" data-testid={`line-total-${i}`}>{money(totals.lines[i]?.total ?? 0, cur)}</td>
                        <td className="py-2 text-right whitespace-nowrap">
                          {!readOnly && <>
                            <button type="button" aria-label={t("invoices.lines.moveUp", { n: i + 1 })} disabled={i === 0} onClick={() => moveLine(i, -1)} className="inline-grid size-7 place-items-center rounded-lg text-muted transition hover:bg-hover hover:text-ink disabled:opacity-30"><ArrowUp size={15} /></button>
                            <button type="button" aria-label={t("invoices.lines.moveDown", { n: i + 1 })} disabled={i === form.lines.length - 1} onClick={() => moveLine(i, 1)} className="inline-grid size-7 place-items-center rounded-lg text-muted transition hover:bg-hover hover:text-ink disabled:opacity-30"><ArrowDown size={15} /></button>
                            <button type="button" aria-label={t("invoices.lines.remove", { n: i + 1 })} onClick={() => setForm((f) => ({ ...f, lines: f.lines.filter((x) => x.key !== l.key) }))} className="inline-grid size-7 place-items-center rounded-lg text-muted transition hover:bg-danger-soft hover:text-danger"><Trash2 size={15} /></button>
                          </>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {err("lines") && form.lines.length > 0 && <p role="alert" className="mt-2 text-xs text-danger">{err("lines")}</p>}
          </Card>

          <Card title={t("invoices.options.title")}>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="sm:col-span-3"><Toggle label={t("invoices.options.pricesIncludeTax")} hint={t("invoices.options.pricesIncludeTax.hint")} help="invoices.pricesIncludeTax" checked={form.pricesIncludeTax} onChange={(v) => patch({ pricesIncludeTax: v })} /></div>
              <TextField label={t("invoices.options.currency")} hint={t("invoices.options.currency.hint")} help="invoices.currency" maxLength={3} value={form.currency} error={err("currency")} onChange={(e) => patch({ currency: e.target.value.toUpperCase() })} />
              <TextField label={t("invoices.options.issueDate")} type="date" help="invoices.issueDate" value={form.issueDate} hint={t("invoices.options.issueDate.hint")} onChange={(e) => patch({ issueDate: e.target.value })} />
              <div className="sm:col-span-3"><TextArea label={t("invoices.options.notes")} help="invoices.notes" maxLength={1000} value={form.notes} hint={t("invoices.options.notes.hint")} onChange={(e) => patch({ notes: e.target.value })} /></div>
            </div>
          </Card>
        </fieldset>

        <aside aria-label={t("invoices.summary.aria")} className="space-y-4 lg:sticky lg:top-20">
          <Card title={t("invoices.summary.title")} actions={type && <span className="inline-flex items-center gap-1"><HelpTip id="invoices.type" /><Badge tone={type === "e_fatura" ? "info" : "neutral"}>{typeLabel(type)}</Badge></span>}>
            <dl className="space-y-2 text-sm" data-testid="summary">
              <div className="flex justify-between"><dt className="text-muted">{t("invoices.summary.net")}</dt><dd data-testid="sum-net" className="tabular-nums">{money(totals.net, cur)}</dd></div>
              {totals.byRate.map((r) => <div key={r.rate} className="flex justify-between"><dt className="text-muted"><Term id="kdv">KDV</Term> %{r.rate} <span className="text-xs">{t("invoices.summary.kdvOn", { amount: money(r.net, cur) })}</span></dt><dd className="tabular-nums" data-testid={`sum-kdv-${r.rate}`}>{money(r.tax, cur)}</dd></div>)}
              {totals.discount > 0 && <div className="flex justify-between"><dt className="text-muted">{t("invoices.summary.discounts")}</dt><dd className="tabular-nums">-{money(totals.discount, cur)}</dd></div>}
              <div className="flex justify-between border-t border-line pt-3 text-base font-semibold"><dt>{t("invoices.summary.grand")}</dt><dd data-testid="sum-total" className="tabular-nums">{money(totals.total, cur)}</dd></div>
            </dl>
            {type && pv?.typeSource && <p className="mt-3 text-xs text-muted">{pv.typeSource === "provider" ? t("invoices.summary.typeProvider") : t("invoices.summary.typeRule")}</p>}
            {pv && pv.warnings.length > 0 && (
              <ul aria-label={t("invoices.summary.warnings")} className="mt-4 space-y-1.5">{pv.warnings.map((w, i) => (
                <li key={i} className="flex gap-2 rounded-lg border border-warn-line bg-warn-soft px-3 py-2 text-xs text-warn"><AlertTriangle size={14} className="mt-px shrink-0" /><span>{warningText(w)}{w.line !== undefined && ` (${t("invoices.summary.warningLine", { n: w.line + 1 })})`}</span></li>
              ))}</ul>
            )}
            {inv?.status === "issued" || inv?.status === "cancelled" ? (
              <div className="mt-5 space-y-3 border-t border-line pt-4 text-sm" data-testid="issued-panel">
                <dl className="space-y-1.5">
                  <div className="flex justify-between"><dt className="text-muted">{t("invoices.summary.number")}</dt><dd className="font-medium">{inv.number ?? "-"}</dd></div>
                  <div className="flex justify-between"><dt className="text-muted">{t("invoices.summary.type")}</dt><dd>{typeLabel(inv.type)}</dd></div>
                  <div className="flex justify-between"><dt className="text-muted">{t("invoices.summary.provider")}</dt><dd>{inv.provider ? enumLabel("provider", inv.provider) : "-"}</dd></div>
                  <div className="flex justify-between"><dt className="text-muted">{t("invoices.summary.issued")}</dt><dd>{dateTime(inv.issuedAt)}</dd></div>
                  {inv.orderId && <div className="flex justify-between"><dt className="text-muted">{t("invoices.summary.order")}</dt><dd><Link className="text-brand-ink underline" to={`/orders/${inv.orderId}`}>{t("invoices.summary.openOrder")}</Link></dd></div>}
                </dl>
                {inv.pdfUrl && <a href={inv.pdfUrl} target="_blank" rel="noopener noreferrer" className="block text-brand-ink underline">{t("invoices.summary.openPdf")}</a>}
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" size="sm" onClick={() => openPrint("manual-invoice", [inv.id])}><Printer size={14} />{t("invoices.summary.print")}</Button>
                  {inv.status === "issued" && <Link to={composeHref}><Button variant="secondary" size="sm" disabled={!canWrite} title={roleHint}><Mail size={14} />{t("invoices.summary.email")}</Button></Link>}
                  {inv.status === "issued" && <Button variant="danger" size="sm" disabled={!canWrite || admin?.role === "staff"} title={roleHint} onClick={() => setCancelOpen(true)}>{t("invoices.summary.cancel")}</Button>}
                </div>
              </div>
            ) : (
              <div className="mt-5 flex flex-col gap-2 border-t border-line pt-4">
                <Button onClick={openIssue} disabled={!canWrite || status === "issuing"} title={roleHint ?? t("invoices.summary.issueTitle")}>{status === "failed" ? t("invoices.summary.retry") : t("invoices.summary.issue")}</Button>
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="secondary" disabled={!canWrite} title={roleHint} loading={save.isPending} onClick={() => { setShowErrors(true); if (!valid) { toast.error(t("invoices.summary.fixFirst")); return; } save.mutate(); }}>{t("invoices.summary.saveDraft")}</Button>
                  <Button variant="secondary" onClick={() => { setShowErrors(true); if (!valid) { toast.error(t("invoices.summary.fixFirst")); return; } setPreviewOpen(true); }}>{t("invoices.summary.preview")}</Button>
                </div>
              </div>
            )}
          </Card>
        </aside>
      </div>

      <Modal open={issueOpen} onClose={closeIssue} title={t("invoices.issue.title")}
        footer={<><Button variant="ghost" onClick={closeIssue}>{t("invoices.issue.cancelAction")}</Button><Button loading={issue.isPending} onClick={() => issue.mutate()}>{issueErr ? t("invoices.issue.retry") : t("invoices.issue.action")}</Button></>}>
        <div className="space-y-4">
          <dl className="space-y-1.5 text-sm">
            <div className="flex justify-between gap-4"><dt className="text-muted">{t("invoices.issue.customer")}</dt><dd className="text-right font-medium">{form.customer.name}{form.customer.taxId && <span className="block text-xs font-normal text-muted">{form.customer.taxId}</span>}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">{t("invoices.issue.type")}</dt><dd>{type ? typeLabel(type) : t("invoices.issue.typeResolved")}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">{t("invoices.issue.total")}</dt><dd className="font-semibold tabular-nums">{money(totals.total, cur)}</dd></div>
          </dl>
          {pv && pv.warnings.length > 0 && <ul className="space-y-1 text-xs text-warn">{pv.warnings.map((w, i) => <li key={i}>- {warningText(w)}</li>)}</ul>}
          <p role="note" className="rounded-lg border border-warn-line bg-warn-soft px-3 py-2 text-sm text-warn">
            {mock ? t("invoices.issue.noteMock") : t("invoices.issue.noteLive")}
          </p>
          <p className="text-sm text-muted">{t("invoices.issue.consequences")}</p>
          {issueErr && <IssueErrorNotice err={issueErr} />}
        </div>
      </Modal>

      <Modal wide open={previewOpen} onClose={() => setPreviewOpen(false)} title={t("invoices.preview.title")} footer={<Button onClick={() => setPreviewOpen(false)}>{t("common.close")}</Button>}>
        {preview.isPending || !pv ? <Loading /> : (
          <div className="space-y-3 text-sm">
            <p>{t("invoices.preview.type")} <Badge tone="info">{typeLabel(pv.type)}</Badge></p>
            <div className="overflow-x-auto"><table className="w-full text-left"><thead className="text-xs uppercase text-muted"><tr><th className="py-1 pr-2">{t("invoices.preview.col.item")}</th><th className="pr-2 text-right">{t("invoices.preview.col.qty")}</th><th className="pr-2 text-right"><Term id="kdv">{t("invoices.preview.col.kdv")}</Term></th><th className="pr-2 text-right">{t("invoices.preview.col.net")}</th><th className="text-right">{t("invoices.preview.col.total")}</th></tr></thead>
              <tbody className="divide-y divide-line">{pv.lines.map((l, i) => <tr key={i}><td className="py-1.5 pr-2">{l.name}</td><td className="pr-2 text-right">{l.quantity}</td><td className="pr-2 text-right tabular-nums">{money(l.tax, pv.currency)}</td><td className="pr-2 text-right tabular-nums">{money(l.net, pv.currency)}</td><td className="text-right tabular-nums">{money(l.total, pv.currency)}</td></tr>)}</tbody></table></div>
            <p className="text-right">{t("invoices.preview.totals", { net: money(pv.net, pv.currency), kdv: money(pv.taxTotal, pv.currency) })} <strong>{t("invoices.preview.grand", { total: money(pv.total, pv.currency) })}</strong></p>
            {pv.warnings.map((w, i) => <p key={i} className="text-xs text-warn">- {warningText(w)}</p>)}
          </div>
        )}
      </Modal>
      <ConfirmDialog open={cancelOpen} danger title={t("invoices.cancel.title")} confirmLabel={t("invoices.cancel.action")} loading={cancel.isPending}
        message={t("invoices.cancel.message")} onConfirm={() => cancel.mutate()} onClose={() => setCancelOpen(false)} />
    </>
  );
}


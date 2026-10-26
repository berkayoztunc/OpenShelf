import { useEffect, useMemo, useState } from "react";
import { Printer } from "lucide-react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { useSettings } from "../../lib/settings";
import { MAX_PRINT_IDS, mapPool, parseIds, PRINT_KINDS } from "../../lib/print";
import type { PrintKind } from "../../lib/print";
import type { RawOrder } from "../../lib/rawOrder";
import type { InvoiceFull } from "../../lib/invoices";
import { tNow, useT } from "../../i18n";
import { Button, Loading } from "../../components/ui";
import { HelpTip } from "../../components/help/HelpTip";
import { InvoiceDoc, LabelDoc, manualInvoiceData, orderInvoiceData, PackingDoc, SummaryDoc } from "./docs";
import type { Seller } from "./docs";
import "./print.css";

const PAGE_CSS: Record<PrintKind, string> = {
  label: "@page { size: 100mm 150mm; margin: 0; }",
  packing: "@page { size: A4; margin: 14mm; }", invoice: "@page { size: A4; margin: 14mm; }", summary: "@page { size: A4; margin: 14mm; }", "manual-invoice": "@page { size: A4; margin: 14mm; }",
};
interface Loaded<T> { id: string; data?: T; error?: string }
const reason = (e: unknown) => (e instanceof Error ? e.message : tNow("print.loadError"));

export default function PrintPage() {
  const { t, td, tp } = useT();
  const { kind: rawKind } = useParams(); const [sp] = useSearchParams(); const nav = useNavigate();
  const kind = PRINT_KINDS.includes(rawKind as PrintKind) ? (rawKind as PrintKind) : null;
  const { ids, truncated } = useMemo(() => parseIds(sp.get("ids")), [sp]);
  const [showPrices, setShowPrices] = useState(false);
  const settings = useSettings();

  // Screen-only chrome (admin theme) must not leak into the paper: force light colour scheme while mounted.
  useEffect(() => {
    const el = document.documentElement; const prev = el.style.colorScheme;
    el.style.colorScheme = "light"; document.body.style.background = "";
    return () => { el.style.colorScheme = prev; };
  }, []);
  const title = kind ? td(`print.title.${kind}`) : "";
  useEffect(() => { if (kind) document.title = `${title} (${ids.length})`; }, [kind, title, ids.length]);

  const docs = useQuery({
    queryKey: ["print", kind, ids.join(",")], enabled: !!kind && ids.length > 0, staleTime: 30_000, retry: false,
    queryFn: async (): Promise<Loaded<RawOrder | InvoiceFull>[]> => {
      const path = kind === "manual-invoice" ? "/api/admin/manual-invoices" : "/api/admin/orders";
      const res = await mapPool(ids, 4, (id) => api.get<RawOrder | InvoiceFull>(`${path}/${encodeURIComponent(id)}`));
      return res.map((r, i) => (r.status === "fulfilled" ? { id: ids[i]!, data: r.value } : { id: ids[i]!, error: reason(r.reason) }));
    },
  });

  if (!kind) return <div className="pr-stage"><p className="pr-notice">{t("print.unknown")}</p></div>;
  const g = settings.data?.general;
  const seller: Seller = { name: g?.storeName ?? "", address: g?.address, phone: g?.contactPhone, email: g?.contactEmail, taxId: g?.taxId };
  const defaultRate = g?.defaultTaxRate ?? 20;
  const ok = (docs.data ?? []).filter((d) => d.data); const bad = (docs.data ?? []).filter((d) => d.error);

  return (
    <div className="pr-stage">
      <div className="pr-toolbar print:hidden" data-testid="print-toolbar">
        <Button onClick={() => window.print()}><Printer size={15} />{t("common.print")}</Button>
        <Button variant="ghost" onClick={() => (window.history.length > 1 ? nav(-1) : window.close())}>{t("common.back")}</Button>
        <span className="text-sm text-muted">{title} · {tp("print.count", ok.length)}</span>
        <div className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-1">
          {kind === "packing" && <span className="flex items-center gap-1"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={showPrices} onChange={(e) => setShowPrices(e.target.checked)} />{t("print.showPrices")}</label><HelpTip id="orders.printPrices" guide="orders#yazdirma" /></span>}
          <span className="flex items-center gap-1 text-xs text-muted">{kind === "label" ? t("print.labelPaper") : t("print.tipA4")}<HelpTip id="print.paper" guide="orders#yazdirma" /></span>
        </div>
      </div>
      <style>{PAGE_CSS[kind]}</style>
      {ids.length === 0 && <p className="pr-notice">{t("print.noIds")}</p>}
      {truncated && <p className="pr-notice">{t("print.truncated", { max: MAX_PRINT_IDS })}</p>}
      {bad.length > 0 && <div className="pr-notice" role="alert">{tp("print.loadFailed", bad.length, { list: bad.map((b) => `${b.id.slice(0, 8)} (${b.error})`).join(", ") })}</div>}
      {(docs.isPending && ids.length > 0) || settings.isPending ? <Loading label={t("print.preparing")} /> : (
        <div className="pr-doc-wrap">
          {ok.map((d) => {
            if (kind === "manual-invoice") return <InvoiceDoc key={d.id} data={manualInvoiceData(d.data as InvoiceFull, seller)} />;
            const o = d.data as RawOrder;
            if (kind === "label") return <LabelDoc key={d.id} order={o} seller={seller} />;
            if (kind === "packing") return <PackingDoc key={d.id} order={o} seller={seller} showPrices={showPrices} />;
            if (kind === "invoice") return <InvoiceDoc key={d.id} data={orderInvoiceData(o, seller, defaultRate)} />;
            return <SummaryDoc key={d.id} order={o} seller={seller} />;
          })}
        </div>
      )}
    </div>
  );
}

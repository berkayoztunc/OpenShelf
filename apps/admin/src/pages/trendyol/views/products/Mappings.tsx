import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { Button, Card, ConfirmDialog, EmptyState, Modal, Table, Td, TextField, useToast } from "../../../../components/ui";
import { Term } from "../../../../components/help/Term";
import { Typeahead } from "../../../../components/Typeahead";
import { InlineError, TableSkeleton, TyErrorBox } from "../../../../components/trendyol/views/shared";
import { api, errMsg, qs } from "../../../../lib/api";
import { money } from "../../../../lib/format";
import { useT } from "../../../../i18n";

export interface Mapping { variantId: string; sku: string; productName: string; variantTitle?: string; barcode: string; externalId?: string | null }
export interface LookupItem { variantId: string; sku: string; productName: string; variantTitle: string; unitPrice: number; taxRate: number; stock: number }
export const MAPPINGS_KEY = ["trendyol", "mappings"] as const;

/** POST /api/admin/trendyol/mappings (links a local variant to a Trendyol barcode and enables its Trendyol listing). */
export function useMapVariant() {
  const qc = useQueryClient(); const toast = useToast(); const { t } = useT();
  return useMutation({
    mutationFn: (v: { variantId: string; barcode: string }) => api.post("/api/admin/trendyol/mappings", { variantId: v.variantId, barcode: v.barcode }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: MAPPINGS_KEY }); toast.success(t("trendyolviews.map.done")); },
  });
}

export const lookupLabel = (it: LookupItem) => `${it.productName}${it.variantTitle ? ` · ${it.variantTitle}` : ""}`;
export function LookupRow({ it }: { it: LookupItem }) {
  const { t } = useT();
  return <span className="flex items-center justify-between gap-3"><span className="min-w-0"><span className="block truncate font-medium">{lookupLabel(it)}</span><span className="block font-mono text-xs text-muted">{it.sku}</span></span><span className="shrink-0 text-right text-xs text-muted"><span className="block tabular-nums">{money(it.unitPrice)}</span><span>{t("trendyolviews.map.stock", { n: it.stock })}</span></span></span>;
}

/** Link a Trendyol barcode to a local variant (typeahead over `GET /api/admin/catalog-lookup`). */
export function MapDialog({ barcode, title, onClose }: { barcode: string; title?: string; onClose: () => void }) {
  const { t } = useT();
  const map = useMapVariant();
  const [search, setSearch] = useState(""); const [picked, setPicked] = useState<LookupItem | null>(null);
  return (
    <Modal open onClose={onClose} title={t("trendyolviews.map.title")}
      footer={<><Button variant="ghost" onClick={onClose}>{t("common.cancel")}</Button><Button loading={map.isPending} disabled={!picked} onClick={() => picked && map.mutate({ variantId: picked.variantId, barcode }, { onSuccess: onClose })}>{t("trendyolviews.map.save")}</Button></>}>
      <div className="space-y-4" data-testid="tdyv-map">
        <p className="text-sm text-muted">{t("trendyolviews.map.body", { barcode })}{title ? ` — ${title}` : ""}</p>
        <Typeahead<LookupItem> label={t("trendyolviews.map.variant")} hint={t("trendyolviews.map.variant.hint")} path="/api/admin/catalog-lookup" value={search} onChange={(v) => { setSearch(v); setPicked(null); }} onPick={(it) => { setPicked(it); setSearch(lookupLabel(it)); }} render={(it) => <LookupRow it={it} />} placeholder={t("trendyolviews.map.variant.placeholder")} />
        {picked && <p className="rounded-lg bg-canvas p-3 text-sm"><Term id="barcode" />: <span className="font-mono">{barcode}</span> → <Term id="sku" />: <span className="font-mono">{picked.sku}</span></p>}
        {map.error && <InlineError text={errMsg(map.error)} />}
      </div>
    </Modal>
  );
}

/** 'Eşleştirmeler' sub-tab: GET /api/admin/trendyol/mappings with delete and manual add. */
export function MappingsTab() {
  const { t } = useT();
  const qc = useQueryClient(); const toast = useToast();
  const q = useQuery({ queryKey: MAPPINGS_KEY, queryFn: () => api.get<{ items: Mapping[] }>("/api/admin/trendyol/mappings") });
  const del = useMutation({
    mutationFn: (variantId: string) => api.del(`/api/admin/trendyol/mappings${qs({ variantId })}`),
    onSuccess: () => { setAsk(null); void qc.invalidateQueries({ queryKey: MAPPINGS_KEY }); toast.success(t("trendyolviews.mappings.deleted")); },
    onError: (e) => toast.error(errMsg(e)),
  });
  const [ask, setAsk] = useState<Mapping | null>(null);
  const [adding, setAdding] = useState(false);
  const [bc, setBc] = useState("");
  const items = q.data?.items ?? [];
  return (
    <Card title={<>{t("trendyolviews.mappings.title")}</>} actions={<Button size="sm" onClick={() => setAdding(true)}>{t("trendyolviews.mappings.add")}</Button>}>
      <p className="mb-3 text-sm text-muted">{t("trendyolviews.mappings.body")}</p>
      {q.isPending ? <TableSkeleton rows={3} /> : q.error ? <TyErrorBox error={q.error} retry={() => void q.refetch()} />
        : items.length === 0 ? <EmptyState title={t("trendyolviews.mappings.empty.title")} description={t("trendyolviews.mappings.empty.body")} action={<Button variant="secondary" onClick={() => setAdding(true)}>{t("trendyolviews.mappings.add")}</Button>} />
        : <Table caption={t("trendyolviews.mappings.title")} head={[t("trendyolviews.mappings.col.product"), t("trendyolviews.mappings.col.sku"), t("trendyolviews.mappings.col.barcode"), <span key="a" className="sr-only">{t("trendyolviews.common.actions")}</span>]}>
          {items.map((m) => (
            <tr key={m.variantId}><Td><span className="font-medium">{m.productName}</span>{m.variantTitle && <span className="text-muted"> · {m.variantTitle}</span>}</Td><Td className="font-mono text-[13px]">{m.sku}</Td><Td className="font-mono text-[13px]">{m.barcode}</Td>
              <Td className="text-right"><Button size="sm" variant="ghost" aria-label={t("trendyolviews.mappings.delete", { sku: m.sku })} onClick={() => setAsk(m)}><Trash2 size={14} /></Button></Td></tr>
          ))}
        </Table>}
      <ConfirmDialog open={!!ask} danger title={t("trendyolviews.mappings.delete.title")} message={t("trendyolviews.mappings.delete.message", { sku: ask?.sku ?? "", barcode: ask?.barcode ?? "" })} confirmLabel={t("common.delete")} loading={del.isPending} onClose={() => setAsk(null)} onConfirm={() => ask && del.mutate(ask.variantId)} />
      {adding && (bc ? <MapDialog barcode={bc} onClose={() => { setAdding(false); setBc(""); }} /> : (
        <Modal open onClose={() => setAdding(false)} title={t("trendyolviews.mappings.add")} footer={<Button variant="ghost" onClick={() => setAdding(false)}>{t("common.cancel")}</Button>}>
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); const v = (new FormData(e.currentTarget).get("barcode") as string).trim(); if (v) setBc(v); }}>
            <TextField name="barcode" label={t("trendyolviews.mappings.barcode")} hint={t("trendyolviews.mappings.barcode.hint")} help="trendyolviews.barcode" autoFocus />
            <Button type="submit">{t("trendyolviews.common.next")}</Button>
          </form>
        </Modal>))}
    </Card>
  );
}

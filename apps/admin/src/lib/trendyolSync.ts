import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, errMsg } from "./api";
import { useToast } from "../components/ui";
import { useT } from "../i18n";

/** Trendyol sync control (GET/PUT /api/admin/trendyol/sync…): which products follow Trendyol and where content/price come from. */
export type SyncMode = "synced" | "website_only";
export type SyncSource = "local" | "remote";
export interface SyncRow {
  productId: string; name: string; status: string; imageUrl: string | null; mode: SyncMode;
  variants: number; withBarcode: number; linked: number; enabled: number; errors: number; available: number;
  contentSource: SyncSource; priceSource: SyncSource; lastSyncedAt: string | null; lastPulledAt: string | null;
}
export interface SyncVariant {
  variantId: string; sku: string; title: string | null; barcode: string | null; linked: boolean; enabled: boolean;
  available: number; lastSyncedStock: number | null; lastSyncedAt: string | null; lastError: string | null;
}
export interface SyncDetail extends Omit<SyncRow, "available"> { available: boolean; stock: number; variantRows: SyncVariant[] }
export interface SyncList {
  items: SyncRow[]; total: number; page: number; pageSize: number; available: boolean;
  summary: { total: number; synced: number; websiteOnly: number; errors: number; following: number };
}
export interface SyncPatch { productIds: string[]; enabled?: boolean; contentSource?: SyncSource; priceSource?: SyncSource }
interface SyncResult { updated: number; linked: number; skippedNoBarcode: number; barcodeTaken: number }

export const SYNC_KEY = ["trendyol", "sync"] as const;

/** One hook for every write: settings change, push now, pull now. Refreshes the list, the product card and the overview. */
export function useSyncActions() {
  const qc = useQueryClient(); const toast = useToast(); const { t } = useT();
  const done = () => { void qc.invalidateQueries({ queryKey: SYNC_KEY }); void qc.invalidateQueries({ queryKey: ["trendyol", "health"] }); };
  const onError = (e: unknown) => toast.error(errMsg(e));
  const update = useMutation({
    mutationFn: (b: SyncPatch) => api.put<SyncResult>("/api/admin/trendyol/sync", b),
    onSuccess: (r, b) => {
      done();
      // prices/content may have changed underneath an open product form
      if (b.contentSource === "remote" || b.priceSource === "remote") void qc.invalidateQueries({ queryKey: ["product"] });
      if (b.enabled && (r.skippedNoBarcode > 0 || r.barcodeTaken > 0)) toast.info(t("trendyolsync.toast.partial", { linked: r.linked, noBarcode: r.skippedNoBarcode, taken: r.barcodeTaken }));
      else toast.success(t(b.enabled === true ? "trendyolsync.toast.on" : b.enabled === false ? "trendyolsync.toast.off" : "trendyolsync.toast.saved"));
    },
    onError,
  });
  const push = useMutation({
    mutationFn: (productIds: string[]) => api.post("/api/admin/trendyol/sync/push", { productIds }),
    onSuccess: () => { done(); toast.success(t("trendyolsync.toast.push")); }, onError,
  });
  const pull = useMutation({
    mutationFn: (b: { productIds: string[]; stock?: boolean }) => api.post("/api/admin/trendyol/sync/pull", b),
    onSuccess: () => { done(); void qc.invalidateQueries({ queryKey: ["product"] }); toast.success(t("trendyolsync.toast.pull")); }, onError,
  });
  return { update, push, pull };
}

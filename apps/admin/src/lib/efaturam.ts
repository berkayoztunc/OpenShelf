import { createElement, useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { EfaturamCallResult, EfaturamCatalogResponse, EfaturamDiagnosis, EfaturamOperation, EfaturamOutgoingRow } from "@openshelf/shared";
import { ConfirmDialog, useToast } from "../components/ui";
import type { Tone } from "../components/ui";
import { api, errMsg, qs } from "./api";
import type { Paged } from "./types";
import { useT, type MessageKey } from "../i18n";

export const EFATURAM_CATALOG_KEY = ["efaturam", "catalog"] as const;

export function useEfaturamCatalog() {
  const q = useQuery({ queryKey: EFATURAM_CATALOG_KEY, staleTime: 5 * 60_000, queryFn: () => api.get<EfaturamCatalogResponse>("/api/admin/efaturam/catalog") });
  const operations = useMemo(() => q.data?.operations ?? [], [q.data]);
  const byId = useMemo(() => new Map(operations.map((o) => [o.id, o])), [operations]);
  return {
    isPending: q.isPending, error: q.error, refetch: () => { void q.refetch(); },
    mode: q.data?.mode, reason: q.data?.reason, environment: q.data?.environment ?? "live",
    operations, byId, canSend: q.data?.mode === "mock" || q.data?.mode === "live",
  };
}

export interface EfaturamInput { path?: Record<string, string | number>; query?: Record<string, string | number | boolean>; body?: unknown }
const needsConfirm = (op: EfaturamOperation, mode?: string) => mode === "live" && op.risk !== "read";

/**
 * POST /api/admin/efaturam/call. `run` resolves with the result, or null on a transport failure (toasted) or when the user cancels.
 * Live write/destructive calls open a confirmation first (render `confirmNode` once); the hook then sends `confirm: op.id`.
 */
export function useEfaturamCall() {
  const cat = useEfaturamCatalog();
  const toast = useToast(); const { t } = useT();
  const [pending, setPending] = useState<{ op: EfaturamOperation; input: EfaturamInput; resolve: (r: EfaturamCallResult | null) => void } | null>(null);
  const ref = useRef(pending); ref.current = pending;
  const mut = useMutation({
    mutationFn: (v: { op: EfaturamOperation; input: EfaturamInput; confirm: boolean }) =>
      api.post<EfaturamCallResult>("/api/admin/efaturam/call", { operationId: v.op.id, path: v.input.path ?? {}, query: v.input.query ?? {}, ...(v.input.body !== undefined ? { body: v.input.body } : {}), ...(v.confirm ? { confirm: v.op.id } : {}) }),
  });
  const send = useCallback(async (op: EfaturamOperation, input: EfaturamInput, confirm: boolean) => {
    try { return await mut.mutateAsync({ op, input, confirm }); } catch (e) { toast.error(errMsg(e)); return null; }
  }, [mut, toast]);
  const run = useCallback((id: string, input: EfaturamInput = {}): Promise<EfaturamCallResult | null> => {
    const op = cat.byId.get(id);
    if (!op) return Promise.resolve(null);
    if (needsConfirm(op, cat.mode)) return new Promise((resolve) => setPending({ op, input, resolve }));
    return send(op, input, false);
  }, [cat.byId, cat.mode, send]);
  const confirmNode: ReactNode = createElement(ConfirmDialog, {
    open: !!pending, danger: pending?.op.risk === "destructive", loading: mut.isPending,
    title: t("efaturam.confirm.title"),
    message: pending ? t(pending.op.billed ? "efaturam.confirm.billed" : "efaturam.confirm.body", { op: pending.op.id }) : "",
    confirmLabel: t("efaturam.confirm.go"),
    onClose: () => { pending?.resolve(null); setPending(null); },
    onConfirm: async () => { const p = ref.current; if (!p) return; const r = await send(p.op, p.input, true); setPending(null); p.resolve(r); },
  });
  return { run, pending: mut.isPending, confirmNode, cat };
}
export type EfaturamCall = ReturnType<typeof useEfaturamCall>;

/** POST /api/admin/efaturam/diagnose: sign-in + one harmless read call, step by step. */
export function useEfaturamDiagnose() {
  const toast = useToast();
  const mut = useMutation({ mutationFn: () => api.post<EfaturamDiagnosis>("/api/admin/efaturam/diagnose", {}) });
  const run = useCallback(async () => { try { return await mut.mutateAsync(); } catch (e) { toast.error(errMsg(e)); return null; } }, [mut, toast]);
  return { run, pending: mut.isPending, result: mut.data ?? null };
}

export const OUTGOING_PAGE_SIZE = 20;
/** Invoices the store issued through e-Faturam (its own record; the gateway cannot list them). */
export function useEfaturamOutgoing(q: string, page: number, enabled: boolean) {
  return useQuery({ queryKey: ["efaturam", "outgoing", q, page], enabled, queryFn: () => api.get<Paged<EfaturamOutgoingRow>>(`/api/admin/efaturam/outgoing${qs({ q, page, pageSize: OUTGOING_PAGE_SIZE })}`) });
}
export const outgoingLink = (r: EfaturamOutgoingRow) => (r.source === "manual" ? `/invoices/${r.id}` : r.orderId ? `/orders/${r.orderId}` : undefined);
/** Tone of the store's own invoice status (order invoices: pending|issued, manual: draft|issuing|issued|failed|cancelling|cancelled). */
export const recordTone = (s: string): Tone => ({ issued: "success", failed: "danger", cancelled: "neutral", pending: "warning", draft: "warning" } as Record<string, Tone>)[s] ?? "info";

/* ------------------------------------------------------------ data helpers */

/** Document status codes from the API reference ("Fatura Statü Kodları"). */
export const STATUS_CODES = ["10", "20", "29", "30", "40", "50", "100", "105", "200", "205", "305", "405"] as const;
export const statusKey = (code: unknown): MessageKey | undefined => (STATUS_CODES as readonly string[]).includes(String(code)) ? (`efaturam.status.${String(code)}` as MessageKey) : undefined;
export const statusTone = (code: unknown): Tone => {
  const c = String(code ?? "");
  if (c === "205") return "success";
  if (c === "29" || c === "405" || c === "105" || c === "100") return "danger";
  if (c === "305") return "neutral";
  if (c === "50") return "warning";
  return "info";
};

/** Rows of a search answer. The list key is not documented, so take `content`, else the first array found. */
export function rowsOf(r: EfaturamCallResult | null): Record<string, any>[] {
  const b = r?.response.body as any;
  if (Array.isArray(b)) return b;
  if (!b || typeof b !== "object") return [];
  if (Array.isArray(b.content)) return b.content;
  const first = Object.values(b).find((v) => Array.isArray(v));
  return (first as Record<string, any>[] | undefined) ?? [];
}
/** First non-empty value among candidate field names (the search row shape is not documented). */
export const pick = (row: Record<string, any>, ...keys: string[]): unknown => { for (const k of keys) if (row[k] !== undefined && row[k] !== null && row[k] !== "") return row[k]; return undefined; };

/** Active e-Fatura aliases of a taxpayer lookup answer. */
export const invoiceAliases = (r: EfaturamCallResult | null): { alias: string; title?: string }[] =>
  (Array.isArray(r?.response.body) ? (r!.response.body as any[]) : []).filter((x) => x?.aliasType === "INVOICE" && !x?.deletedAt && x?.alias).map((x) => ({ alias: String(x.alias), title: x.title ? String(x.title) : undefined }));

export const isoDay = (d: Date) => d.toISOString().slice(0, 10);
export const httpsUrl = (v: unknown): string | undefined => { const s = typeof v === "string" ? v.trim().replace(/^"|"$/g, "") : ""; return /^https:\/\//.test(s) ? s : undefined; };

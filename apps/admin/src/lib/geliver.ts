import { createElement, useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { GeliverCallResult, GeliverCatalogResponse, GeliverOperation, Text } from "@openshelf/shared";
import { ConfirmDialog, useToast } from "../components/ui";
import { api, errMsg } from "./api";
import { useT, type Locale } from "../i18n";

export const GELIVER_CATALOG_KEY = ["geliver", "catalog"] as const;
export const gloc = (x: Text | undefined, locale: Locale): string => (x ? x[locale] || x.en || x.tr : "");

export function useGeliverCatalog() {
  const q = useQuery({ queryKey: GELIVER_CATALOG_KEY, staleTime: 5 * 60_000, queryFn: () => api.get<GeliverCatalogResponse>("/api/admin/geliver/catalog") });
  const operations = useMemo(() => q.data?.operations ?? [], [q.data]);
  const byId = useMemo(() => new Map(operations.map((o) => [o.id, o])), [operations]);
  return {
    isPending: q.isPending, error: q.error, refetch: () => { void q.refetch(); },
    mode: q.data?.mode, reason: q.data?.reason, test: q.data?.test ?? true, senderAddressId: q.data?.senderAddressId,
    operations, byId, canSend: q.data?.mode === "mock" || q.data?.mode === "live",
  };
}

export interface GeliverInput { path?: Record<string, string | number>; query?: Record<string, string | number | boolean>; body?: unknown }
const needsConfirm = (op: GeliverOperation, mode?: string) => mode === "live" && op.risk !== "read";

/**
 * POST /api/admin/geliver/call. `run` resolves with the result, or null on a transport failure (toasted) or when the user cancels.
 * Live write/destructive calls open a confirmation first (render `confirmNode` once); the hook then sends `confirm: op.id`.
 */
export function useGeliverCall() {
  const cat = useGeliverCatalog();
  const toast = useToast(); const { t } = useT();
  const [pending, setPending] = useState<{ op: GeliverOperation; input: GeliverInput; resolve: (r: GeliverCallResult | null) => void } | null>(null);
  const ref = useRef(pending); ref.current = pending;
  const mut = useMutation({
    mutationFn: (v: { op: GeliverOperation; input: GeliverInput; confirm: boolean }) =>
      api.post<GeliverCallResult>("/api/admin/geliver/call", { operationId: v.op.id, path: v.input.path ?? {}, query: v.input.query ?? {}, ...(v.input.body !== undefined ? { body: v.input.body } : {}), ...(v.confirm ? { confirm: v.op.id } : {}) }),
  });
  const send = useCallback(async (op: GeliverOperation, input: GeliverInput, confirm: boolean) => {
    try { return await mut.mutateAsync({ op, input, confirm }); } catch (e) { toast.error(errMsg(e)); return null; }
  }, [mut, toast]);
  const run = useCallback((id: string, input: GeliverInput = {}): Promise<GeliverCallResult | null> => {
    const op = cat.byId.get(id);
    if (!op) return Promise.resolve(null);
    if (needsConfirm(op, cat.mode)) return new Promise((resolve) => setPending({ op, input, resolve }));
    return send(op, input, false);
  }, [cat.byId, cat.mode, send]);
  const confirmNode: ReactNode = createElement(ConfirmDialog, {
    open: !!pending, danger: pending?.op.risk === "destructive", loading: mut.isPending,
    title: t("geliver.confirm.title"),
    message: pending ? t(pending.op.billed ? "geliver.confirm.billed" : "geliver.confirm.body", { op: pending.op.id }) : "",
    confirmLabel: t("geliver.confirm.go"),
    onClose: () => { pending?.resolve(null); setPending(null); },
    onConfirm: async () => { const p = ref.current; if (!p) return; const r = await send(p.op, p.input, true); setPending(null); p.resolve(r); },
  });
  return { run, pending: mut.isPending, confirmNode, cat };
}

/** `{ data: [...] }` | `{ data: { ... } }` | root array → rows for tables. */
export function rowsOf(r: GeliverCallResult | null): Record<string, any>[] {
  const b = r?.response.body as any;
  const d = Array.isArray(b) ? b : b?.data ?? b?.priceList ?? [];
  return Array.isArray(d) ? d : [];
}

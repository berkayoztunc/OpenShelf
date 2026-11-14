import { z } from "zod";
import type { OpBody, OpParam, Risk, Text } from "./trendyol";

/**
 * e-Faturam API console contract (shared by the catalog, the Worker proxy and the admin UI).
 * Every operation is data; the Worker never calls a URL that is not derived from a catalog operation.
 */
export const EFATURAM_GROUPS = ["taxpayers", "earchive", "einvoice", "incoming", "documents"] as const;
export type EfaturamGroup = (typeof EFATURAM_GROUPS)[number];

/** Ids of the signed-in account; the gateway wants them in most request bodies. */
export type EfaturamAutofill = "companyId" | "userId";

export interface EfaturamOperation {
  id: string; group: EfaturamGroup; title: Text; summary: Text;
  method: "GET" | "POST";
  /** path after the gateway origin, `{param}` placeholders, e.g. `/api/invoice/taxpayers/{taxId}` */
  path: string;
  params: OpParam[]; body: OpBody; risk: Risk;
  /** Filled from the signed-in account when the caller leaves them out (body field, or path parameter of the same name). */
  autofill?: EfaturamAutofill[];
  /** true when a live call creates a real, legally binding document and spends invoice credit */
  billed?: boolean;
  notes?: Text;
}

export const EfaturamCallBody = z.object({
  operationId: z.string().min(1).max(80),
  path: z.record(z.string(), z.union([z.string(), z.number()])).default({}),
  query: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({}),
  body: z.unknown().optional(),
  /** live write/destructive calls require confirm === operationId */
  confirm: z.string().optional(),
});
export type EfaturamCallBody = z.infer<typeof EfaturamCallBody>;

export interface EfaturamCallResult {
  ok: boolean; status: number; durationMs: number;
  /** true = produced by the offline mock (nothing left this Worker) */
  mock: boolean; operationId: string; risk: Risk;
  request: { method: string; url: string; query: Record<string, unknown>; body?: unknown };
  response: { body: unknown; truncated?: boolean };
  error?: { message: string; code?: string };
}

export interface EfaturamCatalogResponse {
  mode: "mock" | "live" | "disabled";
  reason?: "not_configured" | "integration_disabled";
  /** which gateway the saved configuration points at */
  environment: "live" | "test";
  operations: EfaturamOperation[];
}

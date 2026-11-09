import { z } from "zod";
import type { OpBody, OpParam, Risk, Text } from "./trendyol";

/**
 * Geliver API console contract (shared by the catalog, the Worker proxy and the admin UI).
 * Every operation is data; the Worker never calls a URL that is not derived from a catalog operation.
 */
export const GELIVER_GROUPS = ["shipments", "offers", "addresses", "account", "webhooks", "geo"] as const;
export type GeliverGroup = (typeof GELIVER_GROUPS)[number];

export interface GeliverOperation {
  id: string; group: GeliverGroup; title: Text; summary: Text;
  method: "GET" | "POST" | "PUT" | "DELETE";
  /** path after the API base, `{param}` placeholders, e.g. `/shipments/{id}` */
  path: string;
  params: OpParam[]; body: OpBody; risk: Risk;
  /** true when a live call can charge your Geliver balance / carrier (label purchase) */
  billed?: boolean;
  notes?: Text;
}

export const GeliverCallBody = z.object({
  operationId: z.string().min(1).max(80),
  path: z.record(z.string(), z.union([z.string(), z.number()])).default({}),
  query: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({}),
  body: z.unknown().optional(),
  /** live write/destructive calls require confirm === operationId */
  confirm: z.string().optional(),
});
export type GeliverCallBody = z.infer<typeof GeliverCallBody>;

export interface GeliverCallResult {
  ok: boolean; status: number; durationMs: number;
  /** true = produced by the offline mock (nothing left this Worker) */
  mock: boolean; operationId: string; risk: Risk;
  request: { method: string; url: string; query: Record<string, unknown>; body?: unknown };
  response: { body: unknown; truncated?: boolean };
  error?: { message: string; code?: string };
}

export interface GeliverCatalogResponse {
  mode: "mock" | "live" | "disabled";
  reason?: "not_configured" | "integration_disabled";
  /** Geliver test mode flag from the integration config (test shipments are free) */
  test: boolean;
  senderAddressId?: string;
  operations: GeliverOperation[];
}

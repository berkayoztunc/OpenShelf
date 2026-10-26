import { z } from "zod";

/**
 * Trendyol API console contract (shared by the catalog, the Worker proxy and the admin UI).
 * The catalog describes EVERY public Trendyol marketplace API operation (Turkey, docs v2.0) as data; the Worker never
 * calls a URL that is not derived from a catalog operation.
 */
export type Text = { tr: string; en: string };
export type Risk = "read" | "write" | "destructive";
export type TrendyolEnv = "production" | "stage";

export const TRENDYOL_GROUPS = [
  "brands", "categories", "products", "updates", "inventory", "batch", "lookup", "orders", "split", "shipping", "address",
  "claims", "questions", "invoices", "seller", "labels", "webhooks", "finance", "cargoInvoice", "express", "test", "warranty", "video",
] as const;
export type TrendyolGroup = (typeof TRENDYOL_GROUPS)[number];
/** Task-oriented areas shown in the UI; every group maps to one. */
export const TRENDYOL_AREAS = ["catalog", "products", "orders", "returns", "questions", "finance", "tools"] as const;
export type TrendyolArea = (typeof TRENDYOL_AREAS)[number];

export type ParamType = "string" | "integer" | "number" | "boolean" | "array" | "timestamp_ms";
export interface OpParam {
  name: string; in: "path" | "query" | "header";
  type: ParamType; required?: boolean; enum?: string[]; default?: string | number | boolean;
  /** arrays: `comma` (status=A,B — Trendyol default) or `repeat` (status=A&status=B) */
  arrayStyle?: "comma" | "repeat";
  description: Text; example?: string | number | boolean;
}
export interface BodyField { path: string; type: string; required?: boolean; description: Text }
export interface OpBody {
  kind: "json" | "multipart" | "none";
  /** A COMPLETE, realistic example body copied/adapted from the official docs (pre-filled in the UI). */
  example?: unknown;
  /** Field hints (dot paths, `items[].barcode`). Not a validator; the server validates only size/JSON. */
  fields?: BodyField[];
  /** multipart only: file field name + accepted mime types */
  file?: { field: string; accept: string[] };
}
export interface OpTable {
  /** Dot path of the array inside the JSON response (e.g. "content", "items", "" for the root array). */
  listPath: string;
  columns: { key: string; label: Text }[];
}

export interface TrendyolOperation {
  /** operationId from the official reference (e.g. getShipmentPackages). Unique. */
  id: string;
  group: TrendyolGroup; area: TrendyolArea;
  title: Text; summary: Text;
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  /** Full path after the host, with `{sellerId}` and other `{param}` placeholders, e.g. `/integration/order/sellers/{sellerId}/orders`. */
  path: string;
  /** Which hosts it exists on. Defaults to both; test-order APIs are stage-only. */
  envs?: TrendyolEnv[];
  params: OpParam[];
  body: OpBody;
  risk: Risk;
  /** Result list for the table view. */
  table?: OpTable;
  pagination?: { pageParam: string; sizeParam: string; maxSize: number; firstPage: 0 | 1 };
  /** e.g. "Product Integration Read group: 1000 req/min" */
  rateLimit?: Text;
  /** Official reference page (https://developers.trendyol.com/v2.0/reference/<id>) */
  docsUrl: string;
  deprecated?: Text;
  notes?: Text;
}

/** Calls the Worker accepts. */
export const TrendyolCallBody = z.object({
  operationId: z.string().min(1).max(80),
  /** override of the configured environment (only if allowed); default = integration config */
  env: z.enum(["production", "stage"]).optional(),
  path: z.record(z.string(), z.union([z.string(), z.number()])).default({}),   // path params except sellerId
  query: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.array(z.union([z.string(), z.number()]))])).default({}),
  body: z.unknown().optional(),
  /** destructive/write operations on the live (production) environment require confirm === operationId */
  confirm: z.string().optional(),
});
export type TrendyolCallBody = z.infer<typeof TrendyolCallBody>;

export interface TrendyolCallResult {
  ok: boolean;
  status: number;
  durationMs: number;
  /** true = produced by the offline mock (nothing left this Worker) */
  mock: boolean;
  env: TrendyolEnv;
  operationId: string; risk: Risk;
  /** the request as sent (credentials never included; sellerId visible) */
  request: { method: string; url: string; query: Record<string, unknown>; body?: unknown };
  response: { headers: Record<string, string>; body: unknown; truncated?: boolean; contentType?: string };
  /** friendly error mapping for Trendyol error shapes */
  error?: { code?: string; message: string; hint?: string };
}

export interface TrendyolCatalogResponse {
  mode: "mock" | "live" | "disabled";
  /** why disabled (not configured / integration off) */
  reason?: "not_configured" | "integration_disabled";
  env: TrendyolEnv;
  sellerId?: string;
  operations: TrendyolOperation[];
  /** hard limits the UI should respect */
  limits: { maxBodyBytes: number; maxResponseBytes: number };
}

export const TRENDYOL_HOSTS: Record<TrendyolEnv, string> = { production: "https://apigw.trendyol.com", stage: "https://stageapigw.trendyol.com" };

/** Stateful offline simulation used in mock mode. Handlers get a tiny async KV (backed by the mock_state table). */
export interface MockState {
  get<T = unknown>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
  /** unique incrementing id helper */
  nextId(namespace: string): Promise<number>;
  now(): number;
}
export interface MockRequest {
  op: TrendyolOperation; sellerId: string; env: TrendyolEnv;
  path: Record<string, string | number>; query: Record<string, unknown>; body: unknown;
}
export interface MockResponse { status: number; body: unknown; headers?: Record<string, string> }
export type MockHandler = (req: MockRequest, state: MockState) => Promise<MockResponse> | MockResponse;

import type { Context } from "hono";
import { ZodError, type ZodTypeAny, type z } from "zod";
import type { AppEnv } from "../env";

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown, public headers?: Record<string, string>) { super(message); }
}
export const bad = (message: string, details?: unknown) => new ApiError(400, "bad_request", message, details);
export const notFound = (what = "Resource") => new ApiError(404, "not_found", `${what} not found`);
export const forbidden = (message = "Forbidden") => new ApiError(403, "forbidden", message);
export const unauthorized = (message = "Authentication required") => new ApiError(401, "unauthorized", message);

export function zodDetails(e: ZodError) {
  return e.issues.map((i) => ({ path: i.path.join("."), message: i.message, code: i.code }));
}
export function parse<S extends ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  const r = schema.safeParse(data);
  if (!r.success) throw new ApiError(400, "validation_error", "Invalid request", zodDetails(r.error));
  return r.data;
}
export async function body<S extends ZodTypeAny>(c: Context<AppEnv>, schema: S): Promise<z.infer<S>> {
  let json: unknown;
  try { json = await c.req.json(); } catch { throw new ApiError(400, "invalid_json", "Request body must be valid JSON"); }
  return parse(schema, json);
}
export function paging(c: Context<AppEnv>, defaultSize = 20, max = 100) {
  const page = Math.max(1, Math.floor(Number(c.req.query("page")) || 1));
  const pageSize = Math.min(max, Math.max(1, Math.floor(Number(c.req.query("pageSize")) || defaultSize)));
  return { page, pageSize, offset: (page - 1) * pageSize };
}
export const paged = <T>(items: T[], total: number, p: { page: number; pageSize: number }) => ({ items, total, page: p.page, pageSize: p.pageSize });
export const likeEscape = (s: string) => s.replace(/[\\%_]/g, (m) => `\\${m}`);
export const nowDate = () => new Date();

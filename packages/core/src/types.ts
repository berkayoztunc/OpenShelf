import type { DrizzleD1Database } from "drizzle-orm/d1";
import type * as schema from "@openshelf/db";
import type { SQL } from "drizzle-orm";
import { SQLiteSyncDialect } from "drizzle-orm/sqlite-core";

export type Db = DrizzleD1Database<typeof schema>;
export type Statement = Parameters<Db["batch"]>[0][number];

/** Run statements atomically (D1 batch = one transaction). */
export async function runBatch(db: Db, stmts: unknown[]): Promise<unknown[]> {
  if (stmts.length === 0) return [];
  return (await db.batch(stmts as unknown as Parameters<Db["batch"]>[0])) as unknown as unknown[];
}
export const nowSec = (d: Date = new Date()) => Math.floor(d.getTime() / 1000);

/**
 * Raw SQL statement usable inside db.batch() (drizzle 0.36 `db.run()` is not batchable on D1).
 * Requires the Db to come from `drizzle(d1)` (exposes `$client`).
 */
export function raw(db: Db, q: SQL) {
  const client = (db as unknown as { $client: D1Database }).$client;
  const built = new SQLiteSyncDialect().sqlToQuery(q);
  const stmt = client.prepare(built.sql);
  return { _prepare: () => ({ stmt, getQuery: () => ({ sql: built.sql, params: built.params }), mapResult: (r: unknown) => r }) };
}

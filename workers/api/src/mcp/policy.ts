import { eq, inArray } from "drizzle-orm";
import { mcpToolSettings } from "@openshelf/db";
import type { Db } from "../env";
import { TOOL_BY_NAME } from "./tools";

/** Reserved row: disabled = MCP master switch off (all tools hidden, endpoint answers 403). */
export const MASTER = "*";
export interface ToolPolicy { masterEnabled: boolean; disabled: Set<string> }

/** Owner-controlled switches. Default (no rows) = everything allowed, bounded by each token's level. */
export async function loadPolicy(db: Db): Promise<ToolPolicy> {
  const rows = await db.select({ tool: mcpToolSettings.tool }).from(mcpToolSettings).where(eq(mcpToolSettings.enabled, false));
  const disabled = new Set(rows.map((r) => r.tool));
  const masterEnabled = !disabled.has(MASTER); disabled.delete(MASTER);
  return { masterEnabled, disabled };
}

/** Applies a patch: `true` removes the row (default allowed), `false` stores a disabled row. Unknown tool names are rejected by the caller. */
export async function savePolicy(db: Db, adminId: string, patch: { masterEnabled?: boolean; tools?: Record<string, boolean> }) {
  const want = new Map<string, boolean>(Object.entries(patch.tools ?? {}));
  if (patch.masterEnabled !== undefined) want.set(MASTER, patch.masterEnabled);
  const off = [...want].filter(([, v]) => !v).map(([k]) => k);
  const on = [...want].filter(([, v]) => v).map(([k]) => k);
  const stmts = [];
  if (on.length) for (let i = 0; i < on.length; i += 80) stmts.push(db.delete(mcpToolSettings).where(inArray(mcpToolSettings.tool, on.slice(i, i + 80))));
  for (let i = 0; i < off.length; i += 20) {
    stmts.push(db.insert(mcpToolSettings).values(off.slice(i, i + 20).map((tool) => ({ tool, enabled: false, updatedBy: adminId }))).onConflictDoUpdate({ target: mcpToolSettings.tool, set: { enabled: false, updatedBy: adminId, updatedAt: new Date() } }));
  }
  for (let i = 0; i < stmts.length; i += 40) await db.batch(stmts.slice(i, i + 40) as unknown as [any, ...any[]]);
}

export const isKnownTool = (n: string) => TOOL_BY_NAME.has(n);

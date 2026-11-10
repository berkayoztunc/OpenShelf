import { Hono } from "hono";
import type { AppEnv } from "../env";
import { ApiError } from "../lib/http";
import { helpIndex, helpRead, helpSearch, type HelpLang } from "../lib/help";
import { requireRole } from "../middleware/auth";
import { getSettings } from "../lib/settings";

/** The admin guide (apps/admin/src/help) as an API, for the MCP help tools: topics, search, read a chapter or one section. */
export const adminHelp = new Hono<AppEnv>();
const langOf = async (c: { req: { query(k: string): string | undefined }; get(k: "db"): AppEnv["Variables"]["db"] }): Promise<HelpLang> => {
  const l = c.req.query("lang");
  if (l === "tr" || l === "en") return l;
  if (l) throw new ApiError(400, "validation_error", "lang must be tr or en");
  return (await getSettings(c.get("db"), "general")).defaultLocale;
};
adminHelp.get("/help", requireRole("staff"), async (c) => c.json({ topics: helpIndex(await langOf(c)), tip: "help_search to find a question, help_read topic=<topic> [section=<id>] to read it" }));
adminHelp.get("/help/search", requireRole("staff"), async (c) => {
  const q = c.req.query("q")?.trim() ?? "";
  if (q.length < 2) throw new ApiError(400, "validation_error", "q must be at least 2 characters");
  const limit = Math.min(20, Math.max(1, Number(c.req.query("limit") ?? 8) || 8));
  return c.json({ query: q, results: helpSearch(await langOf(c), q, limit) });
});
adminHelp.get("/help/:topic", requireRole("staff"), async (c) => {
  const r = helpRead(await langOf(c), c.req.param("topic"), c.req.query("section") || undefined);
  if ("error" in r) throw new ApiError(404, r.error === "unknown_topic" ? "unknown_topic" : "unknown_section", r.error === "unknown_topic" ? "No such topic: call help_topics for the list" : `No such section: ${JSON.stringify((r as { sections: { id: string }[] }).sections.map((s) => s.id))}`);
  return c.json(r);
});

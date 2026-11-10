import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// The single Worker only sees a request when its path is listed in wrangler.jsonc `assets.run_worker_first`; everything else is answered
// by the static assets / SPA fallback. A route missing from that list works in tests and `wrangler dev` but silently 405s/404s in production
// (this happened to /mcp and /unsubscribe). This test fails when a Worker-handled path is not listed.
const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const jsonc = read("wrangler.jsonc").replace(/^\s*\/\/.*$/gm, "");
const list = JSON.parse(jsonc.match(/"run_worker_first"\s*:\s*(\[[\s\S]*?\])/)[1]);

const covered = (path) => list.some((p) => (p.endsWith("/*") ? path === p.slice(0, -2) || path.startsWith(p.slice(0, -1)) : p.endsWith("*") ? path.startsWith(p.slice(0, -1)) : p === path));
/** "/unsubscribe/:cid/:token" -> "/unsubscribe/x/x", "/sitemap-:n{[0-9]+}.xml" -> "/sitemap-1.xml", "/mcp/:token?" -> "/mcp" */
const sample = (route) => route.replace(/:[A-Za-z]+\{[^}]*\}/g, "1").replace(/\/:[A-Za-z]+\?/g, "").replace(/:[A-Za-z]+/g, "x");

const FILES = ["workers/api/src/routes/public.ts", "workers/api/src/routes/site.ts", "workers/api/src/routes/unsubscribe.ts", "workers/api/src/mcp/server.ts", "workers/api/src/oauth/routes.ts", "workers/api/src/index.ts"];

test("run_worker_first list parses and contains the API prefix", () => { assert.ok(list.includes("/api/*")); });

test("every path the Worker serves outside /api is listed in run_worker_first", () => {
  const missing = [];
  for (const f of FILES) {
    for (const m of read(f).matchAll(/\b(?:\w+Routes|app|mountMcp)?\.?(?:get|post|all|put|delete)\(\s*"(\/[^"]*)"/g)) {
      const route = m[1];
      if (route === "/" || route.startsWith("/api/") || route === "/*") continue;
      if (!covered(sample(route))) missing.push(`${f}: ${route}`);
    }
    for (const m of read(f).matchAll(/app\.route\(\s*"(\/[^"]+)"/g)) if (!m[1].startsWith("/api/") && !covered(m[1] + "/x")) missing.push(`${f}: app.route ${m[1]}`);
  }
  assert.deepEqual(missing, []);
});

test("the paths that broke in production are listed", () => {
  for (const p of ["/mcp", "/unsubscribe/c/t", "/health", "/webhooks/x", "/media/x", "/mock/pay/x", "/.well-known/oauth-protected-resource", "/.well-known/oauth-authorization-server/mcp", "/oauth/token", "/oauth/register", "/oauth/authorize", "/oauth/revoke"]) assert.ok(covered(p), p);
});

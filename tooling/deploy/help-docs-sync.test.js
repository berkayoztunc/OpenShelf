import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { render } from "./gen-help-docs.mjs";

// The MCP help tools serve a snapshot of the admin guide that is bundled into the Worker. This fails when someone edits a guide page
// (apps/admin/src/help) without regenerating it, which would make AI clients read outdated documentation.
test("the bundled guide snapshot matches apps/admin/src/help", () => {
  const current = readFileSync(new URL("../../workers/api/src/mcp/helpDocs.generated.ts", import.meta.url), "utf8");
  assert.equal(current, render(), "run: node tooling/deploy/gen-help-docs.mjs");
});

#!/usr/bin/env node
// Loads seed.sql into the LOCAL D1 database. Use --dry-run to print the command.
// Refuses --remote on purpose: the demo data is for local/dev databases.
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const apiDir = resolve(here, "../../workers/api");
const file = resolve(here, process.argv.find((a) => a.startsWith("--file="))?.slice(7) ?? "seed.sql");
const dbName = process.argv.find((a) => a.startsWith("--db-name="))?.slice(10) ?? "openshelf";
if (process.argv.includes("--remote")) { console.error("Refusing to seed a remote database."); process.exit(1); }

const cmd = ["npx", "--yes", "wrangler", "d1", "execute", dbName, "--local", `--file=${file}`];
if (process.argv.includes("--dry-run")) { console.log(`[dry-run] (cd workers/api) ${cmd.join(" ")}`); process.exit(0); }
const r = spawnSync(cmd[0], cmd.slice(1), { cwd: apiDir, stdio: "inherit" });
process.exit(r.status ?? 1);

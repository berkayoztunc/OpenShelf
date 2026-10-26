#!/usr/bin/env node
// OpenShelf guided setup (single-Worker deployment: storefront + admin + API in ONE Worker). Idempotent: safe to re-run.
//   node tooling/setup/setup.mjs            # deploy to your Cloudflare account
//   node tooling/setup/setup.mjs --local    # write .dev.vars + apply local migrations (API-only dev and `pnpm preview`)
//   node tooling/setup/setup.mjs --dry-run  # print planned commands, change nothing
// Flags: --yes (non-interactive, paid add-ons stay OFF), --enable-r2, --skip-deploy, --mock (print Mock Mode steps after deploy),
//        --domain=https://shop.example.com (pin ORIGIN vars; default: same-origin, derived per request), --db-name=NAME
// The canonical config is the root wrangler.jsonc (workers/api/wrangler.toml is only for local API-only development).
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";

const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opt = (n) => args.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const DRY = flag("dry-run");
const LOCAL = flag("local");
const YES = flag("yes");
const MOCK = flag("mock");
const DB_NAME = opt("db-name") ?? "openshelf";
const R2_BUCKET = "openshelf-media";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const API_DIR = resolve(ROOT, "workers/api");
const CONFIG = resolve(ROOT, "wrangler.jsonc");
const DEV_VARS = resolve(ROOT, ".dev.vars");
const API_DEV_VARS = resolve(API_DIR, ".dev.vars");

const log = (m = "") => console.log(m);
const step = (m) => log(`\n==> ${m}`);
const warn = (m) => log(`WARNING: ${m}`);

/** Run a command. Secrets are only ever passed through `input` (stdin), never argv or logs. */
function run(cmd, cmdArgs, { input, allowFail = false, label, cwd = ROOT } = {}) {
  const shown = `${cmd} ${cmdArgs.join(" ")}`;
  if (DRY) {
    log(`[dry-run] (cd ${cwd === ROOT ? "." : cwd.replace(ROOT + "/", "")}) ${shown}${input !== undefined ? "   < <secret via stdin>" : ""}`);
    return { ok: true, stdout: "", stderr: "", dry: true };
  }
  log(`$ ${label ?? shown}`);
  const r = spawnSync(cmd, cmdArgs, { cwd, input, encoding: "utf8", env: { ...process.env, CI: process.env.CI ?? "" } });
  const ok = r.status === 0;
  if (!ok && !allowFail) {
    console.error(r.stderr || r.stdout);
    throw new Error(`Command failed: ${label ?? shown}`);
  }
  return { ok, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}
const wrangler = (a, o) => run("npx", ["--yes", "wrangler", ...a], o);
const wranglerRoot = (a, o) => wrangler([...a, "-c", "wrangler.jsonc"], o);
const pnpm = (a, o) => run("pnpm", a, o);

async function ask(question, def = false) {
  if (YES || !process.stdin.isTTY) return def;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const a = (await rl.question(`${question} [${def ? "Y/n" : "y/N"}] `)).trim().toLowerCase();
  rl.close();
  return a === "" ? def : a === "y" || a === "yes";
}
async function askText(question, def) {
  if (YES || !process.stdin.isTTY) return def;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const a = (await rl.question(`${question}${def ? ` [${def}]` : ""} `)).trim();
  rl.close();
  return a || def;
}

const genKey = () => randomBytes(32).toString("base64");
const genToken = () => randomBytes(24).toString("hex");
const readConfig = () => readFileSync(CONFIG, "utf8");
function patchConfig(fn, what) {
  if (DRY) return log(`[dry-run] patch wrangler.jsonc: ${what}`);
  const before = readConfig();
  const after = fn(before);
  if (after !== before) writeFileSync(CONFIG, after);
  log(`patched wrangler.jsonc: ${what}`);
}

// ------------------------------------------------------------------ local mode
async function localMode() {
  step("Local setup");
  let setupToken = null;
  if (existsSync(DEV_VARS) || existsSync(API_DEV_VARS)) {
    log(".dev.vars already exists; leaving it untouched.");
  } else if (DRY) {
    log("[dry-run] write .dev.vars (root) and workers/api/.dev.vars with generated APP_ENCRYPTION_KEY and SETUP_TOKEN");
  } else {
    setupToken = genToken();
    const body = `APP_ENCRYPTION_KEY=${genKey()}\nSETUP_TOKEN=${setupToken}\nTURNSTILE_SECRET=\n`;
    writeFileSync(DEV_VARS, body, { mode: 0o600 });
    writeFileSync(API_DEV_VARS, body, { mode: 0o600 });
    log("wrote .dev.vars and workers/api/.dev.vars (mode 600, git-ignored; never commit them).");
  }
  step("Applying migrations to local D1");
  wrangler(["d1", "migrations", "apply", DB_NAME, "--local"], { cwd: API_DIR }); // API-only dev (pnpm dev)
  wranglerRoot(["d1", "migrations", "apply", "DB", "--local"]);                    // single-Worker preview (pnpm preview)
  log("\nNext: pnpm seed (optional demo data) | pnpm dev (API + Vite apps) | pnpm dev:site (build + single-Worker preview)");
  if (setupToken) log(`\nLocal SETUP_TOKEN (dev only, also stored in .dev.vars): ${setupToken}`);
  else log("Your SETUP_TOKEN is in .dev.vars.");
}

// ----------------------------------------------------------------- remote mode
async function remoteMode() {
  log("OpenShelf setup. Target: your own Cloudflare account. One Worker serves storefront (/), admin (/admin/) and API (/api/*).");
  log("The core (Workers + D1 + static assets) is designed to run on Cloudflare's free plan for small shops, but limits");
  log("and billing rules are Cloudflare's and can change. Check https://developers.cloudflare.com/workers/platform/pricing/ .");

  step("1/7 Checking wrangler login");
  const who = wrangler(["whoami"], { allowFail: true });
  if (!DRY && (!who.ok || /not authenticated/i.test(who.stdout + who.stderr))) {
    log("You are not logged in. Running `wrangler login` (opens a browser)...");
    wrangler(["login"]);
  }

  step("2/7 D1 database");
  let dbId = null;
  const current = readConfig().match(/"database_id"\s*:\s*"([^"]+)"/)?.[1];
  if (current) {
    dbId = current;
    log(`wrangler.jsonc already has a database_id; reusing it (${dbId.slice(0, 8)}...).`);
  } else {
    const list = wrangler(["d1", "list", "--json"], { allowFail: true });
    try {
      const found = JSON.parse(list.stdout || "[]").find((d) => d.name === DB_NAME);
      if (found) { dbId = found.uuid; log(`Found existing D1 database "${DB_NAME}"; reusing.`); }
    } catch { /* fall through to create */ }
    if (!dbId) {
      const created = wrangler(["d1", "create", DB_NAME]);
      dbId = created.stdout.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0] ?? null;
      if (!DRY && !dbId) throw new Error("Could not parse database_id from `wrangler d1 create` output.");
    }
    patchConfig((t) => t.replace(/("database_name"\s*:\s*"[^"]*")/, `$1, "database_id": "${dbId}"`), "d1 database_id");
  }

  step("3/7 Origins (optional)");
  const domain = opt("domain") ?? (await askText("Custom domain to pin (https://shop.example.com) or blank for same-origin default:", ""));
  if (domain) {
    if (!/^https:\/\/[^/\s]+$/.test(domain)) throw new Error(`--domain must be an https origin without path: ${domain}`);
    const vars = `"vars": { "STOREFRONT_ORIGIN": "${domain}", "ADMIN_ORIGIN": "${domain}", "API_ORIGIN": "${domain}" },`;
    patchConfig((t) => t.replace(/^\s*\/\/ "vars":.*$/m, `  ${vars}`), "pin ORIGIN vars");
  } else log("Same-origin default: origins are derived from each request (no variables needed).");

  step("4/7 Optional paid add-ons (explicit opt-in)");
  warn("R2 and Queues may require a payment method on file and can incur charges beyond free allowances.");
  log("The core store works WITHOUT them: media falls back to D1 blobs (small files) and jobs run via the D1 outbox + cron.");
  const wantR2 = flag("enable-r2") || (await ask(`Enable R2 bucket "${R2_BUCKET}" for media?`, false));
  if (wantR2) {
    wrangler(["r2", "bucket", "create", R2_BUCKET], { allowFail: true });
    patchConfig((t) => t.replace(/^(\s*)\/\/ ("r2_buckets":.*)$/m, "$1$2"), "enable R2 MEDIA binding");
  } else log("R2 skipped.");

  step("5/7 Build + migrate (remote)");
  pnpm(["build"]);
  wranglerRoot(["d1", "migrations", "apply", "DB", "--remote"]);

  step("6/7 Deploying the Worker");
  let workerUrl = null;
  if (flag("skip-deploy")) log("--skip-deploy: skipped.");
  else {
    const d = wranglerRoot(["deploy"]);
    workerUrl = (d.stdout + d.stderr).match(/https:\/\/[a-z0-9.-]+\.workers\.dev/i)?.[0] ?? null;
  }

  step("7/7 Secrets");
  let existing = new Set();
  const sl = wranglerRoot(["secret", "list", "--format", "json"], { allowFail: true });
  try { existing = new Set(JSON.parse(sl.stdout || "[]").map((s) => s.name)); } catch { /* treat as none */ }
  let freshToken = null;
  if (existing.has("APP_ENCRYPTION_KEY")) {
    log("APP_ENCRYPTION_KEY already set; NOT regenerating (that would make stored integration secrets unreadable).");
  } else {
    wranglerRoot(["secret", "put", "APP_ENCRYPTION_KEY"], { input: DRY ? "" : genKey() + "\n" });
    log("APP_ENCRYPTION_KEY generated and stored as a Worker secret (value not displayed).");
    log("If this secret is ever lost, stored integration secrets become unreadable and must be re-entered. See docs/security.md.");
  }
  if (existing.has("SETUP_TOKEN")) {
    log("SETUP_TOKEN already set. If the first admin was not created yet and you lost it, run: npx wrangler secret put SETUP_TOKEN -c wrangler.jsonc");
  } else {
    const t = genToken();
    wranglerRoot(["secret", "put", "SETUP_TOKEN"], { input: DRY ? "" : t + "\n" });
    if (!DRY) freshToken = t;
  }

  log("\n================ Done ================");
  if (workerUrl) log(`Site:  ${workerUrl}/   Admin: ${workerUrl}/admin/`);
  log(`Open ${workerUrl ? workerUrl : "<your-site>"}/admin/setup to create the first admin${workerUrl ? "" : " (after deploying)"}.`);
  if (freshToken) {
    log("\nYour one-time SETUP_TOKEN (shown ONCE, not saved anywhere by this script):");
    log(`    ${freshToken}`);
    log("It stops working after the first admin is created.");
  } else if (DRY) log("\n[dry-run] A SETUP_TOKEN would be shown once here.");
  if (MOCK) {
    log("\nMock Mode (try the whole shop without real payment/SMS/e-mail providers):");
    log("  1. Open /admin/setup, enter the SETUP_TOKEN and create the owner account.");
    log("  2. In the admin choose \"Start with demo (mock)\" / enable Mock Mode (Settings -> System), see docs/mock-mode.md.");
    log("  3. Add a product, check out on the storefront; the mock payment page lives at /mock/pay/... and sent SMS/e-mails appear in the Mock Inbox.");
    log("  Mock Mode never contacts real providers; switch it off before taking real orders.");
  }
}

try {
  if (!existsSync(CONFIG)) throw new Error(`Cannot find ${CONFIG}. Run from a checkout of the OpenShelf repo.`);
  if (DRY) log("[dry-run] No commands are executed and no files are changed.");
  await (LOCAL ? localMode() : remoteMode());
} catch (e) {
  console.error(`\nSetup failed: ${e.message}`);
  process.exit(1);
}

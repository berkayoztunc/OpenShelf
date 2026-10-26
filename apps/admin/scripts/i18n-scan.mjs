#!/usr/bin/env node
/**
 * Finds user-visible text in .tsx files that is NOT routed through the dictionaries (t()/td()/tp()).
 * Checks: JSX text nodes, string props that render text (label, placeholder, title, hint, description, ...),
 * and string literals passed straight to toast/setError-style calls.
 * Usage: node scripts/i18n-scan.mjs [--json] [paths...]   (exit 1 if anything is found)
 * Intentional exceptions go in scripts/i18n-allowlist.json as "relative/path.tsx::exact text".
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "src");
const allowFile = join(root, "scripts/i18n-allowlist.json");
const allow = new Set(existsSync(allowFile) ? JSON.parse(readFileSync(allowFile, "utf8")) : []);
const args = process.argv.slice(2);
const asJson = args.includes("--json");
const targets = args.filter((a) => !a.startsWith("--"));

const TEXT_PROPS = new Set(["label", "placeholder", "title", "description", "hint", "subtitle", "caption", "confirmLabel", "message", "aria-label", "alt", "summary", "emptyText", "tooltip", "heading", "text"]);
const CALLS = /^(toast|push|notify|setError|setMessage|alert)$|\.(error|success|info|warn|push)$/;
const hasLetters = (s) => /\p{L}{2,}/u.test(s);
// things that are not prose: identifiers, URLs, paths, css classes, codes
const looksTechnical = (s) => /^[\w./:@#?&=%+\-[\]{}()$]+$/.test(s.trim()) && !/\s/.test(s.trim()) && (/[./:_\-@#]/.test(s) || /^[A-Z0-9]+$/.test(s.trim()));
const IGNORE_FILES = /(^|\/)(test|i18n|help)\//;

function* walk(dir) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) { if (!IGNORE_FILES.test(relative(src, p) + "/")) yield* walk(p); }
    else if (/\.tsx$/.test(n)) yield p;
  }
}
const files = targets.length ? targets.map((t) => resolve(t)) : [...walk(src)];
const found = [];

for (const file of files) {
  const rel = relative(root, file);
  const sf = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const add = (node, kind, text) => {
    const t = text.replace(/\s+/g, " ").trim();
    if (!t || !hasLetters(t) || looksTechnical(t) || allow.has(`${rel}::${t}`)) return;
    const { line } = sf.getLineAndCharacterOfPosition(node.getStart());
    found.push({ file: rel, line: line + 1, kind, text: t });
  };
  const visit = (node) => {
    if (ts.isJsxText(node)) add(node, "jsx-text", node.getText());
    if (ts.isJsxAttribute(node) && TEXT_PROPS.has(node.name.getText()) && node.initializer) {
      const init = node.initializer;
      if (ts.isStringLiteral(init)) add(init, `prop:${node.name.getText()}`, init.text);
      else if (ts.isJsxExpression(init) && init.expression) {
        const e = init.expression;
        if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) add(e, `prop:${node.name.getText()}`, e.text);
        else if (ts.isTemplateExpression(e)) add(e, `prop:${node.name.getText()}`, e.head.text + e.templateSpans.map((s) => s.literal.text).join(" "));
      }
    }
    if (ts.isCallExpression(node) && CALLS.test(node.expression.getText())) {
      for (const a of node.arguments) if (ts.isStringLiteral(a) || ts.isNoSubstitutionTemplateLiteral(a)) add(a, "call-arg", a.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

if (asJson) console.log(JSON.stringify(found, null, 2));
else {
  const by = new Map();
  for (const f of found) (by.get(f.file) ?? by.set(f.file, []).get(f.file)).push(f);
  for (const [file, items] of by) { console.log(`\n${file} (${items.length})`); for (const i of items) console.log(`  ${i.line}: [${i.kind}] ${i.text.slice(0, 90)}`); }
  console.log(`\n${found.length} untranslated string(s) in ${by.size} file(s).`);
}
process.exit(found.length ? 1 : 0);

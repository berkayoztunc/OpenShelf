import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DEPLOY_URL, genEncryptionKey, genSetupToken, normalizeOrigin } from "./keys.js";

const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
const app = readFileSync(new URL("./app.js", import.meta.url), "utf8");

test("APP_ENCRYPTION_KEY is base64 of exactly 32 bytes (what the Worker validates) and random", () => {
  const a = genEncryptionKey();
  assert.equal(Buffer.from(a, "base64").length, 32);
  assert.equal(atob(a).length, 32);
  assert.notEqual(a, genEncryptionKey());
});

test("SETUP_TOKEN is 48 hex chars and random", () => {
  const a = genSetupToken();
  assert.match(a, /^[0-9a-f]{48}$/);
  assert.notEqual(a, genSetupToken());
});

test("normalizeOrigin accepts what people paste and rejects junk", () => {
  assert.equal(normalizeOrigin("my-shop.acme.workers.dev"), "https://my-shop.acme.workers.dev");
  assert.equal(normalizeOrigin(" https://my-shop.acme.workers.dev/admin/setup "), "https://my-shop.acme.workers.dev");
  assert.equal(normalizeOrigin("http://shop.example.com:8787/x"), "http://shop.example.com:8787");
  for (const bad of ["", "   ", "localhost", "not a url", "javascript:alert(1)", "https://", "a b.com", null, undefined]) assert.equal(normalizeOrigin(bad), null, String(bad));
});

test("deploy button points at this repo", () => {
  assert.equal(DEPLOY_URL("berkayoztunc/OpenShelf"), "https://deploy.workers.cloudflare.com/?url=https%3A%2F%2Fgithub.com%2Fberkayoztunc%2FOpenShelf");
  assert.match(app, /const REPO = "berkayoztunc\/OpenShelf"/);
});

test("strict CSP: no inline script/style, no third-party origins", () => {
  assert.match(html, /Content-Security-Policy/);
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/);
  assert.doesNotMatch(html, /<style/);
  assert.doesNotMatch(html, /\b(?:src|href)="https?:\/\/(?!github\.com\/berkayoztunc\/OpenShelf)/); // only links to this repo; no third-party assets
});

test("every i18n key used in the HTML exists in BOTH languages", () => {
  const keys = [...html.matchAll(/data-(?:i|ph)="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(keys.length > 40);
  const en = app.slice(app.indexOf("en: {"), app.indexOf("tr: {")); const tr = app.slice(app.indexOf("tr: {"), app.indexOf("let lang"));
  for (const k of keys) { assert.ok(en.includes(`"${k}"`), `en missing ${k}`); assert.ok(tr.includes(`"${k}"`), `tr missing ${k}`); }
  // same key set in both languages
  const ks = (b) => new Set([...b.matchAll(/"([a-z0-9.]+)":/gi)].map((m) => m[1]));
  assert.deepEqual([...ks(en)].sort(), [...ks(tr)].sort());
});

test("the three setup steps and the health check widgets exist", () => {
  for (const id of ["key", "token", "saved", "deploy", "addr", "open", "check", "result", "cmd"]) assert.ok(html.includes(`id="${id}"`), id);
});

test("every element id the script reads exists in the page", () => {
  for (const m of app.matchAll(/\$\("#([a-z-]+)"\)/g)) assert.ok(html.includes(`id="${m[1]}"`), `#${m[1]}`);
});

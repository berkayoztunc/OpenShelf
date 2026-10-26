#!/usr/bin/env node
// Captures admin help screenshots for each locale. See README.md.
import { chromium } from "playwright-core";
import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { SHOTS, EMAIL, PASSWORD, discover } from "./shots.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith("--")).map((a) => { const [k, v = "true"] = a.slice(2).split("="); return [k, v]; }));
const base = (args.base ?? "http://localhost:8787").replace(/\/$/, "");
const out = resolve(here, args.out ?? "../../apps/admin/public/help");
const locales = (args.locales ?? "tr,en").split(",");
const only = args.only ? new Set(args.only.split(",")) : null;
const chromePath = process.env.CHROMIUM_PATH ?? "/Users/berkay/Library/Caches/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-mac-arm64/chrome-headless-shell";

const CSS = `
  *,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;transition-duration:0s!important;scroll-behavior:auto!important}
  div[aria-live="polite"][role="status"].fixed{display:none!important}
`;

async function newContext(browser, locale, viewport) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, colorScheme: "light", reducedMotion: "reduce", locale: locale === "tr" ? "tr-TR" : "en-US", timezoneId: "Europe/Istanbul" });
  await ctx.addInitScript(([l]) => { try { localStorage.setItem("os_admin_locale", l); localStorage.setItem("os-theme", "light"); } catch {} }, [locale]);
  return ctx;
}

async function settle(page) {
  await page.addStyleTag({ content: CSS }).catch(() => {});
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.evaluate(() => document.fonts?.ready).catch(() => {});
  // no spinners / skeletons
  await page.waitForFunction(() => !document.querySelector('[role="status"].py-16, .animate-spin, [aria-busy="true"], .animate-pulse'), null, { timeout: 8000 }).catch(() => {});
  // hide the amber "2FA required" nag so shots stay focused (the red Mock banner is kept)
  await page.evaluate(() => {
    for (const a of document.querySelectorAll('a[href$="/security"]')) {
      const b = a.closest("div");
      if (b && !b.closest("nav,aside") && b.textContent.length < 220 && b.getBoundingClientRect().top < 140 && b.querySelector("h1") === null) { b.style.display = "none"; break; }
    }
  }).catch(() => {});
  await page.waitForTimeout(350);
}

async function login(page) {
  await page.goto(`${base}/admin/login`);
  await page.locator('input[type="email"]').fill(EMAIL);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 15000 });
}

async function save(buf, file) {
  const png = await sharp(buf).png({ palette: true, quality: 90, colours: 128, compressionLevel: 9, effort: 8, dither: 0.6 }).toBuffer();
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, png);
  return png.length;
}

const browser = await chromium.launch({ executablePath: chromePath, args: ["--no-sandbox"] });
let total = 0, n = 0;
try {
  for (const locale of locales) {
    const todo = SHOTS.filter((s) => !only || only.has(s.name));
    // authenticated session (default viewport) + one for print views
    const mk = async (vp) => { const c = await newContext(browser, locale, vp); const p = await c.newPage(); await login(p); return { c, p }; };
    const std = await mk({ width: 1280, height: 800 });
    const ctxData = await discover(std.p, base);
    const pr = todo.some((s) => s.viewport) ? await mk({ width: 900, height: 1200 }) : null;
    for (const s of todo) {
      let c, p, own = false;
      if (s.anon) { c = await newContext(browser, locale, { width: 1280, height: 800 }); p = await c.newPage(); own = true; }
      else if (s.viewport) { p = pr.p; await p.setViewportSize(s.viewport); }
      else { p = std.p; await p.setViewportSize({ width: 1280, height: 800 }); }
      try {
        await p.goto(`${base}/admin${typeof s.path === "function" ? s.path(ctxData) : s.path}`);
        await settle(p);
        if (s.wait) await p.locator(s.wait).first().waitFor({ timeout: 10000 });
        if (s.run) { await s.run(p, { locale, ...ctxData }); await settle(p); }
        let buf;
        if (s.element) {
          const box = await p.locator(s.element).first().boundingBox();
          const sy = await p.evaluate(() => window.scrollY);
          buf = await p.screenshot({ fullPage: true, clip: { x: Math.max(0, box.x - 12), y: Math.max(0, box.y + sy - 12), width: Math.min(1280, box.width + 24), height: box.height + 24 } });
        }
        else if (s.full) {
          // grow the viewport to the content height (800..maxHeight) so the sticky sidebar / save bar render naturally
          const h = await p.evaluate(() => document.documentElement.scrollHeight);
          await p.setViewportSize({ width: 1280, height: Math.min(s.maxHeight ?? 1000, Math.max(800, h)) });
          await p.waitForTimeout(300); await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(150);
          buf = await p.screenshot();
        }
        else buf = await p.screenshot();
        if (s.maxHeight) { const m = await sharp(buf).metadata(); if (m.height > s.maxHeight) buf = await sharp(buf).extract({ left: 0, top: 0, width: m.width, height: s.maxHeight }).toBuffer(); }
        const size = await save(buf, resolve(out, locale, `${s.name}.png`));
        total += size; n++;
        console.log(`${locale}/${s.name}.png ${(size / 1024).toFixed(0)} KB`);
      } catch (e) {
        console.error(`FAIL ${locale}/${s.name}: ${String(e.message).split("\n")[0]}`);
      } finally { if (own) await c.close(); }
    }
    await std.c.close(); if (pr) await pr.c.close();
  }
} finally { await browser.close(); }
console.log(`${n} files, ${(total / 1048576).toFixed(2)} MB`);

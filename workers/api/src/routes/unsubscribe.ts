import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { customers } from "@openshelf/db";
import { escapeHtml } from "@openshelf/shared";
import type { AppEnv } from "../env";
import { rateLimited } from "../middleware/security";
import { getSettings } from "../lib/settings";
import { unsubscribeCustomer, verifyUnsubToken } from "../lib/campaigns";

/** Public one-click unsubscribe from marketing e-mail/SMS (signed link, no login). */
export const unsubscribeRoutes = new Hono<AppEnv>();
const page = (title: string, inner: string) => new Response(`<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${escapeHtml(title)}</title></head>`
  + `<body style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;background:#f5f5f7;margin:0;padding:24px"><main style="max-width:420px;margin:48px auto;background:#fff;border-radius:12px;padding:28px;line-height:1.5"><h1 style="font-size:20px;margin:0 0 12px">${escapeHtml(title)}</h1>${inner}</main></body></html>`,
  { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" } });

unsubscribeRoutes.get("/unsubscribe/:cid/:token", rateLimited("unsub", 60, 3600), async (c) => {
  const { cid, token } = c.req.param();
  if (!(await verifyUnsubToken(c.env, cid, token))) return page("Geçersiz bağlantı / Invalid link", "<p>Bu bağlantı geçerli değil. / This link is not valid.</p>");
  const store = (await getSettings(c.get("db"), "general")).storeName;
  return page("Abonelikten çık / Unsubscribe", `<p>${escapeHtml(store)} kampanya e-posta ve SMS’lerini almak istemiyor musunuz?<br><small>Do you want to stop receiving marketing messages?</small></p>`
    + `<form method="post"><button type="submit" style="padding:10px 18px;border:0;border-radius:8px;background:#111;color:#fff;font-size:15px;cursor:pointer">Evet, çık / Yes, unsubscribe</button></form>`);
});

unsubscribeRoutes.post("/unsubscribe/:cid/:token", rateLimited("unsub", 60, 3600), async (c) => {
  const { cid, token } = c.req.param();
  if (!(await verifyUnsubToken(c.env, cid, token))) return page("Geçersiz bağlantı / Invalid link", "<p>Bu bağlantı geçerli değil. / This link is not valid.</p>");
  const db = c.get("db");
  const [cust] = await db.select({ id: customers.id }).from(customers).where(eq(customers.id, cid)).limit(1);
  if (cust) await unsubscribeCustomer(db, cid, c.get("ip"));
  return page("Abonelik iptal edildi / Unsubscribed", "<p>Artık kampanya iletileri almayacaksınız. / You will no longer receive marketing messages.</p>");
});

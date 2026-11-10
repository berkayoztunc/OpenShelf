# AI (MCP) connection

This chapter shows how to connect your store to an AI assistant (Claude, ChatGPT, Grok, Claude Code, Cursor and so on), what the assistant can do, the safety limits and the cheapest way to upload files. The assistant works under the same rules as the admin panel (validation, permissions, audit log).

## What is the AI connection? {#yapay-zeka-baglantisi-nedir}

OpenShelf offers tools to AI assistants through an open standard called **MCP** (Model Context Protocol). With these tools the assistant can look at orders, products, stock, the storefront and reports and, if it has permission, change things. Every call goes through the real admin API and is written to the **Audit log**.

When an assistant connects it reads two things: the **store guide** (units, channels, safety rules) and the whole **user guide** (the one you are reading). So it looks up what a setting does instead of guessing.

## Connecting and tokens {#baglanma-ve-anahtarlar}

- **Chat apps (Claude.ai, ChatGPT, Grok):** enter your store address followed by `/mcp` (e.g. `https://yourstore.com/mcp`) in the app's "connector" screen. The app sends you to the consent screen in the admin panel (OAuth); you sign in and allow it. No key to copy.
- **Coding tools and scripts (Claude Code, Cursor, Codex):** create a **token** under **Settings → MCP** (it starts with `osk_…` and is shown once) and give it to the tool as `Authorization: Bearer <token>`.
- Tokens get a name, a **level** and an optional expiry date; you can revoke them any time. Links with the token inside the address are not supported (addresses end up in logs and screenshots).

## Levels and safety {#seviyeler-ve-guvenlik}

| Level | What it can do |
|---|---|
| **read** | Look only: orders, products, reports, the guide. |
| **write** | Reversible creating and editing: products, prices, stock, storefront, images, campaign drafts, SEO. |
| **full** | Irreversible things such as money, customer messages and deletion. These tools only describe what they would do unless `confirm: true` is sent. |

- The **owner** can switch individual tools off under **Settings → MCP → Tools**, or stop all MCP access with one switch.
- Admin users, tokens, payment-provider secrets and the system/mock mode can **never** be changed through MCP.
- Marketing messages only reach customers who agreed to marketing; an unsubscribe link is added automatically.
- Customer personal data appears in results; the assistant should not repeat more of it than needed. Never give an app you do not trust more than **read**.

## What do the tools do? {#araclar-neler-yapar}

- **Reports:** `store_overview` (today and orders by status), `store_insights` (7/30/90 days against the previous period, best sellers, cities, the work queue).
- **Orders:** `list_orders` (filters for status, source, payment, shipment, invoice, dates and amounts; search by product, customer and tracking number), `get_order`, status changes, shipping, invoices, refunds.
- **Products:** `list_products` (stock, channel and no-image filters; price, stock and sales sorting), `update_variant_price`, `bulk_update_products` (status, category, percentage price), `adjust_stock`, `add_product_images`.
- **Storefront:** `update_menu` (top menu), `update_merchandising` (product order, pinned products), `update_homepage` (home page products).
- **Settings and SEO:** store profile, branding, SEO, legal pages, checkout rules, tracking, notifications; `seo_audit` and per-product/category SEO tools.
- **Files and images:** `upload_help`, `upload_media_from_url`, `set_store_image`, `view_image`, `list_media`, `update_media_alt` (see below).
- **Messages and campaigns:** e-mail/SMS sending and campaign drafts (preview and test first, send after approval).
- **Guide:** `help_topics`, `help_search`, `help_read` and the `openshelf://help/<chapter>` resources.
- **Integrations:** the Trendyol and Geliver consoles, integration events and background jobs.

**Settings → MCP** lists what every tool does and its level.

## Uploading files and images {#dosya-ve-gorsel-yukleme}

Chat apps cut long tool arguments, so a big base64 string arrives truncated and costs many tokens. The assistant picks a way based on what it has (the `upload_help` tool tells it):

1. **A public link** (generated image URL, CDN, Google Drive/Dropbox share link): pass `url` to `add_product_images` or `set_store_image`; the image is imported **and** attached in one call. `upload_media_from_url` takes up to 10 links per call.
2. **A shell** (Claude Code, Codex, Cursor): the file is sent to `POST /mcp/upload` with `curl`; the bytes never enter the conversation.
3. **Only a chat:** you drop the files on **Katalog → Medya**; the assistant finds the newest with `list_media` and attaches them.
4. **A tiny image (under ~20 KB, e.g. a favicon):** `upload_media` (base64). Anything larger is refused without being read.

Adding a product image never needs the whole product: `add_product_images` appends, prepends or reorders the gallery. Use `set_store_image` for the logo, favicon, social share image and home banner. Every import returns **warnings** when the size does not fit (wrong aspect ratio, too small) so the assistant can regenerate the image.

## Trendyol photos {#trendyol-fotograflari}

Products imported from Trendyol keep their photos on Trendyol's CDN. AI environments (design sandboxes, code runners) mostly cannot download from it and report "access blocked". Two answers:

- `view_image` shows the picture to the assistant **through the MCP connection itself**; no download needed.
- The `proxyUrl` in product results is a public link on the store's own domain; put it in the `<img>` tag of a design or page. The store downloads the photo once, checks it really is an image and caches it for a year. This is **not an open proxy**: it only works with the ids of images registered on your products and only reaches Trendyol CDN hosts.

## Opening the guide to the AI {#rehberi-yapay-zekaya-acma}

The whole user guide is open to the assistant too:

- `help_topics` lists chapters and their sections, `help_search` searches a question, `help_read` reads a chapter or one section (`topic`, `section`, `lang`).
- In apps that support resources every chapter can also be read at `openshelf://help/<chapter>`.
- The guide is served in Turkish and English; the default is the store's language.
- If you change a guide page, the copy the AI reads is updated with the next release (deploy).

## Common mistakes {#sik-yapilan-hatalar}

- **The assistant does not see new tools:** apps fetch the tool list when they connect. Disconnect and reconnect, or restart the app.
- **"This tool needs level write":** the token's level is too low. Create a new token with a higher level under Settings → MCP.
- **"Tool disabled by the store owner":** turn that tool on under Settings → MCP → Tools (owner only).
- **A big image is being sent as base64:** it is refused; point the assistant to `upload_help` or drop the file on Katalog → Medya.
- **A storefront change does not show at once:** storefront responses are cached for a short time; wait about a minute.

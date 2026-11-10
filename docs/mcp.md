# MCP: manage the store from AI assistants

[Türkçe](mcp.tr.md)

OpenShelf exposes its whole admin as an **MCP server** (Streamable HTTP, stateless) at `https://<your-host>/mcp`. An AI client (Claude Desktop, Claude Code, any MCP client) can then answer questions and manage orders, products, stock, coupons, customers, campaigns, SMS/e-mail, invoices, settings, Trendyol and Geliver.

## Connect
1. Admin panel → **Settings → MCP / AI access → Create token** (owner/admin only). Pick a level and an expiry. The token (`osk_…`) is shown **once**.
2. Claude Code: `claude mcp add --transport http openshelf https://<host>/mcp --header "Authorization: Bearer osk_…"`
   Generic client (JSON): `{"mcpServers":{"openshelf":{"type":"http","url":"https://<host>/mcp","headers":{"Authorization":"Bearer osk_…"}}}}`
3. Ask: "summarise today's orders", "which products are low on stock?", "draft a summer campaign for customers in İzmir".

The server answers JSON, or a single `text/event-stream` event when the client only accepts SSE. It is stateless (no sessions), so it works on a plain Worker.

### Connect Grok, ChatGPT, Claude.ai and other AI apps (OAuth)
No token to paste: add a custom MCP server / connector with the address `https://<host>/mcp`. The app discovers the login automatically (OAuth 2.1 + PKCE, `/.well-known/oauth-protected-resource`), sends you to the admin to **log in and approve** (choose read / write / full), and receives a 1-hour access token with a rotating 30-day refresh token. See and **disconnect** apps in **Settings → MCP → Connected apps**.
- Apps that register themselves (dynamic client registration) just work. Some apps (for example Grok) ask for a **Client ID and Client secret** instead: create one in **Connected apps → Manual OAuth clients** (owner only) with the callback URL the app shows you, and paste the values into the app.
- Security: PKCE (S256) is mandatory, redirect URIs must match exactly (https or localhost), codes are single use (5 min), a replayed code or a reused refresh token revokes the whole connection, and every connection needs an owner/admin to approve on the consent screen, which shows the app's (unverified) name and the host it will return to. Tool permissions and the master switch still apply. A token in the URL is deliberately not supported.

## Levels
| Level | Can do |
|---|---|
| **read** | look at everything: dashboard, orders, customers, products, settings, logs, Trendyol health, previews, audience size |
| **write** | + create/edit products, categories, coupons, stock, order status, settings groups, campaign/invoice drafts, Trendyol mappings/import |
| **full** | + refunds, shipments, invoices, deleting, sending e-mail/SMS/campaigns, anonymising, CSV import, raw Trendyol/Geliver calls |

`full` tools only act with `confirm: true`; without it they describe what they would do. A token never exceeds its owner's role and never acts as *owner*.

## Tool permissions (owner)
**Settings → MCP / AI access → Tools** lists every tool by group with a checkbox. Untick a tool and no AI client can see or call it, even with a `full` token (a tool works only if it is ticked **and** the token's level allows it). Presets: only read tools, no `full` tools, allow all. A master switch turns all MCP access off without deleting tokens. Only the owner can change this; admins can view it; a token can never change it. Default: everything allowed.

## Never available through MCP
Users/passwords/MFA, creating tokens, integration **secrets** (write), mock-mode switch, factory reset, mock inbox, Trendyol history deletion. A test (`mcp.test.ts`) fails when a new admin route is neither a tool nor on the exclusion list (`workers/api/src/mcp/tools.ts`).

## Security notes
- A token controls the store: treat it like a password; revoke it in the same tab. Tokens are stored as SHA-256 hashes; 120 requests/minute per token.
- Every tool call is audited (`mcp.tool`, token id, outcome, no arguments) and the underlying admin action is audited as usual.
- Tools run the real admin API in-process with an HMAC-signed, 60-second internal claim, so permissions, validation and rate limits are the same as in the panel. A token cannot call `/api/admin/*` directly.
- Marketing campaigns only reach customers with marketing consent. AI conversations may contain customer data: start with `read`.
- **Upload tickets** (`create_upload_link`): HMAC-signed, valid 10 minutes, one successful upload, fixed image kind, sent in the `X-Upload-Ticket` header (never in a URL), accepted only by `/mcp/upload`, never by the API or MCP; revoked when the admin who minted it is disabled. Uploaded files get the same validation as the admin upload (real type, size limits, truncated images rejected). The owner can switch `create_upload_link` and `upload_media` off separately. Files attached in ChatGPT (`import_attached_files`) and links (`upload_media_from_url`) are fetched server-side with the SSRF guard (public https hosts only, redirects re-checked, size-capped).

## Settings and SEO tools
- **Store settings** (PATCH, only the fields you send change; nested objects merge, the merged group is validated as a whole): `update_store_profile` (store name, tagline, contact, currency, tax), `update_seo_settings`, `update_branding`, `update_legal_pages`, `update_checkout_settings`, `update_tracking_settings`, `update_notification_settings`; read one group with `get_settings_group`.
- **SEO**: `seo_audit` (site-wide switches + every product/category gap: missing title/description, noindex, images without alt, duplicate titles), `update_product_seo` / `update_category_seo` (search & social fields only), `seo_preview` (exactly what Google/social will see).

### Uploading images and files
Chat clients cut long tool arguments, so a big base64 string arrives truncated (and costs a lot of tokens). Pick the way that matches what the AI **has**; the **`upload_help`** tool tells it which, with ready-to-run commands for the real host:

| The AI has | Use | Cost |
|---|---|---|
| a public https link (generated image URL, CDN, Google Drive / Dropbox share link) | `add_product_images` / `set_store_image` with `url` (imports **and** attaches in one call); `upload_media_from_url` takes up to 10 links | a few tokens, full size |
| files the person **attached to the chat in ChatGPT** | **`import_attached_files`** (ChatGPT passes download links via `_meta["openai/fileParams"]`; with `productId` it also attaches them) | no bytes in the conversation |
| image files in its **own code sandbox** but not the MCP token (chat apps with code execution) | **`create_upload_link`** → single-use tickets → `curl -X PUT -H "X-Upload-Ticket: …" --data-binary @file …/mcp/upload`, then attach by `mediaId` | no bytes in the conversation |
| a shell where it holds the token (Claude Code, Codex, Cursor, scripts) | `curl` to **`POST /mcp/upload`** with `Authorization: Bearer` | no bytes in the conversation |
| only a chat window | the human drops the files on **Katalog → Medya**; the AI calls `list_media` and attaches the ids | one human step |
| a tiny image (< ~20 KB, e.g. a favicon) | `upload_media` (base64). Longer data is refused immediately, without being read | last resort |

```sh
curl -sS -H "Authorization: Bearer $OPENSHELF_TOKEN" -F kind=product -F alt="Short description" -F file=@./photo.jpg https://YOUR-STORE/mcp/upload
```
**Tickets** (`create_upload_link`, `count` 1–10): each lasts 10 minutes, uploads **one** image (a failed upload with a truncated file does not spend it; after 3 attempts it stops), fixes the image kind and alt text, is sent in the `X-Upload-Ticket` header (never in a URL), contains no token, and only works on `/mcp/upload`: it does not open the API or MCP. It stops working if the admin who minted it is disabled. Some chat apps limit the code sandbox's network to an allow-list of domains; if `curl` cannot connect the person must allow the store's domain once in that app. The AI is told to fall back instead of looping.

`/mcp/upload` uses the same validation as the admin upload (real file type, size limits, truncated images rejected) and is audited. The owner can switch `upload_media` (token uploads) and `create_upload_link` (tickets) off separately under Settings → MCP → Tools.

**Attaching** never needs the whole product: `add_product_images` (mode `append`, `prepend` or `replace`; items are `mediaId`, `url` or `imageId` of an image already on the product) and `set_store_image` (slot `logo`, `logo_dark`, `favicon`, `og` or `banner`). Imports report `warnings` (wrong aspect ratio, too small) so the AI can regenerate. `update_media_alt` edits alt text.

### Marketplace (Trendyol) photos

Products imported from Trendyol keep their photos on Trendyol's CDN. AI sandboxes (design environments, code runners) usually cannot download from it, so the AI reports an "access blocked" error. Two things solve it:

- **`view_image`** shows a picture to the AI **through the MCP connection itself** (an image block), for uploaded media and for CDN-hosted product photos (`mediaId`, or `productId` + `imageId` from `get_product`; up to ~1 MB). No download, no network access needed on the AI's side.
- **`proxyUrl`**: every Trendyol-hosted image in `get_product` / `list_products` also carries `proxyUrl`, an absolute public link on the store's own domain (`/img/p/<image id>?v=…`). Put it in the `<img>` tag of a design, page or message. The store downloads the photo once with its own honest user agent, checks that it really is an image and serves it with a one-year edge cache.

`/img/p/:id` is **not an open proxy**: the link names an image that is registered on one of the store's products (never a URL), only Trendyol CDN hosts (`dsmcdn.com`, `trendyol.com`) are served, upstream content types are not trusted (the real type is detected from the bytes), cache misses are rate limited, and images the store already hosts redirect to `/media/…`. Absolute links also appear in MCP results for uploaded media (`url`).

### The user guide over MCP

The whole admin guide (the Rehber, `apps/admin/src/help`) is available to AI clients, so an assistant looks up how a feature works instead of guessing:

- **Tools:** `help_topics` (chapters with their section ids), `help_search` (full-text, accent-insensitive: "kargo etiketi" finds "Kargo oluşturma"), `help_read` (`topic`, optional `section`, `lang`; whole chapters are capped at 60 KB, sections are cheap).
- **Resources:** every chapter is also `openshelf://help/<chapter>` (add `?lang=en|tr`) for clients that support MCP resources.
- Turkish and English; the default is the store's language. Markdown is cleaned for AI use (screenshots become a short note, glossary links keep their text, internal links point at `help_read`).
- The guide is bundled into the Worker as a snapshot (`workers/api/src/mcp/helpDocs.generated.ts`), regenerated by `pnpm build` / `pnpm deploy` (`pnpm gen:help`). A test fails when a guide page changes without regenerating it.

## Images
The `get_image_specs` tool tells the AI the exact size, aspect ratio, safe area and file limit for every image slot (product 1600×2000, banner 2400×1050, social 1200×630, logo, favicon), and `upload_media` uploads generated images (base64) and answers with the real width/height plus warnings when the image does not fit. Specs live in `packages/shared/src/imageSpecs.ts`.

## Adding a tool
Add an entry to `workers/api/src/mcp/tools.ts` (name, level, method, path, zod shape). Responses are capped at ~100 KB.

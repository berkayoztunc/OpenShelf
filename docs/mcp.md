# MCP: manage the store from AI assistants

[Türkçe](mcp.tr.md)

OpenShelf exposes its whole admin as an **MCP server** (Streamable HTTP, stateless) at `https://<your-host>/mcp`. An AI client (Claude Desktop, Claude Code, any MCP client) can then answer questions and manage orders, products, stock, coupons, customers, campaigns, SMS/e-mail, invoices, settings, Trendyol and Geliver.

## Connect
1. Admin panel → **Settings → MCP / AI access → Create token** (owner/admin only). Pick a level and an expiry. The token (`osk_…`) is shown **once**.
2. Claude Code: `claude mcp add --transport http openshelf https://<host>/mcp --header "Authorization: Bearer osk_…"`
   Generic client (JSON): `{"mcpServers":{"openshelf":{"type":"http","url":"https://<host>/mcp","headers":{"Authorization":"Bearer osk_…"}}}}`
3. Ask: "summarise today's orders", "which products are low on stock?", "draft a summer campaign for customers in İzmir".

The server answers JSON, or a single `text/event-stream` event when the client only accepts SSE. It is stateless (no sessions), so it works on a plain Worker.

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

## Adding a tool
Add an entry to `workers/api/src/mcp/tools.ts` (name, level, method, path, zod shape). Responses are capped at ~100 KB.

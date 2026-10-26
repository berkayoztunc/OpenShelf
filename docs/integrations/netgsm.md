# Netgsm (SMS)

[Türkçe](netgsm.tr.md)

## What it does

Sends transactional SMS (order notifications, see [../notifications.md](../notifications.md)) through the Netgsm REST v2 API (`api.netgsm.com.tr`, the only allowed host). Turkish text is sent with `encoding: "TR"`.

## Keys needed

Enter in Admin, Settings, Integrations, Netgsm (stored encrypted):

| Field | Meaning |
|---|---|
| `usercode` (secret) | Netgsm subscriber number / usercode |
| `password` (secret) | password of the Netgsm API sub-user |
| `msgheader` | sender header, 3-11 characters, must be registered in your Netgsm account |

Settings, Notifications, SMS sender ID overrides `msgheader` when set.

## Sandbox and testing

Netgsm has no public sandbox that we verified. Use Mock Mode for development ([../mock-mode.md](../mock-mode.md)), then send a single test SMS to your own number from Settings, Notifications.

## Caveats

- Status: implemented from vendor docs, **UNVERIFIED against a live account**. The balance/health check endpoint in particular could not be confirmed.
- Your msgheader approval, IYS (commercial message consent) rules and credit balance are managed in Netgsm. OpenShelf sends transactional messages only (`iysfilter: "0"`).
- SMS to non-Turkish numbers is blocked by the default country allowlist (`+90`).
- Messages with Turkish characters use UCS-2 segments; check the segment counter in the template editor.

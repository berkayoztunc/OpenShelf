# Twilio (SMS)

[Türkçe](twilio.tr.md)

## What it does

Sends transactional SMS through the Twilio Messages API (see [../notifications.md](../notifications.md)). Useful when you need to reach numbers outside Turkey (add the country code to the allowlist first).

## Keys needed

Enter in Admin, Settings, Integrations, Twilio (stored encrypted):

| Field | Meaning |
|---|---|
| `accountSid` | Account SID, `AC` + 32 hex characters |
| `authToken` (secret) | Auth Token |
| `from` | sending number in E.164, e.g. `+15551234567` |
| `messagingServiceSid` | Messaging Service SID (`MG...`); if set it takes precedence over `from` |

Either `from` or `messagingServiceSid` is required. An alphanumeric sender can be set in Settings, Notifications, SMS sender ID where the destination country allows it.

## Sandbox and testing

Twilio provides test credentials and trial accounts (trial accounts can only message verified numbers). Check Twilio's documentation for current rules, then send a test from Settings, Notifications.

## Caveats

- Status: implemented from vendor docs, **UNVERIFIED against a live account**.
- Sender registration (A2P 10DLC, alphanumeric sender IDs, local regulations) is your responsibility and varies by country.
- Twilio bills per segment; Turkish characters switch to UCS-2 (70 characters per segment).
- Outside the default `+90` country allowlist, messages are skipped until you extend it.

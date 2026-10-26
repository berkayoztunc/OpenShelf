# Analytics and advertising

In this section you will learn how to measure your store's visitor and sales statistics, how to connect your Google and Meta (Facebook / Instagram) ad accounts to OpenShelf, and how visitors' cookie choices are respected along the way. No technical knowledge is needed, but you will have to sign in to your Google and Meta accounts and copy a few IDs.

> [!NOTE]
> This section is not legal advice. The wording of your cookie banner and your obligations around cookies are your responsibility. We recommend getting help from a lawyer for the texts. For details, see [Customers and KVKK](/help/customers-kvkk). (KVKK is Turkey's personal data protection law.)

## The big picture first: what is measured, and how? {#once-buyuk-resim-ne-olculur-nasil}

Analytics and ad measurement reach your accounts through two separate paths. Keeping them apart will make the rest of this section much easier to follow.

| Path | Where it runs | What it sends | When it does not work |
|---|---|---|---|
| **Browser** | On the visitor's phone or computer | Page views, product views, add to cart, start of checkout | If the visitor declined cookies, or has an ad blocker |
| **Server** | In the Cloudflare Worker where OpenShelf runs | Purchases (after the payment is verified) and a server-side copy of the browser events | If there is no cookie consent, the integration is off, or a secret key is missing |

Because ad blockers and declined cookies weaken the browser side, we also send important events such as sales from the server. To make sure the same sale is never counted twice, every event is given an [event ID](term:eventid); we explain it under [Event ID](#olay-kimligi).

Three tools are involved:

* [Google Analytics 4](term:ga4) (GA4): shows your site's visitor and sales statistics.
* [Meta Pixel](term:pixel) and the [Conversions API](term:capi): measure which sales your Facebook and Instagram ads bring in.
* [Google Tag Manager](term:gtm) (GTM): only needed if an agency or marketer works with it.

If you do not run ads and are not curious about statistics, you can skip this section; the store works fully without any of these.

## Two separate places: the Tracking tab and Integrations {#iki-ayri-yer-takip-ve-reklam-sekmesi-ve-entegrasyonlar}

Setup is split across two screens. This is the point people mix up most often.

| What | Where you enter it | Secret? |
|---|---|---|
| GA4 [measurement ID](term:measurementid) (`G-...`) | **Settings → Tracking** | No, it is visible in your site's source |
| GTM container ID (`GTM-...`) | **Settings → Tracking** | No |
| Meta Pixel ID (digits only) | **Settings → Tracking** | No |
| Cookie consent switch and Meta test mode | **Settings → Tracking** | No |
| GA4 [Measurement Protocol API secret](term:apisecret) | **Integrations → Google Analytics 4** | Yes, stored encrypted and never shown again |
| Meta [access token](term:accesstoken) | **Integrations → Meta Pixel & Conversions API** | Yes, stored encrypted and never shown again |

The rule is simple: **IDs that anyone can see go on the Tracking tab; secret keys go on the Integrations page.** For general information about secret keys, see [Security](/help/security#gizli-anahtarlar).

The integration cards (Google Analytics 4 and Meta) also have a measurement ID field and a Pixel ID field; the server side uses those. Enter **the same ID** in both places. Entering an ID on the Tracking tab sets up the browser code, while the Integrations card sets up sending from the server.

![Tracking tab](help/en/settings-tracking.png)

Below the tab you will find the **Recent marketing events** table. Use it to follow the events sent from the server (time, event name, event ID, destination and status).

![Integrations page](help/en/integrations-hub.png)

## Cookie consent {#cerez-onayi}

When a visitor first arrives on your site, they see a cookie banner. The banner offers three categories:

| Category | What it is for | Consent needed? |
|---|---|---|
| **Necessary** | Making the cart and the session work | No, always on |
| **Analytics** | Visitor statistics such as GA4 | Yes |
| **Marketing** | Meta Pixel and ad measurement | Yes |

Until the visitor has made a choice, no analytics or advertising code is loaded. Google is told through "Consent Mode v2" that all permissions are **denied** by default; once the visitor chooses, analytics consent is translated into Google's analytics permission, and marketing consent into the three advertising permissions (ad storage, ad user data, ad personalization).

The choice is stored in the visitor's browser and also written to the server as a **consent record** (a random visitor ID, the two preferences, the version of the cookie text, and the IP address). To see what these records are for, read [Consent records](/help/customers-kvkk#onay-kayitlari). If you change the cookie text significantly, the version number changes and the banner is shown to visitors again.

The **Require consent before tracking** switch (on the **Tracking** tab) controls this behavior:

* **On (recommended):** the flow described above applies.
* **Off:** no banner is shown and everything runs without asking for permission. Turn it off only if you have clarified your legal position and consulted a lawyer.

> [!WARNING]
> Turning off the consent requirement may make you liable for compliance with cookie and tracking rules. If you are not sure, leave it on.

In general, "accept" and "reject" are expected to be equally easy to choose. Checking the banner's wording and whether it is appropriate is your job.

## Google Analytics 4 setup {#google-analytics-4-kurulumu}

This section covers every step needed to run GA4 on both the browser and the server side.

**Before you start:** You need a Google account and a GA4 "property". If you do not have one, create it at analytics.google.com; when creating the property, enter your site's address and time zone (Türkiye) correctly.

1. In Google Analytics, go to **Admin → Data streams** and click your web data stream.
2. Copy the **Measurement ID** at the top right. It starts with `G-` and consists of capital letters and digits, for example `G-AB12CD34EF`.
3. In OpenShelf, open the **Settings → Tracking** tab, paste it into the **GA4 Measurement ID** field and save. If the format is wrong, the field shows the warning "Format: G-XXXXXXXXXX".
4. On the same data stream page, scroll down, find **Measurement Protocol API secrets** and click **Create**. Give it a name (for example "OpenShelf") and copy the secret value that is generated.
5. In OpenShelf, open the **Google Analytics 4** card on the **Integrations** page (the **Configure GA4** button on the Tracking tab takes you there too).
6. Enter the measurement ID, paste the secret into the **Measurement Protocol API secret** field, enable the card and save.
7. Press **Test connection** on the card. If it succeeds, carry on; if you get an error, see [Integration errors](/help/troubleshooting#entegrasyon-hatalari).

![Integration edit panel](help/en/integration-drawer.png)

| Field | What to enter | Example | Watch out |
|---|---|---|---|
| GA4 Measurement ID | The `G-` ID from the data stream | `G-AB12CD34EF` | No spaces at the start or end; lowercase is not accepted |
| Google Tag Manager ID | The `GTM-` ID from GTM | `GTM-ABC1234` | Leave empty if you have no agency; if you set up GA4 in both GTM and here, events can be counted twice |
| Measurement Protocol API secret | The secret value you created in GA4 | (a long string of letters and digits) | Entered only on Integrations; it does not appear again after saving |

> [!TIP]
> If you use GTM, you may prefer to set up the GA4 tag inside GTM and enter only the GTM ID in OpenShelf. With such a setup, agree with your agency which tool sends which event; sending the same event from two places inflates your data.

GA4 tracks these events: page view, product list view, product view, search, add to cart, begin checkout, add payment info, purchase and refund. The **variant's ID** is used as the product ID everywhere, so GA4, Meta and the Meta catalog feed (`/feeds/meta.xml`, `/feeds/meta.csv`) all match each other. Money amounts are sent in the event in the main currency unit (for example `199.90`).

> [!NOTE]
> GA4 data does not show up in reports immediately; there can be a processing delay and threshold rules. If the numbers look incomplete on the first day, do not worry.

## Meta Pixel setup {#meta-pixel-kurulumu}

There are two parts on the Meta side: the **Pixel** in the browser and the **Conversions API**, which sends from the server. They use the same dataset (Pixel / Dataset).

**Before you start:** You need a Meta Business account and a Pixel (dataset) in Events Manager.

1. Open Meta **Events Manager** and select your Pixel. The Pixel ID is a number of 5 to 20 digits (for example `123456789012345`).
2. In OpenShelf, on the **Settings → Tracking** tab, enter only the digits in the **Meta Pixel ID** field and save.
3. In Events Manager, go to **Settings**, and under **Conversions API** choose **Generate access token**; copy the token.
4. In OpenShelf, open the **Integrations → Meta Pixel & Conversions API** card (the **Configure Meta** button takes you there too).
5. Enter the same number in the **Pixel / Dataset ID** field and the token in the **Conversions API access token** field. Enable the card and save.
6. Press **Test connection**.

| Field | What to enter | Example | Watch out |
|---|---|---|---|
| Meta Pixel ID | The Pixel / dataset number | `123456789012345` | Digits only; letters or spaces cause an error |
| Conversions API access token | The token you generated in Events Manager | (a long string) | It is secret; if it expires or is revoked, server events show as "failed" |
| Test event code | The code under Events Manager → Test events | `TEST12345` | Delete it before going live |

Meta event names differ from GA4's; OpenShelf maps them for you:

| GA4 event | Meta event |
|---|---|
| Page view | PageView |
| Product view | ViewContent |
| Search | Search |
| Add to cart | AddToCart |
| Begin checkout | InitiateCheckout |
| Add payment info | AddPaymentInfo |
| Purchase | Purchase |

Product list view and refund exist only in GA4; they are not sent to Meta.

In server events, customer details (such as email and phone) are normalized and irreversibly scrambled (a SHA-256 hash) before being sent to Meta. In other words, a plain-text email address never goes to Meta.

## Purchase event: only after a verified payment {#satin-alma-olayi-yalnizca-dogrulanmis-odemeden-sonra}

The purchase (Purchase) event deliberately works differently from the others:

* The browser **cannot send** a purchase event. A purchase or refund request coming from the browser is rejected by the server.
* The event is created only after the payment provider (iyzico) reports the payment and OpenShelf **verifies** it by matching the amount and currency.
* This way, an unpaid, cancelled or fake order is never recorded as a "sale" in your ad data.
* The event is queued in the background ([outbox](term:outbox)). If the provider is temporarily unavailable, the system retries automatically.

The server event looks at the **consent summary** recorded at the moment the order was placed: GA4 needs analytics consent, and Meta needs marketing consent. If the visitor did not grant the relevant permission, the event is **not sent**, and its record is kept with the status `skipped_no_consent` ("no consent, skipped"). This is not an error; it is a safeguard working as intended.

| Status (in the table) | Meaning | What to do |
|---|---|---|
| `sent` | The event was delivered to the provider | Nothing |
| `failed` | The provider rejected it or could not be reached | Check the ID and secret key; the system retries |
| `skipped_no_consent` | The customer had not granted the relevant cookie permission | Normal; this sale is not written to ad data |

You can find the whole payment flow in [Orders and payment verification](/help/orders#odeme-dogrulama).

## Event ID {#olay-kimligi}

Every event carries a unique **event ID** (a UUID). The Pixel in the browser sends it as `eventID`, and the Conversions API on the server sends it as `event_id`. Meta counts a browser + server pair with the same event name and ID as **a single event**; this is called deduplication.

* The ID of a purchase event is derived from the order number, so the same ID is always produced for the same order. That way, even if the event is retried, it is not counted twice.
* On the GA4 side, `transaction_id` is also used; and OpenShelf's own log table (event ID + event name + destination) never sends the same event a second time.
* On the order's payment return page, the browser does **not** trigger a purchase event; the server is the only source.

> [!TIP]
> It is expected for Meta Events Manager to show both "Browser" and "Server" next to an event and still count it as one. If you see two separate counts, check whether the event IDs are the same in the **Recent marketing events** table.

Where the visitor came from ([UTM](term:utm) tags, `fbclid`, `gclid`, the Meta cookies `fbc`/`fbp`, the GA client ID) is stored with the order at checkout; server events use this information. Separate UTM records are kept only if the customer gave marketing consent. When you [anonymize](/help/customers-kvkk#kvkk-ve-anonimlestirme) a customer, these records are deleted too.

## Testing {#test-etme}

Test every tool before you go live. The recommended order is:

### With GA4 {#ga4-ile}

1. Open your site with `?debug_mode=1` added (for example `yourstore.com/?debug_mode=1`), or use the Google Analytics Debugger browser extension.
2. In Google Analytics, open **Admin → DebugView**. Check that events and parameters arrive.
3. Look at DebugView **before making a choice on the cookie banner**: no events should arrive. After you accept analytics cookies, events should start.
4. A purchase event sent from the server does not always show up in DebugView; check the **Realtime** report or the normal reports.

### With Meta {#meta-ile}

1. In Events Manager, go to your Pixel, open the **Test events** tab and copy the code there.
2. In OpenShelf, on the **Tracking** tab, turn on the **Test-event mode (Meta)** switch and enter the code in the **Meta test event code** field.
3. Browse your site and accept marketing cookies on the cookie banner; confirm that the browser events appear on the Test events screen.
4. Place a test order (use [mock mode](/help/getting-started#deneme-modu) or the iyzico sandbox for the payment) and see the **Purchase** event arrive from the server in Test events.
5. **Before going live, delete the test code and turn the switch off.**

> [!WARNING]
> While the test code is active, server events land on the test screen instead of in your real ad data. If you forget the code when you go live, your ad reports will stay empty.

### Inside OpenShelf {#openshelf-icinde}

In the **Recent marketing events** table at the bottom of the **Tracking** tab you can see every server event. In the Destination column, `meta_capi` stands for Meta and `ga4_mp` for GA4. Statuses are tracked as `sent`, `failed` and `skipped_no_consent`. The **Integration events** page also shows error details:

![Integration events](help/en/integration-events.png)

While [mock mode](term:mock) is on, events are not really sent; they land in the **Mock inbox** under the "Event (ads/analytics)" channel:

![Mock inbox](help/en/mock-inbox.png)

## Common mistakes {#sik-yapilan-hatalar}

* **Entering the GA4 ID only under Integrations.** If you want the browser code to run too, enter the ID on the Tracking tab as well.
* **Looking for the secret key on the Tracking tab.** There are no secret fields there; they are on the Integrations cards.
* **Adding letters or spaces to the Pixel ID.** Only digits are accepted.
* **Leaving the test code in place after launch.** See the warning above.
* **Turning off cookie consent and forgetting about it.** No banner means tracking without permission.
* **Setting up GTM and GA4 at the same time.** Events can be counted twice.
* **Expecting the purchase count to match orders one to one.** Sales from customers who declined cookies are not written to ad data; this is normal, and the number in your ad report can come out slightly lower than your real orders.
* **Forgetting to change the keys after testing.** Test (sandbox) and live keys are different; see [Going live](/help/going-live#gizli-anahtarlar-ve-ortam).

## Summary checklist {#ozet-kontrol-listesi}

1. The GA4 measurement ID and (if you use it) the Meta Pixel ID are on the Tracking tab.
2. The Measurement Protocol secret and the Meta access token are in Integrations, the cards are enabled and **Test connection** succeeds.
3. Require consent before tracking is on.
4. Tried with DebugView and Test events; no events before consent.
5. The test event code and mode are turned off.
6. There are no `failed` records in the Recent marketing events table.

# Integrations

In this section you will learn how OpenShelf talks to outside services: payments (iyzico), marketplace (Trendyol), shipping (Geliver), invoicing (e-Faturam), advertising and analytics (Meta, Google Analytics 4), SMS (Netgsm, Twilio) and e-mail (Cloudflare Email). For each provider you will find what it does, which account it needs, where to get the keys, which field to enter them in, how to test it, how to go live, and the most common errors.

> [!WARNING]
> All of these integrations were written against the providers' public documentation and tested with mock providers; **they have not been verified against live accounts**. For Trendyol and e-Faturam in particular, some endpoints are **unverified** (noted separately below). Before letting real money, invoices or customer data flow, try each integration on a small scale with your own account. Fees and limits belong to the providers and may change; do not make "free" claims.

## Testing integrations {#entegrasyonlari-test-etme}

Click **Integrations** in the left menu. Each provider appears as a card.

![Integrations page](help/en/integrations-hub.png)

The **summary** strip shows how many integrations are **connected**, which are healthy, and when the last test ran. The **Test all** button tries every enabled one in turn. The **Setup checklist** shows the headings a new store needs (payment, shipping, invoicing, e-mail, SMS, analytics) and the next step. The filter buttons and search box at the top narrow the cards.

### Items on a card {#kart-uzerindeki-ogeler}

| Item | Meaning |
|---|---|
| The switch at the top right | **Turns the integration on/off.** A disabled integration is never called. |
| Status badge | **Not configured** (required fields are missing), **Configured** (fields filled in, not tested yet), **Connected** (the last test succeeded), **Error** (the last test failed), **MOCK** (mock mode) |
| **Configure** | Opens the drawer from the right: where you fill in the fields |
| **Test connection** | Makes a real connection attempt to the provider. Disabled if fields are missing. |
| **View events** | Opens that provider's **Integration events** records |

### The configuration drawer (the same for every provider) {#yapilandirma-cekmecesi-her-saglayici-icin-ayni}

![Integration configuration drawer](help/en/integration-drawer.png)

1. Click **Configure** on the card.
2. Turn the integration on with the **Enabled** switch.
3. Fill in the public fields (environment, IDs).
4. Paste the values into the secret fields ([API key](term:apikey), [secret key](term:secret)). Secret fields are **write-only**: after saving they are never shown again, only masked. If you leave a field empty, the existing value is kept; to change it, type a new value.
5. Press **Save**. The value is stored **encrypted**.
6. Press **Test connection**. If there are unsaved changes, the test button is disabled ("Save changes first").
7. See the result in the panel in the drawer and in the badge on the card.

Required fields are checked only when you **turn the integration on**; you can save a half-filled draft. While in mock mode, a "saving is disabled" notice appears in the drawer; real keys are ignored, but the test works.

### Integration events {#entegrasyon-olaylari}

The **Integration events** page is the log of provider calls: successes, warnings and errors. If something is not working, this is the first place to look.

![Integration events](help/en/integration-events.png)

The states of background jobs ([outbox](term:outbox)): **Pending**, **Running**, **Done**, **Failed (will retry)**, **Dead (gave up)**.

### General rules {#genel-kurallar}

- **Try every integration in the sandbox/test environment first** ([sandbox](term:sandbox)).
- Do not share keys by e-mail or messaging apps; store them in a password manager.
- Even if the test succeeds, try it end to end with a real order/label/invoice/SMS.
- When switching providers, turn the old one off; if more than one provider of the same kind is on, the first one is used.
- Keep an eye on the **Integration health** card on the **Dashboard**.

## iyzico {#iyzico}

**What it does:** Takes credit card payments. The customer pays on iyzico's hosted payment page ([hosted checkout](term:hostedcheckout)); card details never touch OpenShelf. The system verifies the payment result with a signature and a server-side query, and you make refunds from the order page.

**What you need:** An approved iyzico **merchant** account. The application and approval process belongs to iyzico.

### Where do I get the keys? {#anahtarlar-nereden-alinir}

1. Sign in to the iyzico merchant panel.
2. In the **Settings** (or Integration/API information) section, find the **API key** and the **Secret key**. Sandbox and live have **separate** key pairs; you may be asked to open a separate sandbox merchant account for the sandbox (see iyzico's current documentation).
3. Copy both.

### Which field do I enter them in? {#hangi-alana-yazilir}

**Integrations → iyzico → Configure**:

| Field | What to enter | Watch out for |
|---|---|---|
| **Environment** | **Sandbox (test)** or **Live** | Sandbox uses `sandbox-api.iyzipay.com`, live uses `api.iyzipay.com`. The keys must match the environment. |
| **Allow installment commission** | Whether to accept it if iyzico increases the amount on an instalment payment | When off, if the amount the customer paid differs from the order amount, the payment is not verified. Turn it on deliberately if you offer instalments. |
| **API key** (secret) | The sandbox or live API key | |
| **Secret key** (secret) | The secret key | Do not share it with anyone. |

**Callback and webhook addresses:** The browser return is `https://yourstore.com/api/store/payment/callback/iyzico`, and the notification (webhook) address is `https://yourstore.com/webhooks/payment/iyzico`. If your account supports it, define the webhook address in the iyzico panel ([webhook](term:webhook)).

### Testing and sandbox {#test-ve-sandbox}

1. Set the environment to **Sandbox**, enter the sandbox keys, **Save**, **Test connection**.
2. Buy a product on the storefront; pay with the **test cards** iyzico publishes (the current card numbers are in iyzico's documentation).
3. Confirm the order becomes **Paid**, then that a small partial **Refund** works.

### Going live {#canliya-gecis}

1. Your merchant account is approved for live.
2. Set **Environment** to **Live** and enter the **live** API/Secret key; save and test.
3. Place a low-value order with a real card, and refund it.
4. Make sure mock mode is off ([Going live](/help/going-live#mock-u-kapatma)).

### Common errors {#yaygin-hatalar}

- Using a sandbox key in the live environment (or the other way round): an "authentication" error.
- Amount mismatch: an instalment commission or currency difference; see **Allow installment commission**.
- Missing buyer ID/address details: iyzico may require some fields; if the payment is rejected, look at **Integration events**.
- Not defining the webhook: the browser return works, but if the customer closes the page the payment may show up late.

**Cost:** Commission, instalments and settlement times depend on your iyzico contract. OpenShelf takes no commission.

## Trendyol {#trendyol}

**What it does:** Sends stock and price to Trendyol, brings Trendyol orders into your orders list (reconciliation about every 5 minutes), matches products by SKU/barcode and records stock deductions.

> [!WARNING]
> The Trendyol integration's endpoints (submission addresses, field names, limits, status dictionary) are **unverified**. Before going live, confirm them against Trendyol's current integration documentation and with the seller support team. **Trendyol Express or Trendyol-specific shipping is not assumed or implemented.**

**What you need:** An active Trendyol seller account and API access.

### Where do I get the keys? {#anahtarlar-nereden-alinir-1}

1. Sign in to the Trendyol seller panel.
2. Open the **My account information → Integration information** section (the menu name may change).
3. Copy the **Seller ID (Supplier ID)**, **API Key** and **API Secret** values. If the section is not visible, ask Trendyol support for API authorisation.

### Which field do I enter them in? {#hangi-alana-yazilir-1}

**Integrations → Trendyol → Configure**:

| Field | What to enter |
|---|---|
| **Supplier (Seller) ID** | The seller ID (digits) |
| **API key** (secret) | The Trendyol API key |
| **API secret** (secret) | The Trendyol API secret |
| **Webhook username (Basic auth)** and **Webhook password** (secret, optional) | The basic authentication details you chose when registering the Trendyol webhook |

If you use a webhook, define the address as `https://yourstore.com/webhooks/trendyol`; if you do not, reconciliation already runs automatically.

### Matching and price {#esleme-ve-fiyat}

1. Your products' **SKU** and **Barcode** must be the same as on Trendyol.
2. Enter the **Trendyol price** on the variant ([Channel prices](/help/catalog#kanal-fiyatlari)).
3. In this version there is no "List on Trendyol" switch on the product screen; the stock/price push works for variants that have a Trendyol channel-price record. Confirm that the push happened from **Integration events** and the Trendyol panel. A variant without a barcode is not sent.

### Testing and sandbox {#test-ve-sandbox-1}

On request, Trendyol may provide a test (stage) environment for some integrations; access and addresses belong to Trendyol. If you have none, try with a small number of real products and low stock. Check the credentials with **Test connection**.

### Going live {#canliya-gecis-1}

1. Verify the stock push with a few products, and the import of a trial order.
2. On the order list, compare the **Source: Trendyol** orders ([Trendyol orders](/help/orders#trendyol-siparisleri)) with the Trendyol panel.
3. If stock drift occurs, watch the **Stock drift** card on the **Dashboard**.

### Common errors {#yaygin-hatalar-1}

- Barcode/SKU mismatch: the order line is not matched and stock is not deducted.
- Rate limits and category/attribute requirements belong to Trendyol; the error shows up in **Integration events**.
- Invoicing the same order from two places ([e-Faturam](/help/integrations#e-faturam)).

**Cost:** Trendyol commissions and shipping agreements depend on your Trendyol contract.

## Geliver {#geliver}

**What it does:** Gets quotes from many carriers, creates shipments and labels, tracks them and cancels shipments. **Create shipment** on the order page uses this.

**What you need:** A Geliver account and at least one defined sender address.

### Where do I get the keys? {#anahtarlar-nereden-alinir-2}

1. Sign in to your Geliver panel.
2. Create/copy your **API Token** (Geliver documentation: docs.geliver.io).
3. Define a **sender address** in the panel and note the address ID; if you like, define a **return address** too.

### Which field do I enter them in? {#hangi-alana-yazilir-2}

**Integrations → Geliver → Configure**:

| Field | What to enter | Watch out for |
|---|---|---|
| **Test mode (free test shipments)** | Whether it is a test shipment | **It is test by default.** **Turn it off** for real shipping. |
| **Sender address ID (Geliver)** (required) | The sender address ID in Geliver | The connection test queries this address. |
| **Return address ID** | The return address ID | Optional. |
| **Store URL** | Your store address | |
| **API token** (secret) | The Geliver access key | |

### Testing and going live {#test-ve-canliya-gecis}

1. With **Test mode** on, run **Test connection**, then create a test shipment with **Create shipment** on a trial order ([Shipping](/help/orders#kargo)).
2. When going live, turn **Test mode** off, and review the sender address and product weights.
3. Try the first real shipment with a single parcel.

### Common errors {#yaygin-hatalar-2}

- Leaving test mode on in production: labels are not passed on to a real carrier.
- Wrong service code: in the **Create shipment** window, enter the quote's service ID that you got from Geliver.
- If a product's weight is undefined, 500 g per unit is assumed; the fee may come out wrong.
- Since there is no webhook verification mechanism, do not rely on tracking updates; you set **Delivered** yourself.

**Cost:** Carriers, prices and cash-on-delivery support depend on your Geliver contract; the label fee is charged by the carrier.

## e-Faturam {#e-faturam}

**What it does:** Issues e-Fatura or e-Arşiv invoices for orders (automatically after payment, or manually), stores the number and the document link, and never issues the same invoice twice. Details: [Invoices](/help/invoices).

> [!DANGER]
> The e-Faturam API details (addresses, authentication format, field names) are **unverified**; the provider documentation is sent to you privately with the activation e-mail. You must test with your own account before issuing real invoices. **The scope of orders from channels other than Trendyol (your website) depends on your e-Faturam contract**; get written confirmation. Consult your accountant about your tax status. This guide is not legal advice.

**What you need:** A Trendyol e-Faturam account/contract and the web service details you were given.

### Where do I get the details? {#bilgiler-nereden-alinir}

1. Find the e-Faturam activation e-mail and documents: the **service address**, **username** and **password**.
2. Decide your series prefixes (3 letters each for e-Fatura and e-Arşiv) with your accountant.
3. In **Settings → General**, enter the seller **Tax ID** and **Address**.

### Which field do I enter them in? {#hangi-alana-yazilir-3}

**Integrations → Trendyol e-Faturam → Configure**:

| Field | What to enter | Watch out for |
|---|---|---|
| **Service URL** (required) | The provider's service address | For security, only `trendyol.com` domains are accepted. |
| **Check whether the tax number is an e-Fatura taxpayer** | Whether to ask if the customer's VKN is an e-Fatura taxpayer | If off, company + 10-digit VKN = e-Fatura is assumed. |
| **e-Fatura series prefix (3 letters)**, **e-Arşiv series prefix (3 letters)** | The series prefixes | Optional. |
| **Username** (secret), **Password** (secret) | The service credentials | |

### Testing and sandbox {#test-ve-sandbox-2}

If e-Faturam provides a test/sandbox account, use it; confirm with the provider that test invoices do not go to the tax authority as real documents. Check access with **Test connection**, then try the flow in mock mode ([Mock mode](/help/getting-started#deneme-modu)).

### Going live {#canliya-gecis-2}

1. Get written confirmation of the order sources and customer types your contract covers.
2. Issue a manual invoice with a single real order and see it in the e-Faturam panel.
3. Then leave the automatic invoice on deliberately. Watch out for the risk of double invoices on Trendyol orders.

### Common errors {#yaygin-hatalar-3}

- Wrong service URL/credentials: the invoice falls into the **Failed** status.
- A domain other than `trendyol.com`: the save is rejected.
- Missing VKN/tax office in the customer details: the invoice becomes e-Arşiv.
- Series prefix error: the provider rejects it.

**Cost:** Invoice/credit fees depend on your e-Faturam contract.

## Meta Pixel and Conversions API {#meta-pixel-ve-donusum-api}

**What it does:** Passes Meta Pixel events from the browser (after cookie consent) and verified purchases from the server to Meta using the **Conversions API** ([CAPI](term:capi)). So that the same event is not counted twice, both carry the same **event ID** ([event ID](term:eventid)). A product catalog feed is also offered at `/feeds/meta.xml` and `/feeds/meta.csv`.

**What you need:** A Meta Business account, a Pixel (dataset) and access to Events Manager.

### Where do I get the keys? {#anahtarlar-nereden-alinir-3}

1. Open Meta **Events Manager** and choose your Pixel.
2. Copy the **Pixel / dataset ID** (digits).
3. With **Settings → Conversions API → Generate access token**, generate and copy the [access token](term:accesstoken).
4. For testing, note the [test event code](term:testeventcode) on the **Test events** tab.

### Which field do I enter them in? {#hangi-alana-yazilir-4}

- **Settings → Tracking**: **Meta Pixel ID** (for the browser), **Require consent before tracking**.
- **Integrations → Meta Pixel & Conversions API → Configure**:

| Field | What to enter |
|---|---|
| **Pixel / Dataset ID** (required) | The same Pixel ID (digits, 5–20 digits) |
| **Graph API version** | If empty, the default version; update it if Meta retires the version |
| **Test event code** | Only while testing; must be **empty** in production |
| **Conversions API access token** (secret) | The access token |

Enter the Pixel ID in both places; the server side uses the ID in the integration drawer.

### Testing {#test}

1. Enter the test code in the drawer and save; **Test connection**.
2. Browse the storefront (give marketing consent) and see the events in Events Manager → **Test events**.
3. Place an order: the server `Purchase` event should appear as "Server" and be deduplicated with the browser event.
4. On **Settings → Tracking → Recent marketing events**, look at the statuses (sent / error / no consent).

### Going live {#canliya-gecis-3}

**Clear** the test code from both the **Test event code** (drawer) and **Meta test event code** (Tracking) fields. The Pixel must not load without consent; check the cookie banner and its texts.

### Common errors {#yaygin-hatalar-4}

- Expecting events without consent being given: the server event is skipped as "no consent" if the order's recorded consent does not allow marketing. Customer data is hashed with SHA-256.
- If the test code is left on in production, events show up only in Test events.
- A wrong Pixel ID or an expired token.

**Cost:** Using the Pixel and CAPI is generally free at Meta; ad spend is separate. Confirm the current terms with Meta.

## Google Analytics 4 {#google-analytics-4}

**What it does:** Measures site visits and sales. Browser events run according to cookie consent (Consent Mode v2); for verified payments, a `purchase` event is sent from the server side using the Measurement Protocol.

**What you need:** A Google Analytics 4 property and a web data stream.

### Where do I get the keys? {#anahtarlar-nereden-alinir-4}

1. In GA4, go to **Admin → Data streams → your stream**.
2. Copy the **Measurement ID** (`G-XXXXXXXXXX`) ([measurement ID](term:measurementid)).
3. With **Measurement Protocol API secrets → Create**, generate the [API secret](term:apisecret).

### Which field do I enter them in? {#hangi-alana-yazilir-5}

- **Settings → Tracking → GA4 Measurement ID** (browser), and optionally the **Google Tag Manager ID**.
- **Integrations → Google Analytics 4 (Measurement Protocol) → Configure**: **Measurement ID** (the same ID) and **Measurement Protocol API secret** (secret).

### Testing {#test-1}

Use GA4 **DebugView**; check the server `purchase` events in the **Realtime** reports. Confirm that no event is sent before consent. Setup details: [Analytics and ads](/help/analytics).

### Going live and errors {#canliya-gecis-ve-hatalar}

- The Measurement ID must be the same in both places.
- If the GA client ID is not captured at checkout, attribution is limited.
- GA4 has processing delays; reports may lag by a few hours.

**Cost:** Standard GA4 is offered free; quotas and terms belong to Google.

## Netgsm {#netgsm}

**What it does:** Sends transactional SMS (order notifications) for Turkey; Turkish characters are supported.

**What you need:** A Netgsm account, SMS balance (credits) and an approved **message header**.

### Where do I get the details? {#bilgiler-nereden-alinir-1}

1. In the Netgsm panel, find your **subscriber number / usercode**.
2. Create an **API sub-user** and set its password.
3. Get your **message header** (3–11 characters) approved.

### Which field do I enter them in? {#hangi-alana-yazilir-6}

**Integrations → Netgsm (SMS) → Configure**:

| Field | What to enter | Watch out for |
|---|---|---|
| **Sender header (msgheader)** | The sender header, e.g. `MYSHOP` | Must be registered at Netgsm. If **Notifications → SMS sender ID** is filled in, that is used. |
| **Usercode (subscriber number)** (secret) | The subscriber number | |
| **API password** (secret) | The API sub-user's password | |

Then tick the SMS boxes on the **Notifications** tab.

### Testing and going live {#test-ve-canliya-gecis-1}

A public Netgsm sandbox has not been verified. Use mock mode for development; in practice, send an SMS to your own number with **Notifications → Send test**. The balance/health-check endpoint could not be confirmed: do not rely on the **Test connection** result alone.

### Common errors {#yaygin-hatalar-5}

- Unapproved message header, insufficient balance.
- A number abroad: skipped because the default country allow list is `+90`.
- A long message with Turkish characters: with UCS-2, about 70 characters per segment, and the cost goes up.
- Only transactional SMS is sent; commercial-message and İYS (Turkey's commercial message management system) rules ([İYS](term:iys)) are handled on the Netgsm side.

**Cost:** The per-SMS credit fee depends on your Netgsm tariff.

## Twilio {#twilio}

**What it does:** Sends transactional SMS, especially to numbers outside Turkey (first add the country code to **SMS allowed countries**).

**What you need:** A Twilio account and a sender (a number or a Messaging Service).

### Where do I get the details? {#bilgiler-nereden-alinir-2}

From the Twilio Console home page: the **Account SID** and **Auth Token**; your number from the **Phone Numbers** section, or the Messaging Service SID under **Messaging → Services**.

### Which field do I enter them in? {#hangi-alana-yazilir-7}

**Integrations → Twilio (SMS) → Configure**:

| Field | What to enter |
|---|---|
| **Account SID** | `AC` + 32 characters |
| **From number (E.164)** | `+15551234567`; either this or a Messaging Service is required |
| **Messaging Service SID** | `MG…`; if filled in, it is used instead of **From** |
| **Auth Token** (secret) | The Twilio access token |

### Testing and going live {#test-ve-canliya-gecis-2}

Twilio offers test credentials and trial accounts; trial accounts can only send to verified numbers. Try it with **Notifications → Send test**. When going live, upgrade the account.

### Common errors {#yaygin-hatalar-6}

Sender registration (A2P 10DLC, alphanumeric sender) is your responsibility depending on the country. Countries other than `+90` are skipped unless added to the allow list. Turkish characters switch the message to UCS-2.

**Cost:** Twilio charges per segment; the price varies by country.

## Cloudflare Email {#cloudflare-e-posta}

**What it does:** Sends order e-mails and the e-mails you write from the panel using Cloudflare Email Sending ([Composing e-mail](/help/email)).

> [!WARNING]
> Cloudflare Email Sending is in **Beta**. Sending to any recipient requires the **Workers Paid** plan; on the **Free** plan you can only send to **verified destination addresses**. Check Cloudflare for the current documentation and pricing. The API may change.

**What you need:** A Cloudflare account; your sender domain added to Email Sending and its DNS records (SPF, DKIM, DMARC) verified.

### Where do I get the details? {#bilgiler-nereden-alinir-3}

1. In the Cloudflare dashboard, copy your **Account ID** (32 characters).
2. Create an **API token** authorised to send e-mail (Email Sending: Send/Edit).
3. Add the sender domain to Email Sending and complete the DNS verification.

### Which field do I enter them in? {#hangi-alana-yazilir-8}

**Integrations → Cloudflare Email Service → Configure**:

| Field | What to enter |
|---|---|
| **Cloudflare Account ID** | The 32-character account ID |
| **Default From address** | `orders@yourstore.com`; **Notifications → From e-mail** overrides this |
| **API token** (secret) | The Cloudflare API token |

### Testing and going live {#test-ve-canliya-gecis-3}

On the Free plan, add your own address as a verified destination and try it with **Notifications → Send test**. To send to everyone in production, upgrade the plan and complete the domain verification. Deliverability depends on your SPF/DKIM/DMARC setup.

### Common errors {#yaygin-hatalar-7}

An unverified sender domain, an unverified recipient on the Free plan, an unauthorised API token. Control characters are stripped from the subject line; the body is fully escaped.

**Cost:** Plan and sending fees belong to Cloudflare and may change. See also [Going live](/help/going-live#maliyetler).

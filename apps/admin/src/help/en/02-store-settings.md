# Store settings

In this section you will go through the tabs of the **Settings** screen one by one: your store's name and tax details, logo and colours, how you appear in search engines, legal texts, checkout and shipping rules, advertising/analytics IDs, the notifications sent to customers, and the system switch (mock mode). For each tab you will find what the fields do, example values, and what happens if you fill them in wrongly.

Click **Settings** in the left menu. The tabs sit on the left of the screen (at the top on a narrow screen): **General**, **Branding**, **SEO**, **Legal texts**, **Checkout**, **Tracking**, **Notifications**, **System**.

> [!NOTE]
> Every tab has a sticky save bar at the bottom. When you change a field, an "Unsaved changes" warning appears in the bar; nothing takes effect until you press **Save changes**. Each tab is saved separately: if you change something on one tab and move to another without saving, that change is lost.

## General {#genel}

![General settings tab](help/en/settings-general.png)

This tab is your store's identity. What you enter here appears on the storefront, invoices, e-mails, legal texts and shipping labels.

### Store card {#magaza-karti}

| Field | What to enter | Example | Watch out for |
|---|---|---|---|
| **Store name** (required) | The trade name customers see | Ceramic Workshop | At most 80 characters. The `{{storeName}}` variable in e-mail and SMS templates comes from this field. |
| **Tagline** | A one-sentence pitch | Handmade ceramics | At most 160 characters. If the home page title is empty, it is derived from this. |
| **Description** | A short text describing your store | Handmade ceramics made in Istanbul… | At most 500 characters. May be used as the description in search results. |

### Contact and business details {#iletisim-ve-isletme-bilgileri}

| Field | What to enter | Example | Watch out for |
|---|---|---|---|
| **Contact email** | The address customers write to | support@yourstore.com | Used as `{contactEmail}` in the KVKK (Turkish data protection law) and returns texts. When you send e-mail from the panel, it is also used as the sender address if the sender e-mail in the notification settings is empty. |
| **Contact phone** | The store's phone number | +90 530 123 45 67 | Display only. |
| **Address** | Your invoice address | 12 Moda St., Kadıköy, Istanbul | Shown as `{address}` in the distance sales contract and as the seller address on invoices. |
| **Tax ID** | Your VKN (tax number, 10 digits), or your TCKN (national ID number, 11 digits) if you are a sole proprietor | 1234567890 | Appears on invoices and in the contract; if it is wrong, the documents will be wrong. For the difference between [VKN and TCKN](term:vkn), see the [Invoices](/help/invoices#vkn-ve-tckn) section. |

### Pricing and locale {#fiyat-ve-bolge}

| Field | What to enter | Example | Watch out for |
|---|---|---|---|
| **Currency** | TRY, USD, EUR or GBP | TRY | The store's only currency. Do not change it after going live; past orders stay in the old currency. |
| **Default tax rate (%)** | The rate used when a product has no specific rate | 20 | A whole number from 0 to 100. This is the default for the line-level VAT (*KDV*) on invoices. See [VAT calculation](/help/invoices#kdv-hesabi). |
| **Default language** | The storefront's opening language: Turkish or English | Turkish | Customer notifications are also sent in this language. |
| **Timezone** | Your store's timezone | Europe/Istanbul | "Sales today" on the **Dashboard** is calculated using this timezone. |
| **Prices include tax** | On: the prices you enter include VAT. Off: VAT is added on top. | On | Usually on for retail sales in Turkey. Do not change it after going live; it changes the meaning of every price. |

> [!WARNING]
> Changing fields such as **Prices include tax**, **Currency** and **Tax ID** after sales have started makes invoices and reports inconsistent. Settle them before going live, and do not change them afterwards without consulting your accountant.

### Common mistakes {#sik-yapilan-hatalar}

- Confusing the store name with the legal company name: **Store name** is the name customers see; you state your official legal name on the invoice together with **Address** and **Tax ID**.
- Writing the tax number with spaces or hyphens. Enter digits only.
- Not writing phone numbers in international format. The admin phone used for notifications is entered separately (with +90) on the **Notifications** tab.

## Branding {#marka}

![Branding tab](help/en/settings-branding.png)

This determines the look of the storefront: logo, home page images and colours.

| Section | Field | Description |
|---|---|---|
| **Logo & favicon** | **Logo** | PNG, JPEG or WebP; at most 512 KB. Appears in the top corner of the site. |
| | **Logo (dark mode)** | A light-coloured version for dark backgrounds. If empty, the normal logo is used. |
| | **Favicon** | The small icon in the browser tab. Square PNG, at most 512 KB. |
| **Homepage banners** | Images | Up to 6; each at most 1.5 MB. Prepare them in a wide format (for example 1600×600). You can reorder them with the up/down arrows. |
| | **Banner title**, **Banner subtitle** | The text shown over the image. |
| | **Button label**, **Button link** | For example "Shop now" → `/collections/new`. |
| **Brand colors** | **Primary color**, **Accent color** | A 6-digit colour code, for example `#3B3F8F`. Use the colour picker or type the code. The live preview on the right updates. |
| **Social links** | Instagram, Facebook, X (Twitter), Youtube, Tiktok | Enter the full address (`https://…`); an icon you leave empty is not shown. |

### Tips for preparing images {#gorsel-hazirlama-ipuclari}

1. Give your logo a transparent background (PNG); upload a separate version for dark mode.
2. In banners, keep the important text near the centre of the image; the edges may be cropped on mobile.
3. Make sure there is enough contrast between the text and the background. The primary colour must be readable against the text colour.
4. Shrink images before uploading; large files make the page load slowly.

### Common mistakes {#sik-yapilan-hatalar-1}

- Writing the colour code without `#` or with 3 digits (you will get a "Use a 6-digit hex color" warning).
- Uploading a logo larger than 512 KB.
- Entering a wrong path as the banner button link. If it goes to a page on your own site, use a path that starts with `/`.

## SEO settings {#seo-ayarlari}

![SEO tab](help/en/settings-seo.png)

This tab determines how your store appears when shared in search engines such as Google and on social media. Each product page's own title and description are edited on the **Products** screen. For technical terms and a fuller explanation, see the [SEO section](/help/seo).

| Section | Field | What to enter | Watch out for |
|---|---|---|---|
| **Page titles** | **Title template** | `%s \| {storeName}` | `%s` is replaced by the page's own title and `{storeName}` by your store name. It applies to product, category and content pages. If there is no `%s`, the template is not applied. |
| **Home page** | **Home title** | Ceramic Workshop – Handmade ceramics | At most 120 characters. If empty, the store name and tagline are used. The counter shows the ideal length. |
| | **Home description** | A summary of about 155 characters | At most 320 characters. If empty, the store description is used. A Google preview appears live below. |
| **Social sharing** | **Default social image (OG)** | 1200×630, under 1 MB | Used when a page has no image of its own ([OG image](term:ogimage)). |
| | **X / Twitter handle** | @yourstore | Letters, digits and underscores; at most 15 characters. |
| **Search engine access** | **Allow search engines to index this store** | On | If you turn it off, a `noindex` tag is added to every page and `robots.txt` blocks crawling; your store will not appear on Google. See [noindex](term:noindex), [robots.txt](term:robots). |
| | **Structured data (JSON-LD)** | On | Gives search engines your organisation, product and price information in machine-readable form; needed for rich results. See [JSON-LD](term:jsonld). |
| | **Extra robots.txt Disallow paths** | `/internal/` | Extra rules added to `robots.txt` (up to 30). Must start with `/`. |
| **Site verification** | **Google Search Console**, **Bing Webmaster Tools**, **Facebook domain verification** | The verification code only | Paste the `content` value from the HTML tag, not the whole tag. |

> [!WARNING]
> After you open your store to the public, make sure **Allow search engines to index this store** is **on**. Keeping it off during the trial phase makes sense, but if you forget, your store will not appear in search results for months.

The sitemap (`sitemap.xml`) is generated automatically; there is no setting for the [sitemap](term:sitemap). For address redirects, see the [SEO section](/help/seo#adres-yonlendirmeleri).

## Legal texts {#yasal-metinler}

![Legal texts tab](help/en/settings-legal.png)

Here you write the legal documents customers see and accept before paying. There are five documents: **KVKK**, **Distance sales**, **Returns**, **Cookies**, **Privacy**. Use the small tabs at the top to move between documents.

1. Open the **Legal texts** tab.
2. Choose a document at the top (for example **KVKK**).
3. Load a starting text by pressing **Insert TR template** or **Insert EN template** above the empty text field.
4. Edit the text to fit your business. The text is in **Markdown**: you can use `#` for headings, `**bold**` and `- lists`.
5. Press **Save changes**.

In the texts, the following placeholders are filled in automatically on the storefront: `{storeName}` (store name), `{contactEmail}` (contact email), `{taxId}` (tax ID), `{address}` (address). So fill in the **General** tab first.

| Document | What it is for | When it is shown |
|---|---|---|
| **KVKK** | The [KVKK](term:kvkk) privacy notice (Turkish data protection law) | When the customer enters personal data |
| **Distance sales** | The [distance sales](term:distancesales) contract and pre-contract information | Before payment; no order is created unless the customer accepts it |
| **Returns** | Return and exchange terms, right of withdrawal | In the footer and before payment |
| **Cookies** | Cookie policy | In the cookie banner |
| **Privacy** | Privacy policy | In the footer |

> [!DANGER]
> The templates that ship with the package are **not legal advice**; they are only a starting text. The rules on KVKK, distance sales, withdrawal and cookies differ depending on your business, your products and changes in legislation. Have a lawyer review them before you take real orders. You are responsible for compliance and for the content of the texts.

### Common mistakes {#sik-yapilan-hatalar-2}

- Going live with the template completely unchanged (for example, the delivery time or return period may not match your business).
- Leaving the distance sales contract empty: the customer finds no text to accept before paying.
- Leaving the address/tax ID empty on the **General** tab, so the placeholders show up blank in the text.

## Checkout {#odeme-ve-siparis}

![Checkout tab](help/en/settings-checkout.png)

This tab (called "checkout" behind the scenes) sets the rules a customer goes through from the cart to payment.

| Field | What to enter | Example | Watch out for |
|---|---|---|---|
| **Allow guest checkout** | Whether people can order without registering | On | If you turn it off, customers must create an account to order; in most stores this lowers conversion. |
| **Stock reservation (minutes)** | How many minutes the product is held once the customer goes to payment | 15 | Between 5 and 120. When the time runs out, an unpaid order automatically becomes **Cancelled**, the stock is released and the coupon use is returned. See [stock reservation](term:reservation). |
| **Safety stock** | The number of units held back from sale for each variant | 1 | For example, if stock is 3 and safety stock is 1, at most 2 units can be sold on the storefront. See [safety stock](term:safetystock). |
| **Flat shipping fee** | The shipping charge added to every order | 49.90 | In the store currency; write the decimal part with a point. If 0, shipping is free. |
| **Free shipping threshold** | Shipping is free once the cart reaches this amount | 750 | If you leave it empty, free shipping does not apply. See [free shipping threshold](term:freeshipping). |

### How do I choose the reservation time? {#rezervasyon-suresi-nasil-secilir}

- **Too short (5–10 min):** The time may run out while the customer is looking for their card; even if the payment succeeds, the order may already have been cancelled. The system records this as a "late payment" and warns you on the **Integration events** screen that a manual refund is needed.
- **Too long (60+ min):** Customers who do not finish paying lock up the last remaining item for a long time.
- **Recommended:** 15–30 minutes.

> [!TIP]
> Safety stock is useful as a buffer against counting errors; if you also sell on a marketplace such as Trendyol, it reduces the chance of the same product being sold on both channels at once.

## Tracking {#takip-ve-reklam}

![Tracking tab](help/en/settings-tracking.png)

Here you enter the browser-side measurement IDs and set the cookie-consent behaviour. Server-side secrets (the GA4 API secret, the Meta access token) are entered not on this page but on the **Integrations** screen. For detailed setup, see the [Analytics and ads](/help/analytics) section.

| Section | Field | What to enter | Example |
|---|---|---|---|
| **Browser tracking IDs** | **GA4 Measurement ID** | The Google Analytics 4 data stream ID ([measurement ID](term:measurementid)) | `G-AB12CD34EF` |
| | **Google Tag Manager ID** | Optional container ID ([GTM](term:gtm)) | `GTM-ABC1234` |
| | **Meta Pixel ID** | Digits only, 5–20 digits ([Meta Pixel](term:pixel)) | `123456789012345` |
| **Consent & testing** | **Require consent before tracking** | No script is loaded until the visitor allows it ([cookie consent](term:consent)) | On |
| | **Test-event mode (Meta)** | Sends server events to the Test Events tab in Meta | Off |
| | **Meta test event code** | The code under Events Manager → Test events ([test event code](term:testeventcode)) | `TEST12345` |

Two buttons at the bottom of the page (**Configure GA4**, **Configure Meta**) take you straight to the relevant integration drawer. The **Recent marketing events** table lists the status of events sent from the server side (sent, error, skipped because there was no consent).

> [!WARNING]
> Turning off **Require consent before tracking** means loading trackers without the visitor's permission. Under Turkish and EU rules this generally requires consent. Get legal advice before turning it off.

> [!NOTE]
> The test code used in Meta server-side events is read from the **Test event code** field in the **Meta** integration drawer. When testing, enter the code both here and in the drawer; clear both before going live. Details: [Meta Pixel and Conversions API](/help/integrations#meta-pixel-ve-donusum-api).

## Notifications {#bildirimler}

![Notifications tab](help/en/settings-notifications.png)

OpenShelf sends only **transactional** messages: e-mails and SMS about order status. There are no marketing or bulk messages. Messages go only to the order's own e-mail address and phone number; there is no free recipient entry.

For a channel to work, its provider must be enabled on the **Integrations** screen ([Netgsm](/help/integrations#netgsm) or [Twilio](/help/integrations#twilio) for SMS, [Cloudflare Email](/help/integrations#cloudflare-e-posta) for e-mail). In mock mode, messages land in the **Mock inbox**.

### Choosing events and channels {#olay-ve-kanal-secimi}

In the **Channels per event** table you tick the **SMS** and **E-mail** boxes for each event. The default: e-mail on, SMS off.

| Event | Who receives it | When it fires |
|---|---|---|
| **Order paid** | Customer | When the payment is verified |
| **Order shipped** | Customer | When you set the status to **Shipped**; the tracking number is added to the message |
| **Order delivered** | Customer | When you set the status to **Delivered** |
| **Order cancelled** | Customer | When you cancel a paid order |
| **Order refunded** | Customer | When a full refund is completed |
| **New order (to admin)** | You | When a payment is received; sent to the **Admin e-mail** and **Admin phone (E.164)** |

For orders cancelled before payment, no message is sent to the customer (a silent cancellation).

### Sender and admin recipient {#gonderen-ve-yonetici-alicisi}

| Field | What to enter | Example | Watch out for |
|---|---|---|---|
| **From name** | The name shown on e-mails | Ceramic Workshop | If empty, the store name is used. |
| **From e-mail** | The sender address of e-mails | orders@yourstore.com | The domain must be added to Cloudflare Email Sending and its DNS records verified; otherwise Cloudflare rejects the address. This field overrides the default address on the Cloudflare Email card. |
| **SMS sender ID** | The sender header on SMS, at most 11 characters | MYSHOP | Must be a header registered to your Netgsm account; if filled, it is used instead of the provider's own setting. See [SMS header](term:smsheader). |
| **Admin e-mail** | The recipient of the "new order" e-mail | you@yourstore.com | |
| **Admin phone (E.164)** | The recipient of the "new order" SMS | +905301234567 | Must start with `+` and the country code ([E.164](term:e164)). |

### Cost and abuse protections {#maliyet-ve-kotuye-kullanim-korumalari}

| Field | Meaning | Default |
|---|---|---|
| **SMS allowed countries** | SMS goes only to these country codes (such as `+90, DE`, comma-separated). SMS to other countries is skipped as "country not allowed". If you leave it empty, no SMS is sent. | `+90` |
| **Max SMS per phone / day** | The total SMS limit for the same number over the last 24 hours (all events). 0 = unlimited. | 3 |
| **Max e-mails per address / day** | The e-mail limit for the same address over the last 24 hours. 0 = unlimited. | 5 |

Admin notifications are not subject to these daily limits. Numbers in Turkish local format (`05301234567`) are automatically converted to `+90…` format.

### Templates {#sablonlar}

1. On the **Templates** card, choose the **Language** (Turkish/English) and the **Event**.
2. Write the **E-mail subject** and the **Message body (SMS text and e-mail body)**. The body is used both as the SMS text and as the e-mail body (it is formatted automatically in e-mail). At most 2,000 characters.
3. Click the variable buttons below to insert them where the cursor is:

| Variable | What it is replaced with |
|---|---|
| `{{orderNumber}}` | The order number (like DEMO-1004) |
| `{{customerName}}` | The customer's full name |
| `{{total}}` | The order total (formatted with ₺) |
| `{{trackingNumber}}` | The shipping tracking number (only for the shipped event) |
| `{{trackingUrl}}` | The tracking link |
| `{{storeName}}` | The store name |
| `{{orderUrl}}` | The link to the customer's order page |

4. Only the variables above work. If you write an unknown variable (an "Unknown variables" warning appears), it shows up empty in the message. See [template variable](term:templatevar).
5. Templates you leave empty fall back to the built-in default. The **Reset to default** button restores the selected template to its factory text.
6. In the **Live preview (sample data)** section, check how the SMS and e-mail will look.

**SMS segments and cost:** Below the preview you will see the character count, the encoding (GSM-7 or UCS-2) and the number of segments. Turkish characters (ç, ğ, ı, ş) switch the message to UCS-2; in that case a single SMS is about 70 characters instead of 160, and long messages are split into several segments and become **more expensive**. Keep SMS templates short.

### Sending a test message {#deneme-mesaji-gonderme}

1. On the **Send a test message** card, choose the **Channel** (E-mail/SMS).
2. Enter the recipient (your own e-mail address or your `+90…` phone number).
3. Press **Send test**. The message is sent with a "[TEST]" label.
4. If you changed the sender details, save first.

Test sending is limited to 5 per admin per hour and 10 per connecting address. If there is no enabled provider for that channel ("no provider"), you will get an error.

### Common mistakes {#sik-yapilan-hatalar-3}

- **Ticking a channel without enabling its provider:** The message is not sent; it appears as "Skipped" in the notification history on the order page.
- **Sender e-mail domain not verified:** Cloudflare rejects it. Complete the DNS verification.
- **Expecting to e-mail everyone on the Cloudflare Free plan:** On the Free plan, delivery is only to verified destination addresses. See [Cloudflare Email](/help/integrations#cloudflare-e-posta).
- **Turkish characters and long text in an SMS template:** The cost can multiply several times over.
- **Expecting SMS to a foreign number without adding it to the country allow list.**
- **To monitor sent notifications,** look at the **Notifications** card on the relevant order's page; you will see the Sent/Failed/Skipped status for each channel.

## System {#sistem}

![System tab](help/en/settings-system.png)

This tab has a single setting: **Mock mode (demo)**. When it is on, all outside services (iyzico, Geliver, e-Faturam, Trendyol, Meta, GA4, SMS, e-mail) are replaced by an offline imitation. Nobody makes a real payment; invoices, labels, SMS and e-mails are written to the **Mock inbox**.

- Only the **Owner** can change it.
- If the live Worker does not have the `ALLOW_MOCK=true` variable, the switch is disabled and shows a notice explaining why.
- It cannot be turned on while a real payment provider is enabled or while real paid orders exist.
- When you press the switch, a confirmation dialog appears. When turning on: "All integrations will be simulated…". When turning off: "Real integrations will be used again, with their saved credentials. Unpaid mock orders cannot be completed afterwards."

For a step-by-step walkthrough, the safety rules and the demo tour, see [Getting started → Mock mode](/help/getting-started#deneme-modu).

> [!DANGER]
> In a store serving real customers, **mock mode must not be on**. Turn it off before going live and remove the `ALLOW_MOCK` variable. Checklist: [Going live](/help/going-live#mock-u-kapatma).

# Going live

In this section you will learn, in order and in detail, what to do before opening your store to real customers: connecting a domain, pinning your addresses, secret keys and the live environment, turning off mock mode, a test order, legal texts, and how costs work. Work through this page from start to finish once before going live.

> [!WARNING]
> Going live means real money and real customer data. Do not rush. Complete the list below from top to bottom and tick off each step. This section is not legal or financial advice.

## Launch checklist {#yayin-kontrol-listesi}

A short summary; each item is covered in detail in the sections below.

| # | Check | Why it matters | Where |
|---|---|---|---|
| 1 | Your own [domain](term:domain) is connected and opens with `https://` | Customers see a trustworthy address; share previews work | [Domain](#alan-adi) |
| 2 | The addresses (Storefront / Admin / API) are pinned | Strict protection against requests from the wrong sites | [Domain](#alan-adi) |
| 3 | The temporary `workers.dev` and preview addresses are turned off | So there is no second door (one that can show up in search engines) to the same store | [Domain](#alan-adi) |
| 4 | Secret keys are complete and stored safely | Losing a key stops the integrations | [Secret keys and environment](#gizli-anahtarlar-ve-ortam) |
| 5 | `ALLOW_MOCK` is removed and **Mock mode is off** | So customers do not see a fake payment page | [Turning off mock mode](#mock-u-kapatma) |
| 6 | All integrations are in the **Live** environment with live keys | A payment in the sandbox is not real | [Secret keys and environment](#gizli-anahtarlar-ve-ortam) |
| 7 | A real test order was placed and really refunded | To see that every link in the chain works | [Test order](#deneme-siparisi) |
| 8 | Two-step verification is on; team roles are right | Account security | [Security](/help/security#iki-adimli-dogrulama) |
| 9 | The five legal texts are written and checked by a lawyer | Legal obligations | [Customers and KVKK](/help/customers-kvkk#kvkk-ve-anonimlestirme) |
| 10 | The search engine switch is **on** | Otherwise you will not appear on Google | [SEO](/help/seo#canonical-ve-noindex) |
| 11 | The analytics test code is deleted and cookie consent is on | So ad data flows correctly | [Analytics](/help/analytics#test-etme) |
| 12 | Notification templates, SMS sender name and email sender address are correct | So customers get the right message | [Notifications](/help/store-settings#bildirimler) |
| 13 | A backup was taken and tested | Preparation for the unexpected | [Backup](/help/data#yedekleme) |
| 14 | Costs and the budget alert were reviewed | So there are no surprise bills | [Costs](#maliyetler) |

## Domain {#alan-adi}

Your customers should reach the store at your own address, such as `yourstore.com`. At the start, the store opens at a temporary address in the `...workers.dev` format; this address is for testing.

### Connecting a domain {#alan-adi-baglama}

**Before you start:** You must have bought a domain, and the domain must be on Cloudflare DNS (Cloudflare must manage the [DNS](term:dns) records). If the domain is not on Cloudflare yet, add it in the Cloudflare dashboard with "Add a domain" and change the name servers at your registrar to the ones Cloudflare gives you; this can take a few hours.

1. In the Cloudflare dashboard, under **Workers & Pages**, select your store's Worker ([Worker](term:worker)).
2. Go to **Settings → Domains & Routes**.
3. Add your domain with **Add** (for example `yourstore.com` and, if you like, `www.yourstore.com`).
4. Wait a few minutes; the address should open with `https://`. The security certificate (SSL / HTTPS) is provided automatically by Cloudflare ([SSL / HTTPS](term:ssl)).
5. Open `https://yourstore.com` and `https://yourstore.com/admin/` in a browser and confirm you can sign in.

Note: Cloudflare's menu names may change over time; the Cloudflare documentation below shows the current path: Workers → Custom Domains. No additional change is needed in the configuration; the store's addresses are derived automatically from the address of the incoming request. The admin panel's security cookie works **only over HTTPS**.

> [!NOTE]
> DNS changes can take anywhere from a few minutes to a few hours to spread across the world; during that time some visitors may not be able to open the site. Connect the domain at a quiet time, not during peak hours.

### Pinning the addresses {#adresleri-sabitleme}

By default, the store, panel and API addresses are determined automatically from the address of the incoming request. **In production, we recommend pinning them with three variables:**

| Variable | Value | Example |
|---|---|---|
| `STOREFRONT_ORIGIN` | The storefront address | `https://yourstore.com` |
| `ADMIN_ORIGIN` | The panel address (the same address) | `https://yourstore.com` |
| `API_ORIGIN` | The API address (the same address) | `https://yourstore.com` |

1. In the Cloudflare dashboard, go to your Worker's **Settings → Variables and Secrets** (or use the `vars` field in the `wrangler.jsonc` file).
2. Add the three variables **exactly** as an address that starts with `https://` and has no trailing slash.
3. Save and deploy.
4. Sign in to the panel again and try saving a setting.

> [!WARNING]
> After you pin the addresses, if you open the panel from **a different address** (for example the old `workers.dev` address), change actions fail with "The request did not come from an allowed address" and CORS is refused. This is not a bug, it is protection. If you change the address later, update all three variables. For the fix, see [Sign-in problems](/help/troubleshooting#giris-sorunlari).

### Turning off the temporary addresses {#gecici-adresleri-kapatma}

Your store can be reached at both `yourstore.com` and the `...workers.dev` address. Turn off the second one so that it does not show up in search engines as a second copy and the panel is not opened from the wrong address.

* In the Cloudflare dashboard, under the Worker's **Settings → Domains & Routes**, disable the `workers.dev` address and (if present) the **Preview URLs** option.
* If you manage it with the configuration file, turning off the `workers_dev` and `preview_urls` settings in `wrangler.jsonc` gives the same result (to be verified: the current Wrangler configuration documentation).
* Before turning them off, make sure you can sign in to the panel from **your custom domain**; otherwise you may lock yourself out.

> [!TIP]
> Instead of turning off the `workers.dev` address right away, first see the new address work smoothly for a day, then turn it off.

## Secret keys and environment {#gizli-anahtarlar-ve-ortam}

There are two kinds of "secret things":

| What | Where it is kept | Your job |
|---|---|---|
| **Server secrets**: `APP_ENCRYPTION_KEY`, `SETUP_TOKEN`, optional `TURNSTILE_SECRET` | The Cloudflare Worker's secret storage | Entered once at setup; take a backup in a safe place |
| **Integration keys**: iyzico, Trendyol, Geliver, Netgsm... | Panel → **Integrations**; encrypted in the database | You get them from the provider's panel and enter them |

### Server secrets {#sunucu-sirlari}

* `APP_ENCRYPTION_KEY`: The master key that encrypts integration keys. If you lose it, you have to re-enter all the integration keys. Keep it in your password manager; do not share it with anyone. See [Secret keys](/help/security#gizli-anahtarlar).
* `SETUP_TOKEN`: A one-time code for creating the first owner. It cannot be used once the store owner account exists.
* `TURNSTILE_SECRET`: For sign-in bot verification ([Turnstile](term:turnstile)); optional.
* Integration keys are **not** Worker secrets; they are entered from the panel.

### The live environment {#canli-ortam}

Many integrations run their test (Sandbox) and live environments with different keys. Before going live, review **every** integration ([production](term:production)):

| Integration | Check |
|---|---|
| iyzico | **Environment: Live**; the live API key and secret key; make sure your iyzico merchant account is approved |
| Geliver (shipping) | **Test mode (free test shipments)** is off (in test mode, shipments are not real); the sender address ID is correct |
| Trendyol e-Faturam | The service address and user details belong to your live account; the e-Fatura / e-Arşiv series prefixes have been checked |
| Trendyol Marketplace | The seller ID and keys are correct |
| Netgsm / Twilio | The SMS sender name is **approved** at the provider; the country allow-list and daily limits are suitable |
| Cloudflare Email | The sending domain is verified in Cloudflare; Workers Paid may be needed (see below) |
| Meta / Google Analytics 4 | The real Pixel and measurement IDs; the **test event code is deleted** |

Press **Test connection** on every card. Testing is not enough; a real test order is essential.

> [!WARNING]
> Opening a live store with sandbox keys can leave a customer thinking "I paid" while no money moved at all. Check each integration's environment with your own eyes.

![Integrations page](help/en/integrations-hub.png)

## Turning off mock mode {#mock-u-kapatma}

[Mock mode](term:mock) replaces all external services (payments, SMS, email, invoices, shipping, analytics) with an offline fake simulation. Customers see a fake payment page and no money moves. It **must be off** when you take real customers.

Before going live:

1. As the store owner, go to the **Settings → System** tab.
2. Turn off the **Mock mode (demo)** switch and confirm in the window that opens.
3. Confirm that the **Mock inbox** entry in the sidebar has disappeared.
4. In the Cloudflare dashboard, under the Worker's **Variables and Secrets**, **delete** the `ALLOW_MOCK` variable (if it does not exist, it is already off). Without this variable, mock mode can never be turned on on the live site; it is the safest safeguard against turning it on by accident.
5. Deploy the site, then add a product to the cart on the storefront and go to the payment step: the payment page should be **the iyzico page, not a fake one**.

![System tab](help/en/settings-system.png)

Rules about mock mode:

* Only the **store owner** can turn it on and off.
* If `ALLOW_MOCK` is not defined on the server, mock mode cannot be turned on; the panel states this with a warning.
* Mock mode cannot be turned on while a real payment provider (iyzico) is enabled or while there are real paid orders. For the errors, see [Troubleshooting](/help/troubleshooting#sss).
* Orders paid in mock mode have **fake payments**; when mock mode is turned off, these cannot be refunded and unpaid fake orders cannot be completed.
* Before turning it off, you may want to clear the test data (fake orders, test customers); you can keep the products and settings as they are.

> [!DANGER]
> For "orders" that come in while mock mode is on, **no money is taken** from the customer. If you forget to go live and leave mock mode on, customers will look as though they bought something but have not paid. This is the most expensive launch mistake.

## Test order {#deneme-siparisi}

Before going live, **place a real order with your own card** and verify every link in the chain.

1. Choose a real product with a small amount (or create a low-priced test product).
2. Add it to the cart on the storefront and pay.
3. In the panel, under **Orders**, see the order move to the **Paid** status.
4. Confirm that the customer email and (if enabled) the SMS arrived, with the right Turkish characters and the right name.
5. Check that the invoice was issued (or that you can issue it by hand) and came out with the right VAT (KDV) rate.
6. Try creating a shipping label (Geliver).
7. Check that the purchase event arrived in analytics ([Analytics: testing](/help/analytics#test-etme)).
8. **Refund** the order and confirm the money returned to your card ([Refunds](/help/orders#iade)).
9. Cancel / refund the test order and correct the stock.

> [!NOTE]
> When you make a real payment for a test, the payment provider takes a commission, and even after a refund part of it may not come back. These amounts are small, but be aware of them.

## Costs {#maliyetler}

OpenShelf itself is free software, but the services it runs on and uses may cost money. This information is a guide, not a promise.

> [!WARNING]
> **We do not promise "free forever."** Cloudflare and other providers can change their limits and prices whenever they like. We know the core system (the Worker, the D1 database, static files) is designed to fit within Cloudflare's free plans for a small store; this is a design goal, not a guarantee.

| Item | Status | Note |
|---|---|---|
| Cloudflare Workers and D1 | Aimed to fit within the free plans for most small stores | Limits can be exceeded as traffic, product count and order volume grow; the limits are set by Cloudflare and may change |
| The background task that runs every minute ([cron](term:cron)) | Every minute by default | If you hit the free limits, you can lower the frequency (for example to every 5 minutes); the trade-off is that email/invoice retries and the expiry of stock reservations get slower |
| R2 (image storage) | Optional, may be a paid add-on | If you do not use it, images are stored in the database; R2 may require a payment method |
| Queues | Optional, may be paid | Not required for the core |
| Cloudflare Email Service | **Beta**; sending to arbitrary recipients may require the **Workers Paid** plan | On the free plan you can send only to verified addresses; domain verification is needed |
| Domain | Annual fee | Paid to the registrar |
| SMS (Netgsm, Twilio) | Fee per message | Messages with Turkish characters are split into shorter parts and cost more |
| iyzico, shipping, e-Fatura, Trendyol | Their own commissions and fees | See your contract |

To keep costs under control:

1. Set up **billing/usage alerts** in your Cloudflare account.
2. Look at Cloudflare's current limits pages: Workers and D1 limits ([Workers limits](https://developers.cloudflare.com/workers/platform/limits/), [D1 limits](https://developers.cloudflare.com/d1/platform/limits/)).
3. In the [Notifications](/help/store-settings#bildirimler) settings, keep the country allow-list for SMS and the daily per-recipient limits tight; this limits both abuse and cost.
4. Do not turn on SMS unless you really need it; email is enough for most customers.
5. As you grow, look at the usage reports once a month.

## Updates and afterwards {#guncelleme-ve-sonrasi}

* **Take a data backup** before deploying a new version ([Backup](/help/data#yedekleme)).
* In the first week after launch, check the **Orders**, **Integration events** and **Emails** pages once a day; if there are failed jobs, see [Troubleshooting](/help/troubleshooting).
* If you run into trouble, first check the status on the **System** tab and the Integration events.

## Common mistakes {#sik-yapilan-hatalar}

* **Forgetting to turn off mock mode.** (The danger box above.)
* **Forgetting to turn on the search engine switch.** The store never appears on Google.
* **Going live with sandbox keys.**
* **Trying to sign in to the panel from a different address than the one you pinned.**
* **Not deleting the Meta test event code.**
* **Leaving legal texts empty**, or publishing the template without changing it at all.
* **Not storing the `APP_ENCRYPTION_KEY` value anywhere.**
* **Going live without placing a real test order.**
* **Assuming costs will stay fixed.** Monitor the limits and the bill regularly.

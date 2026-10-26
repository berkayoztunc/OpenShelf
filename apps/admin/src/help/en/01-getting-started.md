# Getting started

In this section you will learn what OpenShelf is, how the admin panel is laid out, how to create your first account, how to sign in and protect your account with two-step verification, and how to try the whole system in **mock mode** without opening a single outside account. At the end you will find a short 10-step road map to follow before you open your store to real customers.

You do not have to read the whole guide. The **How do I use this page?** button at the top of every screen takes you straight to the relevant section, and the **?** icons next to form fields briefly explain what the field is, give an example value and point out anything to watch for.

![Admin panel dashboard](help/en/dashboard.png)

## What is OpenShelf and how does it work? {#openshelf-nedir-nasil-calisir}

OpenShelf is an open-source e-commerce system built for small businesses. It has three parts, and all three run at the same address:

| Part | What it does | Address |
|---|---|---|
| **Storefront** | Your public site, where customers browse products, add them to the cart and pay. | `https://yourstore.com/` |
| **Admin panel** | The screen you are looking at now, where you manage products, orders, invoices and settings. Only you and your team can sign in. | `https://yourstore.com/admin/` |
| **Back end (API)** | The part behind the screens that records the order, deducts stock and verifies the payment. You never see it directly. | Automatic |

You do not need to rent or maintain a server. The system runs on Cloudflare as a single application: data lives in Cloudflare's database, [D1](term:d1), and the application code runs in a [Worker](term:worker). For domain, hosting and cost details, see the [Going live](/help/going-live) section.

### The journey of an order {#bir-siparisin-yolculugu}

To understand the system as a whole, let's follow a single order from start to finish. Imagine a customer buys a **Ceramic Vase** (SKU `VASE-S-CREAM`) on your storefront:

1. The customer adds the product to the cart and goes to checkout. At that moment the system briefly **holds** the item ([stock reservation](term:reservation)), so someone else checking out at the same time cannot buy the last remaining vase.
2. The customer enters their card details not on your site but on the payment provider's (iyzico) secure page. Card data never reaches OpenShelf.
3. If the payment succeeds, the order moves to **Paid**; the held stock is permanently deducted and the order is written to the stock ledger as a "sale".
4. In the background the system queues the following: an "Order received" e-mail/SMS to the customer, a "New order" notification to you, an e-Fatura/e-Arşiv invoice (if e-Faturam is on), and advertising measurement events (if Meta/GA4 are on).
5. You prepare the order, create a shipping label and set the status to **Shipped**; the customer is notified along with the tracking number.
6. When it arrives you set the status to **Delivered**. If a refund is needed, you issue it from the order page.

Every link in this chain corresponds to a section of this guide. For details, see [Orders](/help/orders#siparis-durumlari), [Invoices](/help/invoices#otomatik-fatura) and [Integrations](/help/integrations#entegrasyonlari-test-etme).

> [!NOTE]
> Queued jobs ([outbox](term:outbox)) may not run instantly; the system checks them every minute. If a provider is temporarily unavailable, the job is retried several times at longer intervals. A slow SMS provider will never hold up your customer's payment. You can see stuck jobs on the **Integration events** screen.

## Getting to know the admin panel {#yonetim-panelini-taniyin}

The left menu is divided into three groups. If your screen is narrow, the menu is tucked behind the button at the top left.

| Group | Menu item | What it is for |
|---|---|---|
| **Store** | **Dashboard** | Daily/weekly sales, order counts by status, low stock, integration health |
| | **Orders** | Listing orders, details, changing status, refunds, shipping, printing |
| | **Invoices** | Preparing, issuing and cancelling invoices by hand |
| | **Emails** | Writing e-mails to customers from the panel, and the sent log |
| | **Products**, **Categories**, **Coupons** | Catalog management |
| | **Customers** | Customer records, KVKK (Turkish data protection law) anonymisation |
| **Configuration** | **Integrations** | Connections to iyzico, Trendyol, Geliver, e-Faturam, Meta, GA4, Netgsm, Twilio, Cloudflare Email |
| | **Settings** | General, Branding, SEO, Legal texts, Checkout, Tracking, Notifications, System |
| **Administration** | **Users & security** | Your password, two-step verification, sessions, adding users |
| | **Audit log** | Who changed what, and when |
| | **Data export / import** | Export, import, backup |
| | **Help & guide** | This guide |

When mock mode is on, the menu also shows **Mock inbox**, and **Integration events** is there for troubleshooting.

### Three roles {#uc-farkli-rol}

Every user has a role, and the role determines which buttons work:

| Role | What they can do |
|---|---|
| **Owner** | Everything. The only role that can turn mock mode on and off and add or remove users. |
| **Admin** | Products, orders, refunds, issuing invoices, sending e-mails, configuring integrations. Excludes user management and mock mode. |
| **Staff** | Viewing, changing order status, creating shipments, correcting stock, printing. Cannot issue refunds, issue invoices or send e-mails (these buttons appear disabled, and hovering shows the reason). |

You can find the full role breakdown in the [Security](/help/security#kullanicilar-ve-roller) section.

## First-time setup {#ilk-kurulum}

When you install OpenShelf for the first time, there are no admin accounts yet. Because it would be dangerous if anyone could create that account, the system asks for the **one-time setup token** (`SETUP_TOKEN`) you were given during installation. Whoever knows this token becomes the owner of the store.

1. Find the `SETUP_TOKEN` value generated during installation (by the Deploy button or the setup script). The script prints it to the screen **only once** and does not save it. In a local trial, the value is in the `workers/api/.dev.vars` file.
2. Open `https://yourstore.com/admin/setup` in your browser (for a trial, `https://<your-worker-name>.workers.dev/admin/setup`).
3. The **Welcome to OpenShelf** screen appears. Fill in the fields:

| Field | What to enter | Example | Watch out for |
|---|---|---|---|
| **Setup token** | The `SETUP_TOKEN` generated during installation | `3f9a…` (48 characters) | Do not copy any spaces. If it is wrong you will get an "invalid setup token" error. |
| **Name** | Your full name | Jane Smith | This name appears in the audit log. |
| **Email** | The address you will use to sign in | jane@yourstore.com | Use an address you can really access. |
| **Password** | At least 12 characters | a long sentence | Do not use a short, guessable password. |
| **Confirm password** | The same password again | | The two must match. |

4. Click **Create owner account**. You are redirected to the sign-in screen.

The setup token is single-use: the moment the first admin is created, the setup address is locked and can never be used again. Even if someone opens `/admin/setup` later, they are redirected to the sign-in screen.

> [!WARNING]
> Do not share the setup token or send it by e-mail. If you lose the token before the account is created, you can define a new one in the Cloudflare dashboard or with the command `npx wrangler secret put SETUP_TOKEN`.

### Common mistakes (setup) {#sik-yapilan-hatalar-kurulum}

- **"Setup is disabled" error (SETUP_TOKEN not defined):** The Worker has no `SETUP_TOKEN` secret. Complete that step in the installation guide and redeploy.
- **Wrong token:** If you make too many attempts in a short time you are made to wait (at most 5 attempts in 15 minutes). Try again after 15 minutes.
- **"Configuration error (503)":** The encryption key (`APP_ENCRYPTION_KEY`) is missing or invalid. This key protects your provider secrets; generate and define it using the command in the installation guide.
- **Password shorter than 12 characters:** The form warns you; type a longer password.

## First sign-in {#ilk-giris}

1. Open `https://yourstore.com/admin/`. The sign-in screen appears.
2. Fill in **Email** and **Password** and click **Sign in**.
3. If [two-step verification](term:totp) is on for your account, the screen switches to asking for a **Two-factor code**. Type the 6-digit code from the authenticator app on your phone and click **Verify**.

![Sign-in screen](help/en/login.png)

If you enter the wrong password 5 times within 15 minutes with the same e-mail, you will see "Too many attempts. Try again later." This is a security measure that stops someone else from guessing your password. Wait a while and try again with the correct details. The lockout is applied by considering the e-mail and the address you connect from together, so someone else cannot lock you out of your own computer by making attempts remotely.

After signing in you land on the **Dashboard**. Sessions expire after a set time, and you will then need to sign in again. You can see your open sessions on the **Users & security** page.

> [!TIP]
> For sign-in problems, see the [Troubleshooting](/help/troubleshooting#giris-sorunlari) section.

## Two-step verification {#iki-adimli-dogrulama}

To keep your account out of reach even if your password is stolen, use **two-step verification** (TOTP). When you sign in, in addition to your password you are asked for a 6-digit code that an app on your phone generates every 30 seconds.

For the Owner and Admin roles, if you have not turned verification on yet, a yellow warning bar appears at the top of the screen: "Two-factor authentication is required for your role. Set up 2FA on the Security page." This bar cannot be dismissed until you turn verification on. You can use the panel without verification, but this is **strongly recommended**: the panel contains irreversible actions such as payment refunds, issuing invoices and customer data.

### Turning verification on {#dogrulamayi-acma}

1. Install an authenticator app on your phone (such as Google Authenticator, Microsoft Authenticator, Authy or 1Password).
2. Click **Users & security** in the left menu.
3. On the **Two-factor authentication (TOTP)** card, click **Set up 2FA**. A QR code and a text key are shown.
4. In your app, choose "add account / scan QR code" and scan the code (if you cannot scan it, enter the key by hand).
5. Type the 6-digit code shown in the app into the **Code** field and click **Enable**.
6. Verification is on. You will be asked for a code the next time you sign in.

![Security page](help/en/security.png)

> [!WARNING]
> If you lose your phone or delete the authenticator app, you cannot generate codes. The panel has no button to reset a user's verification. For an **Admin**, the fix is for the **Owner** to delete that user on the **Users & security** page and create them again. If the **Owner** loses their own verification, recovery is only possible through the database. For this reason we recommend creating a second admin account and keeping a backup of your authenticator app (for example in your password manager). Turning verification off also requires your password and a valid code.

For details and other security features, see the [Security](/help/security#iki-adimli-dogrulama) section.

## Mock mode {#deneme-modu}

Mock mode (also called demo mode) lets you try your store **without opening any outside account**. Even if you have no payment provider, shipping, invoicing, SMS or e-mail account, you can see how an order moves from start to finish. It is ideal for customer demos, training or first exploration.

In mock mode every outside service is replaced by an offline imitation:

| Area | What happens in mock mode |
|---|---|
| Payment | Instead of the real iyzico page, the customer is sent to a fake payment page at `/mock/pay/…`. The page has **Success**, **Failure** and **Cancel** buttons. No card is charged. |
| SMS and e-mail | Not sent anywhere; recorded in the **Mock inbox**. |
| Invoice and shipping label | A sample PDF is generated and recorded in the Mock inbox. Nothing goes to the tax authority. |
| Advertising and analytics events | Not sent; written to the Mock inbox. |
| Integration forms | Show the same fields as the real ones but need no real key; any keys you enter are ignored. |

Orders paid in mock mode are marked with a **MOCK** badge and are not counted in the real revenue on the **Dashboard** (it is shown separately as "excluded").

### Steps to turn it on {#acma-adimlari}

1. On the live Worker, set the `ALLOW_MOCK` variable to `true`. In the Cloudflare dashboard: **Workers** → your Worker → **Settings** → **Variables and Secrets**. In a local trial this variable is already defined. This step is deliberately required to protect your store: a live Worker refuses to turn on mock mode without `ALLOW_MOCK`.
2. Sign in as the **Owner**.
3. Go to **Settings** → the **System** tab.
4. Turn on the **Mock mode (demo)** switch and confirm in the dialog that opens.
5. **Mock inbox** appears in the left menu.

![System settings and the mock mode switch](help/en/settings-system.png)

### Safety rules of mock mode {#deneme-modunun-guvenlik-kurallari}

These rules are enforced by the system and cannot be bypassed:

- It cannot be turned on if `ALLOW_MOCK` is not defined.
- It cannot be turned on **while a real payment provider (iyzico) is enabled**. You must first turn iyzico off on the **Integrations** screen.
- It cannot be turned on **while there are real paid, in-preparation or shipped orders**. Deliver or complete those first.
- Only the **Owner** can turn it on and off. Every on/off change is written to the **Audit log**.
- The Mock inbox keeps at most 7 days and 2,000 records; the Owner can clear it.
- An order paid in mock mode cannot be refunded while the mode is off (and vice versa). See the [Refunds](/help/orders#iade) section for details.

> [!DANGER]
> **Never** turn on mock mode in a store that serves real customers. Customers are sent to the fake payment page, nobody really pays, yet an order is created. Because "real keys are ignored" while the mode is on, if you forget, your sales will quietly bring in no money.

### Demo tour (10 minutes) {#demo-turu-10-dakika}

1. On the **Settings → Notifications** tab, tick the e-mail box on the "Order paid" row.
2. Open the storefront, add the **Ceramic Vase** to the cart and go to checkout (start the phone number with `+90`).
3. On the fake payment page, press **Success**.
4. In the admin, go to the **Orders** page; the order appears as **Paid** with the **MOCK** badge.
5. Open the **Mock inbox**: you will see the payment, e-mail and (if enabled) invoice/shipping records. Use the **Channel** filter to separate SMS, e-mail, event, invoice, shipment and payment records.

![Mock inbox](help/en/mock-inbox.png)

### Turning mock mode off {#deneme-modunu-kapatma}

Before you start real selling, turn the switch off on the **System** tab and delete the `ALLOW_MOCK` variable from Cloudflare. Once it is off, real integrations are used again with their saved keys; unpaid mock orders can no longer be completed. For the checklist, see the [Going live](/help/going-live#mock-u-kapatma) section.

## First 10 steps {#ilk-10-adim}

Follow this order before opening a new store to real customers. The link next to each step takes you to the relevant section.

1. **Protect your account.** Turn on [two-step verification](/help/security#iki-adimli-dogrulama); if possible, create a second admin account.
2. **Enter your store details.** **Settings → General**: store name, contact e-mail/phone, address, tax number, currency, default VAT (*KDV*) rate. These details appear on invoices and e-mails. → [Store settings](/help/store-settings#genel)
3. **Build your brand.** Logo, favicon, colours, home page banners. → [Branding](/help/store-settings#marka)
4. **Write your legal texts.** KVKK privacy notice, distance sales contract, return terms, cookie and privacy policies. You need to get legal advice. → [Legal texts](/help/store-settings#yasal-metinler)
5. **Add categories and products.** For each product enter photos, a description, SKU, price and stock; set its status to **Active**. → [Catalog](/help/catalog#urun-ekleme)
6. **Set your checkout and order rules.** Stock reservation time, shipping fee, free shipping threshold. → [Checkout](/help/store-settings#odeme-ve-siparis)
7. **Connect iyzico** and try it in **Sandbox** first. → [iyzico](/help/integrations#iyzico)
8. **Connect the other integrations:** shipping (Geliver), invoicing (e-Faturam), e-mail and SMS. Use the **Test connection** button on each. → [Testing integrations](/help/integrations#entegrasyonlari-test-etme)
9. **Set up notifications** and send a test message to your own address. → [Notifications](/help/store-settings#bildirimler)
10. **Place a trial order:** try the payment, shipping label, invoice and refund steps from start to finish; then turn off mock mode and switch to your real keys. → [Going live](/help/going-live#yayin-kontrol-listesi)

> [!TIP]
> The **Integration health** card on the **Dashboard** shows at a glance which connections are working and which are failing. It is a good habit to glance at it every morning.

## How to use the guide and help {#rehber-ve-yardim-nasil-kullanilir}

- **Page guide:** The **How do I use this page?** button at the top of each screen opens the guide section for that screen in a panel that slides in from the right.
- **"?" icons:** These sit next to form fields. They show what the field is, an example and a warning; the "Read in the guide" link takes you to the relevant section.
- **Glossary terms:** Hover over an underlined technical term (for example [SKU](term:sku), [VAT](term:kdv), [webhook](term:webhook)) to see a one-line explanation; click it to open the detailed one.
- **Search:** The search box on the **Help & guide** page searches across all of these sections.

![Help & guide page](help/en/help-page.png)

## Common mistakes {#sik-yapilan-hatalar}

- **Sharing the setup token, or not keeping it.** The token is shown only once; make a note of it and delete the note after you create the account.
- **Putting off two-step verification.** Do not ignore the yellow warning bar.
- **Leaving mock mode on in production.** It looks like you are making sales, but no money arrives. Check the System tab before going live.
- **Working with a single admin account.** If you lose the password or the phone, recovery is hard. Create a second admin account.
- **Switching tabs without saving settings.** Changes are not applied until you press **Save changes** in the save bar below the settings tabs.
- **Leaving legal texts as the ready-made template.** The templates are only a starting point, not legal advice.

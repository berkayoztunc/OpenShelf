# Customers and KVKK

In this section you will learn how to use the customer list, what to do when a customer asks for their personal data to be deleted, how cookie and communication consents are recorded, and how to manage your legal texts. (KVKK is Turkey's personal data protection law, similar in spirit to the GDPR.)

> [!WARNING]
> This section and the ready-made text templates OpenShelf provides are **not legal advice**. Laws, regulator opinions and your business's circumstances all differ. OpenShelf gives you recording and deletion tools; as the store owner, you are responsible for complying with the law. Have a lawyer review your texts before you start taking orders.

## Customers {#musteriler}

The **Customers** page lists the people who have placed an order. When someone places their first order in your store, their record is created automatically; you never need to add customers by hand. During checkout, the customer enters their own email address, name and address details on the order form.

![Customers page](help/en/customers.png)

| Column / button | What it shows or does |
|---|---|
| **Customer** | The name, with the email address below it |
| **Joined** | The date and time the customer's first record was created |
| **Email customer** | Opens a new email composer for the selected customer ([Email](/help/email#e-posta-yazma)) |
| **Anonymize** | Permanently erases the customer's personal data (detailed below) |
| **Anonymized** (badge) | This customer's data has already been erased; no further actions are possible |

In the **Search** field, type part of a name or email address to find a customer (for example `ayse` or `@gmail`). The list is split into pages.

### Who can do what? {#kim-ne-yapabilir}

| Action | Staff | Admin | Store owner |
|---|---|---|---|
| View and search the customer list | Yes | Yes | Yes |
| Send email | No | Yes | Yes |
| Anonymize | No | Yes | Yes |
| Export the customer list | No | Yes | Yes |

For details on roles, see [Users and roles](/help/security#kullanicilar-ve-roller).

### Where does customer data go? {#musteri-verisi-nereye-gidiyor}

When an order is placed, customer details are used and shared for these purposes:

* **Order and delivery:** The name, address and phone number are passed to the carrier so a label can be created.
* **Payment:** The payment page is the payment provider's (iyzico) own page. Card details never reach OpenShelf (a [hosted payment page](term:hostedcheckout)).
* **Invoice:** The buyer's details are passed to the invoicing provider.
* **Notifications:** The email and phone are used only for order update messages.
* **Ad measurement:** If the customer accepted marketing cookies, order information (in a normalized and hashed form) may be passed to Meta ([Analytics and advertising](/help/analytics)).

Cloudflare, the payment provider, the carrier and the advertising platforms may operate outside Türkiye; this may be relevant to KVKK's rules on transfers abroad. Preparing the required notices and texts is your responsibility.

## KVKK and anonymization {#kvkk-ve-anonimlestirme}

[KVKK](term:kvkk) is the law on how you process personal data and on customers' rights (such as the right to information and to ask for deletion). If a customer says "delete my data," you may have a request you need to meet. OpenShelf's tool for this situation is **anonymization**.

### What is anonymization? {#anonimlestirme-nedir}

[Anonymization](term:anonymize) erases a customer's personal information irreversibly, but keeps the order's financial record (amounts, products, dates). The customer can no longer be identified, yet your accounting and tax records stay intact.

### What is erased and what stays? {#ne-silinir-ne-kalir}

| Data | After anonymization |
|---|---|
| The customer's first and last name | Erased |
| Phone number | Erased |
| Email address | Replaced with a meaningless address (`anonymized+…@anonymized.invalid`) |
| Saved addresses | Erased |
| Cookie and communication consent records | Erased |
| The delivery address on orders | Replaced with the word "anonymized" |
| The billing address on orders | Erased |
| The email on orders | Replaced with a meaningless address |
| The IP address and browser details on orders | Erased |
| Ad source details on orders (UTM, `fbclid`, `gclid`, etc.) and separate ad source records | Erased |
| Notes you wrote on orders | Erased |
| Order number, date, products, quantities, amounts, VAT (KDV) | **Stay** |
| Payment records and statuses | **Stay** |
| Issued invoices | **Not changed** (see the warning below) |
| Audit log | Stays; the entry says only "customer anonymized" and the order count, with no personal data |

> [!DANGER]
> Anonymization **cannot be undone**. The erased name, phone number and address cannot be restored in any way; going back even from a backup is not straightforward. Make sure the request really comes from that person, and think once more before you confirm.

> [!WARNING]
> Issued invoices also exist in the invoicing provider's system (for example Trendyol e-Faturam) and must be retained for a certain period under tax law. Anonymization does not change invoices already sent from OpenShelf, the provider's records, or the records of emails already sent. When handling a deletion request, review the status of these records with your accountant and your lawyer.

### Anonymization step by step {#anonimlestirme-adim-adim}

1. Open the **Customers** page and find the customer with **Search**.
2. Press the **Anonymize** button at the right of the row.
3. Read the **Anonymize customer (KVKK)** window carefully. It shows the email address that will be erased.
4. When you are sure, press **Anonymize**.
5. You will see the "Customer anonymized" notification, and the **Anonymized** badge appears on the row.

This action can only be performed by the **Admin** and **Owner** roles.

### What happens after anonymization? {#anonimlestirmeden-sonra-ne-olur}

* If the customer shops again with the same email address, a **brand-new customer record** is created; it is not linked to the old one.
* When you view old orders, a meaningless address appears instead of the customer's name.
* You cannot email an anonymized customer or issue them a new invoice.

### What to do when a deletion request arrives {#silme-talebi-geldiginde-izlenecek-yol}

This is not legal advice, just a suggested general workflow:

1. Get the request in writing and verify the identity of the person making it (for example, by having them write from the email address on the order).
2. Clarify which data must be deleted and which must be kept by law (invoices and accounting records are generally kept).
3. If needed, take a [backup](/help/data#yedekleme) first; but remember that backups will contain personal data too.
4. Anonymize the customer.
5. Notify the customer of the outcome of their request in writing; ask your lawyer about the legal deadlines.
6. Handle copies stored in other systems separately too (the carrier's panel, the invoicing provider, your mailbox, ad accounts).

## Consent records {#onay-kayitlari}

When a visitor makes a choice on the cookie banner, and when a customer gives consent on the checkout page, OpenShelf keeps a **consent record**. These records exist so that you can later answer the question "who agreed to what, and when."

A consent record contains:

| Field | Meaning |
|---|---|
| Visitor ID | A random ID created in the browser (it is not the person's name) |
| Analytics consent | Yes / no |
| Marketing consent | Yes / no |
| Cookie text version | Which version of the text was shown when consent was given |
| IP address | The connection address from which consent was given |
| Date | The time of the record |
| Customer | For consents given during checkout, linked to the customer |

Important points:

* **While the consent requirement is on**, analytics and advertising code does not run until [consent](term:consent) is given. Details: [Cookie consent](/help/analytics#cerez-onayi).
* The preferences a customer chooses while placing their order are also **stored on the order as a summary**. When the purchase event is sent from the server, this summary is checked; if there is no consent, the event is not sent.
* The latest record is the one that counts: if a visitor changes their mind, a new record is added.
* If you change your cookie text significantly, the version number changes and the banner is shown to visitors again.
* When you anonymize a customer, the consent records linked to that customer are erased.
* There is no separate screen in the panel that lists these records; they are kept by the system and can be reached through technical support when needed.

## Communication consents and a note on İYS {#iletisim-izinleri-ve-iys-notu}

OpenShelf sends **transactional notifications only**: order updates such as payment received, shipped, delivered, cancelled and refunded, plus a new-order notification to the admin. There is **no** feature that sends bulk campaigns, discount announcements or advertising emails or SMS.

Sending a customer commercial messages for campaigns or advertising requires separate consent, and matters such as registration in [İYS](term:iys) (Turkey's Commercial Electronic Message Management System) come into play. If you want to do this, use a tool outside OpenShelf and get legal support. Also do not use emails you send from the panel via **Emails → Compose email** for marketing; that screen is for one-to-one correspondence, and it has daily sending limits ([Email sending limits](/help/email#gonderim-limitleri)).

## Legal texts {#yasal-metinler}

On the **Settings → Legal texts** tab, you write the five texts published in your store. Each opens as its own page on the storefront at `/legal/...`.

![Legal texts tab](help/en/settings-legal.png)

| Text | What it is for | Where it appears |
|---|---|---|
| KVKK | The privacy notice explaining how personal data is processed | A link at checkout and in the footer |
| Distance sales | The [distance sales contract](term:distancesales) (mesafeli satış) and pre-contract information | The customer confirms it during checkout |
| Returns | Return, exchange and [right of withdrawal](term:distancesales) terms | A link in the footer |
| Cookies | Which cookies are used and why | A link in the cookie banner |
| Privacy | The privacy policy | A link in the footer |

When writing a text:

1. Select the relevant tab (KVKK, Distance sales, Returns, Cookies, Privacy).
2. To get started, use the **Insert TR template** or **Insert EN template** button. This button **replaces** whatever is in the text field with the template; if you have already written something, keep a copy first.
3. Edit the text with your own details. The text field accepts Markdown (simple formatting).
4. Placeholders in the template such as `{storeName}`, `{contactEmail}`, `{taxId}` and `{address}` are filled in automatically with your store details on the storefront. Remember to fill in those details on the **Settings → General** tab.
5. Save, then open addresses like `/legal/kvkk` on the storefront and check the page.

> [!WARNING]
> The templates are only a starting point. The scope of matters such as the distance sales contract, withdrawal and return periods, the pre-contract information form, the KVKK privacy notice and the cookie text varies by business. Have a lawyer review the texts before you publish them.

The distance sales text **must be shown to the customer and confirmed before payment**. OpenShelf collects this confirmation on the checkout page, and no order is created without it. The content of the text (right of withdrawal, delivery time, return terms, exceptions) is your responsibility. How returns work: [Orders: refunds](/help/orders#iade).

The page for a text you leave empty does not open on the storefront (it shows "Page not found"); so make sure all five texts are filled in before you go live.

### Topics to consider in Türkiye, in general {#turkiye-de-genelde-dusunulmesi-gereken-konular}

This list is not exhaustive and is not a legal opinion; it only reminds you of what to look into:

* **KVKK:** the privacy notice, purposes of processing and retention periods, data subject requests, registration with [VERBİS](term:verbis) (the data controllers' registry) if you exceed the threshold, transfers abroad.
* **Cookies:** prior consent for non-essential cookies.
* **Distance sales:** the pre-contract information form, the contract, the 14-day right of withdrawal and its exceptions, return periods.
* **Invoices:** whether you must issue e-Fatura/e-Arşiv depends on your taxpayer status ([Invoices](/help/invoices)).
* **ETBİS:** a registration obligation for some businesses ([ETBİS](term:etbis), the national e-commerce information system).
* **Commercial messages:** consents for commercial electronic messages.
* **Consumer rights:** showing prices including VAT (KDV), warranty, complaint channels.
* Customers in other countries (for example GDPR in the EU) may be subject to separate rules.

## Common mistakes {#sik-yapilan-hatalar}

* **Publishing the ready-made template without changing it.** The general wording in the template does not fully reflect your business.
* **Leaving legal texts empty.** The pages do not open, and links at checkout may stay broken.
* **Anonymizing the wrong customer.** It cannot be undone; read the email address in the confirmation window carefully.
* **Thinking anonymization also deletes invoices.** Invoices and provider records are separate.
* **Collecting customer data unnecessarily.** Ask for the national ID number (TCKN) only when needed; see [VKN and TCKN](/help/invoices#vkn-ve-tckn).
* **Sending bulk campaign emails from the panel.** That screen is not suited to it; separate consent and a separate tool are needed.
* **Storing backups and exported files insecurely.** These files contain personal data; see [Data export, import and backup](/help/data).
* **Turning off cookie consent.** Do not turn it off before you have clarified your legal position.

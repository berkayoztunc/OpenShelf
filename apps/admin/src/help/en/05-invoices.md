# Invoices

In this section you will learn how an invoice is issued for your orders: the **automatic invoice** after payment, **manual invoices** that stand alone or are tied to an order, the difference between e-Fatura and e-Arşiv, VKN/TCKN details, how VAT (*KDV*) is calculated, and how to cancel an issued invoice. Invoices are **binding documents** under tax law, so we recommend reading the warnings in this section carefully.

> [!DANGER]
> In live mode, **Issue invoice** creates a legally binding e-Fatura/e-Arşiv document that **cannot be edited** afterwards. This guide and the panel are **not legal or financial advice**. Which document you issue to which customer depends on your tax status; consult your accountant. The invoicing integration (e-Faturam) has **not been verified** against a live account: test it with your own account before issuing real invoices ([e-Faturam](/help/integrations#e-faturam)).

Invoices are created in two ways:

| Route | When | Where you see it |
|---|---|---|
| **Automatic invoice** | When a customer pays and the e-Faturam integration is on, the system issues it by itself. | Order page → **Invoices** card |
| **Manual invoice** | You prepare and issue it from the **Invoices** page (or from an order with **Create invoice from this order**). | **Invoices** page |

In mock mode, issuing an invoice produces only an imitation; nothing goes to e-Faturam or the tax authority.

## Automatic invoice {#otomatik-fatura}

When the **e-Faturam** integration is on, after every successful payment the system queues an "issue invoice" job in the background. You do not have to do anything.

### What happens, step by step {#adim-adim-ne-olur}

1. The customer's payment is verified and the order becomes **Paid**.
2. The system adds an **invoice-issuing** job to the queue (if e-Faturam is on). A second job is never added for the same order.
3. When the job runs, the invoice is prepared from the order details:
   - Each product line is added with its **VAT-inclusive** unit price and the product's VAT rate.
   - If there is a shipping fee, a line called "Shipping" is added.
   - If there is a coupon/discount, a line called "Discount" with a negative amount is added.
   - Customer details are taken from the **billing address**, or from the delivery address if there is none; if the customer is marked as a "company" and has entered a tax number, they are treated as a business customer.
4. The invoice type is determined (**e-Fatura** or **e-Arşiv**, see [below](/help/invoices#e-fatura-ve-e-arsiv)).
5. The invoice is sent to e-Faturam; the returned **invoice number** and **document link** are saved on the order.
6. On the **Invoices** card on the order page, the type, number, status and an **Open** link appear.

### The same invoice is never issued twice {#ayni-fatura-iki-kez-kesilmez}

Only one record is kept for each order and invoice-type pair, and every request sent to e-Faturam carries a unique key ([idempotency](term:idempotency)). So no duplicate invoice is created after a network interruption, a retry or pressing the button twice.

### If something goes wrong {#hata-olursa}

If e-Faturam does not respond or rejects the request, the job is retried several times at increasing intervals. Failed attempts appear on the **Integration events** screen; with the **Issue invoice** button on the order page you can queue the job again by hand (the order must be in **Paid** or a later status; pending/cancelled orders are not invoiced).

### Limits of the automatic invoice {#otomatik-faturanin-sinirlari}

- **The automatic invoice is only for website orders.** Trendyol orders may be invoiced through Trendyol's own flows; to avoid issuing double invoices, clarify the scope of your e-Faturam contract.
- Do not turn on the automatic invoice until you have had written confirmation that your e-Faturam contract covers web orders.
- There is no **cancel** button in the panel for automatic invoices. If cancellation is needed, do it from your e-Faturam panel together with your accountant. Cancelling from the panel is available only for manual invoices ([Invoice cancellation](/help/invoices#fatura-iptali)).
- Lines other than the order's products (shipping, discount) are calculated using the VAT rate of the first product. For mixed carts with different rates, prefer a manual invoice.

### Turning off the automatic invoice {#otomatik-faturayi-kapatmak}

The automatic invoice stops when you turn off the e-Faturam integration on the **Integrations** screen. If you do not want invoices issued after payment, keep e-Faturam off and issue all invoices manually.

## Manual invoice {#manuel-fatura}

A manual invoice is one you can tie to an order or prepare completely independently (for example a sale made by phone or from the warehouse). Every invoice starts as a draft; before it is issued, it can be edited freely.

### Creating an invoice from an order {#siparisten-fatura-olusturma}

1. **Orders** → the relevant order (example: **DEMO-1004**).
2. Click the **Create invoice from this order** button at the top.
3. The invoice editor opens filled with the order's details: customer, billing address, product lines (with VAT-inclusive prices), and shipping and discount if any.
4. Check it and correct it if necessary; then **Save draft** or go straight to **Issue invoice**.

### Creating an invoice from scratch {#sifirdan-fatura-olusturma}

1. Click **Invoices** in the left menu, then **Manual invoice** at the top right.
2. Fill in the **Customer** card (see the [VKN and TCKN](/help/invoices#vkn-ve-tckn) section). The **Find existing customer** box looks up a saved customer by name/e-mail/phone and fills in the fields; you can still edit them.
3. On the **Lines** card, type a product name or SKU into the **Add product from catalog** box (example: `VASE-S-CREAM`) and pick it from the list. The price, VAT rate and product name fill in automatically. For an item that is not in the catalog, use the **Add custom line** button.
4. On each line you can edit the **name**, **quantity**, **unit price**, **KDV %** and **discount** fields. Reorder lines with the arrows and delete a line with the bin icon.
5. On the **Options** card, set the **Prices include KDV** switch, the **Currency**, the **Issue date** and the **Notes**.
6. On the **Summary** card on the right, see the subtotal, VAT and grand total, and whether the invoice will be **e-Fatura or e-Arşiv**. Yellow warnings point out anything missing.
7. Use **Preview** to check the calculation made by the server.
8. Save with **Save draft**; when you are ready, press **Issue invoice**.

![Invoice editor](help/en/invoice-editor.png)

![Invoice list](help/en/invoices-list.png)

### Fields {#alanlar}

| Field | What to enter | Example | Watch out for |
|---|---|---|---|
| **Company (e-Fatura candidate)** | Turn on if the customer is a company | On | When on, the VKN and tax office fields appear; it should stay off for an individual customer. |
| **Full name / Company name** (required) | The name/title shown on the invoice | Jane Smith | The trade name must be written in full. |
| **E-mail** | The customer's e-mail | jane@mail.com | Needed to send the invoice by e-mail. |
| **VKN (10 digits)** / **TCKN (11 digits, optional)** | Tax/ID number | 1234567890 | Digits only, 10 or 11 digits. |
| **Tax office (vergi dairesi)** | The company's tax office | Kadıköy | Companies only. |
| **Address** (required) | Billing address | 12 Moda St. | At least 3 characters. |
| **City** (required) | The province | Istanbul | |
| **Item / Description** | The item name shown on the invoice | Ceramic Vase | At most 200 characters. |
| **Qty** | Quantity | 2 | May be a decimal (1.5). |
| **Unit price** | Unit amount | 349.90 | According to the tax-inclusive/exclusive choice. |
| **KDV %** | The line's VAT rate | 20 | If added from the catalog, the product's rate comes in. |
| **Discount** | An **amount** discount applied to the line | 50 | An amount in the currency, not a percentage. Cannot exceed the line amount. |
| **Prices include KDV** | Whether prices are gross | On | See the [VAT calculation](/help/invoices#kdv-hesabi) section below. |
| **Currency** | A 3-letter code | TRY | |
| **Issue date** | The invoice date | 26.10.2026 | Today if empty. |
| **Notes** | A note printed at the bottom of the invoice | VAT exemption explanation | At most 1,000 characters. |

### Preview and warnings {#onizleme-ve-uyarilar}

The **Preview** button shows the calculation made by the server (it is exactly the same as the calculation on screen). The yellow warnings on the Summary card warn you about possible mistakes but do not prevent issuing (except a zero total and a negative line):

| Warning | Meaning |
|---|---|
| Company invoice without a tax number / VKN is not 10 digits | The invoice is issued as **e-Arşiv**. |
| Tax office is empty for a company | Write in the tax office. |
| A 10-digit VKN on an individual customer | You may have forgotten to mark the customer as a "company". |
| Total 0 | The invoice cannot be issued. |
| Line discount exceeds the line amount | The save is rejected. |
| KDV 0% and no note | A VAT exemption explanation (Notes) may be needed. |
| Unit price 0 | Check the line. |
| Customer has no e-mail | You cannot send the invoice by e-mail. |
| Tax number is not an e-Fatura taxpayer | The invoice is issued as e-Arşiv. |

### Issuing the invoice (step by step) {#faturayi-kesme-adim-adim}

1. When all the fields in the draft are valid, press **Issue invoice**. Missing fields are highlighted ("Fix the highlighted fields first").
2. In the **Issue this invoice?** window that opens, read the warnings and this note: "This creates a legally binding invoice via e-Faturam and cannot be edited afterwards."
3. Confirm **Issue invoice**.
4. It takes a few seconds. If it succeeds, the invoice moves to **Issued**, and the number and document link appear.
5. If there is an error (an e-Faturam rejection or failure), the invoice moves to **Failed**; you can fix it and press **Retry issuing**.

### Invoice statuses {#fatura-durumlari}

| Status | Meaning | What you can do |
|---|---|---|
| **Draft** | Not issued yet. | Edit, delete, issue |
| **Issuing** | Being sent to the provider. | Wait. If it gets stuck (more than 5 minutes), it can be retried. |
| **Issued** | The official invoice exists. **Read-only.** | Print, e-mail to the customer, cancel |
| **Failed** | Issuing failed. | Edit, retry |
| **Cancelling** | The cancellation is being sent to the provider. | Wait |
| **Cancelled** | The invoice was cancelled. | None |

An issued invoice has **Print**, **Email to customer** and **Cancel invoice** buttons. The e-mail button opens the compose screen with the recipient and subject filled in and adds the invoice's PDF link ([Writing e-mail](/help/email#e-posta-yazma)).

### Safety and limits {#guvenlik-ve-limitler}

- **A limit of 30 operations per hour:** Each admin account can perform at most 30 invoice issue/cancel operations per hour ("Too many invoice operations (30 per hour). Try again later."). Saving a draft does not count towards this limit.
- **Duplicate protection:** If two people press the same invoice at the same time, only one of them acts ("This invoice is already being issued by another request"); issuing an already issued invoice a second time is blocked ("This invoice has already been issued").
- Issuing, cancelling and drafting invoices are **Admin** and **Owner** permissions; **Staff** can only view.
- An invoice with a zero total cannot be issued.

> [!NOTE]
> The reference sent to e-Faturam is the number of the order the invoice is tied to; if there is no order, the system generates a reference starting with `MAN-`. **e-Faturam assigns the official invoice number**, and it appears in the list after issuing.

## e-Fatura and e-Arşiv {#e-fatura-ve-e-arsiv}

In Turkey there are two types of electronic invoice. The system decides which one to issue on your behalf, looking at the customer's details:

| | **e-Fatura** | **e-Arşiv** |
|---|---|---|
| For whom | **Companies** that are e-Fatura taxpayers | Those who are not e-Fatura taxpayers: **individuals** and consumers |
| Customer details | VKN (10 digits) required | Full name, address; TCKN optional |
| Delivery | Sent to the recipient's e-Fatura system | Given to the customer by e-mail/PDF |
| Label in the panel | **e-Fatura (business)** | **e-Arşiv (consumer)** |

The system decides as follows:

1. If the customer is not a **company**, or has no valid 10-digit VKN: **e-Arşiv**.
2. If it is a company with a 10-digit VKN, and the **Check whether the tax number is an e-Fatura taxpayer** option in the e-Faturam integration is **off**: **e-Fatura**.
3. If the option is **on**, the VKN is looked up among e-Fatura taxpayers: if it is one, **e-Fatura**; if not, or if the lookup fails, **e-Arşiv**.

In the preview and in the **Summary** card in the editor, a badge shows which type the invoice will be issued as. The **e-Fatura series prefix (3 letters)** and **e-Arşiv series prefix (3 letters)** fields in the e-Faturam drawer set the invoice series prefix for each type (for example `ABC`).

> [!WARNING]
> The type in the preview is determined from the provider's result if it can be queried, and from the local rule (company + 10-digit VKN = e-Fatura) if it cannot. Your accountant decides which document is legally required. The system's decision is not legal advice. See also the [e-Fatura](term:efatura) and [e-Arşiv](term:earsiv) glossary definitions.

## VKN and TCKN {#vkn-ve-tckn}

The two numbers are easily confused:

| | **VKN** (Vergi Kimlik Numarası, tax identification number) | **TCKN** (T.C. Kimlik Numarası, Turkish national ID number) |
|---|---|---|
| Digits | 10 | 11 |
| Whose | Companies and tax-paying businesses | Individuals |
| On the invoice | Required for business customers | Optional for individual customers |

See [VKN](term:vkn) and [TCKN](term:tckn) in the glossary, and also [tax office](term:taxoffice).

- **Your own tax number** (the seller's) is entered in **Settings → General → Tax ID**. If you are a sole proprietor you usually enter your TCKN; if you are a company you enter your VKN; consult your accountant.
- The **customer's number** is entered in the editor in the **VKN (10 digits)** or **TCKN (11 digits, optional)** field. The field accepts digits only and cannot exceed 10–11 digits.
- The **tax office** is asked for only with company customers.

> [!TIP]
> If a customer asks for an "invoice in the company's name", turn on the **Company (e-Fatura candidate)** switch and be sure to enter the VKN and tax office. If an 11-digit number is entered in the VKN field, the company invoice is issued as **e-Arşiv**.

## VAT calculation {#kdv-hesabi}

The system stores money amounts in kuruş (whole numbers) and rounds each line separately (0.5 and above rounds up). The calculation on screen is exactly the same as the server's.

The **Prices include KDV** switch sets up two different logics:

### On: prices include VAT (gross) {#acik-fiyatlar-kdv-dahildir-brut}

The unit price you enter is the amount the customer pays; VAT is inside it. The line's VAT is separated out.

Example: **₺349.90** gross, VAT 20%, quantity 1:

- Amount excluding VAT (net) = 349.90 ÷ 1.20 = **₺291.58**
- VAT = 349.90 − 291.58 = **₺58.32**
- Total = **₺349.90**

### Off: prices exclude VAT (net) {#kapali-fiyatlar-kdv-harictir-net}

VAT is added to the price you enter.

Example: **₺291.58** net, VAT 20%:

- VAT = 291.58 × 20% = **₺58.32**
- Total = **₺349.90**

### A discounted line {#indirimli-satir}

The discount is deducted from the line amount. **₺349.90** gross, **₺50** discount, VAT 20%: gross payable ₺299.90 → net ₺249.92, VAT ₺49.98.

### How is it sent to e-Faturam? {#e-faturam-a-nasil-gonderilir}

The unit price e-Faturam expects is the **VAT-inclusive** amount. The system calculates each line's gross amount including discount and VAT and sends that, so the total in e-Faturam equals the total on your screen:

- If the quantity is a whole number and the gross amount divides exactly by the quantity: `quantity × unit gross price`.
- If the quantity is a decimal (1.5) or the amount does not divide exactly: so that no kuruş is lost, the line is sent as **a single line**, with a name in the form "Product (1.5 x)".

> [!WARNING]
> For a line with a VAT rate of **0%**, write the exemption reason in the invoice note (that is the reason for the "KDV 0% and no note" warning). Which rate applies and the exemption conditions are your accountant's responsibility.

## Invoice cancellation {#fatura-iptali}

Only manual invoices in the **Issued** status can be cancelled from the panel.

1. **Invoices** → open the invoice.
2. Click the **Cancel invoice** button on the right (Admin or Owner).
3. Confirm in the confirmation window that opens ("Cancel this invoice?").
4. The system passes the cancellation request to e-Faturam. If it succeeds, the invoice becomes **Cancelled**.
5. If the provider rejects the cancellation, the invoice stays **Issued** and an error message is shown.

> [!DANGER]
> Under tax law, invoice cancellation is subject to different rules depending on the type of document (e-Fatura/e-Arşiv), the recipient's status and the time elapsed. You may need to issue a **return invoice** instead of cancelling. Cancellation counts towards the limit of 30 operations per hour. Consult your accountant before cancelling from the panel.

- Making a refund (returning money) does **not automatically cancel** the invoice. It is a separate operation ([Refunds](/help/orders#iade)).
- For order invoices issued automatically there is no cancel button in the panel; do it from your e-Faturam panel.

## Common errors {#sik-hatalar}

| Symptom | Cause | Fix |
|---|---|---|
| **"No invoicing provider is enabled"** | The e-Faturam integration is off or was never set up. | Configure and turn on e-Faturam under **Integrations**. Or turn on mock mode to try things out. |
| **"The invoice total is zero"** | All lines are ₺0 or the discount exceeds the line. | Correct the price/discount. |
| **The invoice came out as e-Arşiv, I expected e-Fatura** | Company is not ticked, the VKN is not 10 digits, or the customer is not an e-Fatura taxpayer. | Verify the customer details and taxpayer status. |
| **"Too many invoice operations"** | The limit of 30 operations per hour. | Wait a while. |
| **Invoice is in the "Failed" status** | e-Faturam rejected the request or could not be reached (wrong username/password, wrong service URL, a customer/source outside the contract scope). | Read the error message; test the e-Faturam connection with **Test connection**; fix it and **Retry issuing**. |
| **Two invoices for the same order** | Both an automatic invoice and a manual invoice were issued. | Before creating a manual invoice from an order, check on the **Invoices** card whether the automatic invoice was issued. |
| **Mistaking the invoice copy for the official one** | **Print → Invoice copy** is informational. | The official document is the PDF in e-Faturam. |
| **Wrong VAT rate** | The catalog rate is different, or it was entered wrongly on a custom line. | Check the lines and the **Summary** before issuing. |
| **The invoice is issued and I want to correct it** | An issued invoice cannot be edited. | Consult your accountant about cancellation (if possible) or a correction document. |

For other invoice problems, see the [Troubleshooting](/help/troubleshooting#fatura-sorunlari) section.

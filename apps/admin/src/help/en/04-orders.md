# Orders

In this section you will learn an order's life cycle from start to finish: order statuses and what each transition does to stock, money and customer notifications; the order detail page; how a payment is verified; full and partial refunds; creating shipments; the notifications sent to customers; printing labels and packing slips; and orders that arrive from Trendyol. In the examples we will follow order **DEMO-1004** (1 **Ceramic Vase**, `VASE-S-CREAM`, ₺349.90).

Click **Orders** in the left menu. The list shows the newest order at the top.

![Order list](help/en/orders-list.png)

| Item | What it does |
|---|---|
| **Search** | Searches by order number or customer e-mail (`DEMO-1004`, `jane@…`). |
| **Status** filter | Shows only orders in the selected status. |
| **Source** filter | Separates **Website** or **Trendyol** orders. |
| Row checkboxes | Select several orders; from the bar that appears at the bottom, print in bulk with **Print labels (N)**, **Packing slips (N)** or **Invoices (N)** (invoice copies). |
| **MOCK** badge | An order created in mock mode (fake payment). See [Mock mode](/help/getting-started#deneme-modu). |

If you click a status in the "Orders by status" bar on the **Dashboard**, you land on this list with that filter applied.

## Order statuses {#siparis-durumlari}

Every order is in one of eight statuses, and only the allowed transitions can be made. The system does not allow an invalid transition (it shows a warning that the status change is not possible).

```
Pending → Awaiting payment → Paid → Fulfilling → Shipped → Delivered
     └────────────┴───────────→ Cancelled        (can also be cancelled from Paid / Fulfilling)
       Paid · Fulfilling · Shipped · Delivered ───→ Refunded
```

| Status | Meaning | Who/what sets it | Possible next statuses |
|---|---|---|---|
| **Pending** | The order record was opened; the customer has not gone to payment yet. | System | Awaiting payment, Cancelled |
| **Awaiting payment** | The customer was sent to the payment page; stock is held ([reservation](term:reservation)). | System | Paid, Cancelled |
| **Paid** | The payment was verified. Stock was permanently deducted. | **Only the payment flow** | Fulfilling, Refunded, Cancelled |
| **Fulfilling** | You are preparing the order. Moves to this status automatically when you create a shipment. | You / shipment creation | Shipped, Refunded, Cancelled |
| **Shipped** | The parcel was handed to the carrier. | You | Delivered, Refunded |
| **Delivered** | The customer received it. | You | Refunded |
| **Cancelled** | The order is cancelled. A final status. | You / the system when the reservation time runs out | (none) |
| **Refunded** | The whole payment was refunded to the customer. A final status. | **Only the refund flow** | (none) |

> [!NOTE]
> You cannot choose the **Paid** and **Refunded** statuses by hand; they are the result of payment and refund operations ("Paid" and "Refunded" are set automatically by payments and refunds). That way an order can never be shown as "paid" without a money movement.

### What happens at each transition? {#her-geciste-ne-olur}

| Transition | Stock | Notification to the customer | Other |
|---|---|---|---|
| Awaiting payment → **Paid** (automatic) | The reserved units are permanently deducted | **Order paid** (if the setting is on) + **New order** to you | If e-Faturam is on, an invoice-issuing job is queued; if Meta/GA4 are on, the purchase event is sent |
| Paid → **Fulfilling** (automatic when a shipment is created) | Unchanged | None | |
| Fulfilling → **Shipped** | Unchanged | **Order shipped** (with the tracking number) | |
| Shipped → **Delivered** | Unchanged | **Order delivered** | |
| Pending / Awaiting payment → **Cancelled** | The reserved units are released, the coupon use is returned | **None** (silent cancellation) | |
| Paid / Fulfilling → **Cancelled** | The units are **added back** to stock | **Order cancelled** | **Money is not refunded automatically.** To give the customer their money back, make a separate **Refund**. |
| Any paid status → **Refunded** (full refund) | **Unchanged** (not increased automatically) | **Order refunded** | If the product came back to you, increase the stock by hand |

> [!WARNING]
> Setting a paid order to **Cancelled** does not refund the money; it only puts the stock back. For the customer to get their money, make a separate **Refund** on the order page. Refunding first (a full refund) already puts the order in the **Refunded** status.

### Changing the status (step by step) {#durumu-degistirme-adim-adim}

1. Open the order detail page.
2. On the **Status** card on the right, only the allowed next statuses appear as buttons.
3. Click the relevant button (example: **Shipped**).
4. In the confirmation dialog, confirm the question "Move order to "Shipped"?". The cancel button is red.

If there are no buttons on the Status card, it says "Final state."

### Reservation time and automatic cancellation {#rezervasyon-suresi-ve-otomatik-iptal}

When a customer goes to payment, stock is held for the number of minutes set in **Settings → Checkout → Stock reservation (minutes)** (15 by default). If the time runs out and no payment has arrived, the system (with a check that runs every minute) sets the order to **Cancelled** on its own and releases the stock. You do not have to do anything.

### Common mistakes {#sik-yapilan-hatalar}

- **Setting "Shipped" without shipping:** The customer receives a notification with no tracking number. Create the shipment first.
- **Setting "Cancelled" and forgetting to refund:** The customer's money stays in your account.
- **Marking Delivered too early:** It cannot be undone; the only way forward is a refund.
- **Mistaking mock orders for real ones:** Watch for the **MOCK** badge.

## Order details {#siparis-detayi}

![Order detail page](help/en/order-detail.png)

Clicking an order in the list opens the detail page. The header contains the order number (**Order #DEMO-1004**), the date, and the customer's name and e-mail.

### Action buttons at the top {#ustteki-islem-dugmeleri}

| Button | What it does | Who can use it |
|---|---|---|
| **Refund** | Opens the **Refund order** window. Appears only in paid statuses (Paid, Fulfilling, Shipped, Delivered). | Admin and Owner |
| **Create shipment** | Creates a shipment and label through Geliver. | Everyone |
| **Issue invoice** | Queues the job of issuing the order's invoice through e-Faturam (manually, if automatic invoicing is off). | Everyone |
| **Create invoice from this order** | Opens a ready draft on the **Invoices** page prefilled with the order's details; you can edit the price and lines. See [Manual invoice](/help/invoices#manuel-fatura). | Writing the draft: Admin and Owner |
| **Email customer** | Opens the compose screen with the recipient and subject filled in. See [Writing e-mail](/help/email#e-posta-yazma). | Sending: Admin and Owner |
| **Print** | A drop-down menu: **Shipping label**, **Packing slip**, **Invoice copy**, **Order summary**. | Everyone |

### Cards {#kartlar}

| Card | Contents |
|---|---|
| **Items** | Lines: product name, SKU, quantity, unit price, line total and, at the bottom, **Total**. |
| **Payments** | Provider (iyzico), status (Pending / Succeeded / Failed / Refunded), amount, date. A **MOCK** badge if it is in mock mode. |
| **Shipments** | Carrier, tracking number, status, label link. |
| **Notifications** | The e-mail/SMS records sent for this order. See [Order notifications](/help/orders#siparis-bildirimleri). |
| **Invoices** | Type (e-Fatura / e-Arşiv), number, status, document link. |
| **Status** | The current status and the allowed next-status buttons. Shows the order source (Website / Trendyol). |
| **Timeline** | A chronological list of everything that happened on the order: payment events, status changes, refunds, shipping and invoice events. This is where you follow what was done, when, and by whom. |

> [!TIP]
> When a customer asks "what is the status of my order?", look first at the **Timeline** and the **Notifications** card: whether the payment arrived, whether the shipment was created, whether a message went to the customer, it is all there.

## Payment verification {#odeme-dogrulama}

Customers enter their card details not on your site but on the payment provider's (iyzico) **hosted payment page** ([hosted checkout](term:hostedcheckout)). Card data never reaches OpenShelf or your server. When the payment ends, the result reaches you in two separate ways:

1. **Browser return (callback):** The customer returns to your site after paying. The system does not trust what the browser says: it asks the payment provider again **server to server** to query the payment.
2. **Notification (webhook):** iyzico also reports the payment result via a [webhook](term:webhook). The webhook's signature is verified; forged notifications are rejected.

An order becomes **Paid** only after these checks pass:

- The payment's **amount and currency** are exactly the same as the amount expected on the order.
- The signature/query verification succeeds.
- If the same notification arrives a second time, it is ignored (the same payment is never processed twice).

### Unexpected situations {#beklenmedik-durumlar}

| Situation | What happens | What you do |
|---|---|---|
| **Amount mismatch** | The order does not become **Paid**; an error is written to the **Integration events** screen ("amount/currency mismatch"). | Examine the payment in the iyzico panel; contact the customer if needed. |
| **Instalment commission difference** | iyzico may increase the amount paid on instalment payments. If **Allow installment commission** on the iyzico card is off, the payment is rejected. | If you offer instalments, turn this option on deliberately; confirm in your iyzico contract who bears the commission. |
| **Late payment** | The customer completes the payment after the reservation time has run out and the order is **Cancelled**. The order is not reopened; the event is written to **Integration events** with a "manual refund needed" warning. | Refund the payment from the iyzico panel or the order page and inform the customer. |
| **Payment failed** | The payment becomes "Failed"; the order stays in **Awaiting payment** and is cancelled when the time runs out. | Nothing needed; the customer can try again. |

> [!NOTE]
> Keeping the reservation time very short raises the chance of a "late payment". 15–30 minutes is a sensible range.

For payment problems, see the [Troubleshooting](/help/troubleshooting#odeme-sorunlari) section.

## Refunds {#iade}

A refund means giving money back to the customer. **Admins** and the **Owner** can do it; **Staff** cannot.

### Full or partial refund (step by step) {#tam-veya-kismi-iade-adim-adim}

1. Open the page of a paid order (in the **Paid**, **Fulfilling**, **Shipped** or **Delivered** status).
2. Click the **Refund** button at the top.
3. In the window that opens, enter the amount to refund in the **Amount (TRY)** field (a hint below the field shows the order total, for example ₺349.90). For a full refund, enter the whole order amount.
4. Write a short justification in the **Reason** field ("Customer changed their mind", "Arrived damaged"). The button does not work until the amount and the reason are filled in.
5. Press the red **Refund** button at the bottom of the window.

### What happens in the background? {#arka-planda-ne-olur}

1. The system checks that the total, together with previously refunded amounts, **does not exceed the amount paid** (a "refund is more than what was paid" error). This check is safe even when two refund requests are made at the same time.
2. A refund request is sent to the payment provider (iyzico). If the provider rejects it ("the payment provider rejected the refund"), the record is stored as **failed**, your order does not change and it is not counted in the total refunded.
3. If it succeeds, a refund record is created and written to the **Audit log**.
4. For a **partial refund** the order status does not change (it stays in the paid status); you can make another refund on the same order later.
5. For a **full refund** (when the total of successful refunds reaches the amount paid): the payment becomes **Refunded**, the order moves to the **Refunded** status and an **Order refunded** notification goes to the customer (if the setting is on). For details, see the [refund](term:refund) definition.

> [!DANGER]
> A refund is a real money-return instruction to the payment provider and **cannot be undone**. Check the amount twice before submitting. How long the refund takes to show on the customer's card depends on the bank and iyzico; OpenShelf does not control this time.

### Mock/real mismatch (the `mock_mismatch` rule) {#mock-gercek-uyusmazligi-mockmismatch-kurali}

The system records whether a payment was real or fake. For safety:

- A **payment made in mock mode (fake)** cannot be refunded **while mock mode is off**: "This payment was made in MOCK mode (no real money moved); it cannot be refunded while mock mode is off. Turn on mock mode to refund."
- A **real payment** cannot be refunded **while mock mode is on**: "This is a REAL payment; it cannot be refunded while mock mode is on. Turn off mock mode first." (Otherwise the fake adapter would act as if it had refunded.)

This rule prevents a "refunded" record from being created without a money movement.

### Other notes on refunds {#iade-ile-ilgili-diger-notlar}

- **Cancelling the invoice is a separate operation.** A refund does not automatically cancel an issued invoice; see the [Invoice cancellation](/help/invoices#fatura-iptali) section and consult your accountant.
- **Stock does not increase automatically.** If the product came back to you, correct the stock by hand on the **Products** screen ([Stock](/help/catalog#stok-ve-stok-defteri)).
- **Trendyol orders** cannot be refunded from OpenShelf; Trendyol manages the payment (a "no successful payment to refund" error).
- An order can be refunded only if the payment provider supports refunds.

## Shipping {#kargo}

After you pack the order, you create a shipment from the order page. For this, the **Geliver** integration must be on and configured (see [Geliver](/help/integrations#geliver)). To create a shipment, the order must be in the **Paid** or **Fulfilling** status (the order must be paid before shipping).

### Creating a shipment (step by step) {#kargo-olusturma-adim-adim}

1. On the order page, click **Create shipment**.
2. In the **Carrier service ID** field, enter the service ID from the quote Geliver gave you (hint: "the service/quote ID from your shipping integration (Geliver)"). In this version the quote list is not shown in this window; you need to get the code from your Geliver panel or from the price list in Geliver's documentation.
3. Press **Create**.
4. The system gets the shipment and label from Geliver; the carrier, tracking number and label link appear on the **Shipments** card. If the order is **Paid**, it moves to **Fulfilling** automatically.
5. Print the label and hand the parcel to the carrier (see [Printing](/help/orders#yazdirma)).
6. Once the carrier has collected it, set the order status to **Shipped**; the customer is notified with the tracking number.
7. When delivery takes place, move it to **Delivered**.

### If you shipped outside Geliver {#kargoyu-geliver-disinda-yaptiysaniz}

If you made the shipment another way (for example at a carrier branch), you do not have to use **Create shipment**. However, an order in the **Paid** status cannot go directly to **Shipped**: first move it to **Fulfilling**, then to **Shipped**. In this case, since the system has no tracking number, the customer notification cannot include one; you can pass the tracking number on by hand with **Email customer**.

### Parcel weight and dimensions {#paket-agirligi-ve-olculeri}

The system uses each product's weight for the shipment. Because the product form has no weight field, **500 grams per unit** is assumed for products with no defined weight; dimensions are assumed to be 10×10×10 cm by default. If your real weights differ, the shipping fee may come out different from what you expect. Make sure **Test mode** in the Geliver drawer is **off** in production (otherwise free test shipments are created and parcels are not passed on to a real carrier).

> [!WARNING]
> The label fee is charged by the carrier/Geliver; use Geliver's **Test mode** setting to create trial shipments, and turn it off for real parcels. In mock mode, no real shipment is created at all.

### Common mistakes (shipping) {#sik-yapilan-hatalar-kargo}

- **"No shipping provider" error:** The Geliver integration is not on. Turn it on under **Integrations** and test the connection.
- **Empty sender address ID in Geliver:** The shipment is not created. See [Geliver](/help/integrations#geliver).
- **Missing/wrong recipient phone or address:** The label is rejected; check the customer's address on the order.
- **Entering the service ID wrongly:** A Geliver error comes back; get the correct code from the quote list.

## Order notifications {#siparis-bildirimleri}

As the order status changes, an e-mail and/or SMS goes to the customer. Which channel runs on which event is set under **Settings → Notifications** ([detailed explanation](/help/store-settings#bildirimler)). This section explains how to monitor what was sent for an order.

The **Notifications** card on the order page lists every send attempt:

| Column | Meaning |
|---|---|
| **Event** | Which event (order paid, shipped…) |
| **Channel** | SMS or e-mail |
| **To** | A partially masked e-mail address or phone number |
| **Status** | **Sent**, **Failed**, **Skipped** or **Pending** |
| **When** | When it happened |

The reason for a **Skipped** status is written on the card. The most common reasons:

| Reason | What it means | Fix |
|---|---|---|
| No provider | The channel's provider (Netgsm/Twilio/Cloudflare Email) is not on in **Integrations**. | Turn the provider on. |
| No recipient / invalid recipient | The e-mail or phone is missing or wrong on the order form. | Get it from the customer; write by hand with **Email customer**. |
| Country not allowed | An SMS to a number that is not in the allowed countries list. | Add it to the **SMS allowed countries** list under **Notifications**. |
| Daily limit | The upper limit for the same recipient in the last 24 hours was reached. | Raise the limit under **Notifications**. |

Failed sends are retried up to 8 times at increasing intervals. You can see permanently failed jobs on the **Integration events** screen. For each event, a message is sent to the same channel only once per order (it is not sent again).

> [!NOTE]
> No notification is sent to the customer for orders cancelled before payment. Messages in mock mode appear in the **Mock inbox**.

## Printing {#yazdirma}

The **Print** menu on the order page, or the bulk bar on the order list, opens documents to print from the browser. On the print screen, choose **Print** from the toolbar at the top and select your printer in your browser's print window.

![Shipping label preview](help/en/order-print-label.png)

| Document | Paper | Contents |
|---|---|---|
| **Shipping label** | **100 × 150 mm**, one label per page (for a thermal label printer) | Sender (your store), recipient name/phone/address, carrier, **barcode** (the tracking number; the order number if there is none), order no., quantity, date |
| **Packing slip** | A4 | Product name, SKU and quantity. **Contains no prices** (so prices are not visible in the parcel going to the customer). If you tick the **Show prices** box, prices are added too. |
| **Invoice copy** | A4 | A breakdown of the order in invoice format. **For information only; not an official invoice.** |
| **Order summary** | A4 | A one-page summary of the order |

![Invoice copy preview](help/en/order-print-invoice.png)

> [!WARNING]
> **The invoice copy is not an official document.** At the bottom it says "Informational copy — the official e-Fatura/e-Arşiv document is the one issued through e-Faturam." The legal document you must give the customer is the invoice issued through e-Faturam; you can open its link from the **Invoices** card.

### Label printing tips {#etiket-yazdirma-ipuclari}

1. In the printer window choose a paper size of **100 × 150 mm**, with margins set to **None** and the scale at **100%**.
2. If the barcode does not scan, increase the printer quality and keep the scale at 100%.
3. If there is no tracking number, the label says "No tracking yet" and the barcode is generated from the order number; first get the real tracking number with **Create shipment**.
4. To print several orders at once, tick the boxes in the list and use the **Print labels (N)** button at the bottom.

## Trendyol orders {#trendyol-siparisleri}

If you have turned on the **Trendyol** integration, your orders on Trendyol also land in the **Orders** list. You can separate them with the **Source: Trendyol** filter. For setup, see the [Trendyol](/help/integrations#trendyol) section.

- Orders are fetched automatically **about every 5 minutes** (they also arrive instantly if you use the webhook). The order number starts with `TY-`.
- Each Trendyol order is imported only once; fetching it again does not duplicate it, it only updates its status.
- Product lines are matched to variants in your store by SKU/barcode. The stock of a matching variant is automatically **deducted** ("Trendyol sale"). A line that does not match is saved without deducting stock, and a warning is logged; keep SKUs the same as on Trendyol.
- Trendyol statuses are translated into OpenShelf statuses (for example "Created" → **Paid**, "Shipped" → **Shipped**, "Delivered" → **Delivered**, "Cancelled" → **Cancelled**). This mapping has not been verified against Trendyol's current status dictionary; compare the results with your own panel.
- Because the payment is collected on Trendyol, **refunds cannot be made from OpenShelf** for these orders; manage refunds from the Trendyol panel.
- Shipping and Trendyol Express: OpenShelf **does not assume or implement** Trendyol's special shipping flow. Manage shipping information in your Trendyol seller panel.
- **Avoid issuing the invoice twice:** For Trendyol orders, Trendyol may offer its own invoicing flows. Before turning on e-Faturam, be clear about which orders are invoiced through which route ([e-Faturam](/help/integrations#e-faturam)).

> [!WARNING]
> Some of the Trendyol integration's endpoints and field names have **not been verified** against Trendyol's current documentation. Before going live, try it with a small number of real products, and compare **Integration events** with the Trendyol panel.

## Common mistakes {#sik-yapilan-hatalar-1}

- **An order stayed in "Awaiting payment" and the customer says they paid:** First check the payment in the iyzico panel, then look for errors in **Integration events**. If needed, see [Troubleshooting](/help/troubleshooting#odeme-sorunlari).
- **No notification went to the customer:** Look at the reason on the **Notifications** card (no provider, country permission, daily limit).
- **Confusing cancellation with a refund:** Cancelling puts stock back; a refund gives money back.
- **Forgetting the invoice:** If automatic invoicing is off, use **Issue invoice** or the **Invoices** page ([Invoices](/help/invoices)).
- **Printing the label at the wrong size:** Choose 100 × 150 mm.

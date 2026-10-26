# Trendyol console

The **Trendyol console** is the **Trendyol console** page of the admin panel (in the left menu, between **Integrations** and **Settings**). It lets you do the day-to-day work with your [marketplace](term:marketplace) account in one place: look at products and send new ones, see recent sales, approve or reject returns, answer customer questions and read the account statement. Underneath all of it sits an **API explorer**: you can try every one of the 83 operations of Trendyol's public marketplace API by filling in its parameters.

This page is open **only to the owner and admin roles**. Orders and returns contain customers' personal data, so the staff role cannot see it.

> [!NOTE]
> The console is separate from your store's own Trendyol integration (stock/price push, order import). For setting up the integration see [Integrations](/help/integrations#trendyol); how Trendyol orders reach your order list is explained in [Trendyol orders](/help/orders#trendyol-siparisleri).

## Connection and mock mode {#baglanti-ve-mock}

The coloured bar at the top of the page tells you what you are talking to. There are three states:

| Bar | Meaning |
|---|---|
| **Simulation** (red) | [Demo mode (mock)](term:mock) is on. **No request goes to Trendyol**; the system produces the responses offline and never touches your real store. |
| **Live** (green) | The integration is enabled and keys are entered. Requests really go to Trendyol. Next to it you see the environment (**Production** or **Stage**) and your masked [Seller ID](term:sellerid). |
| **Off** (yellow) | The integration is not configured yet or is switched off. Buttons: **Configure in Integrations** and (owner only) **Turn on Mock mode**. You can browse the operations and see the curl command but cannot send requests. |

![Trendyol console: simulation bar and the Explorer tab](help/en/trendyol-explorer.png)

### What happens in mock mode?

* You see realistic **demo data** for products, orders, returns and questions. A record you create shows up in the next listing; status changes stick (for example a return you approve stays approved).
* In mock mode the **API key and secret are never read**; even if they are saved, these screens do not use them. There is no access to your real account.
* To return the data to its starting state use **Reset simulation** (owner only). The demo records you created are deleted.
* You turn mock mode on or off with the **Mock mode (demo)** switch in **Settings → System** (see [Demo mode](/help/getting-started#deneme-modu)).

> [!TIP]
> If you are new, first walk through every tab in mock mode, try the product wizard and the return rejection form. Enter real keys only after you have seen what you are doing.

### Working with real keys

For live work, enter the [Seller ID](term:sellerid), [API key](term:apikey) and [API secret](term:secret) under **Integrations → Trendyol → Configure**, and keep mock mode off. The keys are stored encrypted and are not shown again. On every request the console adds the `User-Agent: <seller id> - SelfIntegration` header that Trendyol requires, plus Basic authentication; you never type either by hand.

## Stage and live environment {#stage-ve-canli}

The **Environment** field on the integration screen has two values: **Production** (default, your real account) and **Stage (test)**. The [stage environment](term:stage) is a separate Trendyol server; nothing you do there affects your real products, orders or money.

> [!WARNING]
> Three things to know before using stage. (1) Trendyol does not answer from stage until your outgoing **IP address is allow-listed**; a **503** error means "your IP is not allowed". (2) Stage uses **different API credentials** from production; your live keys do not work there. (3) Stage is not open to everyone; Trendyol decides access and server addresses. Verify the current conditions in Trendyol's integration documentation and with seller support.

In the **live** (production) environment write operations change real data. That is why the console asks for confirmation on every write and irreversible operation in live mode (see [Risky operations](#riskli-islemler)). Even in simulation and on stage, stay careful; do not act without checking the colour of the bar.

**Rate limit:** Trendyol accepts **50 requests per 10 seconds** per endpoint; if you exceed it Trendyol answers "too many requests" (429). The console does not retry on its own; wait a few seconds and try again. Some product operations also have per-minute limits; the **Rate limit** line on the operation shows it.

## Products {#urunler}

The **Products** tab shows your Trendyol catalogue in four sub-tabs: **Approved**, **Pending approval**, **Archived** and **Mappings**.

![Products tab](help/en/trendyol-products.png)

In the **Filters** card you search by **Barcode**, **Product title**, **Stock code** and **Sale status**; the **Limit by modification date** box adds a date range (90 days at most). The list shows the image, product, [barcode](term:barcode), stock, list price, sale price, sale and approval status, brand and category. **Product title** only searches the page on screen.

Each row has small action icons on the right (the name appears on hover):

* **Send stock and price:** edit the stock and price fields in the row and send. Only the values you changed are sent. Stock must be a whole number between 0 and 20,000; the sale price cannot exceed the list price.
* **Archive / Unarchive:** takes the product off sale or brings it back.
* **Delete:** permanently deletes the product from Trendyol; Trendyol only allows unapproved products to be deleted.
* **Buybox status:** shows your rank and the [buybox](term:buybox) prices.
* **Link to a local variant** and a **raw data** (JSON) view.

> [!NOTE]
> Stock and price updates are **asynchronous**: Trendyol does not answer immediately, it returns a [batch request id](term:batchrequest). The **Batch result** panel at the top of the page polls the result every 2 seconds on its own; the result shows **Succeeded** or **Failed** for each item with the reason. You can ask manually with **Check now**. Trendyol rejects the same stock/price request repeated within 15 minutes; the app never retries on its own.

### Mappings

The **Mappings** sub-tab (**Local variant mappings**) links a Trendyol barcode to a variant in your store. A mapped variant can have its stock and price sent to Trendyol and its Trendyol listing is switched on. Add one with **Add mapping** or with the link icon on a product row. Deleting a mapping switches the Trendyol listing off; the product on Trendyol is not deleted.

## Create-product wizard {#urun-olusturma-sihirbazi}

The **Add a product to Trendyol** button opens a four-step wizard:

1. **Local product:** pick a variant from your store (search by name, SKU or barcode). Its name, description, images, price and stock become the defaults.
2. **Trendyol fields:** brand (searched once you type 2 letters), only lowest-level categories, title (100 characters at most), barcode (40 at most), stock code, model code, VAT rate (0, 1, 10 or 20), stock, list and sale price, carrier, dimensional weight, description and up to 8 images. Once you choose the category, **Category attributes** appear; required ones are starred.
3. **Preview:** shows the **Request body (JSON)** that will go to Trendyol. You can edit it before sending and go back with **Rebuild from the form**. Problems found against the catalogue rules are listed.
4. **Submit:** **Send to Trendyol** sends the request. The result is asynchronous; the product stays under **Pending approval** until Trendyol approves it, and the rejection reason shows up in the batch result.

![Create-product wizard](help/en/trendyol-wizard.png)

> [!WARNING]
> Image addresses must be public `https://` URLs. Trendyol cannot download addresses such as `localhost` and the product is rejected. Trendyol's category and attribute rules belong to Trendyol; the console's checks are only a helper, Trendyol does the real validation.

## Recent sales {#son-satislar}

The **Recent sales** tab lists [shipment packages](term:shipmentpackage). Trendyol allows a window of at most **2 weeks** for this list; if you exceed it, the request is not sent and a warning appears. Quick ranges: **Today**, **Last 3 days**, **Last 7 days**, **Last 14 days**. You can filter by **Status** (if none is selected, all are listed) and by **Order number**. The **Summary** cards (**Packages**, **Gross revenue**, by status, top products) are computed from the page on screen only.

![Recent sales and the order drawer](help/en/trendyol-orders.png)

Opening a row slides in a drawer from the right:

* **Customer and addresses:** the customer's name, email, phone and addresses. This section holds **personal data**; use it only to fulfil the order.
* Items, package total, carrier, **Tracking no**, **Deci** and **Boxes**, **Package history**.
* **Actions → Status flow:** only **Mark as preparing** and **Mark as invoiced** are reported to Trendyol; shipping and delivery move on by themselves. Mark the package as preparing first, then type the **Invoice number** and mark it invoiced.
* **Send invoice link:** the `https` link of the e-Invoice/e-Archive PDF (it must stay reachable for 8 years).
* **Tracking info (own delivery):** if you ship with your own carrier instead of Trendyol's, report the tracking link or a phone number.
* **Box info and shipping label:** **Save deci/boxes**, **Create label**, **Show label**. The [common label](term:commonlabel) is created once the package is preparing or invoiced.
* **Cancel an item:** choose the item, quantity and reason (for example out of stock, incorrect price). This is **irreversible**; the customer will not receive the product and Trendyol refunds the amount. Cancelling every item cancels the package.

## Returns {#iadeler}

The **Returns** tab lists the [return claims](term:claim) customers opened. Filter with **Return status**, or give a range with **Limit to a date range**. Opening a row shows the customer's reason and note, the images they sent, the returned items and the **History** record of each item.

![Returns tab](help/en/trendyol-returns.png)

* **Approve:** the item is approved and the customer is refunded. This cannot be undone; the confirmation tells you the number of items. **Approve all waiting** approves in bulk.
* **Reject:** opens the **Reject the return** form. A **Rejection reason** (one of the reasons Trendyol defines) and a **Description** of at most 500 characters are required. An **Evidence file** (photo, PDF or video, 5 MB at most) is required by Trendyol for some reasons; for reasons that do not need a file the console still always sends rejection requests with an attachment. **Send rejection request** sends the request to Trendyol for review and the item becomes **Under review**. If Trendyol accepts it, the product is not returned to you and the money stays with the customer; if it refuses, the return goes on.

> [!WARNING]
> Trendyol automatically accepts returns left untouched for 48 hours, so check claims that are **Waiting for your action** in time. A rejection request is not an approval: the decision is Trendyol's.

## Questions {#sorular}

The **Questions** tab shows customer questions on your product pages. Filter with **Question status**; questions waiting for an answer come first. A question not answered within 3 business days is closed.

![Questions tab](help/en/trendyol-questions.png)

On a question press **Answer**, fill in **Your answer** and click **Send answer**. The answer must be within a minimum and maximum length (shown under the field). You can pick a template from the **Quick reply templates** card and edit it before sending; change the templates with **Edit templates** and **Save templates**. Templates are stored in this browser only.

> [!WARNING]
> A sent answer cannot be changed and is visible to everyone on the product page. Trendyol rejects answers that contain forbidden words.

## Finance {#finans}

The **Finance** tab has three sub-tabs: **Account statement** ([settlement](term:settlement)), **Other financials** (withholding, wire transfers, payment orders and so on) and **Cargo invoice**.

![Finance tab](help/en/trendyol-finance.png)

In **Account statement** you choose a **Transaction type** (sale, return, discount, coupon, commission, seller revenue and their cancellations); each query returns one type. Sales and [commission](term:commission) records must be read in pairs. The date range is 15 days at most; **Page size** is 500 or 1000. The totals above (**Sales (credit)**, **Returns (debit)**, **Commission**, **Seller revenue**) are computed only from the loaded rows. **Cargo invoice** needs an **Invoice serial number**; if you do not know it, **Find invoices** lists the cargo invoices of the selected window.

The **Download CSV** button downloads the table as UTF-8 CSV; the file holds only the rows of the **page on screen**. For more records, move through the pages and download again.

> [!NOTE]
> Financial records are created **after the order is delivered**; a payment order is normally opened every Wednesday. Not seeing a new sale in the statement right away is normal.

## API explorer {#api-gezgini}

The **Explorer** tab contains **all 83 operations** of Trendyol's public marketplace API (documentation v2.0, Turkey; the retired legacy product APIs are not included). In the tree on the left the operations are split into groups: **Brands**, **Categories**, **Product operations**, **Price and stock updates**, **Product listing**, **Batch request results**, **Reference data**, **Shipment packages**, **Package splitting**, **Shipping**, **Addresses**, **Return claims**, **Customer questions**, **Invoices**, **Seller information**, **Labels**, **Webhooks**, **Finance**, **Cargo invoices**, **Express delivery**, **Test orders**, **Warranty** and **Product videos**. The **Search operations** box searches by name, operation id (`getShipmentPackages`), path or method; if you type several words, all of them must match.

Choosing an operation shows its name, method, full address, the link to the official documentation and the **Rate limit** on the right. There are three tabs: **Parameters** (required fields are marked, date fields have quick range buttons), **Request body** (**Load example**, **Field guide**, JSON validation; 2 MB at most) and **Request preview** (the **curl command** without keys). The response is read in the **Table**, **Tree** and **Raw** views; **Headers** and **Request** are separate tabs. Responses are truncated at 2 MB.

Every operation carries a **risk level**:

| Level | Meaning |
|---|---|
| **Read** | Does not change data; safe to try (36 operations). |
| **Write** | Changes data in Trendyol: products, stock, prices, order status (38 operations). |
| **Irreversible** | Deleting or cancelling; a record cannot be brought back (9 operations). |

## Risky operations {#riskli-islemler}

In simulation mode no request reaches Trendyol, so no confirmation is asked. In **live** mode, when you send a **Write** or **Irreversible** operation the console opens the **Confirm the live operation** window: it summarises the operation, request, risk and environment (a red **PRODUCTION** warning in the live environment). After you click **Confirm and send** (for irreversible ones **Yes, send the irreversible operation**) the request goes to the server with a `confirm` value that contains the operation id. Without that value the server refuses a live write ("confirmation required"), so even a call that bypasses the interface cannot change data by accident.

> [!DANGER]
> If you send an **Irreversible** operation in the live environment, you cannot bring back the record that was deleted or cancelled. First look at the state with **Read** operations, try on stage if you can, and only then send it live.

Every live call is also recorded in the **Audit log**: operation id, risk, environment and status are written; request and response bodies are not.

## Call history {#cagri-gecmisi}

The **History** button on the Explorer tab opens the **Recent requests** panel. It lists the requests sent in the last **30 days** (operation, method, environment, simulation/live, risk, status, duration and who sent it). Clicking one restores the operation and its parameters, which makes repeating a request easy.

The history keeps only a **summary**. Customers' **personal data (name, address, phone, email) is not stored**; API keys and secrets are never stored or shown anywhere. The owner can delete the records with **Clear history**; this does not affect the **Audit log**.

## Common errors {#sik-hatalar}

| What you see | Meaning and what to do |
|---|---|
| **Off** bar on the page | The integration is off or no keys are entered. Go to **Configure in Integrations** or **Turn on Mock mode**. |
| **503** (stage) | Your outgoing IP address is not on Trendyol's allow-list. Ask Trendyol to allow your IP. |
| **401** or **403** | The key/secret is wrong, or you are using a live key on stage (or the other way round). Stage needs separate keys. |
| **429**, "too many requests" | You exceeded 50 requests per 10 seconds per endpoint. Wait a few seconds and try again. |
| "Confirmation required" | A live write was sent without confirmation. Accept the confirmation window and try again. |
| Range too wide | Orders allow 2 weeks, products 90 days, finance 15 days. Narrow the dates. |
| Same stock/price request rejected | Trendyol rejects the same request repeated within 15 minutes. Send only the changed values and wait. |
| Product stuck in **Pending approval** | Trendyol has not approved it yet, or rejected it; read the reason in the **Batch result**. |

> [!WARNING]
> **Unverified points.** This console was built from Trendyol's published documentation but has not been tested end to end against a real seller account: field names, limits and the status dictionary may change on Trendyol's side. Run a small trial before going live and check Trendyol's current documentation. The access conditions and duration of the stage environment belong to Trendyol. The console gives no guarantee of legal compliance (privacy law, e-commerce, tax); using personal data only to fulfil orders is your responsibility. Trendyol Express or Trendyol-specific shipping behaviour is not assumed. For fees and quotas, check Trendyol's current terms as well.

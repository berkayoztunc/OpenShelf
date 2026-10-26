# Catalog: products, categories, stock

In this section you will learn how to define everything you sell in your store: adding products and variants, the product address ([slug](term:slug)) and stock code ([SKU](term:sku)), prices and channel prices, stock and stock adjustments, images, categories and discount coupons. In the examples we will set up a product called **Ceramic Vase** with the stock code **VASE-S-CREAM** (small, cream).

The catalog is managed from three screens: **Products**, **Categories** and **Coupons**. All of them are in the **Store** group of the left menu.

## Adding a product {#urun-ekleme}

![Product list](help/en/products-list.png)

The **Products** page shows all products with their status, variant count, price and stock. The **Search** box at the top searches by product name or SKU; you can narrow the list with the **Status** and **Category** filters.

### Creating a new product (step by step) {#yeni-urun-olusturma-adim-adim}

1. Click **Products** in the left menu, then **New product** at the top right.
2. On the **Details** card, enter the **Name** (example: `Ceramic Vase`). The product address (slug) is generated automatically as you type.
3. In **Description**, describe the product: material, dimensions, care information. Customers and search engines read this text.
4. On the **Variants & prices** card, define at least one variant (see below): **Title**, **SKU**, **Website price**, **Initial stock**.
5. Upload photos from the **Images** card and write a description (alt text) for each.
6. On the **Organisation** card, choose the **Status** (Draft / Active / Archived) and the **Category**.
7. On the **Search & social (SEO)** card, look at the search result preview; customise the title and description if you need to.
8. Press **Save** at the top right.

![Product edit page](help/en/product-edit.png)

The **Save** button does not become active until the name, the product address, at least one variant, and a title, SKU and website price for every variant are filled in.

### Field by field {#alan-alan-aciklama}

| Field | What to enter | Example | Watch out for |
|---|---|---|---|
| **Name** (required) | The product name customers see | Ceramic Vase | At most 300 characters. |
| **URL slug** | The short name in the product's web address | `ceramic-vase` | Lowercase letters, digits and hyphens only. For details, see the [section below](/help/catalog#urun-adresi-slug). |
| **Description** | The product pitch | Handmade, 22 cm… | A filled-in description improves how you look in search engines. |
| **Status** | **Draft**: visible only in the admin. **Active**: on sale on the storefront. **Archived**: removed from sale, records are kept | Active | A new product starts as **Draft**. Set it to **Active** when it is ready. |
| **Category** | The category the product belongs to | Vases | May be left empty ("None"). |

> [!TIP]
> Instead of deleting a product that is not ready yet, leave it as **Draft**. Instead of deleting a product you want to stop selling, set it to **Archived**: past orders and invoices are tied to that product and are preserved.

### Common mistakes (adding products) {#sik-yapilan-hatalar-urun-ekleme}

- **Forgetting to set the product to Active:** A draft product does not appear on the storefront.
- **Leaving the price empty:** A variant with no website price cannot be saved.
- **Activating without entering stock:** The product shows as "out of stock" on the storefront and cannot be sold.
- **Publishing without images:** This weakens both sales and how you look in search results.

## Product address (slug) {#urun-adresi-slug}

The **slug** is the short name that appears in a product's web address: the `ceramic-vase` part of `yourstore.com/product/ceramic-vase`. It is generated automatically as you type the product name; Turkish characters are simplified ("Çiçek Saksısı" → `cicek-saksisi`). If you like, you can edit it by hand in the address field on the **Search & social (SEO)** card.

Rules:

- Only lowercase letters (a–z), digits and hyphens (-) may be used.
- Every product's address must be unique; if you use the same address a second time you will get an "already exists" error.
- Keep it short, clear and descriptive (`ceramic-vase`, not `vase-1234`).

### If you change the slug later {#slug-i-sonradan-degistirirseniz}

When you change the address of a live product, a yellow warning appears on screen. The system automatically **permanently redirects** the old address to the new one (a [301 redirect](term:redirect301)). That way customers who shared the old link, and Google, reach the new page; they do not see "page not found". The system keeps redirect chains and loops clean.

> [!WARNING]
> Do not change slugs too often. Even with a redirect, it takes search engines time to recognise the new address, and your ranking may dip temporarily. Addresses in your ad links, QR codes and printed materials also keep pointing to the old address. You can manage redirects in the [SEO section](/help/seo#adres-yonlendirmeleri).

## Variants and stock code {#varyantlar-ve-stok-kodu}

A **product** holds the different **options** (variants) a customer buys. If you sell the Ceramic Vase in small and large sizes and in cream and blue, each combination is a separate variant. Every variant has its own stock, price and stock code. The system always tracks stock and orders **at the variant level**. For more, see the [Variant](term:variant) definition in the glossary.

Even if your product comes in a single version, you still define **one** variant (for example, title: "Standard").

| Field | What to enter | Example | Watch out for |
|---|---|---|---|
| **Title** (required) | A name that tells the variant apart | Small / Cream | Appears to customers and on order lines. |
| **SKU** (required) | A unique stock code that you assign | `VASE-S-CREAM` | Must be different for each variant. If the same SKU is used twice, the save is rejected. |
| **Barcode** | The product's barcode (EAN-13, UPC) | 8691234567890 | **Required** for the Trendyol integration. See [barcode](term:barcode). |
| **Options** | Key=Value pairs, separated by commas | `Color=Cream, Size=S` | The attributes that define the variant. |
| **Website price** (required) | The selling price on the storefront | 349.90 | Interpreted according to the tax-inclusive/exclusive choice in the **General** settings. |
| **Trendyol price** | The price on the marketplace | 379.90 | See [Channel prices](/help/catalog#kanal-fiyatlari). |
| **Initial stock** | The starting stock for a new variant | 12 | Shown only for new variants; afterwards use **Adjust stock**. |

### How do I choose a SKU? {#sku-nasil-secilir}

A [SKU](term:sku) is a product's "ID number" in your inventory. A good SKU is short, readable and never changes:

- `VASE-S-CREAM` = Vase, Small, Cream. `VASE-L-BLUE` = Vase, Large, Blue.
- Use capital letters, digits and hyphens; avoid spaces and Turkish characters.
- Avoid changing a SKU after an order has been placed. Product matching on Trendyol and your invoices rely on this code.

### Adding and removing variants {#varyant-ekleme-ve-cikarma}

- The **Add variant** button opens a new row.
- You can delete a variant that has not been saved yet with **Remove**.
- If you remove a saved variant from the product form, it is not deleted but made **inactive**, because past orders are tied to it.

### Common mistakes (variants) {#sik-yapilan-hatalar-varyantlar}

- **Using the same SKU on two variants.**
- **Writing options in the wrong format:** use the `Color=Cream, Size=S` format.
- **Trying to sell on Trendyol without a barcode:** A variant without a barcode cannot be sent to Trendyol (a "missing barcode" error is recorded).
- **Mixing up tax-inclusive and tax-exclusive:** When entering prices, know your **Settings → General → Prices include tax** choice.

## Stock and the stock ledger {#stok-ve-stok-defteri}

The system keeps three numbers for each variant:

| Concept | Meaning |
|---|---|
| **Total stock** | The number of units physically on the shelf. |
| **Reserved** | Units temporarily held for carts that have gone to payment but whose payment is not yet complete. |
| **Safety stock** | The buffer quantity you keep off sale (**Settings → Checkout**). |

**Sellable stock = total − reserved − safety stock.** Customers see this number on the storefront and can buy up to it. For example, if the total is 5, reserved is 1 and safety stock is 1, at most 3 units can be sold on the storefront.

### How does stock move? {#stok-nasil-hareket-eder}

| Event | Effect on stock |
|---|---|
| Customer goes to payment | Sellable stock drops (reserved goes up). It comes back if the time runs out. |
| Payment succeeds | The reserved units are permanently **deducted from total stock** ("sale"). |
| Time runs out / cancelled before payment | The reserved units are released. Stock does not change (it had not been deducted yet). |
| Cancelling a paid order (before shipping) | The units are **added back** to stock ("return/restore"). |
| Setting an order to **Refunded** | Stock is **not increased automatically**; if the product came back to you, you need to correct the stock by hand. |
| Order from Trendyol | Deducted from total stock ("Trendyol sale"). |
| Manual adjustment | Changes by the increase/decrease you make. |

> [!NOTE]
> You cannot cancel a shipped order; for a return you use the **Refund** flow. If you want to put the product back on sale after a refund, increase the stock by hand.

### Adjusting stock by hand (step by step) {#stogu-elle-duzeltme-adim-adim}

1. Go to **Products** and open the product.
2. On the **Variants & prices** card, click the **Adjust stock** button next to the variant's **Stock: 12 (1 reserved)** line.
3. In the window that opens, enter `10` for an increase or `-3` for a decrease in the **Change (+/-)** field.
4. Write a short explanation in the **Reason** field ("Count difference", "Broken item", "New goods received").
5. Press **Apply**.

Total stock cannot be reduced below the reserved quantity: you will get a "stock cannot go below the reserved amount" error; try again when the reserved carts have finished. The change cannot be `0` and a reason is required.

### What is the stock ledger? {#stok-defteri-nedir}

Every stock movement (sale, restore, manual adjustment, Trendyol sale) is kept in the system as an **unchangeable record**: which variant, how many units, for what reason, and when. This is called the [stock ledger](term:ledger). It exists to answer the question "why is the stock like this?" at stock-count time. Your manual adjustments also appear in the **Audit log** (who, when, why). At present the panel has no separate stock ledger screen.

On the **Dashboard**, the **Low stock** card lists variants whose sellable quantity has dropped to 5 or below. There is also a **Stock drift** card, which shows cases where the reserved quantity does not match the records; if you see such an entry, report it to your support team or developer.

### Common mistakes (stock) {#sik-yapilan-hatalar-stok}

- **Not reflecting the physical count in the system.** Do a monthly count; if there is a difference, correct it with **Adjust stock**, writing the reason.
- **Expecting negative stock, or not:** The system does not allow sales below sellable stock; overselling is prevented.
- **Forgetting to increase stock after a refund.**
- **Managing Trendyol and website stock separately:** Stock should be managed from one place (this system).

## Channel prices {#kanal-fiyatlari}

You can sell the same product at different prices on different sales channels. Each variant has a separate price for each **channel** ([channel price](term:channelprice)). There are currently two channels:

| Channel | Field | What it is for |
|---|---|---|
| Website | **Website price** (required) | The price the customer pays on the storefront |
| Trendyol | **Trendyol price** | The selling price sent to Trendyol (you can set it differently to account for commission) |

If **Trendyol price** is left empty, no Trendyol price is defined for that variant (when you clear the field, the record is deleted too). When you save the product and when you change stock, the system queues a stock/price push to Trendyol in the background (batched once a minute).

> [!WARNING]
> Trendyol prices and stock are sent only when the Trendyol integration is on and the variant has a barcode. In this version there is no "List on Trendyol" switch on the product screen; verify that the push really happened on the **Integration events** screen and in your Trendyol seller panel. For details and warnings, see the [Trendyol](/help/integrations#trendyol) section.

The shipping fee and the free shipping threshold are independent of the channel price; they are set under **Settings → Checkout**.

## Product images {#urun-gorselleri}

From the **Images** card you can add up to 30 photos to your product. The first image is the product's cover photo; it appears first on the storefront and in social sharing.

### Adding images {#gorsel-ekleme}

1. Click the **Upload** button and choose a file from your computer (PNG, JPEG, WebP, GIF or AVIF; by default at most 1.5 MB). **Or**
2. In the **Add by URL** field, type an image address starting with `https://…` and press **Add URL**.
3. Fill in the **Alt text: describe the image** field next to each image (see below).
4. Change the order with the **Up** / **Down** buttons; delete with **Remove**.
5. **Save** the product.

### Why does alt text matter? {#alt-metin-neden-onemlidir}

[Alt text](term:alttext) is a written description of an image for visitors who cannot see it (people who use screen readers) and for search engines. The border of an empty field appears yellow. Good alt text is short and concrete: "Cream-coloured ceramic vase, 22 cm tall". Do not write things like "Image1" or "vase vase vase".

### Image tips {#gorsel-ipuclari}

- Use the same aspect ratio across all products (for example, square).
- Keep the background plain and the light good; 3–5 photos showing the product from different angles are ideal.
- Shrink files before uploading. Files over 1.5 MB are rejected.
- Adding an image by URL from someone else's site means the image disappears if that site removes it; upload the file where possible.

## Categories {#kategoriler}

![Categories page](help/en/categories.png)

Categories let you group your products on the storefront (Vases, Plates, Gifts…). A category can sit under another category (a parent category).

### Creating a category {#kategori-olusturma}

1. Click **Categories** in the left menu, then **New category**.
2. Enter the **Name** (example: `Vases`); the category address (slug) is generated automatically.
3. If you like, choose a **Parent** (if you leave it as "None", it becomes a top-level category).
4. Press **Save**.

The table shows each category's name, address and parent; the **Edit** and **Delete** buttons are at the end of the row.

| Field | What to enter | Watch out for |
|---|---|---|
| **Name** | The category name | At most 200 characters. |
| **Parent** | The category it belongs to | You cannot choose a category as its own parent. |
| **URL slug** | `vases` | The product address rules apply. If you change it, the old address is redirected automatically. |

> [!WARNING]
> When you delete a category, the products in it are not deleted; they become **uncategorised** and no longer appear in that category on the storefront. Move the products to another category before deleting.

## Coupons {#kuponlar}

![Coupons page](help/en/coupons.png)

Coupons are discount codes that customers enter in the cart.

### Creating a coupon {#kupon-olusturma}

1. Click **Coupons** in the left menu, then **New coupon**.
2. Enter the **Code** (example: `WELCOME10`). It is converted to capitals automatically; letters, digits, hyphens and underscores are allowed (2–40 characters).
3. Choose the **Type**: **Percent** or **Fixed amount**.
4. Enter the value in the **Percent** or **Amount** field (example: `10` = 10%; for a fixed amount, `50` = ₺50).
5. If you like, enter **Min. subtotal**, **Max uses** and **Expires**.
6. Leave the **Active** switch on and press **Save**.

| Field | Meaning | Example |
|---|---|---|
| **Code** | The code the customer enters | `WELCOME10` |
| **Type** | Percent: a percentage of the cart subtotal. Fixed amount: a flat discount | Percent |
| **Percent / Amount** | The discount value; a percentage can be at most 100 | 10 |
| **Min. subtotal** | The minimum subtotal required for the coupon to be valid | 500 |
| **Max uses** | The total number of orders it can be used in (empty = unlimited) | 100 |
| **Expires** | Invalid after this date | 31.12.2026 |
| **Active** | If you turn it off, the coupon stops working but is not deleted | On |

### How does a coupon work? {#kupon-nasil-isler}

- The discount is taken off the **cart subtotal**; it cannot exceed the cart amount. The shipping fee is calculated on the amount after the discount (the free shipping threshold looks at the discounted amount).
- When an order is created, the coupon's "used" count goes up. If an unpaid order is cancelled or the reservation time runs out, the use is **given back**.
- **By default, the same e-mail address can use a coupon only once.** A customer who has already used that coupon on a non-cancelled order gets a "This coupon has already been used with this e-mail" warning on the second attempt. (The per-customer limit is a configurable field in the system; it is not editable in this panel at present.)
- When an invalid, expired, fully used or below-minimum coupon is entered, the customer sees a warning stating the reason.

> [!TIP]
> To test a new coupon yourself first, start with a low "Max uses" (for example 1) and a near expiry date; once you see it working, raise the limits.

### Common mistakes (coupons) {#sik-yapilan-hatalar-kuponlar}

- **Entering a percentage over 100%:** The save is rejected.
- **Mixing up fixed amount and percentage:** If you enter `50` and leave the type as **Percent**, you give a 50% discount.
- **Assuming an expired coupon is active:** A coupon past its date does not work, even if it shows as **Active** in the list.
- **Deleting a coupon:** Past orders are preserved, but the code can no longer be used. To pause it temporarily, turn **Active** off.

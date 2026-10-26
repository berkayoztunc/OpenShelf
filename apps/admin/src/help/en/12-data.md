# Data export, import and backup

In this section you will learn how to take your store data out as files (to open in Excel, hand to your accountant, or keep as a backup), how to import your products in bulk from a spreadsheet, and how to take a full database backup. It all lives on the **Data export / import** page.

![Data export / import page](help/en/data.png)

Only **admins** and the **store owner** can see this page; staff cannot. This restriction is deliberate, because every exported file may contain customers' personal data.

> [!WARNING]
> Exported files (especially orders and customers) contain personal data. Do not share them by email, in shared cloud folders or in chat apps; delete them when you are done. See [Customers and KVKK](/help/customers-kvkk).

## Export {#disa-aktarma}

The **Data export / import → Export** card has a list. Press the **CSV** or **JSON** button next to a row and the file downloads to your computer.

| What | Format | What is inside | Note |
|---|---|---|---|
| Products | CSV, JSON | One row per variant: address (slug), name, status, category, brand, VAT (KDV) rate, SKU, barcode, variant name, prices, stock, safety stock, weight | The CSV can also be used as a template for importing products back |
| Orders | CSV, JSON | Order number, source, status, email, currency, subtotal, discount, shipping, tax, total, coupon, date | The latest 10,000 orders |
| Customers | CSV, JSON | ID, email, first name, last name, phone, joined date | The latest 10,000 customers |
| Configuration | JSON only | All store settings, plus whether each integration is on or off and its non-secret settings | **Does not contain secret keys** |

A few important details:

* **Amounts are in normal currency format.** You will see `199.90` in the file (lira, not kuruş). It is normal for Excel with Turkish settings to display this number with a comma (`199,90`).
* **When opening a CSV in Excel**, to keep Turkish characters from being corrupted, open it through "Data → From Text/CSV" and choose **UTF-8** as the file origin. If you open it by double-clicking, letters like ğ, ş and ı may look garbled.
* **Formula protection:** cells that start with `=`, `+`, `-` or `@` get a quote added, so that when the file is opened in Excel the content of the cell does not run like a formula.
* The **JSON** file is more detailed than the CSV (it has nested information). You mostly need it for a developer or for transferring to another system ([JSON](term:json)).
* The orders file does not include the secret code of the customer's tracking link.
* Every export is written to the [audit log](/help/security#denetim-kaydi) ("export").

### Configuration backup and secret keys {#yapilandirma-yedegi-ve-gizli-anahtarlar}

The configuration file is a "snapshot of your settings": name, logo, SEO, notification templates, legal texts and which integrations are on. It contains **no secret keys at all** (API keys, tokens, passwords). That is a good security feature, but it has a consequence: when you restore this file to another store or from a backup, you **have to re-enter the integration keys by hand**. So also keep the keys somewhere safe (a password manager). See [Secret keys](/help/security#gizli-anahtarlar).

> [!NOTE]
> The configuration export serves as a **backup** and a **record**; there is no "import configuration" button in the panel. When you need to restore settings, you look at the file and re-enter the values on the relevant tabs.

## Import {#ice-aktarma}

The **Data export / import → Import products (CSV)** card adds or updates the products in a spreadsheet in your store in bulk. If you have hundreds of products, it is much faster than entering them one by one.

> [!TIP]
> The easiest way: first export your existing products as **Products → CSV**. This file is a ready-made template with the right column names. Add new rows or edit existing ones in Excel, save as **CSV UTF-8**, and import.

### Steps {#adimlar}

1. On the **Data export / import** page, go to the **Import products (CSV)** card.
2. Press **Choose file** and select the `.csv` file you prepared (at most **2 MB**).
3. Press **Import**.
4. When it finishes you get a summary: how many products were **created**, how many were **updated**, and a list for faulty rows (product address + error message).
5. If there are errors, fix the file and upload it again; the successful ones are updated again and new records are not duplicated.

### Columns {#sutunlar}

The first row holds the column names. Column names are not case-sensitive. **Required: `slug` and `sku`** (and `price` for every row).

| Column | What to enter | Example | Watch out |
|---|---|---|---|
| `slug` | The product's address: lowercase letters, digits, hyphens | `ceramic-vase` | **Required.** Rows with the same slug count as variants of the same product |
| `name_tr` | The product name in Turkish | `Seramik vazo` | If empty, the slug is used as the name |
| `name_en` | The product name in English | `Ceramic vase` | Optional |
| `status` | `draft`, `active` or `archived` | `active` | If empty, it becomes **draft**. New products do not go live; you stay in control |
| `category_slug` | The category's address | `home-decor` | The category must exist first; if it is not found, the product stays uncategorized without an error |
| `brand` | Brand | `Blue Workshop` | Optional |
| `tax_rate` | VAT (KDV) rate, a whole number from 0 to 100 | `20` | If left empty, no product-specific rate is set |
| `sku` | [Stock code (SKU)](term:sku), unique per variant | `VASE-S-CREAM` | **Required.** If it matches an existing SKU, that variant is updated |
| `barcode` | Barcode | `8690000000012` | Optional; usually needed on Trendyol |
| `variant_title` | The variant's name | `Small / Cream` | Can be empty for single-variant products |
| `price` | Website price, in the main currency unit | `249.90` | **Required on every row.** A period or a comma is accepted; it cannot be negative |
| `compare_at_price` | The old, crossed-out price | `299.90` | If left empty, it is **cleared** |
| `trendyol_price` | [Channel price](term:channelprice) (Trendyol) | `279.90` | If left empty, the Trendyol price is **deleted** |
| `stock` | Stock quantity | `12` | If empty, stock is **unchanged**; if filled, stock is set to this number and appears in the ledger |
| `safety_stock` | [Safety stock](term:safetystock) | `2` | Processed only when `stock` is filled |
| `weight_grams` | Weight (grams) | `850` | Optional |

Example: a product with two variants (the same `slug`, two rows):

```
slug,name_tr,status,category_slug,tax_rate,sku,variant_title,price,stock
seramik-vazo,Seramik vazo,active,ev-dekorasyon,20,VAZO-S-KREM,Küçük / Krem,249.90,12
seramik-vazo,Seramik vazo,active,ev-dekorasyon,20,VAZO-B-MAVI,Büyük / Mavi,349.90,5
```

For product-level information (name, status, category, brand, VAT), **that product's first row** is what counts.

### What happens to existing products? {#mevcut-urunlere-ne-olur}

* If the `slug` exists, the product is **updated**; if not, a new product is **created**.
* Variants with a matching SKU are updated, and new SKUs become new variants.
* An existing product's variants that are **not in the file are not deleted but deactivated** (so order history is not broken).
* An existing product's **images are kept**; images cannot be added through CSV. For new products, you add images afterwards from the product page ([Product images](/help/catalog#urun-gorselleri)).
* Products that are not in the file are **not deleted**.
* If Trendyol is connected, the import also passes the stock and price updates to the marketplace.

> [!WARNING]
> **An empty cell means "clear" in some fields.** If `compare_at_price` and `trendyol_price` are left empty, the existing value is deleted. When updating existing products, take these columns from the exported file and leave them unchanged; never leave the column empty or delete it. If `stock` is empty, though, stock is unchanged.

> [!DANGER]
> **Prices and stock change live immediately.** The import updates the price and stock of live products instantly. Before uploading a large file, always take a backup with **Products → CSV**, and try a small file of 2-3 rows first. There is no undo button.

### Common import errors {#sik-gorulen-ice-aktarma-hatalari}

| Message (summary) | Meaning | Solution |
|---|---|---|
| CSV file is required | No file was chosen | Choose the file and try again |
| File exceeds 2 MB | The file is too large | Split the file into two parts |
| CSV must contain `slug` and `sku` columns | The header row lacks these columns | Add `slug` and `sku` to the first row; make sure it is comma-separated |
| `Invalid price for sku ...` | The price is empty, not a number, or negative | Fix that row's `price` value |
| The same SKU / address is used in another record | A SKU or slug conflict | Enter a unique value |
| Validation error (specific to a row) | The slug format is wrong (spaces, uppercase, Turkish characters) | Write the slug as `lowercase-and-hyphens` |

Because each product is tried separately, one faulty product does not stop the others from being imported.

## Backup {#yedekleme}

Your store data (products, orders, customers, settings) lives in the [D1 database](term:d1) on Cloudflare. Think of two kinds of backup:

| Backup | How | What it contains | When |
|---|---|---|---|
| **Panel exports** | The **Data export / import** page | Products, orders, customers, configuration (excluding secret keys) | Weekly, or before important changes |
| **Full database backup** | Command line | The entire database | Monthly, or before a major update or product import |

Panel exports are easy, but there is no "restore" button; they are mainly useful for record keeping, reviewing in Excel, and restoring products.

### Full database backup {#tam-veritabani-yedegi}

This takes technical knowledge (or someone to help you). The following command is run in the project's `workers/api` folder:

```
npx wrangler d1 export openshelf --remote --output=backup.sql
```

This command writes the entire database to the `backup.sql` file. This is the method the project documentation recommends; verify the command's current options in Cloudflare's Wrangler documentation (to be verified: the current form of the command and flags).

> [!DANGER]
> The `backup.sql` file contains **all customers' personal data**. Store it somewhere encrypted, restrict access, and delete old copies. Do not put it on your phone, in your email, or in a publicly accessible cloud folder.

Cloudflare D1 has a "Time Travel" feature that lets you go back to a specific point in the past; however, how far back you can go varies by plan and may be changed by Cloudflare. Check the current period in the Cloudflare D1 documentation (to be verified). Do not treat this feature as your only backup.

**To build a regular backup habit:**

1. Once a week, export the **Products**, **Orders**, **Customers** and **Configuration** files.
2. Once a month (and before every major update), take a full database backup.
3. Keep backups encrypted and in a separate place, and delete old copies.
4. From time to time, check that a backup **can really be opened and read**; a backup you cannot restore is not a backup. For the test, use a separate test database, not your real store.
5. Keep your integration keys and the `APP_ENCRYPTION_KEY` value separately in a password manager; the configuration backup does not contain them.

### When you should take a backup {#yedek-alinmasi-gereken-anlar}

* Before a bulk product import
* Before updating the store (deploying a new version)
* Before changing the master encryption key ([Secret keys](/help/security#gizli-anahtarlar))
* Before irreversible actions such as anonymizing a customer (be careful, since the backup itself will carry personal data)

## Common mistakes {#sik-yapilan-hatalar}

* **Opening and saving a CSV in Excel by double-clicking.** Turkish characters get corrupted. Open it as UTF-8 and save as **CSV UTF-8**.
* **Deleting the header row or renaming a column.** `slug` and `sku` are required.
* **Writing the price in kuruş.** If you write `24990`, it becomes 24,990 TRY; write `249.90`.
* **Leaving the `trendyol_price` or `compare_at_price` column empty.** It deletes the existing values.
* **Uploading a large file without taking a backup first.**
* **Sharing the backup file somewhere public.**
* **Thinking the backup is only the panel exports.** The full database backup is separate.
* **Never testing a backup.**

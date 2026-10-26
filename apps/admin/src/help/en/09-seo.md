# SEO (search engine visibility)

In this section you will learn how customers find you in search engines such as Google, how your product and category pages will look in search results and when shared, how old links are protected when you change an address, and when to open your store up to search engines.

There is nothing magical about SEO: a search engine looks at your page, reads its title and description, and shows them in the results. OpenShelf prepares this "readable part" correctly for you; your job is to write clear titles and descriptions. Results usually take weeks, not hours.

> [!NOTE]
> The rules and ranking methods of search engines change constantly. What is described here is good practice; it does not guarantee any particular ranking.

## Where is it managed? {#nereden-yonetilir}

| What | Where |
|---|---|
| A single product's title, description, sharing image, canonical address and hide switch | The **Search & social (SEO)** card on the product edit page |
| A category's title, description, sharing image and hide switch | The category edit page |
| Home page title and description, title template, the search engine switch for the whole site, verification codes | **Settings → SEO** |

![Settings, SEO tab](help/en/settings-seo.png)

![Product edit, SEO section](help/en/product-seo.png)

On both screens the **search result preview** updates as you type. The preview shows roughly how Google will truncate the result and how the page will look when shared.

## Title and description {#baslik-ve-aciklama}

The **blue title** of a page in search results and the **grey description** below it are two separate fields. Customers mostly click based on these two lines, which makes them the most valuable text you write.

### What to write {#ne-yazilir}

| Field | What to write | Example | Watch out |
|---|---|---|---|
| SEO title | A short, natural title that describes the page | `Handmade ceramic vase, cream` | If left empty, the product name is used. Try to stay under 60 characters |
| Meta description | 1-2 sentences that persuade the customer to click | `Kiln-fired clay with a matte cream glaze. 24 cm tall, each one shaped by hand. Ships in 2-3 business days.` | If left empty, the beginning of the product description is used. 120-155 characters is ideal |
| Social image | The picture that appears when the page is shared on WhatsApp | A clean photo of the product | If empty, the product's first photo is used; if there is none, the store's default image |

### Length guide {#uzunluk-rehberi}

The counter on screen shows the length and its color:

| Field | Good | Caution | Problem |
|---|---|---|---|
| Title | up to 60 characters | 61-70 characters (the end may be cut off) | longer than 70 |
| Description | 120-155 characters | shorter (under 120) or 156-320 (the end is cut off) | longer than 320 |

The system limits titles to 70 characters and descriptions to 320, but Google usually cuts around 155 characters. Put the most important information first.

### Title template {#baslik-sablonu}

**Settings → SEO → Title template** decides how the title is completed on product, category and content pages. The default is:

```
%s | {storeName}
```

| Template variable | What it is replaced with |
|---|---|
| `%s` | The page's title (the product or category name, or the SEO title you wrote) |
| `{storeName}` | Your store name |

So a product titled "Ceramic Vase" in a store called "OpenShelf Demo" appears in search results as `Ceramic Vase | OpenShelf Demo`. If the template has no `%s`, it is not applied. Because the template makes the title longer, keep product titles short. Do not confuse the [template variable](term:templatevar) with the different curly-brace variables used in notification messages; they are separate systems.

### Home page {#ana-sayfa}

If **Home title** and **Home description** are left empty, your store name + tagline and your store description are used. A good start is a home title that states your brand and what you sell in one sentence: `OpenShelf Demo – Handmade ceramics and linen home goods`.

### Tips for a good title {#iyi-baslik-icin-ipuclari}

* Use the words the customer searches for: "Ceramic vase", "Linen pillowcase".
* Give every page a different title; do not write the same title for dozens of products.
* Do not string together lots of keywords; write a natural phrase.
* Do not include prices or promotions; they get forgotten when they change.

## Canonical and noindex {#canonical-ve-noindex}

These two settings determine how a page is counted by search engines. Most stores never need to touch them.

### Canonical URL {#kanonik-adres}

A [canonical URL](term:canonical) tells the search engine "this is the main address" when the same content is available at more than one address. By default the product page's own address is used: `https://yourstore.com/product/ceramic-vase`. Fill it in only for a special case, for example if you publish the same product at another address too and want rankings to be gathered at the main one. The address must be a full address starting with `https://`.

A product with a canonical URL set is listed in the sitemap under that address, not its own.

> [!WARNING]
> A wrong canonical URL can make your product disappear from search results. If you are not sure, leave it empty.

### Hide from search engines (noindex) {#arama-motorlarindan-gizle-noindex}

[Hide from search engines](term:noindex) keeps the page reachable by its address but stops it from appearing in search results. It suits a product that is not ready for launch, a temporary campaign page, or a duplicate page.

There are three levels:

| Level | Where | Effect |
|---|---|---|
| A single product / category | The hide switch on the product or category edit page | Only that page is not listed, and it is removed from the sitemap |
| The whole store | **Settings → SEO → Allow search engines to index this store** | When off, noindex is added to every page and the entire site is closed to crawling |
| Always | Cart, checkout and order pages, content searches (`?q=`) | Automatic; cannot be changed |

### The search engine switch for the whole store {#tum-magaza-icin-arama-motoru-anahtari}

This switch is very important. **While it is off, your store does not appear at all in Google or other search engines.** In the demo store it is off by default, because demo content should not show up in search results. You can keep it off while you prepare your store too, but **be sure to turn it on before you go live**. While the setting is off, you see a red warning on screen.

> [!DANGER]
> The most common SEO mistake: the store goes live but the search engine switch stays off. There are no sales for weeks and everyone wonders "why aren't we on Google?" Always work through the [Launch checklist](/help/going-live#yayin-kontrol-listesi) before going live.

## Structured data {#yapilandirilmis-veri}

[Structured data (JSON-LD)](term:jsonld) is an invisible block added inside the page that tells search engines, in machine language, things like "this is a product, it costs this much, it is in stock." With it, Google can show price and stock information in search results (a rich result). OpenShelf generates it for you automatically; it works while the **Settings → SEO → Structured data (JSON-LD)** switch is on.

| Page | Data types added |
|---|---|
| Home page | Organization (name, logo, social media links, contact details) and WebSite (in-store search) |
| Product page | Product (name, description, images, SKU, a valid barcode if any, brand) + Offer (price, currency, in stock / out of stock) + breadcrumb trail |
| Category and product list | Collection page, item list, breadcrumb trail |

A few details:

* If a product's variants have different prices, a "lowest - highest price" range is sent.
* The price is **the website price**; the Trendyol price is not included ([channel price](term:channelprice)).
* A product that is out of stock is marked "out of stock."
* A barcode is added only if it is a valid 8, 12, 13 or 14-digit number.
* The breadcrumb trail shows the page's place within its category (Home / Category / Product).

Turn the switch off only to troubleshoot a problem. Normally it should stay on.

> [!TIP]
> You can check whether the structured data is being read correctly by pasting the page address into Google's "Rich Results Test" tool. Google's interface may change; see Google's documentation for the current tool name.

## Address redirects {#adres-yonlendirmeleri}

When you change a product's or category's [URL slug](term:slug), the old address does not die. OpenShelf **automatically redirects** the old address to the new one (a [301 redirect](term:redirect301)).

**Example:** A product's address is `/product/old-vase` and you change it to `ceramic-vase`. Visitors and Google arriving at the old address are redirected permanently to the new one. Links you shared before, emails, and your Google ranking are preserved.

The logic of the redirect table:

| Situation | What OpenShelf does |
|---|---|
| You changed the slug once | Saves an `old → new` redirect |
| You changed the same product a second time (`new → newer`) | Also updates the old `old → new` record to `old → newer`; no chain forms |
| You went back to the old address (`newer → old`) | Deletes the `old` record to prevent a loop |
| An old-style address such as `/products/ceramic-vase` | Redirected to `/product/ceramic-vase` |

You do not manage redirects yourself; there is no separate table screen. Redirects work for **product and category** addresses.

> [!NOTE]
> If you delete a product (one that has never been sold), its address no longer exists and "Page not found" (404) is shown. A product that has been sold is not deleted but set to "Archived," so order history is not broken. For a product that is no longer on sale, archiving is recommended over deleting.

You can find the slug rules and how to choose a product address under [Product URL (slug)](/help/catalog#urun-adresi-slug).

## Sitemap and robots {#sitemap-ve-robots}

### Sitemap (sitemap.xml) {#site-haritasi-sitemap-xml}

The [sitemap](term:sitemap) is an automatic list that tells a search engine which pages you have. Its address is `https://yourstore.com/sitemap.xml`. You do nothing; OpenShelf keeps it up to date. It contains:

* The home page and the all-products page
* Categories that are live and not "hidden"
* Products whose status is **Active** and that are not "hidden"; for each product, the last update date and up to 5 images
* If there are more than 5000 addresses, the map is split into parts automatically (`sitemap-1.xml`, `sitemap-2.xml`...)

**Draft** and **Archived** products do not enter the map. If the search engine switch is off, the map comes back empty. The map is served from a cache; a change shows up in the map within about 10 minutes.

### robots.txt {#robots-txt}

[robots.txt](term:robots) tells search engine robots which places not to crawl. Its address is `https://yourstore.com/robots.txt`. It is generated automatically:

| Switch state | What robots.txt says |
|---|---|
| On | Crawl everywhere, except `/api/`, `/admin/`, `/mock/`, `/cart`, `/checkout`, `/order/` and any paths you added. The sitemap address is also listed |
| Off | Do not crawl the whole site |

With the **Extra robots.txt Disallow paths** field you can add special sections you do not want robots to crawl (up to 30 paths). A path must start with `/`, for example `/internal/`. Cart, checkout and order pages are always excluded.

> [!WARNING]
> robots.txt is not a security measure; it only asks well-behaved robots politely. Do not list anything here that needs to stay secret, because the list is public.

## Share previews (WhatsApp, Facebook, X) {#paylasim-onizlemeleri-whatsapp-facebook-x}

The card that appears when you share a product link on WhatsApp or Facebook is built from the page's title, description and [sharing image (OG image)](term:ogimage). To prepare it:

1. In the **Settings → SEO → Default social image (OG)** field, upload an image of roughly 1200 × 630 pixels and under 1 MB. It is used when a page has no image of its own.
2. If you like, enter an **X / Twitter handle** (`@yourstore`).
3. For important products, choose a custom sharing image in the product's **Search & social (SEO)** card.
4. Write meaningful [alt text](term:alttext) for product photos; it helps both accessibility and image search.

> [!WARNING]
> **Preview cards need a real domain.** On temporary addresses such as `...workers.dev`, Facebook and WhatsApp may fail to generate a card properly, or may keep an old preview in cache. Try sharing a product link using the domain you go live with ([domain](term:domain)). Meta's "Sharing Debugger" tool helps you refresh an old preview; see Meta's documentation for its current name.

## Verifying with search engine tools {#arama-motoru-araclarina-dogrulama}

[Google Search Console](https://search.google.com/search-console) and Bing Webmaster Tools show how your site appears in the search engine and what problems it has. To use them you must prove that the site is yours.

There are three codes in **Settings → SEO → Site verification**:

| Field | Where you get the code | Watch out |
|---|---|---|
| Google Search Console | Search Console → Settings → Ownership verification → HTML tag | Paste only the code inside `content="..."`, not the whole tag |
| Bing Webmaster Tools | Add site → HTML meta tag (`msvalidate.01`) | The code only |
| Facebook domain verification | Meta Business Suite → Brand safety → Domains → meta-tag method | If domain verification is required for your ad account |

Steps:

1. In Search Console, add your site's full address as a property.
2. Choose **HTML tag** as the verification method and copy the code in the `content` part.
3. In OpenShelf, paste the code into the relevant field and **save**.
4. Go back to Search Console and press **Verify**.
5. Once verified, go to the **Sitemaps** section and submit the map by entering `sitemap.xml`.

While the store is closed to search engines, verification works but pages are not listed; do not forget to turn indexing on.

## Quick SEO checklist {#seo-icin-hizli-kontrol-listesi}

1. The home page title and description are written.
2. The title template is suitable (`%s | {storeName}`).
3. SEO titles and descriptions for your 10 most important products are written by hand.
4. Alt text is added to product photos.
5. The default sharing image is uploaded.
6. Structured data is on.
7. The search engine switch is **on** (live).
8. `/sitemap.xml` and `/robots.txt` have been opened in a browser and checked.
9. Search Console is verified and the sitemap is submitted.
10. A product link with the real domain has been tried on WhatsApp.

## Common mistakes {#sik-yapilan-hatalar}

* **Leaving the search engine switch off.** The most common and most expensive mistake (see the warning above).
* **Writing the same title or description for every product.** The search engine cannot tell the pages apart.
* **Writing a very long title.** The template is added too, so the end gets cut off and the brand name is not visible.
* **Entering the canonical URL wrongly.** The product can disappear from listings.
* **Pasting the whole verification tag.** Enter only the code inside `content`.
* **Changing the slug over and over.** Redirects protect you, but do not make unnecessary changes.
* **Expecting a draft product to appear on the site.** Draft products do not appear in the storefront or the sitemap.
* **Expecting a change to show up on Google immediately.** Pages are cached briefly and search engines re-crawl at their own pace.

Related sections: [Store settings](/help/store-settings#seo-ayarlari), [Products](/help/catalog#urun-ekleme), [Analytics and advertising](/help/analytics), [Going live](/help/going-live).

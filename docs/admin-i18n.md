# Admin panel: translation and help system (rule book)

The admin (`apps/admin`) is **Turkish by default with an English switch**. Every visible string lives in a dictionary, every field can carry a "?" explanation, jargon is explained by glossary terms, and a full guide lives at `/help`. This file is the contract all contributors follow.

## 1. How translation works

* Dictionaries: `src/i18n/tr/<ns>.ts` and `src/i18n/en/<ns>.ts`, flat `key -> text`, merged by `tr/index.ts` / `en/index.ts`. Keys are typed from the **Turkish** dictionary (`MessageKey`).
* In components: `const { t, td, tp, locale } = useT();`
  * `t("orders.title")` — static, type-checked key.
  * `td(`enum.status.${s}`)` — dynamic key (returns the key text if missing).
  * `tp("common.time.minAgo", n)` — plural; define `<base>_one` and `<base>_other`; `{n}` is injected.
  * Variables: `t("common.page", { page, pages })` with `{page}` in the text.
* Outside React (formatters, API error mapping): `tNow(key, vars)`, `enumLabel(group, value)`, `statusLabel(value)`.
* Language state is module-level (`getLocale`, `setLocale`, `useLocale`); the TR|EN switch (`<LocaleSwitch/>`) re-renders everything without a reload and sets `<html lang>`.
* Dates and relative times follow the active language (`dateTime`, `dateOnly`, `timeAgo` in `lib/format.ts`). **Money is always `₺3.494,00`** (Turkish format) regardless of language.
* Fallback order: active language -> EN -> TR -> the key itself.

### Namespaces and owners (one agent per file avoids merge conflicts)

| File (`tr/` and `en/`) | Contents |
|---|---|
| `common`, `nav`, `enums`, `helpui` | shared words, menu, code-value labels, help UI (core) |
| `glossary` (+ `i18n/glossary.ts` registry) | glossary terms |
| `shell` | Layout, Login, Setup, `ui.tsx` built-in texts |
| `dashboard`, `integrations`, `errors` | Dashboard, Integrations hub/form/events, Mock inbox, API error codes, integration manifest labels |
| `orders`, `invoices`, `emails`, `print` | order, invoice, e-mail and print pages |
| `catalog` | products, categories, coupons, customers, SEO card |
| `settings`, `security` | all Settings tabs; Security, Audit, Data pages |

## 2. Keys

`area.section.item`, lowercase camelCase segments: `orders.detail.refundButton`, `settings.branding.logo.label`.
Suffix conventions: `.label`, `.hint` (one-line helper under a field), `.placeholder`, `.title`, `.description`, `.empty.title`, `.empty.body`, `.confirm.title|message|action`, `.toast.saved`.
Rich help for a field/section uses `help.<area>.<id>.title|body|example|warn|guide` (see section 4).
**English must keep the exact current English copy** where a string already exists (tests assert it); Turkish is the new text.

## 3. Voice and typography (Turkish)

* Address the reader with **"siz"**, calm and clear; no exclamation marks, no slang, no anglicisms where a good Turkish word exists ("kaydet", "vazgeç", "sil", not "save"/"cancel").
* Sentence case ("Mağaza adı"), buttons are verbs ("Fatura kes", "Taslağı kaydet"). Menu items are nouns.
* Turkish characters: İ/ı, ğ, ş, ç, ö, ü; curly apostrophes where natural; "e-Fatura", "e-Arşiv", "KDV", "TL/₺".
* Explain consequences, not mechanics: say what will happen to the customer, the stock, the money, the invoice.
* Errors say **what happened and what to do next**.
* Never show raw codes (`awaiting_payment`, `e_arsiv`, `noindex`, `order_paid`) to the user: use `enumLabel`/`statusLabel` or a glossary `<Term>`.

## 4. Help: three layers

1. **Hint** (always visible, one short line): `TextField hint=...`.
2. **"?" explanation** (`help="area.id"` prop on `TextField/TextArea/SelectField/PasswordField/Field/Toggle`): popover with *what it is · example · warning · "read in the guide" link*. Write the entry in the page's namespace:
   ```ts
   "help.catalog.slug.title": "URL adresi (slug)",
   "help.catalog.slug.body": "Ürünün web adresinde görünen kısa addır...\n\nİkinci paragraf için boş satır bırakın.",
   "help.catalog.slug.example": "`seramik-vazo` → magazaniz.com/product/seramik-vazo",
   "help.catalog.slug.warn": "Değiştirirseniz eski adres otomatik yönlendirilir.",
   "help.catalog.slug.guide": "catalog#urun-adresi-slug",   // optional "section#anchor"
   ```
   `body` is required; others optional. `` `code` `` renders monospace. Provide the same keys in EN.
3. **Page guide**: every page passes `guide="section#anchor"` to `<PageHeader>`, which adds the "How do I use this page?" button (side panel with that guide section) and a link to the full guide. Every `PageHeader` must also have a 1–2 sentence `description`.

### What needs a "?" (be generous)

Every form field whose purpose, format, example or consequence is not obvious from its label: slugs, SKU, barcode, tax rate, price-includes-tax, channel prices, safety stock, reservation minutes, free-shipping threshold, VKN/TCKN/tax office, invoice type, discount, notes, every integration key (where to find it, which environment), tracking IDs, consent switches, robots/noindex/canonical, notification channels/templates/variables, rate-limit style settings, TOTP, mock mode, and every dangerous action (issue invoice, cancel, refund, anonymize, delete, enable mock) which also needs a consequence-explaining confirmation text.

### Glossary terms

Wrap jargon in `<Term id="sku" />` (shows "Stok kodu (SKU)", hover = one-line definition, click = full definition + glossary link) or `<Term id="sku">SKU</Term>` to keep your wording. Registry: `src/i18n/glossary.ts`; texts: `glossary.<id>.term|short|long`. Unknown ids degrade to plain text (never crash). Do **not** edit the glossary files unless you own them; list missing terms in your report.

## 5. Guide content (`src/help/{tr,en}/NN-slug.md`)

`NN-slug.md` (NN = order). First `# ` line = title. GFM tables/lists. Extras: callouts `> [!NOTE]`, `> [!TIP]`, `> [!WARNING]`, `> [!DANGER]`; glossary links `[SKU](term:sku)`; screenshots `![Caption](help/tr/orders-detail.png)` (generated by `tooling/help-shots`); internal links `[x](/help/orders#iade)`. Headings (`##`, `###`) become anchors via `slugify` (Turkish letters folded: "İade nasıl yapılır?" -> `iade-nasil-yapilir`). Each section exists in both languages with the same filename. Mention UI labels exactly as they appear in the Turkish/English UI, in **bold**.

## 6. Tests and checks

* `pnpm --filter @openshelf/admin test` — dictionary completeness (same keys in TR/EN, no empty values, same `{placeholders}`, plural pairs, glossary entries complete, labels for all shared code values) and guide checks.
* `node scripts/i18n-scan.mjs` (`pnpm --filter @openshelf/admin lint:i18n`) — lists visible text not routed through the dictionaries (JSX text, `label/placeholder/title/hint/description/...` props, literals passed to toast/setError). Intentional exceptions go in `scripts/i18n-allowlist.json` as `"src/path.tsx::exact text"`.
* The test suite runs in **English** by default (`src/test/setup.ts`); a test can call `setLocale("tr")`.

## 7. Guide anchor map (contract between UI agents and guide writers)

UI code links to `section#anchor`; the guide MUST contain a `##`/`###` heading whose slug equals each anchor below (TR headings are slugified: "İade nasıl yapılır?" -> `iade-nasil-yapilir`. **English headings must pin the same anchor explicitly** with a `{#anchor}` suffix, e.g. `## Channel prices {#kanal-fiyatlari}`; the suffix is hidden in the page. `src/test/guide-anchors.test.ts` checks both languages.) Writers may add more headings; they must not drop these.

| Section file | Required anchors |
|---|---|
| `getting-started` | `ilk-kurulum`, `ilk-giris`, `iki-adimli-dogrulama`, `deneme-modu`, `ilk-10-adim` |
| `store-settings` | `genel`, `marka`, `seo-ayarlari`, `yasal-metinler`, `odeme-ve-siparis`, `takip-ve-reklam`, `bildirimler`, `sistem` |
| `catalog` | `urun-ekleme`, `urun-adresi-slug`, `varyantlar-ve-stok-kodu`, `stok-ve-stok-defteri`, `kanal-fiyatlari`, `urun-gorselleri`, `kategoriler`, `kuponlar` |
| `orders` | `siparis-durumlari`, `siparis-detayi`, `odeme-dogrulama`, `iade`, `kargo`, `siparis-bildirimleri`, `yazdirma`, `trendyol-siparisleri` |
| `invoices` | `otomatik-fatura`, `manuel-fatura`, `e-fatura-ve-e-arsiv`, `vkn-ve-tckn`, `kdv-hesabi`, `fatura-iptali`, `sik-hatalar` |
| `email` | `e-posta-yazma`, `sablonlar`, `gonderim-limitleri`, `gonderilenler` |
| `integrations` | `entegrasyonlari-test-etme`, `iyzico`, `trendyol`, `geliver`, `e-faturam`, `meta-pixel-ve-donusum-api`, `google-analytics-4`, `netgsm`, `twilio`, `cloudflare-e-posta` |
| `analytics` | `cerez-onayi`, `google-analytics-4-kurulumu`, `meta-pixel-kurulumu`, `olay-kimligi`, `test-etme` |
| `seo` | `baslik-ve-aciklama`, `canonical-ve-noindex`, `yapilandirilmis-veri`, `adres-yonlendirmeleri`, `sitemap-ve-robots` |
| `customers-kvkk` | `musteriler`, `kvkk-ve-anonimlestirme`, `onay-kayitlari` |
| `security` | `iki-adimli-dogrulama`, `kullanicilar-ve-roller`, `oturumlar`, `denetim-kaydi`, `kilitlenme`, `gizli-anahtarlar` |
| `data` | `disa-aktarma`, `ice-aktarma`, `yedekleme` |
| `going-live` | `yayin-kontrol-listesi`, `alan-adi`, `gizli-anahtarlar-ve-ortam`, `mock-u-kapatma`, `maliyetler` |
| `trendyol` | `baglanti-ve-mock`, `stage-ve-canli`, `urunler`, `urun-olusturma-sihirbazi`, `son-satislar`, `iadeler`, `sorular`, `finans`, `api-gezgini`, `riskli-islemler`, `cagri-gecmisi`, `sik-hatalar` |
| `troubleshooting` | `giris-sorunlari`, `odeme-sorunlari`, `fatura-sorunlari`, `e-posta-ve-sms-sorunlari`, `entegrasyon-hatalari`, `sss` |
| `glossary` (virtual) | `<glossary id>` e.g. `glossary#sku` |

### Page -> guide target (use these in `<PageHeader guide=...>`)

Dashboard `getting-started#ilk-10-adim` · Orders `orders#siparis-durumlari` · Order detail `orders#siparis-detayi` · Invoices list + editor `invoices#manuel-fatura` · Emails + compose `email#e-posta-yazma` · Products + edit `catalog#urun-ekleme` · Categories `catalog#kategoriler` · Coupons `catalog#kuponlar` · Customers `customers-kvkk#musteriler` · Settings tabs `store-settings#genel|marka|seo-ayarlari|yasal-metinler|odeme-ve-siparis|takip-ve-reklam|bildirimler|sistem` · Integrations `integrations#entegrasyonlari-test-etme` · Integration events `troubleshooting#entegrasyon-hatalari` · Mock inbox `getting-started#deneme-modu` · Security `security#iki-adimli-dogrulama` · Audit `security#denetim-kaydi` · Data `data#disa-aktarma` · Login/Setup `getting-started#ilk-giris` · Trendyol console `trendyol#api-gezgini` (tabs: `trendyol#urunler|son-satislar|iadeler|sorular|finans`).

### Screenshot names (guide writers reference these; the screenshot agent produces them for both languages)

`login`, `dashboard`, `products-list`, `product-edit`, `product-seo`, `categories`, `coupons`, `customers`, `orders-list`, `order-detail`, `order-print-label`, `order-print-invoice`, `invoices-list`, `invoice-editor`, `emails-compose`, `emails-sent`, `integrations-hub`, `integration-drawer`, `integration-events`, `mock-inbox`, `settings-general`, `settings-branding`, `settings-seo`, `settings-legal`, `settings-checkout`, `settings-tracking`, `settings-notifications`, `settings-system`, `security`, `audit`, `data`, `help-page`, `trendyol-products`, `trendyol-wizard`, `trendyol-orders`, `trendyol-returns`, `trendyol-questions`, `trendyol-finance`, `trendyol-explorer`. Use as `![Caption](help/tr/orders-detail.png)` with the matching name (`order-detail` -> `help/tr/order-detail.png`).

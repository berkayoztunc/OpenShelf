#!/usr/bin/env node
// Generates seed.sql (idempotent: INSERT OR REPLACE with deterministic IDs).
// `node generate.mjs`          writes seed.sql
// `node generate.mjs --check`  verifies seed.sql is up to date
// No admin user is created: the setup flow does that.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "seed.sql");
const q = (v) => (v === null || v === undefined ? "NULL" : typeof v === "number" ? String(v) : `'${String(v).replaceAll("'", "''")}'`);
const json = (o) => q(JSON.stringify(o));
// Curated Unsplash photos (free Unsplash licence), each verified to return HTTP 200 and to match the product theme.
const PHOTOS = {
  "seramik-vazo": ["1612196808214-b8e1d6145a8c", "1584589167171-541ce45f1eea"],
  "keten-yastik": ["1584100936595-c0654b55a2e2", "1567016432779-094069958ea5"],
  "mum-seti": ["1602874801007-bd458bb1b8b6", "1603006905003-be475563bc59"],
  "ahsap-raf": ["1595428774223-ef52624120d2", "1513694203232-719a280e022f"],
  "battaniye": ["1600369672770-985fd30004eb", "1615529182904-14819c35db37"],
  "kupa-seti": ["1610701596007-11502861dcfa", "1544787219-7f47ccb76574"],
  "kesme-tahtasi": ["1578749556568-bc2c40e68b61", "1603199506016-b9a594b593c0"],
  "demlik": ["1597481499750-3e6b22637e12", "1563822249548-9a72b6353cd1"],
  "keten-onluk": ["1556911220-bff31c812dba", "1556909114-f6e7ad7d3136"],
  "deri-cuzdan": ["1627123424574-724758594e93", "1590874103328-eac38a683ce7"],
  "pamuk-sal": ["1601924994987-69e26d50dc26", "1594040226829-7f251ab46d80"],
  "bez-canta": ["1544816155-12df9643f363", "1553062407-98eeb64c6a62"],
};
const img = (slug, n = 0) => `https://images.unsplash.com/photo-${PHOTOS[slug][n]}?auto=format&fit=crop&w=900&h=1125&q=80`;

const settings = {
  general: {
    storeName: "OpenShelf Demo", tagline: "Sıcak, sade, düşünülmüş ürünler", description: "OpenShelf demo mağazası. Gerçek ürün veya sipariş içermez.",
    contactEmail: "demo@example.com", currency: "TRY", pricesIncludeTax: true, defaultTaxRate: 20,
    defaultLocale: "tr", locales: ["tr", "en"], timezone: "Europe/Istanbul",
  },
  branding: {
    logoMediaId: null, logoDarkMediaId: null, faviconMediaId: null, bannerMediaIds: [],
    bannerTitle: "Evinize sıcaklık katın", bannerSubtitle: "Demo koleksiyon", bannerCtaLabel: "Alışverişe başla", bannerCtaUrl: "/products",
    primaryColor: "#3B3F8F", accentColor: "#E8A33D", social: {},
  },
  seo: {
    titleTemplate: "%s | {storeName}", homeTitle: "OpenShelf Demo – Sıcak, sade, düşünülmüş ürünler", homeDescription: "El yapımı seramik, keten ve ahşap ev ürünleri. OpenShelf demo mağazası: gerçek ürün veya sipariş içermez.",
    defaultOgMediaId: null, robotsIndex: false, twitterHandle: "", googleSiteVerification: "", bingSiteVerification: "", facebookDomainVerification: "", robotsDisallow: [], jsonLd: true,
  },
  legal: { kvkk: "", distanceSales: "", returns: "", cookies: "", privacy: "" },
  checkout: { guestCheckout: true, reservationMinutes: 15, safetyStock: 0, freeShippingThreshold: 50000, flatShippingFee: 4990 },
  tracking: { ga4MeasurementId: "", gtmContainerId: "", metaPixelId: "", metaTestEventCode: "", consentRequired: true },
};

const categories = [
  { id: "cat_home", slug: "ev-yasam", tr: "Ev & Yaşam", en: "Home & Living", pos: 1, seoTitle: "Ev & Yaşam Ürünleri – Vazo, Yastık, Mum", seoDescription: "Seramik vazo, keten yastık, soya mum ve ahşap raflar: evinize sıcaklık katan el yapımı ev ve yaşam ürünleri." },
  { id: "cat_kitchen", slug: "mutfak", tr: "Mutfak", en: "Kitchen", pos: 2, seoTitle: "Mutfak Ürünleri – Kupa, Demlik, Kesme Tahtası", seoDescription: "Stoneware kupalar, cam demlik, zeytin ağacı kesme tahtası ve keten önlük: mutfağınız için sade ve dayanıklı ürünler." },
  { id: "cat_acc", slug: "aksesuar", tr: "Aksesuar", en: "Accessories", pos: 3, seoTitle: "Aksesuar – Deri Cüzdan, Şal, Bez Çanta", seoDescription: "Bitkisel tabaklanmış deri cüzdan, pamuk şal ve organik bez çanta: günlük kullanım için doğal aksesuarlar." },
];

// price in kuruş (TRY minor units)
const products = [
  ["seramik-vazo", "cat_home", "Seramik Vazo", "Ceramic Vase", "El yapımı mat seramik vazo.", "Handmade matte ceramic vase.", "Atölye Demo", [["S", 34900, 10], ["L", 54900, 6]]],
  ["keten-yastik", "cat_home", "Keten Yastık", "Linen Cushion", "Doğal keten yastık kılıfı, dolgu dahil.", "Natural linen cushion with filling.", "Atölye Demo", [["Krem", 24900, 25], ["Hardal", 24900, 12]]],
  ["mum-seti", "cat_home", "Soya Mum Seti", "Soy Candle Set", "Üçlü soya mumu seti.", "Set of three soy candles.", "Lumen", [["Standart", 29900, 40]]],
  ["ahsap-raf", "cat_home", "Ahşap Duvar Rafı", "Wooden Wall Shelf", "Masif meşe duvar rafı.", "Solid oak wall shelf.", "Atölye Demo", [["60 cm", 69900, 8], ["90 cm", 89900, 4]]],
  ["battaniye", "cat_home", "Örme Battaniye", "Knit Blanket", "Yumuşak pamuk örme battaniye.", "Soft cotton knit blanket.", "Lumen", [["Bej", 79900, 9], ["Gri", 79900, 0]]],
  ["kupa-seti", "cat_kitchen", "Kupa Seti (2'li)", "Mug Set (2)", "Dayanıklı stoneware kupa, 2 adet.", "Durable stoneware mugs, set of 2.", "Atölye Demo", [["Standart", 27900, 30]]],
  ["kesme-tahtasi", "cat_kitchen", "Zeytin Ağacı Kesme Tahtası", "Olive Wood Cutting Board", "Doğal zeytin ağacı servis ve kesme tahtası.", "Natural olive wood board.", "Ege", [["Küçük", 32900, 14], ["Büyük", 49900, 7]]],
  ["demlik", "cat_kitchen", "Cam Demlik", "Glass Teapot", "Isıya dayanıklı borosilikat demlik.", "Heat-resistant borosilicate teapot.", "Ege", [["800 ml", 37900, 11]]],
  ["keten-onluk", "cat_kitchen", "Keten Mutfak Önlüğü", "Linen Apron", "Ayarlanabilir keten önlük.", "Adjustable linen apron.", "Lumen", [["Standart", 22900, 20]]],
  ["deri-cuzdan", "cat_acc", "Deri Cüzdan", "Leather Wallet", "Bitkisel tabaklanmış deri cüzdan.", "Vegetable-tanned leather wallet.", "Deriyat", [["Kahve", 44900, 15], ["Siyah", 44900, 13]]],
  ["pamuk-sal", "cat_acc", "Pamuk Şal", "Cotton Scarf", "Hafif pamuk şal.", "Lightweight cotton scarf.", "Lumen", [["Terracotta", 31900, 18], ["Zeytin", 31900, 18]]],
  ["bez-canta", "cat_acc", "Organik Bez Çanta", "Organic Tote Bag", "Organik pamuk bez çanta.", "Organic cotton tote bag.", "Deriyat", [["Standart", 17900, 50]]],
];

const out = [];
const ins = (table, cols, vals) => out.push(`INSERT OR REPLACE INTO ${table} (${cols.join(", ")}) VALUES (${vals.join(", ")});`);

out.push("-- OpenShelf demo seed. GENERATED by tooling/seed/generate.mjs; do not edit by hand.", "-- Safe to re-run (deterministic IDs). No admin user: the setup flow creates it.", "");
ins("stores", ["id"], [q("default")]);
for (const [group, value] of Object.entries(settings)) ins("store_settings", ["`group`", "value"], [q(group), json(value)]);
for (const c of categories) ins("categories", ["id", "slug", "name_tr", "name_en", "position", "active", "seo_title", "seo_description"], [q(c.id), q(c.slug), q(c.tr), q(c.en), c.pos, 1, q(c.seoTitle), q(c.seoDescription)]);

for (const [slug, cat, tr, en, dtr, den, brand, variants] of products) {
  const pid = `prd_${slug}`;
  ins("products", ["id", "slug", "category_id", "name_tr", "name_en", "description_tr", "description_en", "brand", "status", "seo_title", "seo_description"],
    [q(pid), q(slug), q(cat), q(tr), q(en), q(dtr), q(den), q(brand), q("active"), q(`${tr} – ${brand}`.slice(0, 70)), q(`${dtr} ${brand} imzalı ${tr.toLowerCase()}, hızlı kargo ve kolay iade ile OpenShelf Demo'da.`.slice(0, 320))]);
  for (let i = 0; i < 2; i++) ins("product_images", ["id", "product_id", "url", "alt", "position"], [q(`img_${slug}_${i}`), q(pid), q(img(slug, i)), q(tr), i]);
  variants.forEach(([title, price, stock], i) => {
    const vid = `var_${slug}_${i}`;
    ins("product_variants", ["id", "product_id", "sku", "title", "options", "weight_grams", "position", "active"],
      [q(vid), q(pid), q(`DEMO-${slug.toUpperCase()}-${i + 1}`), q(title), json({ variant: title }), 500, i, 1]);
    ins("channel_prices", ["variant_id", "channel", "price", "compare_at_price", "currency"], [q(vid), q("website"), price, q(i === 0 && price > 30000 ? Math.round(price * 1.15 / 100) * 100 : null), q("TRY")]);
    ins("channel_prices", ["variant_id", "channel", "price", "compare_at_price", "currency"], [q(vid), q("trendyol"), Math.round(price * 1.1 / 100) * 100, q(null), q("TRY")]);
    ins("inventory", ["variant_id", "total", "reserved", "safety_stock"], [q(vid), stock, 0, 0]);
    // reset the ledger entry so re-seeding does not duplicate it
    out.push(`DELETE FROM inventory_movements WHERE variant_id = ${q(vid)} AND reason = 'adjustment' AND ref_type = 'seed';`);
    if (stock > 0) ins("inventory_movements", ["variant_id", "delta", "reason", "ref_type", "ref_id"], [q(vid), stock, q("adjustment"), q("seed"), q("demo")]);
  });
}
ins("coupons", ["code", "type", "value", "min_subtotal", "max_uses", "used", "active"], [q("WELCOME10"), q("percent"), 10, 0, q(null), 0, 1]);
ins("coupons", ["code", "type", "value", "min_subtotal", "max_uses", "used", "active"], [q("SAVE50TL"), q("fixed"), 5000, 30000, 100, 0, 1]);

const sql = out.join("\n") + "\n";
if (process.argv.includes("--check")) {
  if (!existsSync(OUT) || readFileSync(OUT, "utf8") !== sql) { console.error("seed.sql is stale: run `node generate.mjs`"); process.exit(1); }
  console.log("seed.sql is up to date");
} else { writeFileSync(OUT, sql); console.log(`wrote ${OUT} (${out.length} statements)`); }

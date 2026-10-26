import { describe, expect, it } from "vitest";
import { sectionList } from "../help/content";
import { GLOSSARY_IDS } from "../i18n/glossary";
import type { Locale } from "../i18n";

/** Keep in sync with docs/admin-i18n.md §7. UI code and `guide=` props may only point at these. */
export const REQUIRED_ANCHORS: Record<string, string[]> = {
  "getting-started": ["ilk-kurulum", "ilk-giris", "iki-adimli-dogrulama", "deneme-modu", "ilk-10-adim"],
  "store-settings": ["genel", "marka", "seo-ayarlari", "yasal-metinler", "odeme-ve-siparis", "takip-ve-reklam", "bildirimler", "sistem"],
  catalog: ["urun-ekleme", "urun-adresi-slug", "varyantlar-ve-stok-kodu", "stok-ve-stok-defteri", "kanal-fiyatlari", "urun-gorselleri", "kategoriler", "kuponlar"],
  orders: ["siparis-durumlari", "siparis-detayi", "odeme-dogrulama", "iade", "kargo", "siparis-bildirimleri", "yazdirma", "trendyol-siparisleri"],
  invoices: ["otomatik-fatura", "manuel-fatura", "e-fatura-ve-e-arsiv", "vkn-ve-tckn", "kdv-hesabi", "fatura-iptali", "sik-hatalar"],
  email: ["e-posta-yazma", "sablonlar", "gonderim-limitleri", "gonderilenler"],
  integrations: ["entegrasyonlari-test-etme", "iyzico", "trendyol", "geliver", "e-faturam", "meta-pixel-ve-donusum-api", "google-analytics-4", "netgsm", "twilio", "cloudflare-e-posta"],
  analytics: ["cerez-onayi", "google-analytics-4-kurulumu", "meta-pixel-kurulumu", "olay-kimligi", "test-etme"],
  seo: ["baslik-ve-aciklama", "canonical-ve-noindex", "yapilandirilmis-veri", "adres-yonlendirmeleri", "sitemap-ve-robots"],
  "customers-kvkk": ["musteriler", "kvkk-ve-anonimlestirme", "onay-kayitlari"],
  security: ["iki-adimli-dogrulama", "kullanicilar-ve-roller", "oturumlar", "denetim-kaydi", "kilitlenme", "gizli-anahtarlar"],
  data: ["disa-aktarma", "ice-aktarma", "yedekleme"],
  "going-live": ["yayin-kontrol-listesi", "alan-adi", "gizli-anahtarlar-ve-ortam", "mock-u-kapatma", "maliyetler"],
  troubleshooting: ["giris-sorunlari", "odeme-sorunlari", "fatura-sorunlari", "e-posta-ve-sms-sorunlari", "entegrasyon-hatalari", "sss"],
};
const SCREENSHOTS = new Set(["login", "dashboard", "products-list", "product-edit", "product-seo", "categories", "coupons", "customers", "orders-list", "order-detail", "order-print-label", "order-print-invoice", "invoices-list", "invoice-editor", "emails-compose", "emails-sent", "integrations-hub", "integration-drawer", "integration-events", "mock-inbox", "settings-general", "settings-branding", "settings-seo", "settings-legal", "settings-checkout", "settings-tracking", "settings-notifications", "settings-system", "security", "audit", "data", "help-page"]);
const GLOSSARY = new Set(GLOSSARY_IDS);
const LOCALES: Locale[] = ["tr", "en"];

describe.each(LOCALES)("guide (%s)", (locale) => {
  const sections = sectionList(locale);
  const bySlug = new Map(sections.map((s) => [s.slug, s]));

  it("has every section natively (no fallback)", () => {
    expect(sections.filter((s) => s.fallback).map((s) => s.slug)).toEqual([]);
    expect([...bySlug.keys()].sort()).toEqual(Object.keys(REQUIRED_ANCHORS).sort());
  });
  it("contains every required anchor", () => {
    const missing: string[] = [];
    for (const [slug, anchors] of Object.entries(REQUIRED_ANCHORS)) {
      const ids = new Set(bySlug.get(slug)?.headings.map((h) => h.id));
      for (const a of anchors) if (!ids.has(a)) missing.push(`${slug}#${a}`);
    }
    expect(missing).toEqual([]);
  });
  it("internal links point at real sections and anchors", () => {
    const bad: string[] = [];
    for (const s of sections) for (const m of s.md.matchAll(/\]\(\/help\/([a-z0-9-]+)(?:#([a-z0-9-]+))?\)/g)) {
      const [, sec, anchor] = m;
      if (sec === "glossary") { if (anchor && !GLOSSARY.has(anchor)) bad.push(`${s.slug} -> glossary#${anchor}`); continue; }
      const target = bySlug.get(sec!);
      if (!target) { bad.push(`${s.slug} -> ${sec}`); continue; }
      if (anchor && !target.headings.some((h) => h.id === anchor)) bad.push(`${s.slug} -> ${sec}#${anchor}`);
    }
    expect(bad).toEqual([]);
  });
  it("glossary links (term:id) and screenshot names are valid", () => {
    const bad: string[] = [];
    for (const s of sections) {
      for (const m of s.md.matchAll(/\]\(term:([a-z0-9_-]+)\)/gi)) if (!GLOSSARY.has(m[1]!)) bad.push(`${s.slug}: term:${m[1]}`);
      for (const m of s.md.matchAll(/!\[[^\]]*\]\(help\/(tr|en)\/([a-z0-9-]+)\.png\)/g)) {
        if (m[1] !== locale) bad.push(`${s.slug}: wrong locale folder ${m[0]}`);
        if (!SCREENSHOTS.has(m[2]!)) bad.push(`${s.slug}: unknown screenshot ${m[2]}`);
      }
    }
    expect(bad).toEqual([]);
  });
  it("is substantial and has no leftover placeholder", () => {
    for (const s of sections) {
      expect(s.md.split(/\s+/).length, `${s.slug} too short`).toBeGreaterThan(500);
      expect(s.md, s.slug).not.toMatch(/being written|hazırlanıyor\./);
    }
  });
});

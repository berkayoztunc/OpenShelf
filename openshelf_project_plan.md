# OpenShelf — Açık Kaynak E-Ticaret Altyapısı

> **Your store. Your infrastructure. Your freedom.**  
> Open-source, self-hosted commerce for Cloudflare.

**Sürüm:** 2.0 (taslak)  
**Tarih:** 25 Ekim 2026  
**Lisans önerisi:** MIT (nihai karar öncesi bağımlılık ve marka incelemesi)  
**Odak:** Tek işletmenin kendi Cloudflare hesabına kurabildiği, geliştirici dostu, açık kaynak e-ticaret platformu.

---

## 1. Vizyon ve temel ilkeler

OpenShelf, işletmelerin kendi mağazalarını *kendi Cloudflare hesaplarında* çalıştırmasını sağlayan bir açık kaynak e-ticaret yazılımıdır. Platform lisans veya işlem başına platform komisyonu almaz. Amaç küçük işletmelere hızlı kurulum, verinin ve altyapının mülkiyeti, özelleştirilebilir tasarım ve modüler yerel entegrasyonlar sunmaktır.

**Temel vaat:** Kendi mağazan; kendi alan adın, verilerin ve servis hesapların.

**Önemli ayrım:** OpenShelf yazılımı ücretsizdir. Cloudflare Free kotası içinde kalmak kullanım miktarına bağlıdır. Alan adı, sanal POS komisyonu, kargo, e-belge, SMS/e-posta ve kimi Cloudflare özellikleri ayrıca ücretlendirilir. Hiçbir dağıtımın sonsuza kadar sıfır maliyetli olması garanti edilmez.

### Tasarım ilkeleri

1. **Single tenant:** Her işletme kendi dağıtımını ve kendi veritabanını kullanır; ortak SaaS kontrol paneli zorunlu değildir.
2. **Free-first:** Çekirdek mağaza, ücretli eklentilere zorunlu bağımlılık olmadan Cloudflare Free sınırları hedeflenerek tasarlanır.
3. **Modüler entegrasyon:** Trendyol, ödeme, kargo, e-belge ve Meta ayrı adaptörlerdir.
4. **Taşınabilirlik:** Uygulama kodu ve ticari veriler işletmeye aittir; CSV/JSON veri dışa aktarma ve konfigürasyon yedekleme sağlanır.
5. **Güvenli varsayılanlar:** Kart saklamama, gizli anahtarları sunucu tarafında tutma, imzalı webhook doğrulaması, idempotency ve consent kontrolü.
6. **Geliştirici dostu:** TypeScript, dokümante edilmiş REST API, örnek .env dosyası, CLI ve bir komutla deploy hedefi.

## 2. Hedef kullanıcılar

- Türkiye'de kendi web sitesi ve Trendyol mağazasını birlikte yöneten KOBİ.
- Teknik bilgisi sınırlı, yönlendirmeli kurulum isteyen mağaza sahibi.
- Müşterisine tek mağazalık e-ticaret sistemi kuran freelancer/ajans.
- Cloudflare üzerinde düşük bakım maliyetli e-ticaret projesi geliştirmek isteyen geliştirici.

İlk sürüm **tek mağaza/tek işletme** içindir; multi-tenant SaaS, marketplace ve çoklu depo daha sonra değerlendirilir.

## 3. Marka ve konumlandırma

- **Marka:** OpenShelf
- **Kısa tanım:** Cloudflare üzerinde kendi mağazanı kurmanı sağlayan açık kaynak e-ticaret sistemi.
- **Uluslararası açıklama:** Open-source, self-hosted e-commerce built for Cloudflare.
- **Slogan:** Your store. Your infrastructure. Your freedom.
- **Örnek repo:** `openshelf/openshelf` (müsaitlik doğrulanmalı)
- **Örnek paketler:** `@openshelf/core`, `@openshelf/trendyol`, `@openshelf/meta` (npm müsaitliği doğrulanmalı)

**Marka kontrolü:** GitHub organizasyonları, npm, alan adları ve marka tescili kullanımdan önce araştırılmalı. Cloudflare resmi ürünü izlenimi verilmemeli.

## 4. Free-first teknik mimari

| Katman | Tercih | Gerekçe |
|---|---|---|
| Storefront | Vite + React, statik üretim / SEO odaklı ön-üretim | Her istekte pahalı SSR'dan kaçınır |
| Admin | React + Tailwind | Basit ve özelleştirilebilir yönetim |
| API | Cloudflare Workers + Hono + TypeScript | Hafif edge API |
| Veritabanı | Cloudflare D1 + Drizzle | SQL, migration ve basit operasyon |
| Görseller | Başlangıçta opsiyonel R2 | R2 etkinleştirme/faturalandırma koşullarına bağımlılığı azaltır |
| Arka plan görevleri | D1-backed outbox + Cron veya isteğe bağlı Queues | Free plan uyumluluğu için takılabilir görev sürücüsü |
| Kimlik doğrulama | Güvenli cookie session + parola karması / isteğe bağlı OAuth | Bağımsız kurulum; admin MFA roadmap |
| Güvenlik | Turnstile, CSP, rate limit, sunucu tarafı doğrulama | Kritik iş akışlarının korunması |
| E-posta | Opsiyonel provider adaptörü | Çekirdek kurulum gereksiz servis hesabı istemez |

**Not:** Cloudflare Free limitleri ve bazı ürünlerin etkinleştirme koşulları zaman içinde değişebilir. Dağıtım sihirbazı mevcut kotaları ön kontrolden geçirir. Özellikle Workers CPU/istek sayısı, D1 okuma-yazma/depolama ve R2 faturalandırma gereksinimi güncel dokümantasyondan doğrulanır. Ücretsiz plan hedefi gerçek yük testiyle kanıtlanmalıdır.

### Çalışma prensibi

```text
Müşteri tarayıcısı ──> Statik Storefront ──> Workers API ──> D1
                                                │
                                             Adapters
                        ┌─────────┬──────────┬──────────┬─────────┐
                      Payment   Trendyol    Shipping   Invoicing   Meta
                        │          │           │          │        │
                     iyzico     Orders     Geliver    e-Faturam   Pixel/CAPI
```

İşletmeler her modülü kendi hesabına ait API anahtarıyla açar. Başka bir işletmenin verisiyle aynı D1 veritabanı paylaşılmaz.

## 5. Kurulum deneyimi

### Hedef akış

1. Kullanıcı GitHub reposunu fork eder veya bir kurulum şablonundan başlar.
2. Cloudflare hesabına giriş yapar ve deploy yetkisi sağlar (dokümante edilmiş güvenli OAuth/CLI akışı).
3. Kurulum CLI/script gerekli Worker, D1 binding, migration ve statik site dağıtımını gerçekleştirir.
4. Kullanıcı mağaza adı, para birimi, alan adı, ilk admin hesabı ve temel vergi/iletişim bilgilerini girer.
5. İsteğe bağlı ödeme, kargo, fatura ve Trendyol ayarlarını etkinleştirir.
6. Ürünleri CSV ile içeri aktarır veya admin panelinden oluşturur.
7. Test siparişini tamamlar; yayın kontrol listesiyle canlıya çıkar.

**Hedef komut (ürün yol haritası; mevcut çalışan CLI iddiası değildir):**

```bash
npx create-openshelf@latest
```

İlk sürümde GitHub Actions + `wrangler` tabanlı kurulum ve ayrıntılı README yeterli olabilir. Tek tıklama deploy, OAuth akışı ve otomatik domain ayarı sonraki iterasyonda.

## 6. Çekirdek mağaza fonksiyonları

- Ürün, kategori, SKU, varyant, fiyat ve stok yönetimi.
- SEO dostu ürün/kategori URL'leri, sitemap, canonical, Open Graph, JSON-LD Product/Offer.
- Sepet, misafir checkout, sipariş takibi ve temel müşteri adresleri.
- Farklı fiyat listeleri: `website` ve `trendyol` kanal fiyatları.
- Kampanya/kuponun sade MVP sürümü (gelişmiş motor sonra).
- Admin dashboard, rol bazlı erişim (ilk sürümde admin), denetim kaydı.
- Çoklu dil altyapısı (ilk içerik TR/EN); ülkeye özel vergiler modüler.
- KVKK/çerez tercihleri, mesafeli satış ve iade metni şablon alanları (hukuki danışmanlık yerine geçmez).

## 7. Entegrasyon çerçevesi

Her entegrasyon şu sözleşmeyi izler:

```ts
interface OpenShelfIntegration {
  id: string;
  validateConfig(): Promise<void>;
  healthCheck(): Promise<{ ok: boolean; detail?: string }>;
}

interface PaymentProvider extends OpenShelfIntegration {
  createCheckout(input: CheckoutInput): Promise<CheckoutSession>;
  verifyWebhook(request: Request): Promise<PaymentEvent>;
  refund?(input: RefundInput): Promise<RefundResult>;
}
```

Gerçek sözleşmeler uygulama sırasında detaylandırılır. Gizli anahtarlar istemci paketine konulmaz; Worker Secrets veya güvenli server-side store kullanılır.

### 7.1 Trendyol

- Marketplace satıcı API'siyle ürün eşleştirme, barkod/SKU, stok/fiyat, sipariş ve kargo durumları.
- Güncel Product/Order V2 endpoint'lerine odaklanma; başvuru ve satıcı hesabı gerekliliklerini dokümanla açıklama.
- Webhook + periyodik reconciliation (eksik olayları telafi etme).
- Aynı fiziksel stoğu ortak `inventory` tablosundan yönetme.
- **Trendyol Express:** Sadece Trendyol sipariş akışında desteklenen işlemler varsayılır. Dış web siparişleri için Express API erişimi *varsayılmaz*.

### 7.2 Ödeme

- İlk Türkiye adaptörü: iyzico veya PayTR (ilk MVP'de tek bir sağlayıcı seçilir).
- Sağlayıcının hosted checkout/iframe modeli tercih edilir, kart bilgileri OpenShelf sunucusundan geçmez.
- Ödeme sonrası server-to-server doğrulama, tekrar webhook'a karşı `event_id`/`provider_tx_id` tekilleştirmesi, iade durumları.
- Sanal POS canlı hesabı, ilgili sağlayıcı tarafından ayrıca onaylanır.

### 7.3 Kargo

- İlk tercih: Geliver gibi birleşik kargo API'si; alternatif olarak doğrudan kargo sağlayıcıları.
- Etiket, ücret teklifleri, takip, iptal/iade gönderisi süreçlerinin yetkilere göre desteklenmesi.
- Trendyol kanalı ile web kanalı operasyonları tek panelde gösterilir; API erişimleri birbirinden ayrılır.

### 7.4 e-Fatura / e-Arşiv

- Türkiye modülü olarak özel entegratör adaptörü; ilk aday Trendyol e-Faturam.
- **Kritik ön koşul:** Trendyol dışı web siparişlerinin ilgili e-Faturam planıyla kesilebilmesi sözleşme ve API kapsamıyla doğrulanmalıdır.
- e-Fatura/e-Arşiv alıcı durumuna göre seçilir; belge sonucu ve PDF/URL sisteme kaydedilir.
- Tek siparişe çift fatura kesilmesini önleyen idempotency ve mutabakat bulunur.

### 7.5 Meta Business reklam entegrasyonu

- Meta Pixel: `PageView`, `ViewContent`, `Search`, `AddToCart`, `InitiateCheckout`, `Purchase`.
- Conversions API: onaylı izinlere tabi sunucu tarafı dönüşüm; browser/server aynı `event_id` ile deduplikasyon.
- `Purchase` yalnızca **doğrulanmış ödemede** üretilir; ödeme ekranına geri dönüldüğünde tekrar gönderilmez.
- Ürün kataloğu/feed: `id`, `title`, `description`, `availability`, `price`, `link`, `image_link`; varyant kimliği Pixel `content_ids` ile uyumlu.
- UTM, `fbclid`/`fbc`/`fbp` gibi alanların uygun hukuki dayanak ve veri minimizasyonuyla işlenmesi.
- KVKK ve çerez tercih yönetimi: Reklam izleme onayı alınmadan gerekli olmayan Pixel/CAPI aktivitesi başlatılmaz.
- İlk sürümde Meta reklam kampanyasını admin panelinden oluşturma **yok**; reklam verme Meta Business Manager üzerinden yapılır. OpenShelf ölçüm ve katalog altyapısını sağlar.

## 8. Stok ve sipariş tutarlılığı

**Source of truth:** OpenShelf envanter defteri. Her varyantın toplam stoğu ve ayrılmış stoğu tutulur.

1. Web checkout başladığında sınırlı süreli stok rezervasyonu yapılır.
2. Ödeme doğrulanırsa rezervasyon satışa dönüşür; başarısız/expired ise çözülür.
3. Trendyol siparişi geldiğinde provider order ID ile tekilleştirilir ve merkezi stok düşülür.
4. Web ve Trendyol kanalına yeni `available_stock` yansıtılır.
5. Kuyruk/outbox başarısızsa tekrar denenir; hata admin paneline yazılır.
6. Son ürünlerin iki kanalda aynı anda satılabilme riskine karşı güvenlik stoğu opsiyonu sunulur.

**Dikkat:** Harici pazaryeri API gecikmeleri nedeniyle mutlak sıfır oversell garantisi verilemez.

## 9. D1 veri modeli (taslak)

```text
stores, store_settings, admins, admin_sessions
customers, addresses, customer_consents
categories, products, product_variants, product_images
inventory, inventory_movements, inventory_reservations
channel_listings, channel_prices, product_mappings
carts, cart_items, orders, order_items
payments, payment_events, refunds
shipments, shipment_events
invoices, invoice_events
integration_configs, integration_events, outbox_jobs, sync_cursors
marketing_events, utm_attributions
webhook_receipts, audit_logs
```

- Para birimi ve vergi dahil/hariç konfigürasyonu açık olmalı; tutarlar minor unit integer olarak saklanmalı.
- Her mağaza bağımsız dağıtım olsa da mantıksal `store_id` desteklemek migration ve taşınabilirlik için değerlendirilebilir.
- `orders(source, external_order_id)` ve webhook provider event ID üzerinde unique constraint kullanılmalı.
- Worker request sınırlarına saygılı kısa transaction/batch işlemleri yapılmalı.

## 10. Güvenlik ve uyumluluk

- PCI kapsamını azaltan hosted ödeme akışı; kart verisi saklamama.
- Secure/HttpOnly/SameSite cookies, CSRF koruması, rate limiting, CSP, XSS/input doğrulama.
- Dış sağlayıcı webhook'larında imza/secret doğrulaması ve replay önleme.
- Secret rotation, minimum yetki, audit log, yedek/export ve veri silme akışı.
- KVKK, çerez rızası, ETBİS, mesafeli sözleşme, iade/cayma koşulları işletme özelinde tamamlanır.
- Kişisel veri dış servisler/ülkelerle paylaşılıyorsa veri aktarım temeli ayrıca değerlendirilir.
- R2 görsel yüklemelerinde dosya türü, boyut ve erişim kontrolü uygulanır.
- GitHub CI içinde lint/test, dependency scan ve secret scan kullanılır.

## 11. Ücretsiz dağıtım stratejisi

**Zorunlu çekirdek:** statik mağaza + Workers API + D1.  
**Opsiyonel:** R2, Queues, e-posta, ödeme, Meta, Trendyol, kargo, e-Fatura.

Maliyet testleri en az şu senaryoları kapsamalı:

| Senaryo | Ölçülecek konular |
|---|---|
| Demo mağaza | CPU, static requests, D1 sorguları, ilk kurulum |
| 100 ürün | Listeleme, arama, görsel maliyeti, katalog build |
| 1.000 ürün | D1 okuma, katalog üretimi, sitemap, admin |
| Günlük 10 sipariş | Webhook, stok, outbox, senkronizasyon |
| Trafik patlaması | Rate limit, cache hit, CPU, D1 yazma baskısı |

**Faturalandırma koşulları:** Cloudflare ürünü bazında Free erişimi farklılık gösterebilir; özellikle R2/Queues etkinleştirme ve hesap doğrulama gereklilikleri kurulum sırasında belirtilir. Kullanıcı beklenmedik ücret doğurabilecek hizmetleri açıkça seçerek etkinleştirir.

## 12. Monorepo önerisi

```text
openshelf/
├── apps/
│   ├── storefront/           # React/Vite, SEO build
│   └── admin/                # React yönetim
├── workers/
│   └── api/                  # Hono API / webhooks / jobs
├── packages/
│   ├── core/                 # Product, inventory, order rules
│   ├── db/                   # D1 schema, migrations
│   ├── ui/                   # Shared design system
│   ├── integration-sdk/      # Adapter contracts
│   └── integrations/
│       ├── trendyol/
│       ├── iyzico/
│       ├── geliver/
│       ├── efaturam/
│       └── meta/
├── tooling/
│   ├── setup/                # Wrangler scripts
│   └── seed/                 # Demo products
├── docs/
│   ├── quickstart.md
│   ├── deploy-cloudflare.md
│   ├── architecture.md
│   └── integrations/
├── .github/workflows/
├── LICENSE
└── README.md
```

## 13. Açık kaynak topluluk planı

- GitHub repo + MIT lisansı önerisi; `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, issue/PR templates.
- Demo mağaza + canlı read-only yönetim demosu + ekran görüntüleri.
- `good first issue` ve adaptör katkı rehberi; sürümlendirme ve migration politikası.
- İki dilli dokümantasyon (Türkçe ve İngilizce).
- Kullanıcıyı ücretli merkezi servise zorlamayan yaklaşım.
- Marka ve isim uygunluğu kontrolünden sonra OpenShelf domain ve npm paketleri.

## 14. Yol haritası ve kabul kriterleri

### Faz 0 — Araştırma ve temel repo
- [ ] Cloudflare Free sınırları güncel olarak doğrulandı.
- [ ] OpenShelf isim/domain/marka çakışmaları incelendi.
- [ ] Lisans, repo yapısı, CI, katkı rehberi açıldı.

### Faz 1 — Free-first core
- [ ] Yeni kullanıcı README üzerinden bağımsız Cloudflare hesabına deploy edebiliyor.
- [ ] Ürün/kategori/varyant CRUD, D1 migration ve demo katalog çalışıyor.
- [ ] Statik SEO sayfaları ve admin oturumu mevcut.

### Faz 2 — Türkiye'de canlı satış MVP'si
- [ ] Bir ödeme sağlayıcısında uçtan uca test ödeme/sipariş akışı çalışıyor.
- [ ] Kargo/fatura adaptörlerinin failure/retry durumları yönetiliyor.
- [ ] KVKK ve sipariş yasal metin yapılandırması mevcut.

### Faz 3 — Trendyol
- [ ] Satıcı kimliğiyle ürün eşleştirme ve stok/fiyat güncelleme çalışıyor.
- [ ] Webhook + cron reconciliation, tekrar siparişi önleme testleri geçiyor.
- [ ] İki kanalda stok sapması admin'de görünür.

### Faz 4 — Meta Business
- [ ] Meta feed ürün ve varyant ID'leriyle uyumlu.
- [ ] Pixel/CAPI test event'lerinde çift sayım engelleniyor.
- [ ] Consent reddinde pazarlama event'i gönderilmiyor.

### Faz 5 — Open-source launch
- [ ] 1 demo mağaza ve 1 gerçek pilot mağaza yayında.
- [ ] Free-tier profil testleri ve bilinen sınırlar yayınlandı.
- [ ] Kurulum videosu, quickstart ve sorun giderme rehberi hazır.

## 15. MVP dışında kalanlar

- Çok kiracılı SaaS ve merkezi OpenShelf hesabı.
- OpenShelf üzerinden doğrudan reklam kampanyası oluşturma.
- Komple ERP/muhasebe sistemi.
- Çoklu depo, B2B fiyat listeleri, sadakat programı.
- Tüm dünya için vergi/kargo entegrasyonları.
- Ücretsiz Cloudflare planında sınırsız ölçeklenme iddiası.

## 16. Açık kararlar / teknik riskler

1. **R2 kullanım modeli:** Basit başlangıç için harici resim URL'si + isteğe bağlı R2 upload mı?
2. **Statik ürün üretimi:** Build zamanında üretilen sayfalar ile sık değişen fiyat/stoğun API'den hydrate edilmesi nasıl dengelenecek?
3. **Job altyapısı:** Free-plan üzerinde D1 outbox polling ile Queues adaptörünün test sonuçları.
4. **Ödeme sağlayıcısı:** İlk sürümde iyzico mu PayTR mı? Canlı başvuru ve webhook davranışı incelenmeli.
5. **e-Faturam:** Trendyol dışı satışlara ayrı sözleşmeyle gerçekten fatura kesme yetkisi teyit edilmeli.
6. **Meta/KVKK:** Kullanıcı rızası, server-side event alanları ve veri aktarımı hukuk incelemesinden geçmeli.
7. **Ücretsiz kota:** 100, 1.000 ürün ve sipariş senaryoları bench edilmeden 'tamamen ücretsiz' pazarlama iddiası kullanılmamalı.

---

**Son karar:** OpenShelf, Cloudflare üzerinde kendi hesabına kurulabilen **açık kaynak, single-tenant, free-first e-ticaret platformu** olarak geliştirilecek. Türkiye'nin Trendyol, ödeme, kargo ve fatura sağlayıcıları ilk entegrasyon setidir; Meta Pixel/CAPI ve katalog feed'i reklam büyümesi için opt-in modül olacaktır.

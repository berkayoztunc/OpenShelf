# Mimari

[English](architecture.md)

```
 Tarayıcı                         Cloudflare (TEK Worker)
 ┌──────────────┐  /  (statik dosyalar) ┌───────────────────────────────┐        ┌──────────┐
 │ Vitrin       │◄─────────────────────►│ Worker (Hono)                 │◄──────►│ D1       │
 │ (React/Vite) │  /api/store/*         │  /            vitrin          │        │ (SQLite) │
 └──────────────┘──────────────────────►│  /admin/      yönetim paneli  │        └──────────┘
 ┌──────────────┐  /admin/, /api/admin/*│  /api/*  /webhooks/*  /media  │
 │ Admin (React)│──────────────────────►│  /feeds/*  /mock/* (açıksa)   │
 └──────────────┘  çerez + CSRF         │  scheduled(): her dk cron     │──┐ outbox işleri
                                        └───────────┬───────────────────┘  ▼
                                                    │ opsiyonel   ┌────────────────────────┐
                                               ┌────▼────┐        │ Adaptörler             │
                                               │ R2      │        │ iyzico, Trendyol,      │
                                               │ (medya) │        │ Geliver, e-Faturam,    │
                                               └─────────┘        │ Meta CAPI, GA4 MP,     │
                                                                  │ Netgsm, Twilio,        │
                                                                  │ Cloudflare E-posta     │
                                                                  └────────────────────────┘
```

Tek kiracı: dağıtım başına tek mağaza, tek D1 veritabanı. **Tek Worker** her şeyi sunar (vitrin ve admin için statik dosyalar ile API); yapılandırma kökteki `wrangler.jsonc` dosyasındadır. Zorunlu: Worker + D1. Opsiyonel: R2 (medya; yoksa küçük dosyalar D1 blob olarak saklanır), Queues (gerekli değil). Ayrı bir Pages projesi ve cross-origin kurulumu yoktur.

## Bildirimler

Sipariş olayları `notify.<olay>` outbox işlerini kuyruğa alır (Netgsm veya Twilio ile SMS, Cloudflare Email Service ile e-posta). Şablonlar, kanal anahtarları, ülke izin listesi ve günlük üst sınırlar [notifications.tr.md](notifications.tr.md) dosyasında anlatılır.

## Mock Modu

Genel ve yalnızca owner'a açık bir anahtardır (`system.mockMode`; yayındaki Worker'da `ALLOW_MOCK` değişkeni gerekir). Tüm adaptörleri çevrimdışı taklitlere çevirir: `/mock/*` altında sahte ödeme sayfası, SMS/e-posta/fatura/kargo/olay kayıtları ise `mock_messages` tablosunda (Mock Inbox). Gerçek ödemelerle birlikte açılamaz. Bkz. [mock-mode.tr.md](mock-mode.tr.md).

## Ayarlar ve secret'lar

`store_settings` grup bazlı (genel, marka, seo, yasal, checkout, takip) herkese açık ayarları tutar ve Zod ile doğrulanır. `integration_configs` sağlayıcı başına public config ile AES-256-GCM şifreli secret'ları (`secrets_enc`, `secrets_iv`, `key_version`) tutar. Ana anahtar `APP_ENCRYPTION_KEY` Worker secret'ıdır. Admin API secret değerlerini asla döndürmez, yalnızca maskeli ipucu verir.

## Stok defteri

- `inventory(total, reserved, safety_stock)` güncel durumdur; `satılabilir = total - reserved - safety_stock`.
- `inventory_movements` yalnızca eklenen bir defterdir (adjustment, sale, return, trendyol_sale, reservation, release). `total` değişen her işlemin bir hareket kaydı vardır; böylece sapma denetlenip mutabakat yapılabilir.
- Rezervasyonlar (`inventory_reservations`) checkout'ta `expires_at` ile oluşturulur. Rezerve ve dönüştürme tek `db.batch()` içinde, `UPDATE ... WHERE total - reserved >= qty` ve etkilenen satır kontrolüyle yapılır; eşzamanlılıkta fazla satışı önler. Cron süresi dolan rezervasyonları serbest bırakır.

## Satın alma akışı

1. Vitrin sunucu tarafında sepet kurar; `POST /api/store/checkout` girdiyi doğrular (Zod, opsiyonel Turnstile), fiyatı D1'den alır (istemci fiyatına güvenilmez), stoğu rezerve eder, siparişi (`pending`) ve aktif PaymentProvider ile ödemeyi oluşturur (iyzico hosted checkout form; kart verisi OpenShelf'e uğramaz).
2. Müşteri sağlayıcı sayfasında öder ve callback'e döner; sağlayıcı ayrıca webhook çağırır.
3. Worker ham gövde üzerinde imzayı doğrular, sonra ödemeyi sunucudan sunucuya yeniden sorgular ve tutar/para birimi/sipariş eşleşmesini kontrol eder. Tekrarlar `webhook_receipts (provider, event_id)` ve `payments (provider, provider_tx_id)` tekilliğiyle reddedilir.
4. Doğrulanmış başarıda tek işlemde: ödeme `succeeded`, sipariş `paid`, rezervasyon `converted`, stok hareketleri yazılır.
5. Sonra outbox işleri eklenir (webhook yanıtını asla bloklamaz): `marketing.purchase`, `invoice.issue`, `shipment.create` (otomatikse), `trendyol.stock_push`.

Analitik purchase olayları yalnızca doğrulanmış ödemeden, sunucu tarafında üretilir.

## Outbox

`outbox_jobs(kind, payload, dedupe_key UNIQUE, status, attempts, next_run_at)`. Cron (dakikada bir) vadesi gelen işleri alır, kayıtlı handler'ı çalıştırır (`registerJobHandler(kind, fn)`), `done` işaretler veya üssel backoff ile `max_attempts`'e kadar yeniden dener, sonra `dead`. `dedupe_key` ekleme işlemini idempotent yapar; handler'lar da idempotent olmalıdır (örn. faturalar `(order_id, type)` tekil). Hatalar Admin'de entegrasyon olayları ve outbox ekranında, elle yeniden deneme ile görünür. Dış çağrılar yalnızca burada yapılır, istek yolunda yapılmaz.

## Olay tekilleştirme (takip)

Tarayıcı ve sunucu aynı eylem için aynı `event_id` (UUID) gönderir; Meta ve GA4 tekilleştirebilir. Sunucu gönderimleri `marketing_events` tablosunda `(event_id, name, destination)` tekil anahtarıyla kaydedilir; yeniden denemeler çift gönderime yol açmaz. Ayrıntı: [tracking.tr.md](tracking.tr.md).

## Pazaryeri senkronu

Trendyol: stok/fiyat gönderimi outbox ile; siparişler cron mutabakatıyla (ve ayarlıysa webhook ile) çekilir, `orders (source, external_order_id)` tekilliğiyle eklenir; stok düşümleri `trendyol_sale` hareketi olarak kaydedilir.

## Güvenlik sınırları

Admin: HttpOnly `__Host-` oturum çerezi, CSRF token + Origin kontrolü, opsiyonel TOTP, RBAC, denetim kaydı. Herkese açık API: oran sınırı, Zod, bilinen origin'lere CORS. Çıkış: adaptör başına sabit host izin listesi. Bkz. [security.tr.md](security.tr.md).

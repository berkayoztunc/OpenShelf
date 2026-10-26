# Bildirimler

[English](notifications.md)

OpenShelf yalnızca **işlemsel** mesajlar gönderir (sipariş güncellemeleri). Pazarlama veya toplu gönderim yoktur.

## Sağlayıcılar

| Kanal | Sağlayıcı | Rehber |
|---|---|---|
| SMS | Netgsm | [integrations/netgsm.tr.md](integrations/netgsm.tr.md) |
| SMS | Twilio | [integrations/twilio.tr.md](integrations/twilio.tr.md) |
| E-posta | Cloudflare Email Service (Beta) | [integrations/cloudflare-email.tr.md](integrations/cloudflare-email.tr.md) |

Sağlayıcıyı **Ayarlar, Entegrasyonlar** ekranından etkinleştirin. Bir kanal ancak sağlayıcısı etkinse çalışır (ya da Mock Modu açıksa; bu durumda mesajlar Mock Inbox'a düşer, bkz. [mock-mode.tr.md](mock-mode.tr.md)). Tüm sağlayıcılar uygulanmıştır ama canlı hesapla DOĞRULANMAMIŞTIR.

## Olaylar

| Olay | Alıcı |
|---|---|
| `order_paid` | müşteri |
| `order_shipped` | müşteri |
| `order_delivered` | müşteri |
| `order_cancelled` | müşteri |
| `order_refunded` | müşteri |
| `admin_new_order` | mağaza yöneticisi (ayarlardaki `adminEmail` / `adminPhone`) |

**Ayarlar, Bildirimler** ekranında her olay için SMS, e-posta veya ikisini seçin (varsayılan: e-posta açık, SMS kapalı). Mesajlar outbox işi olarak (`notify.<olay>`) kuyruğa alınır; yavaş bir sağlayıcı ödemeyi bloke etmez. Hatalar artan bekleme süresiyle yeniden denenir ve Entegrasyon olayları ekranında görünür. Sipariş bazında geçmiş: `GET /api/admin/orders/:id/notifications`.

## Ayarlar

| Alan | Anlamı |
|---|---|
| Gönderen adı / Gönderen e-posta | e-postaların göndericisi (alan adı Cloudflare Email Sending'e eklenmiş olmalı) |
| SMS gönderici kimliği | en fazla 11 karakter (Netgsm `msgheader`, Twilio alfanümerik gönderici); sağlayıcının kendi ayarını geçersiz kılar |
| Yönetici e-posta / telefon | `admin_new_order` alıcısı; telefon E.164 biçiminde (`+905301234567`) |

## Şablonlar

Dil (TR/EN) ve olay başına konu (yalnızca e-posta) ile en fazla 2000 karakterlik gövde. Boş bırakılan alanlar yerleşik varsayılana döner. İzin verilen değişkenler:

`{{orderNumber}}` `{{customerName}}` `{{total}}` `{{trackingNumber}}` `{{trackingUrl}}` `{{storeName}}` `{{orderUrl}}`

Bilinmeyen değişkenler boş görünür. Editör canlı önizleme gösterir; SMS için ayrıca kodlamayı (GSM-7 veya UCS-2) ve parça sayısını belirtir: ç, ğ, ı, ş gibi Türkçe karakterler mesajı UCS-2'ye çevirir (parça başına 160 yerine 70 karakter), bu da daha pahalıdır. Değerler e-postada HTML olarak kaçışlanır, konuda satır sonları temizlenir.

## Kötüye kullanım ve maliyet koruması

Mevcut sürümün hedeflenen davranışı:

- **Ülke izin listesi:** SMS yalnızca ülke kodu izinli numaralara gider; varsayılan `+90` (Türkiye). Diğerleri atlanır ve kaydedilir.
- SMS ve e-posta için **alıcı başına günlük üst sınır**.
- Telefon numarası geçerli E.164 olmalıdır; Türkiye yerel biçimleri (`05301234567`) otomatik dönüştürülür.
- Test gönderimleri admin başına saatte 5, IP başına saatte 10 ile sınırlıdır.
- Sağlayıcı bilgileri şifreli saklanır; hata mesajları ve loglardan temizlenir.

## Test gönderimi

**Ayarlar, Bildirimler, Test gönder**: kanalı, alıcıyı ve dili seçin. Mesaj `[TEST]` ile işaretlenir. API: `POST /api/admin/notifications/test`, gövde `{ "channel": "sms" | "email", "to": "...", "lang": "tr" | "en" }` (admin yetkisi). O türde etkin sağlayıcı yoksa `503 no_provider` döner.

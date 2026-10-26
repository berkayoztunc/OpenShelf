# Cloudflare Email Service (e-posta)

[English](cloudflare-email.md)

## Ne yapar

İşlemsel sipariş e-postalarını Cloudflare Email Sending (`api.cloudflare.com` üzerindeki REST API, izin verilen tek host) ile gönderir. Bkz. [../notifications.tr.md](../notifications.tr.md).

> **Beta ve plan sınırları.** Cloudflare Email Sending Beta aşamasındadır. Herhangi bir alıcıya göndermek için **Workers Paid** planı gerekir. **Free** planda yalnızca doğrulanmış hedef adreslere gönderebilirsiniz. Güncel doküman ve fiyatlandırmayı Cloudflare'den kontrol edin.

## Gerekli bilgiler

Admin, Ayarlar, Entegrasyonlar, Cloudflare Email Service ekranına girin (şifreli saklanır):

| Alan | Anlamı |
|---|---|
| `accountId` | 32 karakterlik Cloudflare hesap kimliğiniz |
| `apiToken` (gizli) | e-posta göndermeye yetkili API token (Email Sending: Send/Edit) |
| `fromEmail` | varsayılan gönderen adres, örn. `orders@alanadiniz.com` |

Ayarlar, Bildirimler, Gönderen e-posta alanı `fromEmail` değerini geçersiz kılar. Gönderen alan adı Email Sending'e eklenmiş ve DNS kayıtları doğrulanmış olmalıdır; aksi halde gönderen adres reddedilir.

## Sandbox ve test

Free planda kendi adresinizi doğrulanmış hedef olarak ekleyin ve Ayarlar, Bildirimler ekranından test gönderin. Hesapsız demo için Mock Modunu kullanın ([../mock-mode.tr.md](../mock-mode.tr.md)).

## Dikkat edilecekler

- Durum: satıcı dokümanlarına göre uygulandı, **canlı hesapla DOĞRULANMADI**; Beta API değişebilir.
- Konu satırından kontrol karakterleri temizlenir; HTML gövde tamamen kaçışlanır. Hem düz metin hem HTML bölümü gönderilir.
- Teslim edilebilirlik (SPF, DKIM, DMARC) alan adı kurulumunuza bağlıdır.

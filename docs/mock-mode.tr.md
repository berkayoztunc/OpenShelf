# Mock Modu

[English](mock-mode.md)

Mock Modu, tüm dış sağlayıcıları (ödeme, kargo, fatura, pazaryeri, analitik, SMS, e-posta) çevrimdışı birer taklitle değiştirir. Mağazayı tanıtmak, geliştirmek veya hiçbir sağlayıcı hesabı olmadan sipariş akışının tamamını görmek için kullanın. Mod genel geçerlidir ve yalnızca **owner** tarafından yönetilir.

## Neler değişir

| Alan | Mock Modunda |
|---|---|
| Ödeme | `/mock/pay/<token>` adresindeki sahte ödeme sayfasına yönlenir; **Başarılı**, **Başarısız** ve **İptal** düğmeleri vardır |
| SMS ve e-posta | gönderilmez; **Mock Inbox**'a kaydedilir |
| Fatura ve kargo etiketi | `/mock/doc/...` altında örnek PDF'ler sunulur, Mock Inbox'a kaydedilir |
| Analitik ve pazarlama olayları | gönderilmez, Mock Inbox'a kaydedilir |
| Entegrasyon formları | gerçekleriyle aynı alanları gösterir ama gerçek bilgi gerektirmez |

Mock Modu kapalıyken `/mock/*` adresleri `404` döner.

## Nasıl açılır

1. Yayındaki Worker'da `ALLOW_MOCK` değişkenini `true` yapın (Dashboard, Workers, Worker'ınız, Settings, Variables and Secrets; ya da `wrangler.jsonc` içindeki `vars`). Yerel geliştirmede `.dev.vars.example` içindeki örnek bunu zaten tanımlar.
2. **Owner** olarak giriş yapın ve **Ayarlar, Sistem, Mock modu** anahtarını açın (onay penceresini onaylayın). API çağrısı `PUT /api/admin/settings/system` şeklindedir.
3. Yönetim kenar çubuğunda **Mock inbox** girişi görünür.

`node tooling/setup/setup.mjs --mock` komutu, yayından sonra bu adımları ekrana yazdırır.

## Güvenlik kuralları

Bunlar API tarafından uygulanır (mevcut sürümün hedeflenen davranışı):

- **`ALLOW_MOCK` zorunludur.** Bu değişkeni olmayan, yayındaki bir Worker Mock Modunu açmayı reddeder.
- **Mock ve gerçek birbirini dışlar.** Gerçek bir ödeme sağlayıcısı etkinken veya gerçek ödenmiş siparişler varken Mock Modu açılamaz. Sahte sayfadan ödenen siparişler `payments.is_mock` ile işaretlenir.
- **Yalnızca owner** açıp kapatabilir; işlem `mock_mode.enabled` / `mock_mode.disabled` olarak denetim kaydına yazılır.
- **Sınırlı inbox:** Mock Inbox 7 gün ve en fazla 2000 satır tutar; owner temizleyebilir.
- Sahte ödeme token'ları `APP_ENCRYPTION_KEY` ile imzalanır; mock sayfasında sıkı CSP vardır ve betik çalışmaz.

Gerçek sipariş almadan önce Mock Modunu kapatın ve `ALLOW_MOCK` değişkenini kaldırın.

## Mock Inbox

Yönetim kenar çubuğunda **Mock inbox**. Kanala göre süzebilirsiniz (`sms`, `email`, `event`, `invoice`, `shipment`, `payment`). Admin'ler yalnızca okuyabilir; temizleme yalnızca owner'a açıktır (`DELETE /api/admin/mock/messages`).

## Demo turu

```bash
pnpm install
pnpm setup:local
pnpm seed          # "OpenShelf Demo" demo mağazası
pnpm dev
```

1. `http://localhost:5174/admin/setup` adresini açın ve owner hesabını oluşturun (token `workers/api/.dev.vars` içinde).
2. Ayarlar, Sistem: Mock modunu açın.
3. Ayarlar, Bildirimler: `order_paid` olayı için e-postayı (isterseniz SMS'i de) açın.
4. Vitrini açın (`http://localhost:5173`), bir ürün ekleyin ve Türkiye numarasıyla (`+90...`) ödemeye geçin.
5. Sahte ödeme sayfasında **Başarılı**'ya basın.
6. Yönetimde sipariş `paid` olur; Mock Inbox'ta ödeme, e-posta/SMS ve (yapılandırdıysanız) fatura ile kargo kayıtları görünür.

İlgili: [notifications.tr.md](notifications.tr.md), [deploy-cloudflare.tr.md](deploy-cloudflare.tr.md), [security.tr.md](security.tr.md).

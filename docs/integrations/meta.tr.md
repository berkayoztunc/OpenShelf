# Meta (Pixel + Conversions API)

[English](meta.md)

## Ne yapar

Tarayıcı Pixel olayları (pazarlama rızasından sonra) ve doğrulanmış satın almalar için sunucu tarafı Conversions API; `event_id` ile tekilleştirilir. Ayrıca `/feeds/meta.xml` ve `/feeds/meta.csv` ürün katalog feed'i.

## Gerekli anahtarlar

Pixel ID: Admin → Ayarlar → Takip (public). Conversions API erişim token'ı (Events Manager → Settings'te üretilir): Admin → Ayarlar → Entegrasyonlar → Meta (secret, şifreli). Opsiyonel Test Events kodu: Ayarlar → Takip.

## Test

Test koduyla Events Manager → Test events kullanın; bkz. [../tracking.tr.md](../tracking.tr.md). Yayından önce test kodunu kaldırın.

## Uyarılar

Sunucu olayları yalnızca sipariş rıza anlık görüntüsü pazarlamaya izin veriyorsa gönderilir. Müşteri verisi gönderilmeden önce normalize edilip SHA-256 ile özetlenir. Graph API sürümleri ve Meta gereksinimleri değişir; güncel dokümanla doğrulayın. Katalog feed'i: Commerce Manager'da zamanlanmış feed URL'si olarak ekleyin. Adaptör mock ile sınanmıştır, canlı hesapla değil.

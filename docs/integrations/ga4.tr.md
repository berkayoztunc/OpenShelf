# Google Analytics 4

[English](ga4.md)

## Ne yapar

Consent Mode v2 ile tarayıcı GA4 olayları ve doğrulanmış ödemeler için Measurement Protocol üzerinden sunucu tarafı purchase.

## Gerekli anahtarlar

Measurement ID (`G-XXXXXXX`): Admin → Ayarlar → Takip (public); opsiyonel GTM container ID. Measurement Protocol API secret (GA4 Admin → Data streams → akışınız → Measurement Protocol API secrets): Admin → Ayarlar → Entegrasyonlar → GA4 (secret, şifreli).

## Test

GA4 Admin → DebugView; bkz. [../tracking.tr.md](../tracking.tr.md).

## Uyarılar

Rıza gerekiyorsa analitik rızasından önce hiçbir şey yüklenmez. Sunucu purchase'ları için checkout'ta tarayıcının GA client id'si yakalanmalıdır; yoksa atıf sınırlı olur. GA4 işleme gecikmeleri ve eşikleri geçerlidir. Adaptör mock ile sınanmıştır, canlı hesapla değil.

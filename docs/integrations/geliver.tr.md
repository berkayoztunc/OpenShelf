# Geliver (kargo)

[English](geliver.md)

## Ne yapar

Admin sipariş sayfasından (`POST /api/admin/orders/:id/shipment`) kargo teklifi alır, gönderi ve etiket oluşturur, paketleri takip eder, gönderiyi iptal eder. Takip olayları `shipments` ve `shipment_events` tablolarını günceller.

## Gerekli anahtarlar

Geliver hesabınızdan bir API token. Admin → Ayarlar → Entegrasyonlar → Geliver'e girin (şifreli saklanır). Ayarlar → Genel'de gönderici/mağaza adresi ve telefonu da doldurun.

## Sandbox

Geliver dokümanında test ortamı veya test token'ı olup olmadığını kontrol edin; ilk gönderilerde kullanıp iptal edin. Host'lar ve erişim Geliver'a aittir.

## Uyarılar

Kullanılabilir kargo firmaları, fiyatlar ve kapıda ödeme desteği Geliver sözleşmenize bağlıdır. Paket ağırlığı/desi varyant `weight_grams` alanından gelir (gerçek ürünlerde doldurun). Etiket üretimi kargo firması tarafından ücretlendirilebilir. Adaptör mock ile sınanmıştır, canlı hesapla değil.

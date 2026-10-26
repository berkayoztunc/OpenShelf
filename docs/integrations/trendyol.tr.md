# Trendyol (pazaryeri)

[English](trendyol.md)

## Ne yapar

Stok ve fiyatı (`trendyol` kanal fiyatı) outbox ile Trendyol'a gönderir, Trendyol siparişlerini cron mutabakatıyla (ve ayarlıysa webhook ile) çeker, ürünleri SKU/barkod ile eşler, stok düşümlerini `trendyol_sale` defter hareketi olarak kaydeder.

## Gerekli anahtarlar

Trendyol satıcı panelinin entegrasyon bölümünden Satıcı (supplier) ID, API key ve API secret. Admin → Ayarlar → Entegrasyonlar → Trendyol'a girin; key/secret şifrelenir. Sonra varyantları eşleyin (Ürünler → kanal listeleri) ve Trendyol kanal fiyatını girin.

## Webhook

Trendyol webhook'larını kullanıyorsanız `<API_ORIGIN>/webhooks/trendyol` adresine yönlendirin. Cron mutabakatı bunsuz da çalışır.

## Sandbox

Trendyol bazı entegrasyonlar için talep üzerine stage/test ortamı sağlayabilir; erişim ve host'lar Trendyol'a aittir, güncel dokümanından doğrulayın. Yoksa az sayıda gerçek SKU ve düşük stokla deneyin.

## Uyarılar

Trendyol Express veya Trendyol'a özel kargo varsayılmaz ve uygulanmaz; kargo bilgisi yalnızca desteklenen API'lerle güncellenir. Oran limitleri ve kategori/özellik gereksinimleri Trendyol'a aittir. Sipariş içe aktarma, dış id'de tekil, source=`trendyol` siparişler oluşturur. Stok sapması admin panelinde görünür; sayılara güvenmeden önce mutabakat çalıştırın. Adaptör mock ile sınanmıştır, canlı hesapla değil.

## API konsolu

Yönetim paneli → **Trendyol konsolu** (yalnızca sahip/yönetici), tüm genel pazaryeri API'si (83 işlem) için uygulamalı bir konsoldur: ürünler (ürün oluşturma sihirbazıyla), son satışlar, iadeler, sorular ve finans için görev ekranları ile risk düzeyleri, canlı yazmalarda `confirm` adımı ve 30 günlük çağrı geçmişi (kişisel veri saklanmaz) olan bir API gezgini. Mock Modu bunu demo verisiyle çevrimdışı çalıştırır; test ortamı (stage) Trendyol tarafında IP izni ve ayrı anahtar ister. Adaptör gibi bu da gerçek bir satıcı hesabıyla doğrulanmamıştır. Kullanım kılavuzu: [TR](../../apps/admin/src/help/tr/15-trendyol.md) · [EN](../../apps/admin/src/help/en/15-trendyol.md) (yönetim panelindeki Yardım sayfasında da). Sözleşme: [api-contract.md](../api-contract.md).

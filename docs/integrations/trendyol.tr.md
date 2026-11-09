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

## Trendyol'dan ürün içe aktarma (doğruluk kaynağı: Trendyol)

Admin → **Trendyol konsolu → Ürünler → Eşleştirmeler → Trendyol'dan içe aktar** (veya `POST /api/admin/trendyol/import`) Trendyol'daki **onaylı** ürünleri (`filterApprovedProducts`, sayfa başına 100 içerik, sayfa başına bir outbox job'ı) sayfa sayfa çeker ve yerel kataloğa uygular:

1. **Eşleştirme**: önce mevcut Trendyol eşleştirmesi (barkod), sonra yerel `barcode`, sonra yerel `sku` = Trendyol stok kodu (veya barkod).
2. **Eşleşen**: eşleştirme ve Trendyol kanal listesi oluşturulur/güncellenir. Doğruluk kaynağı Trendyol değilse başka hiçbir şey değişmez.
3. **Eşleşmeyen**: atlanır; "Henüz olmayan ürünleri oluştur" açıksa **taslak** ürün olarak oluşturulur (kategori adla, görseller, varyantlar, stok, `trendyol` ve `website` fiyatları). Kimlikler Trendyol kimliklerinden türetilir, tekrar çalıştırmak kopya üretmez.
4. **Önizle** (dry run) yalnızca ne olacağını sayar. Son çalıştırmanın sonucu sayfada görünür (`sync_cursors[trendyol:products:last]`).

**Doğruluk kaynağı.** Ayarlar → Entegrasyonlar → Trendyol'da *Doğruluk kaynağı* = **Trendyol** seçin. Bu durumda her 15 dakikada (cron) içe aktarma ayrıca bağlı ürünlerin başlık, açıklama, marka, görsel, aktif durumu, fiyat (`trendyol` ve `website`; liste fiyatı üstü çizili fiyat olur) ve stoğunu Trendyol'dan yeniden yazar, eksik ürünleri taslak olarak oluşturur. Stok, defter üzerinden `trendyol_sync` hareketi olarak yazılır; böylece `available = total - reserved - safety_stock` Trendyol miktarına eşit olur. Bu modda OpenShelf Trendyol'a stok/fiyat **göndermez** (`trendyol.stock_push` işlem yapmaz); siparişler yine içe aktarılıp stoktan düşer, sonraki içe aktarma Trendyol'un değerini geri yazar. Dolayısıyla web sitesi satışları Trendyol'a yansımaz: bu modu yalnızca envanteri Trendyol'da yönetiyorsanız kullanın.

İçe aktarılmaz: onaysız/reddedilen ürünler, varyant seçeneklerinin ötesindeki ürün özellikleri, Trendyol kategorileri (yalnızca ada göre eşleşir). Adaptörün geri kalanı gibi bu da canlı satıcı hesabında değil, mock'larla ve dokümante edilmiş yanıt şemasıyla test edildi.

## API konsolu

Yönetim paneli → **Trendyol konsolu** (yalnızca sahip/yönetici), tüm genel pazaryeri API'si (83 işlem) için uygulamalı bir konsoldur: ürünler (ürün oluşturma sihirbazıyla), son satışlar, iadeler, sorular ve finans için görev ekranları ile risk düzeyleri, canlı yazmalarda `confirm` adımı ve 30 günlük çağrı geçmişi (kişisel veri saklanmaz) olan bir API gezgini. Mock Modu bunu demo verisiyle çevrimdışı çalıştırır; test ortamı (stage) Trendyol tarafında IP izni ve ayrı anahtar ister. Adaptör gibi bu da gerçek bir satıcı hesabıyla doğrulanmamıştır. Kullanım kılavuzu: [TR](../../apps/admin/src/help/tr/15-trendyol.md) · [EN](../../apps/admin/src/help/en/15-trendyol.md) (yönetim panelindeki Yardım sayfasında da). Sözleşme: [api-contract.md](../api-contract.md).

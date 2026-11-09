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

## Trendyol'dan ürün içe aktarma (doğruluk kaynağı hep OpenShelf)

Admin → **Trendyol konsolu → Ürünler → Eşleştirmeler → Trendyol'dan içe aktar** (veya `POST /api/admin/trendyol/import`) Trendyol'daki **onaylı** ürünleri (`filterApprovedProducts`, sayfa başına 100 içerik, sayfa başına bir outbox job'ı) sayfa sayfa çeker ve yerel kataloğa uygular:

1. **Eşleştirme**: önce mevcut Trendyol eşleştirmesi (barkod), sonra yerel `barcode`, sonra yerel `sku` = Trendyol stok kodu (veya barkod).
2. **Eşleşen**: eşleştirme ve Trendyol kanal listesi oluşturulur/güncellenir. Yerel başlık, fiyat ve stok asla ezilmez.
3. **Eşleşmeyen**: atlanır; "Henüz olmayan ürünleri oluştur" açıksa **taslak** ürün olarak oluşturulur (kategori adla, görseller, varyantlar, stok, `trendyol` ve `website` fiyatları). Kimlikler Trendyol kimliklerinden türetilir, tekrar çalıştırmak kopya üretmez.
4. **Önizle** (dry run) yalnızca ne olacağını sayar. Son çalıştırmanın sonucu sayfada görünür (`sync_cursors[trendyol:products:last]`).

**Doğruluk kaynağı her zaman OpenShelf.** Buradaki stok değişimleri (satış, admin düzenlemesi, içe aktarılan Trendyol siparişleri) `trendyol.stock_push` ile Trendyol'a gönderilir; Trendyol yerel stok, fiyat veya içeriği asla ezmez. Eski *Doğruluk kaynağı: Trendyol* seçeneği kaldırıldı (kayıtlı değerler yok sayılır). İçe aktarma tek seferlik bir işlemdir: ürünleri bağlar, *eksikleri oluştur* ile bilinmeyenleri başlangıç stoğuyla taslak ekler. Trendyol siparişleri içe aktarılıp yerel stoktan düşünce stok gönderimi kuyruğa alınır; Trendyol OpenShelf'i izler.

**Siparişler ve kargo.** Siparişler kanal bilgisi taşır (`orders.source`). Site siparişi: kargoyu Geliver, faturayı efaturam yönetir. Trendyol siparişi: kargo ve faturayı Trendyol yönetir; OpenShelf siparişi ve kargo bilgisini (firma, takip no ve linki, paket no; `provider = "trendyol"` `shipments` kaydı, Trendyol atar atamaz dolar) yansıtır ve bundan **Trendyol kargo fişi** (etiket çıktısı, 100x150 mm) basar. Elle kargo/fatura düğmeleri gizlenir, API site dışı siparişlerde `409 channel_managed` döner; kuyruktaki `shipment.create` / `invoice.issue` işleri bu siparişleri atlar.

**Kategoriler.** İçe aktarılan ürünler Trendyol kategorisini tüm üst zinciriyle alır (`ty-cat-<id>`, örn. Giyim → Erkek Giyim → Tişört); Trendyol kategori ağacından üstten alta oluşturulur. Ağaç yalnızca gereken kategori yerelde yoksa çekilir, normal senkronlarda indirilmez. Aynı adlı yerel kategori varsa kopyası oluşturulmaz, o kullanılır. Ağaç çekilemezse üst kategorisiz düz bir kategori oluşturulur.

İçe aktarılmaz: onaysız/reddedilen ürünler, varyant seçeneklerinin ötesindeki ürün özellikleri, Adaptörün geri kalanı gibi bu da canlı satıcı hesabında değil, mock'larla ve dokümante edilmiş yanıt şemasıyla test edildi.

## API konsolu

Yönetim paneli → **Trendyol konsolu** (yalnızca sahip/yönetici), tüm genel pazaryeri API'si (83 işlem) için uygulamalı bir konsoldur: ürünler (ürün oluşturma sihirbazıyla), son satışlar, iadeler, sorular ve finans için görev ekranları ile risk düzeyleri, canlı yazmalarda `confirm` adımı ve 30 günlük çağrı geçmişi (kişisel veri saklanmaz) olan bir API gezgini. Mock Modu bunu demo verisiyle çevrimdışı çalıştırır; test ortamı (stage) Trendyol tarafında IP izni ve ayrı anahtar ister. Adaptör gibi bu da gerçek bir satıcı hesabıyla doğrulanmamıştır. Kullanım kılavuzu: [TR](../../apps/admin/src/help/tr/15-trendyol.md) · [EN](../../apps/admin/src/help/en/15-trendyol.md) (yönetim panelindeki Yardım sayfasında da). Sözleşme: [api-contract.md](../api-contract.md).

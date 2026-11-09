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

## Geliver konsolu

Admin → **Geliver konsolu** (yalnızca sahip/yönetici; kargo verisi müşteri adresleri içerir) entegrasyonun gerçek siparişler ona bağlanmadan önce çalıştığını doğrulamak içindir:

- **Dene**: (1) *Bağlantı testi* gönderici adresinizi okur; geçerse token ve adres ID'si doğrudur; (2) *Fiyat teklifi* bir koli ölçüsü için kargo tekliflerini ister; (3) *Test gönderisi* demo alıcıya gönderi oluşturur, bir teklifi kabul eder (etiket + takip numarası), takibi kontrol eder ve iptal eder. Uçtan uca akış yalnızca Geliver **test modunda** (veya Mock Modunda) çalışır, gerçek etiket satın almaz.
- **Gönderiler**: Geliver'den sayfalı liste, detay ve iptal.
- **API gezgini**: 18 operasyon (gönderiler, teklif/etiket, adresler, hesap, webhook, il/ilçe); parametre formları otomatik, JSON gövde editörü ve yanıt görüntüleyici var. Canlıda yazma/yıkıcı çağrılar önce onay ister, sunucu `confirm = operationId` şartı koşar; ücretlendirilebilen çağrılar işaretlidir. Çağrılar denetim kaydına yazılır, canlı değişiklikler *Entegrasyon olayları*'nda da görünür.
- **Mock Modu** her operasyona çevrimdışı, deterministik sahte veriyle yanıt verir (aynı girdi doğrulamasıyla); Geliver hesabı olmadan ekranın tamamını deneyebilirsiniz.

Webhook, il ve ilçe yolları resmi SDK'lardan alındı, canlı hesapta doğrulanmadı; test modunda doğrulamanın en hızlı yolu konsoldur. Adaptör gibi konsol da canlı hesapta değil, mock'larla test edildi.

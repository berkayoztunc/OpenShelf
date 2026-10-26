# Hukuki notlar

[English](legal-notes.md)

**Bu notlar ve paketlenmiş şablonlar hukuki danışmanlık DEĞİLDİR.** OpenShelf; KVKK, gizlilik, çerez, mesafeli satış ve iade için düzenlenebilir metin alanları sunar (Admin → Ayarlar → Yasal). Şablonlar başlangıç noktasıdır; mevzuat, kurum rehberleri ve işletmenizin koşulları farklılık gösterir. Sipariş almadan önce metinleri yetkin bir avukata inceletin.

## Ele almanız gereken alanlar (Türkiye odaklı)

- **KVKK (6698)**: kişisel verinin toplandığı noktalarda aydınlatma metni; amaç bazlı hukuki sebep; saklama süreleri; ilgili kişi başvuru süreci; eşikleri aşıyorsanız VERBİS kaydı; Türkiye dışı servis (Cloudflare, analitik, reklam platformları) kullanımında yurt dışına aktarım kuralları. Pazarlama e-posta/SMS'i için ETK kapsamında açık rıza gerekir.
- **Çerez / rıza**: zorunlu olmayan çerez ve izleyiciler (analitik, pazarlama) için önceden rıza gerekir; banner eşit ağırlıkta kabul/ret sunmalıdır. OpenShelf Consent Mode v2 ve rıza kaydını destekler; metin sizindir ([tracking.tr.md](tracking.tr.md)).
- **Mesafeli satış**: ödeme öncesi ön bilgilendirme formu ve mesafeli satış sözleşmesinin gösterilip onaylanması (`acceptedTerms`), yasal sürede teslimat, istisnaları saklı 14 günlük cayma hakkı, cayma formu, iade süreleri.
- **Fatura**: e-Fatura/e-Arşiv yükümlülükleri mükellefiyet durumunuza bağlıdır. Bkz. [integrations/efaturam.tr.md](integrations/efaturam.tr.md).
- Uygulanabilirse **ETBİS** kaydı; ticari elektronik ileti kuralları; pazaryeri (Trendyol) sözleşmeleri.
- **Tüketici hakları**: fiyat gösterimi (KDV dahil), iade, garanti, şikayet kanalları.
- Diğer ülkelerin (GDPR, Birleşik Krallık, ABD eyaletleri) kendi kuralları vardır.

## OpenShelf'in sağladıkları

Düzenlenebilir yasal metin alanları, politika sürümlü rıza kaydı (`customer_consents`), sipariş anı rıza anlık görüntüsü, müşteri anonimleştirme uç noktası, denetim kayıtları, veri dışa aktarma. İçerikten ve uyumdan işletmeci sorumludur.

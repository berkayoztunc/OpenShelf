# e-Faturam (e-Fatura / e-Arşiv)

[English](efaturam.md)

## Ne yapar

Siparişler için e-Fatura veya e-Arşiv faturası keser (`invoice.issue` outbox işiyle otomatik veya sipariş sayfasından), numara ve PDF/URL'yi saklar. `(order_id, type)` bazında idempotent'tir; yeniden denemeler mükerrer fatura üretmez.

## Gerekli anahtarlar

e-Faturam hesabınız/sözleşmeniz size hangi kimlik bilgilerini veriyorsa onlar (Admin → Ayarlar → Entegrasyonlar → e-Faturam'daki alanlar; secret alanlar şifrelenir). Ayarlar → Genel'de satıcı vergi no ve yasal adresi girin. "Bağlantıyı test et"i kullanın.

## Sandbox

e-Faturam test/sandbox hesabı sağlıyorsa kullanın; test faturaları gerçek belge olarak vergi idaresine gönderilmemelidir. Sağlayıcıyla doğrulayın.

## Uyarılar

**Kapsam sözleşmeyle doğrulanmalıdır.** e-Faturam'ın Trendyol dışı kanallardan (web siteniz, diğer pazaryerleri) gelen siparişlerin faturalandırmasını veya her mükellef türünü kapsadığını varsaymayın. Otomatik faturalamayı açmadan önce sözleşmenizin hangi sipariş kaynaklarına, belge türlerine ve müşteri türlerine izin verdiğini e-Faturam'dan yazılı teyit edin. Trendyol siparişleri Trendyol'un kendi akışlarıyla zaten faturalanıyor olabilir; mükerrer faturadan kaçının. Fatura yükümlülükleri vergi durumunuza bağlıdır: mali müşavirinize danışın. Adaptör mock ile sınanmıştır, canlı hesapla değil.
